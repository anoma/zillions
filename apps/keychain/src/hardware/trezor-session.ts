/**
 * The Trezor session: drives `@trezor/connect-core` over WebUSB. The device
 * picker is the browser's own (`navigator.usb.requestDevice`, inside a user
 * gesture); everything the firmware asks of the host — PIN, passphrase, THP
 * pairing — is answered here, so no Suite handoff and no page the device's
 * data leaks to. Pages only: pulls in the transport.
 */
import TrezorConnect, {
  UI_REQUEST,
  UI_REQUESTS,
  UI_RESPONSE,
} from "@trezor/connect-core";
import { WebUsbTransport } from "@trezor/transport-web";

import {
  deriveAccountFromUfvk,
  getNetwork,
  initZillionsSdk,
  trezorTransaction,
  ufvkFromTransparentXpub,
} from "../background/crypto/zillions";
import { ZILLIONS_SITE_URL } from "../popup/links";
import type { DeviceKeys, DeviceProgressStep } from "./types";

/** The steps a Trezor waits on, in the order a session meets them. */
export type TrezorStep = "connect" | "pair" | "unlock" | "confirm-key" | "sign";

export const TREZOR_STEPS: Record<TrezorStep, DeviceProgressStep> = {
  connect: {
    key: "connect",
    title: "Connect your Trezor",
    hint: "Plug it in and choose it when your browser asks.",
  },
  pair: {
    key: "pair",
    title: "Pair the Keychain",
    hint: "The device shows a one-time code — confirm it on the Trezor.",
  },
  unlock: {
    key: "unlock",
    title: "Unlock your Trezor",
    hint: "Type your PIN by the positions the device's screen shows.",
  },
  "confirm-key": {
    key: "confirm-key",
    title: "Export the account key",
    hint: "Confirm the public key export on the Trezor.",
  },
  sign: {
    key: "sign",
    title: "Confirm the transaction",
    hint: "Check the amounts and fee, then confirm on the Trezor.",
  },
};

/** The USB devices a Trezor presents, as connect's own transport matches
 * them (`@trezor/transport-common`'s TREZOR_USB_DESCRIPTORS, inlined here —
 * only connect-core and transport-web are dependencies). */
const TREZOR_USB_DEVICES = [
  { vendorId: 0x534c, productId: 0x0001 },
  { vendorId: 0x1209, productId: 0x53c0 },
  { vendorId: 0x1209, productId: 0x53c1 },
];

/** The WebUSB surface a Trezor needs. Chrome-only, and typed locally: the
 * DOM lib this project compiles against predates it. */
interface TrezorUsb {
  requestDevice(options: {
    filters: { vendorId: number; productId?: number }[];
  }): Promise<unknown>;
}

/** The granted-device picker, or an error naming the browser gap. */
const trezorUsb = (): TrezorUsb => {
  const { usb } = navigator as Navigator & { usb?: TrezorUsb };
  if (!usb) {
    throw new Error(
      "This browser can't reach a Trezor over WebUSB. Use Chrome."
    );
  }
  return usb;
};

const coin = (): "zec" | "taz" => (getNetwork() === "test" ? "taz" : "zec");

const MODEL_NAMES: Record<string, string> = {
  T1B1: "Trezor One",
  T2T1: "Trezor Model T",
  T2B1: "Trezor Safe 3",
  T3B1: "Trezor Safe 3",
  T3T1: "Trezor Safe 5",
  T3W1: "Trezor Safe 7",
};

/** What the device waits on from the host: its PIN pad, the THP pairing, or nothing. */
export type TrezorUiRequest =
  | { kind: "pin" }
  | { kind: "pair" }
  | { kind: "idle" };

type UiListener = (request: TrezorUiRequest) => void;
const uiListeners = new Set<UiListener>();
const notifyUi = (request: TrezorUiRequest): void => {
  for (const listener of uiListeners) listener(request);
};

/** Watch what the device waits on; returns the unsubscribe. */
export const onTrezorUiRequest = (listener: UiListener): (() => void) => {
  uiListeners.add(listener);
  return () => {
    uiListeners.delete(listener);
  };
};

/** The PIN the user typed at the device's matrix, by position. */
export const submitTrezorPin = (pin: string): void => {
  notifyUi({ kind: "idle" });
  TrezorConnect.uiResponse({ type: UI_RESPONSE.RECEIVE_PIN, payload: pin });
};

let init: Promise<void> | undefined;

/** Bring the transport up once; a cancelled ceremony reconnects next time. */
const initTrezor = (): Promise<void> => {
  init ??= TrezorConnect.init({
    manifest: {
      appName: "Zillions Keychain",
      appUrl: ZILLIONS_SITE_URL,
      email: "support@zillions.money",
    },
    // connect-core and transport-web carry two copies of the transport
    // classes: they agree at runtime, only their type identities differ.
    transports: [
      new WebUsbTransport({
        id: "zillions-trezor",
      }) as unknown as Parameters<
        typeof TrezorConnect.init
      >[0]["transports"] extends (infer T)[] | undefined
        ? NonNullable<T>
        : never,
    ],
  });
  return init;
};

