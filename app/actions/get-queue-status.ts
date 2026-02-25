"use server";

import { getQueueStatus } from "@/lib/eval-queue";
import type { ProcessingEntry, CompletedEntry, QueueEntry } from "@/lib/eval-queue";

export interface QueueStatusPayload {
  pending: Array<QueueEntry & { priorityLabel: string }>;
  processing: ProcessingEntry[];
  completed: CompletedEntry[];
  scannedAt: number;
  backgroundRunning: boolean;
  recentErrors: Array<{ key: string; error: string; at: number }>;
}

export async function getQueueStatusAction(): Promise<QueueStatusPayload> {
  return getQueueStatus();
}
