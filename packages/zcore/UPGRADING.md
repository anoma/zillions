# Upgrading librustzcash

zcore keeps Zcash's cryptography and wallet policy upstream: it calls
`zcash_client_backend` and the crates under it rather than re-implementing
them. A few pieces are ported or mirrored because upstream's versions need
its storage; each is listed below with the upstream source it follows. A
bump isn't done until every item has been re-compared.

Current line: `zcash_client_backend` 0.25.0, `zcash_primitives` 0.31,
`zcash_keys` 0.17, `zcash_protocol` 0.11, `zcash_transparent` 0.11,
`orchard` 0.16, `sapling-crypto` 0.9, `pczt` 0.10, `zcash_address` 0.14,
`incrementalmerkletree` 0.9, `zip32` 0.3. Mirrored storage:
`zcash_client_sqlite` 0.23.

## 1. Bump together

Move the whole family to one release line at once; mixed lines don't
compile or, worse, disagree on consensus rules. Rust version: `rust-version`
in `Cargo.toml`.

If the family moves to new `pasta_curves` or `bls12_381` versions, the
patches in `patches/` stop applying (Cargo only warns that a patch is
unused): redo them for the new versions, or drop them if upstream has the
change (`patches/README.md`).

## 2. Re-compare what zcore ports or mirrors

| zcore                           | follows upstream                                                                | what to check                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `send.rs` `propose`             | backend `data_api/wallet.rs` `propose_transfer` (0.25.0: lines 777–950)         | the ZIP 318 canonical-crossing attempt and its fallback, `check_transaction_size`, anything new it does before or after input selection                |
| `send.rs` `propose_shield`      | backend `propose_shielding`                                                     | threshold, coinbase filter, size check                                                                                                                 |
| `send.rs` `max_amount`          | backend `input_selection.rs` `propose_send_max` (crate-private)                 | switch to it once public; until then the binary search and its dust-gap step                                                                           |
| `build.rs` `pczt`               | backend `build_proposed_transaction` and `create_pczt_from_proposal`            | bundle padding, ZIP 318 expiry, outgoing viewing key policy, change per pool (Orchard's post-NU6.3 change rule), ZIP 32 / BIP 44 paths, user addresses |
| `wallet.rs` (`InputSource`)     | sqlite `lib.rs` `impl InputSource`, `wallet/common.rs`, `wallet/transparent.rs` | new or changed trait methods; dust, ordering and confirmation rules (pinned by `wallet.rs` tests)                                                      |
| `wallet.rs` `anchor_computable` | —                                                                               | answers `false` until ziziphus serves roots at ZIP 318 bucket heights                                                                                  |
| `roles.rs` `sign`               | `pczt` signer / verifier                                                        | Sapling proof generation key per key scope, any new pool                                                                                               |

## 3. For a network upgrade

- New pools or note plaintext versions: decryption domains (`lib.rs`), the
  spendable-note encoding (`notes.rs`), tree hashing (`witness.rs`), signing
  (`roles.rs`), and the app's pool list.
- Consensus branch for parsing (`transparent_tx.rs`) and building.
- Fee rules (ZIP 317) and ZIP 318 parameters: nothing to change if upstream
  carries them, but check the shielding threshold still makes sense.
- Block limits the planner must respect that upstream doesn't check:
  `check_block_limits` in `send.rs`.
- A new block time or a height with one: `chain/blockTime.ts` in the app, and
  anything counted in blocks that stands for a time (`docs/design/migration.md`).

## 4. Verify

```sh
cargo test --release            # includes end-to-end proofs for every pool
cargo audit                     # CI also runs it daily
./test-ziziphus.sh              # live ziziphus data against the chain
./build.sh                      # then smoke-test /send (plan, Max) and /shield
```

`test-ziziphus.sh` runs the ignored `real_ziziphus` test (see `witness.rs`)
on the dev indexer's Sapling tree and lightwalletd's; `INDEXER_URL` and
`GRPC_URL` point it elsewhere.
