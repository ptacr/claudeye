/**
 * Fires all registered alert callbacks with the given context.
 *
 * Each callback is individually try/caught — errors are logged to
 * console and never propagated. Uses Promise.allSettled so one
 * failing alert never blocks the rest.
 */
import { hasAlerts, getRegisteredAlerts } from "./alert-registry";
import type { AlertContext } from "./alert-types";

export async function fireAlerts(context: AlertContext): Promise<void> {
  if (!hasAlerts()) return;

  const alerts = getRegisteredAlerts();

  await Promise.allSettled(
    alerts.map(async (alert) => {
      try {
        await alert.fn(context);
      } catch (err) {
        console.error(
          `[alert] Error in alert "${alert.name}":`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
}
