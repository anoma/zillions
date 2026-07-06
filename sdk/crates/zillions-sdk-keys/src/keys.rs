// Copyright 2024 ChainSafe Systems
// SPDX-License-Identifier: Apache-2.0, MIT

use std::str::FromStr;
use wasm_bindgen::prelude::*;

use crate::error::Error;
use bip0039::{Count, English, Mnemonic};
use zillions_sdk_common::Network;
use zip32::AccountId;

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::new(), |mut acc, b| {
        let _ = write!(acc, "{:02x}", b);
        acc
    })
}

/// A ZIP32 seed fingerprint. Essentially a Blake2b hash of the seed.
///
/// This is a wrapper around the `zip32::fingerprint::SeedFingerprint` type.
///
#[wasm_bindgen]
pub struct SeedFingerprint {
    inner: zip32::fingerprint::SeedFingerprint,
}
#[wasm_bindgen]
impl SeedFingerprint {
    /// Construct a new SeedFingerprint
    ///
    /// # Arguments
    ///
    /// * `seed` - At least 32 bytes of entry. Care should be taken as to how this is derived
    ///
    #[wasm_bindgen(constructor)]
    pub fn new(seed: Box<[u8]>) -> Result<SeedFingerprint, Error> {
        Ok(Self {
            inner: zip32::fingerprint::SeedFingerprint::from_seed(&seed)
                .ok_or(Error::SeedFingerprint)?,
        })
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        self.inner.to_bytes().to_vec()
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<SeedFingerprint, Error> {
        let bytes: [u8; 32] = bytes.try_into().map_err(|_| Error::SeedFingerprint)?;
        Ok(Self {
            inner: zip32::fingerprint::SeedFingerprint::from_bytes(bytes),
        })
    }
}

impl From<SeedFingerprint> for zip32::fingerprint::SeedFingerprint {
    fn from(value: SeedFingerprint) -> Self {
        value.inner
    }
}

impl From<zip32::fingerprint::SeedFingerprint> for SeedFingerprint {
    fn from(value: zip32::fingerprint::SeedFingerprint) -> Self {
        Self { inner: value }
    }
}
/// A Zcash Sapling proof generation key
///
/// This is a wrapper around the `sapling::ProofGenerationKey` type. It is used for generating proofs for Sapling PCZTs.
#[wasm_bindgen]
pub struct ProofGenerationKey {
    inner: sapling::ProofGenerationKey,
}

impl From<ProofGenerationKey> for sapling::ProofGenerationKey {
    fn from(value: ProofGenerationKey) -> sapling::ProofGenerationKey {
        value.inner
    }
}

impl From<sapling::ProofGenerationKey> for ProofGenerationKey {
    fn from(value: sapling::ProofGenerationKey) -> Self {
        Self { inner: value }
    }
}

/// A Zcash spending key
///
/// This is a wrapper around the `zcash_keys::keys::SpendingKey` type. It can be created from at least 32 bytes of seed entropy
#[wasm_bindgen]
pub struct UnifiedSpendingKey {
    inner: zcash_keys::keys::UnifiedSpendingKey,
}

#[wasm_bindgen]
impl UnifiedSpendingKey {
    /// Construct a new UnifiedSpendingKey
    ///
    /// # Arguments
    ///
    /// * `network` - Must be either "main" or "test"
    /// * `seed` - At least 32 bytes of entry. Care should be taken as to how this is derived
    /// * `hd_index` - [ZIP32](https://zips.z.cash/zip-0032) hierarchical deterministic index of the account
    ///
    #[wasm_bindgen(constructor)]
    pub fn new(network: &str, seed: Box<[u8]>, hd_index: u32) -> Result<UnifiedSpendingKey, Error> {
        let network = Network::from_str(network)?;
        Ok(Self {
            inner: zcash_keys::keys::UnifiedSpendingKey::from_seed(
                &network,
                &seed,
                AccountId::try_from(hd_index)?,
            )?,
        })
    }

    /// Encode this account's Sapling extended spending key as the canonical
    /// Bech32 string (`secret-extended-key-main1…` / `…test1…`).
    ///
    /// Unlike `to_bytes_hex` (the full unified spending key, non-portable), this
    /// IS a standard, importable encoding — but it covers ONLY the Sapling pool,
    /// not Orchard/transparent. Surfaced alongside the unified key so the popup
    /// can show both. Fully OFFLINE.
    pub fn sapling_extended_spending_key(&self, network: &str) -> Result<String, Error> {
        use zcash_protocol::consensus::NetworkConstants;
        let network = Network::from_str(network)?;
        Ok(zcash_keys::encoding::encode_extended_spending_key(
            network.hrp_sapling_extended_spending_key(),
            self.inner.sapling(),
        ))
    }

