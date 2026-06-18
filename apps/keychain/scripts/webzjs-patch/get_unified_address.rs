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
