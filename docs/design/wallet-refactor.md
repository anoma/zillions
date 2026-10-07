# Wallet refactor

Status: built in October 2026 on `refactor/wallet`, one PR. Behaviour
doesn't change except where noted: storage is reset, so every account
resyncs once. What the wallet must do stays in
[product.md](../product.md); this is how the code is laid out.

## Why

`ZWallet` (789 lines) holds seven jobs: loading and saving, the shielded
crawl, Sapling nullifier checks, the block cache, recovering our sends,
pending transactions, and send planning plus history. The folder is named
after the indexer (`zcrawler`), not after what the app sees. Payment links
([payment-links.md](payment-links.md)) are next, and they'd add an eighth job.

## Decisions

- **Name.** `lib/zcrawler/` becomes `lib/wallet/`, and `ZWallet` becomes
  `Wallet`, matching `WalletProvider`, `useWallet` and `WalletContext`.
  "zcrawler" stays the backend's name only.
- **A pure core with a thin shell.** The logic is plain functions over plain
  data, tested without mocks. The `Wallet` class stays as the shell and keeps
  what sync can't lose:
  - block lookups never overlapping (`#placing`)
  - saves never reordered (`#saving`)
  - abort
  - progress listeners

  The crawl keeps chunks applied in order itself (`locating`, in
  `shielded/sync.ts`).

- **Shielded and transparent are separate modules,** joined in one place:
  - **Chain tip.** It's its own call (`fetchLatestHeight`), not read from
    the transparent sync. A shielded send is planned once the tip is known.
    Plans that spend coins (from transparent, and shielding) still wait for
    this session's transparent sync, since the chain may have moved the
    coins since.
  - **Pending transactions.** They hold both nullifiers and outpoints.
  - **Our sending transactions.** A transparent spend can pay into a
    shielded pool; this covers `sendingTxs` and `recoverSends`.
  - **Payments to others' transparent addresses.** These need our
    transparent addresses.
  - **History.** The two sides merge by txid.
- **No stored activity table.** History stays derived: `buildActivity` is pure
  and runs in memory over a few hundred rows. Its only network cost, blocks
  for txids and times, is already cached. A stored copy would be rewritten
  each time sync learns more about an entry (spend placed, txid found, sends
  recovered, transparent side merged), and any missed rewrite shows wrong
  history. `TransactionReceipt` is renamed `Activity`.
- **Notes and sent outputs stay separate.** Notes are money we own, and the
  balance depends on them being exactly right. Sent outputs are money we paid
  out and only matter for history. They share a base type (`Output`: pool,
  value, recipient, memo, height, tx_index, position), not a table.
- **A note's spend is an explicit status.** It was
  `undefined | false | true | TxLocator`. It's now
  `{ status: "unchecked" | "unspent" } | { status: "spent"; at?: TxLocator }`.
  A spent note with no `at` is a Sapling spend whose transaction isn't found
  yet.
- **Pending transactions** left `SyncStatus` and are a list of their own in
  the wallet state.
- **One config module** reads `VITE_ZCASH_NETWORK`, `VITE_INDEXER_URL` and
  `VITE_GRPC_URL`. Seven files read them before.

## Layout

```
lib/wallet/
  wallet.ts       the shell: state, sync order, subscribe, public API
  config.ts       network and URLs
  types.ts        WalletState and its types (Output, Note, Sent, Activity)
  chain/          indexer, lightwalletd, http, submit, prove
  shielded/       crawl and its worker; sync.ts (the crawl, recover sends);
                  spends.ts (Orchard/Ironwood rho, Sapling nullifiers)
  transparent.ts  as before, minus its storage
  pending.ts      hold, prune, pending activity
  balance.ts      spendable, balances, WalletData for send planning
  activity.ts     buildActivity, our sending transactions, their payments
  send.ts         as before
  store.ts        load and save one account's state, encrypted
```

Removed:

- `lib/sdk/types.ts`: its live types moved to `types.ts`, and `Network` and
  `SummaryAccountBalances` were unused.
- `lib/db.ts` and the `idb` and `dexie-react-hooks` dependencies: nothing
  imported them; they were left from the old SDK.
- The Dexie version history v2–v9: each upgrade only cleared tables.

## Storage

