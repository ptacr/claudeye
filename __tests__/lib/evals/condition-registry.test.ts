// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  setGlobalCondition,
  getGlobalCondition,
  clearGlobalCondition,
} from "@/lib/evals/condition-registry";

describe("evals/condition-registry", () => {
  beforeEach(() => {
    clearGlobalCondition();
  });

  it("starts with null (no condition)", () => {
    expect(getGlobalCondition()).toBeNull();
  });

  it("setGlobalCondition stores the function", () => {
    const fn = () => true;
    setGlobalCondition(fn);
    expect(getGlobalCondition()).toBe(fn);
  });

  it("setGlobalCondition replaces a previously set condition", () => {
    const fn1 = () => true;
    const fn2 = () => false;
    setGlobalCondition(fn1);
    setGlobalCondition(fn2);
    expect(getGlobalCondition()).toBe(fn2);
  });

  it("clearGlobalCondition removes the condition", () => {
    setGlobalCondition(() => true);
    clearGlobalCondition();
    expect(getGlobalCondition()).toBeNull();
  });
});
