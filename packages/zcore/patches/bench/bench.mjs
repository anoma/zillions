// Runs after build.sh: `node bench.mjs` prints a Markdown table, crates.io → patched.
import { readFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";

const load = async (name) =>
  (await WebAssembly.instantiate(readFileSync(new URL(`out/${name}.wasm`, import.meta.url)))).instance.exports;
const [stock, patched] = await Promise.all([load("stock"), load("patched")]);

const cases = [
  ["`mac` alone", stock.mac_u128_loop, stock.mac_split_loop, 100_000_000],
  ["pasta `Fp` mul (Orchard)", stock.fp_mul, patched.fp_mul, 10_000_000],
  ["pasta `Fq` mul", stock.fq_mul, patched.fq_mul, 10_000_000],
  ["bls12_381 `Scalar` mul (Sapling)", stock.scalar_mul, patched.scalar_mul, 10_000_000],
];
const ROUNDS = 7;

const time = (f, n) => {
  const start = performance.now();
  f(n);
  return performance.now() - start;
};
const median = (xs) => xs.toSorted((a, b) => a - b)[xs.length >> 1];

console.log(`${cpus()[0].model}, ${platform()}-${arch()}, ${navigator.userAgent}\n`);
console.log("| | n | crates.io | patched | change |\n|---|---|---|---|---|");
for (const [label, before, after, n] of cases) {
  // Warm-up, and both versions must agree.
  if (before(n) !== after(n)) throw new Error(`${label}: results differ`);
  const times = [[], []];
  // Alternate so drift on a shared machine hits both sides alike.
  for (let i = 0; i < ROUNDS; i++) [before, after].forEach((f, j) => times[j].push(time(f, n)));
  const [b, a] = times.map(median);
  const change = Math.round((a / b - 1) * 100);
  console.log(`| ${label} | ${n.toLocaleString("en")} | ${Math.round(b)} ms | ${Math.round(a)} ms | ${change > 0 ? "+" : ""}${change}% |`);
}
