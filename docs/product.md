# Zillions — Product Spec

What the Zillions wallet does for its users, in product terms. It says
**what** each part must do, never **how** it is built.

## How to use this document

- This is the source of truth for what the wallet must support. Code serves
  this document, not the other way round.
- **Removing code never removes a line here.** A feature that has to go away
  for a while is marked _Disabled_, with the reason and what brings it back.
- Dropping something from scope is a decision for the product owner, recorded
  here first, before any code changes.
- A user-facing screen whose engine is being replaced stays visible, with its
  action disabled, rather than disappearing.

**Status legend**

| Status     | Meaning                                           |
| ---------- | ------------------------------------------------- |
| Working    | Available to users today                          |
| Built      | Done, awaiting its first real-world test          |
| Disabled   | Existed, temporarily switched off; must come back |
| Planned    | Required, not built yet                           |
| To confirm | Open question for the product owner               |

---

## Principles

Every feature below is held to these, and when they pull against each other
the trade-off is a product decision, written down here.

- **Privacy.** Zcash exists for private money, and the wallet protects it by
  default: shielded is the normal path, and the wallet reveals as little as
  possible (to servers, to sites, on-chain) about who the user is, what they
  hold, and whom they pay. When an action is less private (e.g. sending to a
  transparent address), the user is told before confirming.
- **Security.** Secrets never leave the Keychain (one exception: a payment
  link's own key, which the user shares on purpose and which can spend only
  that link, 2.10; the wallet holds it only for the moment it's needed and
  never saves it), nothing is signed without
  the user's explicit approval, and what the user approves is exactly what
  gets signed. What the wallet keeps in the browser (balances, history,
  addresses) is encrypted, and opens only while the Keychain is unlocked.
- **The best UX possible.** Clear screens, no Zcash jargon the user has to
  understand to use the wallet (pools, notes, blocks), sensible defaults, fast
  feedback, and honest waiting states when something takes time.

## 1. Money the wallet can hold

Zcash has four kinds of balance ("pools"). The wallet supports all of them,
fully: holding, seeing, receiving and spending.

| Pool        | See balance | Receive | See history | Spend |
| ----------- | ----------- | ------- | ----------- | ----- |
| Transparent | Working     | Working | Working     | Built |
| Sapling     | Working     | Working | Working     | Built |
| Orchard     | Working     | Working | Working     | Built |
| Ironwood    | Working     | Working | Working     | Built |

Spending is _Built_: it awaits a first real transaction. A Ledger account
holds only what the device supports (3.6).

- Every kind of spend is required: from any pool the wallet holds funds in, to
  any kind of Zcash address.
- **The user never picks a pool.** Ironwood, the newest pool (from the NU6.3
  network upgrade), is where the wallet puts shielded funds: shielding, and
  anything it moves on the user's behalf. Other wallets may still pay into
  Sapling or Orchard, and those funds are fully supported. The one exception
  is moving Orchard funds to Ironwood (2.9), which the user starts.
- **Change stays in the pool it was spent from**: spending an Orchard note
  returns its change to Orchard, not Ironwood. Moving value between pools
  makes the amount public, so change only goes to Ironwood when it has no
  shielded pool to return to. A send from transparent funds to a transparent
  address keeps its change transparent, on a new address of the account: the
  user chose transparent, and shielding the change would need a proof and a
  higher fee.
- **Sending chooses the best option** among the funds the wallet holds (which
  funds to use and how), without asking the user about pools.
- Funds received before the wallet was created or imported are found too: the
  wallet recovers the account's full history, except the 2022–2023 spam era,
  which it reads only once the user asks (about 15 GB; see 2.7).

## 2. Wallet app

### 2.1 Wallet (home) — Working

- **Total balance** in ZEC, with the **shielded** and **transparent** parts
  shown separately.
