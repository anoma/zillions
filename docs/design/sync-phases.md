# Sync phases

Status: built 2026-10-09; setup's end fixed at build time and the spam era
made its own, user-started phase 2026-10-13. It
builds on the newest-first sync and the indexer's spent lookup (#56); see
[zcrawler-architecture.md](zcrawler-architecture.md) for those. A diagram for
the team: [apps/app/README.md](../../apps/app/README.md#sync).

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

| Phase       | Range (per pool)                                          | Workers      | Indicator                          |
| ----------- | --------------------------------------------------------- | ------------ | ---------------------------------- |
| 1. Catch-up | chunks minted since the last sync                         | one per core | gold, "Checking for new activity"  |
| 2. Setup    | tip at the first sync → `setupHeight`                     | one per core | gold, "Setting up your wallet: N%" |
| 3. History  | `setupHeight` → 2,100,000, then 1,710,000 → birthday or 0 | 2            | green, "Older history: N%"         |
| 4. Spam era | 2,100,000 → 1,710,000, once the user starts it            | 2            | green, "Spam era (2022–23): N%"    |

- **Phase 1** runs on every sync; on the first it has nothing to read. It
  covers the window's newest chunk again, which may have been filling, but
  tries only the notes added since: each pool keeps how many of that chunk's
  notes were tried and a fingerprint of their bytes (`tried`), and zcore's
  `try_decrypt` skips them while the fingerprint still matches. A reorg that
  rewrote any of them changes it, and the whole chunk is tried again. A visit's
  first catch-up went from ~30 s to ~6 s on 1 worker, a one-minute re-sync
  from ~6 s to ~2 s; what's left is mostly downloading the chunks.
- **Phase 2** runs until done, once per account: an interrupted setup goes on
  after phase 1 on the next visit. When it ends, the wallet records
  `setupDone` and logs it.
- **Phase 3** starts automatically right after phase 2 and resumes on later
  syncs after phase 1. Its two ranges run in the order above: pre-spam history
  is cheap (~185 MB) and it's where a 2018–2021 Sapling wallet keeps its funds.
- **Phase 4** waits for the user: once phase 3 is done, the indicator offers
  **Sync spam era**, saying why it waits (~15 GB and hours of work, needed
  only for funds received in 2022–23). The user can pause and resume it. The
  choice is stored with the account (`spamSync`), so it resumes on later
  visits until done or paused. Until it's read, funds from those years don't
  show.
- **The birthday bounds every phase.** A birthday newer than `setupHeight`
  ends phase 2 there and leaves phases 3–4 nothing. One inside the spam era
  gives phase 3 only its first range, and phase 4 the spam era down to the
  birthday.
- **Every sync pauses phases 3–4** and starts them again when it ends:
  waiting for the chunks in flight, then the sync itself, ~10 s on 1 worker.
  Between syncs the tip is checked every 15 s (`TIP_CHECK_MS`) and a new
  block syncs at once, or a minute after the last sync (`RESYNC_MS`) at the
  latest. That timed sync holds off while phases 3–4 run,
  and new activity then shows once they end or on a refresh, except while
  something is pending (unmined, or short of its confirmations): then a new
  block syncs at once and pauses them. The first sync
  of a visit, and a tap on the indicator, still run at once. Coming back to
  the tab or back online also syncs at once, but holds off like the timer.

### `setupHeight`

Where setup ends: the indexer's tip − 1 year (420,480 blocks), as of the
build. It is not a birthday: phase 3 still reads below it. The build looks up
each pool's first chunk from that height once (`vite.config.ts`, the app's
`SETUP_CHUNKS`), so no user does; an account stores it on its first sync, so
a newer build never moves it. A birthday newer than `setupHeight` ends setup
there instead, and history then has nothing left.

The build is old by however long since it was made, so setup reaches that
much further back. Builds are frequent enough for that not to matter.

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

Ironwood is younger than both. Testnet has no spam range: phase 4 has
nothing to read, so testnet goes from phase 3 to done.

## Workers

| Situation                    | Workers                                     |
| ---------------------------- | ------------------------------------------- |
| Phases 1–2                   | one per core                                |
| Phases 3–4                   | 2                                           |
| Tab hidden                   | 1                                           |
| "Speed up" pressed (3–4)     | one per core, until "Slow down" or a reload |
| `VITE_ALLOW_CPU_TO_FRY=true` | one per core, always, hidden or not         |

