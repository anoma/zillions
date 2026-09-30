# @zillions/sapling-params

The Zcash Sapling proving parameters (`sapling-spend.params`, `sapling-output.params`),
byte-identical to the output of the 2018 Sapling MPC ceremony. They never change.

The app's prover worker imports them as asset URLs and fetches them only when a
transaction has Sapling spends or outputs, checking these SHA-256 hashes before
handing them to zcore:

- `sapling-spend.params`: `8e48ffd23abb3a5fd9c5589204f32d9c31285a04b78096ba40a79b75677efc13`
- `sapling-output.params`: `2f0ebbcbb9bb0bcffe95a397e7eba89c29eb4dde6191c339db88570e3f3fb0e4`
