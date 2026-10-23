import { truncateInMiddle } from "@zillions/utils";
import { v4 as uuidv4 } from "uuid";

import type {
  AccountFlow,
  AccountSecret,
  AccountStore,
  AccountType,
  Bip44Path,
  DerivedAccount,
  LedgerSignatures,
  MnemonicValidation,
  Zip32Path,
} from "../../ipc/contract";
import { KeyStoreType } from "../../storage";
import { generateId } from "../../utils/id";
import {
  generateMnemonic,
  mnemonicToSeed,
  PhraseSize,
  validateMnemonic,
} from "../crypto/mnemonic";
import {
  applyLedgerSignatures,
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
import { AccountSource, SensitiveAccountStoreData } from "./types";

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
   * Ledger account's device signed in the approval tab; its
   * `ledgerSignatures` go into the PCZT here.
   */
  public async sign(
    pczt: string,
    signer?: string,
    ledgerSignatures?: LedgerSignatures
  ): Promise<string> {
    await this.vaultService.assertIsUnlocked();
    await initZillionsSdk();

    const record = await this.signingAccount(signer);
    if (await this.ledgerAccount(record)) {
      if (!ledgerSignatures) {
        throw new Error("A Ledger account signs on its device");
      }
      return applyLedgerSignatures(pczt, ledgerSignatures);
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
   * from its seed, or for a Ledger account the one the device exported:
   * what the approval summary checks outputs against.
   */
  public async viewingKey(signer?: string): Promise<string> {
    await this.vaultService.assertIsUnlocked();

    const record = await this.signingAccount(signer);
    const ledger = await this.ledgerAccount(record);
    if (ledger) return ledger.ufvk;
    const { seed, hdIndex } = await this.resolveSeed(record);
    return (await deriveAccount(seed, hdIndex)).ufvk;
  }

  /** The `signer` address's ZIP-32 index if a Ledger holds its keys. */
  public async ledgerHdIndex(signer?: string): Promise<number | undefined> {
    const record = await this.signingAccount(signer);
    return (await this.ledgerAccount(record))?.hdIndex;
  }

  /**
   * A Ledger account's stored UFVK and ZIP-32 index, both on its shielded
   * child, whichever of the pair `record` is; undefined for other accounts.
   */
  private async ledgerAccount(
    record: KeyStoreType
  ): Promise<{ ufvk: string; hdIndex: number } | undefined> {
    const parent = record.parentId
      ? await this.accounts.findById(record.parentId)
      : record;
    if ((parent?.type as string) !== "ledger") return undefined;
    const child = record.parentId
      ? record
      : (await this.accounts.findAll()).find((r) => r.parentId === record.id);
    if (!child) {
      throw new Error(`Shielded account of ${record.address} not found`);
    }
    return { ufvk: child.owner, hdIndex: child.path.account };
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

    const { seed, hdIndex } = await this.resolveSeed(record);
    return spendingKeys(seed, hdIndex);
  }

  /**
   * Resolve the BIP-39 seed + ZIP-32 account index backing an account record,
   * walking a derived shielded child to its mnemonic parent (children hold no
   * secret of their own). The hd index is the resolved record's own
   * `path.account`. Only mnemonic-rooted accounts are supported — raw
   * private-key / spending-key imports are not implemented in setup yet.
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
    if ((secretHolder.type as string) === "ledger") {
      throw new Error("A Ledger account's keys never leave the device");
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
   * Store a Ledger account and make it active. The keys never leave the
   * device, so like a derived child the record's `sensitive` is an encrypted
   * empty payload. A Ledger that's already imported is re-activated instead.
   */
  public async storeLedgerAccount(input: {
    alias: string;
    bip44Path: Bip44Path;
    zip32Path: Zip32Path;
    transparentAddress: string;
    shieldedAddress: string;
    viewingKey: string;
    birthday: number;
  }): Promise<{
    parentAccount: AccountStore;
    shieldedAccount?: DerivedAccount;
    alreadyImported: boolean;
  }> {
    await this.vaultService.assertIsUnlocked();

    const existing = await this.accounts.findByAddress(
      input.transparentAddress
    );
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
          parentId: child.parentId,
        },
        alreadyImported: true,
      };
    }

    const id = uuidv4();
    const accountStore: KeyStoreType = {
      id,
      alias: input.alias,
      address: input.transparentAddress,
      owner: input.transparentAddress,
      path: input.bip44Path,
      type: "ledger" as KeyStoreType["type"],
      source: "imported",
      timestamp: 0,
      // The device never reveals its seed's. The app's PCZT needs 32 bytes and
      // the device doesn't check them: zeros, the signer kit's default.
      seedFingerprint: "00".repeat(32),
      birthday: input.birthday,
    };
    const sensitive = await this.vaultService.encryptSensitiveData({
      text: "",
      passphrase: "",
    });
    await this.accounts.add({ public: accountStore, sensitive });

    const shieldedAccount = await this.deriveShieldedAccount({
      parentId: id,
      alias: input.alias,
      path: input.zip32Path,
      source: "imported",
      shieldedAddress: input.shieldedAddress,
      viewingKey: input.viewingKey,
      birthday: input.birthday,
    });
    await this.accounts.setActiveAccount(id, "ledger");

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
      parentId: account.parentId,
    };
  }
}
