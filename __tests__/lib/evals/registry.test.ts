// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerEval,
  getRegisteredEvals,
  getSessionScopedEvals,
  getSubagentScopedEvals,
  hasSubagentEvals,
  hasEvals,
  clearEvals,
} from "@/lib/evals/registry";

describe("evals/registry", () => {
  beforeEach(() => {
    clearEvals();
  });

  it("starts empty", () => {
    expect(getRegisteredEvals()).toEqual([]);
    expect(hasEvals()).toBe(false);
  });

  it("registerEval adds an eval", () => {
    const fn = () => ({ pass: true });
    registerEval("test-eval", fn);
    expect(hasEvals()).toBe(true);
    const evals = getRegisteredEvals();
    expect(evals).toHaveLength(1);
    expect(evals[0].name).toBe("test-eval");
    expect(evals[0].fn).toBe(fn);
  });

  it("registerEval replaces an eval with the same name", () => {
    const fn1 = () => ({ pass: true });
    const fn2 = () => ({ pass: false });
    registerEval("dup", fn1);
    registerEval("dup", fn2);
    const evals = getRegisteredEvals();
    expect(evals).toHaveLength(1);
    expect(evals[0].fn).toBe(fn2);
  });

  it("registerEval keeps distinct names separate", () => {
    registerEval("a", () => ({ pass: true }));
    registerEval("b", () => ({ pass: false }));
    expect(getRegisteredEvals()).toHaveLength(2);
  });

  it("clearEvals empties the registry", () => {
    registerEval("x", () => ({ pass: true }));
    expect(hasEvals()).toBe(true);
    clearEvals();
    expect(hasEvals()).toBe(false);
    expect(getRegisteredEvals()).toHaveLength(0);
  });

  it("getRegisteredEvals returns items in registration order", () => {
    registerEval("first", () => ({ pass: true }));
    registerEval("second", () => ({ pass: true }));
    registerEval("third", () => ({ pass: true }));
    const names = getRegisteredEvals().map((e) => e.name);
    expect(names).toEqual(["first", "second", "third"]);
  });

  it("registerEval stores condition when provided", () => {
    const fn = () => ({ pass: true });
    const condition = () => true;
    registerEval("with-cond", fn, condition);
    const evals = getRegisteredEvals();
    expect(evals[0].condition).toBe(condition);
  });

  it("registerEval omits condition when not provided", () => {
    const fn = () => ({ pass: true });
    registerEval("no-cond", fn);
    const evals = getRegisteredEvals();
    expect(evals[0].condition).toBeUndefined();
  });

  // --- Scope tests ---

  it("registerEval defaults scope to 'session'", () => {
    registerEval("default-scope", () => ({ pass: true }));
    const evals = getRegisteredEvals();
    expect(evals[0].scope).toBe("session");
  });

  it("registerEval stores scope when provided", () => {
    registerEval("sub-eval", () => ({ pass: true }), undefined, "subagent");
    const evals = getRegisteredEvals();
    expect(evals[0].scope).toBe("subagent");
  });

  it("registerEval stores subagentType when provided", () => {
    registerEval("explore-eval", () => ({ pass: true }), undefined, "subagent", "Explore");
    const evals = getRegisteredEvals();
    expect(evals[0].scope).toBe("subagent");
    expect(evals[0].subagentType).toBe("Explore");
  });

  it("getSessionScopedEvals returns session and both-scoped evals", () => {
    registerEval("session-only", () => ({ pass: true }));
    registerEval("sub-only", () => ({ pass: true }), undefined, "subagent");
    registerEval("both-scope", () => ({ pass: true }), undefined, "both");
    const sessionEvals = getSessionScopedEvals();
    const names = sessionEvals.map((e) => e.name);
    expect(names).toEqual(["session-only", "both-scope"]);
  });

  it("getSubagentScopedEvals returns subagent and both-scoped evals", () => {
    registerEval("session-only", () => ({ pass: true }));
    registerEval("sub-only", () => ({ pass: true }), undefined, "subagent");
    registerEval("both-scope", () => ({ pass: true }), undefined, "both");
    const subEvals = getSubagentScopedEvals();
    const names = subEvals.map((e) => e.name);
    expect(names).toEqual(["sub-only", "both-scope"]);
  });

  it("getSubagentScopedEvals filters by subagentType", () => {
    registerEval("explore", () => ({ pass: true }), undefined, "subagent", "Explore");
    registerEval("any-sub", () => ({ pass: true }), undefined, "subagent");
    registerEval("bash", () => ({ pass: true }), undefined, "subagent", "Bash");
    const exploreEvals = getSubagentScopedEvals("Explore");
    const names = exploreEvals.map((e) => e.name);
    expect(names).toEqual(["explore", "any-sub"]);
  });

  it("getSubagentScopedEvals without type returns all subagent evals", () => {
    registerEval("explore", () => ({ pass: true }), undefined, "subagent", "Explore");
    registerEval("any-sub", () => ({ pass: true }), undefined, "subagent");
    const all = getSubagentScopedEvals();
    expect(all).toHaveLength(2);
  });

  it("hasSubagentEvals returns true when subagent-scoped evals exist", () => {
    registerEval("sub", () => ({ pass: true }), undefined, "subagent");
    expect(hasSubagentEvals()).toBe(true);
  });

  it("hasSubagentEvals returns true for both-scoped evals", () => {
    registerEval("both", () => ({ pass: true }), undefined, "both");
    expect(hasSubagentEvals()).toBe(true);
  });

  it("hasSubagentEvals returns false when only session evals", () => {
    registerEval("session", () => ({ pass: true }));
    expect(hasSubagentEvals()).toBe(false);
  });
});
