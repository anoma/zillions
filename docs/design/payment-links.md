# Payment links

Status: October 2026 design, not built. What it does for users is
[product.md 2.10](../product.md); this is how. It follows [ZIP 324] (draft,
Sapling only, no wallet ships it) where it can; each departure is listed at
the end, to propose upstream.

## Keys

- **Path:** `m_Orchard/324'/coin_type'/r₁'/r₂'`, coin type 133 on mainnet and
  1 on testnet. Ironwood uses Orchard keys; there is no `m_Ironwood`.
- **r₁, r₂** are random 31-bit hardened indexes, not ZIP 324's counter: the
  same recovery phrase in two browsers can't pick the same link (62 bits make
  a clash between one wallet's links negligible), and no counter needs
  keeping or recovering.
- **Link secret:** BLAKE2b-256 of the derived extended spending key,
  personalisation `Zcash_PaymentURI` (ZIP 324), used as an Orchard spending
  key. The link's address is that key's default address.
- **Keychain calls** (seed only there):
  - link viewing key for (r₁, r₂): no approval, same trust as the UFVK;
  - link secret for (r₁, r₂): approval each time (create, show again, cancel).
- **The app stores** per link: r₁, r₂ and the viewing key. The secret is
  ephemeral: held in memory only while the link is shown or a cancel is
  signed, never written to IndexedDB, `localStorage` or any other storage.
  On the claim page the link itself is the exception, kept in
  `sessionStorage` until claimed, since the claimer has no other copy.

## The link

`${VITE_APP_URL}claim#v=1&k=<secret>&a=<ZEC>&s=<size>&n=<main|test>&d=<description>`

| Field | Meaning                                                                  |
| ----- | ------------------------------------------------------------------------ |
| `v`   | Format version, so a final ZIP 324 format can sit beside it              |
| `k`   | Link secret, Bech32 as in ZIP 324                                        |
| `a`   | Amount the claimer receives                                              |
| `s`   | Ironwood tree size when the link was made: the note lands at or after it |
| `n`   | Network                                                                  |
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
  0xFF | "PAYLINK" | version (1 byte) | r₁ (4 bytes BE) | r₂ (4 bytes BE) | description (UTF-8, optional)
  ```

  The claimer can read it too, but already holds the link.

- No change is forced: it would cost an extra output's fee.

## Claim (no Keychain signature)

1. `/ironwood/ciphertexts/⌊s / 2¹⁴⌋` (and the next chunk at a boundary):
   trial-decrypt with the link's incoming viewing key, giving the note, its
   position and rho.
2. `/ironwood/nullifiers/⌊s / 2¹⁸⌋` up to the last chunk (an Ironwood
   nullifier's index equals its action's note position, confirmed by the
   indexer team): is the note's
   nullifier there? Usually one chunk, a few for an old link; full chunks are
   immutable, so the browser caches them. Whole chunks, so the indexer never
   learns which link is checked. Spent → "Already claimed".
3. Witness from the Ironwood tip and tree chunks, as for any spend.
4. zcore builds the PCZT: the note → a fresh Ironwood address of the
   connected account, fee = the claim fee, **OVK = the claimer's own**. zcore
   signs it with the link secret (the `pczt` Signer takes a spending key),
   proves and broadcasts it.

The claimer's own sync isn't needed: only the link's note and one address
from the UFVK.

## Sender side

- **Finding links:** sync already opens, with our OVK, every output our
  transactions paid (`#applySent`, `#recoverSends`). One whose memo starts
  `0xFF "PAYLINK"` is a link; its row becomes "Payment link". This also
  recovers links made elsewhere or before a restore.
- **Status:** with the link's viewing key (from the Keychain, no approval)
  the note's nullifier joins the ones sync looks up (`checkSpends`). Spent by
  a transaction of ours = Cancelled, by anyone else's = Claimed.
- **Show again / Cancel:** the Keychain derives the secret (approval). Before
  using it, check that its address equals, byte for byte, the address the
  funding output paid. Cancel = the claim path, paid to our own address.

## Departures from ZIP 324

- Ironwood note and Orchard keys instead of Sapling. An Orchard-family note's
  rho comes from the funding transaction, so it can't be derived from the key
  and amount as ZIP 324 does: the link carries `s` and the claimer
  trial-decrypts.
- Random indexes in the memo instead of a counter with gap limit 3.
- The link's amount is what the claimer receives; the claim fee is on top.
- Our own URL instead of `pay.withzcash.com:65536`, which a web app can't
  catch.

[ZIP 302]: https://zips.z.cash/zip-0302
[ZIP 324]: https://zips.z.cash/zip-0324
