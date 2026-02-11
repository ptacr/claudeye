import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, relative } from "path";
import { getClaudeProjectsPath } from "@/lib/paths";

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PATH_TRAVERSAL_RE = /(^|[\\/])\.\.($|[\\/])/;

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ project: string; session: string }> }
): Promise<NextResponse> {
  const { project, session } = await params;

  if (!UUID_RE.test(session)) {
    return jsonError("Invalid session ID", 400);
  }

  if (!project || PATH_TRAVERSAL_RE.test(project)) {
    return jsonError("Invalid project name", 400);
  }

  const projectsPath = getClaudeProjectsPath();
  const filePath = join(projectsPath, project, `${session}.jsonl`);

  if (relative(projectsPath, filePath).startsWith("..")) {
    return jsonError("Path traversal detected", 400);
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="${session}.jsonl"`,
      },
    });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return jsonError("Session log not found", 404);
    }
    return jsonError("Failed to read session log", 500);
  }
}
