import React, { useCallback, useEffect, useState } from 'react';
import { describeApiFailure, type ApiFailure } from '@/lib/apiFailure';
import { SecurityEvent, WebhookEvent, financeService } from '@/services/walletService';
import { Card, EmptyState, FailureBanner, LoadMore, LoadingRows, ORDER_TONE, StatusBadge, TableScroll, Td, Th, formatDateTime, inputClass } from './financeUi';

/** Webhook deliveries and security-relevant audit events. Read-only. */

export const FinanceWebhooksTab: React.FC = () => {
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<WebhookEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const fetchPage = useCallback(async (after: string | null) => {
    const page = await financeService.webhookEvents({ status, cursor: after, limit: 25 });
    setItems((prev) => (after ? [...prev, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try { await fetchPage(null); } catch (err) { setFailure(await describeApiFailure(err, 'Webhook events could not be loaded.')); } finally { setLoading(false); }
  }, [fetchPage]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Webhook status">
          {['', 'PROCESSED', 'IGNORED', 'REJECTED', 'FAILED', 'RECEIVED'].map((s) => <option key={s || 'all'} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>
      <FailureBanner failure={failure} onRetry={load} />
      <Card className="overflow-hidden">
        {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState message="No webhook deliveries recorded." /> : (
          <TableScroll>
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr><Th>Received</Th><Th>Provider</Th><Th>Event</Th><Th>Signature</Th><Th>Status</Th><Th>Order</Th></tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0">
                  <Td className="whitespace-nowrap">{formatDateTime(e.receivedAt)}</Td>
                  <Td>{e.provider}</Td>
                  <Td><span className="font-bold">{e.eventType}</span><span className="block font-mono text-caption text-slate-400 truncate max-w-[200px]">{e.eventId}</span></Td>
                  <Td><StatusBadge tone={e.signatureValid ? 'success' : 'danger'}>{e.signatureValid ? 'Valid' : 'Invalid'}</StatusBadge></Td>
                  <Td><StatusBadge tone={ORDER_TONE[e.status] ?? 'neutral'}>{e.status}</StatusBadge>{e.error && <span className="block text-xs font-semibold text-rose-600 mt-1">{e.error}</span>}</Td>
                  <Td className="font-mono text-caption text-slate-500">{e.paymentOrderId ? e.paymentOrderId.slice(0, 8) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
        <LoadMore visible={Boolean(cursor) && !loading} loading={more} onClick={() => {
          setMore(true);
          void fetchPage(cursor).catch(async (err) => setFailure(await describeApiFailure(err, 'More events could not be loaded.'))).finally(() => setMore(false));
        }} />
      </Card>
    </div>
  );
};

const ACTION_LABELS: Record<string, string> = {
  'auth.login_failed': 'Failed login',
  'authz.denied': 'Access denied',
  'security.rate_limit_hit': 'Rate limit hit',
  'security.webhook_invalid_signature': 'Forged webhook',
  'security.payment_signature_invalid': 'Forged payment callback',
  'security.payment_amount_mismatch': 'Payment amount mismatch',
  'security.refund_unrecovered': 'Refund not recovered',
  'security.payment_id_reused': 'Payment reused across orders',
  'wallet.adjusted': 'Wallet adjusted',
  'wallet.status_changed': 'Wallet status changed',
  'staff.permissions_changed': 'Staff permissions changed',
  'staff.assignment_changed': 'Manager assignment changed',
  'session.access_denied': 'Session access denied',
  'kyc.document_view_denied': 'KYC document access denied',
};

export const FinanceSecurityTab: React.FC = () => {
  const [action, setAction] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [items, setItems] = useState<SecurityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const fetchPage = useCallback(async (after: string | null) => {
    const page = await financeService.securityEvents({ action, cursor: after, limit: 25 });
    setItems((prev) => (after ? [...prev, ...page.items] : page.items));
    setCursor(page.nextCursor);
    setActions(page.actions);
  }, [action]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try { await fetchPage(null); } catch (err) { setFailure(await describeApiFailure(err, 'Security events could not be loaded.')); } finally { setLoading(false); }
  }, [fetchPage]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <select className={inputClass} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Event type">
          <option value="">All security events</option>
          {actions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
        </select>
      </div>
      <FailureBanner failure={failure} onRetry={load} />
      <Card className="overflow-hidden">
        {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState message="No security events recorded." /> : (
          <TableScroll>
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr><Th>Time</Th><Th>Event</Th><Th>Actor</Th><Th>Resource</Th><Th>Result</Th><Th>IP</Th></tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0">
                  <Td className="whitespace-nowrap">{formatDateTime(e.createdAt)}</Td>
                  <Td className="font-bold">{ACTION_LABELS[e.action] ?? e.action}</Td>
                  <Td><span className="font-mono text-caption">{e.userId.slice(0, 8)}</span>{e.actorRole && <span className="block text-caption text-slate-400">{e.actorRole}</span>}</Td>
                  <Td className="font-mono text-caption text-slate-500 max-w-[200px] truncate" title={e.resource}>{e.resource}</Td>
                  <Td><StatusBadge tone={e.status === 'success' ? 'neutral' : 'danger'}>{e.status}</StatusBadge></Td>
                  <Td className="font-mono text-caption text-slate-500">{e.ip ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
        <LoadMore visible={Boolean(cursor) && !loading} loading={more} onClick={() => {
          setMore(true);
          void fetchPage(cursor).catch(async (err) => setFailure(await describeApiFailure(err, 'More events could not be loaded.'))).finally(() => setMore(false));
        }} />
      </Card>
    </div>
  );
};
