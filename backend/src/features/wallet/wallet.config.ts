/**
 * Business rules for coins, session payments and refunds.
 *
 * Every number here is a product decision, so every one is overridable through
 * the environment rather than buried in a handler. Defaults are the
 * conservative choice: they favour the paying user wherever the rule is a
 * judgement call (refunds, unstarted sessions).
 */

const num = (name: string, fallback: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

export const walletConfig = {
  /** Price of one coin in the currency's minor unit (paise). 100 → 1 coin = ₹1. */
  get coinValueMinor() { return num('SESSION_COIN_VALUE_MINOR', 100, { min: 1 }); },
  /** Payment must be complete this long before the session starts (the "5-minute rule"). */
  get paymentLeadMinutes() { return num('SESSION_PAYMENT_LEAD_MINUTES', 5, { max: 24 * 60 }); },
  /**
   * After the deadline, an unpaid session stays payable this long (so a user who
   * tops up at 9:57 can still attend) before it expires unpaid.
   */
  get paymentGraceMinutes() { return num('SESSION_PAYMENT_GRACE_MINUTES', 10, { max: 24 * 60 }); },
  /** A paid session can be joined from this long before its start. */
  get joinEarlyMinutes() { return num('SESSION_JOIN_EARLY_MINUTES', 5, { max: 60 }); },
  /** ...until this long after its scheduled end. */
  get joinLateMinutes() { return num('SESSION_JOIN_LATE_MINUTES', 15, { max: 24 * 60 }); },
  /** A started session left open is completed automatically this long after its end. */
  get autoCompleteGraceMinutes() { return num('SESSION_AUTO_COMPLETE_GRACE_MINUTES', 30, { max: 7 * 24 * 60 }); },
  /** Client cancellations at least this long before the start are refunded in full. */
  get fullRefundCutoffMinutes() { return num('SESSION_CANCEL_FULL_REFUND_MINUTES', 60, { max: 30 * 24 * 60 }); },
  /** Percentage refunded for a later client cancellation (the rest is the advisor's). */
  get lateCancelRefundPercent() { return num('SESSION_LATE_CANCEL_REFUND_PERCENT', 100, { max: 100 }); },
  /**
   * A paid session that was never started by its end is refunded in full: the
   * platform cannot tell who failed to show, and the advisor is the one who
   * starts it.
   */
  get refundUnstartedSessions() { return process.env.SESSION_REFUND_UNSTARTED !== 'false'; },
  /** A purchase order that is not paid within this window expires. */
  get paymentOrderTtlMinutes() { return num('PAYMENT_ORDER_TTL_MINUTES', 30, { min: 5, max: 24 * 60 }); },
  /** Largest single admin adjustment, as a guard against a typo'd extra zero. */
  get maxAdjustmentCoins() { return num('WALLET_MAX_ADJUSTMENT_COINS', 100_000, { min: 1 }); },
  /**
   * Advisor withdrawals of earned coins. On by default; 'false' stops new
   * requests (requests already made can still be paid, rejected or cancelled).
   */
  get withdrawalsEnabled() { return process.env.WALLET_WITHDRAWALS_ENABLED !== 'false'; },
  /** Smallest withdrawal, in coins (300 coins = ₹300 at the default coin value). */
  get minWithdrawalCoins() { return num('WALLET_MIN_WITHDRAWAL_COINS', 300, { min: 1 }); },
  /** Largest single withdrawal, in coins. */
  get maxWithdrawalCoins() { return num('WALLET_MAX_WITHDRAWAL_COINS', 100_000, { min: 1 }); },
  /**
   * 'on' | 'off' | 'auto'. 'auto' (default) follows the admin panel's `wallet`
   * module: session prices are charged in coins only once an admin has turned
   * the wallet on. Bookings made while it is off stay free (NOT_REQUIRED).
   */
  get sessionPaymentsMode(): 'on' | 'off' | 'auto' {
    const mode = (process.env.SESSION_COIN_PAYMENTS || 'auto').toLowerCase();
    return mode === 'on' || mode === 'off' ? mode : 'auto';
  },
};

/** Whether new bookings are priced in coins (see `sessionPaymentsMode`). */
export const sessionPaymentsEnabled = async (): Promise<boolean> => {
  const mode = walletConfig.sessionPaymentsMode;
  if (mode !== 'auto') return mode === 'on';
  // Imported lazily: featureGate pulls in Prisma, and this module is also used
  // by pure helpers and unit tests.
  const { isModuleExplicitlyEnabled } = await import('../../middleware/featureGate');
  return isModuleExplicitlyEnabled('wallet');
};

/** Coins for a session: the advisor's hourly rate pro-rated to the duration, rounded up. */
export const sessionCoinCost = (hourlyRate: number | null | undefined, durationMinutes: number): number => {
  if (!hourlyRate || hourlyRate <= 0 || !durationMinutes || durationMinutes <= 0) return 0;
  const priceMinor = Math.round(hourlyRate * 100 * durationMinutes / 60);
  return Math.ceil(priceMinor / walletConfig.coinValueMinor);
};

/** The currency price of a session, derived on the server — never taken from the client. */
export const sessionPrice = (hourlyRate: number | null | undefined, durationMinutes: number): number => {
  if (!hourlyRate || hourlyRate <= 0 || !durationMinutes || durationMinutes <= 0) return 0;
  return Math.round(hourlyRate * durationMinutes / 60 * 100) / 100;
};
