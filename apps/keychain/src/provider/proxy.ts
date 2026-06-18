/**
 * Content-script relay (ISOLATED world): receives `ProxyRequest`s posted by
 * the page provider (`window.zc`), forwards them to the background over the
 * typed `dapp/*` IPC channels, and posts the result back.
 *
 * The relay does NO origin gating itself — the background derives the origin
 * from the message sender and is the single source of truth for approval. The
 * relay holds no state and no storage.
 */
import type { BackgroundClient } from "../ipc/client";
import {
  ProxyMethod,
  ProxyRequest,
  ProxyRequestResponse,
  ProxyRequestTypes,
} from "./types";

const relayMethod = async (
  client: BackgroundClient,
  method: ProxyMethod,
  args: unknown
): Promise<unknown> => {
  switch (method) {
    case "connect":
      return client.send("dapp/connect", {});
    case "disconnect":
      return client.send("dapp/disconnect", {});
    case "isConnected":
      return client.send("dapp/isConnected", {});
    case "accounts":
      return client.send("dapp/accounts", {});
    case "defaultAccount":
      return client.send("dapp/defaultAccount", {});
    case "updateDefaultAccount": {
      if (typeof args !== "string") {
        throw new Error("zc.updateDefaultAccount: invalid arguments");
      }
      return client.send("dapp/updateDefaultAccount", { address: args });
    }
    case "sign": {
      const { pczt, signer } = (args ?? {}) as {
        pczt?: unknown;
        signer?: unknown;
      };
      if (
        typeof pczt !== "string" ||
        (signer !== undefined && typeof signer !== "string")
      ) {
        throw new Error("zc.sign: invalid arguments");
      }
      return client.send("dapp/sign", { pczt, signer });
    }
    case "signArbitrary": {
      const { signer, data } = (args ?? {}) as {
        signer?: unknown;
        data?: unknown;
      };
      if (typeof signer !== "string" || typeof data !== "string") {
        throw new Error("zc.signArbitrary: invalid arguments");
      }
      return client.send("dapp/signArbitrary", { signer, data });
    }
    case "verify": {
      const { publicKey, hash, signature } = (args ?? {}) as {
        publicKey?: unknown;
        hash?: unknown;
        signature?: unknown;
      };
      if (
        typeof publicKey !== "string" ||
        typeof hash !== "string" ||
        typeof signature !== "string"
      ) {
        throw new Error("zc.verify: invalid arguments");
      }
      return client.send("dapp/verify", { publicKey, hash, signature });
    }
    default:
      // Unsupported methods reject in the page provider before reaching here;
      // this also covers a hand-crafted postMessage.
      throw new Error(`zc.${String(method)} is not supported yet`);
  }
};

export const startProxy = (client: BackgroundClient): void => {
  window.addEventListener(
    "message",
    (e: MessageEvent<ProxyRequest>): void => {
      const message = e.data;

      if (!message || message.type !== ProxyRequestTypes.Request) {
        return;
      }
      // Only same-page senders; drop anything cross-origin or from other windows.
      if (e.source !== window || e.origin !== window.location.origin) {
        return;
      }

      void (async () => {
        let response: ProxyRequestResponse;
        try {
          const result = await relayMethod(client, message.method, message.args);
          response = {
            type: ProxyRequestTypes.Response,
            id: message.id,
            result: { return: result },
          };
        } catch (err) {
          response = {
            type: ProxyRequestTypes.Response,
            id: message.id,
            result: { error: err instanceof Error ? err.message : String(err) },
          };
        }
        window.postMessage(response, window.location.origin);
      })();
    }
  );
};
