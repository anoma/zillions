/**
 * The passkey consensus constants, pinned. These values are
 * consensus-critical once any passkey account exists: `RP_ID` scopes
 * which credential a ceremony can use, and `PRF_SALT` is the PRF input
 * the account seed derives from. A silent edit here turns every passkey
 * account into a different wallet — so an edit must fail here first.
 */
import { describe, expect, it } from "vitest";

import {
  PRF_SALT,
  RP_ID,
  RP_NAME,
  rpHostPermissions,
} from "./passkey-constants";

describe("passkey consensus constants", () => {
  it("pins the RP ID", () => {
    expect(RP_ID).toBe("keychain.zillions.money");
  });

  it("pins the PRF salt", () => {
    expect(new TextDecoder().decode(PRF_SALT)).toBe("zillions/zcash-seed/v1");
  });

  it("pins the RP name", () => {
    expect(RP_NAME).toBe("Zillions");
  });

  it("keeps the RP off the hosts the product serves", () => {
    // The app and the apex must never be able to claim the RP: a caller
    // claims its own host and its parents, never a child. This doesn't
    // cover pages at or under the RP host itself; see `RP_ID`.
    expect(RP_ID.endsWith(".zillions.money")).toBe(true);
    expect(RP_ID).not.toBe("zillions.money");
  });

  it("derives the manifest's host permission from the RP ID", () => {
    expect(rpHostPermissions(RP_ID)).toStrictEqual([
      "https://keychain.zillions.money/*",
    ]);
  });
});
