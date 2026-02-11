/**
 * Loads the user's eval module into the globalThis-backed registry.
 * Called from server actions when CLAUDEYE_EVALS_MODULE env var is set.
 *
 * Handles two problems:
 * 1. ESM/CJS: .js files with `import` syntax fail if package.json lacks "type":"module".
 *    Fix: writes a temp .mjs copy (Node.js always treats .mjs as ESM).
 * 2. Module resolution: `from 'claudeye'` won't resolve when running in-repo.
 *    Fix: rewrites the specifier to the absolute dist/index.js path.
 *
 * Sets __CLAUDEYE_LOADING_EVALS__=true before import so app.listen() is a no-op.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL } from "url";

const LOADING_KEY = "__CLAUDEYE_LOADING_EVALS__";

interface GlobalWithLoading {
  [LOADING_KEY]?: boolean;
}

let loaded = false;

function findDistIndex(): string | null {
  // Env var set by scripts/dev.ts, scripts/start.ts, bin/claudeye.mjs
  const distPath = process.env.CLAUDEYE_DIST_PATH;
  if (distPath) {
    const candidate = resolve(distPath, "index.js");
    if (existsSync(candidate)) return candidate;
  }

  // Fallback: check common locations
  const candidates = [
    resolve(process.cwd(), "dist", "index.js"),
    resolve(process.cwd(), "node_modules", "claudeye", "dist", "index.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export async function ensureEvalsLoaded(): Promise<void> {
  if (loaded) return;

  const evalsModule = process.env.CLAUDEYE_EVALS_MODULE;
  if (!evalsModule) {
    loaded = true;
    return;
  }

  const g = globalThis as GlobalWithLoading;
  g[LOADING_KEY] = true;

  let tmpPath: string | null = null;
  try {
    let code = readFileSync(evalsModule, "utf-8");

    // Rewrite 'claudeye' imports to the resolved dist path
    const distIndex = findDistIndex();
    if (distIndex) {
      const distUrl = pathToFileURL(distIndex).href;
      // ESM: import { createApp } from 'claudeye'  or  from "claudeye"
      code = code.replace(
        /from\s+(['"])claudeye\1/g,
        `from '${distUrl}'`,
      );
      // CJS: require('claudeye')  or  require("claudeye")
      code = code.replace(
        /require\s*\(\s*(['"])claudeye\1\s*\)/g,
        `require('${distIndex.replace(/\\/g, "\\\\")}')`
      );
    }

    // Write temp .mjs file next to the original (preserves relative imports)
    tmpPath = evalsModule + ".__claudeye_tmp__.mjs";
    writeFileSync(tmpPath, code, "utf-8");

    const fileUrl = pathToFileURL(tmpPath).href;
    await import(/* webpackIgnore: true */ fileUrl);
  } finally {
    g[LOADING_KEY] = false;
    if (tmpPath) {
      try { unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }
    }
  }
  loaded = true;
}
