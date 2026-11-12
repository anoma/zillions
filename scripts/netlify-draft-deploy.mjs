// Uploads a directory to a Netlify site as a draft deploy: it gets its own URL
// and the live site doesn't change. There's deliberately no production mode.
// Usage: NETLIFY_AUTH_TOKEN=… node scripts/netlify-draft-deploy.mjs <dir> <site>
// where <site> is the site's ID or its *.netlify.app domain.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";

const [dir, siteName] = process.argv.slice(2);
const token = process.env.NETLIFY_AUTH_TOKEN;
if (!dir || !siteName || !token) {
  console.error(
    "usage: NETLIFY_AUTH_TOKEN=… netlify-draft-deploy.mjs <dir> <site>",
  );
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!res.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`,
    );
  }
  return res.json();
}

// Netlify asks only for the files it doesn't already hold, by SHA-1.
const paths = {};
const files = {};
for (const f of readdirSync(dir, { recursive: true })) {
  if (!statSync(`${dir}/${f}`).isFile()) continue;
  const sha = createHash("sha1")
    .update(readFileSync(`${dir}/${f}`))
    .digest("hex");
  files[`/${f}`] = sha;
  paths[sha] ??= `/${f}`;
}

const site = await api(`/sites/${siteName}`);
const live = site.published_deploy?.id;

let deploy = await api(`/sites/${site.id}/deploys`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ files, draft: true }),
});
console.log(
  `deploy ${deploy.id}: uploading ${deploy.required.length} of ${Object.keys(files).length} files`,
);
for (const sha of deploy.required) {
  await api(`/deploys/${deploy.id}/files${encodeURI(paths[sha])}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: readFileSync(`${dir}${paths[sha]}`),
  });
}

for (let i = 0; deploy.state !== "ready"; i++) {
  if (deploy.state === "error" || i === 60) {
    throw new Error(
      `deploy ${deploy.id} ended ${deploy.state}: ${deploy.error_message ?? ""}`,
    );
  }
  await new Promise((r) => setTimeout(r, 5000));
  deploy = await api(`/deploys/${deploy.id}`);
}

const after = (await api(`/sites/${site.id}`)).published_deploy?.id;
if (after === deploy.id) throw new Error(`deploy ${deploy.id} went live`);
if (after !== live)
  console.warn(`the live deploy changed during this run (${live} → ${after})`);
console.log(deploy.deploy_ssl_url);
