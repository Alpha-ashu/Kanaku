import { useEffect, useState } from 'react';

/**
 * The server's clock, as seen from this device.
 *
 * Payment deadlines and session windows are decided on the server. The client
 * only renders countdowns to them, and must not use the device clock for that
 * alone: a phone set five minutes fast would show "Join" while the server still
 * says no. Every API response that carries `serverNow` updates the offset; the
 * countdown then ticks locally from device time + offset.
 */

let offsetMs = 0;

/** Record the server's time from a response. Ignores anything unparseable. */
export const syncServerClock = (serverNowIso: string | null | undefined) => {
  if (!serverNowIso) return;
  const serverMs = Date.parse(serverNowIso);
  if (Number.isFinite(serverMs)) offsetMs = serverMs - Date.now();
};

export const serverNow = () => Date.now() + offsetMs;

/** Re-renders every `intervalMs` with the current server time (ms). */
export function useServerNow(intervalMs = 1000): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** "07:32", "1h 05m", "2d 3h" — never negative. */
export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  return `${pad(minutes)}:${pad(seconds)}`;
};
