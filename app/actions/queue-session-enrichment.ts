import type { SessionEnrichmentResult } from "@/app/actions/process-session-enrichment";

/**
 * Client-side helper that routes enrichment processing through the queue-item
 * API route. Uses fetch (not a server action) so calls are genuinely concurrent.
 */
export async function queueAndProcessEnrichment(
  projectName: string,
  sessionId: string,
  enricherName: string,
  forceRefresh: boolean = false,
  subagent?: { agentId: string; subagentType?: string; subagentDescription?: string },
): Promise<SessionEnrichmentResult> {
  let res: Response;
  try {
    res = await fetch("/api/queue-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "enrichment",
        projectName,
        sessionId,
        itemName: enricherName,
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
