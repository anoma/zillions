/**
 * Background IPC server (counterpart to `ipc/client.ts`): receives typed
 * envelopes on `runtime.onMessage`, dispatches to the matching handler, and
 * replies with an `IpcResult`. Errors are caught and serialized so the UI's
 * `BackgroundClient` can rethrow a real `Error` with the original message/stack.
 *
 * SECURITY: every envelope is classified by its `sender` before dispatch.
 * Extension pages (popup/setup/approvals) may use every channel; content
 * scripts — i.e. web pages — may ONLY use `dapp/*` channels, and their origin
 * is taken from the sender, never the payload. Unknown senders are refused.
 */
import browser, { type Runtime } from "webextension-polyfill";

import type { IpcKind, IpcMessage, IpcResult } from "../ipc/contract";
import { handlers, TRUSTED_SENDER, type IpcSenderContext } from "./handlers";

/** Dispatch a single envelope. Exported for in-process use (mock/tests). */
export const dispatch = async <K extends IpcKind>(
  message: IpcMessage<K>,
  ctx: IpcSenderContext = TRUSTED_SENDER
): Promise<IpcResult<K>> => {
  try {
    const handler = handlers[message.kind];
    const value = await handler(message.payload, ctx);
    return { ok: true, value };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { ok: false, error: { message: error.message, stack: error.stack } };
  }
};

const isIpcMessage = (v: unknown): v is IpcMessage => {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return typeof m.kind === "string" && "payload" in m;
};

const isDappKind = (kind: IpcKind): boolean => kind.startsWith("dapp/");

/**
 * Derive the sender context. `extensionBaseUrl` is
 * `browser.runtime.getURL("")`, e.g. `chrome-extension://<our-id>/` — a sender
 * URL under it can only be one of our own pages.
 */
const classifySender = (
  sender: Runtime.MessageSender,
  extensionBaseUrl: string
): IpcSenderContext | undefined => {
  const url = sender.url ?? "";

  if (url.startsWith(extensionBaseUrl)) {
    return { trusted: true, tabId: sender.tab?.id };
  }

  // Content-script sender: lives in a real tab on a web origin.
  if (sender.tab?.id !== undefined && /^https?:\/\//.test(url)) {
    return {
      trusted: false,
      origin: new URL(url).origin,
      tabId: sender.tab.id,
    };
  }

  return undefined;
};

/**
 * Register the server on the extension runtime. Must run synchronously on
 * worker start-up so a message that woke the worker is not missed. Returns a
 * teardown function.
 */
export const startBackgroundServer = (): (() => void) => {
  const extensionBaseUrl = browser.runtime.getURL("");

  const listener = (
    msg: unknown,
    sender: Runtime.MessageSender,
    sendResponse: (response: IpcResult) => void
  ): true | undefined => {
    if (!isIpcMessage(msg)) return undefined;

    // Refusals also respond via sendResponse + `return true`: the polyfill
    // only delivers sendResponse when the listener returned `true`.
    const ctx = classifySender(sender, extensionBaseUrl);
    if (!ctx) {
      sendResponse({
        ok: false,
        error: { message: "Refused IPC message from unknown sender" },
      });
      return true;
    }
    if (!ctx.trusted && !isDappKind(msg.kind)) {
      sendResponse({
        ok: false,
        error: { message: `Channel "${msg.kind}" is not available to pages` },
      });
      return true;
    }

    // Returning `true` keeps the message channel open for the async reply.
    void dispatch(msg, ctx).then(sendResponse);
    return true;
  };

  browser.runtime.onMessage.addListener(
    listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]
  );

  return () =>
    browser.runtime.onMessage.removeListener(
      listener as Parameters<typeof browser.runtime.onMessage.removeListener>[0]
    );
};
