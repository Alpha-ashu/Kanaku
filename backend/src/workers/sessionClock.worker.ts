/**
 * The session and payment clock.
 *
 * Every minute (SESSION_CLOCK_INTERVAL_MS):
 *   - charges accepted sessions from the payment deadline (T−5 min) onward,
 *     when the client has enough coins; tells them when they do not;
 *   - expires sessions still unpaid when their window closes (nothing charged)
 *     and requests nobody answered before their start;
 *   - completes sessions left running past their end and releases the
 *     advisor's earnings; refunds paid sessions that were never started;
 *   - asks the payment providers about purchase orders we have not heard back
 *     about (lost webhooks, closed tabs, sleeping instances).
 *
 * Not the only line of defence: the same settlement runs lazily whenever a
 * booking is opened or a session joined, because on Render's free plan the
 * instance may be asleep at 9:55. Every step is idempotent, so a missed tick
 * or two overlapping instances cannot double-charge or double-refund.
 */
import { logger } from '../config/logger';
import { runSessionClock } from '../features/wallet/sessionPayment.service';
import { reconcileStaleOrders } from '../features/wallet/coinPurchase.service';

const INTERVAL_MS = Math.max(15_000, Number(process.env.SESSION_CLOCK_INTERVAL_MS) || 60_000);
const STARTUP_DELAY_MS = 20_000;

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;

export async function runSessionClockTick(now = new Date()) {
  if (running) return null; // a slow tick is still going; skip rather than overlap
  running = true;
  try {
    const sessions = await runSessionClock(now);
    const purchases = await reconcileStaleOrders(now);
    const touched = sessions.charged + sessions.expired + sessions.autoCompleted + sessions.refundedUnstarted + purchases.settled;
    if (touched > 0 || sessions.insufficient > 0) {
      logger.info('[session-clock] tick', { ...sessions, purchasesChecked: purchases.checked, purchasesSettled: purchases.settled });
    }
    return { sessions, purchases };
  } catch (error) {
    logger.error('[session-clock] tick failed', { error });
    return null;
  } finally {
    running = false;
  }
}

export function startSessionClockWorker() {
  if (process.env.SESSION_CLOCK_ENABLED === 'false') {
    logger.info('[session-clock] disabled (SESSION_CLOCK_ENABLED=false)');
    return;
  }
  if (timer) return;
  // Catch up shortly after boot: a sleeping instance misses ticks.
  startupTimer = setTimeout(() => void runSessionClockTick(), STARTUP_DELAY_MS);
  startupTimer.unref?.();
  timer = setInterval(() => void runSessionClockTick(), INTERVAL_MS);
  timer.unref?.();
  logger.info('[session-clock] started', { intervalMs: INTERVAL_MS });
}

export function stopSessionClockWorker() {
  if (startupTimer) clearTimeout(startupTimer);
  if (timer) clearInterval(timer);
  startupTimer = null;
  timer = null;
}
