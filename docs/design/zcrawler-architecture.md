# Birthday-free sync architecture

Status: July 2026 design notes, partly built. **Sync as built** below is
the current state; where an older section disagrees, it wins.

Companion services live in [heliaxdev/zcrawler](https://github.com/heliaxdev/zcrawler):
`zcrawler` (note/nullifier index) and `ziziphus` (Merkle trees).

## Goal

Any UFVK syncs with **no required birthday**. If the user supplies one it is a
pure accelerator; without it we scan from activation. Either way the crawl runs
newest-first, so recent funds and history show first.

## Sync as built (October 2026)

All of it comes from the remote indexer's `/api/v1` (binary, postcard) and
lightwalletd; nothing from a local crawler.

- **Grid.** Ciphertext, memo, outgoing and tree chunks are 2¹⁴ notes;
  nullifier chunks are 2¹⁸. Full chunks are `immutable` for a year; the tail
  chunk is `max-age=3`.
- **Floor.** Chunk 0, or with a birthday the first chunk whose `max_height`
  reaches it: a binary search over chunk headers, each a 16-byte Range request.
- **Order.** Each pool newest-first, from the tip down to the floor, one pool
  after another (Ironwood, Orchard, Sapling). Workers decrypt in parallel;
  results are applied strictly in chunk order. Each pool keeps the window of
  chunks read; a later sync first reads the chunks minted since, down to the
  window's top again (it may have been the filling tip), then continues below
  the window.
- **Notes.** `/ciphertexts` for every chunk; `/memos` and `/outgoing` only for a
  chunk holding a hit or a spend of ours. Outgoing recovery covers the whole
  chunk, so it also finds what our spending transactions paid out.
- **Spends.** Newest-first reads the chunk spending a note before it finds
  the note, so each note found, and each one still unspent at a sync's
  start, is looked up by nullifier: `POST /{pool}/spent`, up to 1,000 per
  request, answers where each was revealed (height and transaction index) or
  that it isn't yet, as of the indexer's committed tip. Exact for all three
  pools, Sapling included. **Temporary:** it tells the indexer which
  nullifiers are ours (see Threat model).
- **Sends across pools.** A payment can sit in a pool where we hold nothing,
  so the crawl never reads its chunk. After each sync, every transaction of
  ours that spent something is placed exactly: its compact block's tree sizes
  (ChainMetadata 1–3) minus the notes it and later transactions add (CompactTx
  fields 5, 6, 9) give its notes' positions in each pool, and those chunks'
  `/outgoing` are read once.
- **Sends to transparent addresses.** `/outgoing` only recovers shielded
  outputs. A sending transaction's transparent outputs come from the same
  compact block (CompactTx field 8: value and script); those not paying one of
  our addresses are its payments. No extra request, so nothing new is revealed.
- **Balance.** A note counts once its spend lookup says unspent, so funds show
  newest first as the crawl finds them.
- **Pending sends.** A broadcast's raw transaction names the nullifiers and
  coins it spends; those are held out of the balance and of new plans until a
  spend of theirs shows up on chain, or 10 blocks past its expiry (the indexer
  trails the chain). Its change counts as pending meanwhile.
- **Retries.** Indexer and lightwalletd calls retry network errors, 403
  (CloudFront's rate limit), 408, 429 and 5xx for about a minute; a broadcast
  is never retried. A sync that still fails resumes from its cursor.
- **Reorgs.** Not handled by the indexer: it stores blocks 2–3 behind the tip
  and never rewrites a height. See ask 8.

## Measured baseline

Taken 2026-07-30, `chunk_size = 4096`.

|                        | sapling       | orchard       |
| ---------------------- | ------------- | ------------- |
| chain chunks (0..last) | 18,051        | 12,262        |
| chain positions        | ~73.9M        | ~50.2M        |
| JSON payload           | 307 B/note    | 363 B/note    |
| trial decrypt          | 5,111 notes/s | 5,334 notes/s |

**Provenance — these are mainnet-scale, not local-index counts.** Totals derive
from `last_chunk`, the absolute tree position of the newest indexed note
(73.9M / 4096 = 18,051). Cross-check: that note sits at height 3,413,665, and
150 s/block to block 653,600 then 75 s/block puts mainnet at ~3.44M by mid-2026,
so the indexer is at or near the real tip.

`first_chunk` is **not** the chain's floor — it is the indexer's coverage floor
(18,048 sapling today, i.e. four chunks served). `ZWallet` uses it as the crawl
floor, which is correct behaviour but means full-history scale is untested until
the backfill lands.

Throughput is single-core, native `--release`, both scopes, via
`batch::try_compact_note_decryption` over real chunk data.

**Growth vs. debt.** Sapling's lifetime average is ~24.7 outputs/block against
0.4/block today — the 2022–23 shielded spam sits inside these totals. So the
~14.4 GB is largely a fixed historical debt (sapling adds ~146k positions/year
at current rates against a 74M base). Whether orchard behaves the same is
unknown, and rests on the unmeasured rate below.

**~124.2M outputs is the workload.** Two budgets follow:

- **Bytes.** JSON hex today: **~41 GB** per full scan. Binary compact
  (cmu 32 + epk 32 + enc_head 52 = 116 B) floor: **~14.4 GB**.
- **CPU.** 124.2M / 5.2k ≈ **6.6 core-hours** → ~50 min on 8 native cores.
  Wasm penalty assumed 1.5–3×, unmeasured.

## Levers

1. **Binary payload.** ~2.7× on **bytes only**. Parsing is ~2% of decrypt time
   (11.6 ms sapling / 7.4 ms orchard per 4,096), so this buys no CPU. A
   precondition for the bandwidth budget, not a speedup.
2. **CDN.** Sealed chunks are immutable and byte-identical for every user.
   Origin cost is O(chain), not O(users). Same for every ziziphus artifact.
3. **Parallelism.** One worker per core, already there.
4. **Not a lever: skipping chunks.** Detection must touch every output. That is
   what dropping the birthday means, and no index avoids it without handing the
   server a viewing key.
5. **Not a lever: skipping the internal scope.** Both scopes are always scanned.
   "Internal" is a wallet-side convention about which key receives change, not a
   protocol rule — the address is an ordinary shielded address that anything can
   send to. librustzcash's own `shield_transparent_funds` targets it, and any
   wallet holding your UFVK, exposing a change address, or mishandling scope
   selection can put funds there. Skipping it trusts every implementation that
   has ever touched the account instead of trusting the crypto, and it fails by
   silently under-reporting a balance.

Change notes are internal-scope and land near the tip for an active wallet, so
scanning both scopes is also what makes a change note count wherever the
crawl finds it.

## Division of labour

Rule: **reinvent the index, reuse everything downstream of "this note is mine."**

| Component        | Owns                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **zcrawler**     | Note ciphertexts, commitments, nullifiers. Bulk trial-decrypt over immutable position chunks. Answers _which positions are mine_ and _which nullifiers are spent_. |
| **ziziphus**     | Merkle tree structure only. Chunk blobs + tip state; clients assemble witnesses offline.                                                                           |
| **librustzcash** | Stateless crypto and consensus: decryption, fees, selection, PCZT build/prove.                                                                                     |
| **This repo**    | Wallet state, orchestration, UI.                                                                                                                                   |
| **lightwalletd** | Transparent UTXOs (`GetAddressUtxos`). Untouched by the crawler.                                                                                                   |
| **Live tip**     | Small enough to be ordinary. Not the crawler's problem.                                                                                                            |

The crawler never touches the unsealed chunk — `last_chunk` becomes "last
_sealed_ chunk", and the partial-tip gap (chunk 18051 serves 1331 of 4096)
stops existing rather than needing a fix.

## Witnesses: ziziphus resolves this

ziziphus splits the depth-32 tree into a depth-14 lower domain (frozen 16,384-leaf
chunks, served as dense 1 MiB flat binary heaps) and a depth-18 upper domain
(chunk roots + pre-folded ommer frontier, served in the tip state). Clients
extract a 14-level path by array indexing with **zero hashing**, then combine it
with the upper frontier offline.

Three consequences for us:

- **No `shardtree` on the client.** The largest objection to a crawler-first
  design is gone. We never maintain a commitment tree.
- **No positional leak.** There are deliberately no per-note endpoints; every
  client fetches the same global artifacts. This is strictly better than the
  nullifier prefix buckets this design first had, which _did_ leak.
- **Cost per spend is bounded:** ~1 MiB per chunk holding an unspent note, plus
  one tip state.

**Grid alignment matters.** ziziphus chunks are 16,384 leaves; zcrawler's are
4,096. The 4:1 ratio means every ziziphus chunk is exactly four zcrawler chunks.
Worth preserving deliberately on both sides — it keeps position→chunk mapping
integer on both grids.

### Sizing correction

ziziphus's README sizes the upper domain at "~10 M notes → fewer than 620 chunk
roots". Mainnet today is ~74M sapling and ~50M orchard positions, so:

|         | chunks | roots array | tip state |
| ------- | ------ | ----------- | --------- |
| sapling | ~4,510 | ~144 KB     | ~1.19 MiB |
| orchard | ~3,065 | ~98 KB      | ~1.09 MiB |

Still fine — depth-18 holds 262,144 chunks — but the roots array is ~7× the
README's estimate, and total frozen blob storage is ~7.4 GB rather than ~600 MB.
Worth confirming with the ziziphus author that this was budgeted.

## Transparent balances

**Transparent needs none of the crawler machinery** — no trial decryption, no
Merkle tree, no nullifiers, no chunks. It is an address → UTXO lookup, and a
working librustzcash-based implementation is already merged:
`sync_refresh_utxos` ([wallet.rs:388](../sdk/crates/zillions-sdk-wallet/src/wallet.rs:388),
PRs #7 and #9) does gap-limit-windowed receiver derivation, `GetAddressUtxos`
over lightwalletd, and `WalletTransparentOutput` assembly.

Keep from librustzcash, no exceptions — key derivation and BIP-44 paths
(`zcash_keys` / `zcash_transparent`), address encoding, and the
`WalletTransparentOutput` / `OutPoint` / `TxOut` / `Script` types at build time.
Hand-rolling any of these is how funds go to addresses nobody controls.

Moves to TS when `zcash_client_memory` retires:

| today                                   | after                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `get_transparent_receivers` (DB-backed) | stateless wasm `derive(ufvk, account, scope, from, count) -> addresses` |
| gap-limit widening loop                 | ports near-verbatim; it is a loop, a set, and a re-query                |
| `utxo_query_height`                     | TS-held cursor                                                          |
| `put_received_transparent_utxo`         | Dexie                                                                   |

**Source of UTXOs: keep lightwalletd `GetAddressUtxos`.** It works, it is wired,
and moving it to zcrawler buys nothing — UTXO sets are mutable, so there is no
CDN win, and the crawler's advantage (bulk trial decryption) has no transparent
analogue. Cost is that the app talks to two backends; revisit only if dropping
grpc-web entirely becomes a goal.

Three properties differ from shielded and are worth exploiting:

- **Immediate and exact.** Seconds, not hours. Show the transparent balance
  while the shielded backfill runs — it is the fastest path to a wallet that
  looks alive.
- **No validation gate needed.** `GetAddressUtxos` returns the unspent set
  directly, so spentness is _observed_, not inferred. The invariant below is
  shielded-specific. (Trust point: spentness is server-asserted — acceptable,
  since transparent is public anyway.)
- **Birthday-independent.** Gap-limit discovery always starts at index 0;
  `start_height` only prunes. No interaction with the birthday question at all.

Privacy: querying by address links your addresses to each other and to your IP.
That is inherent to transparent, not a fixable design flaw — do not engineer
around it.

Out of scope for now: ZIP-320 / TEX ephemeral addresses (the vendored backend
has `reserve_next_n_ephemeral_addresses` if needed) and transparent transaction
_history_, which needs chain history rather than the current UTXO set.

## Balance invariant: validated-before-spendable (shielded)

**A note counts toward balance only after its nullifier has been checked.**

This makes the balance _monotonically increasing_ through the initial sync — it
only ever grows as history is discovered, never corrects downward. That is the
whole point: a shrinking balance mid-sync reads as lost funds.

It holds because a note is only marked unspent once the indexer's spend
lookup, as of its committed tip, finds no spend of it; unspent notes are
looked up again every sync.

Mechanically: `Note.spend.status` is `unchecked` until looked up;
`getBalance` and input selection count only `unspent`.

Monotonicity holds except for reorgs at the tip and the user's own spends. Both
are real events rather than corrections, and reorgs are bounded by only counting
notes below the sealed line.

## Optional birthday

A supplied birthday sets the crawl's start chunk instead of chunk 0. Chunks are
indexed by position and a birthday is a height, so the start is found by
binary search over chunk headers, which carry each chunk's min, median and max
height: about a dozen 16-byte Range requests per pool, done once.

`ZWallet`'s `birthday` comes from the Keychain account; without one the whole
history is scanned.

Which chunks the search reads tells the indexer roughly how old the account
is, which the rest of the design does not.

## Replacing `zcash_client_memory`

It is a WebZjs derivative, stalled around NU6.1, and now largely redundant:
with ziziphus owning the tree, `WalletCommitmentTrees` — the hardest part to
reimplement — is dead weight. What remains is notes, accounts, a scan queue and
transactions, all of which `ZWallet` already re-implements in TS over Dexie.

**Recommendation: retire it rather than replace it, with PCZT as the seam.**

TS owns wallet state; Rust stays stateless. The app already imports `Pczt`, and
`zillions-sdk-wallet` already has the PCZT create/prove/combine error surface,
so this seam exists — it just isn't the primary path yet.

What that leaves genuinely hard, and the one real risk: **note selection and
ZIP-317 fees**. Getting them wrong means overpaying or building txs that do not
relay. Before committing, spike whether `zcash_client_backend`'s input-selection
and `ChangeStrategy` helpers can be driven from caller-supplied inputs without a
full `WalletDb`. If they can, this is clearly right. If they cannot, the fallback
is `zcash_client_sqlite` — the canonical upstream implementation, already an
optional dep here behind the `sqlite-db` feature — at the cost of proving
rusqlite builds for `wasm32-unknown-unknown`, which is not a given.

Not a criterion right now: wasm size.

## Persistence granularity

**Whole-wallet serialization is acceptable for now, and needs revisiting once we
know the real size.** With no client-side tree, wallet state is notes + scan
ranges + accounts, which should land in the hundreds of notes and tens of KB —
but that is an estimate, not a measurement. Per-note writes are premature until
a full-history scan against a live UFVK shows what a real wallet actually holds.

`ZWallet.#save` rewriting the whole note set per chunk is therefore acceptable,
and its `TODO` can stay a TODO.

## Transaction history

History is **not a new subsystem** — it is the enhance phase, which balances can
skip and history cannot. Treat them as one mechanism.

Compact data is structurally insufficient for it:

| needed                       | in compact data?                                    |
| ---------------------------- | --------------------------------------------------- |
| value, recipient             | yes                                                 |
| **memo**                     | no — compact carries 52 of the 580 ciphertext bytes |
| **txid**                     | no                                                  |
| **height**                   | sapling only; orchard has none                      |
| **outgoing payment details** | no — needs `out_ciphertext` + OVK                   |

That last row is easy to miss: showing "you sent X to address Y" for a shielded
send requires decrypting the 80-byte `out_ciphertext` with the outgoing viewing
key. Without it, your own sends are invisible except as vanished notes.

### Do not fetch by txid

The obvious implementation — resolve each hit to a txid, then `GetTransaction`
— would be **the largest privacy regression in the system**: it tells the
server exactly which transactions are yours.
ziziphus went to real lengths for a zero-leak design; undoing that at the last
step would be a poor trade.

### Instead: a second chunk tier

Serve full ciphertexts chunk-wise, on the same immutable grid, fetched **only
for chunks that produced a hit**:

| tier    | contents                                                      | size        | when fetched    |
| ------- | ------------------------------------------------------------- | ----------- | --------------- |
| compact | cmu/cmx, epk, 52 B enc prefix                                 | 116 B/note  | every chunk     |
| full    | `enc_ciphertext` 580 + `out_ciphertext` 80 + txid 32 + height | ~3 MB/chunk | hit chunks only |

Immutable, CDN-cacheable, and the leak is "this wallet has something in chunk
N" — an anonymity set of 4,096 outputs, the same shape as ziziphus's blobs. A
wallet with notes in 50 distinct chunks pays ~150 MB once, against ~14 GB for
the detection pass it already did.

### Spend side — resolved

A spend's place is a height and transaction index, which sorts history and
names the transaction through its block's txids.

- **Orchard and Ironwood:** exact, from the spending action's own
  `/ciphertexts` record (rho) and its `/memos` record. No artifact needed.
- **Sapling:** a nullifier match proves the spend; the transaction is found
  among our own, through the Sapling nullifiers in their compact blocks.

### Transparent history

`GetAddressUtxos` returns only the _unspent_ set, so it cannot serve history.
Use lightwalletd's `GetTaddressTxids` per discovered address over the full
range, then parse inputs and outputs from the returned transactions. Cheap
(tens of addresses), immediate, and it leaks nothing beyond the address linkage
transparent balances already accept.

### A property that comes free

- **History grows monotonically** during sync, matching the balance invariant.
  Sort by height and nothing ever reorders.

Fees are computable for your own sends once the full tx is in hand (your inputs
minus outputs); for received txs they are not, and should not be displayed.
Pending outgoing txs are local state, not a sync concern.

## Nullifier distribution

As built: `/{pool}/nullifiers/{chunk}`, 2¹⁸ nullifiers per chunk in chain
order, the first 10 of each nullifier's 32 bytes. A full chunk is sorted and
Elias-Fano compressed (~2.4 MB) and never changes; the tail is raw, in chain
order. Clients download whole chunks, so the server learns nothing about which
nullifiers they hold.

80 bits is plenty for a lookup: the chance another nullifier shares a note's
prefix is ~52M / 2⁸⁰. Consensus needs all 32 bytes because it must resist an
attacker grinding collisions; a wallet only checks its own, random values.

| pool     | nullifiers              | chunks          | total   |
| -------- | ----------------------- | --------------- | ------- |
| Sapling  | 2.14M                   | 8 full + tail   | ~20 MB  |
| Orchard  | ~50.5M (one per action) | 192 full + tail | ~461 MB |
| Ironwood | 0.66M (one per action)  | 2 full + tail   | ~6 MB   |

The client no longer reads them: spends come from the `/spent` lookup (see
Sync as built). They are the private way back once that lookup goes.

### Threat model

- **ziziphus: no leak.** Global artifacts only.
- **Spent lookup: full leak, temporary.** `/spent` sees every nullifier the
  wallet holds, can link them to each other and to the client's IP, and
  learns when each is spent. Accepted for newest-first sync until the indexer
  offers a private lookup.
- **Memos and outgoing: bounded leak.** Fetched only for chunks holding a note
  or spend of ours: "this wallet has something in chunk N", k = 16,384.
- **Birthday: bounded leak.** The start-chunk search hints at the account's age.

## Asks for zcrawler / ziziphus

1. **Binary `/sync` payload.** Biggest single win available (~2.7×).
2. **Height → position mapping per pool.** Blocks the optional birthday.
3. **`height` on orchard entries.** Sapling has it; orchard does not. Needed for
   tail sizing and for ordering history.
   3b. **A full-ciphertext chunk tier** (`enc_ciphertext` + `out_ciphertext` +
   txid + height, same grid, ~3 MB/chunk). Required for memos and for showing
   your own sends; fetched only for hit chunks. See Transaction history.
   3c. ~~A `/spends/{prefix}/{seal}` detail artifact~~ — not needed; see Spend side.
4. **Block height in the ziziphus tip state.** The struct carries `tree_size`
   but no height, so the client cannot confirm the anchor sits inside the
   100-block window or set tx expiry. Small addition, blocks the spend path.
5. **Keep the 4:1 chunk-grid alignment** between the two services explicit.
6. **Confirm the upper-domain sizing** against real mainnet counts (above).
7. ~~Cumulative-base + tiered-tail nullifiers~~ — served instead as whole
   2¹⁸ chunks (see Nullifier distribution).
8. **Reorgs.** Store only confirmed blocks (~10 deep) or rewrite reorged
   heights: today a reorg in the last 2–3 blocks leaves stale notes,
   nullifiers and tree roots, some in year-long `immutable` chunks.
9. **The Orchard nullifier tail times out** (504 after 90 s; the chunk after
   it 404s with a DB error). Unused by this client, but broken.
10. **A private spent lookup** to replace `/spent` (heliaxdev/zcrawler#16),
    which reveals the wallet's nullifiers.

## Open questions

1. **Hit density** — how many chunks hold a note for a typical wallet? It prices
   the enhance phase directly: each hit chunk is a ~3 MB fetch. Measure against a
   live UFVK with real history.
2. **Wasm decrypt throughput** — the 1.5–3× penalty is assumed. Decides whether
   bytes or CPU is the binding constraint.
3. **Selection/fees without `WalletDb`** — the spike above.
4. **Anchor selection policy** — how far behind the tip, and its interaction
   with the validated-before-spendable rule.
5. **Real wallet size** — note count and serialized bytes after a full-history
   scan. Decides whether whole-wallet writes stay acceptable or per-note
   persistence is needed. Falls out of the same live-UFVK run as Q1.
6. ~~Spend locator format~~ — height + transaction index; see Spend side.

## Phases

0. Seal the tip: `last_chunk` = last _sealed_ chunk. Small; fixes a live
   data-loss bug.
1. Validated-before-spendable flag. Small, and it makes every later phase safe
   to ship incrementally.
2. Transparent balance into `ZWallet`, porting `sync_refresh_utxos`. Independent
   of everything else here, and the fastest visible result — an exact balance in
   seconds while shielded backfills.
3. Binary payload (bandwidth). Measure wasm throughput (Q2) alongside it, so the
   binding constraint is known before any further optimization work.
4. Enhance phase: full-ciphertext chunk tier → memos, txids, outgoing details.
   Serves both history and the spend path. Measure hit density (Q1), which is
   what prices it.
5. Transparent history via `GetTaddressTxids`. Independent of 4.
6. ziziphus witness assembly; spend path end to end. Needs asks 3b and 4.
7. Live tip as an ordinary tip-follow; retire the crawler's tip handling.
8. Retire `zcash_client_memory` once 6 proves the PCZT seam. Needs Q3 first.
