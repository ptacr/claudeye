// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/registry", () => ({
  registerEval: vi.fn(),
}));

vi.mock("@/lib/evals/enrich-registry", () => ({
  registerEnricher: vi.fn(),
}));

vi.mock("@/lib/evals/action-registry", () => ({
  registerAction: vi.fn(),
}));

vi.mock("@/lib/evals/dashboard-registry", () => ({
  registerFilter: vi.fn(),
  registerView: vi.fn(),
}));

vi.mock("@/lib/evals/condition-registry", () => ({
  setGlobalCondition: vi.fn(),
}));

vi.mock("@/lib/evals/auth-registry", () => ({
  registerAuthUsers: vi.fn(),
}));

vi.mock("@/lib/evals/server-spawn", () => ({
  spawnServer: vi.fn(async () => {}),
}));

import { registerEval } from "@/lib/evals/registry";
import { registerEnricher } from "@/lib/evals/enrich-registry";
import { registerAction } from "@/lib/evals/action-registry";
import { registerFilter, registerView } from "@/lib/evals/dashboard-registry";
import { setGlobalCondition } from "@/lib/evals/condition-registry";
import { registerAuthUsers } from "@/lib/evals/auth-registry";
import { createApp } from "@/lib/evals/app";

const mockRegisterEval = vi.mocked(registerEval);
const mockRegisterEnricher = vi.mocked(registerEnricher);
const mockRegisterAction = vi.mocked(registerAction);
const mockRegisterFilter = vi.mocked(registerFilter);
const mockRegisterView = vi.mocked(registerView);
const mockSetGlobalCondition = vi.mocked(setGlobalCondition);
const mockRegisterAuthUsers = vi.mocked(registerAuthUsers);

const LOADING_KEY = "__CLAUDEYE_LOADING_EVALS__";