- **Pending** amounts (sent or received but not yet confirmed) are included in
  the total and in the shielded or transparent part they go to, and their
  transactions show as pending in the list (2.6). — _Built_ for sends: what a
  send spends leaves the balance at once and can't be spent again, and its
  change (or an unshield's amount) counts in its pool until it's mined or
  expires. Amounts received but not yet mined aren't shown yet: the wallet
  only reads mined blocks.
- Balances are everything the account holds. Only a send's **available**
  amount (2.3–2.5) leaves out what can't be spent yet. — _Built_
- Shortcut buttons: **Send**, **Receive**, **Shield** (shown when there is a
  transparent balance), **Unshield** (shown when there is a shielded balance).
- Recent transactions (see 2.6).
- A **Move to Ironwood** section between the balance and the transactions,
  while Orchard holds funds worth moving (2.9).

### 2.2 Receive — Working

- Choose **shielded** or **transparent**.
- Shows the address as a QR code and as text, with one-click copy.
- **Shielded**: a fresh address each time the screen opens, so payers can't
  compare notes and link their payments to one wallet. Earlier addresses keep
  working, and everything they receive joins the same balance. Shielded
  addresses carry no transparent part: sharing one never reveals a
  transparent address. — _Built_
- **Transparent**: one stable address, shown separately, for exchanges and
  wallets that can't send to shielded addresses.

### 2.3 Send — Built

- **From**: choose the shielded or the transparent balance. Within that
  balance the wallet picks the funds itself (see 1); there is no pool choice.
- Shows the **available** amount for the chosen source: what a send can spend
  now. Pending change and shielded funds still confirming are left out: 3
  confirmations for the account's own transactions, 10 for payments received
  (`zcash_client_backend`'s defaults; transparent coins count once mined). So
  is dust that costs more to spend than it's worth. When something is
  waiting, a small info icon by it says how much, and that it's spendable once
  confirmed. — _Built_
- **Amount** entry in ZEC.
- **Tap-to-fill** (Max): the maximum sendable amount, the available balance
  less the fee, kept up to date as the recipient changes.
- **To**: paste any Zcash address (transparent, Sapling or unified). The field
  shows at a glance whether the recipient is transparent or shielded. Without
  an address, the user can send a payment link instead (2.10). — _Planned_
- **Message** (memo): optional, for shielded recipients only, behind an
  "Add a message" link under To so the form stays short. Up to 512 bytes, with
  a counter. Only the recipient can read it. A message typed before the
  recipient becomes transparent stays, and blocks sending until it is removed
  or the recipient changes; it is never dropped silently. — _Built_
- **Fee preview** before confirming, updating as the form changes.
- Checks before sending: amount set, recipient a valid address on this
  network, enough balance, message within 512 bytes.
- **Privacy notice** under the button: "This transfer is shielded",
  "partly shielded" or "transparent", depending on source and recipient.
- Approval happens in the Keychain, which shows what is being signed.
- **Receipt** after sending: amount, fee, from, to, time, the message when
  there is one (plain text, links not clickable), and a link to the
  transaction on a block explorer; marked as awaiting confirmation.

### 2.4 Shield — Built

Moves transparent funds into the shielded balance.

- Shows the transparent amount available and the **fee** that will be paid.
- Needs at least **0.001 ZEC**: below that the fee eats too much of it, and
  the screen says so.
- Shields **all** transparent funds; there is no partial shielding. A coin is
  spent whole, so shielding part of a balance would either shield more than
  asked or send the rest back to a transparent address (see Principles:
  Privacy). To move part of the funds out again, use Unshield.
- Approval happens in the Keychain.
- Tells the user that preparing the transaction takes up to a minute.
- Receipt as in Send.

### 2.5 Unshield — Built

Moves shielded funds to one of the account's own transparent addresses.

- Shows the available shielded amount; the user enters an amount, with
  tap-to-fill for the maximum.
- Each unshield goes to a **fresh transparent address** of the account, one
  never shown anywhere, and never the one the account shields from or
  receives on, so observers can't pair the funds going in with the funds
  coming out (see 2.8, address rotation). Unshields waiting to confirm each
  get their own; at most five can wait at once, so every address stays
  findable when the recovery phrase is restored elsewhere. — _Built_
- Checks: amount set, enough balance.
- Fee preview, Keychain approval, receipt as in Send.

### 2.6 Transactions — Working

- One entry per transaction, newest first. A transaction that touches both
  shielded and transparent funds appears **once**.
- Each entry shows:
  - **Type**: Sent, Received, Shielded (transparent → shielded),
    Unshielded (shielded → transparent) or Migrated (the account's own
    shielded funds moved to another shielded pool, paying no one else; its
    From and To name the pools, e.g. "Ironwood" → "Sapling", and its amount
    is what moved, the fee apart) or Payment link (2.10: its amount is what
    the claimer receives; a claim or cancellation shows as Received, from
    "Payment link");
  - **Amount**, signed by who it's with, never by the fee: "+" when it came
    from someone else, "−" when it paid someone else, and no sign when the
    account only moved its own funds (Shielded, Unshielded, Migrated, or a
    payment to itself);
  - **From** and **To**: someone else's address when it's known; the
    account's own addresses only as "Shielded" or "Transparent" (each unshield
    goes to a new address of its own, which nothing else shows), and a
    shielded sender as "Shielded", since it's never revealed. A transparent
    sender is public on chain, so a payment funded by transparent coins
    names the address they came from, even if shielded funds paid part of
    it. Several senders or recipients show as the first and a count, e.g.
    "t1Xur…icCN +2"; the detail page lists them all, each recipient with
    what it was paid. A payment to one of the account's own addresses in the
    same pool shows as Sent, to "Shielded" or "Transparent", its amount what
    reached the receiving address (not change), the fee apart;
  - **Status**: "Processing" from the moment a send, shield or unshield is
    broadcast (a payment received: once it's mined) until it has its
    confirmations, then "Completed" (a payment link: Unclaimed, Claimed or
    Cancelled). The confirmations are zcash_client_backend's default: 3 for
    the account's own transactions, 10 for a payment received from someone
    else. A pending transaction's icon carries a clock; hovering or tapping
    it shows how far along it is as a percent and the minutes left, planned
    upfront from 75-second blocks (4 min for its own: the next block, the
    15-second tip check, 2 more blocks; 9 more blocks for a payment
    received). Each event (mined, a new block) spreads what's left of the
    percent over the new time left, so it only moves forward. Past the
    estimate the percent is gone for good: before it's mined it says it's
    taking longer and how many blocks are left before it expires; once
    mined, the minutes left. The detail page shows the same line. One that
    expires unmined drops off the list;
  - **Time**.
- A **detail page** per transaction: type, status, amounts broken down (e.g.
  "Sent from Transparent" / "Received in Shielded"), fee, from, to, time,
  memo when there is one, and a block-explorer link. The fee is exact
  whenever the account paid it. Its amount carries no sign: the type
  already says which way it went, and the sign is for reading the list as
  the balance's ups and downs. The receipt after a send is this page.
- A transaction is read in full from the server only where that shows
  more: when it spent the account's funds (its exact fee and transparent
  recipients) or transparent coins (its sender). A shielded payment received
  is never asked for by its id, so the server doesn't learn it's the
  account's (unless its receipt link is opened before sync finds it; see
  below). What's read is kept, so it's asked for once.
