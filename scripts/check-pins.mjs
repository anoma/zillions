#!/usr/bin/env node
// Fails when anything the build pulls in is not pinned to one exact version:
// package.json dependencies, the pnpm catalog, the package manager, and the
// GitHub Actions the workflows run. A range or a tag lets a compromised
// release arrive on its own; a pin makes every upgrade a reviewed diff.
import { globSync, readFileSync } from "node:fs";

const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
// Resolved inside the workspace, never from the registry.
const INTERNAL = /^(workspace|catalog|link|file):/;
const SHA = /^[0-9a-f]{40}$/;

const failures = [];
const fail = (file, what) => failures.push(`${file}: ${what}`);

const manifests = globSync(["package.json", "apps/**/package.json", "packages/**/package.json"], {
  exclude: (path) => /node_modules|\/dist|\.output|\.wxt|\/pkg\//.test(path),
});
for (const file of manifests) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (!INTERNAL.test(spec) && !EXACT.test(spec)) fail(file, `${name} is "${spec}"`);
    }
  }
  if (pkg.packageManager && !/^pnpm@\d+\.\d+\.\d+$/.test(pkg.packageManager)) {
    fail(file, `packageManager is "${pkg.packageManager}"`);
  }
}

const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
const catalog = workspace.match(/^catalog:\n((?:  .*\n?)*)/m)?.[1] ?? "";
for (const m of catalog.matchAll(/^  (\S+): (.*)$/gm)) {
  if (!EXACT.test(m[2])) fail("pnpm-workspace.yaml", `catalog ${m[1]} is "${m[2]}"`);
}

for (const file of globSync([".github/workflows/*.yml", ".github/actions/**/action.yml"])) {
  for (const m of readFileSync(file, "utf8").matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
    const action = m[1];
    if (action.startsWith("./")) continue;
    const ref = action.split("@")[1];
    if (!ref || !SHA.test(ref)) fail(file, `${action} is not pinned to a commit`);
  }
}

if (failures.length) {
  console.error("Unpinned versions:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log(`All pinned: ${manifests.length} manifests, catalog, workflows.`);
