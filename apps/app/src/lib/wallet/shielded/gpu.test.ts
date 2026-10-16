import { describe, expect, it } from "vitest";
import { digits } from "./gpu";
import { PALLAS_Q, mod } from "./gpu.wgsl";

const LAMBDA =
  0x06819a58283e528e511db4d81cf70f5a0fed467d47c033af2aa9d2e050aa0e4fn;

const sum = (d: Int32Array) =>
  d.reduceRight((acc, x) => acc * 2n + BigInt(x), 0n);

/** Two 32-byte little-endian scalars below `max`. */
function scalars(max: bigint, seed: number) {
  const bytes = new Uint8Array(64);
  const values = [0, 1].map((k) => {
    let v = 0n;
    for (let i = 0; i < 32; i++)
      v = (v << 8n) | BigInt((seed * 7919 + k * 104729 + i * 31) % 256);
    v = mod(v, max);
    for (let i = 0; i < 32; i++)
      bytes[k * 32 + i] = Number((v >> BigInt(8 * i)) & 255n);
    return v;
  });
  return { bytes, values };
}

describe("GPU ladder digits", () => {
  it("rebuild each Pallas ivk from its GLV halves", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { bytes, values } = scalars(PALLAS_Q, seed);
      const d = digits("ironwood", bytes);
      values.forEach((k, j) => {
        const [k1, k2] = [0, 128].map((h) =>
          sum(d.subarray(j * 256 + h, j * 256 + h + 128)),
        );
        expect(mod(k1 + LAMBDA * k2, PALLAS_Q)).toBe(k);
      });
    }
  });

  it("rebuild each Sapling ivk, digits odd and in the window", () => {
    const r =
      0x0e7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;
    for (let seed = 0; seed < 50; seed++) {
      const { bytes, values } = scalars(r, seed);
      const d = digits("sapling", bytes);
      values.forEach((k, j) =>
        expect(sum(d.subarray(j * 256, j * 256 + 256))).toBe(k),
      );
      expect(
        d.every((x) => x === 0 || (Math.abs(x) % 2 === 1 && Math.abs(x) < 8)),
      ).toBe(true);
    }
  });
});
