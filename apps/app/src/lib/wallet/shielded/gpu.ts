/**
 * Trial decryption's key agreement on the GPU (WebGPU): zcore's `gpu_inputs`
 * in, the shared secrets `try_decrypt_gpu` takes out. The page opens one
 * device for every decrypt worker, so their chunks queue on it in turn.
 */

import type { Pool } from "../types";
import { JUBJUB, PALLAS, PALLAS_Q, mod } from "./gpu.wgsl";

/** zcore's per (output, ivk) secret: X, Y, Z in 8 words each, then a flag. */
const WORDS = 25;
const WORKGROUP = 64;
/** Outputs per command buffer: one long one can trip a GPU watchdog (Firefox). */
const SLICE = 2048;
/** WebGPU's `GPUBufferUsage` and `GPUMapMode` bits, which TS's DOM lib leaves out. */
const USAGE = {
  MAP_READ: 0x1,
  COPY_SRC: 0x4,
  COPY_DST: 0x8,
  UNIFORM: 0x40,
  STORAGE: 0x80,
};
const MAP_READ = 0x1;

/** pasta_curves' `Fq::ZETA` and short GLV lattice basis for Pallas. */
const LAMBDA =
  0x06819a58283e528e511db4d81cf70f5a0fed467d47c033af2aa9d2e050aa0e4fn;
const V1A = 0x49e69d1640f049157fcae1c700000001n;
const V1B_NEG = 0x49e69d1640a899538cb1279300000000n;
const V2A = 0x49e69d1640a899538cb1279300000000n;
const V2B = 0x93cd3a2c8198e2690c7c095a00000001n;

const scalar = (bytes: Uint8Array, at: number) =>
  bytes.subarray(at, at + 32).reduceRight((v, b) => (v << 8n) | BigInt(b), 0n);

/** Width-4 wNAF digits of `k`, its sign folded in, lowest first, into `out`; throws if they don't fit. */
function wnaf(k: bigint, out: Int32Array) {
  const sign = k < 0n ? -1 : 1;
  for (let i = 0, m = k < 0n ? -k : k; m > 0n; i++, m >>= 1n) {
    if (i >= out.length) throw new Error("scalar too wide for its digits");
    if (m & 1n) {
      let d = Number(m & 15n);
      if (d >= 8) d -= 16;
      out[i] = sign * d;
      m -= BigInt(d);
    }
  }
}

/** k = k1 + λ·k2 (mod q) with both halves under 2^127 (Babai rounding); throws if that fails. */
function glv(k: bigint): [bigint, bigint] {
  const c1 = (k * V2B + PALLAS_Q / 2n) / PALLAS_Q;
  const c2 = (k * V1B_NEG + PALLAS_Q / 2n) / PALLAS_Q;
  const k1 = k - c1 * V1A - c2 * V2A;
  const k2 = c1 * V1B_NEG - c2 * V2B;
  const short = (x: bigint) => (x < 0n ? -x : x) < 1n << 127n;
  if (mod(k1 + LAMBDA * k2 - k, PALLAS_Q) !== 0n || !short(k1) || !short(k2))
    throw new Error("GLV split failed");
  return [k1, k2];
}

/** Both ivks' ladder digits: 256 each, as the pool's shader reads them. */
export function digits(pool: Pool, scalars: Uint8Array) {
  const out = new Int32Array(512);
  for (const k of [0, 1]) {
    const s = scalar(scalars, k * 32);
    if (pool === "sapling") wnaf(s, out.subarray(k * 256, k * 256 + 256));
    else
      glv(s).forEach((half, h) =>
        wnaf(half, out.subarray(k * 256 + h * 128, k * 256 + h * 128 + 128)),
      );
  }
  return out;
}

let device: Promise<GPUDevice | undefined> | undefined;
/** The last chunk on the GPU: chunks run one after another, never overlapping. */
let queue: Promise<unknown> = Promise.resolve();
const pipelines = new Map<string, Promise<GPUComputePipeline>>();

function open() {
  return (device ??= (async () => {
    const adapter = await navigator.gpu?.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) return undefined;
    const gpu = await adapter.requestDevice();
    gpu.lost.then((info) => {
      console.warn("GPU lost, trial decryption back on the CPU:", info.message);
      device = Promise.resolve(undefined);
      pipelines.clear();
    });
    const { vendor, architecture } = adapter.info;
    console.info(
      `Trial decryption on the GPU: ${`${vendor} ${architecture}`.trim() || "yes"}`,
    );
    return gpu;
  })().catch(() => undefined));
}

/**
 * The shared secrets for `inputs`, zcore's `gpu_inputs` for `pool`; undefined
 * when this browser or machine has no usable GPU. Throws on a GPU error.
 */
export function gpuSecrets(pool: Pool, inputs: Uint8Array) {
  const run = queue.then(() => secrets(pool, inputs));
  queue = run.catch(() => undefined);
  return run;
}

async function secrets(
  pool: Pool,
  inputs: Uint8Array,
): Promise<Uint32Array | undefined> {
  const gpu = await open();
  if (!gpu) return undefined;
  const curve = pool === "sapling" ? JUBJUB : PALLAS;
  let pipeline = pipelines.get(curve);
  if (!pipeline) {
    pipeline = gpu.createComputePipelineAsync({
      layout: "auto",
      compute: {
        module: gpu.createShaderModule({ code: curve }),
        entryPoint: "main",
      },
    });
    pipelines.set(curve, pipeline);
  }

  const n = (inputs.length - 64) / 64;
  const buffer = (data: ArrayBufferView<ArrayBuffer>, usage: number) => {
    const b = gpu.createBuffer({
      size: Math.max(16, data.byteLength),
      usage: usage | USAGE.COPY_DST,
    });
    gpu.queue.writeBuffer(b, 0, data);
    return b;
  };
  const size = n * 2 * WORDS * 4;
  const buffers = [
    buffer(inputs.slice(64), USAGE.STORAGE),
    buffer(digits(pool, inputs.subarray(0, 64)), USAGE.STORAGE),
    gpu.createBuffer({ size, usage: USAGE.STORAGE | USAGE.COPY_SRC }),
  ];
  const read = gpu.createBuffer({
    size,
    usage: USAGE.MAP_READ | USAGE.COPY_DST,
  });
  try {
    const compute = await pipeline;
    const bind = (range: GPUBuffer) =>
      gpu.createBindGroup({
        layout: compute.getBindGroupLayout(0),
        entries: [...buffers.slice(0, 3), range].map((b, binding) => ({
          binding,
          resource: { buffer: b },
        })),
      });
    const ranges: GPUBuffer[] = [];
    const commands: GPUCommandBuffer[] = [];
    for (let base = 0; base < n; base += SLICE) {
      const range = buffer(new Uint32Array([n, base, 0, 0]), USAGE.UNIFORM);
      ranges.push(range);
      const encoder = gpu.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(compute);
      pass.setBindGroup(0, bind(range));
      pass.dispatchWorkgroups(Math.ceil(Math.min(SLICE, n - base) / WORKGROUP));
      pass.end();
      commands.push(encoder.finish());
    }
    const encoder = gpu.createCommandEncoder();
    encoder.copyBufferToBuffer(buffers[2], 0, read, 0, size);
    commands.push(encoder.finish());
    gpu.queue.submit(commands);
    buffers.push(...ranges);
    await read.mapAsync(MAP_READ);
    return new Uint32Array(read.getMappedRange().slice(0));
  } finally {
    [...buffers, read].forEach((b) => b.destroy());
  }
}
