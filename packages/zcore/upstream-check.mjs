// Prints a Markdown list of zcore's direct dependencies and patched crates
// that crates.io has newer releases of, or nothing when all are current.
// Unlike cargo audit, this sees fixes shipped without an advisory.
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL(".", import.meta.url);
const lock = readFileSync(new URL("Cargo.lock", dir), "utf8");

const packages = lock
  .split("[[package]]")
  .slice(1)
  .map((block) => ({
    name: block.match(/^name = "(.+)"$/m)[1],
    version: block.match(/^version = "(.+)"$/m)[1],
    deps: [...block.matchAll(/^ "(.+)",$/gm)].map((m) => m[1]),
  }));

// A lockfile dependency is "name" or, when two versions are locked, "name version".
const locked = (dep) => {
  const [name, version] = dep.split(" ");
  return {
    name,
    version: version ?? packages.find((p) => p.name === name).version,
  };
};

const crates = [
  ...packages.find((p) => p.name === "zcore").deps.map(locked),
  ...readdirSync(new URL("patches", dir))
    .filter((f) => f.endsWith(".patch"))
    .map((f) => {
      const [, name, version] = f.match(/^(.+)-(\d.*)\.patch$/);
      return { name, version, patched: true };
    }),
];

const parse = (v) => {
  const [core, pre] = v.split("-");
  return [...core.split(".").map(Number), pre ? 0 : 1];
};
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  const i = x.findIndex((n, i) => n !== y[i]);
  return i !== -1 && x[i] > y[i];
};
// Cargo's ^ range: the first non-zero component must match.
const compatible = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  return x[0] === y[0] && (x[0] !== 0 || x[1] === y[1]);
};

const lines = [];
for (const { name, version, patched } of crates) {
  const res = await fetch(`https://crates.io/api/v1/crates/${name}`, {
    headers: {
      "User-Agent":
        "zillions-interface upstream-check (github.com/anoma/zillions-interface)",
    },
  });
  if (!res.ok) throw new Error(`${name}: crates.io ${res.status}`);
  const { crate } = await res.json();
  const latest = crate.max_stable_version ?? crate.max_version;
  if (newer(latest, version)) {
    const note = patched
      ? "patched: redo or drop `patches/`"
      : compatible(latest, version)
        ? "same release line"
        : "new release line: see `UPGRADING.md`";
    lines.push(
      `- \`${name}\` ${version} → [${latest}](https://crates.io/crates/${name}/versions) (${note})`,
    );
  }
  // crates.io's crawler policy: at most one request a second.
  await new Promise((r) => setTimeout(r, 1000));
}
if (lines.length) console.log(lines.join("\n"));
