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
