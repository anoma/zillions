import { describe, expect, it } from "vitest";

import { freeAlias } from "./alias";

describe("freeAlias", () => {
  it("numbers repeated device names from 2, filling gaps", () => {
    expect(freeAlias("Passkey", [])).toBe("Passkey");
    expect(freeAlias("Passkey", ["Passkey"])).toBe("Passkey 2");
    expect(freeAlias("Passkey", ["Passkey", "Passkey 2"])).toBe("Passkey 3");
    expect(freeAlias("Passkey", ["Passkey", "Passkey 3"])).toBe("Passkey 2");
    expect(freeAlias("Passkey", ["Ledger"])).toBe("Passkey");
  });
});
