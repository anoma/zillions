// Prints a hash of every input build.sh turns into pkg/; CI names its pkg/
// artifact after it. Every file git tracks under packages/zcore counts unless
// `notInputs` says it can't affect the build, so a new input is covered by
// default. Cargo also reads .cargo/ configs in parent directories, and the
// workflow sets the build's environment, so those count too.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const notInputs =
  /^packages\/zcore\/(.*\.md|\.gitignore|package\.json|smoke\.mjs|upstream-check\.mjs|test-ziziphus\.sh|examples\/.*|patches\/bench\/.*)$/;

const git = (...args) =>
  execFileSync("git", args, { cwd: import.meta.dirname, encoding: "utf8" });
const root = git("rev-parse", "--show-toplevel").trim();
const files = git(
  "-C",
  root,
  "ls-files",
  "-z",
  "--",
  "packages/zcore",
  "packages/.cargo",
  ".cargo",
  ".github/workflows/build-wasm.yml",
)
  .split("\0")
  .filter((f) => f && !notInputs.test(f))
  .sort();

const hash = createHash("sha256");
for (const f of files)
  hash
    .update(`${f}\0`)
    .update(readFileSync(`${root}/${f}`))
    .update("\0");
console.log(hash.digest("hex").slice(0, 16));
