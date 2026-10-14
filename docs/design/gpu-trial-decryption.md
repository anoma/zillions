# GPU trial decryption (WebGPU) — research

Status: research only, 2026-10-14. Nothing here is wired into sync. The
prototype is in `packages/zcore/research/webgpu-decrypt/`.

## Answer

Yes, unlike proving. On Harrison's M1 a WGSL kernel does a chunk's Orchard key
agreement (16,384 outputs × 2 viewing keys) in **176 ms**. The 8 wasm workers
sync uses today spend about **0.74 s** of chunk-equivalent time on the same
step. That makes the GPU about **4×** faster on the step that costs 82% of trial
decryption. With the CPU workers doing the rest at the same time, a chunk's
compact decrypt goes from about **0.90 s to about 0.2 s**, roughly **4–5×**. The
results are bit-exact against orchard on all 32,768 products.

Proving didn't benefit because its MSMs are tiny (about 2k points). Trial
decryption is different: 32k independent scalar multiplications per chunk, all
with the same scalar, so the GPU has plenty of parallel work and no branch
divergence.

## Where the CPU time goes

Orchard's `batch::try_compact_note_decryption` over one chunk (16,384 random
actions, external + internal ivk), V8 in Chrome 152, one thread, zcore's
patched field multiply (#53):

| step | ms | share |
|---|---|---|
| full batch decrypt | 4,000 | 100% |
| key agreement: GLV tables (per epk, batched inversion) | 122 | 3% |
| key agreement: `[ivk]·epk` ladder, 2 ivks | 3,180 | 79% |
| epk decompression (sqrt) | 265 | 7% |
| shared secret → affine (batched inversion) | 17 | 0.4% |
| KDF (BLAKE2b) + ChaCha20, 52 bytes | 13 | 0.3% |
| the rest (domains, parsing, allocation) | ~400 | 10% |

The KDF and ChaCha20 cost almost nothing. Only the curve arithmetic is worth
moving. The CPU path is already well optimised: orchard 0.15.5 / pasta 0.5.2
use GLV with a width-4 wNAF Straus ladder, so each product costs about 127
doublings plus about 51 additions.

All cores (`node cores.mjs`, 8 workers × 16,384, same wasm): **55 µs per
output**, i.e. 0.90 s per chunk-equivalent. That matches the browser run
(57.6 µs) and the app's ~4.2 s single-core chunk.

## Prototype

`shader.js` holds a WGSL kernel. Each thread takes one ephemeral key and
produces both ivk products:

- Fp in 20 limbs of 13 bits, Montgomery with R = 2^260. A limb product is 26
  bits, so a whole row accumulates in a u32 without carries. This is the
  representation the ZPrize 2023 WebGPU entry (Derei & Koh) found fastest on M1
  and M3.
- The same algorithm as pasta, so the comparison is like for like: GLV split,
  width-4 wNAF, a table of {1,3,5,7}·P and the endomorphism applied on the fly
  (ζ·X). Jacobian coordinates use dbl-2009-l and add-2007-bl.
- The digits come from the ivk, so they are the same for every thread. Control
  flow never diverges and table lookups are uniform.
- The GPU returns Jacobian (X, Y, Z). The page checks X = x·Z² and Y = y·Z³
  against wasm's affine output.

Results on the M1 (8-core GPU), Chrome 152:

| | ms per chunk (32,768 products) | µs / output |
|---|---|---|
| wasm, 1 thread (tables + ladder) | 3,300 | 201 |
| wasm, 8 workers (82% of 55 µs) | ~740 | ~45 |
| **WebGPU** | **176** | **10.7** |
| WebGPU incl. upload + readback | 182 | 11.1 |
| WebGPU, 4 chunks in one dispatch | 679 / 4 | 10.4 |

- The pipeline compiles once, in about 400 ms.
- Workgroup size 64 is best (32: 185 ms, 128: 197 ms).
- One chunk already saturates the GPU: 4 chunks scale linearly.
- 0 mismatches out of 32,768.

The kernel is close to the hardware limit. It does about 1,800 field
multiplications per product, each roughly 800 32-bit multiply-adds, which comes
to about 0.27 T IMAD/s. The M1 GPU's peak is 1,024 lanes × 1.278 GHz ÷ 4 cycles
per IMAD32 ([metal-benchmarks](https://github.com/philipturner/metal-benchmarks))
= 0.33 T/s, so the kernel runs at about 80% of peak. Specialised squaring would
win roughly another 10–15%. There is no 2× left in the kernel; the 4× comes
from the hardware.

## Estimates

- **Orchard / Ironwood, per chunk on M1:** the GPU takes the ladder (176 ms).
  The 8 workers keep parsing, decompression, normalisation, KDF/ChaCha and hit
  handling: the other ~18%, about 10 µs/output or 0.16 s per chunk. Run as a
  pipeline, the two overlap, giving **about 0.2 s per chunk against 0.9 s
  today (4–5×)**. Moving decompression to the GPU too (one sqrt, about 15% of a
  product) would take another 7% off the CPU side.
- **Sapling:** not prototyped. Jubjub has no GLV, so a product needs about 252
  doublings. Extended twisted-Edwards formulas make those cheap (dbl 8M,
  add 9M), giving about 1.4× Pallas's field-mul count: **about 15 µs/output on
  the GPU**. The CPU side costs 6.8/4.2 × 55 ≈ 89 µs today, so the ratio is
  similar, **about 5×**.
- **Whole sync:** decrypt drops below download time. A chunk download takes
  0.25 s from the CDN and 2.2 s on a miss, so after this change sync speed is
  set by downloads and the indexer, not by decryption.
- **Other machines:** a discrete NVIDIA or AMD GPU likely has 10× or more of
  the M1 GPU's integer throughput (not measured) while its CPU has about the same core count, so the gain
  is larger. Intel iGPUs and phones are unknown; see open questions.

## Availability (gpuweb wiki, edited 2026-10-02)

| browser | WebGPU |
|---|---|
| Chrome / Edge, desktop | Mac, Windows, ChromeOS since 113; Linux on Intel Gen12+ (144) and NVIDIA under Wayland (147), others behind a flag |
| Chrome, Android | Android 12+ on ARM / Qualcomm / Intel GPUs (121), Imagination on Android 16+ (139), others not yet |
| Safari | macOS / iOS / iPadOS 26 |
| Firefox | Windows (141), macOS (145 on 26+, 147 on all versions); Linux Nightly only; Android behind a flag |

Sync would call the GPU from a dedicated worker. `WorkerNavigator.gpu` works in
Chrome. I could not confirm Safari 26 from sources, so test it in Safari. Feature
detection plus the existing CPU path covers the rest: old iOS, Firefox on
Android and Linux, and older Android GPUs would stay CPU-only.

## Prior art

- **ZPrize 2023, WASM/WebGPU MSM:** Tal Derei & Koh Wei Jie won the best-WebGPU
  mention, on BLS12-377 and twisted Edwards. Their
  [write-up](https://hackmd.io/HNH0DcSqSka4hAaIfJNHEA) benchmarks limb widths
  12–16 bits on M1 and M3; 13-bit limbs win. ICME Lab's `msm-webgpu` builds on
  it for BN254.
- **No public WebGPU code covers Pasta or Jubjub.** Pasta has CUDA MSMs
  (Supranational's `pasta-msm`); there is no WGSL. The field code here is new
  but small: about 100 lines of WGSL for Fp, plus a constant swap for Fr.
- MSM tricks such as Pippenger buckets don't apply here: trial decryption is
  many independent single-scalar products, which is a simpler workload.

## What production would take (about 2–3 weeks)

1. **zcore split (3–4 days).** `try_decrypt` becomes two calls:
   - prepare: parse and decompress, then return epk affine coordinates and the
     ivks' GLV digits;
   - finish: take the GPU's Jacobian results, then batch-normalize, run the KDF
     and ChaCha20, parse via `Domain::parse_note_plaintext_without_memo_ivk`,
     and check cmx and epk.

   All of this uses public `zcash_note_encryption` / `orchard` / `sapling`
   trait methods. It does reimplement the compact path's ~60 lines, so it needs
   a test that its hits equal `batch::try_compact_note_decryption` on real
   chunks from zcrawler.dev.heliax.app.
2. **Kernels (3–5 days).**
   - Harden Pallas with complete formulas (RCB, about +25%) or an
     exceptional-case flag with CPU fallback. A missed exceptional case would be
     a missed note, not just a slow path.
   - Add the Jubjub kernel (Fr constants, Edwards formulas, cofactor). Optional:
     GPU decompression.
3. **Sync orchestration (4–5 days).**
   - One GPU worker shared by the decrypt workers, with batches pipelined so the
     CPU and GPU overlap.
   - Handle `device.lost`, hidden tabs and phones (thermal limits).
   - A start-up self-test against wasm vectors that disables the GPU path on any
     mismatch, since GPU drivers differ.
   - CPU fallback everywhere.
4. **Testing (3–4 days).** Apple, NVIDIA, AMD, Intel, Adreno and Mali. CI can
   check correctness through headless Chrome with Dawn's SwiftShader, but not
   speed.

Risks:
- The ivk enters GPU memory. That process is the browser's, already shared and
  isolated, and the ivk is a viewing key.
- The ladder is variable-time in the ivk, the same as pasta's CPU path today.
- Running CPU and GPU together on a fanless M1 Air may throttle both.

## Recommendation

Worth building, but not first:

1. **Measure phones first (about an hour).** Open the bench page on an iPhone
   (Safari 26) and an Android phone (Chrome). It needs HTTPS off localhost.
   Phone GPUs have a different integer-multiply rate, and the 4× could shrink
   to 1–2×.
2. **Weigh it against the open algorithmic work:**
   - the spam-era shape filter could cut 15 GB of ciphertexts to 0.2–0.5 GB;
   - internal-ivk skipping saves 40–45% of decrypt.

   Both also help phones and Firefox users that WebGPU can't reach. If decrypt
   is still the bottleneck after them, build the GPU path as an optional
   accelerator with the CPU fallback (~2–3 weeks).

## Reproduce

```bash
packages/zcore/research/webgpu-decrypt/build.sh
python3 -m http.server 8766 -d packages/zcore/research/webgpu-decrypt
```

Open `http://localhost:8766/?n=16384` in Chrome or Safari 26. Add `&cpu=0` to
skip the all-core run, which the browser throttles when the tab is hidden, and
`&wg=` to change the workgroup size. For the all-core baseline, run
`node cores.mjs` in that folder.
