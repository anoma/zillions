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
