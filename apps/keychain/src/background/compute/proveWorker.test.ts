import { expect, it, vi } from "vitest";

vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  needs_sapling_params: vi.fn(() => false),
  warm_prover: vi.fn(),
  // As the real one returns it: `raw` a plain number array.
  prove_pczt: vi.fn(() => ({ txid: "ab", raw: [1, 2, 3], expiry_height: 9 })),
}));

it("hands back a proven transaction's bytes as a transferable Uint8Array", async () => {
  const sent: { msg: unknown; transfer?: Transferable[] }[] = [];
  const self = {
    location: { origin: "chrome-extension://id" },
    onmessage: null as ((e: { data: unknown }) => Promise<void>) | null,
    postMessage: (msg: unknown, transfer?: Transferable[]) => {
      // What a real worker does: refuses anything in the list it can't transfer.
      sent.push({ msg: structuredClone(msg, { transfer }), transfer });
    },
  };
  vi.stubGlobal("self", self);
  const { startProveWorker } = await import("./proveWorker");
  startProveWorker();

  await self.onmessage!({ data: { op: "prove", pczt: new Uint8Array([7]) } });

  const [{ msg }] = sent;
  expect(msg).toEqual({
    ok: { txid: "ab", raw: new Uint8Array([1, 2, 3]), expiry_height: 9 },
  });
});
