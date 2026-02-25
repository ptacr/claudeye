import type { SessionEvalResult } from "@/app/actions/process-session-eval";

/**
 * Client-side helper that routes eval processing through the queue-item API
 * route. Uses fetch (not a server action) so calls are genuinely concurrent —
 * Next.js serialises server-action calls from client components, which would
 * defeat the bounded-concurrency queue on the server.
 */
export async function queueAndProcessEval(
  projectName: string,
  sessionId: string,
  evalName: string,
  forceRefresh: boolean = false,
  subagent?: { agentId: string; subagentType?: string; subagentDescription?: string },
): Promise<SessionEvalResult> {
  let res: Response;
  try {
    res = await fetch("/api/queue-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "eval",
        projectName,
        sessionId,
        itemName: evalName,
        forceRefresh,
        ...(subagent && {
          agentId: subagent.agentId,
          subagentType: subagent.subagentType,
          subagentDescription: subagent.subagentDescription,
        }),
      }),
    });
  } catch (err) {
    return { ok: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (res.status === 202) {
    return { ok: false, error: "__queued__" };
  }

  if (!res.ok) {
    return { ok: false, error: `Queue request failed: ${res.status}` };
  }

  return res.json();
}
