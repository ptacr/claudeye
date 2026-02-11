// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/registry", () => ({
  registerEval: vi.fn(),
}));

vi.mock("@/lib/evals/enrich-registry", () => ({
  registerEnricher: vi.fn(),
}));

vi.mock("@/lib/evals/condition-registry", () => ({
  setGlobalCondition: vi.fn(),
}));

vi.mock("@/lib/evals/server-spawn", () => ({
  spawnServer: vi.fn(async () => {}),
}));

import { registerEval } from "@/lib/evals/registry";
import { registerEnricher } from "@/lib/evals/enrich-registry";
import { setGlobalCondition } from "@/lib/evals/condition-registry";
import { createApp } from "@/lib/evals/app";

const mockRegisterEval = vi.mocked(registerEval);
const mockRegisterEnricher = vi.mocked(registerEnricher);
const mockSetGlobalCondition = vi.mocked(setGlobalCondition);

const LOADING_KEY = "__CLAUDEYE_LOADING_EVALS__";

describe("evals/app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as Record<string, unknown>)[LOADING_KEY];
  });

  it("createApp returns an object with eval, enrich, condition, and listen", () => {
    const app = createApp();
    expect(typeof app.eval).toBe("function");
    expect(typeof app.enrich).toBe("function");
    expect(typeof app.condition).toBe("function");
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

  // --- Full chain test ---

  it("full chain works (condition + eval with options + enrich with options)", () => {
    const app = createApp();
    const globalCond = () => true;
    const evalFn = () => ({ pass: true });
    const evalCond = () => false;
    const enrichFn = () => ({ x: 1 });
    const enrichCond = () => true;

    const result = app
      .condition(globalCond)
      .eval("e1", evalFn, { condition: evalCond })
      .enrich("en1", enrichFn, { condition: enrichCond });

    expect(result).toBe(app);
    expect(mockSetGlobalCondition).toHaveBeenCalledWith(globalCond);
    expect(mockRegisterEval).toHaveBeenCalledWith("e1", evalFn, evalCond, undefined, undefined);
    expect(mockRegisterEnricher).toHaveBeenCalledWith("en1", enrichFn, enrichCond, undefined, undefined);
  });
});
