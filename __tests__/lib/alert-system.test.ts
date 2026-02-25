// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerAlert,
  getRegisteredAlerts,
  hasAlerts,
  clearAlerts,
} from "@/lib/evals/alert-registry";
import { fireAlerts } from "@/lib/evals/alert-dispatcher";
import type { AlertContext } from "@/lib/evals/alert-types";

const REGISTRY_KEY = "__CLAUDEYE_ALERT_REGISTRY__";

function resetRegistry() {
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] = undefined;
}

const stubContext: AlertContext = {
  projectName: "proj",
  sessionId: "sess-1",
};

describe("alert-registry", () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe("registerAlert", () => {
    it("registers a new alert", () => {
      const fn = vi.fn();
      registerAlert("test-alert", fn);
      expect(getRegisteredAlerts()).toHaveLength(1);
      expect(getRegisteredAlerts()[0].name).toBe("test-alert");
      expect(getRegisteredAlerts()[0].fn).toBe(fn);
    });

    it("replaces alert with same name", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      registerAlert("test-alert", fn1);
      registerAlert("test-alert", fn2);

      expect(getRegisteredAlerts()).toHaveLength(1);
      expect(getRegisteredAlerts()[0].fn).toBe(fn2);
    });

    it("keeps alerts with different names separate", () => {
      registerAlert("alert-1", vi.fn());
      registerAlert("alert-2", vi.fn());
      expect(getRegisteredAlerts()).toHaveLength(2);
    });
  });

  describe("hasAlerts", () => {
    it("returns false when no alerts registered", () => {
      expect(hasAlerts()).toBe(false);
    });

    it("returns true when alerts exist", () => {
      registerAlert("test", vi.fn());
      expect(hasAlerts()).toBe(true);
    });
  });

  describe("clearAlerts", () => {
    it("removes all registered alerts", () => {
      registerAlert("alert-1", vi.fn());
      registerAlert("alert-2", vi.fn());
      expect(hasAlerts()).toBe(true);

      clearAlerts();
      expect(hasAlerts()).toBe(false);
      expect(getRegisteredAlerts()).toHaveLength(0);
    });
  });
});

describe("alert-dispatcher", () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe("fireAlerts", () => {
    it("does nothing when no alerts registered", async () => {
      // Should not throw
      await fireAlerts(stubContext);
    });

    it("calls all registered alert functions with context", async () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      registerAlert("alert-1", fn1);
      registerAlert("alert-2", fn2);

      await fireAlerts(stubContext);

      expect(fn1).toHaveBeenCalledOnce();
      expect(fn1).toHaveBeenCalledWith(stubContext);
      expect(fn2).toHaveBeenCalledOnce();
      expect(fn2).toHaveBeenCalledWith(stubContext);
    });

    it("isolates errors: one failing alert does not block others", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fn1 = vi.fn().mockRejectedValue(new Error("alert-1 failed"));
      const fn2 = vi.fn();
      registerAlert("failing-alert", fn1);
      registerAlert("passing-alert", fn2);

      await fireAlerts(stubContext);

      expect(fn1).toHaveBeenCalledOnce();
      expect(fn2).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("failing-alert"),
        "alert-1 failed",
      );
      consoleSpy.mockRestore();
    });

    it("handles sync throwing alerts", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fn = vi.fn().mockImplementation(() => {
        throw new Error("sync error");
      });
      registerAlert("sync-fail", fn);

      await fireAlerts(stubContext);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("passes full context including eval and enrich summaries", async () => {
      const fn = vi.fn();
      registerAlert("full-context", fn);

      const fullContext: AlertContext = {
        projectName: "proj",
        sessionId: "sess-1",
        evalSummary: {
          results: [],
          totalDurationMs: 100,
          passCount: 1,
          failCount: 0,
          errorCount: 0,
          skippedCount: 0,
        },
        enrichSummary: {
          results: [],
          totalDurationMs: 50,
          errorCount: 0,
          skippedCount: 0,
        },
      };

      await fireAlerts(fullContext);

      expect(fn).toHaveBeenCalledWith(fullContext);
    });
  });
});
