#!/usr/bin/env node

// Propagates `[workspace.package] version` from Cargo.toml into the files that
// cannot inherit it: server.json (scanned by MCP registry bots, so it must be
// correct in the repo, not just at release time) and the internal path-dependency
// requirement in Cargo.toml. Run with --check to fail instead of writing.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkOnly = process.argv.includes("--check");
const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cargoPath = resolve(repoRoot, "Cargo.toml");
const serverPath = resolve(repoRoot, "server.json");

const cargo = readFileSync(cargoPath, "utf8");
const version = cargo
  .split(/^\[/m)
  .find((section) => section.startsWith("workspace.package]"))
  ?.match(/^version = "([^"]+)"/m)?.[1];

if (!version) {
  console.error("Could not read [workspace.package] version from Cargo.toml");
  process.exit(1);
}

const drift = [];

function update(path, current, next) {
  if (current === next) return;
  drift.push(path);
  if (!checkOnly) writeFileSync(path, next);
}

const patchedCargo = cargo.replace(
  /^(mq_bridge_app = \{ version = ")[^"]+(")/m,
  `$1${version}$2`,
);
update(cargoPath, cargo, patchedCargo);

// Patched as text rather than re-serialised, so the hand-written formatting
// survives. Every "version" in server.json is the app version, and the only
// tagged identifier is the oci image.
const serverRaw = readFileSync(serverPath, "utf8");
const patchedServer = serverRaw
  .replace(/"version": "[^"]+"/g, `"version": "${version}"`)
  .replace(/("identifier": "[^"]*):[^":]*"/g, `$1:${version}"`);
update(serverPath, serverRaw, patchedServer);

if (drift.length === 0) {
  console.log(`Version ${version} is in sync.`);
} else if (checkOnly) {
  const files = drift.map((path) => `  ${path}`).join("\n");
  console.error(`Out of sync with version ${version}:\n${files}\nRun: npm run sync:version`);
  process.exit(1);
} else {
  console.log(`Synced to version ${version}:\n${drift.map((p) => `  ${p}`).join("\n")}`);
}
