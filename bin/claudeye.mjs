#!/usr/bin/env node
/**
 * claudeye — CLI entry point for the Claudeye dashboard.
 * Zero external dependencies; uses only Node.js built-ins.
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, rmSync } from "node:fs";
import { homedir, platform, networkInterfaces } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, "..");
const standaloneDir = resolve(packageRoot, ".next", "standalone");
const serverScript = resolve(standaloneDir, "server.js");

// ── Help ────────────────────────────────────────────────────────────────────
const HELP = `
claudeye — Visualize your Claude Code agent logs in a local dashboard

Usage:
  claudeye [options]

Options:
  --projects-path, -p <path>  Path to Claude projects directory
                              (default: ~/.claude/projects)
  --port <number>             Preferred port (default: 8020)
  --host <address>            Host to bind to (default: localhost)
                              Use 0.0.0.0 for LAN access
  --evals <path>              Path to evals/enrichments file (JS/TS module)
  --cache <on|off>            Enable/disable caching (default: on)
  --cache-path <path>         Custom cache directory
                              (default: ~/.claudeye/cache)
  --cache-clear               Clear all cached results and exit
  --no-open                   Don't auto-open the browser
  -h, --help                  Show this help message
`.trim();

// ── Argument parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let projectsPath = resolve(homedir(), ".claude", "projects");
let preferredPort = 8020;
let preferredHost = "localhost";
let autoOpen = true;
let evalsPath = "";
let cacheMode = "on";
let cachePath = "";
let cacheClear = false;

/** Read the next value for a flag, supporting both `--flag value` and `--flag=value`. */
function readFlagValue(flag, idx) {
  // --flag=value already handled by the caller splitting on '='
  const next = args[idx + 1];
  if (next === undefined || next.startsWith("-")) {
    console.error(`Error: ${flag} requires a value\n`);
    console.log(HELP);
    process.exit(1);
  }
  return next;
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  // Support --flag=value format: split once on '='
  const eqIdx = arg.indexOf("=");
  const flag = eqIdx >= 0 ? arg.slice(0, eqIdx) : arg;
  const inlineValue = eqIdx >= 0 ? arg.slice(eqIdx + 1) : null;

  switch (flag) {
    case "-h":
    case "--help":
      console.log(HELP);
      process.exit(0);
      break;
    case "--projects-path":
    case "-p":
      projectsPath = resolve(inlineValue ?? readFlagValue(flag, i));
      if (inlineValue === null) i++;
      break;
    case "--port":
      preferredPort = parseInt(inlineValue ?? readFlagValue(flag, i), 10) || 8020;
      if (inlineValue === null) i++;
      break;
    case "--host":
      preferredHost = inlineValue ?? readFlagValue(flag, i);
      if (inlineValue === null) i++;
      break;
    case "--evals":
      evalsPath = resolve(inlineValue ?? readFlagValue(flag, i));
      if (inlineValue === null) i++;
      break;
    case "--cache":
      cacheMode = inlineValue ?? readFlagValue(flag, i);
      if (inlineValue === null) i++;
      if (cacheMode !== "on" && cacheMode !== "off") {
        console.error(`Error: --cache must be "on" or "off"\n`);
        console.log(HELP);
        process.exit(1);
      }
      break;
    case "--cache-path":
      cachePath = resolve(inlineValue ?? readFlagValue(flag, i));
      if (inlineValue === null) i++;
      break;
    case "--cache-clear":
      cacheClear = true;
      break;
    case "--no-open":
      autoOpen = false;
      break;
    default:
      console.error(`Unknown option: ${args[i]}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

// ── Cache clear (standalone action) ──────────────────────────────────────────
if (cacheClear) {
  const clearPath = cachePath || resolve(homedir(), ".claudeye", "cache");
  try {
    rmSync(clearPath, { recursive: true, force: true });
    console.log(`Cache cleared: ${clearPath}`);
  } catch (err) {
    console.error(`Failed to clear cache: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// ── Validate ────────────────────────────────────────────────────────────────
if (!existsSync(serverScript)) {
  console.error(
    `Error: standalone server not found at ${serverScript}\n` +
    "The package may not have been built correctly."
  );
  process.exit(1);
}

if (!existsSync(projectsPath)) {
  console.warn(
    `Warning: projects path does not exist: ${projectsPath}\n` +
    "The dashboard may show no data. Use --projects-path to specify a different location.\n"
  );
}

// ── Network address detection ────────────────────────────────────────────────
function getNetworkAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const iface of addrs) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "0.0.0.0";
}

// ── Port selection ──────────────────────────────────────────────────────────
function resolveBindAddress(host) {
  return host === "localhost" ? "127.0.0.1" : host;
}

function findAvailablePort(preferred, host) {
  const bindAddr = resolveBindAddress(host);
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(preferred, bindAddr, () => {
      srv.close(() => resolve(preferred));
    });
    srv.on("error", () => {
      const fallback = createServer();
      fallback.listen(0, bindAddr, () => {
        const port = fallback.address().port;
        fallback.close(() => resolve(port));
      });
      fallback.on("error", reject);
    });
  });
}

