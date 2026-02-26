// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerAction,
  getRegisteredActions,
  getSessionScopedActions,
  getSubagentScopedActions,
  hasSubagentActions,
  hasActions,
  clearActions,
} from "@/lib/evals/action-registry";

describe("evals/action-registry", () => {
  beforeEach(() => {
    clearActions();
  });

  it("starts empty", () => {
    expect(getRegisteredActions()).toEqual([]);
    expect(hasActions()).toBe(false);
  });

  it("registerAction adds an action", () => {
    const fn = () => ({ status: "success" as const });
    registerAction("test-action", fn);
    expect(hasActions()).toBe(true);
    const actions = getRegisteredActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe("test-action");
    expect(actions[0].fn).toBe(fn);
    expect(actions[0].cache).toBe(true);
  });

  it("registerAction replaces an action with the same name", () => {
    const fn1 = () => ({ status: "success" as const });
    const fn2 = () => ({ status: "error" as const });
    registerAction("dup", fn1);
    registerAction("dup", fn2);
    const actions = getRegisteredActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].fn).toBe(fn2);
  });

  it("registerAction stores cache: false", () => {
    registerAction("no-cache", () => ({ status: "success" as const }), undefined, undefined, undefined, false);
    const actions = getRegisteredActions();
    expect(actions[0].cache).toBe(false);
  });

  it("registerAction defaults scope to session", () => {
    registerAction("default-scope", () => ({ status: "success" as const }));
    expect(getRegisteredActions()[0].scope).toBe("session");
  });

  it("registerAction stores condition when provided", () => {
    const condition = () => true;
    registerAction("with-cond", () => ({ status: "success" as const }), condition);
    expect(getRegisteredActions()[0].condition).toBe(condition);
  });

  it("getSessionScopedActions returns session and both-scoped actions", () => {
    registerAction("session-only", () => ({ status: "success" as const }));
    registerAction("sub-only", () => ({ status: "success" as const }), undefined, "subagent");
    registerAction("both-scope", () => ({ status: "success" as const }), undefined, "both");
    const names = getSessionScopedActions().map(a => a.name);
    expect(names).toEqual(["session-only", "both-scope"]);
  });

  it("getSubagentScopedActions returns subagent and both-scoped actions", () => {
    registerAction("session-only", () => ({ status: "success" as const }));
    registerAction("sub-only", () => ({ status: "success" as const }), undefined, "subagent");
    registerAction("both-scope", () => ({ status: "success" as const }), undefined, "both");
    const names = getSubagentScopedActions().map(a => a.name);
    expect(names).toEqual(["sub-only", "both-scope"]);
  });

  it("getSubagentScopedActions filters by subagentType", () => {
    registerAction("explore", () => ({ status: "success" as const }), undefined, "subagent", "Explore");
    registerAction("any-sub", () => ({ status: "success" as const }), undefined, "subagent");
    registerAction("bash", () => ({ status: "success" as const }), undefined, "subagent", "Bash");
    const names = getSubagentScopedActions("Explore").map(a => a.name);
    expect(names).toEqual(["explore", "any-sub"]);
  });

  it("hasSubagentActions returns true when subagent-scoped actions exist", () => {
    registerAction("sub", () => ({ status: "success" as const }), undefined, "subagent");
    expect(hasSubagentActions()).toBe(true);
  });

  it("hasSubagentActions returns false when only session actions", () => {
    registerAction("session", () => ({ status: "success" as const }));
    expect(hasSubagentActions()).toBe(false);
  });

  it("clearActions empties the registry", () => {
    registerAction("x", () => ({ status: "success" as const }));
    expect(hasActions()).toBe(true);
    clearActions();
    expect(hasActions()).toBe(false);
  });
});