    /// Serialize this unified spending key to its librustzcash byte encoding
    /// (current Orchard era), hex-encoded.
    ///
    /// SECURITY: this is the account's spending secret — it can spend ALL funds
    /// in this account across every pool. It is account-scoped: it does NOT
    /// reveal the wallet seed phrase or any sibling account. The encoding is the
    /// non-canonical librustzcash local-storage format (era byte + typecode TLV
    /// of the constituent keys), NOT a portable ZIP-316 string, so it is not
    /// importable by other wallets.
    pub fn to_bytes_hex(&self) -> String {
        let bytes = self.inner.to_bytes(zcash_keys::keys::Era::Orchard);
        to_hex(&bytes)
    }

    /// Construct a UnifiedSpendingKey directly from a BIP39 mnemonic phrase.
    /// Derives the BIP39 seed (empty passphrase) in-wasm. Fully OFFLINE.
    pub fn from_seed_phrase(
        network: &str,
        phrase: &str,
        hd_index: u32,
    ) -> Result<UnifiedSpendingKey, Error> {
        let network = Network::from_str(network)?;
        let mnemonic = <Mnemonic<English>>::from_phrase(phrase)
            .map_err(|e| Error::KeyDecoding(e.to_string()))?;
        let seed = mnemonic.to_seed("");
        Ok(Self {
            inner: zcash_keys::keys::UnifiedSpendingKey::from_seed(
                &network,
                &seed,
                AccountId::try_from(hd_index)?,
            )?,
        })
    }

    /// Obtain the UFVK corresponding to this spending key
    pub fn to_unified_full_viewing_key(&self) -> UnifiedFullViewingKey {
        UnifiedFullViewingKey {
            inner: self.inner.to_unified_full_viewing_key(),
        }
    }

    pub fn to_sapling_proof_generation_key(&self) -> ProofGenerationKey {
        ProofGenerationKey {
            inner: self.inner.sapling().expsk.proof_generation_key(),
        }
    }
}

impl From<UnifiedSpendingKey> for zcash_keys::keys::UnifiedSpendingKey {
    fn from(value: UnifiedSpendingKey) -> Self {
        value.inner
    }
}

/// A Zcash viewing key
///
/// This is a wrapper around the `zcash_keys::keys::ViewingKey` type.
/// UFVKs should be generated from a spending key by calling `to_unified_full_viewing_key`
/// They can also be encoded and decoded to a canonical string representation
#[wasm_bindgen]
pub struct UnifiedFullViewingKey {
    inner: zcash_keys::keys::UnifiedFullViewingKey,
}

#[wasm_bindgen]
impl UnifiedFullViewingKey {
    /// Encode the UFVK to a string
    ///
    /// # Arguments
    ///
    /// * `network` - Must be either "main" or "test"
    ///
    pub fn encode(&self, network: &str) -> Result<String, Error> {
        let network = Network::from_str(network)?;
        Ok(self.inner.encode(&network))
    }

    /// Construct a UFVK from its encoded string representation
    ///
    /// # Arguments
    ///
    /// * `network` - Must be either "main" or "test"
    /// * `encoding` - The encoded string representation of the UFVK
    ///
    #[wasm_bindgen(constructor)]
    pub fn new(network: &str, encoding: &str) -> Result<UnifiedFullViewingKey, Error> {
        let network = Network::from_str(network)?;
        Ok(Self {
            inner: zcash_keys::keys::UnifiedFullViewingKey::decode(&network, encoding)
                .map_err(Error::KeyDecoding)?,
        })
    }

    /// Get the default transparent address derived from this UFVK.
    ///
    /// This can be used before creating an account to detect the wallet birthday
    /// by querying for transactions to this address.
    ///
    /// # Arguments
    ///
    /// * `network` - Must be either "main" or "test"
    ///
    /// # Returns
    ///
    /// The transparent address as a string, or None if this UFVK has no transparent component.
    ///
    pub fn get_transparent_address(&self, network: &str) -> Result<Option<String>, Error> {
        let network = Network::from_str(network)?;
        // AllAvailableKeys requires every receiver the key has, so the default
        // diversifier index skips sapling-invalid indices — the same index the
        // account's default UA and wallets like Zashi/Zodl use.
        let (ua, _) = self
            .inner
            .default_address(zcash_keys::keys::UnifiedAddressRequest::AllAvailableKeys)
            .map_err(|_| Error::TransparentAddressDerivation)?;
        Ok(ua
            .transparent()
            .map(|addr| zcash_keys::encoding::AddressCodec::encode(addr, &network)))
    }

