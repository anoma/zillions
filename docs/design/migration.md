# Move to Ironwood

Status: October 2026 design. _Immediately_ is built; _with added privacy_ is
being built. What it does for users is [product.md 2.9](../product.md); this
is how. It follows [ZIP 318]; each departure is listed at the end.

## Why steps, not a schedule

ZIP 318 has the wallet sign every transaction up front and send each when
it's due. That suits a phone app that runs in the background; a browser tab
is rarely open for the hours a migration takes. So the wallet saves a plan
and the user sends each step when it's due, approving it in the Keychain like
any transaction. Nothing is pre-signed, so there is no batch approval, no
stored signed transactions, and no timer that has to fire while the tab is
closed. Fees are the same either way: the same transactions are sent.

## The plan

`plan_migration` in `packages/zcore/src/migration.rs`, from the synced wallet:

- **Amounts.** The spendable Orchard balance, less fees, is split into
  standard amounts, each the largest `{1, 2, 5} × 10^k` that fits (ZIP 318's
  quantization), from 0.01 ZEC up to the 10,000 ZEC cap. What's left under
  0.01 ZEC stays in Orchard.
- **Fees.** Each transfer pays upstream's `canonical_crossing_fee`; each
  preparation pays ZIP 317 for 16 actions. Both come out of the balance
  before it's split.
- **Order.** The amounts are shuffled, so their order says nothing about the
  balance.
- **Timing.** Transfers are ~90 minutes apart (ZIP 318's exponential delays
  and caps). A step is due once the notes it spends can anchor at a bucket
  boundary (see Anchors): the first transfer, 3–6 hours after the last
  preparation.
- **Always a preparation first,** even for one transfer or notes that
  already fit: every migration runs the same steps, and a transfer only ever
  spends the note made for it.

The plan is saved per account in the wallet's encrypted IndexedDB store
(`lib/wallet/store.ts`) with each step's state (planned, sent with its txid,
mined). It never leaves this browser. Before each step the wallet checks that
the notes the step needs are still unspent; if one was spent elsewhere, the
remaining steps are planned again from the current notes.

## Preparations

A preparation turns Orchard notes into one note per standard amount, each
worth the amount plus the transfer fee, so every transfer later spends
exactly one note.

- Orchard-only, a send to ourselves, padded to exactly 16 actions, with
  ZIP 318's rolling expiry and a bucket anchor, so only notes mined below
  that boundary can go in.
- Since NU6.3 an Orchard bundle disables cross-address transfers: a spend
  and an output never share an action (each is paired with a zero-value
  dummy), so a preparation spending `s` notes has room for `16 − s` outputs.
  Outputs go to our own internal address through
  `add_orchard_change_output`, which the rule allows.
- Each preparation is built when it's sent, from the notes the wallet holds
  then: the largest ones that can anchor, at most 14, so there is room for an
  amount and the change. It makes as many amounts as fit, in plan order;
  the next preparation spends its change, so it waits until that change can
  anchor (3–6 hours). Upstream builds it from a `Proposal` whose amounts are
  Orchard change, which `build.rs` carries out like any send.

## Transfers

A ZIP 318 canonical crossing: one Orchard note in, an Orchard change (or a
dummy when the note is exact), one Ironwood output of a standard amount to
our own address, the canonical fee, the rolling expiry, and an anchor at a
bucket boundary. `send.rs` already tries this shape for any send of a
standard amount into Ironwood; it waited only on anchors.

## Anchors

A transfer anchors to the tree at a ZIP 318 bucket boundary (a multiple of
144 blocks). Its age, in boundaries before the newest one under the
confirmations, is drawn as the ZIP says: geometric with parameter 1/2, at
least 1, at most 4 (`draw_crossing` in `send.rs`), so 144 to ~720 blocks
behind the tip. A boundary the note wasn't mined by is outside the candidate
set; every older one is too, so the draw is truncated below it. The plan
reports the boundary it drew and the build uses it, since the app fetches
the trees for it in between. A preparation takes the youngest boundary
(age 1), upstream's `bucketed`. Every wallet migrating in that window shares
the anchor.

The indexer serves only the current tip, so the wallet rebuilds the past tree
itself:

- lightwalletd's `GetTreeState(boundary)` returns the Orchard and Ironwood
  frontiers at that height: their roots, and how many notes each tree held.
- `Tip::at` (`packages/zcore/src/witness.rs`) rebuilds the Orchard tree at
  that size from the indexer's current tip (notes only append, so the first
  ones are the same) and gives each spent note's witness. If the chunk that
  was filling at the boundary has filled since, its frozen chunk is fetched
  too: at most one extra 1 MB download, cached by the browser.
- The rebuilt root must equal lightwalletd's, or the step is refused.

Checked on mainnet on 2026-10-22: both pools' roots rebuilt at a boundary
matched the chain's, and witnesses there proved against them
(`packages/zcore/test-ziziphus.sh`).

## History

Transfers already show as Migrated (`activity.ts`). Preparations show as
Prepared, told apart from our notes alone so they're labelled on any device:
Orchard spent into two or more of our own internal Orchard notes, nothing
paid. Since NU6.3 nothing else makes Orchard notes.

## Testing

The test account holds about 0.008 ZEC in Orchard, under ZIP 318's 0.01
ZEC minimum, so it can't migrate at all. To exercise preparations and
several transfers on it, a dev-only setting (`VITE_MIGRATION_TEST_AMOUNTS=true`, ignored in
production builds) plans amounts from 0.001 to 0.002 ZEC through a custom
`PoolMigrationConstants`. Those transfers aren't standard amounts, so they
don't blend in; it exists to test the flow, never to use.

## Departures from ZIP 318

- Steps are sent by the user, not pre-signed and sent on a timer (see Why).
- Preparations anchor at a boundary too (age 1). ZIP 318 lets a later layer
  use an ordinary near-tip anchor; upstream's `zip318::classify` expects one
  on the grid, so we keep it there, at the cost of 3–6 hours between layers.
- No Tor or Nym routing: a web page can't; the migration page recommends a
  VPN instead (product.md 2.9).

[ZIP 318]: https://zips.z.cash/zip-0318
