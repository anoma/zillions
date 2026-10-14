# GPU trial decryption (WebGPU)

Status: research, 2026-10-14. Nothing here is wired into sync. The prototype
is in `packages/zcore/research/webgpu-decrypt/`.

## Summary

- **Verdict:** worth building, unlike GPU proving, but only after the open
  algorithmic work and a phone measurement (see [Plan](#plan)).
- **Speedup on Harrison's M1:** a WGSL kernel does one chunk's Orchard key
  agreement (16,384 outputs × 2 viewing keys) in **176 ms**. The 8 wasm workers
  sync uses today spend about **0.74 s** on the same step, so the GPU is about
  **4×** faster on the step that costs 82% of trial decryption.
- **Effect on a whole chunk:** with the CPU workers doing the rest at the same
  time, compact decrypt goes from about **0.90 s to about 0.2 s, roughly 4–5×**.
  Sapling is estimated to gain about the same.
- **Correctness:** all 32,768 products are bit-exact against orchard.
- **Cost:** about 2–3 weeks to production, with the CPU path kept as fallback.

Proving gained nothing from the GPU because its MSMs are tiny (about 2k
points). Trial decryption is a different workload: 32k independent scalar
multiplications per chunk, all with the same scalar. The GPU gets plenty of
parallel work, and its threads never branch apart.

## Plan

### Phase 0: measure phones (about an hour)

Open the bench page on an iPhone (Safari 26) and on an Android phone (Chrome).
The page needs HTTPS when served from anywhere but localhost. Phone GPUs have
their own integer-multiply rates, so the 4× could shrink to 1–2×.

The same session should also confirm `WorkerNavigator.gpu` in Safari 26: sync
would call the GPU from a worker.

**Gate:** if phones gain under about 2×, the GPU path is desktop-only. That
lowers its priority further.

### Phase 1: do the cheaper levers first

These help every device, including phones and Firefox users that WebGPU can't
reach:

- **Spam-era shape filter:** could cut the 15 GB of spam-era ciphertexts to
  0.2–0.5 GB.
- **Internal-ivk skipping:** saves 40–45% of decrypt.

**Gate:** build Phase 2 only if decryption is still the bottleneck afterwards.
Download time is the other limit: a chunk takes 0.25 s from the CDN and 2.2 s
on a miss.

### Phase 2: build the GPU path as an optional accelerator (about 2–3 weeks)

1. **zcore split (3–4 days).** `try_decrypt` becomes two calls:
   - **prepare:** parse and decompress, then return the epks' affine
     coordinates and the ivks' GLV digits;
   - **finish:** take the GPU's Jacobian results, batch-normalize, run the KDF
     and ChaCha20, parse via `Domain::parse_note_plaintext_without_memo_ivk`,
     and check cmx and epk.

   All of this uses public `zcash_note_encryption` / `orchard` / `sapling`
   trait methods. It does reimplement the compact path's ~60 lines, so add a
   test that its hits equal `batch::try_compact_note_decryption` on real chunks
   from zcrawler.dev.heliax.app.
2. **Kernels (3–5 days).**
   - Harden Pallas with complete formulas (RCB, about +25%), or with an
     exceptional-case flag plus CPU fallback. An unhandled exceptional case
     means a missed note, not just a slow path.
   - Add a Jubjub kernel for Sapling: Fr constants, Edwards formulas, cofactor.
   - Optional: decompress epks on the GPU, which takes another 7% off the CPU.
3. **Sync orchestration (4–5 days).**
   - One GPU worker shared by the decrypt workers, with batches pipelined so
     the CPU and GPU overlap.
   - Handle `device.lost`, hidden tabs, and phones' thermal limits.
   - A start-up self-test against wasm vectors that turns the GPU path off on
     any mismatch, since GPU drivers differ.
   - Keep the CPU fallback on every path.
4. **Testing (3–4 days).**
   - Run on Apple, NVIDIA, AMD, Intel, Adreno and Mali GPUs.
   - CI can check correctness with headless Chrome on Dawn's SwiftShader. It
     can't measure speed.

**Done when:**
- sync finds the same hits with and without the GPU on real chunks;
- the self-test and fallback hold on every vendor above;
- the 4–5× shows up in an app sync on the M1.

## Risks

- **The ivk enters GPU memory.** That memory belongs to the browser's GPU
  process, which is already shared and isolated, and an ivk can view notes but
  not spend them.
- **The ladder is variable-time in the ivk.** Pasta's CPU path is too.
- **Thermals:** running CPU and GPU together on a fanless M1 Air may throttle
  both.
- **Drivers:** GPU drivers differ in correctness. The self-test exists to catch
  this.

## Open questions

- Phone speedups and Safari's worker support (Phase 0).
- Intel iGPUs: not measured.
- Discrete NVIDIA or AMD GPUs likely have 10× or more of the M1 GPU's integer
  throughput, with about the same CPU core count, so the gain should be larger.
  Not measured.
- Sapling is estimated, not prototyped.

## Evidence

### Where the CPU time goes

Orchard's `batch::try_compact_note_decryption` over one chunk: 16,384 random
actions, external and internal ivk, V8 in Chrome 152, one thread, with zcore's
patched field multiply (#53).

| step | ms | share |
|---|---|---|
| full batch decrypt | 4,000 | 100% |
| key agreement: GLV tables (per epk, batched inversion) | 122 | 3% |
| key agreement: `[ivk]·epk` ladder, 2 ivks | 3,180 | 79% |
| epk decompression (sqrt) | 265 | 7% |
| shared secret → affine (batched inversion) | 17 | 0.4% |
| KDF (BLAKE2b) + ChaCha20, 52 bytes | 13 | 0.3% |
| the rest (domains, parsing, allocation) | ~400 | 10% |

The KDF and ChaCha20 cost almost nothing; only the curve arithmetic is worth
moving. The CPU path is already well optimised. Orchard 0.15.5 / pasta 0.5.2
use GLV with a width-4 wNAF Straus ladder, so each product costs about 127
doublings and about 51 additions.

**All cores:** `node cores.mjs` runs 8 workers × 16,384 outputs on the same
wasm and gets **55 µs per output**, or 0.90 s per chunk-equivalent. That
matches the browser run (57.6 µs) and the app's ~4.2 s single-core chunk.

### Prototype kernel

`shader.js` holds the WGSL kernel. Each thread takes one ephemeral key and
produces both ivk products.

- **Field:** Fp in 20 limbs of 13 bits, Montgomery with R = 2^260. A limb
  product is 26 bits, so a whole row accumulates in a u32 without carries.
  The ZPrize 2023 WebGPU entry (Derei & Koh) found this layout fastest on M1
  and M3.
- **Algorithm:** the same as pasta's, so the comparison is like for like.
  - GLV split, width-4 wNAF, a table of {1,3,5,7}·P;
  - the endomorphism applied on the fly (ζ·X);
  - Jacobian coordinates with dbl-2009-l and add-2007-bl.
- **No divergence:** the digits come from the ivk, so every thread gets the
  same ones. Control flow never diverges and table lookups are uniform.
- **Check:** the GPU returns Jacobian (X, Y, Z). The page checks X = x·Z² and
  Y = y·Z³ against wasm's affine output.

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
- One chunk already saturates the GPU; 4 chunks scale linearly.
- 0 mismatches out of 32,768.

**Kernel headroom is small.** A product takes about 1,800 field
multiplications of roughly 800 32-bit multiply-adds each. The kernel therefore
sustains about 0.27 T IMAD/s, against a peak of 0.33 T/s on the M1 GPU
(1,024 lanes × 1.278 GHz ÷ 4 cycles per IMAD32, per
[metal-benchmarks](https://github.com/philipturner/metal-benchmarks)). That is
about 80% of peak. Specialised squaring might add 10–15%; there is no 2× left
in the kernel. The 4× comes from the hardware.

### Estimates

- **Orchard / Ironwood, per chunk on M1:**
  - the GPU runs the ladder (176 ms);
  - the 8 workers keep parsing, decompression, normalisation, KDF/ChaCha and
    hit handling: the other ~18%, about 10 µs/output or 0.16 s per chunk;
  - pipelined, the two overlap: **about 0.2 s per chunk against 0.9 s today
    (4–5×)**.
- **Sapling:** Jubjub has no GLV, so a product needs about 252 doublings.
  Extended twisted-Edwards formulas make them cheap (dbl 8M, add 9M). That
  gives about 1.4× Pallas's field-mul count, **about 15 µs/output on the GPU**.
  Today's CPU cost is 6.8/4.2 × 55 ≈ 89 µs, so the gain is also **about 5×**.
- **Whole sync:** after this change, decryption takes less time than
  downloading, so downloads and the indexer set sync speed.

### Browser availability

From the gpuweb wiki, as edited 2026-10-02:

| browser | WebGPU |
|---|---|
| Chrome / Edge, desktop | Mac, Windows, ChromeOS since 113; Linux on Intel Gen12+ (144) and NVIDIA under Wayland (147), others behind a flag |
| Chrome, Android | Android 12+ on ARM / Qualcomm / Intel GPUs (121), Imagination on Android 16+ (139), others not yet |
| Safari | macOS / iOS / iPadOS 26 |
| Firefox | Windows (141), macOS (145 on 26+, 147 on all versions); Linux Nightly only; Android behind a flag |

Sync would call the GPU from a dedicated worker. `WorkerNavigator.gpu` works in
Chrome, and Safari 26 is unconfirmed (Phase 0). Everyone else stays on the CPU
path: old iOS, Firefox on Android and Linux, and older Android GPUs.

### Prior art

- **ZPrize 2023, WASM/WebGPU MSM:** Tal Derei & Koh Wei Jie won the
  best-WebGPU mention, on BLS12-377 and twisted Edwards. Their
  [write-up](https://hackmd.io/HNH0DcSqSka4hAaIfJNHEA) benchmarks limb widths
  of 12–16 bits on M1 and M3, and 13-bit limbs win. ICME Lab's `msm-webgpu`
  builds on it for BN254.
- **No public WebGPU code covers Pasta or Jubjub.** Pasta has CUDA MSMs
  (Supranational's `pasta-msm`) but no WGSL. The field code here is new but
  small: about 100 lines of WGSL for Fp, and the same code with Fr constants
  for Jubjub.
- **MSM techniques don't carry over:** Pippenger buckets solve a different
  problem. Trial decryption is many independent single-scalar products, which
  is simpler.

## Reproduce

```bash
packages/zcore/research/webgpu-decrypt/build.sh
```

```bash
python3 -m http.server 8766 -d packages/zcore/research/webgpu-decrypt
```

Open `http://localhost:8766/?n=16384` in Chrome or Safari 26.

- `&cpu=0` skips the all-core run. The browser throttles workers while the tab
  is hidden, so take the all-core baseline from `node cores.mjs` in that folder
  instead.
- `&wg=` sets the workgroup size.
