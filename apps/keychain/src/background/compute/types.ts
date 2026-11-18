/**
 * Messages between the background and the compute host (the offscreen
 * document on Chrome, the background page itself on Firefox), and between the
 * host and its workers. Background ↔ host messages carry bytes as base64:
 * Chrome's extension messaging is JSON.
 */
import type { CompactChunk, FullChunk, Pool, ProveStage } from "@zillions/types";

export type ComputeJob =
  | {
      op: "compact";
      ufvk: string;
      pool: Pool;
      chunk: number;
      body: string;
      from: number;
      /** Hex digest of the `from` notes tried before. */
      tried: string;
    }
  | {
      op: "full";
      ufvk: string;
      pool: Pool;
      chunk: number;
      body: string;
      memos: string;
      outgoing: string;
      hits: number[];
      sends: number[];
    }
  | { op: "prove"; pczt: string }
  | { op: "warm" };

/** What each job resolves with; a proof's `raw` is base64. */
export type ComputeResult = {
  compact: CompactChunk;
  full: FullChunk;
  prove: { txid: string; raw: string; expiry_height: number };
  warm: null;
};

/** Background → host. */
export type ComputeRequest = { compute: ComputeJob; id: string };

/** Background → host: stop the prover, leaving chunk reads running. */
export type StopProving = { stopProving: true };

/** Host → background: a job's progress, outside its reply. */
export type ComputeStage = { computeStage: ProveStage; id: string };

export type ComputeReply = { ok: unknown } | { error: string };

/** Host → decrypt worker, with its bytes decoded. */
export type DecryptTask =
  | {
      op: "compact";
      ufvk: string;
      pool: Pool;
      chunk: number;
      body: Uint8Array;
      from: number;
      tried: Uint8Array;
      gpu: boolean;
    }
  | {
      op: "full";
      ufvk: string;
      pool: Pool;
      chunk: number;
      body: Uint8Array;
      memos: Uint8Array;
      outgoing: Uint8Array;
      hits: Uint32Array;
      sends: Uint32Array;
    };

/** Decrypt worker → host: its result, its error, or its key agreement for the GPU. */
export type DecryptWorkerMessage =
  | { ok: CompactChunk | FullChunk }
  | { error: string }
  | { pool: Pool; gpuInputs: Uint8Array };

/** Host → decrypt worker: the GPU's secrets, `null` with no usable GPU. */
export type GpuReply = { secrets: Uint32Array | null } | { gpuError: string };

export type ProveTask = { op: "prove"; pczt: Uint8Array } | { op: "warm" };

export type ProveWorkerMessage =
  | { ok: { txid: string; raw: Uint8Array; expiry_height: number } | null }
  | { error: string }
  | { stage: ProveStage };
