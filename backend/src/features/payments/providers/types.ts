/**
 * The one interface the rest of the application uses to take money.
 *
 * Wallet and purchase logic never talks to a gateway directly; it asks the
 * provider registry for an adapter and calls these methods. Adding PhonePe or
 * Paytm means writing one adapter — not threading a new gateway through the
 * wallet, the booking flow and the admin console.
 *
 * Contract every adapter must honour:
 *   - Nothing here trusts the browser. `verifyCheckout` checks a signature made
 *     with a secret the browser never sees; `fetchOrderStatus` asks the
 *     provider's API. Coins are credited only on a PAID answer from one of
 *     those, or from a webhook whose signature verified.
 *   - Secrets come from the environment and never leave the adapter. The
 *     `checkout` object returned to the client contains only public values.
 *   - Amounts are integers in the currency's minor unit (paise).
 */

export type ProviderId = 'razorpay' | 'sandbox';

export interface CreateOrderInput {
  /** Our PaymentOrder id — sent to the provider as the receipt / reference. */
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  customer?: { name?: string | null; email?: string | null };
}

export interface CreateOrderResult {
  providerOrderId: string;
  /** Public parameters the client needs to open the provider's checkout. */
  checkout: Record<string, unknown>;
}

export type ProviderPaymentStatus = 'paid' | 'pending' | 'failed';

export interface OrderStatusResult {
  status: ProviderPaymentStatus;
  providerPaymentId?: string;
  /** What the provider actually captured — compared against the order before crediting. */
  amountMinor?: number;
  currency?: string;
  failureReason?: string;
}

export interface CheckoutVerification {
  valid: boolean;
  providerPaymentId?: string;
}

export interface ParsedWebhook {
  /** Signature (or equivalent) verified with the provider's webhook secret. */
  valid: boolean;
  /** Provider-unique delivery id; duplicate deliveries share it. */
  eventId: string;
  eventType: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  outcome: 'paid' | 'failed' | 'refunded' | 'ignored';
  amountMinor?: number;
  currency?: string;
  failureReason?: string;
  /** Payload with personal and card data removed — safe to store. */
  sanitizedPayload: Record<string, unknown>;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'processed' | 'pending';
}

export interface CheckoutInput {
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  customer?: { name?: string | null; email?: string | null };
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  /** Credentials present. An unconfigured provider is never offered to users. */
  isConfigured(): boolean;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  /** Public checkout parameters for an existing provider order (e.g. when a retry replays it). */
  checkoutFor(input: CheckoutInput): Record<string, unknown>;
  verifyCheckout(providerOrderId: string, payload: Record<string, unknown>): CheckoutVerification;
  fetchOrderStatus(providerOrderId: string): Promise<OrderStatusResult>;
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhook;
  refund(providerPaymentId: string, amountMinor: number, notes: Record<string, string>): Promise<RefundResult>;
}

/** What the admin console may know about a provider: configuration state, never secrets. */
export interface ProviderStatus {
  id: ProviderId;
  displayName: string;
  configured: boolean;
  webhookConfigured: boolean;
  mode: 'live' | 'test' | 'sandbox' | 'unconfigured';
  enabledForPurchases: boolean;
}
