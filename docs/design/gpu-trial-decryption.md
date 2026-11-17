# GPU trial decryption (WebGPU)

Status: built, 2026-10-16; moved from the app into the Keychain, 2026-11-17,
so the ivks never reach a site. Chrome and Firefox only; Safari and phones are
out of scope. The CPU path stays, as the fallback everywhere.

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
  wasm workers, so long syncs gain about 4×.
- **Correctness doesn't rest on the GPU.** The GPU only rules outputs out.
  Every possible hit is decrypted again by upstream's own
  `try_compact_note_decryption`, and spot checks fail any chunk where the GPU
  disagrees with the CPU.

## How it works

1. **Prepare (worker, wasm).** `gpu_inputs` returns the pool's two ivk scalars
   (external, internal), then each ephemeral key decompressed to affine
   coordinates. It starts from the first note `try_decrypt` would try, so the
   tried-notes resume still applies.
2. **Agree (Keychain compute host, WebGPU).** The worker hands its inputs to
   the host (Chrome's offscreen document, Firefox's background page), which
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
| Device lost | host stops offering the GPU; workers carry on with the CPU |

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

A worker's first `try_decrypt` call is no slower than later ones. On an M1 in
Chrome 155, with a throwaway profile and a fresh setup sync of 86 chunks:

| path | sync | first call per worker | later calls |
|---|---|---|---|
| CPU | 92.1 s, 92.7 s | 5.9–6.8 s (Sapling about 9.3 s) | about 6.6 s |
| GPU | 31.3 s | 0.8–2.3 s | 1.1–1.6 s |

V8 runs Liftoff code until TurboFan's is ready, but here Liftoff is only about
1.5× slower (Node, `--liftoff-only`: about 10 s per chunk against 6.8 s), and
tier-up finishes well inside the first call. Open DevTools does slow every
call, the first one most (19 s, then 15 s), so timings need it closed.

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

- No phone, Intel, AMD or NVIDIA measurements yet. A GPU-vs-CPU comparison
  needs a local Keychain build with `gpu: false` in
  `apps/keychain/src/background/compute/pool.ts`.
- Kernel headroom is small (about 80% of the M1's IMAD32 peak). Specialised
  squaring might add 10–15%.
