# Payment links — implementation plan

Status: October 2026, not started. What links do for users is
[product.md 2.10](../product.md); how they work is
[payment-links.md](payment-links.md). This splits the build into PRs that
each merge on their own, in dependency order.

Built: 1.1–1.4, 2.1–2.3, 3.1–3.2, 4.1–4.4 and 5.3 (show again). Still to
come: 1.5, history rows and status (5.1, 5.2), and cancel.

## What we take from AnomaPay

From `anomapay-frontend` (`apps/app`), the logic only:

- The link's key is made when the page opens, so toggling or editing
  keeps the same link.
- One submit goes straight to approval, then the result screen. **No
  review step**: Send's Summary card (amount, fee, claim fee, total) is the
  review.
- The claim page works signed out, says what the link holds first, and
  comes back to the claim after onboarding.
- An already-claimed link says so; history shows links as waiting or
  claimed; an unclaimed link can be shown again.

Where we differ, by design: the key lives in the URL fragment and is
stripped once read (AnomaPay keeps it in the path, never scrubbed); the key
also rides in the funding memo, sealed by the Keychain, so show again,
cancel and restore work without storing it; the result screen has Share and the "the link is cash"
warning.

## Decisions

Settled:

1. **Sealing scheme**, as in [payment-links.md](payment-links.md#keys): the
   sealing key from the account's Orchard spending key, a one-time pad keyed
   by `nk`. Permanent once a link exists.
2. **Transparent-funded links are recoverable.** A send spending only
   transparent coins encrypts its outputs to the transparent OVK
   (`select_ovk`, `packages/zcore/src/build.rs`). Sync lists transparent
   spends as our sends (`sendingTxs`, `apps/app/src/lib/wallet/activity.ts`)
   and opens their outputs with that OVK too (`packages/zcore/src/lib.rs`),
   so these links are found like any other.
3. **Keychain title:** the approval is titled as a payment link (2.3).

4. **Onboarding a claimer without the Keychain:** the welcome screen's
   steps (install, connect) plus a third, "Claim funds", when a link is
   waiting (`KeychainWall` `claiming`); then back to the claim.

## Phase 1 — zcore (`packages/zcore`)

Everything else depends on these. Each PR ships Rust tests and a rebuilt
`pkg/`.

- [x] **1.1 Link keys.** `src/link.rs`: `new_link_key`, `link_info`
      (address with an Orchard receiver only, and `nk`), `seal_link_key` /
      `open_link_key` from the seed, for the Keychain. Fixed test vectors.
- [x] **1.2 Binary memos.** `src/send.rs`: `SendRequest.memo_hex`, one memo
      per send. `src/lib.rs`: sync reads a `PAYLINK` memo as its description,
      so neither its keys nor hex reach history.
- [x] **1.3 Fund in Ironwood.** Upstream pays an Orchard-only address in
      Ironwood once NU6.3 is active, from any pool; a test pins it.
- [x] **1.4 Claim PCZT.** Built as `build::claim` / `claim_pczt`, the
      OVK the claimer's.
      Planned as: New `src/claim.rs`: one Ironwood note + witness →
      a given address, fee 10,000 zat, OVK chosen by the caller, signed with
      the link key (`Signer::sign_ironwood`). Used by claim and by
      cancel (paid to our own address). End-to-end test: build, sign,
      prove, extract.
- [ ] **1.5 Sent-note plaintext.** OVK recovery (`SentOutput`) returns no
      note, so the sender can't compute a link note's nullifier from the
      memo's `nk`. Return it.

## Phase 2 — Keychain (`apps/keychain`)

The funding itself is an ordinary send, signed by the existing approval.

- [x] **2.1 Seal.** `dapp/sealLinkKey(key)` → sealed key, no approval.
      Ledger accounts can't: their seed never leaves the device.
- [x] **2.2 Open.** `dapp/openLinkKey(sealed, nk)` → link key, behind an
      approval window, for show again and cancel.
- [x] **2.3 Payment link title.** The Keychain remembers the addresses of
      the links it sealed (in memory); a PCZT whose one payment is one of
      them is titled "Confirm Payment Link", with the amount, fee and claim
      fee.
- [ ] **2.4 Version.** No `MIN_KEYCHAIN_VERSION` bump: the app checks for
      `sealLinkKey` and asks for an update only when creating a link.

## Phase 3 — app: create

- [x] **3.1 Create a link.** `routes/send.tsx`, `hooks/usePaymentLink.ts`:
      link key at mount → plan against its address → `sealLinkKey` →
      `PAYLINK` memo → the usual send. The URL is the app's own origin and
      base path, so no `VITE_APP_URL`.
- [x] **3.2 Result screen.** `components/send/PaymentLinkCreated.tsx`: QR,
      Copy, Share (`navigator.share` where available), the "the link is
      cash" warning. The key stays in memory only.

## Phase 4 — app: claim

- [x] **4.1 Route outside the wall.** Restructure `routes/__root.tsx` so
      `/claim` renders without `KeychainWall`; read the fragment, keep it in
      `sessionStorage` through onboarding, strip it with
      `history.replaceState`.
- [x] **4.2 Find the note.** From chunk ⌊s / 2¹⁴⌋ to the tip. Fetch `/ironwood/ciphertexts/⌊s / 2¹⁴⌋` (and the
      next chunk at a boundary), trial-decrypt with the link viewing key,
      show amount and description.
- [ ] **4.3 Already claimed.** For now `POST /spent`, which names the
      link's nullifier to the indexer (`ponytail` in `lib/wallet/claim.ts`).
      Planned: Decoder for whole `/ironwood/nullifiers`
      chunks (see [zcrawler-architecture.md](zcrawler-architecture.md));
      no per-nullifier lookups, so the indexer can't tell which link is
      checked. Works signed out.
- [x] **4.4 Claim.** Signed in: one Claim button → claim PCZT to a fresh
      address of the connected account → prove → broadcast. No Keychain
      approval; doesn't wait for sync.

## Phase 5 — app: history and status

- [ ] **5.1 Payment link rows.** Sync recognises `0xFF "PAYLINK"` memos and
      keeps the description, `nk` and sealed key; `Activity` gains a
      payment-link type, amount = value − claim fee, age while unclaimed.
- [ ] **5.2 Status.** Link nullifiers, from `nk`, join the spend checks: spent by our
      transaction = Cancelled, by anyone else's = Claimed.
- [x] **5.3 Detail page.** Show again built; Cancel still to come, each behind
      `openLinkKey`; check the key's address matches the funding output byte
      for byte before using it.

## Testing

zcore Rust tests per PR; Vitest for the wallet layer (memo classification,
plain key never persisted, status). There's no e2e setup: claim and approval flows are
checked by hand on testnet with `VITE_DRY_RUN` off.
