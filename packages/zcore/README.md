# @zillions/zcore

A Zcash wallet core in Rust, compiled to WebAssembly for the browser. It
covers keys and addresses, finding a wallet's notes, planning and building
transactions as PCZTs, signing, and proving, for transparent, Sapling,
Orchard and Ironwood (NU6.3).

It's stateless: no database, no network, no sync loop. The caller fetches
chain data, keeps the wallet's state, and passes in what each call needs.
Cryptography and wallet policy (note selection, fees, change) come from
librustzcash rather than being re-implemented; see
[UPGRADING.md](UPGRADING.md).

## Use

The wasm build in `pkg/` is committed, so using the package needs no Rust.

```ts
import init, { derive_account, fresh_address } from "@zillions/zcore";

await init(); // once, before any other call

const { ufvk } = derive_account("main", seed, 0);
const address = fresh_address("main", ufvk);
```

- `network` is `"main"` or `"test"`.
- `pool` is `"sapling"`, `"orchard"` or `"ironwood"`.
- Amounts are zatoshis.
- Bad input throws a JS `Error`.

The full signatures and return shapes are in [`pkg/zcore.d.ts`](pkg/zcore.d.ts).

## API

**Keys and addresses**

| Function             | Does                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `derive_account`     | A seed's ZIP 32 account: viewing key and addresses                 |
| `seed_fingerprint`   | Names a seed without revealing it                                  |
| `spending_keys`      | An account's Orchard and Sapling spending keys                     |
| `fresh_address`      | A new shielded address, unlinkable to the account's others         |
| `derive_transparent` | A range of transparent addresses on the external or internal chain |

**Finding notes**

| Function            | Does                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `try_decrypt`       | Trial-decrypts one chunk of compact ciphertexts (2¹⁴ notes per chunk) |
| `try_decrypt_full`  | Trial-decrypts a hit chunk in full: adds memos and the wallet's sends |
| `parse_transaction` | The transparent inputs and outputs of a raw transaction               |

**Sending**, in the order a send runs:

| Function                   | Does                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| `plan_send`, `plan_shield` | Picks the notes and coins, change and fee                              |
| `max_send`                 | The most a send can pay after fees                                     |
| `send_pczt`, `shield_pczt` | Builds the unsigned PCZT; needs each spent pool's note commitment tree |
| `pczt_summary`             | What a PCZT moves, to show before signing                              |
| `sign_pczt`                | Signs with the seed: run it wherever the seed lives                    |
| `needs_sapling_params`     | Whether proving needs the Sapling parameters (~51 MB)                  |
| `prove_pczt`               | Proves the signed PCZT and returns the raw transaction to broadcast    |

Proving takes seconds; run `prove_pczt` in a Web Worker. The Sapling
parameters ship in [`@zillions/sapling-params`](../sapling-params/README.md).

Chunk and tree inputs are the indexer's raw responses (`/ciphertexts`,
`/memos`, `/outgoing`, the tree tip and frozen tree chunks), passed through
unchanged.

## Build

You'll need Rust 1.88+ with the `wasm32-unknown-unknown` target,
[wasm-pack](https://rustwasm.github.io/wasm-pack/), and a clang that targets
wasm32. On macOS, Apple's clang can't target wasm32; `brew install llvm` and the
script picks it up.

```bash
./build.sh
```

This rebuilds `pkg/`. Commit it along with the Rust change.

## Test

```bash
cargo test --release
```

This includes end-to-end proofs for every pool. `./test-ziziphus.sh` also
checks a live indexer's Sapling tree against the chain's.

## License

MIT OR Apache-2.0
