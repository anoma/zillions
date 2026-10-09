import { expect, test } from "vitest";

import { decodeSpent } from "./indexer";

test("a /spent body reads as each nullifier's spending transaction, in order", () => {
  // Postcard: tip 500, 3 entries: Some(400, 3, 1), None, Some(130, 0, 2).
  const body = Uint8Array.of(
    0xf4,
    0x03,
    3,
    1,
    0x90,
    0x03,
    3,
    1,
    0,
    1,
    0x82,
    0x01,
    0,
    2,
  );
  expect(decodeSpent(body)).toEqual([
    { height: 400, tx_index: 3 },
    null,
    { height: 130, tx_index: 0 },
  ]);
});
