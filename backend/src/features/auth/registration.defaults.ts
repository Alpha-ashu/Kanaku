/**
 * Registration defaults & helpers (Registration remediation — Phase 1).
 *
 * Pure, side-effect-free helpers used by AuthService.register to seed a new
 * user's baseline data inside the registration transaction:
 *   - phone normalization (so the new profiles.phone unique index is meaningful)
 *   - currency/locale derivation from the signup country (the calling code is
 *     embedded in the submitted mobile, e.g. "+91 98765 43210")
 *   - default UserSettings + notification preferences
 *   - a curated default personal-finance category set
 */

export interface CountryDefaults {
  currency: string;
  /** Stored in UserSettings.language (BCP-47 locale, e.g. "en-IN"). */
  language: string;
  timezone: string;
}

/** Conservative global fallback when the country can't be determined. */
export const FALLBACK_DEFAULTS: CountryDefaults = { currency: 'USD', language: 'en', timezone: 'UTC' };

/**
 * Calling-code → locale defaults. Keyed by the E.164 country calling code that
 * prefixes the submitted phone number. Extend as new signup countries are added.
 */
export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  '+91': { currency: 'INR', language: 'en-IN', timezone: 'Asia/Kolkata' },
  '+1': { currency: 'USD', language: 'en-US', timezone: 'America/New_York' },
  '+44': { currency: 'GBP', language: 'en-GB', timezone: 'Europe/London' },
  '+971': { currency: 'AED', language: 'en-AE', timezone: 'Asia/Dubai' },
  '+65': { currency: 'SGD', language: 'en-SG', timezone: 'Asia/Singapore' },
  '+61': { currency: 'AUD', language: 'en-AU', timezone: 'Australia/Sydney' },
  '+60': { currency: 'MYR', language: 'en-MY', timezone: 'Asia/Kuala_Lumpur' },
};

/**
 * Normalize a user-entered phone to a canonical form ("+" + digits) so the
 * profiles.phone unique index and dup-check compare like-for-like. Returns null
 * for empty/garbage input. Defends against array/object tampering by stringifying.
 */
export function normalizePhone(raw?: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return (hasPlus ? '+' : '') + digits;
}

/** Derive currency/locale/timezone from a (normalized or raw) phone's calling code. */
export function deriveLocaleAndCurrency(phone?: string | null): CountryDefaults {
  const normalized = normalizePhone(phone);
  if (normalized && normalized.startsWith('+')) {
    // Longest-prefix match so "+1" doesn't shadow "+91"/"+971".
    const codes = Object.keys(COUNTRY_DEFAULTS).sort((a, b) => b.length - a.length);
    for (const code of codes) {
      if (normalized.startsWith(code)) return COUNTRY_DEFAULTS[code];
    }
  }
  return FALLBACK_DEFAULTS;
}

/** Default in-app notification preferences, stored inside UserSettings.settings JSON. */
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  email: true,
  push: true,
  budgetAlerts: true,
  goalReminders: true,
  transactionAlerts: true,
  weeklySummary: true,
} as const;

export interface DefaultCategorySeed {
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon: string;
}

/**
 * Curated default personal-finance categories seeded at registration (approved
 * list). `icon` values are lucide-react names to match the frontend icon set.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategorySeed[] = [
  // Income
  { name: 'Salary', type: 'income', color: '#16a34a', icon: 'Wallet' },
  { name: 'Business', type: 'income', color: '#0891b2', icon: 'Briefcase' },
  { name: 'Investment', type: 'income', color: '#7c3aed', icon: 'TrendingUp' },
  { name: 'Bonus', type: 'income', color: '#ca8a04', icon: 'Gift' },
  { name: 'Other Income', type: 'income', color: '#6b7280', icon: 'PlusCircle' },
  // Expense
  { name: 'Food', type: 'expense', color: '#ef4444', icon: 'UtensilsCrossed' },
  { name: 'Transport', type: 'expense', color: '#f59e0b', icon: 'Car' },
  { name: 'Shopping', type: 'expense', color: '#ec4899', icon: 'ShoppingBag' },
  { name: 'Entertainment', type: 'expense', color: '#8b5cf6', icon: 'Clapperboard' },
  { name: 'Healthcare', type: 'expense', color: '#14b8a6', icon: 'HeartPulse' },
  { name: 'Education', type: 'expense', color: '#3b82f6', icon: 'GraduationCap' },
  { name: 'Bills', type: 'expense', color: '#f97316', icon: 'Receipt' },
  { name: 'Travel', type: 'expense', color: '#06b6d4', icon: 'Plane' },
  { name: 'Family', type: 'expense', color: '#d946ef', icon: 'Users' },
  { name: 'Rent', type: 'expense', color: '#64748b', icon: 'Home' },
  { name: 'Utilities', type: 'expense', color: '#eab308', icon: 'Zap' },
  { name: 'Insurance', type: 'expense', color: '#0ea5e9', icon: 'Shield' },
  { name: 'Savings', type: 'expense', color: '#22c55e', icon: 'PiggyBank' },
  { name: 'Miscellaneous', type: 'expense', color: '#9ca3af', icon: 'MoreHorizontal' },
];
