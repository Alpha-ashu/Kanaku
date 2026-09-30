import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { describeApiFailure, type ApiFailure } from '@/lib/apiFailure';
import { FinanceOverview, financeService, formatMoneyMinor } from '@/services/walletService';
import { Card, FailureBanner, LoadingRows, Section, StatusBadge } from './financeUi';

export const FinanceOverviewTab: React.FC = () => {
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [integrity, setIntegrity] = useState<{ consistent: boolean; mismatches: Array<Record<string, unknown>> } | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try {
      setData(await financeService.overview());
    } catch (err) {
      setFailure(await describeApiFailure(err, 'The overview could not be loaded.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runIntegrity = async () => {
    setChecking(true);
    try {
      setIntegrity(await financeService.integrity());
    } catch (err) {
      setFailure(await describeApiFailure(err, 'The integrity check failed to run.'));
    } finally {
      setChecking(false);
    }
  };

  if (failure) return <FailureBanner failure={failure} onRetry={load} />;
  if (!data) return <Card><LoadingRows /></Card>;

  const stats = [
    { label: 'Coins in wallets', value: data.coinsAvailable.toLocaleString('en-IN') },
    { label: 'Held earnings', value: data.coinsPending.toLocaleString('en-IN') },
    { label: 'Wallets', value: data.wallets.toLocaleString('en-IN') },
    { label: 'Paid orders (24h)', value: data.last24h.paidOrders.toLocaleString('en-IN') },
    { label: 'Revenue (24h)', value: formatMoneyMinor(data.last24h.revenueMinor) },
    { label: 'Failed orders (24h)', value: data.last24h.failedOrders.toLocaleString('en-IN'), warn: data.last24h.failedOrders > 0 },
    { label: 'Open orders', value: data.openOrders.toLocaleString('en-IN') },
    { label: 'Paid, upcoming sessions', value: data.paidUpcomingSessions.toLocaleString('en-IN') },
    { label: 'Webhook failures (24h)', value: data.last24h.webhookFailures.toLocaleString('en-IN'), warn: data.last24h.webhookFailures > 0 },
    { label: 'Orders needing review', value: data.ordersNeedingReview.toLocaleString('en-IN'), warn: data.ordersNeedingReview > 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 min-w-0">
            <p className="text-label text-slate-400 truncate">{s.label}</p>
            <p className={s.warn ? 'text-fin-md text-rose-600' : 'text-fin-md text-slate-900'}>{s.value}</p>
          </Card>
        ))}
      </div>

      <Section title="Payment providers">
        <Card className="divide-y divide-slate-100">
          {data.providers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <p className="text-body-sm font-bold text-slate-900">{p.displayName}</p>
                <p className="text-caption text-slate-500">Credentials are managed in the server environment and never shown here.</p>
              </div>
              <StatusBadge tone={p.configured ? 'success' : 'neutral'}>{p.configured ? 'Configured' : 'Not configured'}</StatusBadge>
              <StatusBadge tone={p.webhookConfigured ? 'success' : 'warning'}>{p.webhookConfigured ? 'Webhook secret set' : 'No webhook secret'}</StatusBadge>
              <StatusBadge tone={p.mode === 'live' ? 'info' : 'neutral'}>{p.mode}</StatusBadge>
              <StatusBadge tone={p.enabledForPurchases ? 'success' : 'neutral'}>{p.enabledForPurchases ? 'Offered' : 'Not offered'}</StatusBadge>
            </div>
          ))}
        </Card>
      </Section>

      <Section
        title="Ledger integrity"
        actions={(
          <button type="button" onClick={() => void runIntegrity()} disabled={checking} className="px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2" data-testid="finance-integrity-run">
            {checking ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Run check
          </button>
        )}
      >
        <Card className="p-4">
          {!integrity && <p className="text-body-sm text-slate-600">Compares every wallet balance with the sum of its ledger. They must always match.</p>}
          {integrity?.consistent && (
            <p className="text-body-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 size={16} /> All wallet balances match their ledgers.</p>
          )}
          {integrity && !integrity.consistent && (
            <div className="space-y-2">
              <p className="text-body-sm text-rose-700 flex items-center gap-2"><ShieldAlert size={16} /> {integrity.mismatches.length} wallet(s) do not match their ledger. Investigate before any adjustment.</p>
              <pre className="text-caption bg-slate-50 rounded-xl p-3 overflow-x-auto">{JSON.stringify(integrity.mismatches, null, 2)}</pre>
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
};
