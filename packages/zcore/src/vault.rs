//! The Keychain vault's password hash. The vault's AES-GCM runs in WebCrypto;
//! only Argon2id, which WebCrypto lacks, is here.

use argon2::{Algorithm, Argon2, Params, Version};
use wasm_bindgen::prelude::*;

const KEY_BYTES: usize = 32;

fn hash(
    password: &[u8],
    salt: &[u8],
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
) -> Result<Vec<u8>, String> {
    let params = Params::new(m_cost, t_cost, p_cost, Some(KEY_BYTES)).map_err(|e| e.to_string())?;
    let mut out = vec![0; KEY_BYTES];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password, salt, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// Argon2id v1.3, 32 bytes: the raw hash, not a PHC string.
#[wasm_bindgen]
pub fn argon2id(
    password: &str,
    salt: &[u8],
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
) -> Result<Vec<u8>, JsError> {
    hash(password.as_bytes(), salt, m_cost, t_cost, p_cost).map_err(|e| JsError::new(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    // What the Keychain's previous crypto wasm gave.
    #[test]
    fn matches_the_old_vault_hash() {
        let out = hash(b"hunter2", b"saltsaltsaltsalt", 65536, 3, 1).unwrap();
        assert_eq!(
            hex::encode(out),
            "dd17138a1554f3e9034b679b2121901de9463580c7970d2d29c2c6822d271ae0"
        );
    }
}
