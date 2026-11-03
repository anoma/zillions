# Patched curve crates

`../patch-crates.sh` unpacks `pasta_curves` 0.6.1 and `bls12_381` 0.9.0 from
crates.io into `../patched/`, checks them against `SHA256SUMS` (the same
checksums Cargo.lock had for them), and applies the patch named after each.
`[patch.crates-io]` in `../Cargo.toml` points there.

Each patch changes one function: `mac` (multiply-accumulate, the core of every
field multiplication) builds its 64×64→128-bit product from four 32-bit
multiplications instead of a `u128` one. wasm has no wide multiply, so a
`u128` product becomes a call to the compiler runtime's `__multi3`, which took
46% of trial-decryption time. `pasta_curves` is Orchard and Ironwood's field,
`bls12_381`'s scalar is Sapling's. The change applies on every target, so
`cargo test` covers it natively too.

One chunk of 16,384 notes on an M1, crates.io → patched:

| Engine                         | Orchard                       | Sapling                       |
| ------------------------------ | ----------------------------- | ----------------------------- |
| Chrome / Node (V8)             | 5.4 → 4.2 s (−21%)            | 10.2 → 6.8 s (−33%)           |
| Firefox 150                    | 5.2–6.1 → 4.5–4.8 s (−13–22%) | 8.4–9.1 → 7.3 s (−12–19%)     |
| Safari engine (JavaScriptCore) | 5.6–6.2 → 4.8 s (−15–23%)     | 10.5 → 10.3 s (−2%)           |

In the app (Chrome, 8 workers), a fresh sync of a test wallet from block
3,342,500 took 140 s before and 108–113 s after, with the same balance and
history.

## Benchmark

`bench/` times `mac` on its own (the `u128` version against the new one) and a
field multiplication from each crate, in wasm, crates.io → patched:

```sh
bench/build.sh && node bench/bench.mjs
```

On an M1 (Node 24): `mac` −28%; pasta `Fp` and `Fq` and bls12_381 `Scalar`
multiplication −33%.

To run it on GitHub's x86-64 Linux and Windows runners (and optionally macOS),
start the `field-bench` workflow from the Actions tab.

## Leaving

The goal is the same change upstream, behind `cfg(target_arch = "wasm32")`:
`zcash/pasta_curves` and `zkcrypto/bls12_381`. Before opening those PRs,
measure it on more devices: x86-64 Windows and Linux, phones. Once upstream
releases it, delete this directory, `../patch-crates.sh`, the
`[patch.crates-io]` section and `.github/workflows/field-bench.yml`, and bump
the crates.
