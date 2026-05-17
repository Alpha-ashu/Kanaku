import React, { useState } from 'react';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { Users, Search, FolderKanban, ShieldCheck, Mail, Phone, ArrowUpRight, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: number;
  name: string;
  email: string;
  phone: string;
  portfolioValue: number;
  assignedRisk: 'Conservative' | 'Moderate' | 'Aggressive';
  joinedDate: string;
  status: 'active' | 'pending';
}

export const ClientManagementPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([
    { id: 1, name: 'Rahul Sharma', email: 'rahul.sharma@example.com', phone: '+91 98765 43210', portfolioValue: 4550000, assignedRisk: 'Moderate', joinedDate: '2025-10-12', status: 'active' },
    { id: 2, name: 'Priya Nair', email: 'priya.nair@example.com', phone: '+91 98123 45678', portfolioValue: 7200000, assignedRisk: 'Aggressive', joinedDate: '2026-01-15', status: 'active' },
    { id: 3, name: 'Amit Patel', email: 'amit.patel@example.com', phone: '+91 97654 32109', portfolioValue: 2800000, assignedRisk: 'Conservative', joinedDate: '2026-03-02', status: 'active' },
    { id: 4, name: 'Shreya Iyer', email: 'shreya.iyer@example.com', phone: '+91 99112 23344', portfolioValue: 1200000, assignedRisk: 'Moderate', joinedDate: '2026-05-10', status: 'pending' }
  ]);

  const [searchQuery, setSearchQuery] = useState('');

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleApproveClient = (id: number, name: string) => {
    setClients(clients.map(c => c.id === id ? { ...c, status: 'active' } : c));
    toast.success(`Client "${name}" has been approved and verified!`);
  };

  const handleAuditPortfolio = (name: string) => {
    toast.info(`Opening financial portfolio review audit for ${name}...`);
  };

  const totalAssetsUnderManagement = clients
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + c.portfolioValue, 0);

  return (
    <CenteredLayout>
      <div className="w-full">
        <div className="pb-4 lg:pb-6">
          <PageHeader
            title="Client Management"
            subtitle="Advisors & Managers portal to track clients, inspect asset allocation, and audit portfolios"
            icon={<Users className="text-teal-600" size={20} />}
          />
        </div>

        {/* Advisor stats banner */}
        <div className="bg-gradient-to-r from-teal-900 to-emerald-950 rounded-[32px] p-8 shadow-xl relative overflow-hidden mb-8 group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/20 text-white mb-4">
                <FolderKanban size={12} /> Financial Advisor Workspace
              </span>
              <h3 className="text-2xl font-black text-white tracking-tight mb-2">Portfolio Management Panel</h3>
              <p className="text-teal-100 text-sm leading-relaxed font-medium">
                Track assets under advisor control, review category breakdowns, confirm client KYC states, and schedule audits.
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 text-center shrink-0">
              <span className="text-[10px] font-black uppercase text-teal-200 tracking-wider block">Assets Under Management</span>
              <p className="text-2xl font-black text-white mt-1 flex items-center justify-center gap-1">
                ₹{(totalAssetsUnderManagement / 100000).toFixed(1)}L <TrendingUp size={18} className="text-emerald-400" />
              </p>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-6 relative">
          <Search size={18} className="absolute left-4 top-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search clients by name, email, phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-[20px] text-sm font-medium focus:outline-none focus:border-teal-600 transition-colors shadow-sm"
          />
        </div>

        {/* Client cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredClients.map(client => (
            <Card key={client.id} variant="glass" className="p-6 border-white/40 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-black text-slate-900 tracking-tight text-lg flex items-center gap-2">
                      {client.name}
                      {client.status === 'pending' && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-50 border border-amber-200 text-amber-600 tracking-wider">Pending Approval</span>
                      )}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 block">Joined: {client.joinedDate}</span>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    client.assignedRisk === 'Conservative' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                    client.assignedRisk === 'Moderate' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' :
                    'bg-rose-50 text-rose-600 border border-rose-200'
                  }`}>
                    {client.assignedRisk}
                  </span>
                </div>

                {/* Info List */}
                <div className="space-y-2 mt-4 text-sm font-medium text-slate-500">
                  <p className="flex items-center gap-2"><Mail size={14} /> {client.email}</p>
                  <p className="flex items-center gap-2"><Phone size={14} /> {client.phone}</p>
                </div>
              </div>

              {/* Lower Section */}
              <div className="border-t border-slate-50 pt-4 mt-6 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Portfolio Valuation</span>
                  <p className="font-black text-slate-900 mt-0.5">₹{client.portfolioValue.toLocaleString()}</p>
                </div>

                <div className="flex items-center gap-3">
                  {client.status === 'pending' ? (
                    <button
                      onClick={() => handleApproveClient(client.id, client.name)}
                      className="bg-teal-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-700 active:scale-95 transition-all shadow-sm flex items-center gap-1"
                    >
                      <ShieldCheck size={12} /> Verify KYC
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAuditPortfolio(client.name)}
                      className="bg-slate-50 text-slate-600 border border-slate-100 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-1 group"
                    >
                      Audit portfolio <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </CenteredLayout>
  );
};

export default ClientManagementPage;
