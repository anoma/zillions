/**
 * `CryptoRecord` — the encrypted-blob envelope stored in the vault.
 *
 * The shape MUST stay compatible with the io-ts vault schema
 * (`src/storage/schemas/VaultSchema*.ts` `Sensitive` codec):
 *   cipher: { type: "aes-256-gcm", iv: Uint8Array, text: Uint8Array }
 *   kdf:    { type: "argon2", params: { m_cost, t_cost, p_cost, salt } }
 */

export enum KdfType {
  Argon2 = "argon2",
  Scrypt = "scrypt",
}

export type Argon2Params = {
  m_cost: number;
  t_cost: number;
  p_cost: number;
  salt: string;
};

export type CryptoRecord<T = Argon2Params> = {
  cipher: {
    type: "aes-256-gcm";
    iv: Uint8Array;
    text: Uint8Array;
  };
  kdf: {
    type: KdfType;
    params: T;
  };
};

// Argon2 default cost parameters.
export const Argon2Config = {
  m_cost: 65536,
  t_cost: 3,
  p_cost: 1,
};
