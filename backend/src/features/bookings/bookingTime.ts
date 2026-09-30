/**
 * When a booking actually happens, as an instant.
 *
 * Bookings store the client's wall-clock choice (`proposedDate` + `proposedTime`,
 * no offset). `proposedDate` was built with `new Date("YYYY-MM-DDTHH:mm")`, which
 * the server parses in ITS zone (UTC on Render) — so it is the wall-clock time
 * labelled UTC, 5h30m away from the moment an Indian user meant. That was
 * harmless while nothing depended on the exact instant; the payment deadline
 * and session unlock do, and they must use server time, never the device clock.
 *
 * New bookings store `startsAt`/`endsAt` computed here from the wall-clock
 * values and the client's IANA time zone. Rows created before 2026-09-30 have
 * none, and are resolved in Asia/Kolkata (the app's market) on read.
 */

export const DEFAULT_BOOKING_TIME_ZONE = process.env.BOOKING_DEFAULT_TIME_ZONE || 'Asia/Kolkata';

export const isValidTimeZone = (timeZone: unknown): timeZone is string => {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
const zoneOffsetMs = (timeZone: string, instant: Date): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/** The instant at which the wall-clock `date` + `time` occurs in `timeZone`. Null when unparseable. */
export const zonedWallClockToInstant = (date: string, time: string, timeZone: string): Date | null => {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_BOOKING_TIME_ZONE;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset across a DST boundary.
  let instant = wall - zoneOffsetMs(zone, new Date(wall));
  const corrected = wall - zoneOffsetMs(zone, new Date(instant));
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
};

export interface BookingTimes {
  startsAt: Date;
  endsAt: Date;
}

/** Start/end instants for a stored booking row, including legacy rows without startsAt. */
export const resolveBookingTimes = (booking: {
  startsAt?: Date | null;
  endsAt?: Date | null;
  proposedDate: Date;
  proposedTime: string;
  duration: number;
  timeZone?: string | null;
}): BookingTimes | null => {
  let startsAt = booking.startsAt ?? null;
  if (!startsAt) {
    // Legacy: proposedDate's UTC calendar date is the date the client chose.
    const date = booking.proposedDate.toISOString().slice(0, 10);
    startsAt = zonedWallClockToInstant(date, booking.proposedTime, booking.timeZone || DEFAULT_BOOKING_TIME_ZONE);
  }
  if (!startsAt) return null;
  const endsAt = booking.endsAt ?? new Date(startsAt.getTime() + Math.max(1, booking.duration) * 60_000);
  return { startsAt, endsAt };
};
