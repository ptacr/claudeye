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
  queueHistoryTtl: number | undefined;
  queueMaxSessions: number | undefined;
  authUsers: string[];
  remainingArgs: string[];
}

function parseStringFlag(
  flagName: string,
  errorLabel: string,
  inlineValue: string | null,
  args: string[],
  index: number,
  options?: { resolve?: boolean },
): { value: string; spliceCount: number } {
  const raw = inlineValue ?? args[index + 1];
  if (raw === undefined || (inlineValue === null && raw.startsWith("-"))) {
    console.error(`Error: ${flagName} requires ${errorLabel}`);
    process.exit(1);
  }
  const value = options?.resolve ? resolve(raw) : raw;
  return { value, spliceCount: inlineValue !== null ? 1 : 2 };
}

function parsePositiveIntFlag(
  flagName: string,
  inlineValue: string | null,
  args: string[],
  index: number,
): { value: number; spliceCount: number } {
  const raw = inlineValue ?? args[index + 1];
  if (raw === undefined || (inlineValue === null && raw.startsWith("-"))) {
    console.error(`Error: ${flagName} requires a positive integer`);
    process.exit(1);
  }
  if (!/^\d+$/.test(raw)) {
    console.error(`Error: ${flagName} must be a positive integer`);
    process.exit(1);
  }
  const parsed = parseInt(raw, 10);
  if (parsed <= 0) {
    console.error(`Error: ${flagName} must be a positive integer`);
    process.exit(1);
  }
  return { value: parsed, spliceCount: inlineValue !== null ? 1 : 2 };
}

function parseNonNegativeIntFlag(
  flagName: string,
  inlineValue: string | null,
  args: string[],
  index: number,
): { value: number; spliceCount: number } {
  const raw = inlineValue ?? args[index + 1];
  if (raw === undefined || (inlineValue === null && raw.startsWith("-"))) {
    console.error(`Error: ${flagName} requires a non-negative integer`);
    process.exit(1);
  }
  if (!/^\d+$/.test(raw)) {
    console.error(`Error: ${flagName} must be a non-negative integer`);
    process.exit(1);
  }
  return { value: parseInt(raw, 10), spliceCount: inlineValue !== null ? 1 : 2 };
}

export function parseScriptArgs(argv: string[]): ParsedScriptArgs {
  const args = [...argv];
  let claudeProjectsPath: string | undefined;
  let evalsPath: string | undefined;
  let cacheMode: string | undefined;
  let cachePath: string | undefined;
  let queueInterval: number | undefined;
  let queueConcurrency: number | undefined;
  let queueHistoryTtl: number | undefined;
  let queueMaxSessions: number | undefined;
  const authUsers: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Split on first '=' to support --flag=value format uniformly
    const eqIdx = arg.indexOf("=");
    const flag = eqIdx >= 0 ? arg.slice(0, eqIdx) : arg;
    const inlineValue = eqIdx >= 0 ? arg.slice(eqIdx + 1) : null;

    if (flag === "--projects-path" || flag === "-p") {
      const { value, spliceCount } = parseStringFlag(flag, "a path argument", inlineValue, args, i);
      claudeProjectsPath = value;
      args.splice(i, spliceCount);
      i--;
      continue;
    }

    if (flag === "--evals") {
      const { value, spliceCount } = parseStringFlag(flag, "a path argument", inlineValue, args, i, { resolve: true });
      evalsPath = value;
      args.splice(i, spliceCount);
      i--;
      continue;
    }

    if (flag === "--cache") {
      const { value, spliceCount } = parseStringFlag(flag, "a value (on|off)", inlineValue, args, i);
      cacheMode = value;
      args.splice(i, spliceCount);
      i--;
      continue;
    }

    if (flag === "--cache-path") {
      const { value, spliceCount } = parseStringFlag(flag, "a path argument", inlineValue, args, i, { resolve: true });
      cachePath = value;
      args.splice(i, spliceCount);
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
      const { value, spliceCount } = parsePositiveIntFlag(flag, inlineValue, args, i);
      queueInterval = value;
      args.splice(i, spliceCount);
      i--;
      continue;
    }

    if (flag === "--queue-concurrency") {
      const { value, spliceCount } = parsePositiveIntFlag(flag, inlineValue, args, i);
      queueConcurrency = value;
      args.splice(i, spliceCount);
      i--;
      continue;
    }

    if (flag === "--queue-history-ttl") {
      const { value, spliceCount } = parsePositiveIntFlag(flag, inlineValue, args, i);
      queueHistoryTtl = value;
      args.splice(i, spliceCount);
      i--;
      continue;
    }

    if (flag === "--queue-max-sessions") {
      const { value, spliceCount } = parseNonNegativeIntFlag(flag, inlineValue, args, i);
      queueMaxSessions = value;
      args.splice(i, spliceCount);
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

  return { claudeProjectsPath, evalsPath, cacheMode, cachePath, queueInterval, queueConcurrency, queueHistoryTtl, queueMaxSessions, authUsers, remainingArgs: args };
}
