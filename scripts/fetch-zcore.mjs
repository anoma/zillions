// Puts CI's build of zcore (the `zcore-pkg-<source hash>` artifact from
// .github/workflows/build-wasm.yml) into packages/zcore/pkg, waiting while CI
// is still building this commit. What ships uses this, never a local build.
//
// Env: ZCORE_GITHUB_TOKEN or GITHUB_TOKEN (read access to Actions); the repo as
// GITHUB_REPOSITORY or Netlify's REPOSITORY_URL; the commit as COMMIT_REF or
// GITHUB_SHA. Production (CONTEXT=production) and main's branch deploy
// (BRANCH=main) accept only main's and production's own builds.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const zcore = new URL("../packages/zcore/", import.meta.url).pathname;
const token = process.env.ZCORE_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
const repo =
  process.env.GITHUB_REPOSITORY ??
  process.env.REPOSITORY_URL?.match(
    /github\.com[:/](.+?\/.+?)(\.git)?\/?$/,
  )?.[1];
const commit = process.env.COMMIT_REF ?? process.env.GITHUB_SHA;
const strict =
  process.env.CONTEXT === "production" || process.env.BRANCH === "main";
if (!token || !repo || !commit) {
  throw new Error(
    "fetch-zcore needs a GitHub token, the repository and the commit",
  );
}

const hash = execFileSync("node", [`${zcore}source-hash.mjs`], {
  encoding: "utf8",
}).trim();
const name = `zcore-pkg-${hash}`;

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  // GitHub says 404, not 403, when the token can't see the repo.
  if (!res.ok)
    throw new Error(
      `GET ${repo}${path}: ${res.status} ${await res.text()}` +
        (res.status === 404 ? " (wrong repo, or the token can't read it)" : ""),
    );
  return res;
}

// Any branch can run its own workflow code and upload under main's hash, so
// production and main's deploy take only builds from pushes to main or production.
const trusted = (run) =>
  run.head_repository.full_name === repo &&
  (!strict ||
    (run.event === "push" && ["main", "production"].includes(run.head_branch)));

async function find() {
  const { artifacts } = await (
    await gh(`/actions/artifacts?name=${name}&per_page=100`)
  ).json();
  for (const artifact of artifacts) {
    if (artifact.expired) continue;
    const run = await (
      await gh(`/actions/runs/${artifact.workflow_run.id}`)
    ).json();
    if (trusted(run)) return { artifact, run };
  }
}

let found = await find();
for (const start = Date.now(); !found; found = await find()) {
  // A branch with no CI of its own (release-please's) needs main's build.
  const runs = await Promise.all(
    [`head_sha=${commit}`, "branch=main&event=push"].map(async (q) => {
      const res = await gh(`/actions/runs?${q}&per_page=100`);
      return (await res.json()).workflow_runs;
    }),
  );
  const building = runs
    .flat()
    .some(
      (r) => r.path === ".github/workflows/ci.yml" && r.status !== "completed",
    );
  const waited = Date.now() - start;
  // A fresh push's run can take a minute to show up.
  if (!building && waited > 2 * 60_000) {
    throw new Error(
      `no CI build of ${name} for ${commit}. CI builds a PR merged into main, so if main changed zcore since this branch, merge main into it; otherwise check ci.yml's run.`,
    );
  }
  if (waited > 20 * 60_000)
    throw new Error(`gave up waiting for ${name} after 20 minutes`);
  console.log(`zcore: waiting for CI to build ${name}…`);
  await new Promise((r) => setTimeout(r, 20_000));
}

const { artifact, run } = found;
const zip = Buffer.from(
  await (await gh(`/actions/artifacts/${artifact.id}/zip`)).arrayBuffer(),
);
const digest = `sha256:${createHash("sha256").update(zip).digest("hex")}`;
if (artifact.digest !== digest) {
  throw new Error(
    `${name}: download is ${digest}, GitHub says ${artifact.digest}`,
  );
}

const tmp = mkdtempSync(`${zcore}.fetch-`);
try {
  writeFileSync(`${tmp}/pkg.zip`, zip);
  execFileSync("unzip", ["-q", `${tmp}/pkg.zip`, "-d", `${tmp}/pkg`]);
  const built = readFileSync(`${tmp}/pkg/.source-hash`, "utf8").trim();
  if (built !== hash) throw new Error(`${name} holds a build of ${built}`);
  rmSync(`${zcore}pkg`, { recursive: true, force: true });
  renameSync(`${tmp}/pkg`, `${zcore}pkg`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(
  `zcore: ${name} from run ${run.html_url} (${run.event} on ${run.head_branch}), ${digest}`,
);
