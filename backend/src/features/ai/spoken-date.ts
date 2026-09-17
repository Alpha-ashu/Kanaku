/**
 * Spoken dates → YYYY-MM-DD, for the offline parsers (KAI and chat) that run
 * when no LLM is available. Future-leaning: a date said without a year, or a
 * bare day of the month ("on the 25th"), means its next occurrence.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const iso = (year: number, monthIdx: number, day: number): string =>
  new Date(Date.UTC(year, monthIdx, day)).toISOString().slice(0, 10);

/** "December 31st 2026", "31 December", "tomorrow", "next monday", "on the 25th" → YYYY-MM-DD */
export function parseSpokenDate(text: string, today = new Date()): string | undefined {
  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) return today.toISOString().slice(0, 10);
  if (/\b(?:day after tomorrow)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return isoMatch[0];

  const monthRe = MONTHS.join('|');
  const m1 = lower.match(new RegExp(`\\b(${monthRe})\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`));
  const m2 = lower.match(new RegExp(`\\b(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthRe})(?:,?\\s+(\\d{4}))?`));
  const hit = m1 ? { month: m1[1], day: m1[2], year: m1[3] } : m2 ? { month: m2[2], day: m2[1], year: m2[3] } : null;
  if (hit) {
    const monthIdx = MONTHS.indexOf(hit.month);
    const day = parseInt(hit.day, 10);
    if (monthIdx < 0 || day < 1 || day > 31) return undefined;
    let year = hit.year ? parseInt(hit.year, 10) : today.getFullYear();
    const candidate = new Date(year, monthIdx, day);
    if (!hit.year && candidate < today) year += 1;
    return iso(year, monthIdx, day);
  }

  const weekday = lower.match(new RegExp(`\\b(?:next|this|on|by)\\s+(${WEEKDAYS.join('|')})\\b`));
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const d = new Date(today);
    const ahead = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + ahead);
    return d.toISOString().slice(0, 10);
  }

  // "on the 25th", "by 1st", "before the 5th" — the next time that day comes round.
  const dayOfMonth = lower.match(/\b(?:on|by|before|due)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);
  if (dayOfMonth) {
    const day = parseInt(dayOfMonth[1], 10);
    if (day < 1 || day > 31) return undefined;
    let year = today.getFullYear();
    let monthIdx = today.getMonth();
    if (day < today.getDate()) {
      monthIdx += 1;
      if (monthIdx > 11) { monthIdx = 0; year += 1; }
    }
    const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    return iso(year, monthIdx, Math.min(day, lastDay));
  }
  return undefined;
}
