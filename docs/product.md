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
  gets signed. The account's viewing key never reaches a site either: the
  Keychain uses it on the site's behalf, so a site can't keep watching the
  account after it is disconnected or pass the key on. What the wallet keeps
  in the browser (balances, history, addresses) is encrypted, and opens only
  while the Keychain is unlocked. One use of the viewing key goes on while
  locked unless the user turns it off: a site already connected may keep
  syncing (3.9), so a long sync isn't cut short by auto-lock.
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
- Balances are everything the account holds, and every screen shows the same
  one, the transfer forms (2.3–2.5) included. — _Built_
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
- Shows the **balance** of the chosen source, as the home screen does. Part
  of it may not be spendable yet: pending change and funds still processing,
  one confirmation for any transaction (`zcash_client_backend`'s
  `ConfirmationsPolicy::MIN`; transparent coins count once mined). When
  something is confirming, a small info icon by the balance says how much,
  and counts down to when it's spendable. — _Built_
- **Waiting on confirming funds**: a send that needs funds still processing
  isn't an error. Pressing Send shows a notice (not an error) with how much
  is confirming and a live countdown to when it's ready, from the same plan
  as the pending transaction's clock; once that runs late it says so instead.
  When the funds confirm, the notice says the send can go, and the user
  presses Send again. Nothing is signed ahead: the transaction can only be
  built once the funds are on chain, and the Keychain never opens unasked.
  The submit button is never disabled. Shield and Unshield work the same. —
  _Built_
- **Amount** entry in ZEC.
- **Tap-to-fill** (Max): the maximum sendable amount, the balance less the
  fee, kept up to date as the recipient changes. While funds are confirming,
  their fee is estimated; the exact amount shows once they confirm.
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
  network, enough balance, message within 512 bytes, and from NU7 no more
  notes than one block can hold (ZIP 218).
- **Privacy notice** under the button: "This transfer is shielded",
  "partly shielded" or "transparent", depending on source and recipient.
- Approval happens in the Keychain, which shows what is being signed.
- **Receipt** after sending: amount, fee, from, to, time, the message when
  there is one (plain text, links not clickable), and a link to the
  transaction on a block explorer; marked as awaiting confirmation.

### 2.4 Shield — Built

Moves transparent funds into the shielded balance.

- Shows the transparent balance and the **fee** that will be paid.
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

- Shows the shielded balance; the user enters an amount, with tap-to-fill for
  the maximum.
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
    Cancelled). The confirmations are zcash_client_backend's
    `ConfirmationsPolicy::MIN`: one for any transaction. A pending transaction's icon carries a clock;
    hovering or tapping it shows "Processing · 25s left", a countdown
    planned upfront from the block time at the tip: 25 seconds from NU7, 75
    before (for its own, from its broadcast, not its approval, since the
    proof can take many seconds: the next block and a tip check of a fifth
    of a block, 30 seconds). Past the estimate it says "Taking longer than
    usual", with no percent, block count or minutes: the expiry window is
    about 50 minutes, which reads as a wait. The receipt's title shows only the type.
    The receipt right after a send, and the detail page opened while the
    transaction is pending, show the same "Transaction submitted" banner
    with "Processing · 25s left", which turns to "Transaction completed"
    once history has it mined. One that
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
- **Locked Keychain.** — _Built_. A site already connected asks the user to
  unlock the Keychain, never to connect again or with an error. Unlocking,
  from the app or from the Keychain itself, brings the wallet back without a
  reload. An older Keychain can't say it is locked, so a page opened while
  it's locked still shows the connect steps.
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
    above, as soon as the Keychain approves: proving, broadcasting and
    mining go on in the background. Until the payment is broadcast,
    closing the page asks first, since closing it then drops the payment.
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
  - a link whose money isn't on-chain yet says it's being processed for
    five minutes from when it was made, then that the payment wasn't
    found (the page keeps checking, so a late payment still shows up);
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
user's behalf. It also decrypts the chunks a site fetches, and builds and
proves the site's transactions, so the account's viewing key stays in it too.

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
- **Account identity**: each account shows a coloured initial, so the list
  and approvals can be told apart at a glance. The colour is picked from the
  account by default and can be changed; the list can be reordered by
  dragging. — _Built_
- Reveal, after re-entering the password: the **recovery phrase**, the
  **viewing key** (lets someone see, not spend), and the **spending keys**.
  The recovery phrase hides itself again after a minute. — _Built_
- **Copy the recovery phrase**, wherever it's shown (on create and on
  reveal), behind a warning that other apps and synced backups can read the
  clipboard; it copies only once the user confirms. The clipboard is not
  cleared afterwards: clipboard history and sync keep their own copies, so
  clearing would promise more than it delivers. — _Built_
- Change the extension password; lock/unlock.

### 3.3 Connected sites — Working

- A site must ask to connect; the user approves or rejects.
- List connected sites; disconnect one or all.
- The Keychain shows whether the site in the current tab is connected, and
  as which account. — _Built_
- Sites may ask to change the active account; the user approves.

### 3.4 Approve transactions — Built

- A site asks the Keychain to sign a transaction.
- The approval window shows: network, where funds come from, where they go,
  amounts, and the fee, plus every input and output.
- The user approves or rejects; nothing is signed without approval.
- The site asking, and the account it asks for, are shown apart from what is
  asked, above the amount. Every input and output is listed without a click.
  — _Built_
- **Approval log**: the Keychain keeps its own record of what the user
  approved, rejected or closed, per site (for a signed transaction: amount,
  first recipient and account), newest first, and can clear it. It is the
  Keychain's decisions only, not chain history (see 3.5), stays on the
  device, and is encrypted like the other secrets. — _Built_
