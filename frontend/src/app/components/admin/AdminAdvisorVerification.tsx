import React, { useState, useEffect, useCallback } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
 Shield, CheckCircle2, XCircle, Clock, Users, Star,
 Loader2, AlertTriangle, ChevronLeft, RefreshCw, Eye,
 BadgeCheck, UserX, Mail, Calendar, Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AdvisorApplication {
 id: string;
 name: string;
 email: string;
 role: string;
 isApproved: boolean;
 createdAt: string;
 sessionCount?: number;
 isAvailable?: boolean;
}

type FilterTab = 'pending' | 'approved' | 'all';

export const AdminAdvisorVerification: React.FC = () => {
 const { setCurrentPage, goBack } = useApp();
 const { role, loading: authLoading, dataReady } = useAuth();
 const [applications, setApplications] = useState<AdvisorApplication[]>([]);
 const [pending, setPending] = useState<AdvisorApplication[]>([]);
 const [loading, setLoading] = useState(true);
 const [activeTab, setActiveTab] = useState<FilterTab>('pending');
 const [processingId, setProcessingId] = useState<string | null>(null);
 const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
 const [rejectReason, setRejectReason] = useState('');

 // Guard: admin only
 if (authLoading || !dataReady) {
   return (
     <CenteredLayout>
       <div className="flex items-center justify-center py-20">
         <Loader2 className="animate-spin text-slate-400" size={32} />
       </div>
     </CenteredLayout>
   );
 }

 if (role !== 'admin') {
 return (
 <CenteredLayout>
 <div className="text-center py-16">
 <Shield size={48} className="mx-auto text-red-400 mb-4" />
 <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
 <p className="text-gray-500 mt-2">Only admins can access advisor verification.</p>
 <button onClick={() => setCurrentPage('dashboard')} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-xl font-medium">
 Go to Dashboard
 </button>
 </div>
 </CenteredLayout>
 );
 }

 const fetchApplications = useCallback(async () => {
 setLoading(true);
 try {
 const data = await backendService.api.get('/advisors/admin/applications');
 const result = data.data;
 setPending(result.pending || []);
 setApplications(result.all || []);
 } catch (err: any) {
 toast.error('Failed to load advisor applications');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { fetchApplications(); }, [fetchApplications]);

 const handleApprove = async (id: string, name: string) => {
 setProcessingId(id);
 try {
 await backendService.api.put(`/advisors/admin/${id}/approve`);
 toast.success(`${name} has been approved as an advisor!`);
 fetchApplications();
 } catch {
 toast.error('Failed to approve advisor');
 } finally {
 setProcessingId(null);
 }
 };

 const handleReject = async () => {
 if (!rejectModal) return;
 setProcessingId(rejectModal.id);
 try {
 await backendService.api.put(`/advisors/admin/${rejectModal.id}/reject`, { reason: rejectReason });
 toast.success('Application rejected and user notified');
 setRejectModal(null);
 setRejectReason('');
 fetchApplications();
 } catch {
 toast.error('Failed to reject application');
 } finally {
 setProcessingId(null);
 }
 };

 const displayList = activeTab === 'pending'
 ? pending
 : activeTab === 'approved'
 ? applications.filter(a => a.isApproved)
 : applications;

 const statusBadge = (app: AdvisorApplication) => {
 if (app.isApproved) return (
 <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-bold">
 <BadgeCheck size={12} /> Approved
 </span>
 );
 return (
 <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[11px] font-bold">
 <Clock size={12} /> Pending
 </span>
 );
 };

 return (
 <CenteredLayout>
 <div className="max-w-4xl mx-auto space-y-6 pb-12">

 {/* Header */}
 <div className="flex items-center gap-4">
 <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors md:!hidden">
 <ChevronLeft size={20} className="text-gray-600" />
 </button>
 <div className="flex items-center gap-4">
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
 Advisor Verification
 </h1>
 </div>
 <button onClick={fetchApplications} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
 <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
 Refresh
 </button>
 </div>

 {/* Stats Cards */}
 <div className="grid grid-cols-3 gap-4">
 {[
 { label: 'Pending Review', value: pending.length, icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-200' },
 { label: 'Approved Advisors', value: applications.filter(a => a.isApproved).length, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
 { label: 'Total Applications', value: applications.length, icon: Users, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
 ].map(stat => (
 <div key={stat.label} className={cn('rounded-2xl border p-4', stat.color)}>
 <stat.icon size={20} className="mb-2" />
 <p className="text-2xl font-black">{stat.value}</p>
 <p className="text-xs font-medium opacity-70 mt-0.5">{stat.label}</p>
 </div>
 ))}
 </div>

 {/* Pending alert */}
 {pending.length > 0 && (
 <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
 <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
 <p className="text-sm text-amber-800 font-medium">
 {pending.length} advisor application{pending.length > 1 ? 's' : ''} waiting for your review.
 </p>
 </div>
 )}

 {/* Tab Filter */}
 <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
 {([
 { id: 'pending', label: `Pending (${pending.length})` },
 { id: 'approved', label: 'Approved' },
 { id: 'all', label: 'All' },
 ] as { id: FilterTab; label: string }[]).map(tab => (
 <button key={tab.id} onClick={() => setActiveTab(tab.id)}
 className={cn('px-5 py-2 rounded-lg text-sm font-bold transition-all', activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
 {tab.label}
 </button>
 ))}
 </div>

 {/* Application List */}
 {loading ? (
 <div className="flex items-center justify-center py-16">
 <Loader2 size={32} className="animate-spin text-indigo-400" />
 </div>
 ) : displayList.length === 0 ? (
 <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
 <Briefcase size={40} className="mx-auto text-gray-300 mb-3" />
 <p className="text-gray-500 font-medium">No applications to show</p>
 </div>
 ) : (
 <div className="space-y-3">
 <AnimatePresence>
 {displayList.map(app => (
 <motion.div
 key={app.id}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -8 }}
 className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
 >
 <div className="flex items-start gap-4">
 {/* Avatar */}
 <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shrink-0">
 {app.name?.charAt(0)?.toUpperCase() ?? '?'}
 </div>

 {/* Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="font-bold text-gray-900">{app.name}</h3>
 {statusBadge(app)}
 {app.sessionCount !== undefined && app.sessionCount > 0 && (
 <span className="flex items-center gap-1 text-[11px] text-gray-500">
 <Star size={11} className="text-amber-400" /> {app.sessionCount} sessions
 </span>
 )}
 </div>
 <div className="flex items-center gap-4 mt-1 flex-wrap">
 <span className="flex items-center gap-1 text-sm text-gray-500">
 <Mail size={12} /> {app.email}
 </span>
 <span className="flex items-center gap-1 text-xs text-gray-400">
 <Calendar size={11} /> Applied {new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
 </span>
 </div>
 </div>

 {/* Actions */}
 <div className="flex items-center gap-2 shrink-0">
 {!app.isApproved ? (
 <>
 <button
 onClick={() => handleApprove(app.id, app.name)}
 disabled={processingId === app.id}
 className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
 >
 {processingId === app.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
 Approve
 </button>
 <button
 onClick={() => setRejectModal({ id: app.id, name: app.name })}
 disabled={processingId === app.id}
 className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-bold hover:bg-red-100 transition-all disabled:opacity-50"
 >
 <XCircle size={14} />
 Reject
 </button>
 </>
 ) : (
 <button
 onClick={() => setRejectModal({ id: app.id, name: app.name })}
 disabled={processingId === app.id}
 className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-sm font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
 >
 <UserX size={14} />
 Revoke
 </button>
 )}
 </div>
 </div>
 </motion.div>
 ))}
 </AnimatePresence>
 </div>
 )}

 {/* Reject / Revoke Modal */}
 <AnimatePresence>
 {rejectModal && (
 <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
 <motion.div
 initial={{ scale: 0.9, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0.9, opacity: 0 }}
 className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
 >
 <div className="flex items-center gap-3 mb-4">
 <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
 <XCircle size={20} className="text-red-500" />
 </div>
 <div>
 <h3 className="font-bold text-gray-900">Reject Application</h3>
 <p className="text-sm text-gray-500">{rejectModal.name}</p>
 </div>
 </div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Reason (optional)</label>
 <textarea
 value={rejectReason}
 onChange={e => setRejectReason(e.target.value)}
 rows={3}
 className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
 placeholder="Explain why this application is being rejected..."
 />
 <div className="flex gap-3 mt-4">
 <button onClick={() => { setRejectModal(null); setRejectReason(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50">
 Cancel
 </button>
 <button
 onClick={handleReject}
 disabled={processingId !== null}
 className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 flex items-center justify-center gap-2"
 >
 {processingId ? <Loader2 size={14} className="animate-spin" /> : null}
 Confirm Reject
 </button>
 </div>
 </motion.div>
 </div>
 )}
 </AnimatePresence>

 </div>
 </CenteredLayout>
 );
};


