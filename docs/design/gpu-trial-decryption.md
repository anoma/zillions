# GPU trial decryption (WebGPU)

Status: built, 2026-10-16. Chrome and Firefox only; Safari and phones are out
of scope. The CPU path stays, as the fallback everywhere.

## Summary

- Sync's compact trial decryption runs its key agreement, `[ivk]·epk`, on the
  GPU. That step is 80% of `try_decrypt`'s time.
- **Fresh setup sync of the test wallet (85 chunks, M1, 8 workers):**

  | | GPU | CPU only | speedup |
  |---|---|---|---|
  | Chrome 155 | 25.8 s | 82.5 s | 3.2× |
  | Firefox 157 | 29.9 s | 90.1 s | 3.0× |

  Balance and history are identical across all four runs.
- **Once warm, per chunk:** about 0.2 s on the GPU against about 0.78 s on 8
  wasm workers, so long syncs gain about 4×. A short sync gains less because of
  V8 warm-up, which affects both paths (see [Warm-up](#warm-up)).
- **Correctness doesn't rest on the GPU.** The GPU only rules outputs out.
  Every possible hit is decrypted again by upstream's own
  `try_compact_note_decryption`, and spot checks fail any chunk where the GPU
  disagrees with the CPU.

## How it works

1. **Prepare (worker, wasm).** `gpu_inputs` returns the pool's two ivk scalars
   (external, internal), then each ephemeral key decompressed to affine
   coordinates. It starts from the first note `try_decrypt` would try, so the
   tried-notes resume still applies.
2. **Agree (page, WebGPU).** The worker hands its inputs to the page, which
   owns the one GPU device. Each chunk runs as 2,048-output command buffers,
   one chunk at a time, and returns X, Y, Z and a flag per (output, ivk).
   - **Orchard / Ironwood:** Pallas, using pasta_curves' own algorithm: a GLV
     split, a width-4 wNAF ladder over {1,3,5,7}·P, and φ applied on the fly.
     JS computes the GLV split of the ivk from pasta's lattice basis and checks
     it.
   - **Sapling:** Jubjub, using extended twisted-Edwards coordinates and a
     width-4 wNAF ladder over 256 digits, then [8] to clear the cofactor. With
     a = −1 and d a non-square the addition law is complete, so no case is
     exceptional.
3. **Finish (worker, wasm).** `try_decrypt_gpu` checks and uses the secrets:
   - normalizes them to affine (batched inversion) and checks they lie on the
     curve;
   - runs the KDF (BLAKE2b) and the first ChaCha20 byte;
   - sends only plaintexts whose lead byte the pool accepts (about 1 in 256)
     to upstream `try_compact_note_decryption`.

   It returns exactly what `try_decrypt` returns.

**Field arithmetic.** 20 limbs of 13 bits, Montgomery with R = 2^260, so a row
of limb products sums in a u32 with no carries. This is the representation the
ZPrize 2023 WebGPU entry found fastest. All the code is generated unrolled,
with constant indices: Firefox's shader compiler ran the looped version 5–10×
slower. Products by Pallas's zero limbs are left out.

## Fallback and safety

| what happens | result |
|---|---|
| No WebGPU (Firefox Linux/Android, headless, blocklisted GPU) | CPU path, with no extra work once the first chunk finds no adapter |
| A pair's secret flagged (Pallas P = ±Q) or off the curve | that pair decrypted by upstream on the CPU |
| Over ~1% of pairs off the curve (a killed or garbled dispatch) | chunk fails; the worker turns its GPU path off and redoes the chunk on the CPU |
| A spot-checked secret (4 outputs × 2 ivks per chunk) differs from the CPU's | same |
| Device lost | page stops offering the GPU; workers carry on with the CPU |
| `VITE_GPU_DISABLED=true` at build time (see `.env.example`) | CPU only, to compare |

Under concurrency Firefox's GPU returned zeroed and half-written buffers for
long command buffers. The off-curve check caught every one of them. Short
command buffers, one chunk at a time, fixed it. The browser pane (Chromium)
also turned WebGPU off for a session after repeated device losses, and sync
carried on correctly on the CPU.

## Measurements (M1, 8-core GPU)

| kernel, one full chunk (16,384 outputs × 2 ivks) | Chrome 155 | Firefox 157 |
|---|---|---|
| Pallas | 193 ms | 289 ms |
| 8 chunks submitted at once | 1.70 s | 1.93 s |
| first call (pipeline compile) | ~1.6 s | ~0.1 s |

- Sapling's kernel took about 1.6× Pallas's (304 ms in Chrome, before the unrolling).
- On the CPU side, a warm worker spends about 0.33 s on prepare and 0.43 s on
  finish per Orchard chunk, so 8 workers keep the GPU busy.
- Steady state is GPU-bound.

**Where `try_decrypt`'s time goes** (one chunk, one thread, V8, 4.0 s total):

| step | share |
|---|---|
| key agreement ladder | 79% |
| GLV tables | 3% |
| epk decompression | 7% |
| affine + KDF + ChaCha20 | under 1% |
| parsing, domains, allocation | 10% |

The GPU takes the first two rows.

## Warm-up

On a fresh page, V8 runs wasm on its baseline compiler until optimized code is
ready. Wasm has no on-stack replacement, so one long `try_decrypt` call stays
slow until it returns. Measured on the CPU path, a worker's first chunk takes
**28.7 s, against 6.2 s once warm**, which costs about 22 s of a 105 s sync. The
GPU path's shorter calls warm up sooner, but its first ~35 chunks still run
5–6× slower on the CPU side. Firefox shows no such warm-up (about 5–7 s per
CPU chunk from the start). This is separate from the GPU work: splitting
`try_decrypt` into shorter calls would likely fix it for both paths.

## Prior art

- **ZPrize 2023, WASM/WebGPU MSM:** Tal Derei & Koh Wei Jie won the
  best-WebGPU mention, on BLS12-377. Their
  [write-up](https://hackmd.io/HNH0DcSqSka4hAaIfJNHEA) is where the 13-bit-limb
  choice comes from.
- **No public WebGPU code covers Pasta or Jubjub.** The kernels here are new.
- **The research prototype,** a bench page comparing the kernel with
  orchard's wasm, is in this branch's history at e619cd31
  (`packages/zcore/research/webgpu-decrypt/`).

## Open

- No phone, Intel, AMD or NVIDIA measurements yet. The flag is build-time,
  so a GPU-vs-CPU comparison needs a local build with `VITE_GPU_DISABLED=true`
  next to the Netlify preview.
- Kernel headroom is small (about 80% of the M1's IMAD32 peak). Specialised
  squaring might add 10–15%.
