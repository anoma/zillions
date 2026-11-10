import { truncateInMiddle } from "@zillions/utils";
import { v4 as uuidv4 } from "uuid";

import type {
  AccountFlow,
  AccountSecret,
  AccountStore,
  AccountType,
  Bip44Path,
  DerivedAccount,
  DeviceCredential,
  DeviceKind,
  MnemonicValidation,
  Zip32Path,
} from "../../ipc/contract";
import { engines } from "../../hardware/engines";
import { KeyStoreType } from "../../storage";
import { generateId } from "../../utils/id";
import {
  generateMnemonic,
  mnemonicToSeed,
  PhraseSize,
  validateMnemonic,
} from "../crypto/mnemonic";
import {
  computeSeedFingerprint,
  deriveAccount,
  initZillionsSdk,
  openLinkKey,
  sealLinkKey,
  signPczt,
  spendingKeys,
  type SpendingKeys,
} from "../crypto/zillions";
import { AccountRepository, VaultService } from "../vault";
import {
  AccountSource,
  deviceOf,
  SensitiveAccountStoreData,
} from "./types";

// UUID v5 namespace: ids are derived deterministically from account inputs.
const UUID_NAMESPACE = "9bfceade-37fe-11ed-acc0-a3da3461b38c";

// Structural shape of a BIP-39 English word (lowercase a–z, 3–8 chars). Used
// only as a UX hint to highlight a likely-bad word; the authoritative validity
// check is `validateMnemonic`.
const LOOKS_LIKE_BIP39_WORD = /^[a-z]{3,8}$/;

const toAccountStore = (a: KeyStoreType): AccountStore => ({
  id: a.id,
  alias: a.alias,
  address: a.address,
  owner: a.owner,
  type: a.type as AccountType,
  device: deviceOf(a),
  path: a.path as Bip44Path,
  parentId: a.parentId,
  source: a.source as AccountStore["source"],
  timestamp: a.timestamp,
});

/**
 * Keyring: key semantics for the Setup flow — mnemonic generation/validation,
 * secret encoding, and account/keypair record construction.
 *
 * Persistence is delegated: `VaultService` is the custodian of encrypted
 * sensitive data, `AccountRepository` of the public account records.
 * Address/key derivation runs in the page (Zillions SDK façade) and arrives via the
 * IPC payload.
 */
export class Keyring {
  constructor(
    protected readonly vaultService: VaultService,
    protected readonly accounts: AccountRepository
  ) {}

  // Return new mnemonic to client for validation
  public async generateMnemonic(size: PhraseSize = 12): Promise<string[]> {
    return generateMnemonic(size);
  }

  /**
   * Reveal the seed phrase backing a mnemonic account. Requires the vault to be
   * unlocked; the caller is expected to have re-verified the password first.
   */
  public async revealMnemonic(accountId: string): Promise<string> {
    await this.vaultService.assertIsUnlocked();

    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }
    if ((account.type as string) !== "mnemonic") {
      throw new Error("Account was not created from a mnemonic");
    }

