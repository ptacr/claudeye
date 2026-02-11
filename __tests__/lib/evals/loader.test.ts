// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const LOADING_KEY = "__CLAUDEYE_LOADING_EVALS__";

// We need to reset the module-level `loaded` flag between tests,
// so we use dynamic imports with vi.resetModules().
describe("evals/loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>)[LOADING_KEY];
    delete process.env.CLAUDEYE_EVALS_MODULE;
    delete process.env.CLAUDEYE_DIST_PATH;
  });

  it("no-op when CLAUDEYE_EVALS_MODULE is not set", async () => {
    const { ensureEvalsLoaded } = await import("@/lib/evals/loader");
    await ensureEvalsLoaded();
    // Should complete without error and not touch the loading flag
    expect((globalThis as Record<string, unknown>)[LOADING_KEY]).toBeUndefined();
  });

  it("is idempotent — second call is a no-op", async () => {
    const { ensureEvalsLoaded } = await import("@/lib/evals/loader");
    await ensureEvalsLoaded();
    await ensureEvalsLoaded(); // Should not throw
  });

  it("sets and clears the loading flag when env var is set", async () => {
    // Mock fs so readFileSync returns a no-op file and writeFileSync/unlinkSync are stubs
    vi.mock("fs", async (importOriginal) => {
      const orig = await importOriginal<typeof import("fs")>();
      return {
        ...orig,
        readFileSync: (path: string, encoding?: string) => {
          if (typeof path === "string" && path.includes("test-eval")) {
            return "// no-op eval file";
          }
          return orig.readFileSync(path, encoding as BufferEncoding);
        },
        writeFileSync: () => {},
        unlinkSync: () => {},
        existsSync: (path: string) => {
          if (typeof path === "string" && path.includes("dist")) return false;
          return orig.existsSync(path);
        },
      };
    });

    process.env.CLAUDEYE_EVALS_MODULE = "/tmp/test-eval.js";

    const { ensureEvalsLoaded } = await import("@/lib/evals/loader");

    // The dynamic import will fail (temp file doesn't really exist), but we can
    // verify the loading flag behavior via the finally block
    try {
      await ensureEvalsLoaded();
    } catch {
      // Expected: dynamic import of temp file will fail in test env
    }

    // After completion (or error), loading flag should be cleared
    expect((globalThis as Record<string, unknown>)[LOADING_KEY]).toBe(false);
  });
});
