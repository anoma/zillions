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
