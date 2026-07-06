/**
 * IPC transport: moves an envelope to the background realm and returns its
 * result envelope.
 *
 * The ONLY place that touches `browser.runtime`. The `BackgroundClient` above
 * is realm-agnostic, so tests can inject a different `Transport`.
 */
import type { IpcKind, IpcMessage, IpcResult } from "./contract";

export interface Transport {
  send<K extends IpcKind>(message: IpcMessage<K>): Promise<IpcResult<K>>;
}

/**
 * Real transport over `browser.runtime.sendMessage`. The background server
 * (see `background/server.ts`) listens on `runtime.onMessage` and replies with
 * an `IpcResult` envelope.
 *
 * `browser` is provided by WXT's auto-imports (`#imports`) in entrypoints; we
 * import it explicitly here so this module is usable outside an entrypoint too.
 */
export const createRuntimeTransport = (): Transport => ({
  async send(message) {
    // Lazy import keeps this module importable in non-extension contexts
    // (e.g. unit tests that inject a mock transport instead).
    const { default: browser } = await import("webextension-polyfill");
    const result = (await browser.runtime.sendMessage(message)) as unknown;
    if (!result) {
      return {
        ok: false,
        error: { message: "Empty IPC result from background" },
      };
    }
    return result as IpcResult<typeof message.kind>;
  },
});
