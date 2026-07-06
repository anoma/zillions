export type AccountSource = "imported" | "generated";

/** Plaintext secret material before encryption into the vault. */
export type SensitiveAccountStoreData = { text: string; passphrase?: string };
