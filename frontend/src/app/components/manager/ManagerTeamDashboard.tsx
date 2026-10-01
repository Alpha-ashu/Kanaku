import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Calendar, Landmark, RefreshCw, Star, Users } from 'lucide-react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeaderCard } from '@/app/components/ui/PageHeader';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { describeApiFailure, type ApiFailure } from '@/lib/apiFailure';
import { describeLifecycle, TONE_CLASSES } from '@/lib/sessionLifecycle';
import { AdvisorPerformance, TeamBooking, TeamMember, managerService } from '@/services/walletService';
import { Card, EmptyState, FailureBanner, LoadMore, LoadingRows, TableScroll, Td, Th, formatDateTime } from '@/app/components/admin/finance/financeUi';

/**
 * A manager's working view: the users and advisors an admin assigned to them,
 * their bookings and advisor performance. Everything is scoped on the server
 * to those assignments — a manager cannot widen it from here.
 */

type Tab = 'team' | 'bookings' | 'performance';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'team', label: 'Team', icon: Users },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'performance', label: 'Advisor performance', icon: BarChart3 },
];

const TeamTab: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const load = useCallback(async () => {
    setFailure(null);
    try { setMembers((await managerService.team()).members); } catch (err) { setFailure(await describeApiFailure(err, 'Your team could not be loaded.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (failure) return <FailureBanner failure={failure} onRetry={load} />;
  if (!members) return <Card><LoadingRows /></Card>;
  if (members.length === 0) return <Card><EmptyState message="No one is assigned to you yet. An administrator assigns users and advisors." /></Card>;
  return (
    <Card className="overflow-hidden">
      <TableScroll>
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th right>Sessions (as advisor)</Th><Th right>Bookings (as client)</Th></tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-slate-50 last:border-0">
              <Td><span className="font-bold text-slate-900 block">{m.name}</span><span className="text-caption text-slate-500 block truncate max-w-[220px]">{m.email}</span></Td>
              <Td className="capitalize">{m.role}{m.role === 'advisor' && !m.isApproved ? ' (pending)' : ''}</Td>
              <Td className="capitalize">{m.status}</Td>
              <Td right>{Object.values(m.sessions).reduce((a, b) => a + b, 0)}</Td>
              <Td right>{m.bookingsAsClient}</Td>
            </tr>
          ))}
        </tbody>
      </TableScroll>
    </Card>
  );
};

const BookingsTab: React.FC = () => {
  const [items, setItems] = useState<TeamBooking[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [serverNow, setServerNow] = useState<number>(Date.now());

  const fetchPage = useCallback(async (after: string | null) => {
    const page = await managerService.bookings(after);
    setServerNow(Date.parse(page.serverNow));
    setItems((prev) => (after ? [...prev, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try { await fetchPage(null); } catch (err) { setFailure(await describeApiFailure(err, 'Team bookings could not be loaded.')); } finally { setLoading(false); }
  }, [fetchPage]);
  useEffect(() => { void load(); }, [load]);

  if (failure) return <FailureBanner failure={failure} onRetry={load} />;
  return (
    <Card className="overflow-hidden">
      {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState message="No bookings for your team yet." /> : (
        <TableScroll>
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr><Th>Session</Th><Th>Advisor</Th><Th>Client</Th><Th>When</Th><Th>State</Th><Th right>Coins</Th></tr>
          </thead>
          <tbody>
            {items.map((b) => {
              const view = describeLifecycle({
                bookingId: b.id, sessionId: b.session?.id ?? null, lifecycle: b.lifecycle, status: b.status,
                paymentStatus: b.paymentStatus, coinCost: b.coinCost ?? 0, serverNow: new Date(serverNow).toISOString(),
                startsAt: b.startsAt, endsAt: null, paymentDueAt: null, paymentClosesAt: null, joinOpensAt: null, joinClosesAt: null,
                paidAt: null, refundedAt: null, canPay: false, canJoin: false,
              }, serverNow);
              return (
                <tr key={b.id} className="border-b border-slate-50 last:border-0">
                  <Td className="font-mono text-caption">#{b.id.slice(0, 8).toUpperCase()}<span className="block font-sans text-caption text-slate-500 capitalize">{b.sessionType} · {b.duration} min</span></Td>
                  <Td>{b.advisor.name}</Td>
                  <Td>{b.client.name}</Td>
                  <Td className="whitespace-nowrap">{b.startsAt ? formatDateTime(b.startsAt) : `${String(b.proposedDate).slice(0, 10)} ${b.proposedTime}`}</Td>
                  <Td><span className={cn('inline-flex px-2.5 py-1 rounded-full border text-2xs font-bold whitespace-nowrap', TONE_CLASSES[view.tone])}>{view.label}</span>
                    {b.session?.rating ? <span className="flex items-center gap-1 text-caption text-slate-500 mt-1"><Star size={11} className="text-amber-400" /> {b.session.rating}</span> : null}
                  </Td>
                  <Td right>{b.coinCost ?? '—'}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      )}
      <LoadMore visible={Boolean(cursor) && !loading} loading={more} onClick={() => {
        setMore(true);
        void fetchPage(cursor).catch(async (err) => setFailure(await describeApiFailure(err, 'More bookings could not be loaded.'))).finally(() => setMore(false));
      }} />
    </Card>
  );
};

const PerformanceTab: React.FC = () => {
  const [advisors, setAdvisors] = useState<AdvisorPerformance[] | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const load = useCallback(async () => {
    setFailure(null);
    try { setAdvisors((await managerService.performance()).advisors); } catch (err) { setFailure(await describeApiFailure(err, 'Performance could not be loaded.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (failure) return <FailureBanner failure={failure} onRetry={load} />;
  if (!advisors) return <Card><LoadingRows /></Card>;
  if (advisors.length === 0) return <Card><EmptyState message="No advisors are assigned to you." /></Card>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {advisors.map((a) => (
        <Card key={a.id} className="p-4 sm:p-5 space-y-3">
          <p className="text-card-title text-slate-900 truncate">{a.name}</p>
          <dl className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-slate-50"><dt className="text-label text-slate-400">Completed</dt><dd className="text-fin-sm text-slate-900">{a.completedSessions}</dd></div>
            <div className="p-3 rounded-2xl bg-slate-50"><dt className="text-label text-slate-400">Cancelled</dt><dd className="text-fin-sm text-slate-900">{a.cancelledSessions}</dd></div>
            <div className="p-3 rounded-2xl bg-slate-50"><dt className="text-label text-slate-400">Rating</dt><dd className="text-fin-sm text-slate-900">{a.averageRating != null ? a.averageRating.toFixed(1) : '—'}<span className="text-caption text-slate-400"> ({a.ratingCount})</span></dd></div>
            <div className="p-3 rounded-2xl bg-slate-50"><dt className="text-label text-slate-400">Acceptance</dt><dd className="text-fin-sm text-slate-900">{a.acceptanceRate != null ? `${Math.round(a.acceptanceRate * 100)}%` : '—'}</dd></div>
          </dl>
        </Card>
      ))}
    </div>
  );
};

export const ManagerTeamDashboard: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [tab, setTab] = useState<Tab>('team');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <CenteredLayout enablePullToRefresh={false}>
      <div className="w-full space-y-5 pb-12">
        <PageHeaderCard title="My Team" subtitle="Users and advisors assigned to you" icon={<Users className="w-5 h-5" />}>
          <div className="flex gap-2">
            <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className="p-2.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="Refresh"><RefreshCw size={14} /></button>
            <button type="button" onClick={() => setCurrentPage('admin-finance')} className="px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
              <Landmark size={14} /> <span className="hidden sm:inline">Finance</span>
            </button>
          </div>
        </PageHeaderCard>
        <nav className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Team sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap border', tab === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>
        <div role="tabpanel" key={refreshKey}>
          {tab === 'team' && <TeamTab />}
          {tab === 'bookings' && <BookingsTab />}
          {tab === 'performance' && <PerformanceTab />}
        </div>
      </div>
    </CenteredLayout>
  );
};