**The IndexedDB data is encrypted.** Storage is reset in this PR anyway, so
encrypting cost no extra resync, and it's WebCrypto with no new dependency.

**Threat.** Someone else uses the same computer, or copies the browser
profile. IndexedDB is plain text to devtools and to anyone reading the disk.
It held amounts, memos, counterparty addresses, our transparent addresses,
and the note positions and nullifiers that tie the user to on-chain
activity.

**Key.** The key is derived from the account's UFVK: HKDF-SHA256 over the
UFVK, with `info` `"zillions-storage"`, giving a non-extractable AES-GCM-256
`CryptoKey`. Two reasons:

- **Equivalent.** Anyone holding the UFVK can rebuild the whole history from
  the chain anyway. So the cache is exactly as private as the viewing key,
  never less.
- **Already gated.** The Keychain hands the UFVK to the app only while it's
  unlocked (`assertConnected`, in the Keychain's approvals service). So the
  stored data opens only after the Keychain password, with no Keychain
  change.

AnomaPay does the same in spirit. It derives a storage key with
HMAC-SHA256(seed, storage domain), holds it in `sessionStorage` for the
session, and keeps one AES-GCM blob per record (`iv || ciphertext`, HKDF key).
Our UFVK plays the role of its seed-derived key. It's never stored by the
app, so nothing is kept in `sessionStorage`.

**Shape.** One encrypted row per account: `{ id, iv, data }`, where `data` is
the whole `WalletState` as JSON. Per-row encryption with plain keys would
leak exactly what we're hiding. AnomaPay's keys are tx hashes, and ours would
be note positions. Blocks are public chain data, but the heights we fetch
show when the user transacted. So the block facts history uses (txids,
times, transparent outputs, Sapling nullifiers, tree sizes) move into the
account's state too, instead of a shared `blocks` table. The state is JSON,
with `Map`, `Uint8Array` and `bigint` tagged so they come back as they were.
A state of another `version` is dropped and synced afresh.

The old `#save` already rewrote every note on each chunk, so one record per
save is no worse. Saves that arrive while one is being written share the
next write. The test wallet's state is 126 KB for about 30 transactions. A
whole-state rewrite stays cheap at thousands of notes; split it into
encrypted chunks if a wallet ever holds tens of thousands.

**Not covered here**, Keychain follow-ups:

- **UFVK stored in plain text.** The Keychain keeps it as a plain field
  (`owner` in the vault schema). Someone who copies the browser profile gets
  the UFVK, and with it everything this cache hides. Encrypting it under the
  vault password closes that.
- **No auto-lock.** `requiresAuth` asks for the password again before
  signing once 30 minutes have passed since it was last entered, but the
  vault stays unlocked until the browser closes. An unlocked Keychain on a
  shared computer opens everything.
- **Re-auth window.** `checkPassword` restarts that 30-minute window before
  it checks the password, so a wrong password lets the next signature skip
  it.

product.md's security principle now says local wallet data is encrypted and
opens only with an unlocked Keychain.

## Tests

The modules have tests on plain data. Only zcore's wasm calls, and the
indexer behind the Sapling check, are stubbed.

- placing spends, marking unspent, the Sapling nullifier check and cursor,
  and locating Sapling spends (`shielded/spends.test.ts`)
- progress percentage (`shielded/sync.test.ts`)
- pending holds, pruning by either side and by expiry, and pending activity
  (`pending.test.ts`)
- spendable notes and coins, balances, and WalletData txids
  (`balance.test.ts`)
- our sending transactions and what they paid (`activity.test.ts`)
- the store: a round trip with nothing readable, a wrong key, and an old
  version (`store.test.ts`)

`wallet.test.ts` keeps eight end-to-end cases for chunk order, concurrency,
pending sends, storage loading and the block cache.

## Commits

1. Rename `zcrawler` to `wallet` and drop the dead code; add `config.ts`.
2. Group the chain clients (`chain/`) and the shielded crawl (`shielded/`).
3. Keep each account's state encrypted. This adds the spend status, pending
   as its own list, block facts inside the state, the tip as its own call,
   and transparent without its own storage.
4. Split the wallet into modules with their own tests.
5. Add the `Output` base type, and the docs.

Every commit passes typecheck, lint and tests.
