# Zillions — Product Spec

What the Zillions wallet does for its users, in product terms. It says
**what** each part must do, never **how** it is built.

## How to use this document

- This is the source of truth for what the wallet must support. Code serves
  this document, not the other way round.
- **Removing code never removes a line here.** A feature that has to go away
  for a while is marked *Disabled*, with the reason and what brings it back.
- Dropping something from scope is a decision for the product owner, recorded
  here first, before any code changes.
- A user-facing screen whose engine is being replaced stays visible, with its
  action disabled, rather than disappearing.

**Status legend**

| Status | Meaning |
|---|---|
| Working | Available to users today |
| Built | Done, awaiting its first real-world test |
| Disabled | Existed, temporarily switched off; must come back |
| Planned | Required, not built yet |
| To confirm | Open question for the product owner |

---

## Principles

Every feature below is held to these, and when they pull against each other
the trade-off is a product decision, written down here.

- **Privacy.** Zcash exists for private money, and the wallet protects it by
  default: shielded is the normal path, and the wallet reveals as little as
  possible (to servers, to sites, on-chain) about who the user is, what they
  hold, and whom they pay. When an action is less private (e.g. sending to a
  transparent address), the user is told before confirming.
- **Security.** Secrets never leave the Keychain, nothing is signed without
  the user's explicit approval, and what the user approves is exactly what
  gets signed.
- **The best UX possible.** Clear screens, no Zcash jargon the user has to
  understand to use the wallet (pools, notes, blocks), sensible defaults, fast
  feedback, and honest waiting states when something takes time.

## 1. Money the wallet can hold

Zcash has four kinds of balance ("pools"). The wallet supports all of them,
fully: holding, seeing, receiving and spending.

| Pool | See balance | Receive | See history | Spend |
|---|---|---|---|---|
| Transparent | Working | Working | Working | Built |
| Sapling | Working | Working | Working | Built |
| Orchard | Working | Working | Working | Built |
| Ironwood | Working | Working | Working | Built |

Spending is *Built*: it awaits a first real transaction.

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
  wallet always recovers the account's full history.

## 2. Wallet app

### 2.1 Wallet (home) — Working

- **Total balance** in ZEC, with the **shielded** and **transparent** parts
  shown separately.
- **Pending** amounts (sent or received but not yet confirmed) are included in
  the total, and their transactions show as pending in the list (2.6). —
  *Built* for sends: what a send spends leaves the balance at once and can't
  be spent again, and its change (or an unshield's amount) counts until it's
  mined or expires. Amounts received but not yet mined aren't shown yet: the
  wallet only reads mined blocks.
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
  transparent address. — *Built*
- **Transparent**: one stable address, shown separately, for exchanges and
  wallets that can't send to shielded addresses.

### 2.3 Send — Built

- **From**: choose the shielded or the transparent balance. Within that
  balance the wallet picks the funds itself (see 1); there is no pool choice.
- Shows the **available** amount for the chosen source.
- **Amount** entry in ZEC.
- **Tap-to-fill** (Max): the maximum sendable amount, the available balance
  less the fee, kept up to date as the recipient changes.
- **To**: paste any Zcash address (transparent, Sapling or unified). The field
  shows at a glance whether the recipient is transparent or shielded.
- **Memo**: not offered to the user. The wallet can still attach one to a
  shielded payment itself (kept for app-set memos later).
- **Fee preview** before confirming, updating as the form changes.
- Checks before sending: amount set, recipient a valid address on this
  network, enough balance.
- **Privacy notice** under the button: "This transfer is shielded",
  "partly shielded" or "transparent", depending on source and recipient.
- Approval happens in the Keychain, which shows what is being signed.
- **Receipt** after sending: amount, fee, from, to, time, and a link to the
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
  findable when the recovery phrase is restored elsewhere. — *Built*
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
    is what moved, the fee apart);
  - **Amount**;
  - **From** and **To**: someone else's address when it's known; the
    account's own addresses only as "Shielded" or "Transparent" (each unshield
    goes to a new address of its own, which nothing else shows), and a
    shielded sender as "Shielded", since it's never revealed;
  - **Status**: "Processing" from the moment a send, shield or unshield is
    broadcast until it's mined, then "Completed"; one that expires unmined
    drops off the list;
  - **Time**.
- A **detail page** per transaction: type, status, amounts broken down (e.g.
  "Sent from Transparent" / "Received in Shielded"), fee, from, to, time,
  memo when there is one, and a block-explorer link.

### 2.7 Sync — Working

- Starts by itself when the wallet opens and resumes where it left off.
- Shows progress ("Shielded sync: N%", then "completed").
- What the last sync found shows at once, transparent and shielded. The
  transparent side is refreshed within seconds; new shielded history fills in
  as the sync progresses.
- Shielded funds count toward the balance only once the wallet has checked
  they are still unspent, so the balance never shows money that is already
  gone. Each pool's funds appear when its scan reaches the present.
- Balance and history update as the sync finds things; no reload needed.

### 2.8 Accounts and Keychain connection — Working

- The app works with the Zillions Keychain browser extension; without it, the
  app explains how to get it (including a download link).
- Checks that the Keychain version is recent enough.
- Header shows the active account, with its shielded and transparent addresses
  (copyable). A fresh shielded one each time it's shown. — *Built*
- **Switch account** from the header.
- **Address rotation.** — *Built*. An account uses many addresses: a fresh
  shielded one each time it shows one (2.2, 3.2), one stable transparent one
  for receiving, and a fresh transparent one for each unshield (2.5). All of
  them count toward its balance and history, and the Keychain signs for any
  of them. The wallet only hands out addresses that other Zcash wallets find
  when restoring the same recovery phrase, so no funds are lost by moving
  wallets.
