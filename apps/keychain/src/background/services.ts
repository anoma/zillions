/**
 * Background service singletons. `getServices()` lazily constructs the
 * vault/keyring stack exactly once: stores → VaultService
 * (initialize creates or migrates the persisted vault) → Keyring.
 *
 * The vault lives in IndexedDB (structured clone keeps the encrypted
 * `Uint8Array`s intact); the unlocked password hash lives in
 * `browser.storage.session`.
 */
import {
  ExtensionKVStore,
  IndexedDBKVStore,
  SessionKVStore,
} from "@zillions/storage";
import browser from "webextension-polyfill";

import { LocalStorage, VaultStorage } from "../storage";
import { ApprovalLog, ApprovalsService } from "./approvals";
import { Broadcaster } from "./broadcaster";
import { Keyring } from "./keyring";
import { AccountRepository, UtilityStore, VaultService } from "./vault";

// Key prefixes for the backing stores.
const PREFIX_INDEXEDDB = "Zillions::IndexedDB";
const PREFIX_UTILITY = "Zillions::Utility";
const PREFIX_SESSION = "Zillions::SessionStorage";
const PREFIX_LOCALSTORAGE = "Zillions::LocalStorage";
const PREFIX_APPROVAL_LOG = "Zillions::ApprovalLog";

export type Services = {
  vaultService: VaultService;
  keyring: Keyring;
  // The account-record repository, exposed for read/query handlers (list,
  // active-account) that are storage concerns rather than key semantics.
  accounts: AccountRepository;
  approvals: ApprovalsService;
  approvalLog: ApprovalLog;
  localStorage: LocalStorage;
  /** Broadcasts wallet state changes to connected dapp tabs. */
  broadcaster: Broadcaster;
};

let services: Promise<Services> | undefined;

export const getServices = (): Promise<Services> => {
  if (!services) {
    services = (async () => {
      const vaultStorage = new VaultStorage(
        new IndexedDBKVStore(PREFIX_INDEXEDDB)
      );
      const sessionStore = new SessionKVStore(PREFIX_SESSION);
      const utilityStore = new IndexedDBKVStore<UtilityStore>(PREFIX_UTILITY);

      const vaultService = new VaultService(vaultStorage, sessionStore);
      await vaultService.initialize();

      const accounts = new AccountRepository(vaultStorage, utilityStore);
      // Before any site can read an account. A failure only leaves the old
      // placeholders, which must not take the Keychain down with it.
      await accounts.replacePlaceholderFingerprints().catch(console.error);
      const keyring = new Keyring(vaultService, accounts);

      const area = browser.storage.local;
      const localStorage = new LocalStorage(
        new ExtensionKVStore(PREFIX_LOCALSTORAGE, {
          get: area.get.bind(area),
          set: area.set.bind(area),
        })
      );
      if (await vaultService.passwordInitialized()) {
        await localStorage.noteVaultCreated();
      } else {
        await localStorage.noteVaultMissing();
      }
      // IndexedDB: the encrypted log holds Uint8Arrays, which
      // `storage.local` would not round-trip.
      const approvalLog = new ApprovalLog(
        new IndexedDBKVStore(PREFIX_APPROVAL_LOG),
        vaultService
      );
      const approvals = new ApprovalsService(
        localStorage,
        vaultService,
        accounts,
        keyring,
        approvalLog
      );
      const broadcaster = new Broadcaster(localStorage);

      return {
        vaultService,
        keyring,
        accounts,
        approvals,
        approvalLog,
        localStorage,
        broadcaster,
      };
    })();
  }
  return services;
};