- **Shared receipt links**: a detail page link (`/tx/<txid>`) for a
  transaction not in the viewer's history shows, instead of "Page not
  found", only the detail page's fields the chain makes public:
  "Processing" until it's mined, the time once it is, From and To
  (transparent addresses; shielded ones as "Shielded"), the fee when no
  transparent coins paid in (their values aren't in the transaction), and
  the hash with its explorer link, where the rest is. There is no type and
  no amount. One line says it isn't in the viewer's wallet. It needs a ready
  Keychain like every other page (2.8). It's looked up by its id as soon as
  history doesn't have it, so the server learns this viewer asked about it.
  — _Built_

### 2.7 Sync — Working

- Starts by itself when the wallet opens and resumes where it left off.
- Scans newest first: from the chain tip back to the account's birthday, or
  to the start of each pool for an imported account, so recent funds and
  history show first.
- In four phases: new activity since the last visit; setup, once per account,
  from the tip back to about a year before the app's release (or the birthday,
  if newer), at full speed ("Setting up your wallet: N%"); older history in
  the background, using less of the computer, with a "Speed up" option; and
  last the 2022–2023 spam era, only once the user starts it from the sync
  indicator, which explains why it waits. The user can pause and resume it;
  the account remembers the choice. When the browser asks to save data, older
  history waits for the user to start it too. Details:
  [design/sync-phases.md](design/sync-phases.md).
- Shows progress for the current phase, then "completed".
- What the last sync found shows at once, transparent and shielded. The
  transparent side is refreshed within seconds; new shielded history fills in
  as the sync progresses.
- Shielded funds count toward the balance only once the wallet has checked
  they are still unspent, so the balance never shows money that is already
  gone. Funds appear as the scan finds them, newest first.
- For now, checking a note is unspent tells the indexer which notes are the
  wallet's (temporary, until the indexer offers a private check).
- Balance and history update as the sync finds things; no reload needed.

### 2.8 Accounts and Keychain connection — Working

- The app works with the Zillions Keychain browser extension; without it, the
  app explains how to get it (including a download link).
