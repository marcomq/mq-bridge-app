import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = resolve(rootDir, "static");

function runJsVendor() {
  mkdirSync(staticDir, { recursive: true });
  cpSync(
    resolve(rootDir, "node_modules/vanilla-schema-forms/dist/vanilla-schema-forms.umd.js"),
    resolve(staticDir, "vanilla-schema-forms.js"),
  );
}

async function runWebAwesomeVendor() {
  const { build } = await import("esbuild");
  const webAwesomeDir = resolve(staticDir, "vendor/webawesome");
  rmSync(webAwesomeDir, { recursive: true, force: true });
  mkdirSync(webAwesomeDir, { recursive: true });

  await build({
    entryPoints: [resolve(staticDir, "webawesome-init.js")],
    bundle: true,
    format: "esm",
    minify: true,
    outfile: resolve(webAwesomeDir, "webawesome.bundle.js"),
  });

  await build({
    entryPoints: [resolve(rootDir, "node_modules/@awesome.me/webawesome/dist/styles/webawesome.css")],
    bundle: true,
    minify: true,
    outfile: resolve(webAwesomeDir, "webawesome.bundle.css"),
  });
}

function runSplitVendor() {
  const splitDir = resolve(staticDir, "vendor/split");
  mkdirSync(splitDir, { recursive: true });
  cpSync(
    resolve(rootDir, "node_modules/split.js/dist/split.min.js"),
    resolve(splitDir, "split.min.js"),
  );
}

async function main() {
  const target = process.argv[2] || "all";
  mkdirSync(staticDir, { recursive: true });

  if (target === "js" || target === "all") {
    runJsVendor();
  }
  if (target === "webawesome" || target === "all") {
    await runWebAwesomeVendor();
  }
  if (target === "split" || target === "all") {
    runSplitVendor();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
