/**
 * Shared CLI argument parser for scripts/dev.ts and scripts/start.ts.
 * Handles --projects-path / -p, --evals, and --cache flags, returning parsed
 * values and any remaining arguments to forward to Next.js.
 */
import { resolve } from "path";

export interface ParsedScriptArgs {
  claudeProjectsPath: string | undefined;
  evalsPath: string | undefined;
  cacheMode: string | undefined;
  cachePath: string | undefined;
  queueInterval: number | undefined;
  queueConcurrency: number | undefined;
  authUsers: string[];
  remainingArgs: string[];
}

export function parseScriptArgs(argv: string[]): ParsedScriptArgs {
  const args = [...argv];
  let claudeProjectsPath: string | undefined;
  let evalsPath: string | undefined;
  let cacheMode: string | undefined;
  let cachePath: string | undefined;
  let queueInterval: number | undefined;
  let queueConcurrency: number | undefined;
  const authUsers: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Split on first '=' to support --flag=value format uniformly
    const eqIdx = arg.indexOf("=");
    const flag = eqIdx >= 0 ? arg.slice(0, eqIdx) : arg;
    const inlineValue = eqIdx >= 0 ? arg.slice(eqIdx + 1) : null;

    if (flag === "--projects-path" || flag === "-p") {
      const value = inlineValue ?? args[i + 1];
      if (value === undefined || (inlineValue === null && value.startsWith("-"))) {
        console.error("Error: --projects-path requires a path argument");
        process.exit(1);
      }
      claudeProjectsPath = value;
      args.splice(i, inlineValue !== null ? 1 : 2);
      i--;
      continue;
    }

    if (flag === "--evals") {
      const value = inlineValue ?? args[i + 1];
      if (value === undefined || (inlineValue === null && value.startsWith("-"))) {
        console.error("Error: --evals requires a path argument");
        process.exit(1);
      }
      evalsPath = resolve(value);
      args.splice(i, inlineValue !== null ? 1 : 2);
      i--;
      continue;
    }

    if (flag === "--cache") {
      const value = inlineValue ?? args[i + 1];
      if (value === undefined || (inlineValue === null && value.startsWith("-"))) {
        console.error("Error: --cache requires a value (on|off)");
        process.exit(1);
      }
      cacheMode = value;
      args.splice(i, inlineValue !== null ? 1 : 2);
      i--;
      continue;
    }

    if (flag === "--cache-path") {
      const value = inlineValue ?? args[i + 1];
      if (value === undefined || (inlineValue === null && value.startsWith("-"))) {
        console.error("Error: --cache-path requires a path argument");
        process.exit(1);
      }
      cachePath = resolve(value);
      args.splice(i, inlineValue !== null ? 1 : 2);
      i--;
      continue;
    }

    if (flag === "--auth-user") {
      const value = inlineValue ?? args[i + 1];
      if (value === undefined || (inlineValue === null && value.startsWith("-"))) {
        console.error("Error: --auth-user requires a username:password argument");
        process.exit(1);
      }
      if (!value.includes(":")) {
        console.error("Error: --auth-user must be in username:password format");
        process.exit(1);
      }
      authUsers.push(value);
      args.splice(i, inlineValue !== null ? 1 : 2);
      i--;
      continue;
    }

    if (flag === "--queue-interval") {
      const value = inlineValue ?? args[i + 1];
      if (value === undefined || (inlineValue === null && value.startsWith("-"))) {
        console.error("Error: --queue-interval requires a positive integer (seconds)");
        process.exit(1);
      }
      if (!/^\d+$/.test(value)) {
        console.error("Error: --queue-interval must be a positive integer");
        process.exit(1);
      }
      const parsed = parseInt(value, 10);
      if (parsed <= 0) {
        console.error("Error: --queue-interval must be a positive integer");
        process.exit(1);
      }
      queueInterval = parsed;
      args.splice(i, inlineValue !== null ? 1 : 2);
      i--;
      continue;
    }

    if (flag === "--queue-concurrency") {
      const value = inlineValue ?? args[i + 1];
      if (value === undefined || (inlineValue === null && value.startsWith("-"))) {
        console.error("Error: --queue-concurrency requires a positive integer");
        process.exit(1);
      }
      if (!/^\d+$/.test(value)) {
        console.error("Error: --queue-concurrency must be a positive integer");
        process.exit(1);
      }
      const parsed = parseInt(value, 10);
      if (parsed <= 0) {
        console.error("Error: --queue-concurrency must be a positive integer");
        process.exit(1);
      }
      queueConcurrency = parsed;
      args.splice(i, inlineValue !== null ? 1 : 2);
      i--;
      continue;
    }
  }

  // Sanitize process.argv to mask passwords (prevents secondary leakage via
  // process.argv inspection; npm's command echo cannot be fixed from here).
  for (let j = 0; j < process.argv.length; j++) {
    const raw = process.argv[j];
    if (raw === "--auth-user" && process.argv[j + 1]) {
      const colon = process.argv[j + 1].indexOf(":");
      if (colon >= 0) {
        process.argv[j + 1] = process.argv[j + 1].slice(0, colon + 1) + "***";
      }
    } else if (raw.startsWith("--auth-user=")) {
      const valStart = "--auth-user=".length;
      const colon = raw.indexOf(":", valStart);
      if (colon >= 0) {
        process.argv[j] = raw.slice(0, colon + 1) + "***";
      }
    }
  }

  return { claudeProjectsPath, evalsPath, cacheMode, cachePath, queueInterval, queueConcurrency, authUsers, remainingArgs: args };
}
