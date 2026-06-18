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
