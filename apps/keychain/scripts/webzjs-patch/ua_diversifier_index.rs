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
