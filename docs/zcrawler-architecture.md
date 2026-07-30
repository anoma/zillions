# Birthday-free sync architecture

Status: draft for discussion. Built so far: the detection crawl on
`feat/zcrawler-last-to-first`. Everything else is proposal.

Companion services live in [heliaxdev/zcrawler](https://github.com/heliaxdev/zcrawler):
`zcrawler` (note/nullifier index) and `ziziphus` (Merkle trees).

## Goal

Any UFVK syncs with **no required birthday**. If the user supplies one it is a
pure accelerator; without it we scan from activation. Either way the crawl runs
newest-first so recent notes are visible and spendable early.

## Measured baseline

Taken 2026-07-30, `chunk_size = 4096`.

| | sapling | orchard |
|---|---|---|
| chain chunks (0..last) | 18,051 | 12,262 |
| chain positions | ~73.9M | ~50.2M |
| JSON payload | 307 B/note | 363 B/note |
| trial decrypt | 5,111 notes/s | 5,334 notes/s |

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
scanning both scopes is also what makes the newest-first crawl surface a correct
balance early rather than late.

## Division of labour

Rule: **reinvent the index, reuse everything downstream of "this note is mine."**

| Component | Owns |
|---|---|
| **zcrawler** | Note ciphertexts, commitments, nullifiers. Bulk trial-decrypt over immutable position chunks. Answers *which positions are mine* and *which nullifiers are spent*. |
| **ziziphus** | Merkle tree structure only. Chunk blobs + tip state; clients assemble witnesses offline. |
| **librustzcash** | Stateless crypto and consensus: decryption, fees, selection, PCZT build/prove. |
| **This repo** | Wallet state, orchestration, UI. |
| **lightwalletd** | Transparent UTXOs (`GetAddressUtxos`). Untouched by the crawler. |
| **Live tip** | Small enough to be ordinary. Not the crawler's problem. |

The crawler never touches the unsealed chunk — `last_chunk` becomes "last
*sealed* chunk", and the partial-tip gap (chunk 18051 serves 1331 of 4096)
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
  nullifier prefix buckets, which *do* leak — see Threat model below.
- **Cost per spend is bounded:** ~1 MiB per chunk holding an unspent note, plus
  one tip state.

**Grid alignment matters.** ziziphus chunks are 16,384 leaves; zcrawler's are
4,096. The 4:1 ratio means every ziziphus chunk is exactly four zcrawler chunks.
Worth preserving deliberately on both sides — it keeps position→chunk mapping
integer on both grids.

### Sizing correction

ziziphus's README sizes the upper domain at "~10 M notes → fewer than 620 chunk
roots". Mainnet today is ~74M sapling and ~50M orchard positions, so:

| | chunks | roots array | tip state |
|---|---|---|---|
| sapling | ~4,510 | ~144 KB | ~1.19 MiB |
| orchard | ~3,065 | ~98 KB | ~1.09 MiB |

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

| today | after |
|---|---|
| `get_transparent_receivers` (DB-backed) | stateless wasm `derive(ufvk, account, scope, from, count) -> addresses` |
| gap-limit widening loop | ports near-verbatim; it is a loop, a set, and a re-query |
| `utxo_query_height` | TS-held cursor |
| `put_received_transparent_utxo` | Dexie |

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
  directly, so spentness is *observed*, not inferred. The invariant below is
  shielded-specific. (Trust point: spentness is server-asserted — acceptable,
  since transparent is public anyway.)
- **Birthday-independent.** Gap-limit discovery always starts at index 0;
  `start_height` only prunes. No interaction with the birthday question at all.

Privacy: querying by address links your addresses to each other and to your IP.
That is inherent to transparent, not a fixable design flaw — do not engineer
around it.

Out of scope for now: ZIP-320 / TEX ephemeral addresses (the vendored backend
has `reserve_next_n_ephemeral_addresses` if needed) and transparent transaction
*history*, which needs chain history rather than the current UTXO set.

## Balance invariant: validated-before-spendable (shielded)

**A note counts toward balance only after its nullifier has been checked.**

This makes the balance *monotonically increasing* through the initial sync — it
only ever grows as history is discovered, never corrects downward. That is the
whole point: a shrinking balance mid-sync reads as lost funds.

It works because the nullifier bucket lookup is **chain-complete**: the bucket
contains every nullifier ever revealed, regardless of position, so a check is
final the moment it runs. Nullifiers harvested from scanned chunks would only be
complete once the entire chain had been scanned — which is precisely why the
bucket design is right, beyond the memory argument.

Mechanically: notes carry a validation flag; `getBalance` and input selection
both filter on it. Unvalidated notes are invisible, not "pending".

Monotonicity holds except for reorgs at the tip and the user's own spends. Both
are real events rather than corrections, and reorgs are bounded by only counting
notes below the sealed line.

## Optional birthday

A supplied birthday sets the crawl floor instead of activation; everything else
is unchanged, and the crawl still runs newest-first. The height → position
mapping this needs — chunks are indexed in position space, a birthday is a
block height — is a filter on the note tables, which already carry `height`:
`/chunks?birthday=H` returns `first_chunk` as the chunk holding the pool's
first note at that height or above. Exact downward, since that chunk straddles
the boundary and is scanned whole.

`ZWallet`'s `birthday` is optional and unset by default: full history stays the
baseline. It is deliberately not wired to the keychain account, whose birthday
still falls back to the chain tip — passing that through would hide every note
an imported account already had.

The floor is the one thing the birthday tells the indexer. That leaks the
account's approximate age, which the rest of the design does not.

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

| needed | in compact data? |
|---|---|
| value, recipient | yes |
| **memo** | no — compact carries 52 of the 580 ciphertext bytes |
| **txid** | no |
| **height** | sapling only; orchard has none |
| **outgoing payment details** | no — needs `out_ciphertext` + OVK |

That last row is easy to miss: showing "you sent X to address Y" for a shielded
send requires decrypting the 80-byte `out_ciphertext` with the outgoing viewing
key. Without it, your own sends are invisible except as vanished notes.

### Do not fetch by txid

The obvious implementation — resolve each hit to a txid, then `GetTransaction`
— would be **the largest privacy regression in the system**, worse than the
nullifier buckets: it tells the server exactly which transactions are yours.
ziziphus went to real lengths for a zero-leak design; undoing that at the last
step would be a poor trade.

### Instead: a second chunk tier

Serve full ciphertexts chunk-wise, on the same immutable grid, fetched **only
for chunks that produced a hit**:

| tier | contents | size | when fetched |
|---|---|---|---|
| compact | cmu/cmx, epk, 52 B enc prefix | 116 B/note | every chunk |
| full | `enc_ciphertext` 580 + `out_ciphertext` 80 + txid 32 + height | ~3 MB/chunk | hit chunks only |

Immutable, CDN-cacheable, and the leak is "this wallet has something in chunk
N" — an anonymity set of 4,096 outputs, the same shape as ziziphus's blobs. A
wallet with notes in 50 distinct chunks pays ~150 MB once, against ~14 GB for
the detection pass it already did.

### Spend side — open question for zcrawler

A nullifier match tells you a note was spent but not *where*. Rather than
inflating the membership artifact, publish a second artifact at the same prefix,
fetched **only on a match**, so it adds no leak beyond the bucket already
queried. Unspent notes are the common case and never fetch it.

What that artifact should carry is undecided, and it drives its download size.

**Is `txid` actually needed?** Three candidate locators:

| locator | bytes | covers | notes |
|---|---|---|---|
| `txid` | 32 | everything | what users and explorers expect — but **derivable** by hashing the raw tx once we have it |
| `height` + `txIndex` | 6 | everything | canonical chain ordering, so history sorts correctly with no extra data |
| output `position` | 8 | shielded outputs only | points straight into our position-indexed chunks; fails for unshielding txs with no shielded output |

Our architecture is position-indexed end to end, so a position is the most
directly useful — but it cannot describe a spend whose outputs are all
transparent. `height` + `txIndex` is universal, sorts history natively, and is
4× smaller than a txid. Since the enhance phase fetches transaction data anyway,
the txid can be computed locally rather than shipped.

**Size, and a way to make it small.** A 3-hex bucket holds ~24,000 entries. At
nullifier + txid that is ~1.5 MB; at nullifier + height + txIndex, ~912 KB. But
if `/spends/{prefix}/{seal}` is built in the **same sorted order** as the
membership artifact and sealed with it, it needs no nullifiers at all — just a
parallel array of fixed-size locators indexed by position in the membership
list. That is ~150–190 KB, an 8–10× reduction, and costs the server only a
guarantee that both artifacts share an ordering.

**Do not serve it via HTTP Range requests.** Fixed-size records make byte-offset
fetches tempting, but requesting record *i* reveals your nullifier's exact rank
in the bucket, collapsing k from ~24,000 to 1. Download the whole locator array;
at ~150 KB it is cheap enough that the shortcut buys nothing.

Questions for zcrawler: which locator, can the two artifacts share an ordering,
and does `GetTransaction` in the deployed lightwalletd accept block + index as
well as hash (it affects whether height + txIndex is self-sufficient)?

### Transparent history

`GetAddressUtxos` returns only the *unspent* set, so it cannot serve history.
Use lightwalletd's `GetTaddressTxids` per discovered address over the full
range, then parse inputs and outputs from the returned transactions. Cheap
(tens of addresses), immediate, and it leaks nothing beyond the address linkage
transparent balances already accept.

### Two properties that come free

- **Newest-first crawl yields newest-first history** — the display order is the
  discovery order, no re-sorting as sync progresses.
- **History grows monotonically** during sync, matching the balance invariant.
  Sort by height and nothing ever reorders.

Fees are computable for your own sends once the full tx is in hand (your inputs
minus outputs); for received txs they are not, and should not be displayed.
Pending outgoing txs are local state, not a sync concern.

## Nullifier distribution

The requirement is three-way: immutable (so CDN-cacheable), prefix-queryable (so
a client fetches little), and complete (so a check is final).

**A chunk × prefix cross-product fails the third.** `/{chunk}/{prefix}` objects
are immutable, but a nullifier can appear in *any* chunk, so checking one note
means fetching every chunk at that prefix — ~3,000 requests per note. Cacheable
and unusable.

**Make the base cumulative instead.** `/{prefix}/{sealed_upto}` holds every
nullifier with that prefix from genesis through `sealed_upto`: still immutable,
still cacheable forever, but one request covers all history.

That unlocks the property that matters most: **sealed history is immutable, so a
note's spentness against it never changes — checked once, ever, not once per
sync.** The client's query set then grows with note count, not with time, which
is what removes the accumulating-fingerprint leak.

### Tiering

Seal by **block height**, not note position — nullifiers are not positional, and
"settled" is naturally a height concept. Prefix-split **by object size**: over
~1 MB, split; under, serve whole. Only the cumulative base is ever big enough.

| tier | cadence | shape | client cost |
|---|---|---|---|
| base | monthly | prefixed, immutable | 1 request/note, once ever |
| mid | daily | prefixed if over ~1 MB | 1 request/note/month |
| tail | per block | whole, unprefixed | 1 download/sync, shared by all notes |

Prefix width on the base is a real choice. 4 hex = 65,536 buckets, ~1,500
nullifiers each, ~49 KB. 3 hex = 4,096 buckets, ~24,000 each, ~780 KB. Since the
base is fetched once per note *ever*, 3 hex is the better trade — 780 KB
one-time is nothing and k≈24,000 is a far stronger anonymity set.

### Tail sizing

Measured: sapling currently runs at **0.4 outputs/block** — chunk 18049's 4,096
consecutive mainnet outputs span heights 3,401,974–3,413,665. Real data, but one
~10-day window and sapling only.

Orchard is **unmeasured**: entries carry no `height` (ask 3), so ~29
actions/block is `50.2M ÷ blocks since NU5`, a lifetime average that likely
includes the same spam period. It is the weakest number here and the tail
cadence rests on it — measure before fixing the cadence.

At ~30 nullifiers/block combined, 32 B each:

| tail window | nullifiers | bytes |
|---|---|---|
| 1 hour | ~1,440 | ~46 KiB |
| 24 hours | ~34,600 | ~1.1 MiB |

So the tail is comfortably downloadable whole. It is also the *most* private
tier — everyone fetches identical bytes — which inverts the usual assumption
that the tip is the hard part.

### Threat model

- **ziziphus: no leak.** Global artifacts only.
- **Nullifier tail: no leak.** Downloaded whole.
- **Nullifier base/mid: bounded leak.** One prefix query per note, one time.
  With 3-hex buckets that is k≈24,000, and the query set does not grow with
  time. This is the only remaining leak in the system, and it is a fixed,
  bounded one.

## Asks for zcrawler / ziziphus

1. **Binary `/sync` payload.** Biggest single win available (~2.7×).
2. **Height → position mapping per pool.** Blocks the optional birthday.
3. **`height` on orchard entries.** Sapling has it; orchard does not. Needed for
   tail sizing and for ordering history.
3b. **A full-ciphertext chunk tier** (`enc_ciphertext` + `out_ciphertext` +
   txid + height, same grid, ~3 MB/chunk). Required for memos and for showing
   your own sends; fetched only for hit chunks. See Transaction history.
3c. **A `/spends/{prefix}/{seal}` detail artifact** alongside the membership
   artifact, fetched only on a match. Locator format is open — see Spend side.
4. **Block height in the ziziphus tip state.** The struct carries `tree_size`
   but no height, so the client cannot confirm the anchor sits inside the
   100-block window or set tx expiry. Small addition, blocks the spend path.
5. **Keep the 4:1 chunk-grid alignment** between the two services explicit.
6. **Confirm the upper-domain sizing** against real mainnet counts (above).
7. **Cumulative-base + tiered-tail nullifiers**, sealed by height, replacing the
   per-note prefix bucket endpoint (see Nullifier distribution).

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
6. **Spend locator format** — txid vs height + txIndex vs position, and whether
   the spend and membership artifacts can share an ordering. Sets the download
   size of every spend lookup. See Spend side.

## Phases

0. Seal the tip: `last_chunk` = last *sealed* chunk. Small; fixes a live
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
