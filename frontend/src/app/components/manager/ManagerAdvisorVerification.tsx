import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
  CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Eye, BadgeCheck, Mail, Phone,
  Calendar, Briefcase, FileText, Building, FileCheck, Info, ShieldCheck, X,
  ExternalLink, AlertTriangle, IndianRupee,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Manager advisor-verification queue.
 *
 * Everything shown here comes from GET /advisors/admin/applications — the same
 * payload the Admin screen renders. This screen previously padded each
 * application with invented KYC data (a fixed PAN number and Aadhaar digits, a
 * "CFP" qualification, selfie-liveness and compliance ticks) and drew a
 * synthetic "VERIFIED" ID card whenever the real document could not be loaded,
 * so a reviewer could approve someone whose documents they had never seen.
 */

type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type DocType = 'pan' | 'aadhaar' | 'cert';

interface AdvisorApplication {
  applicationId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  experienceYears: number;
  expertise: string;
  organizationName?: string | null;
  bio: string;
  hourlyRate?: number | null;
  status: ApplicationStatus;
  rejectionReason?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  hasPan: boolean;
  hasAadhaar: boolean;
  hasCert: boolean;
}

interface DocumentViewerState {
  type: DocType;
  title: string;
  app: AdvisorApplication;
  url: string | null;
}

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

const DOCUMENTS: { type: DocType; label: string; required: boolean; flag: keyof AdvisorApplication }[] = [
  { type: 'pan', label: 'PAN Card', required: true, flag: 'hasPan' },
  { type: 'aadhaar', label: 'Aadhaar Card', required: true, flag: 'hasAadhaar' },
  { type: 'cert', label: 'Professional Certificate', required: false, flag: 'hasCert' },
];

