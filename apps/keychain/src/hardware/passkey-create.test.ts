import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({ default: { runtime: { id: "x" } } }));
vi.mock("@zillions/components", () => ({}));

const startRegistration = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: (...args: unknown[]) => startRegistration(...args),
  startAuthentication: vi.fn(),
}));
const verifyRegistrationResponse = vi.fn();
vi.mock("@simplewebauthn/server", () => ({
  verifyRegistrationResponse: (...args: unknown[]) => verifyRegistrationResponse(...args),
}));

const { createCredential } = await import("./passkey-view-parts");

const registration = (clientExtensionResults: object) => ({
  id: "cred",
  response: {},
  clientExtensionResults,
});

beforeEach(() => {
  startRegistration.mockReset();
  verifyRegistrationResponse.mockReset().mockResolvedValue({
    verified: true,
    registrationInfo: { credential: { publicKey: new Uint8Array([1]) } },
  });
});

describe("createCredential", () => {
  it("asks for a discoverable credential and its credProps", async () => {
    startRegistration.mockResolvedValue(registration({ credProps: { rk: true } }));
    await createCredential("Passkey");
    const { optionsJSON } = startRegistration.mock.calls[0][0];
    expect(optionsJSON.authenticatorSelection.residentKey).toBe("required");
    expect(optionsJSON.extensions.credProps).toBe(true);
  });

  it("refuses a credential the browser made non-discoverable", async () => {
    startRegistration.mockResolvedValue(registration({ credProps: { rk: false } }));
    await expect(createCredential("Passkey")).rejects.toMatchObject({
      name: "NotDiscoverableError",
    });
    expect(verifyRegistrationResponse).not.toHaveBeenCalled();
  });

  it("goes on when the browser doesn't report discoverability", async () => {
    startRegistration.mockResolvedValue(registration({}));
    await expect(createCredential("Passkey")).resolves.toMatchObject({ reg: { id: "cred" } });
  });
});
