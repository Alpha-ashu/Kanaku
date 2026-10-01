import { backendService } from '@/lib/backend-api';
import type { StepUpProof } from '@/services/accountLifecycleService';

/**
 * Client for the coin wallet, session payments and the finance console.
 *
 * Nothing here decides anything: balances, prices, payment status, session
 * access and deadlines all come from the server. The only thing computed
 * locally is how to DISPLAY a countdown, from the server's clock offset.
 */

type Envelope<T> = { success: boolean; data: T };
const unwrap = <T>(res: { data: Envelope<T> }): T => res.data.data;

// ─── Types (mirror the API) ────────────────────────────────────────────────────

export type LedgerType =
  | 'PAYMENT_CREDIT' | 'SESSION_PAYMENT' | 'SESSION_EARNING' | 'EARNING_RELEASE'
  | 'SESSION_REFUND' | 'EARNING_REVERSAL' | 'PURCHASE_REVERSAL' | 'ADMIN_ADJUSTMENT'
  | 'WITHDRAWAL' | 'WITHDRAWAL_REVERSAL';

export interface WalletSummary {
  availableBalance: number;
  pendingBalance: number;
  status: 'ACTIVE' | 'FROZEN';
  coinValueMinor: number;
  currency: string;
  purchasesEnabled: boolean;
  serverNow: string;
}

