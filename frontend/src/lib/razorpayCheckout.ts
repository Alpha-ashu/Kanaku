/**
 * Razorpay Checkout, loaded on demand.
 *
 * The page only opens the provider's window and relays its signed result to the
 * server; whether the payment happened is decided there (signature + a call to
 * Razorpay's API). Only the public key id comes from our API — no secret is
 * ever present in the browser.
 */

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void) => void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<void> | null = null;

export const loadRazorpay = (): Promise<void> => {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        reject(new Error('Could not load the payment window. Please check your connection.'));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
};

export type CheckoutOutcome =
  | { status: 'success'; payload: Record<string, string> }
  | { status: 'dismissed'; lastFailure?: string };

/**
 * Opens checkout and resolves when the customer finishes or closes it. A failed
 * attempt does not resolve: Razorpay keeps the window open for a retry, so it
 * is remembered and reported if the customer then closes the window.
 */
export const openRazorpayCheckout = async (checkout: Record<string, unknown>): Promise<CheckoutOutcome> => {
  await loadRazorpay();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('The payment window is unavailable.');

  return new Promise<CheckoutOutcome>((resolve) => {
    let lastFailure: string | undefined;
    const instance = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name ?? 'KANAKU',
      description: checkout.description,
      prefill: checkout.prefill,
      theme: { color: '#7B4CFF' },
      handler: (response: Record<string, string>) => resolve({ status: 'success', payload: response }),
      modal: { ondismiss: () => resolve({ status: 'dismissed', lastFailure }) },
    });
    instance.on('payment.failed', (response) => {
      lastFailure = response?.error?.description || 'Payment failed';
    });
    instance.open();
  });
};
