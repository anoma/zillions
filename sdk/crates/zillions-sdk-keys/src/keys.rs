// Copyright 2024 ChainSafe Systems
// SPDX-License-Identifier: Apache-2.0, MIT

use std::str::FromStr;
use wasm_bindgen::prelude::*;

use crate::error::Error;
use bip0039::{Count, English, Mnemonic};
use zillions_sdk_common::Network;
use zip32::AccountId;

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

    /// Verify a Bitcoin/Zcash signed-message signature produced by
    /// `sign_arbitrary`. Associated function (no `self`) — wasm-bindgen exports
    /// it as the static method `UnifiedSpendingKey.verify_arbitrary`.
    ///
    /// Recovers the signing public key from the recoverable signature + 32-byte
    /// digest and checks it matches `public_key_hex` (compressed secp256k1, 33
    /// bytes hex). Returns `Ok(true)` only when the signature is valid AND its
    /// recovered key equals the expected one. Pure public-key crypto — no
    /// secret material.
    ///
    /// * `public_key_hex`   — expected compressed secp256k1 public key, hex
    /// * `hash_hex`         — the 32-byte double-SHA256 digest, hex
    /// * `signature_base64` — the 65-byte `[header || r || s]`, base64
    pub fn verify_arbitrary(
        public_key_hex: &str,
        hash_hex: &str,
        signature_base64: &str,
    ) -> Result<bool, Error> {
        use base64::Engine;
        use secp256k1::ecdsa::{RecoverableSignature, RecoveryId};
        use secp256k1::{Message, PublicKey, Secp256k1};

        let hash_bytes =
            hex::decode(hash_hex).map_err(|e| Error::KeyDecoding(e.to_string()))?;
        let hash: [u8; 32] = hash_bytes
            .as_slice()
            .try_into()
            .map_err(|_| Error::KeyDecoding("hash must be 32 bytes".into()))?;

        let sig_bytes = base64::engine::general_purpose::STANDARD
            .decode(signature_base64)
            .map_err(|e| Error::KeyDecoding(e.to_string()))?;
        if sig_bytes.len() != 65 {
            return Err(Error::KeyDecoding("signature must be 65 bytes".into()));
        }
        let header = sig_bytes[0];
        if header < 27 {
            return Err(Error::KeyDecoding("invalid signature header".into()));
        }
        let recid = RecoveryId::from_i32(((header - 27) & 3) as i32)
            .map_err(|e| Error::KeyDecoding(e.to_string()))?;
        let recsig = RecoverableSignature::from_compact(&sig_bytes[1..65], recid)
            .map_err(|e| Error::KeyDecoding(e.to_string()))?;

        let secp = Secp256k1::new();
        let recovered = secp
            .recover_ecdsa(&Message::from_digest(hash), &recsig)
            .map_err(|e| Error::KeyDecoding(e.to_string()))?;

        let expected_bytes =
            hex::decode(public_key_hex).map_err(|e| Error::KeyDecoding(e.to_string()))?;
        let expected = PublicKey::from_slice(&expected_bytes)
            .map_err(|e| Error::KeyDecoding(e.to_string()))?;

        Ok(recovered == expected)
    }

    /// Sign an arbitrary UTF-8 message with this account's transparent
    /// secp256k1 key — the external receive key at index 0, i.e. the same key
    /// behind `get_external_transparent_address`.
    ///
    /// Uses the Bitcoin/Zcash "signed message" construction so the result is
    /// interoperable with `zcashd verifymessage`: the message is serialized as
    /// `compactsize(magic)||magic||compactsize(msg)||msg` (magic =
    /// "Zcash Signed Message:\n"), double-SHA256 hashed, then signed with a
    /// RECOVERABLE ECDSA signature (RFC6979 deterministic nonce).
    ///
    /// Returns `"<hash_hex>:<sig_base64>:<pubkey_hex>"`:
    ///   - `hash_hex`   — the 32-byte double-SHA256 digest, hex
    ///   - `sig_base64` — the 65-byte Bitcoin-style `[header || r || s]`,
    ///                    header = `27 + recid + 4` (the +4 = compressed key),
    ///                    base64-encoded (the encoding zcashd emits)
    ///   - `pubkey_hex` — the compressed secp256k1 public key (33 bytes), hex
    ///
    /// SECURITY: requires the spending key. Fully OFFLINE — pure key math.
    pub fn sign_arbitrary(&self, message: &str) -> Result<String, Error> {
        use base64::Engine;
        use secp256k1::{Message, Secp256k1};
        use sha2::{Digest, Sha256};
        use zcash_transparent::keys::NonHardenedChildIndex;

        // Bitcoin CompactSize length prefix.
        let write_compact_size = |buf: &mut Vec<u8>, n: usize| {
            if n < 253 {
                buf.push(n as u8);
            } else if n <= 0xffff {
                buf.push(253);
                buf.extend_from_slice(&(n as u16).to_le_bytes());
            } else if n <= 0xffff_ffff {
                buf.push(254);
                buf.extend_from_slice(&(n as u32).to_le_bytes());
            } else {
                buf.push(255);
                buf.extend_from_slice(&(n as u64).to_le_bytes());
            }
        };

        // 1. derive the external index-0 transparent secp256k1 secret key
        let sk = self
            .inner
            .transparent()
            .derive_external_secret_key(NonHardenedChildIndex::ZERO)
            .map_err(|e| Error::KeyDecoding(e.to_string()))?;

        // 2. Bitcoin/Zcash signed-message digest (double SHA256)
        const MAGIC: &str = "Zcash Signed Message:\n";
        let mut buf: Vec<u8> = Vec::new();
        write_compact_size(&mut buf, MAGIC.len());
        buf.extend_from_slice(MAGIC.as_bytes());
        write_compact_size(&mut buf, message.len());
        buf.extend_from_slice(message.as_bytes());
        let hash: [u8; 32] = Sha256::digest(Sha256::digest(&buf)).into();

        // 3. recoverable ECDSA signature (deterministic nonce)
        let secp = Secp256k1::signing_only();
        let msg = Message::from_digest(hash);
        let recsig = secp.sign_ecdsa_recoverable(&msg, &sk);
        let (recid, compact) = recsig.serialize_compact();
        let mut sig65 = [0u8; 65];
        sig65[0] = 27 + recid.to_i32() as u8 + 4; // +4 = compressed pubkey
        sig65[1..].copy_from_slice(&compact);

        // 4. compressed public key (so callers can verify without guessing it)
        let pubkey_hex = hex::encode(sk.public_key(&secp).serialize());

        let sig_b64 = base64::engine::general_purpose::STANDARD.encode(sig65);
        Ok(format!("{}:{}:{}", hex::encode(hash), sig_b64, pubkey_hex))
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
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
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
        let (ua, _) = self
            .inner
            .default_address(zcash_keys::keys::UnifiedAddressRequest::ALLOW_ALL)
            .map_err(|_| Error::TransparentAddressDerivation)?;
        Ok(ua
            .transparent()
            .map(|addr| zcash_keys::encoding::AddressCodec::encode(addr, &network)))
    }

    /// The transparent external receive PUBLIC KEY (secp256k1, compressed, hex)
    /// at BIP-44 `m/44'/<coin_type>'/<account>'/0/0` — the public key whose
    /// address is `get_external_transparent_address`. `None` if this UFVK has
    /// no transparent component.
    ///
    /// This is the account's actual transparent public key. It is DISTINCT from
    /// the UFVK encoding (`encode`), which is a VIEWING key (it lets the holder
    /// see shielded activity) — not a public key. Fully OFFLINE: pure key math.
    pub fn get_external_transparent_pubkey(&self) -> Result<Option<String>, Error> {
        use zcash_transparent::keys::NonHardenedChildIndex;
        let account_pubkey = match self.inner.transparent() {
            Some(k) => k,
            None => return Ok(None),
        };
        let pubkey = account_pubkey
            .derive_address_pubkey(
                zip32::Scope::External.into(),
                NonHardenedChildIndex::ZERO,
            )
            .map_err(|_| Error::TransparentAddressDerivation)?;
        Ok(Some(
            pubkey.serialize().iter().map(|b| format!("{:02x}", b)).collect(),
        ))
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
    pub fn ua_diversifier_index(
        &self,
        network: &str,
        addr: &str,
    ) -> Result<Option<String>, Error> {
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

    /// Get the standard external transparent receive address — BIP-44
    /// `m/44'/<coin_type>'/<account>'/0/0` — for this UFVK's transparent
    /// component.
    ///
    /// Unlike `get_transparent_address`, which returns the transparent receiver
    /// embedded in the *default unified address* (at the UA's pseudo-random
    /// diversifier index), this returns the conventional index-0 receive
    /// address that other wallets (e.g. the Zcash mobile SDK) display. Fully
    /// OFFLINE: pure key math, no network.
    ///
    /// # Arguments
    ///
    /// * `network` - Must be either "main" or "test"
    pub fn get_external_transparent_address(
        &self,
        network: &str,
    ) -> Result<Option<String>, Error> {
        use zcash_transparent::keys::{IncomingViewingKey, NonHardenedChildIndex};
        let network = Network::from_str(network)?;
        let account_pubkey = match self.inner.transparent() {
            Some(k) => k,
            None => return Ok(None),
        };
        let external_ivk = account_pubkey
            .derive_external_ivk()
            .map_err(|_| Error::TransparentAddressDerivation)?;
        let addr = external_ivk
            .derive_address(NonHardenedChildIndex::ZERO)
            .map_err(|_| Error::TransparentAddressDerivation)?;
        Ok(Some(zcash_keys::encoding::AddressCodec::encode(
            &addr, &network,
        )))
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