export interface LedgerEntry {
  id: string;
  type: LedgerType;
  bucket: 'AVAILABLE' | 'PENDING';
  amount: number;
  availableAfter: number;
  pendingAfter: number;
  status: string;
  description: string;
  reason: string | null;
  bookingId: string | null;
  paymentOrderId: string | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CoinPackage {
  id: string;
  code: string;
  name: string;
  coins: number;
  bonusCoins: number;
  totalCoins: number;
  priceMinor: number;
  currency: string;
}

export interface ProviderOption {
  id: 'razorpay' | 'phonepe' | 'paytm' | 'sandbox';
  displayName: string;
}

export type OrderStatus = 'CREATED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';

export interface PurchaseOrder {
  id: string;
  provider: string;
  status: OrderStatus;
  coins: number;
  amountMinor: number;
  currency: string;
  failureReason: string | null;
  expiresAt: string;
  paidAt: string | null;
  creditedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
}

export interface EarningsSummary {
  availableBalance: number;
  pendingBalance: number;
  earned: { total: number; today: number; week: number; month: number };
  completedSessions: number;
  upcomingPaidSessions: number;
  recent: LedgerEntry[];
  serverNow: string;
}

export type WithdrawalStatus = 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';
export type PayoutMethodType = 'UPI' | 'BANK';

export interface Withdrawal {
  id: string;
  coins: number;
  amountMinor: number;
  currency: string;
  status: WithdrawalStatus;
  method: PayoutMethodType;
  /** Masked, e.g. "UPI · ra•••@okhdfc". */
  payoutLabel: string;
  payoutReference: string | null;
  decisionNote: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
}

export interface WithdrawalOverview {
  /** False while withdrawals are paused on the server. */
  enabled: boolean;
  minCoins: number;
  maxCoins: number;
  coinValueMinor: number;
  currency: string;
  availableBalance: number;
  /** Earned coins that can be withdrawn now (bought coins never can). */
  withdrawableCoins: number;
  walletStatus: 'ACTIVE' | 'FROZEN';
  paidOut: { coins: number; amountMinor: number };
  payoutMethod: { method: PayoutMethodType; label: string; updatedAt: string } | null;
  open: Withdrawal | null;
  recent: Withdrawal[];
}

export type PayoutDetailsInput =
  | { method: 'UPI'; upiId: string }
  | { method: 'BANK'; accountHolder: string; accountNumber: string; ifsc: string };

export type BookingLifecycle =
  | 'REQUESTED' | 'RESCHEDULE_PROPOSED' | 'REJECTED' | 'AWAITING_PAYMENT' | 'PAYMENT_DUE'
  | 'UPCOMING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'CANCELLED' | 'EXPIRED';

export interface BookingPaymentState {
  bookingId: string;
  sessionId: string | null;
  lifecycle: BookingLifecycle;
  status: string;
  paymentStatus: 'NOT_REQUIRED' | 'UNPAID' | 'PAID' | 'REFUNDED';
  coinCost: number;
  serverNow: string;
  startsAt: string | null;
  endsAt: string | null;
  paymentDueAt: string | null;
  paymentClosesAt: string | null;
  joinOpensAt: string | null;
  joinClosesAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  canPay: boolean;
  canJoin: boolean;
  walletBalance?: number;
}

export interface SessionAccess extends BookingPaymentState {
  role: 'client' | 'advisor';
  joinUrl?: string;
}

// ─── Wallet ────────────────────────────────────────────────────────────────────

export const walletService = {
  async getWallet(): Promise<WalletSummary> {
    return unwrap(await backendService.api.get('/wallet'));
  },

  async getTransactions(params: { cursor?: string | null; type?: LedgerType | ''; limit?: number } = {}): Promise<Page<LedgerEntry>> {
    return unwrap(await backendService.api.get('/wallet/transactions', {
      params: { cursor: params.cursor || undefined, type: params.type || undefined, limit: params.limit ?? 20 },
    }));
  },

  async getPackages(): Promise<{ packages: CoinPackage[]; providers: ProviderOption[] }> {
    return unwrap(await backendService.api.get('/wallet/packages'));
  },

  /** `clientRequestId` must be stable across retries of the same purchase attempt. */
  async createPurchase(packageId: string, clientRequestId: string, provider?: string): Promise<{ order: PurchaseOrder; checkout: Record<string, unknown> | null }> {
    return unwrap(await backendService.api.post('/wallet/purchases', { packageId, clientRequestId, provider }));
  },

  async getPurchase(orderId: string): Promise<{ order: PurchaseOrder; availableBalance: number }> {
    return unwrap(await backendService.api.get(`/wallet/purchases/${encodeURIComponent(orderId)}`));
  },

  async listPurchases(cursor?: string | null): Promise<Page<PurchaseOrder>> {
    return unwrap(await backendService.api.get('/wallet/purchases', { params: { cursor: cursor || undefined } }));
  },

  /** Relays the provider's signed checkout result. The server verifies it with the provider. */
  async verifyPurchase(orderId: string, payload: Record<string, string>): Promise<{ order: PurchaseOrder; transactionId: string | null; availableBalance: number }> {
    return unwrap(await backendService.api.post(`/wallet/purchases/${encodeURIComponent(orderId)}/verify`, { payload }));
  },

  async cancelPurchase(orderId: string): Promise<{ order: PurchaseOrder }> {
    return unwrap(await backendService.api.post(`/wallet/purchases/${encodeURIComponent(orderId)}/cancel`, {}));
  },

  /** Development gateway only (the route does not exist in production). */
  async sandboxPay(orderId: string, outcome: 'paid' | 'failed'): Promise<{ payload: Record<string, string> }> {
    return unwrap(await backendService.api.post(`/wallet/purchases/${encodeURIComponent(orderId)}/sandbox-pay`, { outcome }));
  },

  async getEarnings(): Promise<EarningsSummary> {
    return unwrap(await backendService.api.get('/wallet/earnings'));
  },

  // ─── Advisor withdrawals ──────────────────────────────────────────────────────

  async getWithdrawals(): Promise<WithdrawalOverview> {
    return unwrap(await backendService.api.get('/wallet/withdrawals'));
  },

  /** Needs step-up proof (password or a verified email code). */
  async savePayoutMethod(details: PayoutDetailsInput, proof: StepUpProof | undefined): Promise<{ payoutMethod: NonNullable<WithdrawalOverview['payoutMethod']> }> {
    return unwrap(await backendService.api.put('/wallet/payout-method', { details, proof }));
  },

  /** `clientRequestId` must be stable across retries of the same request. */
  async requestWithdrawal(coins: number, clientRequestId: string): Promise<{ withdrawal: Withdrawal; replayed: boolean }> {
    return unwrap(await backendService.api.post('/wallet/withdrawals', { coins, clientRequestId }));
  },

  async cancelWithdrawal(id: string): Promise<{ withdrawal: Withdrawal }> {
    return unwrap(await backendService.api.post(`/wallet/withdrawals/${encodeURIComponent(id)}/cancel`, {}));
  },

  // ─── Session payments ────────────────────────────────────────────────────────

  async getBookingPayment(bookingId: string): Promise<BookingPaymentState> {
    return unwrap(await backendService.api.get(`/bookings/${encodeURIComponent(bookingId)}/payment`));
  },

  async payBooking(bookingId: string): Promise<{ alreadyPaid: boolean; transactionId: string | null; state: BookingPaymentState }> {
    return unwrap(await backendService.api.post(`/bookings/${encodeURIComponent(bookingId)}/pay`, {}));
  },

  async getSessionAccess(sessionId: string): Promise<SessionAccess> {
    return unwrap(await backendService.api.get(`/sessions/${encodeURIComponent(sessionId)}/access`));
  },

  async getServerTime(): Promise<string> {
    return unwrap<{ serverNow: string }>(await backendService.api.get('/system/time')).serverNow;
  },
};

// ─── Finance console (staff) ───────────────────────────────────────────────────

export interface UserRef { id: string; name: string; email: string; role: string }

export interface AdminLedgerEntry extends LedgerEntry {
  userId: string;
  reference: string;
  actorId: string | null;
  actorRole: string | null;
  counterpartyUserId: string | null;
  user: UserRef;
}

export interface AdminOrder extends PurchaseOrder {
  providerOrderId: string | null;
  providerPaymentId: string | null;
  verifiedVia: string | null;
  refundReason: string | null;
  package: { name: string; code: string };
  user: UserRef;
}

export interface ProviderStatus {
  id: string;
  displayName: string;
  configured: boolean;
  webhookConfigured: boolean;
  mode: 'live' | 'test' | 'sandbox' | 'unconfigured';
  enabledForPurchases: boolean;
}

export interface FinanceOverview {
  wallets: number;
  coinsAvailable: number;
  coinsPending: number;
  last24h: { paidOrders: number; revenueMinor: number; failedOrders: number; webhookFailures: number };
  openOrders: number;
  paidUpcomingSessions: number;
  ordersNeedingReview: number;
  openWithdrawals?: { count: number; amountMinor: number };
  providers: ProviderStatus[];
  serverNow: string;
}

export interface AdminWalletRow {
  userId: string;
  availableBalance: number;
  pendingBalance: number;
  status: 'ACTIVE' | 'FROZEN';
  updatedAt: string;
  user: UserRef;
}

export interface AdminPackage {
  id: string;
  code: string;
  name: string;
  coins: number;
  bonusCoins: number;
  priceMinor: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
}

export interface SecurityEvent {
  id: string;
  userId: string;
  actorRole: string | null;
  action: string;
  resource: string;
  status: string;
  ip: string | null;
  requestId: string | null;
  details: unknown;
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  status: string;
  error: string | null;
  paymentOrderId: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface AdminWithdrawal extends Withdrawal {
  userId: string;
  reviewedBy: string | null;
  /** When the advisor last changed their payout account — recent changes deserve a second look. */
  payoutMethodChangedAt: string | null;
  user: UserRef;
}

export type PayoutDetails =
  | { method: 'UPI'; upiId: string }
  | { method: 'BANK'; accountHolder: string; accountNumber: string; ifsc: string };

export interface StaffManager {
  id: string;
  name: string;
  email: string;
  status: string;
  permissions: string[];
  assignments: Array<Partial<UserRef> & { assignedAt: string }>;
}

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const financeService = {
  async overview(): Promise<FinanceOverview> {
    return unwrap(await backendService.api.get('/finance/overview'));
  },
  async integrity(): Promise<{ consistent: boolean; mismatches: Array<Record<string, unknown>> }> {
    return unwrap(await backendService.api.get('/finance/integrity'));
  },
  async transactions(params: Record<string, unknown>): Promise<Page<AdminLedgerEntry>> {
    return unwrap(await backendService.api.get('/finance/transactions', { params: clean(params) }));
  },
  async orders(params: Record<string, unknown>): Promise<Page<AdminOrder>> {
    return unwrap(await backendService.api.get('/finance/payment-orders', { params: clean(params) }));
  },
  async reconcileOrder(orderId: string): Promise<{ order: PurchaseOrder }> {
    return unwrap(await backendService.api.post(`/finance/payment-orders/${encodeURIComponent(orderId)}/reconcile`, {}));
  },
  async refundOrder(orderId: string, reason: string): Promise<{ order: PurchaseOrder }> {
    return unwrap(await backendService.api.post(`/finance/payment-orders/${encodeURIComponent(orderId)}/refund`, { reason }));
  },
  async wallets(params: Record<string, unknown>): Promise<{ items: AdminWalletRow[]; page: number; total: number; totalPages: number }> {
    return unwrap(await backendService.api.get('/finance/wallets', { params: clean(params) }));
  },
  async walletDetail(userId: string): Promise<{ wallet: { availableBalance: number; pendingBalance: number; status: string }; consistent: boolean; user: UserRef | null; transactions: AdminLedgerEntry[]; nextCursor: string | null }> {
    return unwrap(await backendService.api.get(`/finance/wallets/${encodeURIComponent(userId)}`));
  },
  async adjust(userId: string, amount: number, reason: string, clientRequestId: string) {
    return unwrap(await backendService.api.post(`/finance/wallets/${encodeURIComponent(userId)}/adjust`, { amount, reason, clientRequestId }));
  },
  async setWalletStatus(userId: string, status: 'ACTIVE' | 'FROZEN', reason: string) {
    return unwrap(await backendService.api.post(`/finance/wallets/${encodeURIComponent(userId)}/status`, { status, reason }));
  },
  async refundBooking(bookingId: string, percent: number, reason: string) {
    return unwrap(await backendService.api.post(`/finance/bookings/${encodeURIComponent(bookingId)}/refund`, { percent, reason }));
  },
  async packages(): Promise<{ items: AdminPackage[] }> {
    return unwrap(await backendService.api.get('/finance/packages'));
  },
  async createPackage(input: Omit<AdminPackage, 'id'>): Promise<AdminPackage> {
    return unwrap(await backendService.api.post('/finance/packages', input));
  },
  async updatePackage(id: string, input: Partial<Omit<AdminPackage, 'id' | 'code'>>): Promise<AdminPackage> {
    return unwrap(await backendService.api.patch(`/finance/packages/${encodeURIComponent(id)}`, input));
  },
  async providers(): Promise<{ items: ProviderStatus[] }> {
    return unwrap(await backendService.api.get('/finance/providers'));
  },
  async webhookEvents(params: Record<string, unknown>): Promise<Page<WebhookEvent>> {
    return unwrap(await backendService.api.get('/finance/webhook-events', { params: clean(params) }));
  },
  async securityEvents(params: Record<string, unknown>): Promise<Page<SecurityEvent> & { actions: string[] }> {
    return unwrap(await backendService.api.get('/finance/security-events', { params: clean(params) }));
  },
  async withdrawals(params: Record<string, unknown>): Promise<Page<AdminWithdrawal>> {
    return unwrap(await backendService.api.get('/finance/withdrawals', { params: clean(params) }));
  },
  /** The full payout account for one request. Audited on the server. */
  async withdrawalPayoutDetails(id: string): Promise<{ details: PayoutDetails }> {
    return unwrap(await backendService.api.get(`/finance/withdrawals/${encodeURIComponent(id)}/payout-details`));
  },
  async approveWithdrawal(id: string): Promise<{ withdrawal: Withdrawal }> {
    return unwrap(await backendService.api.post(`/finance/withdrawals/${encodeURIComponent(id)}/approve`, {}));
  },
  async markWithdrawalPaid(id: string, payoutReference: string, note?: string): Promise<{ withdrawal: Withdrawal }> {
    return unwrap(await backendService.api.post(`/finance/withdrawals/${encodeURIComponent(id)}/paid`, { payoutReference, note: note || undefined }));
  },
  async rejectWithdrawal(id: string, reason: string): Promise<{ withdrawal: Withdrawal }> {
    return unwrap(await backendService.api.post(`/finance/withdrawals/${encodeURIComponent(id)}/reject`, { reason }));
  },
  async staff(): Promise<{ grantable: string[]; managers: StaffManager[] }> {
    return unwrap(await backendService.api.get('/finance/staff'));
  },
  async setStaffPermissions(managerId: string, permissions: string[]) {
    return unwrap(await backendService.api.put(`/finance/staff/${encodeURIComponent(managerId)}/permissions`, { permissions }));
  },
  async assign(managerId: string, subjectUserId: string) {
    return unwrap(await backendService.api.post(`/finance/staff/${encodeURIComponent(managerId)}/assignments`, { subjectUserId }));
  },
  async unassign(managerId: string, subjectUserId: string) {
    return unwrap(await backendService.api.delete(`/finance/staff/${encodeURIComponent(managerId)}/assignments/${encodeURIComponent(subjectUserId)}`));
  },
};

// ─── Manager team ──────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isApproved: boolean;
  advisorStatus: string;
  createdAt: string;
  sessions: Record<string, number>;
  bookingsAsClient: number;
}

export interface TeamBooking {
  id: string;
  status: string;
  paymentStatus: BookingPaymentState['paymentStatus'];
  coinCost: number | null;
  duration: number;
  sessionType: string;
  startsAt: string | null;
  proposedDate: string;
  proposedTime: string;
  createdAt: string;
  lifecycle: BookingLifecycle;
  advisor: { id: string; name: string };
  client: { id: string; name: string };
  session: { id: string; status: string; rating: number | null } | null;
}

export interface AdvisorPerformance {
  id: string;
  name: string;
  completedSessions: number;
  cancelledSessions: number;
  averageRating: number | null;
  ratingCount: number;
  bookingsByStatus: Record<string, number>;
  acceptanceRate: number | null;
}

export const managerService = {
  async team(): Promise<{ members: TeamMember[] }> {
    return unwrap(await backendService.api.get('/manager/team'));
  },
  async bookings(cursor?: string | null): Promise<Page<TeamBooking> & { serverNow: string }> {
    return unwrap(await backendService.api.get('/manager/team/bookings', { params: clean({ cursor }) }));
  },
  async performance(): Promise<{ advisors: AdvisorPerformance[] }> {
    return unwrap(await backendService.api.get('/manager/team/performance'));
  },
};

// ─── Display helpers ───────────────────────────────────────────────────────────

export const formatCoins = (n: number) => `${n.toLocaleString('en-IN')} ${Math.abs(n) === 1 ? 'coin' : 'coins'}`;

export const formatMoneyMinor = (minor: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

export const LEDGER_LABELS: Record<LedgerType, string> = {
  PAYMENT_CREDIT: 'Coin purchase',
  SESSION_PAYMENT: 'Advisor session',
  SESSION_EARNING: 'Session earning (pending)',
  EARNING_RELEASE: 'Earning released',
  SESSION_REFUND: 'Session refund',
  EARNING_REVERSAL: 'Earning reversed',
  PURCHASE_REVERSAL: 'Purchase refunded',
  ADMIN_ADJUSTMENT: 'Adjustment',
  WITHDRAWAL: 'Withdrawal',
  WITHDRAWAL_REVERSAL: 'Withdrawal returned',
};

/** Coins as rupees at the server's coin value (1 coin = ₹1 by default). */
export const coinsToMinor = (coins: number, coinValueMinor = 100) => coins * coinValueMinor;

/** 950 → "950", 12,400 → "12.4K" — for tight spots like the top bar. */
export const formatCoinsCompact = (n: number) =>
  Math.abs(n) < 10_000
    ? n.toLocaleString('en-IN')
    : new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/**
 * Fired after anything that changes the signed-in user's balance (a purchase,
 * a withdrawal), so the top-bar balance refreshes without polling.
 */
export const WALLET_CHANGED_EVENT = 'kanaku:wallet-changed';

export const announceWalletChange = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WALLET_CHANGED_EVENT));
};

/** A fresh idempotency key for one purchase attempt (kept across its retries). */
export const newRequestKey = () =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