With `navigator.connection.saveData` on (Chromium only; elsewhere treated as
off), phase 3 waits for the user to opt in. Phase 4 needs the user anyway, so
save data doesn't hold it.

## Progress

The indicator shows one percentage for the current phase, across pools:
work done ÷ total work in the phase's ranges, with a Sapling chunk counting 2
(it decrypts ~2× slower than Orchard), so the number moves at an even pace.

Totals need each range's chunk bounds up front. The spam bounds and
`setupHeight`'s chunks are constants; the birthday's is found with
`firstChunkFrom`, about a dozen 16-byte requests per pool, once per account,
then stored. If those requests become a problem, ask the indexer for a
height → chunk endpoint.

## Stored state

Each pool's single window `{start, from, to}` becomes three ranges, each with
its own newest-first cursor: after-spam (top), before-spam, and spam. The
account also stores `setupDone`, `spamSync` (the user started phase 4 and
hasn't paused it), the bound chunks, and per pool `tried` (see phase 1). The
crawl itself (`crawlChunks`) is unchanged.

## UI

The balance is right as soon as anything shows: a note only counts once its
spend lookup says unspent. The dot pulses gold during catch-up and setup,
turns red if the sync fails there, and is otherwise steady green, history
included, so background work doesn't look urgent. Switching accounts starts
the indicator afresh. Tooltip texts:

- **Phase 2:** "Setting up your wallet: N%", and "This happens only once, the
  first time you open this account."
- **Phase 3:** "Older history: N%, back to <date>", and "Older history is
  still loading in the background, using less of your computer so it stays
  responsive."
  - **Speed up:** "Uses your computer's full power until it's done. It may
    run warm and slow down other apps meanwhile."
  - **Slow down** (once sped up): "Goes back to using less of your computer,
    so it stays responsive."
- **Paused (`saveData`):** "Older history is paused to save data (about
  750 MB)." with **Download older history**. A simple state for now, to be
  revisited.
- **Phase 4 waiting:** "Shielded sync completed, except the 2022–23 spam era"
  (with "N% read" once started), "Those years hold millions of spam
  transactions: about 15 GB and a few hours of work. You only need them if
  this account received funds in 2022–23.", and **Sync spam era**, or
  **Resume spam era** once started.
- **Phase 4:** "Spam era (2022–23): N%", the same speed controls as phase 3,
  and **Pause spam era sync** with "You can resume it any time from here."
- **Done:** "Shielded sync completed" once phase 4 is read too.

## Expected cost

Measured on an M1 (8 cores) against the remote indexer at tip 3,512,136, with
the current wasm. A fresh import's setup (the last year, 131 chunks)
took 173 s on all 8 cores on 2026-10-13. Trial decryption, not download, is the bottleneck: ~5.4 s
per Orchard or Ironwood chunk (2.42 MB) and ~10.3 s per Sapling chunk
(1.90 MB) on one core. Full power gave ~4–6× one core. Phones are likely 2–3×
slower.

| Range                     | Ironwood / Orchard / Sapling chunks | Download | CPU     | Full power | 2 workers | 1 worker |
| ------------------------- | ----------------------------------- | -------- | ------- | ---------- | --------- | -------- |
| Last year (setup)         | 44 / 75 / 11                        | ~310 MB  | ~13 min | ~2–3 min   | ~7 min    | ~13 min  |
| A year back → 2.1M        | 0 / 138 / 119                       | ~560 MB  | ~33 min | ~6–8 min   | ~17 min   | ~33 min  |
| Spam (1.71M → 2.1M)       | 0 / 2,848 / 4,314                   | ~15.1 GB | ~16.5 h | ~3.3 h     | ~8 h      | ~16.5 h  |
| Before the spam (< 1.71M) | 0 / 20 / 72                         | ~185 MB  | ~14 min | ~3 min     | ~7 min    | ~14 min  |
| Everything                | 44 / 3,081 / 4,516                  | ~16.1 GB | ~17.6 h | ~3.5 h     | ~9 h      | ~18 h    |

## Later

- Pick the spam end from a chunks-per-10k-blocks plot instead of 2.1M.
- A real design for the paused state.
- PR #53's field-multiplication patch lowers every CPU number above; no code
  change here.
- Download only what's new in a pool's newest chunk too (a range request
  past the notes already tried): catch-up still fetches it whole, ~2 s each.
