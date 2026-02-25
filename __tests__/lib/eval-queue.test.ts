// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  queuePerItem,
  getQueueStatus,
  Priority,
  HIGH,
  LOW,
  priorityLabel,
} from "@/lib/eval-queue";

const QUEUE_KEY = "__CLAUDEYE_QUEUE__";

function resetQueueState() {
  (globalThis as Record<string, unknown>)[QUEUE_KEY] = undefined;
}

describe("eval-queue (unified)", () => {
  beforeEach(() => {
    resetQueueState();
  });

  describe("Priority constants", () => {
    it("exports HIGH and LOW with correct values", () => {
      expect(HIGH).toBe(0);
      expect(LOW).toBe(10);
      expect(Priority.HIGH).toBe(HIGH);
      expect(Priority.LOW).toBe(LOW);
    });

    it("priorityLabel returns correct labels", () => {
      expect(priorityLabel(0)).toBe("HIGH");
      expect(priorityLabel(10)).toBe("LOW");
      expect(priorityLabel(5)).toBe("LOW");
      expect(priorityLabel(-1)).toBe("HIGH");
    });
  });

  describe("getQueueStatus", () => {
    it("returns empty status on fresh state", () => {
      const status = getQueueStatus();
      expect(status.pending).toEqual([]);
      expect(status.processing).toEqual([]);
      expect(status.completed).toEqual([]);
      expect(status.backgroundRunning).toBe(false);
      expect(status.recentErrors).toEqual([]);
    });
  });

  describe("queuePerItem", () => {
    it("runs task immediately when under concurrency limit", async () => {
      let ran = false;
      const result = await queuePerItem("eval", "proj", "sess", "my-eval", async () => {
        ran = true;
        return { ok: true, result: "test" };
      });
      expect(ran).toBe(true);
      expect(result).toEqual({ ok: true, result: "test" });
    });

    it("tracks completed items after task finishes", async () => {
      await queuePerItem("eval", "proj", "sess", "my-eval", async () => ({ ok: true }));
      const status = getQueueStatus();
      expect(status.completed).toHaveLength(1);
      expect(status.completed[0].type).toBe("eval");
      expect(status.completed[0].projectName).toBe("proj");
      expect(status.completed[0].sessionId).toBe("sess");
      expect(status.completed[0].itemName).toBe("my-eval");
      expect(status.completed[0].success).toBe(true);
    });

    it("tracks failed items with error message", async () => {
      try {
        await queuePerItem("eval", "proj", "sess", "bad-eval", async () => {
          throw new Error("eval failed");
        });
      } catch {
        // expected
      }
      const status = getQueueStatus();
      expect(status.completed).toHaveLength(1);
      expect(status.completed[0].success).toBe(false);
      expect(status.completed[0].error).toBe("eval failed");
      expect(status.recentErrors).toHaveLength(1);
    });

    it("coalesces duplicate requests (returns same promise)", async () => {
      let callCount = 0;
      const task = async () => {
        callCount++;
        await new Promise(r => setTimeout(r, 50));
        return { ok: true };
      };

      const p1 = queuePerItem("eval", "proj", "sess", "my-eval", task);
      const p2 = queuePerItem("eval", "proj", "sess", "my-eval", task);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(callCount).toBe(1);
      expect(r1).toBe(r2);
    });

    it("records enrichment type correctly", async () => {
      await queuePerItem("enrichment", "proj", "sess", "my-enricher", async () => ({ ok: true }));
      const status = getQueueStatus();
      expect(status.completed[0].type).toBe("enrichment");
      expect(status.completed[0].itemName).toBe("my-enricher");
    });

    it("includes priority label in pending items", async () => {
      // Fill concurrency (default 2) to force pending
      const blockers: Array<() => void> = [];
      for (let i = 0; i < 2; i++) {
        queuePerItem("eval", "proj", "sess", `blocker-${i}`,
          () => new Promise<void>(resolve => { blockers.push(resolve); }),
          { priority: Priority.HIGH },
        );
      }

      // This one should be pending
      const pendingPromise = queuePerItem("eval", "proj", "sess", "queued-item",
        async () => ({ ok: true }),
        { priority: Priority.LOW },
      );

      const status = getQueueStatus();
      expect(status.pending).toHaveLength(1);
      expect(status.pending[0].itemName).toBe("queued-item");
      expect(status.pending[0].priorityLabel).toBe("LOW");
      expect(status.processing).toHaveLength(2);

      // Clean up
      blockers.forEach(r => r());
      await pendingPromise;
    });

    it("upgrades priority of pending items", async () => {
      // Fill concurrency (default 2)
      const blockers: Array<() => void> = [];
      for (let i = 0; i < 2; i++) {
        queuePerItem("eval", "proj", "sess", `blocker-${i}`,
          () => new Promise<void>(resolve => { blockers.push(resolve); }),
          { priority: Priority.HIGH },
        );
      }

      // Queue at LOW priority
      const p = queuePerItem("eval", "proj", "sess", "upgradeable",
        async () => ({ ok: true }),
        { priority: Priority.LOW },
      );

      let status = getQueueStatus();
      expect(status.pending[0].priorityLabel).toBe("LOW");

      // Re-queue same item at HIGH — should upgrade
      queuePerItem("eval", "proj", "sess", "upgradeable",
        async () => ({ ok: true }),
        { priority: Priority.HIGH },
      );

      status = getQueueStatus();
      expect(status.pending[0].priorityLabel).toBe("HIGH");

      // Clean up
      blockers.forEach(r => r());
      await p;
    });
  });

  describe("completed items", () => {
    it("returns completed items newest-first", async () => {
      await queuePerItem("eval", "proj", "sess", "first", async () => ({ ok: true }));
      await queuePerItem("eval", "proj", "sess", "second", async () => ({ ok: true }));

      const status = getQueueStatus();
      expect(status.completed).toHaveLength(2);
      expect(status.completed[0].itemName).toBe("second");
      expect(status.completed[1].itemName).toBe("first");
    });

    it("records durationMs", async () => {
      await queuePerItem("eval", "proj", "sess", "timed", async () => {
        await new Promise(r => setTimeout(r, 20));
        return { ok: true };
      });

      const status = getQueueStatus();
      expect(status.completed[0].durationMs).toBeGreaterThanOrEqual(15);
    });
  });
});