- Checks that the Keychain version is recent enough.
- Header shows the active account, with its shielded and transparent addresses
  (copyable). A fresh shielded one each time it's shown. — _Built_
- **Switch account** from the header.
- **Address rotation.** — _Built_. An account uses many addresses: a fresh
  shielded one each time it shows one (2.2, 3.2), one stable transparent one
  for receiving, and a fresh transparent one for each unshield (2.5). All of
  them count toward its balance and history, and the Keychain signs for any
  of them. The wallet only hands out addresses that other Zcash wallets find
  when restoring the same recovery phrase, so no funds are lost by moving
  wallets.
- Links: Help, Privacy policy, X (Twitter).

### 2.9 Move to Ironwood — Built

Orchard is closed to new funds since NU6.3; its funds can only leave. The
wallet moves them to Ironwood following [ZIP 318], the standard other
wallets (e.g. Zodl) follow too. Only Orchard is moved: ZIP 318 forbids
offering Sapling as a destination, and Sapling funds stay where they are.

A browser tab is rarely left open for hours, so the wallet never sends on
its own: it plans the steps up front and the user sends each one when it's
due. How it's built is in [migration.md](design/migration.md).

- **On the home screen**, a section between the balance and the
  transactions, shown while Orchard holds at least 0.01 ZEC:
  - before it starts: the Orchard amount, one line on why it should move,
    and a **Migrate** button opening the migration page;
  - while it runs: progress ("Transfer 3 of 8 complete") and either "It's
    time to send transfer 4" with **Continue**, when a step is due, or
    "Come back about 15:40 (~2 hours) to send transfer 4" with **View**.
    While the user can only wait, the section is a quiet card rather than
    the highlighted one.
