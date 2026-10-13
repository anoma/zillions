# Sync phases

Status: built 2026-10-09. It builds on the newest-first
sync and the indexer's spent lookup (#56); see
[zcrawler-architecture.md](zcrawler-architecture.md) for those.

## Why

Newest-first alone isn't enough. A fresh import with no birthday means reading
~16 GB and ~17.6 CPU-hours, and the spam era (heights 1.71M–2.1M) is ~94% of
that. Running every core flat out for hours makes Chrome offer to "Fix this
tab" (freeze it). The wallet must be usable in minutes and stay polite while
older history fills in.

## Phases

Every phase reads each pool newest-first, in the same pool order:
**Ironwood > Orchard > Sapling**. A phase is global, not per pool: it ends when
the last pool finishes it, and a pool with nothing in a phase's range adds no
work.

| Phase       | Range (per pool)                                                                            | Workers      | Indicator                          |
| ----------- | ------------------------------------------------------------------------------------------- | ------------ | ---------------------------------- |
| 1. Catch-up | chunks minted since the last sync                                                           | one per core | as today                           |
| 2. Setup    | tip at the first sync → `setupHeight`                                                       | one per core | gold, "Setting up your wallet: N%" |
| 3. History  | `setupHeight` → 2,100,000, then 1,710,000 → birthday or 0, then the spam era (2.1M → 1.71M) | 2            | green, pulsing                     |

- **Phase 1** runs on every sync once setup is done. It covers the window's
  newest chunk again, which may have been filling.
- **Phase 2** runs once per account. When it ends, the wallet records
  `setupDone` and logs it.
- **Phase 3** starts automatically right after phase 2 and resumes on later
  syncs after phase 1. Its three ranges run in the order above: pre-spam
  history comes before the spam era because it's cheap (~185 MB) and it's where
  a 2018–2021 Sapling wallet keeps its funds.
- **The birthday bounds every phase.** A birthday inside the spam era gives:
  phase 2 down to 2.1M, then phase 3 reads only the spam era, from 2.1M down to
  the birthday.

### `setupHeight`

Where setup ends. It is not a birthday: phase 3 still reads below it. The
first rule that applies wins, and it is never below 2,100,000:

1. The birthday.
2. The oldest transaction on the wallet's transparent addresses, minus 30 days
   (34,560 blocks).
3. Tip − 1 year (420,480 blocks).

The transparent pass already scans every used address from height 0 on a fresh
sync and lands within seconds, so rule 2 costs nothing extra. It may be
unknown when phase 2 starts: the crawl reads from the tip down and only needs
it on reaching it, which takes longer than the transparent pass. If the
transparent pass fails, rule 3 applies.

### Spam era

ECC's Android SDK uses `SANDBLASTING_RANGE = 1_710_000..2_050_000`
(`CompactBlockProcessor.kt`). We keep its start and end at 2,100,000 instead:
2.05M–2.1M still holds ~200 dense Orchard chunks, which would otherwise land in
phase 2. Chunk numbers never change once written, so on mainnet the bounds are
constants:

| Height    | Orchard chunk | Sapling chunk |
| --------- | ------------- | ------------- |
| 1,710,000 | 20            | 72            |
| 2,100,000 | 2,868         | 4,386         |

Ironwood is younger than both. Testnet has no spam range: phase 3's spam range
is empty.

## Workers

| Situation                    | Workers                                     |
| ---------------------------- | ------------------------------------------- |
| Phases 1–2                   | one per core                                |
| Phase 3                      | 2                                           |
| Tab hidden                   | 1                                           |
| "Speed up" pressed (phase 3) | one per core, until "Slow down" or a reload |
| `VITE_ALLOW_CPU_TO_FRY=true` | one per core, always, hidden or not         |

With `navigator.connection.saveData` on (Chromium only; elsewhere treated as
off), phase 3 waits for the user to opt in.

## Progress

The indicator shows one percentage for the current phase, across pools:
work done ÷ total work in the phase's ranges, with a Sapling chunk counting 2
(it decrypts ~2× slower than Orchard), so the number moves at an even pace.

Totals need each range's chunk bounds up front. The spam bounds are constants;
`setupHeight` and the birthday are found with `firstChunkFrom`, about a dozen
16-byte requests per pool per bound, once per account, then stored. Until
`setupHeight` is known, phase 2 shows "Setting up your wallet" without a number. If
those requests become a problem, ask the indexer for a height → chunk endpoint.

## Stored state

Each pool's single window `{start, from, to}` becomes three ranges, each with
its own newest-first cursor: after-spam (top), before-spam, and spam. The
account also stores `setupDone`, `setupHeight`, and the bound chunks. The
crawl itself (`crawlChunks`) is unchanged.

## UI

The balance is right as soon as anything shows: a note only counts once its
spend lookup says unspent. Tooltip texts:

- **Phase 2:** "Setting up your wallet: N%", and "This happens only once, the
  first time you open this account."
- **Phase 3:** "Older history: N%, back to <date>", and "Older history is
  still loading in the background, using less of your computer so it stays
  responsive."
  - **Speed up:** "Uses your computer's full power until older history is
    done. It may run warm and slow down other apps meanwhile."
  - **Slow down** (once sped up): "Goes back to using less of your computer,
    so it stays responsive."
- **Paused (`saveData`):** "Older history is paused to save data (about
  15 GB)." with **Download older history**. The dot does not pulse; a simple
  static state for now, to be revisited.

## Expected cost

Measured on an M1 (8 cores) against the remote indexer at tip 3,512,136, with
the current wasm. Trial decryption, not download, is the bottleneck: ~5.4 s
per Orchard or Ironwood chunk (2.42 MB) and ~10.3 s per Sapling chunk
(1.90 MB) on one core. Full power gave ~4–6× one core. Phones are likely 2–3×
slower.

| Range                       | Ironwood / Orchard / Sapling chunks | Download | CPU     | Full power | 2 workers | 1 worker |
| --------------------------- | ----------------------------------- | -------- | ------- | ---------- | --------- | -------- |
| Last year                   | 44 / 75 / 11                        | ~310 MB  | ~13 min | ~2–3 min   | ~7 min    | ~13 min  |
| After the spam (2.1M → tip) | 44 / 213 / 130                      | ~870 MB  | ~45 min | ~8–11 min  | ~23 min   | ~45 min  |
| Spam (1.71M → 2.1M)         | 0 / 2,848 / 4,314                   | ~15.1 GB | ~16.5 h | ~3.3 h     | ~8 h      | ~16.5 h  |
| Before the spam (< 1.71M)   | 0 / 20 / 72                         | ~185 MB  | ~14 min | ~3 min     | ~7 min    | ~14 min  |
| Everything                  | 44 / 3,081 / 4,516                  | ~16.1 GB | ~17.6 h | ~3.5 h     | ~9 h      | ~18 h    |

## Later

- Pick the spam end from a chunks-per-10k-blocks plot instead of 2.1M.
- A real design for the paused state.
- PR #53's field-multiplication patch lowers every CPU number above; no code
  change here.
