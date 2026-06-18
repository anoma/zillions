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
