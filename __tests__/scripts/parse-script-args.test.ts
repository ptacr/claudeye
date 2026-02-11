// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseScriptArgs } from "@/scripts/parse-script-args";

describe("parseScriptArgs", () => {
  it("returns defaults when no args given", () => {
    const result = parseScriptArgs([]);
    expect(result.claudeProjectsPath).toBeUndefined();
    expect(result.evalsPath).toBeUndefined();
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --projects-path=/some/path", () => {
    const result = parseScriptArgs(["--projects-path=/some/path"]);
    expect(result.claudeProjectsPath).toBe("/some/path");
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --projects-path /some/path (space-separated)", () => {
    const result = parseScriptArgs(["--projects-path", "/some/path"]);
    expect(result.claudeProjectsPath).toBe("/some/path");
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses -p=/some/path", () => {
    const result = parseScriptArgs(["-p=/some/path"]);
    expect(result.claudeProjectsPath).toBe("/some/path");
  });

  it("parses -p /some/path (space-separated)", () => {
    const result = parseScriptArgs(["-p", "/some/path"]);
    expect(result.claudeProjectsPath).toBe("/some/path");
  });

  it("parses --evals=/path/to/eval.js", () => {
    const result = parseScriptArgs(["--evals=/path/to/eval.js"]);
    expect(result.evalsPath).toBeDefined();
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --evals /path/to/eval.js (space-separated)", () => {
    const result = parseScriptArgs(["--evals", "/path/to/eval.js"]);
    expect(result.evalsPath).toBeDefined();
  });

  it("passes remaining args through", () => {
    const result = parseScriptArgs(["--projects-path=/p", "--port", "3000"]);
    expect(result.claudeProjectsPath).toBe("/p");
    expect(result.remainingArgs).toEqual(["--port", "3000"]);
  });

  it("handles both --projects-path and --evals together", () => {
    const result = parseScriptArgs([
      "--projects-path=/proj",
      "--evals=/eval.js",
      "--turbopack",
    ]);
    expect(result.claudeProjectsPath).toBe("/proj");
    expect(result.evalsPath).toBeDefined();
    expect(result.remainingArgs).toEqual(["--turbopack"]);
  });

  it("handles --evals before --projects-path (space-separated)", () => {
    const result = parseScriptArgs([
      "--evals", "/eval.js",
      "--projects-path", "/proj",
    ]);
    expect(result.evalsPath).toBeDefined();
    expect(result.claudeProjectsPath).toBe("/proj");
    expect(result.remainingArgs).toEqual([]);
  });

  it("handles --evals before --projects-path (= format)", () => {
    const result = parseScriptArgs([
      "--evals=/eval.js",
      "--projects-path=/proj",
    ]);
    expect(result.evalsPath).toBeDefined();
    expect(result.claudeProjectsPath).toBe("/proj");
    expect(result.remainingArgs).toEqual([]);
  });

  it("handles --evals before -p (mixed formats)", () => {
    const result = parseScriptArgs([
      "--evals=/eval.js",
      "-p", "/proj",
    ]);
    expect(result.evalsPath).toBeDefined();
    expect(result.claudeProjectsPath).toBe("/proj");
  });

  it("preserves remaining args when --evals comes first", () => {
    const result = parseScriptArgs([
      "--evals", "/eval.js",
      "--projects-path", "/proj",
      "--turbopack",
    ]);
    expect(result.evalsPath).toBeDefined();
    expect(result.claudeProjectsPath).toBe("/proj");
    expect(result.remainingArgs).toEqual(["--turbopack"]);
  });
});
