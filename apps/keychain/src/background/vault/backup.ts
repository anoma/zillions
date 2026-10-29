/**
 * Encrypted backups: every account record with its secret, sealed under a
 * password, as a file the user keeps. Restoring adds the accounts back with
 * their ids and birthdays, so the app picks up where it left off.
 */
import * as E from "fp-ts/Either";
import * as t from "io-ts";

import type { BackupSummary } from "../../ipc/contract";
import { KeyStore, type KeyStoreType } from "../../storage";
import { KdfType, type CryptoRecord } from "../crypto/crypto";
import { getNetwork } from "../crypto/zillions";
import type { SensitiveAccountStoreData } from "../keyring/types";
import type { AccountRepository } from "./accounts";
import type { VaultService } from "./service";
import type { ActiveAccountStore } from "./types";

const BACKUP_KIND = "zillions-keychain-backup";
const BACKUP_VERSION = 1;

const BackupFile = t.type({
  kind: t.literal(BACKUP_KIND),
  version: t.literal(BACKUP_VERSION),
  network: t.keyof({ main: null, test: null }),
  createdAt: t.number,
  sealed: t.type({
    iv: t.string,
    text: t.string,
    kdf: t.type({
      type: t.literal(KdfType.Argon2),
      params: t.type({
        m_cost: t.number,
        t_cost: t.number,
        p_cost: t.number,
        salt: t.string,
      }),
    }),
  }),
});
type BackupFileType = t.TypeOf<typeof BackupFile>;

const Payload = t.intersection([
  t.type({
    accounts: t.array(
      t.type({
        public: KeyStore,
        secret: t.intersection([
          t.type({ text: t.string }),
          t.partial({ passphrase: t.string }),
        ]),
      })
    ),
  }),
  t.partial({ activeAccountId: t.string }),
]);
type PayloadType = t.TypeOf<typeof Payload>;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const NETWORK_LABEL = { main: "mainnet", test: "testnet" } as const;

export class BackupService {
  constructor(
    private readonly vaultService: VaultService,
    private readonly accounts: AccountRepository
  ) {}

  /** The backup file's JSON, sealed under the extension password. */
  async export(password: string): Promise<string> {
    await this.vaultService.assertIsUnlocked();
    if (!(await this.vaultService.checkPassword(password))) {
      throw new Error("Incorrect password");
    }

    const records = await this.accounts.findAll();
    const payload: PayloadType = {
      accounts: await Promise.all(
        records.map(async (record) => ({
          public: record,
          secret: (await this.vaultService.reveal<SensitiveAccountStoreData>(
            await this.accounts.getSensitive(record.id)
          )) ?? { text: "" },
        }))
      ),
      activeAccountId: (await this.accounts.getActiveAccount())?.id,
    };

    const { cipher, kdf } = await this.vaultService.encryptSensitiveData(
      payload,
      password
    );
    const file: BackupFileType = {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      network: getNetwork(),
      createdAt: Date.now(),
      sealed: {
        iv: toBase64(cipher.iv),
        text: toBase64(cipher.text),
        kdf: { type: KdfType.Argon2, params: kdf.params },
      },
    };
    return JSON.stringify(file);
  }

  /** How many accounts the file holds, once it opens with `password`. */
  async inspect(file: string, password: string): Promise<number> {
    const payload = await this.open(file, password);
    return payload.accounts.filter((a) => !a.public.parentId).length;
  }

  /**
   * Adds the backup's accounts to the vault; ones already here are skipped.
   * The backup's active account becomes the active one.
   */
  async restore(file: string, password: string): Promise<BackupSummary> {
    await this.vaultService.assertIsUnlocked();
    const payload = await this.open(file, password);

    // Parents first: a child is only restored under a parent that was.
    const ordered = [...payload.accounts].sort(
      (a, b) => Number(!!a.public.parentId) - Number(!!b.public.parentId)
    );
    const restored: KeyStoreType[] = [];
    let skipped = 0;
    for (const { public: record, secret } of ordered) {
      const parentRestored =
        !record.parentId || restored.some((r) => r.id === record.parentId);
      const exists =
        (await this.accounts.findById(record.id)) ||
        (await this.accounts.findByAddress(record.address));
      if (!parentRestored || exists) {
        if (!record.parentId) skipped++;
        continue;
      }
      await this.accounts.add({
        public: record,
        sensitive: await this.vaultService.encryptSensitiveData(secret),
      });
      restored.push(record);
    }

    const parents = restored.filter((r) => !r.parentId);
    const active =
      parents.find((r) => r.id === payload.activeAccountId) ?? parents[0];
    if (active) {
      await this.accounts.setActiveAccount(
        active.id,
        active.type as ActiveAccountStore["type"]
      );
    }
    return { accounts: parents.length, skipped };
  }

  private async open(file: string, password: string): Promise<PayloadType> {
    let decoded: E.Either<t.Errors, BackupFileType>;
    try {
      decoded = BackupFile.decode(JSON.parse(file));
    } catch {
      decoded = E.left([]);
    }
    if (E.isLeft(decoded)) {
      throw new Error("This isn't a Zillions Keychain backup file");
    }
    const { network, sealed } = decoded.right;
    if (network !== getNetwork()) {
      throw new Error(
        `This backup is for ${NETWORK_LABEL[network]}, but this Keychain uses ${NETWORK_LABEL[getNetwork()]}`
      );
    }

    const record: CryptoRecord = {
      cipher: {
        type: "aes-256-gcm",
        iv: fromBase64(sealed.iv),
        text: fromBase64(sealed.text),
      },
      kdf: sealed.kdf,
    };
    let payload: unknown;
    try {
      payload = await this.vaultService.revealWithPassword(record, password);
    } catch {
      throw new Error("Incorrect password for this backup");
    }
    const checked = Payload.decode(payload);
    if (E.isLeft(checked)) {
      throw new Error("This backup's contents are damaged");
    }
    return checked.right;
  }
}
