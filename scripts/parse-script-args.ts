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
  remainingArgs: string[];
}

export function parseScriptArgs(argv: string[]): ParsedScriptArgs {
  const args = [...argv];
  let claudeProjectsPath: string | undefined;
  let evalsPath: string | undefined;
  let cacheMode: string | undefined;
  let cachePath: string | undefined;

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
  }

  return { claudeProjectsPath, evalsPath, cacheMode, cachePath, remainingArgs: args };
}
