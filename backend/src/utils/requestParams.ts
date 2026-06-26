/**
 * Safe extraction of Express request parameters (CWE-843 — type confusion through
 * parameter tampering).
 *
 * `req.query` / `req.body` values are typed as `string` by most call sites, but at
 * RUNTIME a caller controls their shape: `?x=a` yields a string, while
 * `?x[]=a&x[]=b` yields an array and `?x[y]=z` yields a nested object. Casting
 * `as string` only silences the compiler — the value is still an array/object, so
 * `value.includes(...)`, `value.slice(...)`, `value.toLowerCase(...)` etc. silently
 * change meaning (Array.prototype vs String.prototype) or throw. These helpers
 * coerce to a guaranteed primitive `string` so downstream string operations are
 * always well-defined.
 */

/**
 * Coerce an untrusted request value to a plain string.
 * - a string is returned as-is
 * - an array (repeated param) yields its first string element
 * - anything else (object, number, undefined, null) yields `fallback`
 */
export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : fallback;
  }
  return fallback;
}
