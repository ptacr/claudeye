// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerEnricher,
  getRegisteredEnrichers,
  getSessionScopedEnrichers,
  getSubagentScopedEnrichers,
  hasSubagentEnrichers,
  hasEnrichers,
  clearEnrichers,
} from "@/lib/evals/enrich-registry";

describe("evals/enrich-registry", () => {
  beforeEach(() => {
    clearEnrichers();
  });

  it("starts empty", () => {
    expect(getRegisteredEnrichers()).toEqual([]);
    expect(hasEnrichers()).toBe(false);
  });

  it("registerEnricher adds an enricher", () => {
    const fn = () => ({ "Total Tokens": 100 });
    registerEnricher("test-enricher", fn);
    expect(hasEnrichers()).toBe(true);
    const enrichers = getRegisteredEnrichers();
    expect(enrichers).toHaveLength(1);
    expect(enrichers[0].name).toBe("test-enricher");
    expect(enrichers[0].fn).toBe(fn);
  });

  it("registerEnricher replaces an enricher with the same name", () => {
    const fn1 = () => ({ key: "a" });
    const fn2 = () => ({ key: "b" });
    registerEnricher("dup", fn1);
    registerEnricher("dup", fn2);
    const enrichers = getRegisteredEnrichers();
    expect(enrichers).toHaveLength(1);
    expect(enrichers[0].fn).toBe(fn2);
  });

  it("registerEnricher keeps distinct names separate", () => {
    registerEnricher("a", () => ({ x: 1 }));
    registerEnricher("b", () => ({ y: 2 }));
    expect(getRegisteredEnrichers()).toHaveLength(2);
  });

  it("clearEnrichers empties the registry", () => {
    registerEnricher("x", () => ({ val: true }));
    expect(hasEnrichers()).toBe(true);
    clearEnrichers();
    expect(hasEnrichers()).toBe(false);
    expect(getRegisteredEnrichers()).toHaveLength(0);
  });

  it("getRegisteredEnrichers returns items in registration order", () => {
    registerEnricher("first", () => ({ a: 1 }));
    registerEnricher("second", () => ({ b: 2 }));
    registerEnricher("third", () => ({ c: 3 }));
    const names = getRegisteredEnrichers().map((e) => e.name);
    expect(names).toEqual(["first", "second", "third"]);
  });

  it("registerEnricher stores condition when provided", () => {
    const fn = () => ({ val: 1 });
    const condition = () => true;
    registerEnricher("with-cond", fn, condition);
    const enrichers = getRegisteredEnrichers();
    expect(enrichers[0].condition).toBe(condition);
  });

  it("registerEnricher omits condition when not provided", () => {
    const fn = () => ({ val: 1 });
    registerEnricher("no-cond", fn);
    const enrichers = getRegisteredEnrichers();
    expect(enrichers[0].condition).toBeUndefined();
  });

  // --- Scope tests ---

  it("registerEnricher defaults scope to 'session'", () => {
    registerEnricher("default-scope", () => ({ val: 1 }));
    const enrichers = getRegisteredEnrichers();
    expect(enrichers[0].scope).toBe("session");
  });

  it("registerEnricher stores scope when provided", () => {
    registerEnricher("sub-enrich", () => ({ val: 1 }), undefined, "subagent");
    const enrichers = getRegisteredEnrichers();
    expect(enrichers[0].scope).toBe("subagent");
  });

  it("registerEnricher stores subagentType when provided", () => {
    registerEnricher("explore-enrich", () => ({ val: 1 }), undefined, "subagent", "Explore");
    const enrichers = getRegisteredEnrichers();
    expect(enrichers[0].scope).toBe("subagent");
    expect(enrichers[0].subagentType).toBe("Explore");
  });

  it("getSessionScopedEnrichers returns session and both-scoped enrichers", () => {
    registerEnricher("session-only", () => ({ a: 1 }));
    registerEnricher("sub-only", () => ({ b: 2 }), undefined, "subagent");
    registerEnricher("both-scope", () => ({ c: 3 }), undefined, "both");
    const sessionEnrichers = getSessionScopedEnrichers();
    const names = sessionEnrichers.map((e) => e.name);
    expect(names).toEqual(["session-only", "both-scope"]);
  });

  it("getSubagentScopedEnrichers returns subagent and both-scoped enrichers", () => {
    registerEnricher("session-only", () => ({ a: 1 }));
    registerEnricher("sub-only", () => ({ b: 2 }), undefined, "subagent");
    registerEnricher("both-scope", () => ({ c: 3 }), undefined, "both");
    const subEnrichers = getSubagentScopedEnrichers();
    const names = subEnrichers.map((e) => e.name);
    expect(names).toEqual(["sub-only", "both-scope"]);
  });

  it("getSubagentScopedEnrichers filters by subagentType", () => {
    registerEnricher("explore", () => ({ a: 1 }), undefined, "subagent", "Explore");
    registerEnricher("any-sub", () => ({ b: 2 }), undefined, "subagent");
    registerEnricher("bash", () => ({ c: 3 }), undefined, "subagent", "Bash");
    const exploreEnrichers = getSubagentScopedEnrichers("Explore");
    const names = exploreEnrichers.map((e) => e.name);
    expect(names).toEqual(["explore", "any-sub"]);
  });

  it("hasSubagentEnrichers returns true when subagent-scoped enrichers exist", () => {
    registerEnricher("sub", () => ({ val: 1 }), undefined, "subagent");
    expect(hasSubagentEnrichers()).toBe(true);
  });

  it("hasSubagentEnrichers returns false when only session enrichers", () => {
    registerEnricher("session", () => ({ val: 1 }));
    expect(hasSubagentEnrichers()).toBe(false);
  });
});
