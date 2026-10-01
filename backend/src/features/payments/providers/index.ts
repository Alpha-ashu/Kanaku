import { razorpayProvider } from './razorpay.provider';
import { phonepeProvider } from './phonepe.provider';
import { paytmProvider } from './paytm.provider';
import { sandboxProvider } from './sandbox.provider';
import type { PaymentProvider, ProviderId, ProviderStatus } from './types';

export type { PaymentProvider, ProviderId, ProviderStatus } from './types';

/**
 * Provider registry — the only place that knows which gateways exist.
 *
 * To add a gateway: implement `PaymentProvider` in its own file, add it here,
 * and add its id to `ProviderId`. Nothing in the wallet, booking or admin code
 * changes.
 *
 *   razorpay  popup checkout, signed result + API check (UPI incl. Google Pay /
 *             PhonePe / Paytm apps, cards, netbanking)
 *   phonepe   redirect to PhonePe's page; settled from its status API / webhook
 *   paytm     redirect to Paytm's page; settled from its status API / webhook
 *   sandbox   simulated payments for development — never offered in production
 *
 * `PAYMENT_PROVIDERS` (comma-separated, in order of preference) chooses which
 * CONFIGURED providers are offered for purchases; default "razorpay,sandbox".
 * PhonePe and Paytm are opt-in: add them only after a successful end-to-end run
 * on their sandbox / staging environments.
 */

const ALL: Record<ProviderId, PaymentProvider> = {
  razorpay: razorpayProvider,
  phonepe: phonepeProvider,
  paytm: paytmProvider,
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
      const { webhookConfigured, mode } = provider.describe();
      return { id, displayName: provider.displayName, configured, webhookConfigured, mode, enabledForPurchases: enabled.has(id) && configured };
    });
};
