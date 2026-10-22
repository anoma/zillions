/**
 * Account creation orchestration. Runs in the setup tab.
 *
 * Pipeline:
 *   1. set the extension password if required   → background/vault
 *   2. derive addresses from the seed           → @zillions/zcore (offline)
 *   3. persist the parent (+ shielded) account  → background/keyring
 *
 * Returns a typed result and reports progress via `onProgress`.
 */
import type { BackgroundClient } from "../../ipc/client";
import type {
  AccountSecret,
  AccountStore,
  Bip44Path,
  DerivedAccount,
  Zip32Path,
} from "../../ipc/contract";
import {
  deriveAccount,
  deriveAccountFromUfvk,
  getNetwork,
} from "../../background/crypto/zillions.js";
import {
  LEDGER_BIP44_PATH,
  LEDGER_ZIP32_PATH,
  type LedgerKeys,
} from "./ledger.js";
import { mnemonicToSeed } from "../../background/crypto/mnemonic.js";

export type CreateAccountInput = {
  accountSecret: AccountSecret;
  alias: string;
  flow: "create" | "import" | "keystone";
  bip44Path: Bip44Path;
  zip32Path: Zip32Path;
  passwordRequired: boolean;
  password?: string;
  /** Block height at which the account was created/imported. undefined = auto-fetch chain tip. */
  birthday: number | undefined;
  seedFingerprint: string;
};

/** A recent block per network: [height, unix time in seconds]. */
const CHECKPOINTS = {
  main: [3_511_000, 1_791_490_925],
  test: [4_481_000, 1_791_528_275],
} as const;
// Mainnet averages ~75.36s per block (testnet is faster); assuming a slower
// rate keeps the estimate below the real height as the checkpoint ages.
const ASSUMED_BLOCK_SECONDS = 76;
// Absorbs a device clock running up to a week fast.
const CLOCK_MARGIN_BLOCKS = (7 * 24 * 60 * 60) / 75;

/**
 * A new account's birthday, estimated offline from the device clock so the
 * Keychain never asks a server for the chain tip. It must never be later than
 * the real height, or the wallet would skip blocks that can hold its funds.
 */
const estimateBirthday = (): number => {
  const [height, time] = CHECKPOINTS[getNetwork()];
  const elapsed = Math.max(0, Date.now() / 1000 - time);
  return Math.floor(
    height + elapsed / ASSUMED_BLOCK_SECONDS - CLOCK_MARGIN_BLOCKS,
  );
};

export type CreateAccountResult =
  | { ok: true; parentAccount: AccountStore; shieldedAccount?: DerivedAccount }
  | { ok: false; error: string };

/** Key material derived offline for one account. */
type DerivedAddresses = {
  transparentAddress: string;
  shieldedAddress: string;
  /** Encoded UFVK (`uview1…`) — the account's viewing key (NOT a public key). */
  viewingKey: string;
};

export const createAccount = async (
  client: BackgroundClient,
  input: CreateAccountInput,
  onProgress: (info: string) => void,
): Promise<CreateAccountResult> => {
  const {
    accountSecret,
    alias,
    flow,
    bip44Path,
    zip32Path,
    passwordRequired,
    password,
    birthday,
    seedFingerprint,
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
    const { transparentAddress, shieldedAddress, viewingKey } =
      await deriveAddresses(accountSecret, bip44Path.account);

    // An imported account may be years old: 0 scans its full history.
    const birthday = flow === "create" ? estimateBirthday() : 0;

    onProgress(`Encrypting and storing ${prettySecret(accountSecret)}.`);
    const parentAccount = await client.saveAccountSecret({
      accountSecret,
      alias,
      flow,
      path: bip44Path,
      transparentAddress,
      shieldedAddress,
      viewingKey,
      birthday,
      // birthday: resolvedBirthday,
      seedFingerprint,
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
      flow,
      shieldedAddress,
      viewingKey,
      birthday,
    });

    return { ok: true, parentAccount, shieldedAccount };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export type CreateLedgerAccountResult =
  | (CreateAccountResult & { ok: true; alreadyImported: boolean })
  | { ok: false; error: string };

/** Store a connected Ledger's public keys, setting the password first if needed. */
export const createLedgerAccount = async (
  client: BackgroundClient,
  input: { keys: LedgerKeys; passwordRequired: boolean; password?: string },
  onProgress: (info: string) => void,
): Promise<CreateLedgerAccountResult> => {
  const { keys, passwordRequired, password } = input;
  try {
    if (passwordRequired && !password) {
      return { ok: false, error: "Password is required and was not provided" };
    }
    if (password) {
      onProgress("Setting a password for the extension.");
      await client.createPassword(password);
    }

    onProgress("Storing your Ledger account.");
    const result = await client.saveLedgerAccount({
      alias: keys.deviceName,
      bip44Path: LEDGER_BIP44_PATH,
      zip32Path: LEDGER_ZIP32_PATH,
      transparentAddress: keys.transparentAddress,
      shieldedAddress: keys.shieldedAddress,
      viewingKey: keys.viewingKey,
      // The device may already hold funds from any point in history.
      birthday: 0,
    });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * Derive transparent + shielded receivers for the account secret.
 *
 * Only the MNEMONIC flow is implemented: keys come from the phrase's seed. Raw private-key and spending-key
 * imports are NOT implemented yet (there is no derivation path for bare keys) and throw
 * rather than fabricate a bogus address.
 */
const deriveAddresses = async (
  secret: AccountSecret,
  hdIndex: number,
): Promise<DerivedAddresses> => {
  switch (secret.t) {
    case "Mnemonic": {
      const seed = await mnemonicToSeed(
        secret.seedPhrase.join(" "),
        secret.passphrase,
      );
      const account = await deriveAccount(seed, hdIndex);
      if (!account.transparent) {
        throw new Error("Account has no transparent receiver");
      }
      return {
        transparentAddress: account.transparent,
        shieldedAddress: account.unified,
        viewingKey: account.ufvk,
      };
    }

    case "ViewingKey": {
      const account = await deriveAccountFromUfvk(secret.viewingKey);
      if (!account.transparent) {
        throw new Error("Account has no transparent receiver");
      }
      return {
        transparentAddress: account.transparent,
        shieldedAddress: account.unified,
        viewingKey: account.ufvk,
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
    case "ViewingKey":
      return "viewing key";
  }
};
