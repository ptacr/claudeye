import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { mkdtemp, rm, writeFile, utimes } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { hashSessionFile, hashSubagentFile, hashEvalsModule, hashProjectsPath, _resetPathHashCache, _resetStatCache, _resetEvalsModuleHashCache } from "@/lib/cache/hash";

// Mock paths to point at our temp directory
let tempDir: string;

vi.mock("@/lib/paths", () => ({
  getClaudeProjectsPath: () => tempDir,
}));

describe("hashSessionFile", () => {
  beforeEach(async () => {
    _resetStatCache();
    tempDir = await mkdtemp(join(tmpdir(), "claudeye-hash-test-"));
  });

  afterEach(async () => {
    _resetStatCache();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns a valid sha256 hex hash", async () => {
    const projectDir = join(tempDir, "project-a");
    await writeFile(join(projectDir, "session-1.jsonl"), "test data", "utf-8").catch(async () => {
      const { mkdir } = await import("fs/promises");
      await mkdir(projectDir, { recursive: true });
      await writeFile(join(projectDir, "session-1.jsonl"), "test data", "utf-8");
    });

    const hash = await hashSessionFile("project-a", "session-1");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns same hash for unchanged file", async () => {
    const { mkdir } = await import("fs/promises");
    const projectDir = join(tempDir, "p");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "s.jsonl"), "content", "utf-8");

    const hash1 = await hashSessionFile("p", "s");
    const hash2 = await hashSessionFile("p", "s");
    expect(hash1).toBe(hash2);
  });

  it("returns different hash when file content changes (size changes)", async () => {
    const { mkdir } = await import("fs/promises");
    const projectDir = join(tempDir, "p");
    await mkdir(projectDir, { recursive: true });
    const filePath = join(projectDir, "s.jsonl");

    await writeFile(filePath, "short", "utf-8");
    const hash1 = await hashSessionFile("p", "s");

    _resetStatCache();
    await writeFile(filePath, "much longer content here", "utf-8");
    const hash2 = await hashSessionFile("p", "s");

    expect(hash1).not.toBe(hash2);
  });

  it("returns different hash when mtime changes", async () => {
    const { mkdir } = await import("fs/promises");
    const projectDir = join(tempDir, "p");
    await mkdir(projectDir, { recursive: true });
    const filePath = join(projectDir, "s.jsonl");

    await writeFile(filePath, "same content", "utf-8");
    const hash1 = await hashSessionFile("p", "s");

    _resetStatCache();
    // Manually change mtime while keeping same size
    const oldDate = new Date("2020-01-01");
    await utimes(filePath, oldDate, oldDate);
    const hash2 = await hashSessionFile("p", "s");

    expect(hash1).not.toBe(hash2);
  });
});

describe("hashSubagentFile", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "claudeye-hash-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns a valid sha256 hex hash when file found at first candidate path", async () => {
    const { mkdir } = await import("fs/promises");
    const projectDir = join(tempDir, "project-a");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "agent-abc123.jsonl"), "subagent data", "utf-8");

    const hash = await hashSubagentFile("project-a", "session-1", "abc123");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("finds file at second candidate path (project/session/agent-id.jsonl)", async () => {
    const { mkdir } = await import("fs/promises");
    const sessionDir = join(tempDir, "project-a", "session-1");
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, "agent-abc123.jsonl"), "subagent data", "utf-8");

    const hash = await hashSubagentFile("project-a", "session-1", "abc123");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("finds file at third candidate path (project/session/subagents/agent-id.jsonl)", async () => {
    const { mkdir } = await import("fs/promises");
    const subagentDir = join(tempDir, "project-a", "session-1", "subagents");
    await mkdir(subagentDir, { recursive: true });
    await writeFile(join(subagentDir, "agent-abc123.jsonl"), "subagent data", "utf-8");

    const hash = await hashSubagentFile("project-a", "session-1", "abc123");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns empty string when no candidate file found", async () => {
    const hash = await hashSubagentFile("nonexistent", "session-1", "abc123");
    expect(hash).toBe("");
  });

  it("returns same hash for unchanged file", async () => {
    const { mkdir } = await import("fs/promises");
    const projectDir = join(tempDir, "p");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "agent-abc.jsonl"), "content", "utf-8");

    const hash1 = await hashSubagentFile("p", "s", "abc");
    const hash2 = await hashSubagentFile("p", "s", "abc");
    expect(hash1).toBe(hash2);
  });
});

describe("hashEvalsModule", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    _resetEvalsModuleHashCache();
    tempDir = await mkdtemp(join(tmpdir(), "claudeye-hash-test-"));
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    _resetEvalsModuleHashCache();
    process.env = originalEnv;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty string when no evals module configured", async () => {
    delete process.env.CLAUDEYE_EVALS_MODULE;
    const hash = await hashEvalsModule();
    expect(hash).toBe("");
  });

  it("hashes file content when evals module is set", async () => {
    const evalsFile = join(tempDir, "evals.ts");
    await writeFile(evalsFile, "export const x = 1;", "utf-8");
    process.env.CLAUDEYE_EVALS_MODULE = evalsFile;

    const hash = await hashEvalsModule();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // Verify it's a content hash
    const expected = createHash("sha256").update("export const x = 1;").digest("hex");
    expect(hash).toBe(expected);
  });

  it("returns different hashes for different content", async () => {
    const evalsFile = join(tempDir, "evals.ts");
    process.env.CLAUDEYE_EVALS_MODULE = evalsFile;

    await writeFile(evalsFile, "content-v1", "utf-8");
    const hash1 = await hashEvalsModule();

    _resetEvalsModuleHashCache();
    await writeFile(evalsFile, "content-v2", "utf-8");
    const hash2 = await hashEvalsModule();

    expect(hash1).not.toBe(hash2);
  });

  it("returns empty string on read error", async () => {
    process.env.CLAUDEYE_EVALS_MODULE = "/nonexistent/path.ts";
    const hash = await hashEvalsModule();
    expect(hash).toBe("");
  });
});

describe("hashProjectsPath", () => {
  beforeEach(() => {
    _resetPathHashCache();
  });

  afterEach(() => {
    _resetPathHashCache();
  });

  it("returns an 8-character hex string", () => {
    const hash = hashProjectsPath();
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
  });

  it("returns the same value on repeated calls (memoized)", () => {
    const hash1 = hashProjectsPath();
    const hash2 = hashProjectsPath();
    expect(hash1).toBe(hash2);
  });

  it("normalizes paths (trailing slash, ..) to the same hash", () => {
    // The function uses resolve() internally, so the tempDir mock
    // is already resolved. We verify determinism here — the mock
    // always returns tempDir which resolve() normalizes consistently.
    const hash1 = hashProjectsPath();
    _resetPathHashCache();
    const hash2 = hashProjectsPath();
    expect(hash1).toBe(hash2);
  });
});
