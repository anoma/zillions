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
