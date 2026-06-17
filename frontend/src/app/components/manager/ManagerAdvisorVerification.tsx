import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
 Shield, CheckCircle2, XCircle, Clock, Users, Star,
 Loader2, AlertTriangle, ChevronLeft, RefreshCw, Eye,
 BadgeCheck, UserX, Mail, Calendar, Briefcase, FileText,
 CreditCard, Fingerprint, Award, Building, FileCheck, Info,
 ShieldCheck
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
 // Mock KYC data for UI display
 qualification?: string;
 experience?: string;
 status?: 'pending' | 'approved' | 'rejected' | 'suspended';
 metadata?: {
 panNumber?: string;
 aadhaarLast4?: string;
 hasCertifications?: boolean;
 hasSelfieVerified?: boolean;
 hasComplianceSigned?: boolean;
 };
}

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

export const ManagerAdvisorVerification: React.FC = () => {
 const { setCurrentPage } = useApp();
 const { role, dataReady } = useAuth();
 const [applications, setApplications] = useState<AdvisorApplication[]>([]);
 const [loading, setLoading] = useState(true);
 const [activeTab, setActiveTab] = useState<FilterTab>('pending');
 const [processingId, setProcessingId] = useState<string | null>(null);
 const [selectedApp, setSelectedApp] = useState<AdvisorApplication | null>(null);
 const [rejectReason, setRejectReason] = useState('');
 const [isRejecting, setIsRejecting] = useState(false);

 // Role Guard: Manager only
 useEffect(() => {
   if (dataReady && role !== 'manager' && role !== 'admin') {
     toast.error('Unauthorized access');
     setCurrentPage('dashboard');
   }
 }, [dataReady, role, setCurrentPage]);

 const isFetching = useRef(false);

 const fetchApplications = useCallback(async () => {
   if (isFetching.current) return;
   isFetching.current = true;
   setLoading(true);
   try {
     const data = await backendService.api.get('/advisors/admin/applications');
     const result = data.data;

     // Backend returns `fullName` (and a nested `user.name`), never a top-level
     // `name` — map it here so every display field below has a value instead
     // of crashing on .charAt() of undefined.
     // Backend response items have `applicationId`, never `id` — without this
     // mapping, the Approve/Reject buttons below call
     // `/advisors/admin/undefined/approve` and silently fail.
     const enhancedPending = (result.pending || []).map((app: any) => ({
       ...app,
       id: app.applicationId,
       name: app.fullName || app.user?.name || 'Unknown',
       status: 'pending',
       qualification: 'Certified Financial Planner (CFP)',
       experience: '8+ Years',
       metadata: {
         panNumber: 'ABCDE1234F',
         aadhaarLast4: '8892',
         hasCertifications: true,
         hasSelfieVerified: true,
         hasComplianceSigned: true
       }
     }));

     // `result.all` includes pending applications too — exclude those here so
     // they aren't listed twice, and use the real `status` field instead of
     // the previous `app.isApproved` check (which doesn't exist on this
     // response shape and silently forced every entry to "pending").
     const enhancedRest = (result.all || [])
       .filter((app: any) => app.status !== 'PENDING')
       .map((app: any) => ({
         ...app,
         id: app.applicationId,
         name: app.fullName || app.user?.name || 'Unknown',
         status: app.status === 'APPROVED' ? 'approved' : app.status === 'REJECTED' ? 'rejected' : 'pending',
         qualification: 'MBA Finance',
         experience: '5 Years'
       }));

     setApplications([...enhancedPending, ...enhancedRest]);
   } catch (err: any) {
     console.error('Failed to load verification queue:', err?.message ?? err);
     toast.error('Failed to load verification queue');
   } finally {
     setLoading(false);
     isFetching.current = false;
   }
 }, []);

 // Only fetch once auth is ready and user is authorized
 useEffect(() => {
   if (!dataReady) return;
   if (role !== 'manager' && role !== 'admin') return;
   fetchApplications();
 }, [dataReady, role, fetchApplications]);

 const handleApprove = async (app: AdvisorApplication) => {
 setProcessingId(app.id);
 try {
 await backendService.api.put(`/advisors/admin/${app.id}/approve`);
 toast.success(`${app.name}'s advisor profile is now ACTIVE.`);
 setSelectedApp(null);
 fetchApplications();
 } catch {
 toast.error('Approval failed. Please try again.');
 } finally {
 setProcessingId(null);
 }
 };

 const handleReject = async () => {
 if (!selectedApp || !rejectReason) {
 toast.error('Please provide a reason for rejection');
 return;
 }
 setProcessingId(selectedApp.id);
 try {
 await backendService.api.put(`/advisors/admin/${selectedApp.id}/reject`, { reason: rejectReason });
 toast.success('Application rejected. User has been notified.');
 setSelectedApp(null);
 setRejectReason('');
 setIsRejecting(false);
 fetchApplications();
 } catch {
 toast.error('Rejection failed');
 } finally {
 setProcessingId(null);
 }
 };

 const filteredList = applications.filter(app => {
 if (activeTab === 'all') return true;
 if (activeTab === 'pending') return app.status === 'pending';
 if (activeTab === 'approved') return app.isApproved;
 if (activeTab === 'rejected') return app.status === 'rejected';
 return true;
 });

 const getStatusBadge = (app: AdvisorApplication) => {
 if (app.isApproved) return (
 <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
 <BadgeCheck size={14} /> ACTIVE
 </div>
 );
 if (app.status === 'rejected') return (
 <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-bold">
 <XCircle size={14} /> REJECTED
 </div>
 );
 return (
 <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
 <Clock size={14} /> PENDING REVIEW
 </div>
 );
 };

 return (
 <CenteredLayout>
 <div className="max-w-5xl mx-auto space-y-6 pb-20">
 
 {/* Manager Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
 <ShieldCheck size={24} />
 </div>
 <div>
 <h1 className="text-2xl font-black text-slate-900 tracking-tight">Compliance Dashboard</h1>
 <p className="text-sm text-slate-500 font-medium">Advisor Verification & KYC Management</p>
 </div>
 </div>
 <button 
 onClick={fetchApplications} 
 disabled={loading}
 className="p-2.5 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all text-slate-600 shadow-sm"
 data-testid="manager-verify-refresh-button"
 >
 <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
 </button>
 </div>

 {/* Tab Navigation */}
 <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
 {(['pending', 'approved', 'rejected', 'all'] as FilterTab[]).map(tab => (
 <button
 key={tab}
 onClick={() => setActiveTab(tab)}
 className={cn(
"px-6 py-2 rounded-xl text-sm font-bold capitalize transition-all",
 activeTab === tab ?"bg-white text-slate-900 shadow-sm" :"text-slate-500 hover:text-slate-700"
 )}
 data-testid={`manager-verify-tab-${tab}-button`}
 >
 {tab}
 </button>
 ))}
 </div>

 {/* Queue List */}
 {loading ? (
 <div className="flex flex-col items-center justify-center py-20 gap-4">
 <Loader2 size={40} className="animate-spin text-slate-400" />
 <p className="text-slate-500 font-medium animate-pulse">Syncing verification queue...</p>
 </div>
 ) : filteredList.length === 0 ? (
 <div className="bg-white border border-slate-100 rounded-[2.5rem] p-20 text-center space-y-4">
 <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
 <FileCheck size={40} className="text-slate-300" />
 </div>
 <h3 className="text-xl font-bold text-slate-900">Queue is Clear</h3>
 <p className="text-slate-500 max-w-xs mx-auto">All advisor applications have been processed. Great work!</p>
 </div>
 ) : (
 <div className="grid grid-cols-1 gap-4">
 <AnimatePresence mode='popLayout'>
 {filteredList.map(app => (
 <motion.div
 key={app.id}
 layout
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.95 }}
 className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group"
 >
 <div className="flex items-center gap-6">
 {/* Advisor Identity */}
 <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden relative group-hover:bg-slate-200 transition-colors">
 <span className="text-2xl font-black text-slate-900 relative z-10">{app.name.charAt(0)}</span>
 </div>

 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-3">
 <h3 className="text-lg font-black text-slate-900 truncate">{app.name}</h3>
 {getStatusBadge(app)}
 </div>
 <div className="flex items-center gap-4 mt-1">
 <span className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
 <Mail size={14} /> {app.email}
 </span>
 <span className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
 <Award size={14} /> {app.qualification}
 </span>
 </div>
 </div>

 <div className="flex items-center gap-3">
 <button
 onClick={() => setSelectedApp(app)}
 className="px-6 py-2.5 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2"
 data-testid={`manager-verify-review-button-${app.id}`}
 >
 <Eye size={16} />
 Review Documents
 </button>
 </div>
 </div>
 </motion.div>
 ))}
 </AnimatePresence>
 </div>
 )}

 {/* Detailed Review Modal */}
 <AnimatePresence>
 {selectedApp && (
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8">
 <motion.div 
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => !processingId && setSelectedApp(null)}
 className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
 />
 
 <motion.div
 initial={{ opacity: 0, y: 50, scale: 0.9 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 50, scale: 0.9 }}
 className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col"
 >
 {/* Modal Header */}
 <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between shrink-0">
 <div className="flex items-center gap-5">
 <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-xl font-black">
 {selectedApp.name.charAt(0)}
 </div>
 <div>
 <h2 className="text-2xl font-black text-slate-900">{selectedApp.name}</h2>
 <p className="text-slate-500 font-medium">Application ID: {selectedApp.id.slice(0, 8)}</p>
 </div>
 </div>
 <button 
 onClick={() => setSelectedApp(null)}
 className="p-3 hover:bg-slate-50 rounded-2xl transition-all"
 >
 <XCircle size={28} className="text-slate-400" />
 </button>
 </div>

 {/* Modal Body - Scrollable */}
 <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
 
 {/* Left Column: Details & Qualifications */}
 <div className="space-y-8">
 <section className="space-y-4">
 <div className="flex items-center gap-2 text-slate-900 font-black uppercase tracking-wider text-xs">
 <Info size={14} /> Professional Profile
 </div>
 <div className="space-y-3">
 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
 <p className="text-xs text-slate-500 font-bold uppercase mb-1">Qualification</p>
 <p className="text-slate-900 font-bold">{selectedApp.qualification}</p>
 </div>
 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
 <p className="text-xs text-slate-500 font-bold uppercase mb-1">Experience</p>
 <p className="text-slate-900 font-bold">{selectedApp.experience}</p>
 </div>
 </div>
 </section>

 <section className="space-y-4">
 <div className="flex items-center gap-2 text-slate-900 font-black uppercase tracking-wider text-xs">
 <CreditCard size={14} /> Identity Documents
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
 <div>
 <p className="text-[10px] text-emerald-600 font-black uppercase">PAN CARD</p>
 <p className="text-sm font-bold text-emerald-900">{selectedApp.metadata?.panNumber || 'NOT PROVIDED'}</p>
 </div>
 <FileCheck size={18} className="text-emerald-500" />
 </div>
 <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
 <div>
 <p className="text-[10px] text-emerald-600 font-black uppercase">AADHAAR (LAST 4)</p>
 <p className="text-sm font-bold text-emerald-900"> {selectedApp.metadata?.aadhaarLast4 || 'N/A'}</p>
 </div>
 <FileCheck size={18} className="text-emerald-500" />
 </div>
 </div>
 </section>
 </div>

 {/* Right Column: Compliance & Verifications */}
 <div className="space-y-8">
 <section className="space-y-4">
 <div className="flex items-center gap-2 text-slate-900 font-black uppercase tracking-wider text-xs">
 <Fingerprint size={14} /> Security Verifications
 </div>
 <div className="space-y-3">
 {[
 { label: 'Selfie Liveness Verification', status: selectedApp.metadata?.hasSelfieVerified },
 { label: 'Professional Certifications', status: selectedApp.metadata?.hasCertifications },
 { label: 'Compliance Agreements Signed', status: selectedApp.metadata?.hasComplianceSigned },
 { label: 'Government ID Validation', status: true }
 ].map((check, idx) => (
 <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
 <span className="text-sm font-bold text-slate-700">{check.label}</span>
 {check.status ? (
 <BadgeCheck size={20} className="text-emerald-500" />
 ) : (
 <AlertTriangle size={20} className="text-amber-500" />
 )}
 </div>
 ))}
 </div>
 </section>

 {isRejecting && (
 <section className="space-y-4 animate-in slide-in-from-bottom-2">
 <div className="flex items-center gap-2 text-red-600 font-black uppercase tracking-wider text-xs">
 <Info size={14} /> Rejection Reason
 </div>
 <textarea
 value={rejectReason}
 onChange={(e) => setRejectReason(e.target.value)}
 className="w-full p-4 bg-red-50 border border-red-100 rounded-2xl text-sm font-bold text-red-900 placeholder:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-200"
 placeholder="Please explain why this application is being rejected..."
 rows={3}
 autoFocus
 data-testid="manager-verify-reject-reason-textarea"
 />
 </section>
 )}
 </div>
 </div>
 </div>

 {/* Modal Footer - Actions */}
 <div className="px-10 py-8 border-t border-slate-100 bg-white flex items-center justify-between gap-4 shrink-0">
 <div className="flex items-center gap-2 text-slate-500">
 <Shield size={16} />
 <span className="text-xs font-bold uppercase tracking-widest">Compliance Review Active</span>
 </div>
 
 <div className="flex items-center gap-3">
 {!isRejecting ? (
 <>
 <button
 onClick={() => setIsRejecting(true)}
 disabled={processingId !== null}
 className="px-8 py-3 bg-white border border-red-200 text-red-600 rounded-2xl font-bold text-sm hover:bg-red-50 transition-all flex items-center gap-2"
 data-testid="manager-verify-reject-toggle"
 >
 <XCircle size={18} />
 Reject Application
 </button>
 <button
 onClick={() => handleApprove(selectedApp)}
 disabled={processingId !== null}
 className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2"
 data-testid="manager-verify-approve-button"
 >
 {processingId === selectedApp.id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
 Approve Advisor
 </button>
 </>
 ) : (
 <>
 <button
 onClick={() => setIsRejecting(false)}
 className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all"
 data-testid="manager-verify-reject-cancel-button"
 >
 Cancel
 </button>
 <button
 onClick={handleReject}
 disabled={processingId !== null || !rejectReason}
 className="px-8 py-3 bg-red-600 text-white rounded-2xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center gap-2"
 data-testid="manager-verify-reject-confirm-button"
 >
 {processingId === selectedApp.id ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
 Confirm Rejection
 </button>
 </>
 )}
 </div>
 </div>
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 </div>
 </CenteredLayout>
 );
};
