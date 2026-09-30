import { razorpayProvider } from './razorpay.provider';
import { sandboxProvider } from './sandbox.provider';
import type { PaymentProvider, ProviderId, ProviderStatus } from './types';

export type { PaymentProvider, ProviderId, ProviderStatus } from './types';

/**
 * Provider registry — the only place that knows which gateways exist.
 *
 * To add a gateway (PhonePe, Paytm, …): implement `PaymentProvider` in its own
 * file, add it here, and add its id to `ProviderId`. Nothing in the wallet,
 * booking or admin code changes. PhonePe and Paytm are not implemented yet:
 * both need merchant sandbox credentials to build their checksum/status flows
 * against, and an unverified payment adapter is worse than none. Google Pay and
 * the PhonePe/Paytm apps are already reachable as UPI methods inside Razorpay.
 *
 * `PAYMENT_PROVIDERS` (comma-separated, in order of preference) chooses which
 * configured providers are offered for purchases; default "razorpay,sandbox".
 * The sandbox is never offered in production whatever this says.
 */

const ALL: Record<ProviderId, PaymentProvider> = {
  razorpay: razorpayProvider,
  sandbox: sandboxProvider,
};

const isProduction = () => process.env.NODE_ENV === 'production';

const enabledIds = (): ProviderId[] => {
  const raw = (process.env.PAYMENT_PROVIDERS || 'razorpay,sandbox').split(',').map((s) => s.trim().toLowerCase());
  return raw.filter((id): id is ProviderId => id in ALL && !(id === 'sandbox' && isProduction()));
};

export const getProvider = (id: string): PaymentProvider | null => {
  if (!(id in ALL)) return null;
  if (id === 'sandbox' && isProduction()) return null;
  return ALL[id as ProviderId];
};

/** Providers a user may pay with right now, in preference order. */
export const purchaseProviders = (): PaymentProvider[] =>
  enabledIds().map((id) => ALL[id]).filter((p) => p.isConfigured());

export const defaultPurchaseProvider = (): PaymentProvider | null => purchaseProviders()[0] ?? null;

export const providerStatuses = (): ProviderStatus[] => {
  const enabled = new Set(enabledIds());
  return (Object.keys(ALL) as ProviderId[])
    .filter((id) => !(id === 'sandbox' && isProduction()))
    .map((id) => {
      const provider = ALL[id];
      const configured = provider.isConfigured();
      const webhookConfigured = id === 'razorpay' ? Boolean(process.env.RAZORPAY_WEBHOOK_SECRET) : configured;
      const mode: ProviderStatus['mode'] = !configured
        ? 'unconfigured'
        : id === 'sandbox'
          ? 'sandbox'
          : (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : 'test';
      return { id, displayName: provider.displayName, configured, webhookConfigured, mode, enabledForPurchases: enabled.has(id) && configured };
    });
};