    /// Decisive "is this MY address?" test for an external unified address.
    ///
    /// Decodes `addr` and checks whether its orchard / sapling receivers belong
    /// to THIS UFVK's incoming viewing keys. If they do, returns the diversifier
    /// index at which the receiver sits (proving it is the same wallet/keys, just
    /// a different diversifier). Returns `Ok(None)` if the address does not belong
    /// to this UFVK (i.e. genuinely different keys). Fully OFFLINE.
    ///
    /// Result format: `"orchard:<j>"` or `"sapling:<j>"` (j as decimal u128), or
    /// `None`.
    pub fn ua_diversifier_index(&self, network: &str, addr: &str) -> Result<Option<String>, Error> {
        use zcash_keys::address::Address;

        let network = Network::from_str(network)?;
        let ua = match Address::decode(&network, addr) {
            Some(Address::Unified(ua)) => ua,
            _ => return Ok(None),
        };

        // Orchard membership (orchard is valid at every diversifier index).
        if let (Some(fvk), Some(oaddr)) = (self.inner.orchard(), ua.orchard()) {
            let ivk = fvk.to_ivk(zip32::Scope::External);
            if let Some(j) = ivk.diversifier_index(oaddr) {
                return Ok(Some(format!("orchard:{}", u128::from(j))));
            }
        }
        // Sapling membership.
        if let (Some(dfvk), Some(saddr)) = (self.inner.sapling(), ua.sapling()) {
            if let Some((j, _scope)) = dfvk.decrypt_diversifier(saddr) {
                return Ok(Some(format!("sapling:{}", u128::from(j))));
            }
        }
        Ok(None)
    }

    /// Derive the unified address at an EXPLICIT diversifier index `j` for a
    /// chosen receiver set (orchard / sapling / transparent each Allow|Omit).
    ///
    /// Returns `Ok(None)` if `j` is not a valid diversifier for the requested
    /// receivers (sapling/transparent are only valid at ~half of all indices),
    /// or if the receiver request itself is impossible. Used to enumerate the
    /// diversifier space and locate the exact index another wallet used.
    /// Fully OFFLINE: pure key math, no network.
    pub fn get_unified_address_at(
        &self,
        network: &str,
        orchard: bool,
        sapling: bool,
        p2pkh: bool,
        j: u64,
    ) -> Result<Option<String>, Error> {
        use zcash_keys::keys::ReceiverRequirement::{Allow, Omit};
        let network = Network::from_str(network)?;
        let req = match zcash_keys::keys::UnifiedAddressRequest::custom(
            if orchard { Allow } else { Omit },
            if sapling { Allow } else { Omit },
            if p2pkh { Allow } else { Omit },
        ) {
            Ok(r) => r,
            Err(_) => return Ok(None),
        };
        let j = zip32::DiversifierIndex::from(j);
        match self.inner.address(j, req) {
            Ok(ua) => Ok(Some(ua.encode(&network))),
            Err(_) => Ok(None),
        }
    }

    /// Get the default unified address derived from this UFVK.
    ///
    /// Uses the `SHIELDED` receiver request — **orchard + sapling, no
    /// transparent receiver** — matching the default unified address shown by
    /// standard Zcash wallets (e.g. the Zcash mobile SDK). (Bundling the
    /// transparent receiver via `ALLOW_ALL` produces a different, non-matching
    /// `u1…` string.) ZIP-316 encoded. Fully OFFLINE: pure key math, no network.
    ///
    /// # Arguments
    ///
    /// * `network` - Must be either "main" or "test"
    pub fn get_unified_address(&self, network: &str) -> Result<String, Error> {
        let network = Network::from_str(network)?;
        let (ua, _) = self
            .inner
            .default_address(zcash_keys::keys::UnifiedAddressRequest::SHIELDED)
            .map_err(|_| Error::UnifiedAddressDerivation)?;
        Ok(ua.encode(&network))
    }
}

/// Generate a new BIP39 24-word seed phrase
///
/// IMPORTANT: This probably does not use secure randomness when used in the browser
/// and should not be used for anything other than testing
///
/// # Returns
///
/// A string containing a 24-word seed phrase
#[wasm_bindgen]
pub fn generate_seed_phrase() -> String {
    let mnemonic = <Mnemonic<English>>::generate(Count::Words24);
    mnemonic.phrase().to_string()
}
