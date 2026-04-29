import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateConfig = join(rootDir, "config", "dev-ui.yml");
const tempConfig = join(tmpdir(), "mqb-dev-ui-config.yml");

mkdirSync(dirname(tempConfig), { recursive: true });
if (!existsSync(tempConfig)) {
  copyFileSync(templateConfig, tempConfig);
}

const watchPaths = [
  "Cargo.toml",
  "Cargo.lock",
  "config/dev-ui.yml",
  "crates/**/*.rs",
  "crates/**/*.toml",
];

const cargoArgs = ["run", "--", "--config", tempConfig, "--init-config", templateConfig];

let child = null;
let restartTimer = null;
let stopping = false;
let pendingRestartReason = null;

function parseUiAddress(configContent) {
  const match = configContent.match(/^\s*ui_addr:\s*["']?([^"'#\n]+)["']?\s*$/m);
  if (!match) return null;

  const raw = match[1].trim();
  if (!raw) return null;

  const lastColon = raw.lastIndexOf(":");
  if (lastColon === -1) return null;

  const host = raw.slice(0, lastColon) || "127.0.0.1";
  const port = Number(raw.slice(lastColon + 1));
  if (!Number.isInteger(port) || port <= 0) return null;

  return {
    host: host === "0.0.0.0" ? "127.0.0.1" : host,
    port,
    raw,
  };
}

function isPortInUse(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function startBackend() {
  const uiAddress = parseUiAddress(readFileSync(tempConfig, "utf8"));
  if (uiAddress && (await isPortInUse(uiAddress.host, uiAddress.port))) {
    console.log(
      `[backend] cannot start because ${uiAddress.raw} is already in use. ` +
        `Stop the other mq-bridge process or change ui_addr in ${tempConfig}.`,
    );
    return;
  }

  console.log(`[backend] starting cargo ${cargoArgs.join(" ")}`);
  child = spawn("cargo", cargoArgs, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) {
      return;
    }

    if (pendingRestartReason) {
      const reason = pendingRestartReason;
      pendingRestartReason = null;
      console.log(`[backend] restarted after ${reason}`);
      void startBackend();
      return;
    }

    if (code !== 0) {
      console.log(`[backend] cargo exited with code ${code ?? "null"} signal ${signal ?? "none"}`);
    }
  });
}

function requestRestart(reason) {
  pendingRestartReason = reason;
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!child) {
      const queuedReason = pendingRestartReason;
      pendingRestartReason = null;
      console.log(`[backend] starting after ${queuedReason}`);
      void startBackend();
      return;
    }

    console.log(`[backend] change detected in ${reason}, restarting...`);
    const activeChild = child;
    activeChild.once("exit", () => {
      if (!stopping && pendingRestartReason) {
        const queuedReason = pendingRestartReason;
        pendingRestartReason = null;
        console.log(`[backend] restart complete after ${queuedReason}`);
        void startBackend();
      }
    });
    activeChild.kill("SIGTERM");
    setTimeout(() => {
      if (child === activeChild) {
        activeChild.kill("SIGKILL");
      }
    }, 3000);
  }, 150);
}

const watcher = chokidar.watch(watchPaths, {
  cwd: rootDir,
  ignoreInitial: true,
  usePolling: true,
  interval: 400,
  ignored: ["**/target/**", "**/node_modules/**", "**/.git/**"],
});

watcher.on("add", requestRestart);
watcher.on("change", requestRestart);
watcher.on("unlink", requestRestart);

function shutdown() {
  stopping = true;
  watcher.close().catch(() => {});
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (child) {
    child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

void startBackend();
