import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as zcore from "@zillions/zcore";

vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  gpu_inputs: vi.fn(),
  try_decrypt: vi.fn(),
  try_decrypt_gpu: vi.fn(),
  try_decrypt_full: vi.fn(),
}));
vi.mock("../crypto/network", () => ({ getNetwork: () => "main" }));

const sent: unknown[] = [];
const self = {
  location: { origin: "chrome-extension://id" },
  onmessage: null as ((e: { data: unknown }) => Promise<void>) | null,
  postMessage: (msg: unknown) => void sent.push(msg),
};
vi.stubGlobal("self", self);
beforeAll(async () => {
  const { startDecryptWorker } = await import("./decryptWorker");
  startDecryptWorker();
});

const task = {
  op: "compact",
  ufvk: "uview",
  pool: "orchard",
  chunk: 1,
  body: new Uint8Array(),
  from: 0,
  tried: new Uint8Array(),
  gpu: true,
};
const read = () => self.onmessage!({ data: task });

beforeEach(() => {
  sent.length = 0;
  vi.mocked(zcore.gpu_inputs).mockReset();
  vi.mocked(zcore.try_decrypt).mockReset();
});

it("keeps the GPU on after a chunk the CPU can't read either", async () => {
  const truncated = () => {
    throw new Error("chunk ends early");
  };
  vi.mocked(zcore.gpu_inputs).mockImplementation(truncated);
  vi.mocked(zcore.try_decrypt).mockImplementation(truncated);
  await read();
  expect(sent).toEqual([{ error: "Error: chunk ends early" }]);

  vi.mocked(zcore.gpu_inputs).mockReturnValue(new Uint8Array(64));
  vi.mocked(zcore.try_decrypt).mockReturnValue({ hits: [] });
  await read();
  expect(zcore.gpu_inputs).toHaveBeenCalledTimes(2);
});

it("turns the GPU off once it fails on a chunk the CPU reads", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(zcore.gpu_inputs).mockImplementation(() => {
    throw new Error("device lost");
  });
  vi.mocked(zcore.try_decrypt).mockReturnValue({ hits: [] });
  await read();
  expect(sent).toEqual([{ ok: { hits: [] } }]);

  await read();
  expect(zcore.gpu_inputs).toHaveBeenCalledTimes(1);
  expect(zcore.try_decrypt).toHaveBeenCalledTimes(2);
});
