#!/usr/bin/env node
/**
 * Post-build script: copies public/ and .next/static/ into the standalone directory.
 * Next.js standalone output omits these — they must be present for the server to
 * serve static assets and client-side JS/CSS.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const standalone = resolve(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("Error: .next/standalone/ does not exist. Run `npm run build` first.");
  process.exit(1);
}

// public/ → .next/standalone/public/
const publicSrc = resolve(root, "public");
const publicDest = resolve(standalone, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log("Copied public/ → .next/standalone/public/");
} else {
  console.log("No public/ directory found, skipping.");
}

// .next/static/ → .next/standalone/.next/static/
const staticSrc = resolve(root, ".next", "static");
const staticDest = resolve(standalone, ".next", "static");
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log("Copied .next/static/ → .next/standalone/.next/static/");
} else {
  console.error("Error: .next/static/ does not exist. Build may have failed.");
  process.exit(1);
}

// Remove packages that are unnecessary at runtime
const nodeModules = resolve(standalone, "node_modules");
const packagesToRemove = ["@img", "sharp", "detect-libc", "semver", "typescript"];

for (const pkg of packagesToRemove) {
  const pkgPath = resolve(nodeModules, pkg);
  if (existsSync(pkgPath)) {
    rmSync(pkgPath, { recursive: true, force: true });
    console.log(`Removed node_modules/${pkg}/`);
  }
}

console.log("Package preparation complete.");