- **The migration page** walks through, in order:
  1. **What happens**: Orchard is closed, the funds go to Ironwood, the
     amounts moved become public while who holds them stays private, and
     less than 0.01 ZEC stays behind in Orchard.
  2. **How**: _With added privacy_ (recommended): the funds move as several
     standard amounts, spread over hours, so they look like everyone
     else's; or _Immediately_: one transfer, faster, its full amount public
     at once. Each shows the number of transfers, the time they take and
     the fees.
  3. **Network privacy**: a recommendation to turn on a trusted VPN such as
     NymVPN (free for the migration), with a warning that the IP address can
     link the transfers; the user may continue without. A web page can't
     route itself through Tor or Nym as ZIP 318 asks, and the Keychain isn't yet
     available in Tor Browser, so Tor Browser isn't suggested.
  4. **Review**: the whole plan (the preparation steps, each transfer's
     amount and when it's due) and the total fees. Starting it sends
     nothing; it saves the plan.
  5. **Steps**: a card at the top says what to do next, in a headline and
     one line: "Transfer 4 is ready" with a **Send transfer 4** button, or
     "Come back around 15:40" with when that is and that later is fine;
     the wallet won't send it. Below it, every step is listed with its
     state. A step is approved in the Keychain like any transaction (3.4),
     and its receipt follows, with **Back to migration**. A step not yet due
     but whose notes can already be spent has a small **Send now anyway
     (easier to link)** link. A step can't be sent before the notes it
     spends can anchor (3–6 hours after they're mined). **Stop migration**
     drops the remaining steps; what wasn't sent stays in Orchard, already
     split into standard amounts, and the section offers **Migrate** again.
- Wording never calls the migration "automatic": nothing is sent unless the
  user sends it.
- The plan is kept in this browser only. Another browser or device shows
  the Orchard balance and **Migrate**, not the plan. If the notes a step
  needs were spent elsewhere, the remaining steps are planned again.
- Every migration starts with a preparation step, even one that moves a
  single transfer.
- In history (2.6), transfers show as Migrated, Orchard → Ironwood; the
  preparation steps that split the funds into standard amounts show as
  such, not as payments.
- _To confirm_: recommending Tor Browser too, once the Keychain installs and
  is tested there (signed add-on, WebAssembly at its security levels).
- _Later_: locking the leftover under 0.01 ZEC so nothing spends it by
  accident (Zodl offers this).

[ZIP 318]: https://zips.z.cash/zip-0318

### 2.10 Payment links — Planned

Send ZEC to someone without knowing their address: the wallet makes a link
that holds the money, the user shares it however they like, and whoever opens
it claims the money into the account connected to their Keychain. Based on
[ZIP 324] (a draft no wallet ships yet), adapted so the money waits in
Ironwood; how it's built is in [payment-links.md](design/payment-links.md).

- **The link is cash.** Anyone who has it can claim it, until it's claimed
  or cancelled. The wallet says so before creating one and next to the link:
  share it privately, and cancel it if it may have reached the wrong person.
  Chat previews, screenshots and QR codes all count as sharing.
- **Creating a link**, from Send (2.3), instead of entering an address:
  - an amount and an optional short description, which the claimer sees;
  - the review shows the amount, the fee, and the claim fee (0.0001 ZEC),
    paid now so the claimer receives exactly the amount shown and needs no
    funds of their own;
  - the Keychain approves the payment and the link in one window (3.4);
  - the result shows the link, a QR code, Copy and Share, and the warning
    above.
- **Where the money comes from** follows Send: the user doesn't pick a
  pool. Money already in Ironwood stays private; money from Sapling or
  Orchard shows its amount on-chain on the way in, as any payment from there
  does.
- **No expiry.** A link stays claimable until it's claimed or cancelled. The
  history shows how long an unclaimed link has been waiting.
- **Status**, in history (2.6) and on the link's detail page: Unclaimed,
  Claimed (with when) or Cancelled. The sender never learns who claimed it
  or the address it went to.
- **Seeing the link again** and **Cancelling** both need a Keychain
  approval, like a confirmation step for any security setting: the wallet
  doesn't keep the link itself, only what it needs to show its status. A
  link shown again is gone once the user leaves it.
  Cancelling returns the amount to the account; the claim fee pays for the
  cancellation.
- **Claiming**, by opening the link in the wallet:
  - the page says what the link holds (amount and description) before
    anything else;
  - without the Keychain, or not signed in: onboarding as in the AnomaPay
    app (sign in, sign up, or download the Keychain), then back to the
    claim; the link survives the round trip;
  - signed in: one **Claim** button; no Keychain approval, as the link signs
    for itself; the money arrives at a fresh address of the connected
    account;
  - a link already claimed or cancelled says so, without asking anyone to
    sign in;
  - claiming doesn't wait for the claimer's wallet to finish syncing.
- **Privacy:** the link travels only in the part of the URL browsers never
  send to a server, and the wallet removes it from the address bar and
  browser history once it has read it. The claim is private: nobody, the
  sender included, can see where the money went.
- **Restoring:** links made in another browser or before restoring the
  recovery phrase are found again by the normal sync and show in history
  with their status.
- Links point at the app's own address, set per deployment (e.g.
  `https://zillions-app.netlify.app/`).
- _To confirm_: the AnomaPay onboarding screens and flow to copy.

[ZIP 324]: https://zips.z.cash/zip-0324

## 3. Keychain (browser extension)

Holds the user's secrets. Secrets never leave it; it approves and signs on the
user's behalf.

### 3.1 Create or import a wallet — Working

- **Create**: generates a new recovery phrase, warns the user, and asks them
  to confirm it before continuing.
- **Import**: 12- or 24-word recovery phrase.
  - An optional recovery-phrase passphrase. — _To confirm_ (the Keychain
    supports one, but no screen asks for it).
  - Importing from a private key or a spending key. — _Planned_ (offered on
    screen, not working yet).
  - The user never has to know when their wallet was created. The import
    screen doesn't ask for it: an imported wallet always recovers its full
    history (see 1).
- Name the account and set the extension password.

### 3.2 Manage accounts — Working

- List accounts, select the active one.
- View an account: its addresses.
- **Copy an address to share at any time, even without the app open**: a
  fresh shielded address each time, and the stable transparent one (see
  2.8). — _Built_
- Rename, delete.
- Reveal, after re-entering the password: the **recovery phrase**, the
  **viewing key** (lets someone see, not spend), and the **spending keys**.
- Change the extension password; lock/unlock.

### 3.3 Connected sites — Working

- A site must ask to connect; the user approves or rejects.
- List connected sites; disconnect one or all.
- Sites may ask to change the active account; the user approves.

### 3.4 Approve transactions — Built

- A site asks the Keychain to sign a transaction.
- The approval window shows: network, where funds come from, where they go,
  amounts, and the fee, plus the full details on demand.
- The user approves or rejects; nothing is signed without approval.
- Each step of a migration (2.9) is approved on its own, when the user
  sends it, like any other transaction.
- A payment link (2.10) is approved in one window titled as a payment link,
  showing its amount, the fee and the claim fee. Showing a link again or
  cancelling it is a separate approval of its own. The Keychain shares a
  link's viewing information without asking, as it does the account's, so
  the wallet can show its status. — _Planned_

### 3.5 Works offline — Planned

The Keychain never talks to the network: everything it does happens on the
user's device. Links the user chooses to open (help, community) are not
Keychain traffic.

Challenges to check, one by one:

1. **Wallet creation date.** — _Built_. A **newly created** wallet's block
   height is estimated from the device's clock, with a safety margin so the
   estimate is never later than the real creation (a device clock up to a
   week fast must not hide funds). An imported one may be years old, so it
   always recovers its full history (see 1).
2. **Trustworthy approvals without lookups.** Everything the approval window
   shows (amounts, recipients, fee, network) must come from the transaction
   itself, and the signature must be invalid if a site lies about any of it.
3. **Stale transactions.** Offline, the Keychain cannot tell whether a
   transaction it is asked to sign has already expired or double-spends.
4. **Heavy work stays out.** Preparing shielded transactions needs large
   downloads and minutes of computation (proofs, Sapling parameters); the
   Keychain only signs, and the app does the rest.
5. **No balances in the Keychain.** Showing balances or history there would
   need the network; they stay in the app.
6. **Finding existing accounts.** Importing a recovery phrase that has funds
   in several accounts: discovering which accounts are in use needs the
   network, so the app would have to do it.
7. **Enforced, not promised.** The extension should be technically unable to
   reach the network (its permissions and security policy), so "offline" is a
   guarantee rather than a habit.

### 3.6 Ledger hardware wallet — Built

- **Connect a Ledger** from the Keychain's first screen, instead of creating
  or importing a recovery phrase. Its keys never leave the device: the
  Keychain keeps only what lets the wallet see the account (its viewing key
  and addresses), which the user approves on the device.
- **The wallet supports what Ledger's Zcash app supports, no more.** Today
  that is transparent, Orchard and Ironwood: a Ledger account holds, sees,
  receives and spends in those. The device has no Sapling key, so a Ledger
  account can't see or spend Sapling funds, and a payment to a Sapling-only
  address is refused with an explanation. When Ledger's app adds Sapling, the
  wallet adds it too.
- Needs Ledger's Zcash app 3.9.1 or later (Ironwood); with an older one the
  user is asked to update it. The Ledger Nano S can't run it and is refused
  with an explanation. Chromium-based browsers only: elsewhere the Keychain
  doesn't offer to connect a Ledger.
- A send is approved in the Keychain as usual, then reviewed and approved on
  the device; what the device shows is what gets signed.
- While waiting on the device, the Keychain shows each step (connect, unlock,
  open the Zcash app, approve) with a way to cancel or try again.
- The recovery phrase and spending keys can't be revealed: they never leave
  the device.
- How the device code is laid out (and how a second device slots in) is in
  [hardware-wallets.md](design/hardware-wallets.md).

## 4. Network

- Zcash **mainnet**.
- **Testnet** is chosen when the app and Keychain are built (a configuration
  setting), for development and testing. Users never see a network option.

## 5. Open questions

- Recovery-phrase passphrase on import (3.1)?
- Offline Keychain challenges (3.5): each to be checked.

## References

How other Zcash wallets do things we also do, for comparison. Zodl (formerly
Zashi) is the Zcash reference wallet; its address rotation is the model for
2.2, 2.5 and 2.8.

- Zodl Android: https://github.com/zodl-inc/zodl-android
- Zodl Android SDK: https://github.com/zodl-inc/zodl-android-wallet-sdk
- Zodl iOS: https://github.com/zodl-inc/zodl-ios
- Zodl iOS (Swift) SDK: https://github.com/zodl-inc/zodl-swift-wallet-sdk
- Zingo (zingolib): https://github.com/zingolabs/zingolib — history as value
  transfers, `zingolib/src/perspective.rs`
- Vizor (Chainapsis; Flutter + Rust on zcash_client_sqlite, with Ironwood):
  https://github.com/chainapsis/vizor-wallet
- Zkool (successor to YWallet; its own Rust and SQLite):
  https://github.com/hhanh00/zkool2
- zcash_client_sqlite's history view, `v_transactions` (what Zodl's SDK
  reads): https://github.com/zcash/librustzcash/blob/main/zcash_client_sqlite/src/wallet/db.rs
