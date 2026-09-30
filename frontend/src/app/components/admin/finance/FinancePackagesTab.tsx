import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { describeApiFailure, failureText, type ApiFailure } from '@/lib/apiFailure';
import { AdminPackage, financeService, formatMoneyMinor } from '@/services/walletService';
import { Card, EmptyState, FailureBanner, LoadingRows, Section, StatusBadge, TableScroll, Td, Th, inputClass } from './financeUi';

/**
 * Coin packages. Orders snapshot price and coins when they are created, so an
 * edit here never changes a purchase that is already in progress.
 */

const blank = { code: '', name: '', coins: '', bonusCoins: '0', priceRupees: '', sortOrder: '100' };

export const FinancePackagesTab: React.FC = () => {
  const [items, setItems] = useState<AdminPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      setItems((await financeService.packages()).items);
    } catch (err) {
      setFailure(await describeApiFailure(err, 'Packages could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (pkg: AdminPackage) => {
    try {
      await financeService.updatePackage(pkg.id, { isActive: !pkg.isActive });
      toast.success(pkg.isActive ? `${pkg.name} is no longer on sale.` : `${pkg.name} is now on sale.`);
      await load();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Update failed.')));
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await financeService.createPackage({
        code: form.code.trim(),
        name: form.name.trim(),
        coins: Number(form.coins),
        bonusCoins: Number(form.bonusCoins) || 0,
        priceMinor: Math.round(Number(form.priceRupees) * 100),
        currency: 'INR',
        isActive: false,
        sortOrder: Number(form.sortOrder) || 0,
      });
      toast.success('Package created (inactive). Activate it when ready.');
      setForm(blank);
      await load();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'The package could not be created.')));
    } finally {
      setSaving(false);
    }
  };

  const valid = /^[a-z0-9-]{3,40}$/.test(form.code) && form.name.trim().length >= 2 && Number(form.coins) > 0 && Number(form.priceRupees) >= 1;

  return (
    <div className="space-y-6">
      <FailureBanner failure={failure} onRetry={load} />
      <Card className="overflow-hidden">
        {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState message="No packages yet." /> : (
          <TableScroll>
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr><Th>Package</Th><Th right>Coins</Th><Th right>Bonus</Th><Th right>Price</Th><Th>Status</Th><Th right>{''}</Th></tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <Td><span className="font-bold text-slate-900">{p.name}</span><span className="block font-mono text-caption text-slate-400">{p.code}</span></Td>
                  <Td right>{p.coins.toLocaleString('en-IN')}</Td>
                  <Td right>{p.bonusCoins.toLocaleString('en-IN')}</Td>
                  <Td right className="font-bold">{formatMoneyMinor(p.priceMinor, p.currency)}</Td>
                  <Td><StatusBadge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'On sale' : 'Inactive'}</StatusBadge></Td>
                  <Td right>
                    <button type="button" onClick={() => void toggle(p)} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50" data-testid={`finance-package-toggle-${p.code}`}>
                      {p.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </Card>

      <Section title="New package">
        <Card className="p-4">
          <form onSubmit={(e) => void create(e)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input className={inputClass} placeholder="code (e.g. festive-750)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} aria-label="Code" />
            <input className={inputClass} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Name" />
            <input className={inputClass} inputMode="numeric" placeholder="Coins" value={form.coins} onChange={(e) => setForm({ ...form, coins: e.target.value })} aria-label="Coins" />
            <input className={inputClass} inputMode="numeric" placeholder="Bonus coins" value={form.bonusCoins} onChange={(e) => setForm({ ...form, bonusCoins: e.target.value })} aria-label="Bonus coins" />
            <input className={inputClass} inputMode="decimal" placeholder="Price in ₹" value={form.priceRupees} onChange={(e) => setForm({ ...form, priceRupees: e.target.value })} aria-label="Price in rupees" />
            <button type="submit" disabled={!valid || saving} className="py-2.5 rounded-full bg-slate-900 hover:bg-black text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              <Plus size={14} /> Create (inactive)
            </button>
          </form>
        </Card>
      </Section>
    </div>
  );
};
