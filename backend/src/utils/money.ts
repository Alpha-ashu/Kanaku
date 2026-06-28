/**
 * Money helpers — Decimal-safe arithmetic for monetary values.
 *
 * Why this exists:
 *   Prisma returns monetary columns (Decimal(18,2)) as `Prisma.Decimal`
 *   instances. The previous code paths converted them to JavaScript `number`
 *   via `Number(x)` and then re-rounded with `Math.round(x * 100) / 100`.
 *   That is a fintech anti-pattern:
 *     1. `Number()` loses precision for values above ~9 quadrillion.
 *     2. Repeated round-trips accumulate floating-point error
 *        (e.g. 0.1 + 0.2 !== 0.3 in IEEE-754).
 *     3. Multiplication by 100 then division by 100 silently truncates
 *        sub-cent precision that AA imports may carry.
 *
 * Strategy:
 *   - Keep all amounts as `Prisma.Decimal` throughout the service layer.
 *   - Use these helpers (`add`, `sub`, `neg`, `eq`, `gt`, `isPositive`)
 *     instead of native arithmetic.
 *   - At the controller boundary, serialize Decimal -> string with
 *     `serializeMoney()` so JSON does not silently lose precision.
 *   - Forbid `Number(amount)` and `parseFloat(amount)` via review.
 *
 * Tip: When you need to compare a user-supplied number string to a
 * stored amount, always run it through `parseMoney(input)` first — never
 * `Number(input)`.
 */

import { Prisma } from '../db/prisma-client';

const { Decimal } = Prisma;

export type MoneyInput = Prisma.Decimal | string | number | null | undefined;

/**
 * Normalize anything that could plausibly represent money into a
 * `Prisma.Decimal`. Throws on values that cannot be safely coerced.
 *
 * Acceptable inputs:
 *   - `Prisma.Decimal` (returned as-is)
 *   - decimal string ("123.45") — parsed losslessly by Decimal.js
 *   - integer or finite number — accepted but logged in dev so we can
 *     audit callers that should be passing strings.
 */
export const parseMoney = (input: MoneyInput): Prisma.Decimal => {
  if (input == null) return new Decimal(0);
  if (input instanceof Decimal) return input;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed === '') return new Decimal(0);
    try {
      return new Decimal(trimmed);
    } catch {
      throw new Error(`parseMoney: cannot parse "${input}" as a decimal`);
    }
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new Error(`parseMoney: non-finite number "${input}"`);
    }
    return new Decimal(input);
  }

  throw new Error(`parseMoney: unsupported input type ${typeof input}`);
};

export const ZERO = new Decimal(0);

export const add = (a: MoneyInput, b: MoneyInput): Prisma.Decimal =>
  parseMoney(a).plus(parseMoney(b));

export const sub = (a: MoneyInput, b: MoneyInput): Prisma.Decimal =>
  parseMoney(a).minus(parseMoney(b));

export const neg = (a: MoneyInput): Prisma.Decimal => parseMoney(a).negated();

export const isPositive = (a: MoneyInput): boolean => parseMoney(a).gt(0);
export const isZero = (a: MoneyInput): boolean => parseMoney(a).isZero();
export const isNegative = (a: MoneyInput): boolean => parseMoney(a).lt(0);

export const eq = (a: MoneyInput, b: MoneyInput): boolean =>
  parseMoney(a).eq(parseMoney(b));

export const gt = (a: MoneyInput, b: MoneyInput): boolean =>
  parseMoney(a).gt(parseMoney(b));

export const gte = (a: MoneyInput, b: MoneyInput): boolean =>
  parseMoney(a).gte(parseMoney(b));

/**
 * Round to the configured scale (default: 2 decimal places — INR / USD).
 * Uses banker's rounding (`ROUND_HALF_EVEN`) so a million small rounds
 * do not introduce a systemic bias.
 */
export const roundMoney = (a: MoneyInput, scale = 2): Prisma.Decimal =>
  parseMoney(a).toDecimalPlaces(scale, Decimal.ROUND_HALF_EVEN);

/**
 * Wire-format serializer. Prefers string output so JSON does not silently
 * coerce to IEEE-754 floats. Frontends and analytics tools must parse
 * back to a Decimal-aware library (e.g. `decimal.js`, `big.js`).
 */
export const serializeMoney = (a: MoneyInput): string =>
  roundMoney(a).toFixed(2);

/**
 * Sum a list — short-circuits on empty input. Equivalent to
 * `list.reduce(add, ZERO)` but with explicit Decimal accumulator so the
 * accumulator type does not drift back to `number`.
 */
export const sum = (values: MoneyInput[]): Prisma.Decimal => {
  let acc = new Decimal(0);
  for (const v of values) acc = acc.plus(parseMoney(v));
  return acc;
};

/**
 * Account types permitted to carry a negative balance (credit cards, overdraft,
 * loan accounts). Standard bank / cash / wallet / savings accounts must never go
 * below zero. None of these types exist in the product yet — this future-proofs
 * the exemption so they can be added without touching the guard.
 */
export const NEGATIVE_BALANCE_ALLOWED_TYPES = new Set(['credit', 'credit_card', 'overdraft', 'loan']);

/**
 * The no-overdraw rule. Returns true when applying `delta` to an account that
 * ends at `balanceAfter` constitutes a forbidden overdraw — i.e. a debit
 * (negative delta) that drives a STANDARD account's balance below zero. Income
 * and other credits (delta >= 0) never overdraw; credit / overdraft / loan
 * account types are exempt and may carry a negative balance.
 */
export const isOverdraw = (
  balanceAfter: MoneyInput,
  delta: MoneyInput,
  accountType: string | null | undefined,
): boolean => {
  if (NEGATIVE_BALANCE_ALLOWED_TYPES.has(String(accountType ?? '').toLowerCase())) return false;
  return isNegative(delta) && isNegative(balanceAfter);
};

