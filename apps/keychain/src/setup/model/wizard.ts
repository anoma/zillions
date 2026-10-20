/**
 * Setup wizard state machine.
 *
 * All transient wizard state lives in one typed object, mutated only via typed
 * events through the reducer. The rendered step is derived from `state.step`.
 *
 * Scope: create + import flows only (no Ledger).
 */
import type {
  AccountStore,
  Bip44Path,
  DerivedAccount,
  Zip32Path,
} from "../../ipc/contract";
import type { MnemonicLength, SecretKind } from "./secrets";

/** Which onboarding branch the user is in. */
export type Flow = "none" | "create" | "import" | "keystone";

/** The discrete steps. `start` is the landing choice. */
export type Step =
  // shared
  | "start"
  // create branch
  | "create.warning"
  | "create.seed"
  | "create.confirm"
  | "create.name"
  | "create.complete"
  // import branch
  | "import.secret"
  | "import.name"
  | "import.complete";

/** Async persistence status for the final "complete" step. */
export type CompletionStatus = "idle" | "pending" | "done" | "failed";

export type WizardState = {
  flow: Flow;
  step: Step;

  // --- account identity ---
  alias: string;
  password?: string;
  /** Whether a password must be set (no vault password yet). */
  passwordRequired: boolean;

  // --- secret material (create writes mnemonic; import writes per-kind) ---
  secretKind: SecretKind;
  mnemonic: string[];
  mnemonicLength: MnemonicLength;
  privateKey: string;
  spendingKey: string;
  bip39Passphrase: string;

  // --- derivation paths ---
  bip44Path: Bip44Path;
  zip32Path: Zip32Path;

  /** Block height at account creation/import. undefined = auto-fetch chain tip. */
  birthday: number | undefined;

  // --- persistence results ---
  completion: CompletionStatus;
  completionInfo: string;
  parentAccount?: AccountStore;
  shieldedAccount?: DerivedAccount;
};

export const initialWizardState = (passwordRequired: boolean): WizardState => ({
  flow: "none",
  step: "start",
  alias: "",
  password: undefined,
  passwordRequired,
  secretKind: "mnemonic",
  mnemonic: [],
  mnemonicLength: 12,
  privateKey: "",
  spendingKey: "",
  bip39Passphrase: "",
  bip44Path: { account: 0, change: 0, index: 0 },
  zip32Path: { account: 0 },
  birthday: undefined,
  seedFingerprint: "",
  completion: "idle",
  completionInfo: "",
});

/** Typed events. Steps dispatch these; no direct setter access. */
export type WizardEvent =
  | { type: "passwordRequirementResolved"; required: boolean }
  | { type: "chooseFlow"; flow: Extract<Flow, "create" | "import"> }
  | { type: "goToStep"; step: Step }
  | { type: "setMnemonic"; mnemonic: string[] }
  | { type: "setMnemonicLength"; length: MnemonicLength }
  | { type: "setSecretKind"; kind: SecretKind }
  | { type: "setPrivateKey"; value: string }
  | { type: "setSpendingKey"; value: string }
  | { type: "setViewingKey"; value: string }
  | { type: "setBirthday"; birthday: number | undefined }
  | { type: "setBip39Passphrase"; value: string }
  | { type: "setBip44Path"; path: Bip44Path }
  | { type: "setZip32Path"; path: Zip32Path }
  | { type: "setAlias"; alias: string }
  | { type: "setPassword"; password: string | undefined }
  | { type: "setSeedFingerprint"; value: string }
  | { type: "completionStarted"; info: string }
  | { type: "completionInfo"; info: string }
  | {
      type: "completionSucceeded";
      parentAccount?: AccountStore;
      shieldedAccount?: DerivedAccount;
    }
  | { type: "completionFailed"; info: string }
  | { type: "reset" };

export const wizardReducer = (
  state: WizardState,
  event: WizardEvent
): WizardState => {
  switch (event.type) {
    case "passwordRequirementResolved":
      return { ...state, passwordRequired: event.required };

    case "chooseFlow":
      return {
        ...state,
        flow: event.flow,
        step: event.flow === "create" ? "create.warning" : event.flow === "keystone" ? "keystone.import" : "import.secret",
        // Create: auto-fetch chain tip (new account has no prior history).
        // Import: default to 0; the SDK clamps any height at or below Sapling
        // activation to an empty tree, so this scans from the start of the
        // shielded chain without a server round-trip.
        birthday: event.flow === "create" ? undefined : 0,
      };

    case "goToStep":
      return { ...state, step: event.step };

    case "setMnemonic":
      return { ...state, mnemonic: event.mnemonic };

    case "setMnemonicLength":
      return { ...state, mnemonicLength: event.length };

    case "setSecretKind":
      return { ...state, secretKind: event.kind };

    case "setPrivateKey":
      return { ...state, privateKey: event.value };

    case "setSpendingKey":
      return { ...state, spendingKey: event.value };

    case "setBirthday":
      return { ...state, birthday: event.birthday };

    case "setBip39Passphrase":
      return { ...state, bip39Passphrase: event.value };

    case "setBip44Path":
      return { ...state, bip44Path: event.path };

    case "setZip32Path":
      return { ...state, zip32Path: event.path };

    case "setAlias":
      return { ...state, alias: event.alias };

    case "setViewingKey":
      return { ...state, viewingKey: event.value };
  
    case "setPassword":
      return { ...state, password: event.password };

    case "setSeedFingerprint":
      return { ...state, seedFingerprint: event.value };

    case "completionStarted":
      return { ...state, completion: "pending", completionInfo: event.info };

    case "completionInfo":
      return { ...state, completionInfo: event.info };

    case "completionSucceeded":
      return {
        ...state,
        completion: "done",
        completionInfo: "Done!",
        parentAccount: event.parentAccount ?? state.parentAccount,
        shieldedAccount: event.shieldedAccount ?? state.shieldedAccount,
      };

    case "completionFailed":
      return { ...state, completion: "failed", completionInfo: event.info };

    case "reset":
      return initialWizardState(state.passwordRequired);

    default: {
      const _never: never = event;
      return _never;
    }
  }
};
