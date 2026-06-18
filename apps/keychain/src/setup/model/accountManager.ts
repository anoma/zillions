/**
 * Account creation orchestration. Runs in the setup tab.
 *
 * Pipeline:
 *   1. set the extension password if required   → background/vault
 *   2. derive addresses via the wallet façade   → src/wallet (offline)
 *   3. persist the parent (+ shielded) account  → background/keyring
 *
 * Address derivation must run here (page context) — the façade uses
 * `@zillions/webzjs-keys`. Returns a typed result and reports progress via
 * `onProgress`.
 */
import type { BackgroundClient } from "../../ipc/client";
import type {
  AccountSecret,
  AccountStore,
  Bip44Path,
  DerivedAccount,
  Zip32Path,
} from "../../ipc/contract";
import { getZcashWallet, type ZcashWallet } from "../../wallet";

export type CreateAccountInput = {
  accountSecret: AccountSecret;
  alias: string;
  flow: "create" | "import";
  bip44Path: Bip44Path;
  zip32Path: Zip32Path;
  passwordRequired: boolean;
  password?: string;
};

export type CreateAccountResult =
  | { ok: true; parentAccount: AccountStore; shieldedAccount?: DerivedAccount }
  | { ok: false; error: string };

/** Key material produced by the offline façade for one account. */
type DerivedAddresses = {
  transparentAddress: string;
  shieldedAddress: string;
  /** Transparent secp256k1 public key (compressed hex) — the real public key. */
  publicKey: string;
  /** Encoded UFVK (`uview1…`) — the account's viewing key (NOT a public key). */
  viewingKey: string;
};

export const createAccount = async (
  client: BackgroundClient,
  input: CreateAccountInput,
  onProgress: (info: string) => void
): Promise<CreateAccountResult> => {
  const {
    accountSecret,
    alias,
    flow,
    bip44Path,
    zip32Path,
    passwordRequired,
    password,
  } = input;

  try {
    if (passwordRequired && !password) {
      return { ok: false, error: "Password is required and was not provided" };
    }

    if (password) {
      onProgress("Setting a password for the extension.");
      await client.createPassword(password);
    }

    onProgress("Deriving your Zcash addresses.");
    const wallet = getZcashWallet();
    const { transparentAddress, shieldedAddress, publicKey, viewingKey } =
      await deriveAddresses(wallet, accountSecret, bip44Path.account);

    onProgress(`Encrypting and storing ${prettySecret(accountSecret)}.`);
    const parentAccount = await client.saveAccountSecret({
      accountSecret,
      alias,
      flow,
      path: bip44Path,
      transparentAddress,
      shieldedAddress,
      publicKey,
      viewingKey,
    });

    // A spending-key import is itself the shielded account; nothing to derive.
    if (parentAccount.type === "shielded-keys") {
      return { ok: true, parentAccount };
    }

    onProgress("Generating shielded account.");
    const shieldedAccount = await client.deriveShieldedAccount({
      parentId: parentAccount.id,
      alias,
      path: zip32Path,
      source: flow === "create" ? "generated" : "imported",
      shieldedAddress,
      viewingKey,
    });

    return { ok: true, parentAccount, shieldedAccount };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * Derive transparent + shielded receivers for the account secret.
 *
 * Only the MNEMONIC flow is implemented: the seed phrase feeds the façade's
 * seed-based account model. Raw private-key and spending-key imports are NOT
 * implemented yet (the façade has no derivation path for bare keys) and throw
 * rather than fabricate a bogus address.
 */
const deriveAddresses = async (
  wallet: ZcashWallet,
  secret: AccountSecret,
  hdIndex: number
): Promise<DerivedAddresses> => {
  switch (secret.t) {
    case "Mnemonic": {
      const seedPhrase = secret.seedPhrase.join(" ");
      const account = await wallet.createAccount(seedPhrase, hdIndex);
      const [transparent, shielded] = await Promise.all([
        wallet.createTransparent(account),
        wallet.createShielded(account),
      ]);
      return {
        transparentAddress: transparent.address,
        shieldedAddress: shielded.address,
        publicKey: wallet.publicKey(account),
        viewingKey: wallet.viewingKey(account),
      };
    }

    case "PrivateKey":
      throw new Error("Private key import is not implemented yet");

    case "ShieldedKeys":
      throw new Error("Spending key import is not implemented yet");
  }
};

const prettySecret = (secret: AccountSecret): string => {
  switch (secret.t) {
    case "Mnemonic":
      return "mnemonic";
    case "PrivateKey":
      return "private key";
    case "ShieldedKeys":
      return "spending key";
  }
};
