/**
 * The coin purchase a redirect gateway (PhonePe, Paytm) is in the middle of.
 *
 * The browser leaves the app for the provider's page and comes back to
 * /wallet?purchase=<order id>. The id is also kept in sessionStorage (same tab,
 * survives the round trip) in case routing drops the query string on the way
 * in. Nothing here is proof of payment: the wallet page only uses the id to ask
 * the server what happened to the order.
 */
const KEY = 'kanaku_pending_purchase';
const MAX_AGE_MS = 2 * 60 * 60_000;
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rememberPendingPurchase(orderId: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ orderId, at: Date.now() }));
  } catch {
    /* storage unavailable — the return URL still carries the id */
  }
}

/** The order to check after coming back from a gateway, once; clears both sources. */
export function takePendingPurchase(): string | null {
  let fromUrl: string | null = null;
  try {
    const url = new URL(window.location.href);
    fromUrl = url.searchParams.get('purchase');
    if (fromUrl !== null) {
      url.searchParams.delete('purchase');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    /* ignore */
  }

  let fromStorage: string | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { orderId?: unknown; at?: unknown };
      if (typeof parsed.orderId === 'string' && typeof parsed.at === 'number' && Date.now() - parsed.at < MAX_AGE_MS) {
        fromStorage = parsed.orderId;
      }
    }
  } catch {
    /* ignore */
  }

  const candidate = fromUrl || fromStorage;
  return candidate && ORDER_ID.test(candidate) ? candidate : null;
}

/** Leave for the provider's payment page (a separate function so tests can stand in for navigation). */
export function openPaymentPage(url: string): void {
  window.location.assign(url);
}