- Links: Help, Privacy policy, X (Twitter).

### 2.9 Move to Ironwood — Planned

Orchard is closed to new funds since NU6.3; its funds can only leave. The
wallet moves them to Ironwood following [ZIP 318], the standard other
wallets (e.g. Zodl) follow too. Only Orchard is moved: ZIP 318 forbids
offering Sapling as a destination, and Sapling funds stay where they are.

- **On the home screen**, a section between the balance and the
  transactions, shown while Orchard holds at least 0.01 ZEC:
  - before it starts: the Orchard amount, one line on why it should move,
    and a **Migrate** button opening the migration page;
  - while it runs: progress ("Transfer 3 of 8 complete"), when the next
    transfer is due, and that the wallet must stay open for transfers to be
    sent;
  - when a transfer is due but wasn't sent (the wallet was closed): a notice,
    never an error, with **Send now** and **Keep waiting**, saying that
    sending now ties the transfer to this visit.
- **The migration page** walks through, in order:
  1. **What happens**: Orchard is closed, the funds go to Ironwood, the
     amounts moved become public while who holds them stays private, and
     less than 0.01 ZEC stays behind in Orchard.
  2. **How**: *With added privacy* (recommended): the funds move as several
     standard amounts, spread over hours, so they look like everyone
     else's; or *Immediately*: one transfer, faster, its full amount public
     at once. Each shows the number of transfers, the time it takes and the
     fees.
  3. **Network privacy**: a recommendation to use Tor Browser or NymVPN,
     with a warning that the IP address can link the transfers; the user
     may continue without.
  4. **Review**: the whole schedule (each transfer's amount and expected
     time) and the total fees, confirmed once. Nothing leaves Orchard before
     this confirmation; afterwards transfers go out without asking again.
     The Keychain signs the whole schedule in one approval (3.4), in
     batches if it is large.
  5. **Progress**: as on the home screen, with each transfer listed.
- Wording never calls the migration "automatic" or "guaranteed": transfers
  are sent while the wallet is open, and late ones when it next opens.
- In history (2.6), transfers show as Migrated, Orchard → Ironwood; the
  preparation steps that split the funds into standard amounts show as such,
  not as payments.
- *To confirm*: whether a running migration can be paused or cancelled, and
  whether the leftover under 0.01 ZEC can be locked so nothing spends it by
  accident (Zodl offers this).

[ZIP 318]: https://zips.z.cash/zip-0318

## 3. Keychain (browser extension)

Holds the user's secrets. Secrets never leave it; it approves and signs on the
user's behalf.

### 3.1 Create or import a wallet — Working

- **Create**: generates a new recovery phrase, warns the user, and asks them
  to confirm it before continuing.
- **Import**: 12- or 24-word recovery phrase.
  - An optional recovery-phrase passphrase. — *To confirm* (the Keychain
    supports one, but no screen asks for it).
  - Importing from a private key or a spending key. — *Planned* (offered on
    screen, not working yet).
  - The user never has to know when their wallet was created. The import
    screen offers an optional block height; whether to keep it is *To
    confirm*.
- Name the account and set the extension password.

### 3.2 Manage accounts — Working

- List accounts, select the active one.
- View an account: its addresses.
- **Copy an address to share at any time, even without the app open**: a
  fresh shielded address each time, and the stable transparent one (see
  2.8). — *Built*
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
- A migration schedule (2.9) is approved as a whole: one window lists every
  transfer and the total fees, and one approval signs them all. — *Planned*

### 3.5 Works offline — Planned

The Keychain never talks to the network: everything it does happens on the
user's device. Links the user chooses to open (help, community) are not
Keychain traffic.

Challenges to check, one by one:

1. **Wallet creation date.** When no date is given, creating or importing a
   wallet currently asks a Zcash server for the current block height. To
   explore: estimate the block height from the device's clock, with a safety
   margin so the estimate is never later than the real creation (a wrong
   device clock must not hide funds). This only applies to a **newly created**
   wallet: an imported one may be years old, so it always recovers its full
   history (see 1).
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

## 4. Network

- Zcash **mainnet**.
- **Testnet** is chosen when the app and Keychain are built (a configuration
  setting), for development and testing. Users never see a network option.

## 5. Open questions

- Recovery-phrase passphrase on import (3.1)?
- Keep or drop the optional creation block height on import (3.1)?
- Offline Keychain challenges (3.5): each to be checked.
- **Sapling spends the wallet can't place (2.6).** When Sapling funds are
  spent in a transaction that leaves nothing else the wallet can see (no
  change, no payment it can read back, no transparent side of its own), the
  wallet knows the funds are spent but not in which transaction. The balance
  is right; the history has no entry for it. Typical case: sending a whole
  Sapling note to someone else's transparent address. How should history
  show it, and is a slower lookup to find the transaction worth it?

## References

How other Zcash wallets do things we also do, for comparison. Zodl (formerly
Zashi) is the Zcash reference wallet; its address rotation is the model for
2.2, 2.5 and 2.8.

- Zodl Android: https://github.com/zodl-inc/zodl-android
- Zodl Android SDK: https://github.com/zodl-inc/zodl-android-wallet-sdk
- Zodl iOS: https://github.com/zodl-inc/zodl-ios
- Zodl iOS (Swift) SDK: https://github.com/zodl-inc/zodl-swift-wallet-sdk
