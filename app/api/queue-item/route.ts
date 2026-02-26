import { NextResponse } from "next/server";
import { queuePerItem, Priority } from "@/lib/eval-queue";
import { processSessionEval } from "@/app/actions/process-session-eval";
import { processSessionEnrichment } from "@/app/actions/process-session-enrichment";
import { processSubagentEval } from "@/app/actions/process-subagent-eval";
import { processSubagentEnrichment } from "@/app/actions/process-subagent-enrichment";
import { processSessionAction } from "@/app/actions/process-session-action";
import { processSubagentAction } from "@/app/actions/process-subagent-action";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      type, projectName, sessionId, itemName, forceRefresh,
      agentId, subagentType, subagentDescription,
    } = body;

    if (!type || !projectName || !sessionId || !itemName) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const queueSessionId = agentId ? `${sessionId}/agent-${agentId}` : sessionId;

    const TIMEOUT_MS = 10_000;

    if (type === "eval") {
      const task = agentId
        ? () => processSubagentEval(projectName, sessionId, agentId, itemName, forceRefresh ?? false, subagentType, subagentDescription)
        : () => processSessionEval(projectName, sessionId, itemName, forceRefresh ?? false);

      const promise = queuePerItem("eval", projectName, queueSessionId, itemName, task, {
        priority: Priority.HIGH,
        forceRefresh,
      });
      const timeout = new Promise<"timeout">(r => setTimeout(() => r("timeout"), TIMEOUT_MS));
      const raceResult = await Promise.race([promise, timeout]);

      if (raceResult === "timeout") {
        return NextResponse.json(
          { ok: true, queued: true, key: `eval:${projectName}/${queueSessionId}/${itemName}` },
          { status: 202 },
        );
      }
      return NextResponse.json(raceResult);
    }

    if (type === "enrichment") {
      const task = agentId
        ? () => processSubagentEnrichment(projectName, sessionId, agentId, itemName, forceRefresh ?? false, subagentType, subagentDescription)
        : () => processSessionEnrichment(projectName, sessionId, itemName, forceRefresh ?? false);

      const promise = queuePerItem("enrichment", projectName, queueSessionId, itemName, task, {
        priority: Priority.HIGH,
        forceRefresh,
      });
      const timeout = new Promise<"timeout">(r => setTimeout(() => r("timeout"), TIMEOUT_MS));
      const raceResult = await Promise.race([promise, timeout]);

      if (raceResult === "timeout") {
        return NextResponse.json(
          { ok: true, queued: true, key: `enrichment:${projectName}/${queueSessionId}/${itemName}` },
          { status: 202 },
        );
      }
      return NextResponse.json(raceResult);
    }

    if (type === "action") {
      const task = agentId
        ? () => processSubagentAction(projectName, sessionId, agentId, itemName, forceRefresh ?? false, subagentType, subagentDescription)
        : () => processSessionAction(projectName, sessionId, itemName, forceRefresh ?? false);

      const promise = queuePerItem("action", projectName, queueSessionId, itemName, task, {
        priority: Priority.HIGH,
        forceRefresh,
      });
      const timeout = new Promise<"timeout">(r => setTimeout(() => r("timeout"), TIMEOUT_MS));
      const raceResult = await Promise.race([promise, timeout]);

      if (raceResult === "timeout") {
        return NextResponse.json(
          { ok: true, queued: true, key: `action:${projectName}/${queueSessionId}/${itemName}` },
          { status: 202 },
        );
      }
      return NextResponse.json(raceResult);
    }

    return NextResponse.json(
      { ok: false, error: `Invalid type: ${type}` },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
