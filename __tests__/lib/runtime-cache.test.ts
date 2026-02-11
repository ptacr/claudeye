import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runtimeCache } from "@/lib/runtime-cache";

describe("runtimeCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls underlying function on first invocation", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const cached = runtimeCache(fn, 10);
    await cached("arg1");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("arg1");
  });

  it("returns cached value within TTL (fn called once)", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const cached = runtimeCache(fn, 10);
    const first = await cached("arg1");
    vi.advanceTimersByTime(5000); // 5s, within 10s TTL
    const second = await cached("arg1");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(first).toBe("result");
    expect(second).toBe("result");
  });

  it("re-calls after TTL expires", async () => {
    const fn = vi.fn().mockResolvedValue("result1");
    const cached = runtimeCache(fn, 10);
    await cached("arg1");
    expect(fn).toHaveBeenCalledTimes(1);

    fn.mockResolvedValue("result2");
    vi.advanceTimersByTime(11000); // past 10s TTL
    const result = await cached("arg1");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result).toBe("result2");
  });

  it("different args create different cache entries", async () => {
    const fn = vi.fn().mockImplementation(async (x: string) => `result-${x}`);
    const cached = runtimeCache(fn, 10);
    const r1 = await cached("a");
    const r2 = await cached("b");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(r1).toBe("result-a");
    expect(r2).toBe("result-b");
  });

  it("returns the async result correctly", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const cached = runtimeCache(fn, 10);
    const result = await cached();
    expect(result).toBe(42);
  });
});
