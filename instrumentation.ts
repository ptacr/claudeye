/**
 * Next.js instrumentation hook — runs once on server startup.
 * Starts the background eval queue processor when CLAUDEYE_QUEUE_INTERVAL is set.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const intervalStr = process.env.CLAUDEYE_QUEUE_INTERVAL;
  if (!intervalStr) return;

  const intervalSec = parseInt(intervalStr, 10);
  if (isNaN(intervalSec) || intervalSec <= 0) return;

  const { startBackgroundProcessor } = await import("./lib/eval-queue");
  startBackgroundProcessor(intervalSec);
}
