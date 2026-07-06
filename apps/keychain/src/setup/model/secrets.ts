/**
 * Setup secret model + validators: a discriminated secret kind plus a separate
 * mnemonic word-count.
 */
import type { AccountSecret } from "../../ipc/contract";

/** What kind of secret the user is importing/creating. */
export type SecretKind = "mnemonic" | "private-key" | "spending-key";

export type MnemonicLength = 12 | 24;

/** Result-style validation (ok XOR error), avoids throwing in the UI. */
export type Validation =
  | { ok: true }
  | { ok: false; error: string };

const HEX = /^[0-9a-fA-F]*$/;

export const stripPrivateKeyPrefix = (key: string): string =>
  key.startsWith("0x") ? key.slice(2) : key;

export const validatePrivateKey = (key: string): Validation => {
  const clean = stripPrivateKeyPrefix(key).trim();
  if (!HEX.test(clean)) {
    return { ok: false, error: "Private key may only contain 0-9, a-f" };
  }
  if (clean.length > 64) {
    return { ok: false, error: "Private key must be at most 64 characters" };
  }
  return { ok: true };
};

const SPENDING_KEY_PREFIX = "secret-extended-key";

export const validateSpendingKey = (key: string): Validation => {
  if (key && !key.startsWith(SPENDING_KEY_PREFIX)) {
    return {
      ok: false,
      error: `Spending keys begin with "${SPENDING_KEY_PREFIX}"`,
    };
  }
  return { ok: true };
};

/** Build the wire `AccountSecret` from UI state for a given secret kind. */
export const toAccountSecret = (input: {
  kind: SecretKind;
  mnemonic: string[];
  mnemonicLength: MnemonicLength;
  privateKey: string;
  spendingKey: string;
  passphrase: string;
}): AccountSecret => {
  switch (input.kind) {
    case "mnemonic":
      return {
        t: "Mnemonic",
        seedPhrase: input.mnemonic.slice(0, input.mnemonicLength),
        passphrase: input.passphrase,
      };
    case "private-key":
      return {
        t: "PrivateKey",
        privateKey: stripPrivateKeyPrefix(input.privateKey),
      };
    case "spending-key":
      return { t: "ShieldedKeys", spendingKey: input.spendingKey };
  }
};