// ── Browser open (platform-aware) ───────────────────────────────────────────
function openBrowser(url) {
  const plat = platform();
  try {
    if (plat === "darwin") {
      execSync(`open "${url}"`, { stdio: "ignore" });
    } else if (plat === "win32") {
      execSync(`cmd /c start "" "${url}"`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: "ignore" });
    }
  } catch {
    // Silently fail — user can open manually
  }
}

// ── Server readiness polling ─────────────────────────────────────────────────
async function waitForServer(url, timeoutMs = 15_000, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error("Server readiness timeout");
}

// ── Startup logging ─────────────────────────────────────────────────────────
function printBanner() {
  console.log(`
  ____ _                 _
 / ___| | __ _ _   _  __| | ___ _   _  ___
| |   | |/ _\` | | | |/ _\` |/ _ \\ | | |/ _ \\
| |___| | (_| | |_| | (_| |  __/ |_| |  __/
 \\____|_|\\__,_|\\__,_|\\__,_|\\___|\\__, |\\___|
                                |___/
`);
}

function logServerInfo(port, localUrl) {
  printBanner();
  console.log(`Starting Claudeye dashboard...`);
  console.log(`  Projects: ${projectsPath}`);
  if (evalsPath) console.log(`  Evals:    ${evalsPath}`);
  if (cacheMode === "off") {
    console.log(`  Cache:    disabled`);
  } else {
    const displayPath = cachePath || resolve(homedir(), ".claudeye", "cache");
    console.log(`  Cache:    local (${displayPath})`);
  }
  if (preferredHost === "0.0.0.0") {
    console.log(`  Local:    ${localUrl}`);
    console.log(`  Network:  http://${getNetworkAddress()}:${port}`);
  } else {
    console.log(`  URL:      http://${preferredHost}:${port}`);
  }
  console.log();
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const port = await findAvailablePort(preferredPort, preferredHost);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead.`);
  }

  const localUrl = `http://localhost:${port}`;
  logServerInfo(port, localUrl);

  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: preferredHost,
    CLAUDE_PROJECTS_PATH: projectsPath,
  };
  if (evalsPath) {
    env.CLAUDEYE_EVALS_MODULE = evalsPath;
    env.CLAUDEYE_DIST_PATH = resolve(packageRoot, "dist");
  }
  if (cacheMode === "off") {
    env.CLAUDEYE_CACHE = "off";
  }
  if (cachePath) {
    env.CLAUDEYE_CACHE_PATH = cachePath;
  }

  const child = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    stdio: "inherit",
    env,
  });

  if (autoOpen) {
    waitForServer(localUrl).then(() => openBrowser(localUrl)).catch(() => {
      console.warn(`\nServer did not respond within 15 s.\nOpen manually: ${localUrl}\n`);
    });
  }

  // Forward signals for clean shutdown
  const shutdown = (signal) => {
    child.kill(signal);
    // Force exit if child doesn't terminate within 2 s
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("Failed to start Claudeye:", err.message);
  process.exit(1);
});
