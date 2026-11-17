/**
 * The compute host's workers: one decrypt worker per core, each taking one
 * chunk at a time, and one prover. Runs where workers can be started: the
 * offscreen document on Chrome, the background page on Firefox. The GPU, when
 * there is one, is opened here and shared by every decrypt worker.
 */
import type { ProveStage } from "@zillions/types";

import { gpuSecrets } from "./gpu";
import type {
  ComputeJob,
  DecryptTask,
  DecryptWorkerMessage,
  ProveTask,
  ProveWorkerMessage,
} from "./types";

const DECRYPT_WORKER = "/decrypt-worker.js";
const PROVE_WORKER = "/prove-worker.js";

const fromBase64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

type Slot = { worker: Worker; job?: Queued };
type Queued = { task: DecryptTask; resolve: (v: unknown) => void; reject: (e: Error) => void };

let slots: Slot[] = [];
const queue: Queued[] = [];

/**
 * Chunks waiting beyond the running ones. A site syncs on at most one
 * channel per core, so this only refuses one that floods the Keychain.
 */
const MAX_QUEUED = 2 * Math.max(1, navigator.hardwareConcurrency || 4);

/** Bumped on every stop: work queued before it never starts after. */
let generation = 0;
/** Aborted on every stop: GPU work queued before it never runs with the keys. */
let running = new AbortController();

const transferOf = (task: DecryptTask): Transferable[] =>
  task.op === "compact"
    ? [task.body.buffer, task.tried.buffer]
    : [
        task.body.buffer,
        task.memos.buffer,
        task.outgoing.buffer,
        task.hits.buffer,
        task.sends.buffer,
      ];

/** Runs `job` on `slot`'s worker, then the next queued one. */
function runOn(slot: Slot, job: Queued) {
  slot.job = job;
  const { worker } = slot;
  const done = () => {
    slot.job = undefined;
    const next = queue.shift();
    if (next) runOn(slot, next);
  };
  worker.onmessage = ({ data }: MessageEvent<DecryptWorkerMessage>) => {
    if ("gpuInputs" in data) {
      gpuSecrets(data.pool, data.gpuInputs, running.signal).then(
        (secrets) =>
          worker.postMessage({ secrets: secrets ?? null }, secrets ? [secrets.buffer] : []),
        (err) => worker.postMessage({ gpuError: String(err) })
      );
      return;
    }
    if ("error" in data) job.reject(new Error(data.error));
    else job.resolve(data.ok);
    done();
  };
  worker.onerror = (e) => {
    job.reject(new Error(e.message || "decrypt worker error"));
    // A crashed worker may hold a broken wasm instance: replace it.
    worker.terminate();
    slot.worker = new Worker(DECRYPT_WORKER);
    done();
  };
  worker.postMessage(job.task, transferOf(job.task));
}

function decrypt(task: DecryptTask): Promise<unknown> {
  if (!slots.length) {
    const cores = Math.max(1, navigator.hardwareConcurrency || 4);
    slots = Array.from({ length: cores }, () => ({
      worker: new Worker(DECRYPT_WORKER),
    }));
  }
  return new Promise((resolve, reject) => {
    const job = { task, resolve, reject };
    const idle = slots.find((s) => !s.job);
    if (idle) runOn(idle, job);
    else if (queue.length >= MAX_QUEUED) reject(new Error("The Keychain is busy"));
    else queue.push(job);
  });
}

let prover: Worker | undefined;
let proving: ((e: Error) => void) | undefined;
/** The prover's jobs run in order; each waits for the one before. */
let proverQueue: Promise<unknown> = Promise.resolve();
/** Whether a warm-up is queued or running: a proof behind it waits for the keys. */
let warming = false;

function prove(task: ProveTask, onStage: (stage: ProveStage) => void) {
  const queuedIn = generation;
  if (task.op === "warm") {
    if (warming || prover) return Promise.resolve(null);
    warming = true;
  } else if (warming) {
    onStage("proving-key");
  }
  const run = proverQueue.then(
    () =>
      new Promise<unknown>((resolve, reject) => {
        if (queuedIn !== generation) {
          reject(new Error("Keychain is locked"));
          return;
        }
        proving = reject;
        const worker = (prover ??= new Worker(PROVE_WORKER));
        worker.onmessage = ({ data }: MessageEvent<ProveWorkerMessage>) => {
          if ("stage" in data) onStage(data.stage);
          else if ("error" in data) reject(new Error(data.error));
          else resolve(data.ok);
        };
        worker.onerror = (e) => {
          prover?.terminate();
          prover = undefined;
          reject(new Error(e.message || "prover error"));
        };
        worker.postMessage(task, task.op === "prove" ? [task.pczt.buffer] : []);
      })
  );
  proverQueue = run.catch(() => undefined);
  return run.finally(() => {
    proving = undefined;
    if (task.op === "warm" && queuedIn === generation) warming = false;
  });
}

/** Runs one background request; the reply is JSON-safe. */
export async function runJob(
  job: ComputeJob,
  onStage: (stage: ProveStage) => void
): Promise<unknown> {
  switch (job.op) {
    case "compact":
      return decrypt({
        op: "compact",
        ufvk: job.ufvk,
        pool: job.pool,
        chunk: job.chunk,
        body: fromBase64(job.body),
        from: job.from,
        tried: fromHex(job.tried),
        gpu: true,
      });
    case "full":
      return decrypt({
        op: "full",
        ufvk: job.ufvk,
        pool: job.pool,
        chunk: job.chunk,
        body: fromBase64(job.body),
        memos: fromBase64(job.memos),
        outgoing: fromBase64(job.outgoing),
        hits: Uint32Array.from(job.hits),
        sends: Uint32Array.from(job.sends),
      });
    case "warm":
      return prove({ op: "warm" }, onStage);
    case "prove": {
      const proved = (await prove(
        { op: "prove", pczt: fromBase64(job.pczt) },
        onStage
      )) as { txid: string; raw: Uint8Array; expiry_height: number };
      return { ...proved, raw: toBase64(proved.raw) };
    }
  }
}

/** Stops every worker: on lock, nothing keeps running with the account's key. */
export function stopAll(): void {
  generation++;
  running.abort();
  running = new AbortController();
  const locked = new Error("Keychain is locked");
  for (const slot of slots) {
    slot.worker.terminate();
    slot.job?.reject(locked);
  }
  slots = [];
  for (const job of queue.splice(0)) job.reject(locked);
  proving?.(locked);
  prover?.terminate();
  prover = undefined;
  proverQueue = Promise.resolve();
  warming = false;
}
