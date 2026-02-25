// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
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

  // ── Queue flags ────────────────────────────────────────────────────────────

  it("parses --queue-interval=30", () => {
    const result = parseScriptArgs(["--queue-interval=30"]);
    expect(result.queueInterval).toBe(30);
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --queue-interval 30 (space-separated)", () => {
    const result = parseScriptArgs(["--queue-interval", "30"]);
    expect(result.queueInterval).toBe(30);
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --queue-concurrency=4", () => {
    const result = parseScriptArgs(["--queue-concurrency=4"]);
    expect(result.queueConcurrency).toBe(4);
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --queue-concurrency 4 (space-separated)", () => {
    const result = parseScriptArgs(["--queue-concurrency", "4"]);
    expect(result.queueConcurrency).toBe(4);
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --queue-history-ttl=7200", () => {
    const result = parseScriptArgs(["--queue-history-ttl=7200"]);
    expect(result.queueHistoryTtl).toBe(7200);
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --queue-history-ttl 7200 (space-separated)", () => {
    const result = parseScriptArgs(["--queue-history-ttl", "7200"]);
    expect(result.queueHistoryTtl).toBe(7200);
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --queue-max-sessions=10", () => {
    const result = parseScriptArgs(["--queue-max-sessions=10"]);
    expect(result.queueMaxSessions).toBe(10);
    expect(result.remainingArgs).toEqual([]);
  });

  it("parses --queue-max-sessions 10 (space-separated)", () => {
    const result = parseScriptArgs(["--queue-max-sessions", "10"]);
    expect(result.queueMaxSessions).toBe(10);
    expect(result.remainingArgs).toEqual([]);
  });

  it("defaults queue flags to undefined", () => {
    const result = parseScriptArgs([]);
    expect(result.queueInterval).toBeUndefined();
    expect(result.queueConcurrency).toBeUndefined();
    expect(result.queueHistoryTtl).toBeUndefined();
    expect(result.queueMaxSessions).toBeUndefined();
  });

  it("parses all queue flags together", () => {
    const result = parseScriptArgs([
      "--queue-interval=60",
      "--queue-concurrency=5",
      "--queue-history-ttl=1800",
      "--queue-max-sessions=12",
    ]);
    expect(result.queueInterval).toBe(60);
    expect(result.queueConcurrency).toBe(5);
    expect(result.queueHistoryTtl).toBe(1800);
    expect(result.queueMaxSessions).toBe(12);
    expect(result.remainingArgs).toEqual([]);
  });

  // ── Queue flag error paths ────────────────────────────────────────────────

  describe("queue flag validation errors", () => {
    it("accepts --queue-max-sessions=0 (0 means unlimited)", () => {
      const result = parseScriptArgs(["--queue-max-sessions=0"]);
      expect(result.queueMaxSessions).toBe(0);
    });

    it("rejects --queue-history-ttl=0 (zero is not positive)", () => {
      vi.spyOn(process, "exit").mockImplementation((code) => {
        throw new Error(`exit ${code}`);
      });
      expect(() => parseScriptArgs(["--queue-history-ttl=0"])).toThrow("exit 1");
      vi.restoreAllMocks();
    });

    it("rejects --queue-history-ttl=abc (non-numeric)", () => {
      vi.spyOn(process, "exit").mockImplementation((code) => {
        throw new Error(`exit ${code}`);
      });
      expect(() => parseScriptArgs(["--queue-history-ttl=abc"])).toThrow("exit 1");
      vi.restoreAllMocks();
    });

    it("rejects --queue-history-ttl with no value", () => {
      vi.spyOn(process, "exit").mockImplementation((code) => {
        throw new Error(`exit ${code}`);
      });
      expect(() => parseScriptArgs(["--queue-history-ttl"])).toThrow("exit 1");
      vi.restoreAllMocks();
    });
  });
});
