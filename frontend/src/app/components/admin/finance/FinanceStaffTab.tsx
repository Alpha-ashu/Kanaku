import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { backendService } from '@/lib/backend-api';
import { describeApiFailure, failureText, type ApiFailure } from '@/lib/apiFailure';
import { StaffManager, financeService } from '@/services/walletService';
import { Card, EmptyState, FailureBanner, LoadingRows, inputClass } from './financeUi';

/**
 * Manager authority. A manager starts with team-scoped reads only; anything more
 * is granted here, per manager, from a fixed list. Moving money by fiat and
 * managing staff can never be granted. Assignments decide whose data a manager
 * may see at all.
 */

const PERMISSION_LABELS: Record<string, string> = {
  'team.wallets.read': 'View wallets of assigned users',
  'team.payments.read': 'View payments of assigned users',
  'users.directory.read': 'View the full user directory',
  'finance.read': 'View all finance data (not only the team)',
  'finance.refund': 'Issue refunds',
  'finance.reconcile': 'Reconcile payments with the provider',
  'security.read': 'View security events',
};

interface UserHit { id: string; name: string; email: string; role: string }

const ManagerCard: React.FC<{ manager: StaffManager; grantable: string[]; onChanged: () => void }> = ({ manager, grantable, onChanged }) => {
  const [perms, setPerms] = useState<string[]>(manager.permissions);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => { setPerms(manager.permissions); }, [manager.permissions]);

  const dirty = perms.slice().sort().join() !== manager.permissions.slice().sort().join();

  const save = async () => {
    setSaving(true);
    try {
      await financeService.setStaffPermissions(manager.id, perms);
      toast.success(`Permissions updated for ${manager.name}.`);
      onChanged();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Permissions could not be saved.')));
    } finally {
      setSaving(false);
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await backendService.api.get('/admin/users', { params: { search: query.trim() } });
      const rows: UserHit[] = Array.isArray(res.data) ? res.data : [];
      setHits(rows.filter((u) => u.role === 'user' || u.role === 'advisor').slice(0, 8));
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'User search failed.')));
    } finally {
      setSearching(false);
    }
  };

  const assign = async (userId: string) => {
    try {
      await financeService.assign(manager.id, userId);
      setHits([]);
      setQuery('');
      onChanged();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Assignment failed.')));
    }
  };

  const unassign = async (userId: string) => {
    try {
      await financeService.unassign(manager.id, userId);
      onChanged();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Removal failed.')));
    }
  };

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="min-w-0">
        <p className="text-card-title text-slate-900 truncate">{manager.name}</p>
        <p className="text-caption text-slate-500 truncate">{manager.email} · {manager.status}</p>
      </div>

      <div className="space-y-2">
        <p className="text-label text-slate-400">Granted permissions (team viewing is always included)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {grantable.map((p) => (
            <label key={p} className="flex items-start gap-2 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={perms.includes(p)}
                onChange={(e) => setPerms((prev) => (e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)))}
                className="mt-0.5"
              />
              <span className="text-body-sm text-slate-700">{PERMISSION_LABELS[p] ?? p}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="px-4 py-2 rounded-full bg-slate-900 hover:bg-black text-white text-sm font-bold disabled:opacity-40 flex items-center gap-2" data-testid={`finance-staff-save-${manager.id}`}>
          {saving && <Loader2 size={14} className="animate-spin" />} Save permissions
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-label text-slate-400">Assigned users & advisors ({manager.assignments.length})</p>
        {manager.assignments.length === 0 && <p className="text-body-sm text-slate-500">No one assigned — this manager sees no user data.</p>}
        <ul className="space-y-1.5">
          {manager.assignments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50">
              <span className="flex-1 min-w-0 text-body-sm text-slate-700 truncate">{a.name ?? a.id} <span className="text-slate-400">· {a.role}</span></span>
              <button type="button" onClick={() => a.id && void unassign(a.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white" aria-label={`Unassign ${a.name ?? ''}`}>
                <UserMinus size={14} />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void search(e)} className="flex gap-2">
          <input className={inputClass} placeholder="Find a user or advisor by name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find user to assign" />
          <button type="submit" disabled={searching} className="px-4 rounded-full border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {searching ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
          </button>
        </form>
        {hits.length > 0 && (
          <ul className="rounded-xl border border-slate-100 divide-y divide-slate-100">
            {hits.map((u) => (
              <li key={u.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 min-w-0 text-body-sm text-slate-700 truncate">{u.name} <span className="text-slate-400">· {u.email} · {u.role}</span></span>
                <button type="button" onClick={() => void assign(u.id)} className="px-3 py-1 rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1">
                  <UserPlus size={12} /> Assign
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

export const FinanceStaffTab: React.FC = () => {
  const [data, setData] = useState<{ grantable: string[]; managers: StaffManager[] } | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const load = useCallback(async () => {
    setFailure(null);
    try {
      setData(await financeService.staff());
    } catch (err) {
      setFailure(await describeApiFailure(err, 'Staff could not be loaded.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (failure) return <FailureBanner failure={failure} onRetry={load} />;
  if (!data) return <Card><LoadingRows /></Card>;
  if (data.managers.length === 0) return <Card><EmptyState message="There are no manager accounts." /></Card>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {data.managers.map((m) => <ManagerCard key={m.id} manager={m} grantable={data.grantable} onChanged={() => void load()} />)}
    </div>
  );
};
