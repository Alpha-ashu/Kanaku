import React, { useState } from 'react';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { Bell, CheckCircle2, ShieldAlert, Sliders, Mail, Smartphone, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface BudgetLimit {
  id: number;
  category: string;
  limit: number;
  spent: number;
  threshold: number;
}

interface AlertEvent {
  id: number;
  category: string;
  message: string;
  type: 'warning' | 'critical';
  timestamp: string;
}

export const BudgetAlertsPage: React.FC = () => {
  const [limits, setLimits] = useState<BudgetLimit[]>([
    { id: 1, category: 'Dining Out', limit: 12000, spent: 11200, threshold: 85 },
    { id: 2, category: 'Shopping', limit: 15000, spent: 15800, threshold: 90 },
    { id: 3, category: 'Groceries', limit: 20000, spent: 14200, threshold: 80 },
    { id: 4, category: 'Entertainment', limit: 8000, spent: 3000, threshold: 75 }
  ]);

  const [alerts, setAlerts] = useState<AlertEvent[]>([
    { id: 1, category: 'Shopping', message: 'CRITICAL: Spending of ₹15,800 has breached the limit of ₹15,000!', type: 'critical', timestamp: '2 hours ago' },
    { id: 2, category: 'Dining Out', message: 'WARNING: Dining out spend is at 93% of your ₹12,000 budget.', type: 'warning', timestamp: '1 day ago' },
    { id: 3, category: 'Groceries', message: 'Threshold: Groceries has crossed 70% of its budget boundary.', type: 'warning', timestamp: '3 days ago' }
  ]);

  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);

  const handleUpdateThreshold = (id: number, val: number) => {
    setLimits(limits.map(l => l.id === id ? { ...l, threshold: val } : l));
  };

  const handleToggleChannel = (channel: string, current: boolean, setter: (v: boolean) => void) => {
    setter(!current);
    toast.success(`${channel} notifications ${!current ? 'Enabled' : 'Disabled'}`);
  };

  const handleDismissAlert = (id: number) => {
    setAlerts(alerts.filter(a => a.id !== id));
    toast.info('Alert event dismissed');
  };

  return (
    <CenteredLayout>
      <div className="w-full">
        <div className="pb-4 lg:pb-6">
          <PageHeader
            title="Budget Alerts"
            subtitle="Configure intelligent warning threshholds, notification mediums, and inspect breach reports"
            icon={<Bell className="text-rose-600" size={20} />}
          />
        </div>

        {/* Global Overview banner */}
        <div className="bg-gradient-to-r from-rose-900 to-rose-955 rounded-[32px] p-8 shadow-xl relative overflow-hidden mb-8 group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/20 text-white mb-4">
                <ShieldAlert size={12} /> Real-time Protection Active
              </span>
              <h3 className="text-2xl font-black text-white tracking-tight mb-2">Limit Breaches Prevented</h3>
              <p className="text-rose-100 text-sm leading-relaxed font-medium">
                You have active budget ceilings configured across 4 categories. The system evaluates every transaction and triggers instant notifications when targets are approached.
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 text-center shrink-0">
              <span className="text-[10px] font-black uppercase text-rose-200 tracking-wider block">Active Alerts</span>
              <p className="text-3xl font-black text-white mt-1">{alerts.length} Breaches</p>
            </div>
          </div>
        </div>

        {/* Categories grid & Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Budgets monitor */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Ceiling Metrics</h3>
            {limits.map(limit => {
              const pct = (limit.spent / limit.limit) * 100;
              const isOver = limit.spent > limit.limit;
              const isNear = pct >= limit.threshold;

              return (
                <Card key={limit.id} variant="glass" className="p-6 border-white/40 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-black text-slate-900 tracking-tight">{limit.category}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Alert Trigger: {limit.threshold}% limit</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-400 block">Spent / Cap</span>
                      <p className="text-sm font-black text-slate-900 mt-0.5">
                        ₹{limit.spent.toLocaleString()} <span className="text-slate-400">/ ₹{limit.limit.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : isNear ? 'bg-amber-500' : 'bg-indigo-600'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>

                  {/* Slider configuration */}
                  <div className="flex items-center justify-between gap-4 flex-wrap border-t border-slate-50 pt-4">
                    <div className="flex items-center gap-2">
                      <Sliders size={14} className="text-slate-400" />
                      <span className="text-xs font-bold text-slate-500">Tune warning point:</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="50"
                        max="95"
                        step="5"
                        value={limit.threshold}
                        onChange={e => handleUpdateThreshold(limit.id, parseInt(e.target.value))}
                        className="w-32 accent-indigo-600 cursor-pointer"
                      />
                      <span className="text-xs font-black text-slate-900">{limit.threshold}%</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Settings and Alerts list */}
          <div className="space-y-6">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Delivery Channels</h3>
            
            {/* Channels Card */}
            <Card variant="glass" className="p-6 border-white/40 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Mail size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Email Alerts</span>
                    <p className="text-[9px] text-slate-400 font-medium">Daily digest summaries</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleChannel('Email', emailAlerts, setEmailAlerts)}
                  className={`w-10 h-5 rounded-full relative transition-all ${emailAlerts ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${emailAlerts ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Smartphone size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Push Notifications</span>
                    <p className="text-[9px] text-slate-400 font-medium">Instant phone notifications</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleChannel('Push', pushAlerts, setPushAlerts)}
                  className={`w-10 h-5 rounded-full relative transition-all ${pushAlerts ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${pushAlerts ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">SMS Warnings</span>
                    <p className="text-[9px] text-slate-400 font-medium">Text notifications</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleChannel('SMS', smsAlerts, setSmsAlerts)}
                  className={`w-10 h-5 rounded-full relative transition-all ${smsAlerts ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${smsAlerts ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            </Card>

            {/* Recent alerts card */}
            <h3 className="text-lg font-black text-slate-900 tracking-tight pt-2">Recent Breaches</h3>
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-slate-100 rounded-2xl">
                  <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={24} />
                  <p className="text-xs font-bold text-slate-600">All category budgets healthy!</p>
                </div>
              ) : (
                alerts.map(alert => (
                  <Card
                    key={alert.id}
                    variant="glass"
                    className={`p-4 border-white/40 shadow-sm border-l-4 ${alert.type === 'critical' ? 'border-l-rose-500 bg-rose-50/20' : 'border-l-amber-500 bg-amber-50/20'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{alert.category} • {alert.timestamp}</span>
                        <p className="text-xs text-slate-700 font-medium leading-relaxed mt-1">{alert.message}</p>
                      </div>
                      <button
                        onClick={() => handleDismissAlert(alert.id)}
                        className="text-[10px] font-black text-indigo-600 uppercase tracking-wider hover:text-indigo-800 shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </CenteredLayout>
  );
};

export default BudgetAlertsPage;
