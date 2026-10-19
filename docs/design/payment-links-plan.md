# Payment links — implementation plan

Status: October 2026, not started. What links do for users is
[product.md 2.10](../product.md); how they work is
[payment-links.md](payment-links.md). This splits the build into PRs that
each merge on their own, in dependency order.

The send-page UI is done (toggle, description, claim fee in the Summary,
Max for links); its submit stops at "Payment links aren't available yet"
until PR 3.1.

## What we take from AnomaPay

From `anomapay-frontend` (`apps/app`), the logic only:

- The link's secret is made when the page opens, so toggling or editing
  keeps the same link.
- One submit goes straight to approval, then the result screen. **No
  review step**: Send's Summary card (amount, fee, claim fee, total) is the
  review.
- The claim page works signed out, says what the link holds first, and
  comes back to the claim after onboarding.
- An already-claimed link says so; history shows links as waiting or
  claimed; an unclaimed link can be shown again.

Where we differ, by design: the secret lives in the URL fragment and is
stripped once read (AnomaPay keeps it in the path, never scrubbed); the app
never stores the link (show again needs a Keychain approval); links can be
cancelled; the result screen has Share and the "the link is cash" warning.

## Decisions needed before PR 1.1

1. **Link secret bytes.** The design hashes "the derived extended spending
   key", but Orchard has no canonical encoding of one. Proposal:
   BLAKE2b-256, personalisation `Zcash_PaymentURI`, over
   `sk (32 bytes) ‖ chain code (32 bytes)` of the hardened-only node.
   Permanent once a link exists.
2. **Onboarding for a claimer without the Keychain** (product.md: "to
   confirm"). Proposal: the existing Download/Connect screens, then back to
   the claim.

## Phase 1 — zcore (`packages/zcore`)

Everything else depends on these. Each PR ships Rust tests and a rebuilt
`pkg/`.

- [ ] **1.1 Link keys.** `src/keys.rs`: derive `m_Orchard/324'/coin'/r₁'/r₂'`
      with `zip32::hardened_only::HardenedOnlyKey` and a local Orchard
      context (orchard's own `ExtendedSpendingKey` is `pub(crate)`).
      Exports `link_viewing_key`, `link_address`, `link_secret`. Fixed test
      vectors.
- [ ] **1.2 Binary memos.** `src/send.rs`: `SendRequest` takes a bytes/hex
      memo besides text (today `memo.parse::<Memo>()` only makes text
      memos), through `plan_send`, `max_send`, `send_pczt`. `src/lib.rs`:
      decrypted memos carry their kind, so a `PAYLINK` memo isn't mistaken
      for hex text.
- [ ] **1.3 Fund in Ironwood.** The claim assumes the link's note is an
      Ironwood note at or after tree size `s`; make the planner pay a link
      address in Ironwood, or fail.
- [ ] **1.4 Claim PCZT.** New `src/claim.rs`: one Ironwood note + witness →
      a given address, fee 10,000 zat, OVK chosen by the caller, signed with
      the link secret (`Signer::sign_ironwood`). Used by claim and by
      cancel (paid to our own address). End-to-end test: build, sign,
      prove, extract.
- [ ] **1.5 Sent-note plaintext.** OVK recovery (`SentOutput`) returns no
      note, so the sender can't compute a link note's nullifier. Return it,
      or trial-decrypt with the link viewing key.

## Phase 2 — Keychain (`apps/keychain`)

- [ ] **2.1 Link viewing key.** `dapp/linkViewingKey(r₁, r₂)`, no approval
      (same trust as the UFVK). Contract, handler, types, provider.
- [ ] **2.2 Create approval.** `dapp/signPaymentLink`: one window titled as
      a payment link (amount, fee, claim fee); checks the funding output pays
      the address derived from (r₁, r₂), signs, returns the signed PCZT and
      the link secret. New approval route and screen.
- [ ] **2.3 Reveal approval.** `dapp/revealPaymentLink(r₁, r₂)` for show
      again and cancel.
- [ ] **2.4 Version.** Release, and bump `MIN_KEYCHAIN_VERSION` in
      `apps/app/src/lib/keychain/keychain.ts`.

## Phase 3 — app: create

- [ ] **3.1 Create a link.** `routes/send.tsx`: r₁, r₂ from
      `crypto.getRandomValues` (31-bit, hardened) at mount → link address →
      plan amount + claim fee with the `PAYLINK` memo → `signPaymentLink` →
      prove → broadcast. `VITE_APP_URL` in `.env.example` and
      `lib/wallet/config.ts`.
- [ ] **3.2 Result screen.** Link, QR (`react-qr-code`), Copy, Share
      (`navigator.share` where available), the "the link is cash" warning.
      The secret stays in memory only.
- [ ] **3.3 Link store.** A Dexie table of r₁, r₂, viewing key per link —
      separate from `WalletState`, whose version bump would force a resync.

## Phase 4 — app: claim

- [ ] **4.1 Route outside the wall.** Restructure `routes/__root.tsx` so
      `/claim` renders without `KeychainWall`; read the fragment, keep it in
      `sessionStorage` through onboarding, strip it with
      `history.replaceState`.
- [ ] **4.2 Find the note.** Fetch `/ironwood/ciphertexts/⌊s / 2¹⁴⌋` (and the
      next chunk at a boundary), trial-decrypt with the link viewing key,
      show amount and description.
- [ ] **4.3 Already claimed.** Decoder for whole `/ironwood/nullifiers`
      chunks (see [zcrawler-architecture.md](zcrawler-architecture.md));
      no per-nullifier lookups, so the indexer can't tell which link is
      checked. Works signed out.
- [ ] **4.4 Claim.** Signed in: one Claim button → claim PCZT to a fresh
      address of the connected account → prove → broadcast. No Keychain
      approval; doesn't wait for sync.

## Phase 5 — app: history and status

- [ ] **5.1 Payment link rows.** Sync recognises `0xFF "PAYLINK"` memos;
      `Activity` gains a payment-link type, amount = value − claim fee, age
      while unclaimed.
- [ ] **5.2 Status.** Link nullifiers join the spend checks: spent by our
      transaction = Cancelled, by anyone else's = Claimed.
- [ ] **5.3 Detail page.** Show again and Cancel, each behind
      `revealPaymentLink`; check the derived address matches the funding
      output byte for byte before using the secret.

## Testing

zcore Rust tests per PR; Vitest for the wallet layer (link store, memo
classification, status). There's no e2e setup: claim and approval flows are
checked by hand on testnet with `VITE_DRY_RUN` off.
