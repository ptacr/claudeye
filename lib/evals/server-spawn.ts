/**
 * Server spawning logic for app.listen().
 * Dynamically imported only when listen() actually needs to start a server.
 * Reuses the same patterns as bin/claudeye.mjs: port detection, browser open, signal forwarding.
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { platform, networkInterfaces } from "node:os";

interface SpawnOptions {
  open?: boolean;
  host?: string;
}

function getNetworkAddress(): string {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const iface of addrs!) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "0.0.0.0";
}

function resolveBindAddress(host: string): string {
  return host === "localhost" ? "127.0.0.1" : host;
}

export function findAvailablePort(preferred: number, host = "localhost"): Promise<number> {
  const bindAddr = resolveBindAddress(host);
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(preferred, bindAddr, () => {
      srv.close(() => resolve(preferred));
    });
    srv.on("error", () => {
      const fallback = createServer();
      fallback.listen(0, bindAddr, () => {
        const addr = fallback.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        fallback.close(() => resolve(port));
      });
      fallback.on("error", reject);
    });
  });
}

export function openBrowser(url: string): void {
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

export async function waitForServer(url: string, timeoutMs = 15_000, intervalMs = 150): Promise<void> {
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

/**
 * Resolves the path to the Next.js server script.
 * In development: uses `npx next dev`
 * When published: uses `.next/standalone/server.js`
 */
function resolveServerInfo(): { mode: "standalone"; script: string; cwd: string } | { mode: "dev" } {
  // Try standalone first (published package)
  // Walk up from this file's location to find the package root
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const standaloneServer = resolve(dir, ".next", "standalone", "server.js");
    if (existsSync(standaloneServer)) {
      return { mode: "standalone", script: standaloneServer, cwd: resolve(dir, ".next", "standalone") };
    }
    dir = dirname(dir);
  }

  // Fallback to dev mode
  return { mode: "dev" };
}

function printBanner(): void {
  console.log(`
  ____ _                 _
 / ___| | __ _ _   _  __| | ___ _   _  ___
| |   | |/ _\` | | | |/ _\` |/ _ \\ | | |/ _ \\
| |___| | (_| | |_| | (_| |  __/ |_| |  __/
 \\____|_|\\__,_|\\__,_|\\__,_|\\___|\\__, |\\___|
                                |___/
`);
}

function logServerInfo(host: string, port: number, localUrl: string, evalsModule?: string): void {
  printBanner();
  console.log(`Starting Claudeye dashboard...`);
  if (evalsModule) {
    console.log(`  Evals:    ${evalsModule}`);
  }
  if (host === "0.0.0.0") {
    console.log(`  Local:    ${localUrl}`);
    console.log(`  Network:  http://${getNetworkAddress()}:${port}`);
  } else {
    console.log(`  URL:      http://${host}:${port}`);
  }
  console.log();
}

function spawnChildProcess(serverInfo: ReturnType<typeof resolveServerInfo>, env: NodeJS.ProcessEnv, port: number): ReturnType<typeof spawn> {
  if (serverInfo.mode === "standalone") {
    return spawn(process.execPath, [serverInfo.script], {
      cwd: serverInfo.cwd,
      stdio: "inherit",
      env,
    });
  }
  return spawn("npx", ["next", "dev", "--port", String(port)], {
    stdio: "inherit",
    shell: true,
    env,
  });
}

export async function spawnServer(preferredPort: number, options: SpawnOptions): Promise<void> {
  const host = options.host ?? "localhost";
  const port = await findAvailablePort(preferredPort, host);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead.`);
  }

  const localUrl = `http://localhost:${port}`;
  const evalsModule = process.argv[1] ? resolve(process.argv[1]) : undefined;
  logServerInfo(host, port, localUrl, evalsModule);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: host,
  };
  if (evalsModule) {
    env.CLAUDEYE_EVALS_MODULE = evalsModule;
  }

  const child = spawnChildProcess(resolveServerInfo(), env, port);

  if (options.open) {
    waitForServer(localUrl).then(() => openBrowser(localUrl)).catch(() => {
      console.warn(`\nServer did not respond within 15 s.\nOpen manually: ${localUrl}\n`);
    });
  }

  // Forward signals for clean shutdown
  const shutdown = (signal: NodeJS.Signals): void => {
    child.kill(signal);
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Block until the child exits — server runs until killed
  await new Promise<never>(() => {
    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });
}