const resetTrezor = (): void => {
  init = undefined;
};

/** Answer every UI request the ceremony meets. Registered once, at init. */
let answering = false;
const answerUiRequests = (): void => {
  if (answering) return;
  answering = true;
  TrezorConnect.on(UI_REQUEST, (event) => {
    switch (event.type) {
      // The device wants its PIN typed: the view's pad takes it.
      case UI_REQUESTS.REQUEST_PIN:
        notifyUi({ kind: "pin" });
        break;
      // A passphrase would hide the account entirely; the account model
      // here is the device's plain one, so it stays on the device and empty.
      case UI_REQUESTS.REQUEST_PASSPHRASE:
        TrezorConnect.uiResponse({
          type: UI_RESPONSE.RECEIVE_PASSPHRASE,
          payload: { value: "", passphraseOnDevice: true },
        });
        break;
      // Connect's own "are you sure" prompts: the device screen is what the
      // user checks, so nothing waits on a host answer here.
      case UI_REQUESTS.REQUEST_CONFIRMATION:
        TrezorConnect.uiResponse({
          type: UI_RESPONSE.RECEIVE_CONFIRMATION,
          payload: true,
        });
        break;
      // THP pairing: the only host answer is which way to pair; the code
      // itself the device shows and confirms on its own screen.
      case UI_REQUESTS.REQUEST_THP_PAIRING_TAG: {
        const [method] = event.payload?.availableMethods ?? [];
        if (method) {
          TrezorConnect.uiResponse({
            type: UI_RESPONSE.RECEIVE_THP_PAIRING_TAG,
            payload: { selectedMethod: method },
          });
        }
        notifyUi({ kind: "pair" });
        break;
      }
    }
  });
};

/**
 * Connect's calls answer `{ success, payload }` and failures carry the
 * error in `error` — the engine's describeError speaks its codes.
 */
const call = async <T>(
  promise: Promise<
    { success: true; payload: T } | { success: false; error: unknown }
  >
): Promise<T> => {
  const response = await promise;
  if (!response.success) throw response.error;
  return response.payload;
};

/**
 * Run `run` against a connected Trezor; rejects if `signal` aborts. The
 * transport reaches only devices the user granted this origin, and the
 * picker is up to the caller: the setup tab asks for a device first, a
 * signing ceremony goes straight to the one granted.
 */
const withTrezor = async <T>(
  run: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  answerUiRequests();
  const aborted = new Promise<never>((_, reject) =>
    signal?.addEventListener("abort", () => {
      TrezorConnect.cancel();
      reject(new Error("Trezor request was cancelled"));
    })
  );
  try {
    return await Promise.race([initTrezor().then(run), aborted]);
  } catch (e) {
    resetTrezor();
    throw e;
  }
};

/** The account's keys, as the device exports them: transparent only. */
export const connectTrezor = async (
  onStep: (step: TrezorStep) => void,
  signal?: AbortSignal
): Promise<DeviceKeys> => {
  onStep("connect");
  // The grant must happen inside the user's gesture; a lost one throws and
  // the view's retry button (a fresh gesture) picks it up.
  await trezorUsb().requestDevice({ filters: TREZOR_USB_DEVICES });
  return withTrezor(async () => {
    const features = await call<{ internal_model?: string }>(
      TrezorConnect.getFeatures()
    );
    onStep("confirm-key");
    const { xpub } = await call<{ xpub: string }>(
      TrezorConnect.getPublicKey({
        path: "m/44'/133'/0'",
        coin: coin(),
        showOnTrezor: true,
      })
    );
    const ufvk = await ufvkFromTransparentXpub(xpub);
    const keys = await deriveAccountFromUfvk(ufvk);
    return {
      device: "trezor",
      alias: MODEL_NAMES[features.internal_model ?? ""] ?? "Trezor",
      transparentAddress: keys.transparent,
      shieldedAddress: keys.unified,
      viewingKey: ufvk,
      // The device never reveals its seed's fingerprint. The app's PCZT
      // needs 32 bytes and the device doesn't check them: zeros, like the
      // Ledger's.
      seedFingerprint: "00".repeat(32),
      hdIndex: 0,
    };
  }, signal);
};

/**
 * The device's transparent signatures over `pczt` (base64), hex, one per
 * input — the keychain applies them by the Ledger engine's apply.
 */
export const signTrezorPczt = async (
  pczt: string,
  onStep: (step: TrezorStep) => void,
  signal?: AbortSignal
): Promise<{ transparent: string[] }> => {
  onStep("connect");
  return withTrezor(async () => {
    await initZillionsSdk();
    onStep("sign");
    const transaction = await trezorTransaction(pczt);
    const signed = await call<{ signatures: string[] }>(
      TrezorConnect.signTransaction(
        transaction as Parameters<typeof TrezorConnect.signTransaction>[0]
      )
    );
    return { transparent: signed.signatures };
  }, signal);
};
