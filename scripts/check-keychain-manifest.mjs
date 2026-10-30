#!/usr/bin/env node
// Reads the manifests `pnpm keychain:build` wrote and fails if the extension
// could run on, or be seen by, any site but the Zillions app. Guards the
// "read and change your data on all websites" permission from coming back.
import { readFileSync } from "node:fs";

import { PRODUCTION_ORIGINS } from "../apps/keychain/src/origins.ts";

const expected = PRODUCTION_ORIGINS.map((origin) => `${origin}/*`).sort();
const sameSites = (matches) =>
  JSON.stringify([...(matches ?? [])].sort()) === JSON.stringify(expected);

const failures = [];
for (const browser of ["chrome-mv3", "firefox-mv3"]) {
  const file = `apps/keychain/.output/${browser}/manifest.json`;
  const text = readFileSync(file, "utf8");
  const manifest = JSON.parse(text);
  const fail = (what) => failures.push(`${file}: ${what}`);

  for (const script of manifest.content_scripts ?? []) {
    if (!sameSites(script.matches)) fail(`content script runs on ${JSON.stringify(script.matches)}`);
  }
  for (const resource of manifest.web_accessible_resources ?? []) {
    if (!sameSites(resource.matches)) fail(`${resource.resources} visible to ${JSON.stringify(resource.matches)}`);
  }
  for (const key of ["host_permissions", "optional_host_permissions"]) {
    const hosts = manifest[key];
    if (hosts && !sameSites(hosts)) fail(`${key} is ${JSON.stringify(hosts)}`);
  }
  const permissions = manifest.permissions ?? [];
  const allowed = new Set(["storage", "tabs", "idle"]);
  for (const permission of permissions) {
    if (!allowed.has(permission)) fail(`permission "${permission}" is new; review it`);
  }
  for (const wide of ["<all_urls>", "*://*/*", "http://*/*", "https://*/*", "file://"]) {
    if (text.includes(wide)) fail(`contains "${wide}"`);
  }
}

if (failures.length) {
  console.error("Keychain manifest reaches too far:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log(`Keychain manifests confined to ${expected.join(", ")}.`);
