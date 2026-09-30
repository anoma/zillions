// Copyright 2026 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! A note as spending needs it, carried from decryption to the send planner
//! as one hex string that only wasm reads. Viewing-key material only: it lets
//! a spend be built, never authorised.
//!
//! Orchard and Ironwood: `recipient (43) ‖ value (8, LE) ‖ rho (32) ‖ rseed (32)`.
//! Sapling: `recipient (43) ‖ value (8, LE) ‖ kind (1) ‖ rseed (32)`, where
//! kind 1 is a ZIP-212 seed and 0 a pre-ZIP-212 `rcm`.

use ff::PrimeField;
use orchard::note::{NoteVersion, RandomSeed, Rho};
use sapling::Rseed;

fn split<const N: usize>(bytes: &mut &[u8]) -> Result<[u8; N], String> {
    let (head, rest) = bytes.split_at_checked(N).ok_or("note too short")?;
    *bytes = rest;
    Ok(head.try_into().expect("split at N"))
}

pub(crate) fn encode_orchard(note: &orchard::Note) -> String {
    let mut out = Vec::with_capacity(115);
    out.extend(note.recipient().to_raw_address_bytes());
    out.extend(note.value().inner().to_le_bytes());
    out.extend(note.rho().to_bytes());
    out.extend(note.rseed().as_bytes());
    hex::encode(out)
}

/// An Orchard (`V2`) or Ironwood (`V3`) note, by `version`.
pub(crate) fn decode_orchard(hex: &str, version: NoteVersion) -> Result<orchard::Note, String> {
    let bytes = hex::decode(hex).map_err(|e| e.to_string())?;
    let mut rest = &bytes[..];
    let recipient = Option::from(orchard::Address::from_raw_address_bytes(&split(&mut rest)?))
        .ok_or("bad orchard recipient")?;
    let value = orchard::value::NoteValue::from_raw(u64::from_le_bytes(split(&mut rest)?));
    let rho = Option::<Rho>::from(Rho::from_bytes(&split(&mut rest)?)).ok_or("bad rho")?;
    let rseed = Option::from(RandomSeed::from_bytes(split(&mut rest)?, &rho)).ok_or("bad rseed")?;
    Option::from(orchard::Note::from_parts(recipient, value, rho, rseed, version)).ok_or_else(|| "bad orchard note".into())
}

pub(crate) fn encode_sapling(note: &sapling::Note) -> String {
    let mut out = Vec::with_capacity(84);
    out.extend(note.recipient().to_bytes());
    out.extend(note.value().inner().to_le_bytes());
    match note.rseed() {
        Rseed::BeforeZip212(rcm) => {
            out.push(0);
            out.extend(rcm.to_repr());
        }
        Rseed::AfterZip212(seed) => {
            out.push(1);
            out.extend(seed);
        }
    }
    hex::encode(out)
}

pub(crate) fn decode_sapling(hex: &str) -> Result<sapling::Note, String> {
    let bytes = hex::decode(hex).map_err(|e| e.to_string())?;
    let mut rest = &bytes[..];
    let recipient = sapling::PaymentAddress::from_bytes(&split(&mut rest)?).ok_or("bad sapling recipient")?;
    let value = sapling::value::NoteValue::from_raw(u64::from_le_bytes(split(&mut rest)?));
    let [kind] = split::<1>(&mut rest)?;
    let seed = split::<32>(&mut rest)?;
    let rseed = match kind {
        0 => Rseed::BeforeZip212(Option::from(jubjub::Fr::from_repr(seed)).ok_or("bad rcm")?),
        1 => Rseed::AfterZip212(seed),
        _ => return Err("bad sapling rseed kind".into()),
    };
    Ok(sapling::Note::from_parts(recipient, value, rseed))
}

/// Each note's index among its transaction's outputs in this pool, from
/// `(position, height, tx_index)` sorted by position: a transaction's outputs
/// sit next to each other in the tree.
///
/// ponytail: a transaction whose outputs start in an earlier chunk that wasn't
/// fetched counts from this chunk's first note. The index only names the note;
/// spending never reads it.
pub(crate) fn output_indices(notes: &[(u64, u32, u16)]) -> Vec<u16> {
    let mut out: Vec<u16> = Vec::with_capacity(notes.len());
    for (i, &(position, height, tx_index)) in notes.iter().enumerate() {
        let follows = i > 0 && {
            let (prev_position, prev_height, prev_tx) = notes[i - 1];
            prev_position + 1 == position && prev_height == height && prev_tx == tx_index
        };
        out.push(if follows { out[i - 1] + 1 } else { 0 });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_outputs_within_each_transaction() {
        // Tx (10, 0) has three outputs; (10, 1) two; a gap restarts the count.
        let notes = [(5, 10, 0), (6, 10, 0), (7, 10, 0), (8, 10, 1), (9, 10, 1), (20, 11, 0)];
        assert_eq!(output_indices(&notes), [0, 1, 2, 0, 1, 0]);
    }

    #[test]
    fn sapling_notes_round_trip_both_seed_kinds() {
        let (_, recipient) = sapling::zip32::ExtendedSpendingKey::master(&[7u8; 32]).default_address();
        let value = sapling::value::NoteValue::from_raw(42);
        for rseed in [Rseed::AfterZip212([9u8; 32]), Rseed::BeforeZip212(jubjub::Fr::from(12345u64))] {
            let note = sapling::Note::from_parts(recipient, value, rseed);
            let back = decode_sapling(&encode_sapling(&note)).expect("decodes");
            assert_eq!(back.cmu(), note.cmu());
        }
    }
}
