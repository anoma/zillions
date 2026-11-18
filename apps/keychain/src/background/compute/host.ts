/**
 * The background's way to its workers. Chrome's background is a service
 * worker, which can't start workers: they live in an offscreen document,
 * reached over runtime messaging. Firefox's background is a page, which runs
 * them itself.
 */
import type { ProveStage } from "@zillions/types";
import { v4 as uuid } from "uuid";
import browser, { type Runtime } from "webextension-polyfill";
import { browser as wxtBrowser } from "wxt/browser";

import type {
  ComputeJob,
  ComputeReply,
  ComputeRequest,
  ComputeResult,
  ComputeStage,
  StopProving,
} from "./types";

const OFFSCREEN = "/offscreen.html";

const stageListeners = new Map<string, (stage: ProveStage) => void>();

let listening = false;
const listenForStages = () => {
  if (listening) return;
  listening = true;
  browser.runtime.onMessage.addListener(
    (msg: unknown, sender: Runtime.MessageSender) => {
      const stage = msg as Partial<ComputeStage>;
      if (
        typeof stage?.id !== "string" ||
        typeof stage.computeStage !== "string" ||
        sender.url !== browser.runtime.getURL(OFFSCREEN)
      ) {
        return undefined;
      }
      stageListeners.get(stage.id)?.(stage.computeStage);
      return undefined;
    }
  );
};

let creating: Promise<void> | undefined;
/** Opens the document unless it's open; Chrome may also have closed it meanwhile. */
const ensureOffscreen = async (): Promise<void> => {
  const contexts = await wxtBrowser.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (contexts.length) return;
  await (creating ??= wxtBrowser.offscreen
    .createDocument({
      url: OFFSCREEN,
      reasons: ["WORKERS"],
      justification: "Trial decryption and proving with the account's keys",
    })
    // A caller that looked before the first one's document existed.
    .catch((e: unknown) => {
      if (!String(e).includes("single offscreen document")) throw e;
    })
    .finally(() => (creating = undefined)));
};

/** Bumped on every stop: a job that passed its lock check before it never runs after. */
let generation = 0;
/** Bumped on every stop of the prover, the whole compute host's or its own. */
let proveGeneration = 0;

const isProof = (job: ComputeJob) => job.op === "prove" || job.op === "warm";
/** The stop count `job` must still see when it starts. */
const fenceOf = (job: ComputeJob) => (isProof(job) ? proveGeneration : generation);

async function viaOffscreen(
  job: ComputeJob,
  onStage?: (stage: ProveStage) => void
): Promise<unknown> {
  listenForStages();
  const startedIn = fenceOf(job);
  await ensureOffscreen();
  if (startedIn !== fenceOf(job)) throw new Error("Keychain is locked");
  const id = uuid();
  if (onStage) stageListeners.set(id, onStage);
  try {
    const request: ComputeRequest = { compute: job, id };
    const reply = (await browser.runtime.sendMessage(request)) as ComputeReply | undefined;
    if (!reply) throw new Error("The compute host did not answer");
    if ("error" in reply) throw new Error(reply.error);
    return reply.ok;
  } finally {
    stageListeners.delete(id);
  }
}

const KEEPALIVE_INTERVAL_MS = 20_000;

/** Runs `job` on the workers; resolves with its JSON-safe result. */
export async function compute<K extends ComputeJob["op"]>(
  job: Extract<ComputeJob, { op: K }>,
  onStage?: (stage: ProveStage) => void
): Promise<ComputeResult[K]> {
  // A proof can outlast the 30 s an idle background lives; any extension API
  // call resets that timer.
  const keepAlive = setInterval(
    () => void browser.runtime.getPlatformInfo(),
    KEEPALIVE_INTERVAL_MS
  );
  try {
    if (import.meta.env.FIREFOX) {
      const startedIn = fenceOf(job);
      const { runJob } = await import("./pool");
      if (startedIn !== fenceOf(job)) throw new Error("Keychain is locked");
      return (await runJob(job, onStage ?? (() => {}))) as ComputeResult[K];
    }
    return (await viaOffscreen(job, onStage)) as ComputeResult[K];
  } finally {
    clearInterval(keepAlive);
  }
}

/**
 * Stops every worker, closing Chrome's offscreen document with them; with
 * `"proving"`, the prover alone, and chunk reads go on.
 */
export async function stopCompute(what: "all" | "proving" = "all"): Promise<void> {
  proveGeneration++;
  if (what === "all") generation++;
  if (import.meta.env.FIREFOX) {
    const { stopAll, stopProving } = await import("./pool");
    if (what === "all") stopAll();
    else stopProving();
    return;
  }
  const contexts = await wxtBrowser.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (!contexts.length) return;
  if (what === "all") await wxtBrowser.offscreen.closeDocument();
  else await browser.runtime.sendMessage({ stopProving: true } satisfies StopProving);
}
