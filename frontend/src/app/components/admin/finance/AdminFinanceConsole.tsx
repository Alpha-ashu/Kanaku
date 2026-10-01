import React, { useState } from 'react';
import { Activity, Banknote, Coins, CreditCard, FileClock, Landmark, Package, ShieldAlert, Users, Webhook } from 'lucide-react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeaderCard } from '@/app/components/ui/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { FinanceOverviewTab } from './FinanceOverviewTab';
import { FinanceTransactionsTab } from './FinanceTransactionsTab';
import { FinancePaymentsTab } from './FinancePaymentsTab';
import { FinanceWalletsTab } from './FinanceWalletsTab';
import { FinancePackagesTab } from './FinancePackagesTab';
import { FinanceSecurityTab, FinanceWebhooksTab } from './FinanceEventsTab';
import { FinanceStaffTab } from './FinanceStaffTab';
import { FinanceWithdrawalsTab } from './FinanceWithdrawalsTab';

/**
 * Payments & wallets console.
 *
 * What each tab can do is decided by the server per request (permissions, team
 * scope); the tab list only avoids showing an admin-only area to a manager.
 * A manager without a grant sees a "no permission" notice in the tab, not data.
 */

type TabId = 'overview' | 'transactions' | 'payments' | 'withdrawals' | 'wallets' | 'packages' | 'webhooks' | 'security' | 'staff';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType; adminOnly?: boolean }> = [
  { id: 'overview', label: 'Overview', icon: Activity, adminOnly: true },
  { id: 'transactions', label: 'Transactions', icon: FileClock },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'withdrawals', label: 'Withdrawals', icon: Banknote, adminOnly: true },
  { id: 'wallets', label: 'Wallets', icon: Coins },
  { id: 'packages', label: 'Coin packages', icon: Package, adminOnly: true },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook, adminOnly: true },
  { id: 'security', label: 'Security', icon: ShieldAlert },
  { id: 'staff', label: 'Staff & permissions', icon: Users, adminOnly: true },
];

export const AdminFinanceConsole: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const visible = TABS.filter((t) => isAdmin || !t.adminOnly);
  const [tab, setTab] = useState<TabId>(visible[0]?.id ?? 'transactions');

  if (role !== 'admin' && role !== 'manager') {
    return (
      <CenteredLayout>
        <div className="max-w-md mx-auto text-center py-16">
          <Landmark size={40} className="mx-auto text-slate-300" />
          <p className="text-section-title text-slate-900 mt-3">Staff only</p>
          <p className="text-body text-slate-500 mt-1">This area is available to administrators and authorised managers.</p>
        </div>
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout enablePullToRefresh={false}>
      <div className="max-w-7xl mx-auto w-full space-y-5 pb-12">
        <PageHeaderCard title="Payments & Wallets" subtitle="Coin purchases, session payments, refunds and audit" icon={<Landmark className="w-5 h-5" />} />

        <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Finance sections">
          {visible.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap border transition-colors',
                tab === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
              )}
              data-testid={`finance-tab-${id}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        <div role="tabpanel">
          {tab === 'overview' && <FinanceOverviewTab />}
          {tab === 'transactions' && <FinanceTransactionsTab />}
          {tab === 'payments' && <FinancePaymentsTab />}
          {tab === 'withdrawals' && <FinanceWithdrawalsTab />}
          {tab === 'wallets' && <FinanceWalletsTab />}
          {tab === 'packages' && <FinancePackagesTab />}
          {tab === 'webhooks' && <FinanceWebhooksTab />}
          {tab === 'security' && <FinanceSecurityTab />}
          {tab === 'staff' && <FinanceStaffTab />}
        </div>
      </div>
    </CenteredLayout>
  );
};
