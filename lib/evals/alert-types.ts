import type { EvalRunSummary } from "./types";
import type { EnrichRunSummary } from "./enrich-types";

export interface AlertContext {
  projectName: string;
  sessionId: string;
  evalSummary?: EvalRunSummary;
  enrichSummary?: EnrichRunSummary;
}

export type AlertFunction = (context: AlertContext) => void | Promise<void>;

export interface RegisteredAlert {
  name: string;
  fn: AlertFunction;
}
