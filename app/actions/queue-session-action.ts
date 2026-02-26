import type { SessionActionResult } from "@/app/actions/process-session-action";

/**
 * Client-side helper that routes action processing through the queue-item
 * API route. Uses fetch (not a server action) so calls are genuinely concurrent.
 */
export async function queueAndProcessAction(
  projectName: string,
  sessionId: string,
  actionName: string,
  forceRefresh: boolean = false,
  subagent?: { agentId: string; subagentType?: string; subagentDescription?: string },
): Promise<SessionActionResult> {
  let res: Response;
  try {
    res = await fetch("/api/queue-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "action",
        projectName,
        sessionId,
        itemName: actionName,
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
