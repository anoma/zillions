/**
 * Decrypt worker: trial-decrypts one chunk the site fetched against the
 * account's UFVK. Each worker owns its own wasm instance; decryption is
 * stateless, so many run in parallel with nothing shared.
 */
import initZcore, {
  gpu_inputs,
  try_decrypt,
  try_decrypt_full,
  try_decrypt_gpu,
} from "@zillions/zcore";
import type { Pool } from "@zillions/types";

import { getNetwork } from "../crypto/network";
import type { DecryptTask, DecryptWorkerMessage, GpuReply } from "./types";

const worker = self as unknown as {
  onmessage: ((e: MessageEvent<DecryptTask | GpuReply>) => void) | null;
  postMessage: (msg: DecryptWorkerMessage, transfer?: Transferable[]) => void;
};

let ready: Promise<unknown> | undefined;
/** Off for good in this worker once the host has no GPU, or it failed. */
let gpuOff = false;
/** One chunk at a time, so one GPU reply awaited at most. */
let gpuReply: ((reply: GpuReply) => void) | undefined;

const hostSecrets = (pool: Pool, gpuInputs: Uint8Array) =>
  new Promise<GpuReply>((resolve) => {
    gpuReply = resolve;
    worker.postMessage({ pool, gpuInputs }, [gpuInputs.buffer]);
  });

async function compact(task: Extract<DecryptTask, { op: "compact" }>) {
  const { ufvk, pool, chunk, body, from, tried } = task;
  const network = getNetwork();
  if (task.gpu && !gpuOff) {
    try {
      const inputs = gpu_inputs(network, ufvk, pool, body, from, tried);
      // Only the ivks: no notes left to try, or no key for this pool.
      if (inputs.length <= 64) {
        return try_decrypt(network, ufvk, pool, chunk, body, from, tried);
      }
      const reply = await hostSecrets(pool, inputs);
      if ("gpuError" in reply) throw new Error(reply.gpuError);
      if (reply.secrets) {
        return try_decrypt_gpu(
          network,
          ufvk,
          pool,
          chunk,
          body,
          from,
          tried,
          reply.secrets
        );
      }
      gpuOff = true;
    } catch (err) {
      // A bad chunk throws here too; it shouldn't turn the GPU off for every
      // site until lock. Only a chunk the CPU reads fine blames the GPU.
      const result = try_decrypt(network, ufvk, pool, chunk, body, from, tried);
      gpuOff = true;
      console.warn(`GPU trial decryption failed, back on the CPU: ${err}`);
      return result;
    }
  }
  return try_decrypt(network, ufvk, pool, chunk, body, from, tried);
}

export const startDecryptWorker = (): void => {
  worker.onmessage = async ({ data }) => {
    if (!("op" in data)) return gpuReply?.(data);
    try {
      await (ready ??= initZcore({
        module_or_path: new URL("/wasm/zcore_bg.wasm", self.location.origin),
      }));
      const result =
        data.op === "compact"
          ? await compact(data)
          : try_decrypt_full(
              getNetwork(),
              data.ufvk,
              data.pool,
              data.chunk,
              data.body,
              data.memos,
              data.outgoing,
              data.hits,
              data.sends
            );
      worker.postMessage({ ok: result });
    } catch (err) {
      worker.postMessage({ error: String(err) });
    }
  };
};
