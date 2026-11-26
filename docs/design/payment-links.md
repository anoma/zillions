# Payment links

Status: October 2026 design; creating links is built, claiming isn't. What it does for users is
[product.md 2.10](../product.md); this is how. It follows [ZIP 324] (draft,
Sapling only, no wallet ships it) where it can; each departure is listed at
the end, to propose upstream.

## Keys

- **Link key:** 32 random bytes from `crypto.getRandomValues`, used as an
  Orchard spending key (Ironwood uses Orchard keys). Drawn again in the rare
  case zcore rejects the bytes as a spending key. The link's address is that
  key's default address: a throwaway account that holds one note. `nk` is
  the link key's nullifier key, enough to tell whether its note was spent.
- **Sealing key:** BLAKE2b-256 of the account's Orchard spending key,
  personalisation `Zillions_PayLink`. Derived in the Keychain from the seed,
  never leaves it. Permanent once a link exists.
- **Sealed link key:** `link key ⊕ BLAKE2b-256(key = sealing key, nk)`. `nk`
  is unique per link, so each pad is used once; opening is checked by
  rederiving `nk` and the address from the result.
- **Keychain calls:**
  - seal (link key → sealed): no approval. Not for Ledger accounts, whose
    seed never leaves the device. It can't open anything: unsealing
    a link needs that link's key already.
  - open (sealed, `nk` → link key): approval each time (show again, cancel).
- **The only plain copy** is the link itself. The app holds the key in
  memory while the link is shown or a cancel is signed, and never writes it
  to IndexedDB, `localStorage` or any other storage. On the claim page the
  link itself is the exception, kept in `sessionStorage` until claimed,
  since the claimer has no other copy.

## The link

`<the app's URL>claim#v=1&k=<key>&a=<ZEC>&s=<size>&n=<main|test>&t=<unix seconds>&d=<description>`

| Field | Meaning                                                                  |
| ----- | ------------------------------------------------------------------------ |
| `v`   | Format version, so a final ZIP 324 format can sit beside it              |
| `k`   | Link key, unpadded base64url                                             |
| `a`   | Amount the claimer receives                                              |
| `s`   | Ironwood tree size when the link was made: the note lands at or after it |
| `n`   | Network                                                                  |
| `t`   | When the funding was approved, unix seconds; optional for older links    |
| `d`   | Optional description                                                     |

Everything sits in the fragment, which browsers never send. The claim page
reads it, keeps it in `sessionStorage` through onboarding, and strips it
with `history.replaceState`.

## Funding

- An ordinary send (zcore `propose`, same pool selection) to the link's
  address, of `a` + the claim fee: the claim spends one note into one output,
  2 logical actions under ZIP 317, 10,000 zat.
- **Memo** ([ZIP 302] `0xFF` = application data):

  ```
  0xFF | "PAYLINK" | version (1 byte) | nk (32 bytes) | sealed link key (32 bytes) | description (UTF-8, optional)
  ```

  The memo is encrypted with the note like any other, so the link key's
  holder and our OVK can read it. With the UFVK alone that gives the
  description and whether the link was claimed, but not the link: opening
  the sealed key takes the seed.

- No change is forced: it would cost an extra output's fee.

## Claim (no Keychain signature)

1. `/ironwood/ciphertexts/⌊s / 2¹⁴⌋` and onward to the tip (usually one
   chunk; more if the funding was mined late): trial-decrypt with the link's
   incoming viewing key, giving the note, its position and rho. No note yet
   → "On its way": the funding isn't mined, so look again shortly.
2. `/ironwood/nullifiers/⌊s / 2¹⁸⌋` up to the last chunk (an Ironwood
   nullifier's index equals its action's note position, confirmed by the
   indexer team): is the note's
   nullifier there? Usually one chunk, a few for an old link; full chunks are
   immutable, so the browser caches them. Whole chunks, so the indexer never
   learns which link is checked. Spent → "Already claimed or cancelled":
   the claimer can't tell which, and doesn't need to.
3. Witness from the Ironwood tip and tree chunks, as for any spend.
4. zcore builds the PCZT: the note → a fresh Ironwood address of the
   connected account, fee = the claim fee, **OVK = the claimer's own**. zcore
   signs it with the link key (the `pczt` Signer takes a spending key),
   proves and broadcasts it.

A broadcast that fails because the note was spent meanwhile (someone else
claimed first) also ends at "Already claimed or cancelled".

The claimer's own sync isn't needed: only the link's note and one address
from the UFVK.

## Sender side

- **Finding links:** sync already opens, with our OVK, every output our
  transactions paid (`#applySent`, `#recoverSends`). One whose memo starts
  `0xFF "PAYLINK"` is a link; its row becomes "Payment link". This also
  recovers links made elsewhere or before a restore.
- **Status:** the note's nullifier, from `nk` and the recovered note, joins
  the ones sync looks up (`checkSpends`). Spent by a transaction of ours =
  Cancelled, by anyone else's = Claimed.
- **Show again / Cancel:** the Keychain opens the sealed key (approval).
  Before using it, check that its address equals, byte for byte, the address
  the funding output paid. Cancel = the claim path, paid to our own address.

## Departures from ZIP 324

- Ironwood note and Orchard keys instead of Sapling. An Orchard-family note's
  rho comes from the funding transaction, so it can't be derived from the key
  and amount as ZIP 324 does: the link carries `s` and the claimer
  trial-decrypts.
- A random key, sealed in the memo, instead of one derived from the seed
  with a counter and gap limit 3.
- The link's amount is what the claimer receives; the claim fee is on top.
- The key in base64url instead of Bech32: no new dependency, and a
  damaged key fails the spending-key check or finds no note.
- Our own URL instead of `pay.withzcash.com:65536`, which a web app can't
  catch.

[ZIP 302]: https://zips.z.cash/zip-0302
[ZIP 324]: https://zips.z.cash/zip-0324
