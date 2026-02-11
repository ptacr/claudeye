// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("@/lib/paths", () => ({
  getClaudeProjectsPath: vi.fn(() => "/mock/.claude/projects"),
}));

vi.mock("@/lib/log-entries", () => ({
  parseLogContent: vi.fn((content: string) => [{ type: "user", content }]),
  parseRawLines: vi.fn((content: string) => [{ type: "user", content }]),
}));

import { readFile } from "fs/promises";
import { parseLogContent } from "@/lib/log-entries";
import { loadSubagentLog } from "@/app/actions/load-subagent-log";

const mockReadFile = vi.mocked(readFile);
const mockParseLogContent = vi.mocked(parseLogContent);

describe("loadSubagentLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("input validation", () => {
    it("rejects non-hex agentId (e.g. ../etc)", async () => {
      const result = await loadSubagentLog("project", "11111111-2222-3333-4444-555555555555", "../etc");
      expect(result.ok).toBe(false);
    });

    it("rejects empty agentId", async () => {
      const result = await loadSubagentLog("project", "11111111-2222-3333-4444-555555555555", "");
      expect(result.ok).toBe(false);
    });

    it("rejects sessionId with invalid chars", async () => {
      const result = await loadSubagentLog("project", "../etc/passwd", "abc123");
      expect(result.ok).toBe(false);
    });

    it("rejects sessionId that is not strict UUID format", async () => {
      const result = await loadSubagentLog("project", "not-a-uuid", "abc123");
      expect(result.ok).toBe(false);
    });

    it("rejects sessionId with uppercase hex", async () => {
      const result = await loadSubagentLog("project", "11111111-2222-3333-4444-55555555555F", "abc123");
      expect(result.ok).toBe(false);
    });

    it("rejects empty projectName", async () => {
      const result = await loadSubagentLog("", "11111111-2222-3333-4444-555555555555", "abc123");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid project name");
      }
    });

    it("rejects projectName containing .. path segments", async () => {
      const result = await loadSubagentLog("../evil", "11111111-2222-3333-4444-555555555555", "abc123");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid project name");
      }
    });

    it("rejects projectName with embedded .. segments", async () => {
      const result = await loadSubagentLog("foo/../bar", "11111111-2222-3333-4444-555555555555", "abc123");
      expect(result.ok).toBe(false);
    });

    it("accepts valid hex agentId + UUID sessionId", async () => {
      mockReadFile.mockResolvedValueOnce("content" as any);
      mockParseLogContent.mockReturnValueOnce([]);
      const result = await loadSubagentLog(
        "project",
        "11111111-2222-3333-4444-555555555555",
        "abc123"
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("path resolution", () => {
    it("tries 3 candidate paths in order", async () => {
      const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      mockReadFile
        .mockRejectedValueOnce(enoent)
        .mockRejectedValueOnce(enoent)
        .mockResolvedValueOnce("content" as any);
      mockParseLogContent.mockReturnValueOnce([]);

      const result = await loadSubagentLog(
        "myproject",
        "11111111-2222-3333-4444-555555555555",
        "abc123"
      );
      expect(result.ok).toBe(true);
      expect(mockReadFile).toHaveBeenCalledTimes(3);
    });

    it("returns { ok: true, entries } on first successful read", async () => {
      mockReadFile.mockResolvedValueOnce("file content" as any);
      mockParseLogContent.mockReturnValueOnce([{ type: "user" } as any]);

      const result = await loadSubagentLog(
        "project",
        "11111111-2222-3333-4444-555555555555",
        "abc123"
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.entries).toHaveLength(1);
      }
      // Should only try first path since it succeeded
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it("returns { ok: false } when all paths fail (ENOENT)", async () => {
      const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      mockReadFile
        .mockRejectedValueOnce(enoent)
        .mockRejectedValueOnce(enoent)
        .mockRejectedValueOnce(enoent);

      const result = await loadSubagentLog(
        "project",
        "11111111-2222-3333-4444-555555555555",
        "abc123"
      );
      expect(result.ok).toBe(false);
    });

    it("returns { ok: false } immediately on non-ENOENT errors (EACCES)", async () => {
      const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
      mockReadFile.mockRejectedValueOnce(eacces);

      const result = await loadSubagentLog(
        "project",
        "11111111-2222-3333-4444-555555555555",
        "abc123"
      );
      expect(result.ok).toBe(false);
      // Should only try first path before bailing out
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it("returns { ok: false } when parseLogContent throws", async () => {
      mockReadFile.mockResolvedValueOnce("bad content" as any);
      mockParseLogContent.mockImplementationOnce(() => {
        throw new Error("Parse error");
      });

      const result = await loadSubagentLog(
        "project",
        "11111111-2222-3333-4444-555555555555",
        "abc123"
      );
      expect(result.ok).toBe(false);
    });
  });
});
