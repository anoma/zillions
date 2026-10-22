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
import { mnemonicToSeed } from "../../background/crypto/mnemonic";
import { deriveAccount, deriveAccountFromUfvk } from "../../background/crypto/zillions";

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

/**
 * Fetch the current chain tip height from lightwalletd via a minimal gRPC-web
 * call to `GetLatestBlock`. Throws if the request fails: a height of 0 (genesis)
 * is not a safe fallback here, since it gets stored as the account's birthday
 * and later sent to the wallet's GetTreeState RPC, where it's indistinguishable
 * from an unset height/hash and rejected by the server.
 *
 * The request body is a 5-byte gRPC-web frame with an empty `ChainSpec` proto.
 * The response contains a `BlockID` proto; field 1 (height) is a varint uint64.
 */
const fetchChainTipHeight = async (): Promise<number> => {
  const url = process.env.Z_INTERFACE_LIGHTWALLETD_URL;
  if (!url) throw new Error("Z_INTERFACE_LIGHTWALLETD_URL is not configured");

  const body = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);
  // CompactTxStreamer is the lightwalletd gRPC service; GetLatestBlock returns the chain tip as a BlockID.
  const res = await fetch(
    `${url}/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLatestBlock`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/grpc-web+proto",
        "X-Grpc-Web": "1",
      },
      body,
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch chain tip height: HTTP ${res.status}`);
  }

  // Parse: skip 5-byte gRPC-web frame header, then read BlockID field 1 varint.
  const bytes = new Uint8Array(await res.arrayBuffer());
  let height = 0;
  let shift = 0;
  // bytes[5] = 0x08 (field 1, wire type 0); height varint starts at bytes[6]
  for (let i = 6; i < bytes.length; i++) {
    height |= (bytes[i] & 0x7f) << shift;
    shift += 7;
    if ((bytes[i] & 0x80) === 0) break;
  }
  return height;
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

    // Auto-fetch the chain tip when no birthday was provided. For the "create"
    // flow this is always correct (new account, no prior history). For the
    // "import" flow it's the right conservative default when the user didn't
    // enter a known birthday.
    const resolvedBirthday = birthday ?? await fetchChainTipHeight();

    onProgress(`Encrypting and storing ${prettySecret(accountSecret)}.`);
    const parentAccount = await client.saveAccountSecret({
      accountSecret,
      alias,
      flow,
      path: bip44Path,
      transparentAddress,
      shieldedAddress,
      viewingKey,
      birthday: resolvedBirthday,
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
      birthday: resolvedBirthday,
    });

    return { ok: true, parentAccount, shieldedAccount };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * Derive transparent + shielded receivers for the account secret.
 *
 * Only the MNEMONIC flow is implemented: keys come from the phrase's seed. Raw private-key and spending-key imports are NOT
 * implemented yet (there is no derivation path for bare keys) and throw
 * rather than fabricate a bogus address.
 */
const deriveAddresses = async (
  secret: AccountSecret,
  hdIndex: number
): Promise<DerivedAddresses> => {
  switch (secret.t) {
    case "Mnemonic": {
      const seed = await mnemonicToSeed(
        secret.seedPhrase.join(" "),
        secret.passphrase
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
