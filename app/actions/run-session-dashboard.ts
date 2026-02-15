"use server";

import { runEvals, type EvalActionResult } from "./run-evals";
import { runEnrichments, type EnrichActionResult } from "./run-enrichments";
import { runSubagentEvals, type SubagentEvalActionResult } from "./run-subagent-evals";
import { runSubagentEnrichments, type SubagentEnrichActionResult } from "./run-subagent-enrichments";

export interface SubagentInput {
  id: string;
  type: string;
  description: string;
}

export interface SubagentDashboardResult {
  agentId: string;
  evals: SubagentEvalActionResult;
  enrichments: SubagentEnrichActionResult;
}

export interface DashboardResult {
  sessionEvals: EvalActionResult;
  sessionEnrichments: EnrichActionResult;
  subagents: SubagentDashboardResult[];
}

/**
 * Batched server action that runs all evals and enrichments (session + subagents)
 * in parallel via a single server round-trip.
 */
export async function runSessionDashboard(
  projectName: string,
  sessionId: string,
  subagents: SubagentInput[],
  forceRefresh: boolean = false,
): Promise<DashboardResult> {
  const [sessionEvals, sessionEnrichments, ...subagentResults] = await Promise.all([
    runEvals(projectName, sessionId, forceRefresh),
    runEnrichments(projectName, sessionId, forceRefresh),
    ...subagents.map(async (sa): Promise<SubagentDashboardResult> => {
      const [evals, enrichments] = await Promise.all([
        runSubagentEvals(projectName, sessionId, sa.id, sa.type, sa.description, forceRefresh),
        runSubagentEnrichments(projectName, sessionId, sa.id, sa.type, sa.description, forceRefresh),
      ]);
      return { agentId: sa.id, evals, enrichments };
    }),
  ]);

  return { sessionEvals, sessionEnrichments, subagents: subagentResults };
}
