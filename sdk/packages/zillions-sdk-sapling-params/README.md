# @zillions-sdk/sapling-params

The Zcash Sapling proving parameters (`sapling-spend.params`, `sapling-output.params`),
byte-identical to the output of the 2018 Sapling MPC ceremony. These files are
immutable: network upgrades never change them, so this package is published once
and essentially never updated.

They are consumed by `@zillions-sdk/wallet` at runtime via `loadProverParams()`:

```ts
import { loadProverParams } from "@zillions-sdk/wallet/params";

// Default: served from this package (copied to /zillions-sdk-sapling-params/
// by the wallet's vite plugin). Fire-and-forget at app start:
loadProverParams();

// Or self-host and pass the base URL:
loadProverParams("https://cdn.example.com/zcash-params/");
```

SHA-256:

- `sapling-spend.params`: `8e48ffd23abb3a5fd9c5589204f32d9c31285a04b78096ba40a79b75677efc13`
- `sapling-output.params`: `2f0ebbcbb9bb0bcffe95a397e7eba89c29eb4dde6191c339db88570e3f3fb0e4`
