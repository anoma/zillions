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
