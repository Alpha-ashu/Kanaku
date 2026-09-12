const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (value: Date) => !Number.isNaN(value.getTime());

export const parseDateInputValue = (value?: string | null): Date | null => {
  if (!value) return null;
  if (!DATE_ONLY_PATTERN.test(value)) {
    const parsed = new Date(value);
    return isValidDate(parsed) ? parsed : null;
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return isValidDate(parsed) ? parsed : null;
};

const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Stamp the clock time onto a date-only choice for today.
 *
 * A `<input type="date">` yields local midnight, so everything entered today
 * shares one timestamp and lists can't tell which came first. Entries for today
 * get the current time; a deliberately chosen past/future day keeps midnight and
 * relies on the createdAt tie-break instead of pretending to know the hour.
 */
export const withEntryTime = (value?: Date | string | null, now: Date = new Date()): Date => {
  const parsed = coerceDate(value) ?? now;
  if (!isSameLocalDay(parsed, now)) return parsed;
  const stamped = new Date(parsed);
  stamped.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return stamped;
};

/** Newest first: by transaction date, then by when the row was actually created. */
export const compareByRecency = (
  a: { date?: Date | string | null; createdAt?: Date | string | null; id?: number },
  b: { date?: Date | string | null; createdAt?: Date | string | null; id?: number },
): number => {
  const byDate = (coerceDate(b.date)?.getTime() ?? 0) - (coerceDate(a.date)?.getTime() ?? 0);
  if (byDate !== 0) return byDate;
  const byCreated = (coerceDate(b.createdAt)?.getTime() ?? 0) - (coerceDate(a.createdAt)?.getTime() ?? 0);
  if (byCreated !== 0) return byCreated;
  return (b.id ?? 0) - (a.id ?? 0);
};

export const coerceDate = (value?: Date | string | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    if (!isValidDate(value)) return null;
    const isUtcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0
      && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
    const isLocalMidnight = value.getHours() === 0 && value.getMinutes() === 0
      && value.getSeconds() === 0 && value.getMilliseconds() === 0;
    if (isUtcMidnight && !isLocalMidnight) {
      return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }
    return value;
  }
  if (DATE_ONLY_PATTERN.test(value)) {
    return parseDateInputValue(value);
  }
  const parsed = new Date(value);
  return isValidDate(parsed) ? parsed : null;
};

export const toLocalDate = (value?: Date | string | null): Date | null => {
  const parsed = coerceDate(value);
  if (!parsed) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

export const toLocalDateKey = (value?: Date | string | null): string | null => {
  const parsed = coerceDate(value);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatLocalDate = (
  value: Date | string | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  const parsed = coerceDate(value);
  if (!parsed) return '';
  return parsed.toLocaleDateString(locale, options);
};