    const sensitive = await this.accounts.getSensitive(accountId);
    const data =
      await this.vaultService.reveal<SensitiveAccountStoreData>(sensitive);
    return data?.text ?? "";
  }

  public async validateMnemonic(phrase: string): Promise<MnemonicValidation> {
    const words = phrase.trim().split(/\s+/).filter(Boolean);
    if (words.length !== 12 && words.length !== 24) {
      return { isValid: false, error: "Mnemonic must be 12 or 24 words" };
    }

    const isValid = await validateMnemonic(words.join(" "));
    if (isValid) return { isValid: true };

    // `Mnemonic.validate` returns a single boolean (no per-word index). The
    // crypto package does not expose the BIP-39 wordlist, so for the UI's
    // invalid-word highlighting we surface the first word that fails a cheap
    // structural check. If every word passes, the failure is a checksum
    // error, reported without an index.
    const invalidWordIndex = words.findIndex(
      (w) => !LOOKS_LIKE_BIP39_WORD.test(w)
    );
    if (invalidWordIndex !== -1) {
      return {
        isValid: false,
        error: `Word #${invalidWordIndex + 1} is invalid`,
        invalidWordIndex,
      };
    }
    return {
      isValid: false,
      error: "Invalid recovery phrase (checksum failed)",
    };
  }

  /**
   * Sign a PCZT (base64 in/out).
   *
   * The signing account is the `signer` address when given, else the active
   * account. A derived shielded child carries no secret of its own — the
   * mnemonic lives on its parent — so the secret is revealed from the parent
   * record while the hd index comes from the resolved account's path. A
   * hardware-wallet account signs in the approval tab; its opaque
   * `deviceData` is verified and folded into the PCZT here by the device's
   * engine — for the passkey, with the seed re-derived from its PRF output.
   */
  public async sign(
    pczt: string,
    signer?: string,
    deviceData?: string
  ): Promise<string> {
    await this.vaultService.assertIsUnlocked();
    await initZillionsSdk();

    const record = await this.signingAccount(signer);
    const device = await this.deviceAccount(record);
    if (device) {
      if (!deviceData) {
        throw new Error(
          `A ${engines[device.device].name} account signs on its device`
        );
      }
      return engines[device.device].assembleSignedPczt(pczt, deviceData, {
        credential: device.credential,
        hdIndex: device.hdIndex,
      });
    }
    const { seed, hdIndex } = await this.resolveSeed(record);
    return signPczt(pczt, seed, hdIndex);
  }

  /**
   * A payment link's key (base64) sealed to the `signer` account's seed.
   * Ledger accounts can't: their seed never leaves the device.
   */
  public async sealLinkKey(key: string, signer: string): Promise<string> {
    await this.vaultService.assertIsUnlocked();
    await initZillionsSdk();

    const record = await this.signingAccount(signer);
    const { seed, hdIndex } = await this.resolveSeed(record);
    return sealLinkKey(key, seed, hdIndex);
  }

  /** A payment link's key (base64) from its seal, by the `signer` account's seed. */
  public async openLinkKey(
    sealed: string,
    nk: string,
    signer: string
  ): Promise<string> {
    await this.vaultService.assertIsUnlocked();
    await initZillionsSdk();

    const record = await this.signingAccount(signer);
    const { seed, hdIndex } = await this.resolveSeed(record);
    return openLinkKey(sealed, nk, seed, hdIndex);
  }

  /**
   * The viewing key (UFVK) of the account `sign` would sign with, derived
   * from its seed, or for a hardware-wallet account the one the device
   * exported: what the approval summary checks outputs against.
   */
  public async viewingKey(signer?: string): Promise<string> {
    await this.vaultService.assertIsUnlocked();

    const record = await this.signingAccount(signer);
    const device = await this.deviceAccount(record);
    if (device) return device.ufvk;
    const { seed, hdIndex } = await this.resolveSeed(record);
    return (await deriveAccount(seed, hdIndex)).ufvk;
  }

  /**
   * The `signer` address's device identity if its keys live on one: the kind,
   * the ZIP-32 index the device signed under, and for a passkey the
   * credential id the ceremony must assert with.
   */
  public async signingDevice(signer?: string): Promise<
    | {
        device: DeviceKind;
        hdIndex: number;
        credentialId?: string;
      }
    | undefined
  > {
    const record = await this.signingAccount(signer);
    const device = await this.deviceAccount(record);
    return (
      device && {
        device: device.device,
        hdIndex: device.hdIndex,
        credentialId: device.credential?.id,
      }
    );
  }

  /**
   * A device account's kind, stored UFVK and ZIP-32 index, all on its
   * shielded child, whichever of the pair `record` is; and the at-rest
   * credential the parent carries (a passkey's, to verify its assertion
   * against). Undefined for mnemonic-rooted accounts.
   */
  private async deviceAccount(record: KeyStoreType): Promise<
    | {
        device: DeviceKind;
        ufvk: string;
        hdIndex: number;
        credential?: DeviceCredential;
      }
    | undefined
  > {
    const parent = record.parentId
      ? await this.accounts.findById(record.parentId)
      : record;
    const device = parent && deviceOf(parent);
    if (!device) return undefined;
    const child = record.parentId
      ? record
      : (await this.accounts.findAll()).find((r) => r.parentId === record.id);
    if (!child) {
      throw new Error(`Shielded account of ${record.address} not found`);
    }
    return {
      device,
      ufvk: child.owner,
      hdIndex: child.path.account,
      credential: parent.credential,
    };
  }

  /** The `signer` address's account, else the active one. */
  private async signingAccount(signer?: string): Promise<KeyStoreType> {
    if (signer) {
      const record = await this.accounts.findByAddress(signer);
      if (!record) {
        throw new Error(`Account for ${signer} not found!`);
      }
      return record;
    }
    const active = await this.accounts.getActiveAccount();
    const record = active ? await this.accounts.findById(active.id) : undefined;
    if (!record) {
      throw new Error("No active account to sign with");
    }
    return record;
  }

  /**
   * Reveal the account's spending keys — the secrets that can spend all funds
   * in this shielded account, in both the Sapling (Bech32) and unified/Orchard
   * (hex) encodings. Requires an unlocked vault; the caller (popup) re-verifies
   * the password first. `accountId` is the SHIELDED account (the child derived
   * under a mnemonic parent, or a shielded-keys import).
   */
  public async revealSpendingKey(accountId: string): Promise<SpendingKeys> {
    await this.vaultService.assertIsUnlocked();
    await initZillionsSdk();

    const record = await this.accounts.findById(accountId);
    if (!record) {
      throw new Error(`Account not found: ${accountId}`);
    }
    if ((record.type as string) !== "shielded-keys") {
      throw new Error("Spending key is only available for shielded accounts");
    }

    // Device accounts never reveal key material; resolveSeed would refuse
    // too, but with a message about the vault rather than the reveal.
    const holder = record.parentId
      ? await this.accounts.findById(record.parentId)
      : record;
    if (holder && deviceOf(holder)) {
      throw new Error("A device account's spending keys can't be revealed");
    }

    const { seed, hdIndex } = await this.resolveSeed(record);
    return spendingKeys(seed, hdIndex);
  }

  /**
   * Resolve the BIP-39 seed + ZIP-32 account index backing an account record,
   * walking a derived shielded child to its mnemonic parent (children hold no
   * secret of their own). The hd index is the resolved record's own
   * `path.account`. Mnemonic-rooted accounts resolve here. Every device
   * account — hardware wallets and the deriving passkey alike — holds no
   * secret at all and refuses. Revealed per call, never cached.
   *
   * Shared by `sign` and `revealSpendingKey`: both need the same offline key
   * material, differing only in what they do with it.
   */
  private async resolveSeed(
    record: KeyStoreType
  ): Promise<{ seed: Uint8Array; hdIndex: number }> {
    const secretHolder = record.parentId
      ? await this.accounts.findById(record.parentId)
      : record;
    if (!secretHolder) {
      throw new Error(`Parent account not found: ${record.parentId}`);
    }
    if (deviceOf(secretHolder)) {
      throw new Error("A device account's keys never live in the vault");
    }
    if ((secretHolder.type as string) !== "mnemonic") {
      throw new Error(
        "Only mnemonic-backed accounts are supported (imported raw keys are not supported yet)"
      );
    }

    const sensitive = await this.accounts.getSensitive(secretHolder.id);
    const data =
      await this.vaultService.reveal<SensitiveAccountStoreData>(sensitive);
    if (!data?.text) {
      throw new Error(`Key for ${secretHolder.address} not found!`);
    }

    return {
      seed: await mnemonicToSeed(data.text, data.passphrase),
      hdIndex: record.path.account,
    };
  }

  // Store validated mnemonic, private key, or spending key. Addresses and the
  // viewing key were derived OFFLINE in the setup tab by the wallet façade.
  public async storeAccountSecret(input: {
    accountSecret: AccountSecret;
    alias: string;
    flow: AccountFlow;
    path: Bip44Path;
    transparentAddress: string;
    shieldedAddress: string;
    viewingKey: string;
    birthday: number;
  }): Promise<AccountStore> {
    await this.vaultService.assertIsUnlocked();

    const { accountSecret, alias, flow, path } = input;
    const source: AccountSource = flow === "create" ? "generated" : "imported";
    const timestamp = source === "generated" ? new Date().getTime() : 0;

    // Sensitive-data encoding: phrase / private key hex / `{"spendingKey": …}` JSON.
    const { text, passphrase, accountType } = ((): {
      text: string;
      passphrase: string;
      accountType: AccountType;
    } => {
      switch (accountSecret.t) {
        case "Mnemonic":
          return {
            text: accountSecret.seedPhrase.join(" "),
            passphrase: accountSecret.passphrase,
            accountType: "mnemonic",
          };
        case "PrivateKey":
          return {
            text: accountSecret.privateKey,
            passphrase: "",
            accountType: "private-key",
          };
        case "ShieldedKeys":
          return {
            text: JSON.stringify({ spendingKey: accountSecret.spendingKey }),
            passphrase: "",
            accountType: "shielded-keys",
          };
      }
    })();

    // Field semantics:
    // - address: shielded receiver for a spending-key import, else transparent
    // - owner:   viewing key (UFVK) for a spending-key import, else the address
    const address =
      accountType === "shielded-keys"
        ? input.shieldedAddress
        : input.transparentAddress;
    const owner =
      accountType === "shielded-keys" ? input.viewingKey : address;

    // Compute the seed fingerprint for mnemonic accounts so the app can call
    // create_account_ufvk (needs fingerprint + hdIndex to embed zip32_derivation
    // in the PCZT, enabling the extension to sign). Non-mnemonic accounts have
    // no seed, so the fingerprint is stored as an empty string.
    let seedFingerprint: string;
    if (accountType === "mnemonic") {
      await initZillionsSdk();
      const seed = await mnemonicToSeed(text, passphrase);
      seedFingerprint = computeSeedFingerprint(seed);
    } else {
      seedFingerprint = "";
    }

    // Random, so nothing secret (the phrase or key in `text`) feeds an id that
    // dapps and the popup routes see.
    const id = uuidv4();

    const accountStore: KeyStoreType = {
      id,
      alias,
      address,
      owner,
      path,
      type: accountType as KeyStoreType["type"],
      source,
      timestamp,
      seedFingerprint,
      birthday: input.birthday,
    };

    // Check whether keys already exist for this account
    const account = await this.accounts.findByAddress(address);
    if (account) {
      throw new Error(
        `Keys for ${truncateInMiddle(address, 5, 8)} already imported!`
      );
    }

    const sensitiveData: SensitiveAccountStoreData = { text, passphrase };
    const sensitive =
      await this.vaultService.encryptSensitiveData(sensitiveData);

    await this.accounts.add({
      public: accountStore,
      sensitive,
    });
    await this.accounts.setActiveAccount(id, accountType);

    return {
      id,
      alias,
      address,
      owner,
      type: accountType,
      path,
      source,
      timestamp,
    };
  }

  /**
   * Store a hardware-wallet account and make it active. The keys never
   * leave the device (hardware) or derive per ceremony (passkey PRF) —
   * every device record's `sensitive` is an encrypted empty payload. A
   * device that's already imported is re-activated instead.
   */
  public async storeDeviceAccount(input: {
    device: DeviceKind;
    alias: string;
    bip44Path: Bip44Path;
    zip32Path: Zip32Path;
    transparentAddress?: string;
    shieldedAddress?: string;
    viewingKey: string;
    seedFingerprint: string;
    birthday: number;
    /** A passkey's WebAuthn credential; other devices carry none. */
    credential?: DeviceCredential;
  }): Promise<{
    parentAccount: AccountStore;
    shieldedAccount?: DerivedAccount;
    alreadyImported: boolean;
  }> {
    await this.vaultService.assertIsUnlocked();

    // Every device account names a shielded side; its keys may have no
    // transparent receiver, and the unified address identifies the
    // account then.
    const shieldedAddress = input.shieldedAddress;
    if (!shieldedAddress) {
      throw new Error("Device did not provide its addresses");
    }
    const address = input.transparentAddress ?? shieldedAddress;

    const existing = await this.accounts.findByAddress(address);
    if (existing) {
      const parent = existing.parentId
        ? await this.accounts.findById(existing.parentId)
        : existing;
      if (!parent) {
        throw new Error(`Parent account not found: ${existing.parentId}`);
      }
      const child = (await this.accounts.findAll()).find(
        (a) => a.parentId === parent.id
      );
      await this.accounts.setActiveAccount(
        parent.id,
        parent.type as AccountType
      );
      return {
        parentAccount: toAccountStore(parent),
        shieldedAccount: child && {
          id: child.id,
          alias: child.alias,
          address: child.address,
          type: child.type as AccountType,
          device: deviceOf(child),
          parentId: child.parentId,
        },
        alreadyImported: true,
      };
    }

    // A Ledger parent keeps the legacy `"ledger"` type; a device that only
    // exports a viewing key parents a `"viewing-key"` account.
    const parentType: AccountType =
      input.device === "ledger" ? "ledger" : "viewing-key";
    const id = uuidv4();
    const accountStore: KeyStoreType = {
      id,
      alias: input.alias,
      address,
      owner: address,
      path: input.bip44Path,
      type: parentType as KeyStoreType["type"],
      device: input.device,
      source: "imported",
      timestamp: 0,
      seedFingerprint: input.seedFingerprint,
      birthday: input.birthday,
      // A passkey's at-rest credential (its id, RP and COSE public key —
      // no secret); other devices carry none.
      ...(input.credential && { credential: input.credential }),
    };
    const sensitive = await this.vaultService.encryptSensitiveData({
      // A device account carries no secret: its keys stay on the device
      // (hardware) or derive per ceremony (passkey PRF). The vault's
      // sensitive payload is still the record's shape, so it stores empty.
      text: "",
      passphrase: "",
    });
    await this.accounts.add({ public: accountStore, sensitive });

    const shieldedAccount = await this.deriveShieldedAccount({
      parentId: id,
      alias: input.alias,
      path: input.zip32Path,
      source: "imported",
      shieldedAddress,
      viewingKey: input.viewingKey,
      birthday: input.birthday,
      device: input.device,
    });
    await this.accounts.setActiveAccount(id, parentType);

    return {
      parentAccount: toAccountStore(accountStore),
      shieldedAccount,
      alreadyImported: false,
    };
  }

  /**
   * Persist the derived (child) shielded account under a parent.
   *
   * The background cannot derive the spending key (derivation lives in the
   * page façade), so the record is public-only: `sensitive` is an encrypted
   * empty payload. The spending key stays re-derivable from the parent's
   * encrypted secret — consumers revealing this record's sensitive data must
   * treat an empty `text` as "no secret here" and go via the parent instead.
   */
  public async deriveShieldedAccount(input: {
    parentId: string;
    alias: string;
    path: Zip32Path;
    source: AccountSource;
    shieldedAddress: string;
    viewingKey: string;
    birthday: number;
    device?: DeviceKind;
  }): Promise<DerivedAccount> {
    await this.vaultService.assertIsUnlocked();

    const parent = await this.accounts.findById(input.parentId);
    if (!parent) {
      throw new Error(`Parent account not found: ${input.parentId}`);
    }

    // Check whether keys already exist for this account
    const existing = await this.accounts.findByAddress(input.shieldedAddress);
    if (existing) {
      throw new Error(
        `Keys for ${truncateInMiddle(input.shieldedAddress, 5, 8)} already imported!`
      );
    }

    const id = generateId(
      UUID_NAMESPACE,
      "shielded-account",
      parent.id,
      input.path.account
    );
    const timestamp = input.source === "generated" ? new Date().getTime() : 0;

    const account: KeyStoreType = {
      id,
      alias: input.alias,
      address: input.shieldedAddress,
      owner: input.viewingKey,
      path: input.path,
      parentId: parent.id,
      type: "shielded-keys" as KeyStoreType["type"],
      device: input.device,
      source: input.source,
      timestamp,
      seedFingerprint: parent.seedFingerprint,
      birthday: input.birthday,
    };

    const sensitive = await this.vaultService.encryptSensitiveData({
      text: "",
      passphrase: "",
    });
    await this.accounts.add({
      public: account,
      sensitive,
    });

    return {
      id,
      alias: account.alias,
      address: account.address,
      type: "shielded-keys",
      device: input.device,
      parentId: account.parentId,
    };
  }
}