const STATUS_BADGE: Record<ApplicationStatus, { label: string; className: string; icon: typeof Clock }> = {
  PENDING: { label: 'PENDING REVIEW', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  APPROVED: { label: 'ACTIVE', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: BadgeCheck },
  REJECTED: { label: 'REJECTED', className: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const isPdfUrl = (url: string) => {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().split('?')[0].endsWith('.pdf');
  }
};

const apiError = (err: any, fallback: string) => err?.response?.data?.error || err?.message || fallback;

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
  const [viewingDoc, setViewingDoc] = useState<DocumentViewerState | null>(null);
  const [docLoading, setDocLoading] = useState<DocType | null>(null);

  // Role Guard: Manager & Admin
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
      const { data } = await backendService.api.get('/advisors/admin/applications');
      setApplications(Array.isArray(data?.all) ? data.all : []);
    } catch (err: any) {
      console.error('Failed to load verification queue:', err?.message ?? err);
      toast.error('Failed to load verification queue');
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, []);

  useEffect(() => {
    if (!dataReady) return;
    if (role !== 'manager' && role !== 'admin') return;
    fetchApplications();
  }, [dataReady, role, fetchApplications]);

  const closeReview = () => {
    setSelectedApp(null);
    setViewingDoc(null);
    setIsRejecting(false);
    setRejectReason('');
  };

  const openDocumentViewer = async (app: AdvisorApplication, type: DocType, title: string) => {
    setDocLoading(type);
    let url: string | null = null;
    try {
      const res = await backendService.api.get(`/advisors/application/${app.applicationId}/document/${type}`);
      url = res.data?.url ?? null;
    } catch (err: any) {
      toast.error(apiError(err, 'Could not load the document'));
    } finally {
      setDocLoading(null);
    }
    setViewingDoc({ type, title, app, url });
  };

  const handleApprove = async (app: AdvisorApplication) => {
    setProcessingId(app.userId);
    try {
      await backendService.api.put(`/advisors/admin/${app.userId}/approve`);
      toast.success(`${app.fullName}'s advisor profile is now ACTIVE.`);
      closeReview();
    } catch (err: any) {
      toast.error(apiError(err, 'Approval failed. Please try again.'));
    } finally {
      setProcessingId(null);
      fetchApplications();
    }
  };

  const handleReject = async () => {
    if (!selectedApp || !rejectReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setProcessingId(selectedApp.userId);
    try {
      await backendService.api.put(`/advisors/admin/${selectedApp.userId}/reject`, { reason: rejectReason.trim() });
      toast.success('Application rejected. User has been notified.');
      closeReview();
    } catch (err: any) {
      toast.error(apiError(err, 'Rejection failed'));
    } finally {
      setProcessingId(null);
      fetchApplications();
    }
  };

  const filteredList = applications.filter((app) => {
    if (activeTab === 'all') return true;
    return app.status === activeTab.toUpperCase();
  });

  const statusBadge = (status: ApplicationStatus) => {
    const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
    const Icon = cfg.icon;
    return (
      <div className={cn('flex items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-bold', cfg.className)}>
        <Icon size={14} /> {cfg.label}
      </div>
    );
  };

  const detail = (label: string, value: React.ReactNode, icon?: React.ReactNode) => (
    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5 flex items-center gap-1">{icon}{label}</p>
      <div className="text-slate-900 font-bold text-sm break-words">{value}</div>
    </div>
  );

  return (
    <CenteredLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-20">

        {/* Manager Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-md">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">Compliance Dashboard</h1>
              <p className="text-sm text-slate-500 font-medium">Advisor Verification & KYC Management</p>
            </div>
          </div>
          <button
            onClick={fetchApplications}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all text-slate-600 shadow-sm"
            data-testid="manager-verify-refresh-button"
            title="Refresh list"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-2xl w-fit max-w-full">
          {(['pending', 'approved', 'rejected', 'all'] as FilterTab[]).map((tab) => {
            const count = tab === 'all' ? applications.length : applications.filter((a) => a.status === tab.toUpperCase()).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-5 py-2 rounded-xl text-sm font-bold capitalize transition-all select-none',
                  activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
                data-testid={`manager-verify-tab-${tab}-button`}
              >
                {tab} ({count})
              </button>
            );
          })}
        </div>

        {/* Queue List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 size={40} className="animate-spin text-slate-400" />
            <p className="text-slate-500 font-medium animate-pulse">Syncing verification queue...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-20 text-center space-y-4 shadow-sm">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
              <FileCheck size={40} className="text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">{activeTab === 'pending' ? 'Queue is Clear' : 'Nothing here yet'}</h3>
            <p className="text-slate-500 max-w-xs mx-auto text-sm">
              {activeTab === 'pending' ? 'All advisor applications have been processed.' : `No ${activeTab === 'all' ? '' : `${activeTab} `}applications to show.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredList.map((app) => (
                <motion.div
                  key={app.applicationId}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-5 min-w-0">
                      <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden relative group-hover:bg-slate-200 transition-colors shrink-0">
                        <span className="text-2xl font-black text-slate-900 relative z-10">{app.fullName.charAt(0)}</span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-black text-slate-900 truncate">{app.fullName}</h3>
                          {statusBadge(app.status)}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium min-w-0">
                            <Mail size={13} /> <span className="truncate">{app.email}</span>
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                            <Briefcase size={13} /> {app.expertise} · {app.experienceYears} yrs
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                            <Calendar size={13} /> Submitted {formatDate(app.submittedAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => setSelectedApp(app)}
                        className="px-6 py-2.5 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2"
                        data-testid={`manager-verify-review-button-${app.userId}`}
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

        {/* ─── Detailed Review Modal ────────────────────────────────────────── */}
        <AnimatePresence>
          {selectedApp && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8">
              <motion.div
                data-testid="manager-advisor-verification-div"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !processingId && closeReview()}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              />

              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.95 }}
                className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[2rem] sm:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col z-10"
              >
                {/* Modal Header */}
                <div className="px-6 sm:px-10 py-6 sm:py-8 border-b border-slate-100 flex items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-xl font-black shrink-0">
                      {selectedApp.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 truncate">{selectedApp.fullName}</h2>
                        {statusBadge(selectedApp.status)}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 font-medium">Application ID: {selectedApp.applicationId.slice(0, 8)}</p>
                    </div>
                  </div>
                  <button
                    data-testid="manager-advisor-verification-button"
                    onClick={closeReview}
                    className="p-2.5 hover:bg-slate-50 rounded-2xl transition-all text-slate-400 hover:text-slate-600 shrink-0"
                  >
                    <XCircle size={28} />
                  </button>
                </div>

                {/* Modal Body - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* Left Column: Submitted details */}
                    <div className="space-y-6">
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 text-slate-900 font-black uppercase tracking-wider text-xs">
                          <Info size={14} className="text-slate-600" /> Submitted Profile
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {detail('Expertise', selectedApp.expertise, <Briefcase size={10} />)}
                          {detail('Experience', `${selectedApp.experienceYears} years`)}
                          {detail('Organization', selectedApp.organizationName || '—', <Building size={10} />)}
                          {detail('Hourly Rate', selectedApp.hourlyRate != null ? `₹${selectedApp.hourlyRate.toLocaleString('en-IN')}` : 'Not set', <IndianRupee size={10} />)}
                          {detail('Email', selectedApp.email, <Mail size={10} />)}
                          {detail('Phone', selectedApp.phone, <Phone size={10} />)}
                        </div>
                        {detail('Bio', <span className="font-medium whitespace-pre-line">{selectedApp.bio}</span>)}
                      </section>
                    </div>

                    {/* Right Column: Documents & decision */}
                    <div className="space-y-6">
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 text-slate-900 font-black uppercase tracking-wider text-xs">
                          <FileText size={14} className="text-slate-600" /> Uploaded Documents
                        </div>
                        <div className="space-y-2.5">
                          {DOCUMENTS.map((doc) => {
                            const present = Boolean(selectedApp[doc.flag]);
                            return (
                              <div key={doc.type} className="w-full flex items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-slate-800 block">
                                    {doc.label} {!doc.required && <span className="font-medium text-slate-400">(optional)</span>}
                                  </span>
                                  <span className={cn('text-[10px] font-semibold flex items-center gap-1', present ? 'text-emerald-600' : doc.required ? 'text-amber-600' : 'text-slate-400')}>
                                    {present ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                    {present ? 'Uploaded' : 'Not provided'}
                                  </span>
                                </div>
                                {present && (
                                  <button
                                    type="button"
                                    onClick={() => openDocumentViewer(selectedApp, doc.type, doc.label)}
                                    disabled={docLoading !== null}
                                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                                    data-testid={`manager-verify-open-${doc.type}-button`}
                                  >
                                    {docLoading === doc.type ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                                    View
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className="space-y-2.5">
                        <div className="flex items-center gap-2 text-slate-900 font-black uppercase tracking-wider text-xs">
                          <Clock size={14} className="text-slate-600" /> Review History
                        </div>
                        {detail('Submitted', formatDate(selectedApp.submittedAt))}
                        {selectedApp.status !== 'PENDING' && detail(selectedApp.status === 'APPROVED' ? 'Approved' : 'Rejected', formatDate(selectedApp.reviewedAt))}
                        {selectedApp.status === 'REJECTED' && selectedApp.rejectionReason && detail('Rejection Reason', selectedApp.rejectionReason)}
                      </section>

                      {isRejecting && (
                        <section className="space-y-3 animate-in slide-in-from-bottom-2">
                          <div className="flex items-center gap-2 text-rose-600 font-black uppercase tracking-wider text-xs">
                            <Info size={14} /> Rejection Reason
                          </div>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="w-full p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs font-bold text-rose-900 placeholder:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
                            placeholder="Explain reason for rejection (e.g. Expired credentials or illegible ID)..."
                            rows={3}
                            autoFocus
                            data-testid="manager-verify-reject-reason-textarea"
                          />
                        </section>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modal Footer - Actions (only an undecided application can be decided here) */}
                <div className="px-6 sm:px-10 py-6 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-2 text-slate-500">
                    <ShieldCheck size={16} className="text-slate-400" />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {selectedApp.status === 'PENDING' ? 'Review the documents before deciding' : `Decision recorded ${formatDate(selectedApp.reviewedAt)}`}
                    </span>
                  </div>

                  {selectedApp.status === 'PENDING' && (
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      {!isRejecting ? (
                        <>
                          <button
                            onClick={() => setIsRejecting(true)}
                            disabled={processingId !== null}
                            className="flex-1 sm:flex-none px-6 py-3 bg-white border border-rose-200 text-rose-600 rounded-2xl font-bold text-xs hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
                            data-testid="manager-verify-reject-toggle"
                          >
                            <XCircle size={16} />
                            Reject Application
                          </button>
                          <button
                            onClick={() => handleApprove(selectedApp)}
                            disabled={processingId !== null}
                            className="flex-1 sm:flex-none px-8 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-60"
                            data-testid="manager-verify-approve-button"
                          >
                            {processingId === selectedApp.userId ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                            Approve Advisor
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setIsRejecting(false)}
                            className="flex-1 sm:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-50 transition-all"
                            data-testid="manager-verify-reject-cancel-button"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleReject}
                            disabled={processingId !== null || !rejectReason.trim()}
                            className="flex-1 sm:flex-none px-8 py-3 bg-rose-600 text-white rounded-2xl font-bold text-xs hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2 disabled:opacity-60"
                            data-testid="manager-verify-reject-confirm-button"
                          >
                            {processingId === selectedApp.userId ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                            Confirm Rejection
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ─── Document Viewer ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {viewingDoc && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md bg-slate-950/75">
              <motion.div
                initial={{ opacity: 0, scale: 0.93, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.93, y: 20 }}
                className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col text-white max-h-[92vh]"
              >
                <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-white truncate">{viewingDoc.title}</h3>
                      <p className="text-[11px] text-slate-400 truncate">Uploaded by {viewingDoc.app.fullName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {viewingDoc.url && (
                      <a
                        href={viewingDoc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-xl text-slate-300 transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                    <button
                      onClick={() => setViewingDoc(null)}
                      className="p-2 bg-slate-800/80 hover:bg-rose-500 hover:text-white border border-slate-700/60 rounded-xl text-slate-400 transition-colors"
                      title="Close viewer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 bg-slate-950 p-4 sm:p-8 flex items-center justify-center overflow-auto min-h-[380px]">
                  {!viewingDoc.url ? (
                    <div className="text-center space-y-3 max-w-sm">
                      <AlertTriangle size={36} className="mx-auto text-amber-400" />
                      <p className="text-sm font-bold">This document could not be loaded</p>
                      <p className="text-xs text-slate-400">
                        The file is on record but a secure link could not be issued. Do not approve an application whose documents you have not been able to inspect — try again, or escalate to an admin.
                      </p>
                    </div>
                  ) : isPdfUrl(viewingDoc.url) ? (
                    <iframe
                      src={viewingDoc.url}
                      title={viewingDoc.title}
                      className="w-full h-[70vh] rounded-2xl bg-white"
                    />
                  ) : (
                    <img
                      src={viewingDoc.url}
                      alt={viewingDoc.title}
                      className="max-w-full max-h-[70vh] object-contain rounded-2xl bg-white"
                    />
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </CenteredLayout>
  );
};