- Each step of a migration (2.9) is approved on its own, when the user
  sends it, like any other transaction.
- A payment link (2.10) is approved in one window titled as a payment link,
  showing its amount, the fee and the claim fee. Showing a link again or
  cancelling it is a separate approval of its own. The Keychain shares a
  link's viewing information without asking, so the wallet can show its
  status; it never shares the account's. — _Planned_

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
4. **Heavy work on the device, downloads in the app.** — _Built_. The
   Keychain trial-decrypts chunks and builds, signs and proves transactions
   on the device, as that needs the viewing key. It ships the Sapling
   parameters (51 MB) so it still makes no network calls. The app fetches
   the chunks and commitment trees it hands over, and broadcasts the proven
   transaction.
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

### 3.7 Keystone hardware wallet — Built

- **Connect a Keystone 3 Pro running the Cypherpunk firmware** from the
  Keychain's first screen, like a Ledger. Its keys never leave the device:
  the Keychain keeps only what lets the wallet see the account (its viewing
  key and the addresses it names), which the user approves on the device.
  The Zcash app ships only in the Cypherpunk firmware — a Keystone on the
  multi-coin or BTC-only firmware can't connect, and the connect screen
  says so.
- **The wallet supports what Keystone's Zcash app supports.** Its viewing key
  carries every pool — transparent, Orchard, Sapling and Ironwood — so a
  Keystone account can also see and spend Sapling, which a Ledger's can't.
- **The transaction travels by QR code — no cable, no WebHID.** The Keychain
  shows a send as an animated code for the Keystone's camera; the device
  reviews it, the user approves there, and the signed response comes back as
  an animated code the Keychain scans. A browser camera is the only
  hardware it needs, so a Keystone works in Firefox and Safari too, where a
  Ledger needs a Chromium-based browser.
- **The device proves its firmware.** Keystone's signed responses carry its
  Cypherpunk firmware version; the Keychain refuses devices older than 3.0.8
  (the first release that reports it and signs Ironwood transactions) with
  an update prompt.
- A send is approved in the Keychain as usual, then reviewed and approved on
  the device; what the device shows is what gets signed. The device may sync
  several accounts; the Keychain connects the first.
- The recovery phrase and spending keys can't be revealed: they never leave
  the device. The device signs with them; the Keychain's copy of the
  transaction supplies only the proof material a signer may not hold.
- How the device code is laid out is in
  [hardware-wallets.md](design/hardware-wallets.md).

### 3.8 Passkey — Built

- **Connect a passkey from the Keychain's first screen**, like a Ledger.
  The connect screen offers both directions: create a new passkey, or
  use an existing one. Creating makes the browser's password manager
  mint a credential whose on-device key derivation (the WebAuthn PRF)
  supplies the account's keys, evaluated for a fixed salt every time it
  verifies the user. Importing lists the passkeys the browser already
  holds for the Keychain and recovers the account one of them was
  created for — the same passkey re-derives the same account on any
  install, so the passkey is the backup.
- **Each passkey account takes the next free name**, "Account",
  "Account 2"…, as hardware wallets do. The name never says how the
  keys are held: sites see every account's name. A new passkey gets
  the same name in the password manager, so the user can tell passkeys
  apart when importing. An imported passkey's name can't be read back,
  so its account gets the next free name too.
- **The account keeps no secret in the Keychain.** The seed itself is
  never stored anywhere — not on disk, not in the Keychain's encrypted
  vault. The seed and the PRF output it comes from are cleared from
  memory as soon as they're used, as far as the browser allows. What's
  in the vault can't spend by itself. The Keychain
  keeps only what lets it see the account (its viewing key and
  addresses) and the passkey credential's public part.
- **Each passkey is its own account** — its own seed, its own addresses.
  Creating a new passkey makes a new account, never a copy of an
  existing one; connecting several passkeys is like connecting several
  Ledgers. Importing a passkey whose account is already in the Keychain
  is refused.
- **The browser's passkey dialog is the device's screen.** The Keychain
  asks for the passkey it registered as `keychain.zillions.money` from
  its own pages. What the user verifies there is themselves (a fingerprint, a
  PIN), not the transaction: the Keychain's send-approval screen is
  where the transaction is reviewed, and the signing is bound to
  exactly the transaction that screen described.
- **The account has no recovery phrase to write down.** A 24-word
  phrase would restore identically in any Zcash wallet, but the
  Keychain never builds it as text, let alone shows it: the seed is
  derived from the passkey's PRF output directly, re-derived at every
  spend, and cleared from memory once the signature exists. The passkey
  is the backup, and the recovery phrase and the spending keys can't be
  revealed, like a Ledger's.
- Needs Chromium 122+ or Firefox 150+: earlier browsers can't hand a
  `keychain.zillions.money` passkey to an extension.
- How the device code is laid out is in
  [hardware-wallets.md](design/hardware-wallets.md).

### 3.9 Settings — Built

- **Auto-lock**: the Keychain locks after the computer has been idle for 5,
  15 (default), 30 or 60 minutes, or never, and when the screen locks.
  Closing the browser always locks it. Before this setting existed the
  Keychain stayed unlocked until the browser closed.
- **Sync while locked**: on (default), sites already connected keep reading
  chunks with the account's viewing key while the Keychain is locked, so a
  first or long sync finishes while the user is away. Everything else waits
  for unlock: sending, proving, opening the stored wallet, new addresses. Off,
  locking stops syncing too, and the wallet catches up as soon as the user
  unlocks. — _Built_
- **Theme**: light, dark, or following the system (default).

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
