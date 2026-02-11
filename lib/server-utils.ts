/**
 * Re-exports shared server utilities from the evals server-spawn module.
 * This gives the Next.js app a clean import path (`@/lib/server-utils`)
 * while the canonical implementations live in `lib/evals/server-spawn.ts`
 * (which must be self-contained for the standalone evals dist build).
 */
export { findAvailablePort, openBrowser, waitForServer } from "@/lib/evals/server-spawn";
