import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({ default: { runtime: { id: "x" } } }));

const signPczt = vi.fn();
vi.mock("../background/crypto/zillions", () => ({
  signPczt: (...args: unknown[]) => signPczt(...args),
}));

const verifyAssertion = vi.fn();
vi.mock("./passkey-core", async (importActual) => ({
  ...(await importActual<typeof import("./passkey-core")>()),
  verifyAssertion: (...args: unknown[]) => verifyAssertion(...args),
}));

const { b64, b64url, pcztChallenge } = await import("./passkey-core");
const { deriveSeed } = await import("./passkey-seed");
const { passkeyPrfEngine } = await import("./passkey-prf");

const PCZT = btoa("unsigned pczt");
const ENTROPY = new Uint8Array(32).fill(7);
const PUBLIC_KEY = new Uint8Array([1, 2, 3]);
const deviceData = JSON.stringify({
  assertion: { id: "cred" },
  prf: b64url.encode(ENTROPY),
});
const created = { id: "cred", rpId: "rp", publicKey: b64.encode(PUBLIC_KEY) };
const imported = { id: "cred", rpId: "rp" };

const assemble = (
  context?: Parameters<typeof passkeyPrfEngine.assembleSignedPczt>[2],
) => passkeyPrfEngine.assembleSignedPczt(PCZT, deviceData, context);

describe("passkey engine: assembleSignedPczt", () => {
  beforeEach(() => {
    signPczt.mockReset().mockResolvedValue("signed");
    verifyAssertion.mockReset().mockResolvedValue(undefined);
  });

  it("verifies a created credential's assertion against the stored key, then signs with the PRF seed", async () => {
    let seenSeed: Uint8Array | undefined;
    signPczt.mockImplementation(async (_pczt, seed: Uint8Array, hdIndex) => {
      seenSeed = new Uint8Array(seed);
      expect(hdIndex).toBe(3);
      return "signed";
    });

    await expect(assemble({ credential: created, hdIndex: 3 })).resolves.toBe(
      "signed",
    );

    const [, challenge, key] = verifyAssertion.mock.calls[0];
    expect(challenge).toBe(await pcztChallenge(PCZT));
    expect([...(key as Uint8Array)]).toEqual([...PUBLIC_KEY]);
    expect(seenSeed).toEqual(await deriveSeed(new Uint8Array(ENTROPY)));
    // The seed handed to signPczt is zero-filled once the call returns.
    expect(signPczt.mock.calls[0][1].every((b: number) => b === 0)).toBe(true);
  });

  it("signs nothing when the assertion fails verification", async () => {
    verifyAssertion.mockRejectedValue(new Error("bad assertion"));
    await expect(assemble({ credential: created, hdIndex: 0 })).rejects.toThrow(
      "bad assertion",
    );
    expect(signPczt).not.toHaveBeenCalled();
  });

  it("signs an imported credential without verifying (no public key to verify with)", async () => {
    await expect(assemble({ credential: imported, hdIndex: 0 })).resolves.toBe(
      "signed",
    );
    expect(verifyAssertion).not.toHaveBeenCalled();
  });

  it("refuses without the stored credential or account index", async () => {
    await expect(assemble({ hdIndex: 0 })).rejects.toThrow(
      "stored credential is missing",
    );
    await expect(assemble({ credential: created })).rejects.toThrow(
      "account index is missing",
    );
    expect(signPczt).not.toHaveBeenCalled();
  });
});