describe("evals/app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as Record<string, unknown>)[LOADING_KEY];
  });

  it("createApp returns an object with eval, enrich, action, condition, auth, dashboard, and listen", () => {
    const app = createApp();
    expect(typeof app.eval).toBe("function");
    expect(typeof app.enrich).toBe("function");
    expect(typeof app.action).toBe("function");
    expect(typeof app.condition).toBe("function");
    expect(typeof app.auth).toBe("function");
    expect(typeof app.dashboard.filter).toBe("function");
    expect(typeof app.dashboard.view).toBe("function");
    expect(typeof app.listen).toBe("function");
  });

  it("eval() registers the eval in the registry", () => {
    const app = createApp();
    const fn = () => ({ pass: true });
    app.eval("my-eval", fn);
    expect(mockRegisterEval).toHaveBeenCalledWith("my-eval", fn, undefined, undefined, undefined);
  });

  it("eval() is chainable", () => {
    const app = createApp();
    const result = app
      .eval("a", () => ({ pass: true }))
      .eval("b", () => ({ pass: false }));
    expect(result).toBe(app);
    expect(mockRegisterEval).toHaveBeenCalledTimes(2);
  });

  it("listen() is a no-op when __CLAUDEYE_LOADING_EVALS__ is set", async () => {
    (globalThis as Record<string, unknown>)[LOADING_KEY] = true;
    const app = createApp();
    // Should resolve without spawning a server
    await app.listen(3000);
    const { spawnServer } = await import("@/lib/evals/server-spawn");
    expect(spawnServer).not.toHaveBeenCalled();
  });

  // --- condition() tests ---

  it("condition() exists on app", () => {
    const app = createApp();
    expect(typeof app.condition).toBe("function");
  });

  it("condition() calls setGlobalCondition", () => {
    const app = createApp();
    const condFn = () => true;
    app.condition(condFn);
    expect(mockSetGlobalCondition).toHaveBeenCalledWith(condFn);
  });

  it("condition() is chainable", () => {
    const app = createApp();
    const result = app.condition(() => true);
    expect(result).toBe(app);
  });

  // --- eval() with options ---

  it("eval() with options passes condition to registerEval", () => {
    const app = createApp();
    const fn = () => ({ pass: true });
    const condFn = () => true;
    app.eval("cond-eval", fn, { condition: condFn });
    expect(mockRegisterEval).toHaveBeenCalledWith("cond-eval", fn, condFn, undefined, undefined);
  });

  it("eval() without options passes undefined condition", () => {
    const app = createApp();
    const fn = () => ({ pass: true });
    app.eval("no-opts", fn);
    expect(mockRegisterEval).toHaveBeenCalledWith("no-opts", fn, undefined, undefined, undefined);
  });

  it("eval() with scope and subagentType passes them through", () => {
    const app = createApp();
    const fn = () => ({ pass: true });
    app.eval("sub-eval", fn, { scope: "subagent", subagentType: "Explore" });
    expect(mockRegisterEval).toHaveBeenCalledWith("sub-eval", fn, undefined, "subagent", "Explore");
  });

  it("eval() with scope 'both' passes scope through", () => {
    const app = createApp();
    const fn = () => ({ pass: true });
    app.eval("both-eval", fn, { scope: "both" });
    expect(mockRegisterEval).toHaveBeenCalledWith("both-eval", fn, undefined, "both", undefined);
  });

  // --- enrich() tests ---

  it("enrich() registers the enricher in the registry", () => {
    const app = createApp();
    const fn = () => ({ val: 1 });
    app.enrich("my-enricher", fn);
    expect(mockRegisterEnricher).toHaveBeenCalledWith("my-enricher", fn, undefined, undefined, undefined);
  });

  it("enrich() with options passes condition to registerEnricher", () => {
    const app = createApp();
    const fn = () => ({ val: 1 });
    const condFn = () => true;
    app.enrich("cond-enrich", fn, { condition: condFn });
    expect(mockRegisterEnricher).toHaveBeenCalledWith("cond-enrich", fn, condFn, undefined, undefined);
  });

  it("enrich() with scope and subagentType passes them through", () => {
    const app = createApp();
    const fn = () => ({ val: 1 });
    app.enrich("sub-enrich", fn, { scope: "subagent", subagentType: "Explore" });
    expect(mockRegisterEnricher).toHaveBeenCalledWith("sub-enrich", fn, undefined, "subagent", "Explore");
  });

  // --- action() tests ---

  it("action() registers the action in the registry", () => {
    const app = createApp();
    const fn = () => ({ status: "success" as const });
    app.action("my-action", fn);
    expect(mockRegisterAction).toHaveBeenCalledWith("my-action", fn, undefined, undefined, undefined, undefined);
  });

  it("action() with options passes condition, scope, subagentType, and cache", () => {
    const app = createApp();
    const fn = () => ({ status: "success" as const });
    const condFn = () => true;
    app.action("cond-action", fn, { condition: condFn, scope: "subagent", subagentType: "Explore", cache: false });
    expect(mockRegisterAction).toHaveBeenCalledWith("cond-action", fn, condFn, "subagent", "Explore", false);
  });

  it("action() is chainable", () => {
    const app = createApp();
    const result = app
      .action("a", () => ({ status: "success" as const }))
      .action("b", () => ({ status: "error" as const }));
    expect(result).toBe(app);
    expect(mockRegisterAction).toHaveBeenCalledTimes(2);
  });

  // --- dashboard.filter() tests ---

  it("dashboard.filter() registers the filter in the registry with 'default' view", () => {
    const app = createApp();
    const fn = () => true;
    app.dashboard.filter("has-errors", fn, { label: "Has Errors" });
    expect(mockRegisterFilter).toHaveBeenCalledWith("has-errors", fn, "Has Errors", undefined, "default");
  });

  it("dashboard.filter() is chainable (returns app)", () => {
    const app = createApp();
    const result = app
      .dashboard.filter("a", () => true)
      .dashboard.filter("b", () => 42);
    expect(result).toBe(app);
    expect(mockRegisterFilter).toHaveBeenCalledTimes(2);
  });

  it("dashboard.filter() without options passes undefined label and condition", () => {
    const app = createApp();
    const fn = () => "hello";
    app.dashboard.filter("my-filter", fn);
    expect(mockRegisterFilter).toHaveBeenCalledWith("my-filter", fn, undefined, undefined, "default");
  });

  it("dashboard.filter() with condition passes it through", () => {
    const app = createApp();
    const fn = () => true;
    const condFn = () => true;
    app.dashboard.filter("cond-filter", fn, { label: "Label", condition: condFn });
    expect(mockRegisterFilter).toHaveBeenCalledWith("cond-filter", fn, "Label", condFn, "default");
  });

  // --- dashboard.view() tests ---

  it("dashboard.view() returns a view builder", () => {
    const app = createApp();
    const builder = app.dashboard.view("performance", { label: "Performance Metrics" });
    expect(typeof builder.filter).toBe("function");
  });

  it("dashboard.view() calls registerView with name and label", () => {
    const app = createApp();
    app.dashboard.view("performance", { label: "Performance Metrics" });
    expect(mockRegisterView).toHaveBeenCalledWith("performance", "Performance Metrics");
  });

  it("dashboard.view() defaults label to name when not provided", () => {
    const app = createApp();
    app.dashboard.view("performance");
    expect(mockRegisterView).toHaveBeenCalledWith("performance", "performance");
  });

  it("view builder filter() returns the view builder (not app) for chaining", () => {
    const app = createApp();
    const builder = app.dashboard.view("perf", { label: "Perf" });
    const result = builder.filter("turn-count", () => 5, { label: "Turn Count" });
    expect(result).toBe(builder);
    expect(result).not.toBe(app);
  });

  it("view builder filter() calls registerFilter with the view name", () => {
    const app = createApp();
    const fn = () => 5;
    app.dashboard.view("perf", { label: "Perf" })
      .filter("turn-count", fn, { label: "Turn Count" });
    expect(mockRegisterFilter).toHaveBeenCalledWith("turn-count", fn, "Turn Count", undefined, "perf");
  });

  it("view builder filter() chains correctly for multiple filters", () => {
    const app = createApp();
    const fn1 = () => 5;
    const fn2 = () => 10;
    app.dashboard.view("perf", { label: "Perf" })
      .filter("turn-count", fn1, { label: "Turn Count" })
      .filter("tool-calls", fn2, { label: "Tool Calls" });
    expect(mockRegisterFilter).toHaveBeenCalledTimes(2);
    expect(mockRegisterFilter).toHaveBeenCalledWith("turn-count", fn1, "Turn Count", undefined, "perf");
    expect(mockRegisterFilter).toHaveBeenCalledWith("tool-calls", fn2, "Tool Calls", undefined, "perf");
  });

  it("view builder filter() with condition passes it through", () => {
    const app = createApp();
    const fn = () => true;
    const condFn = () => true;
    app.dashboard.view("quality")
      .filter("has-errors", fn, { label: "Has Errors", condition: condFn });
    expect(mockRegisterFilter).toHaveBeenCalledWith("has-errors", fn, "Has Errors", condFn, "quality");
  });

  // --- Mixed usage tests ---

  it("mixed usage: views + default filters", () => {
    const app = createApp();
    const filterFn1 = () => 5;
    const filterFn2 = () => true;
    const defaultFilterFn = () => "hello";

    app.dashboard.view("perf", { label: "Performance" })
      .filter("turn-count", filterFn1, { label: "Turns" });

    app.dashboard.view("quality", { label: "Quality" })
      .filter("has-errors", filterFn2, { label: "Errors" });

    app.dashboard.filter("default-filter", defaultFilterFn, { label: "Default" });

    expect(mockRegisterView).toHaveBeenCalledTimes(2);
    expect(mockRegisterFilter).toHaveBeenCalledTimes(3);
    expect(mockRegisterFilter).toHaveBeenCalledWith("turn-count", filterFn1, "Turns", undefined, "perf");
    expect(mockRegisterFilter).toHaveBeenCalledWith("has-errors", filterFn2, "Errors", undefined, "quality");
    expect(mockRegisterFilter).toHaveBeenCalledWith("default-filter", defaultFilterFn, "Default", undefined, "default");
  });

  // --- auth() tests ---

  it("auth() registers users", () => {
    const app = createApp();
    app.auth({ users: [{ username: "admin", password: "secret" }] });
    expect(mockRegisterAuthUsers).toHaveBeenCalledWith([{ username: "admin", password: "secret" }]);
  });

  it("auth() is chainable", () => {
    const app = createApp();
    const result = app.auth({ users: [{ username: "admin", password: "secret" }] });
    expect(result).toBe(app);
  });

  it("auth() can be chained with other methods", () => {
    const app = createApp();
    const evalFn = () => ({ pass: true });
    const result = app
      .auth({ users: [{ username: "admin", password: "secret" }] })
      .eval("e1", evalFn);
    expect(result).toBe(app);
    expect(mockRegisterAuthUsers).toHaveBeenCalled();
    expect(mockRegisterEval).toHaveBeenCalled();
  });

  // --- Full chain test ---

  it("full chain works (condition + eval + enrich + dashboard.filter)", () => {
    const app = createApp();
    const globalCond = () => true;
    const evalFn = () => ({ pass: true });
    const evalCond = () => false;
    const enrichFn = () => ({ x: 1 });
    const enrichCond = () => true;
    const filterFn = () => 42;

    const result = app
      .condition(globalCond)
      .eval("e1", evalFn, { condition: evalCond })
      .enrich("en1", enrichFn, { condition: enrichCond })
      .dashboard.filter("f1", filterFn, { label: "Count" });

    expect(result).toBe(app);
    expect(mockSetGlobalCondition).toHaveBeenCalledWith(globalCond);
    expect(mockRegisterEval).toHaveBeenCalledWith("e1", evalFn, evalCond, undefined, undefined);
    expect(mockRegisterEnricher).toHaveBeenCalledWith("en1", enrichFn, enrichCond, undefined, undefined);
    expect(mockRegisterFilter).toHaveBeenCalledWith("f1", filterFn, "Count", undefined, "default");
  });
});
