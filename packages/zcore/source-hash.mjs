// Prints a hash of every input build.sh turns into pkg/; CI names its pkg/
// artifact after it.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";

const dir = import.meta.dirname;
const files = [
  "build.sh",
  "patch-crates.sh",
  "rust-toolchain.toml",
  "Cargo.toml",
  "Cargo.lock",
  ...readdirSync(`${dir}/patches`)
    .filter((f) => f.endsWith(".patch") || f === "SHA256SUMS")
    .map((f) => `patches/${f}`),
  ...readdirSync(`${dir}/src`, { recursive: true })
    .map((f) => `src/${f.split("\\").join("/")}`)
    .filter((f) => statSync(`${dir}/${f}`).isFile()),
].sort();

const hash = createHash("sha256");
for (const f of files)
  hash
    .update(`${f}\0`)
    .update(readFileSync(`${dir}/${f}`))
    .update("\0");
console.log(hash.digest("hex").slice(0, 16));
