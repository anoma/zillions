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
