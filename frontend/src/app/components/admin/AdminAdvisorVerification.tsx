import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
  Shield, CheckCircle2, XCircle, Clock, Users, Star,
  Loader2, AlertTriangle, ChevronLeft, RefreshCw,
  BadgeCheck, UserX, Mail, Calendar, Briefcase, FileText,
  ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AdvisorApplicationRow {
  applicationId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  experienceYears: number;
  expertise: string;
  organizationName?: string;
  bio: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
  hasPan: boolean;
  hasAadhaar: boolean;
  hasCert: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    isApproved: boolean;
    createdAt: string;
    sessionCount: number;
    isAvailable: boolean;
  };
}

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock },
  APPROVED: { label: 'Approved', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: BadgeCheck },
  REJECTED: { label: 'Rejected', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
};

export const AdminAdvisorVerification: React.FC = () => {
  const { setCurrentPage, goBack } = useApp();
  const { role, loading: authLoading, dataReady } = useAuth();
  const [allApplications, setAllApplications] = useState<AdvisorApplicationRow[]>([]);
  const [pending, setPending] = useState<AdvisorApplicationRow[]>([]);
  const [approved, setApproved] = useState<AdvisorApplicationRow[]>([]);
  const [rejected, setRejected] = useState<AdvisorApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ userId: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingDocUrl, setLoadingDocUrl] = useState<string | null>(null);

  const isFetching = useRef(false);

  const fetchApplications = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    setLoading(true);
    try {
      const data = await backendService.api.get('/advisors/admin/applications');
      const result = data.data;
      setPending(result.pending || []);
      setApproved(result.approved || []);
      setRejected(result.rejected || []);
      setAllApplications(result.all || []);
    } catch {
      toast.error('Failed to load advisor applications');
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, []);

  useEffect(() => {
    if (authLoading || !dataReady || !['admin', 'manager'].includes(role)) return;
    fetchApplications();
  }, [fetchApplications, authLoading, dataReady, role]);

  if (authLoading || !dataReady) {
    return (
      <CenteredLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      </CenteredLayout>
    );
  }

  if (!['admin', 'manager'].includes(role)) {
    return (
      <CenteredLayout>
        <div className="text-center py-16">
          <Shield size={48} className="mx-auto text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
          <p className="text-gray-500 mt-2">Only admins and managers can access advisor verification.</p>
          <button data-testid="admin-advisor-verification-go-to-dashboard" type="button" onClick={() => setCurrentPage('dashboard')} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-xl font-medium">
            Go to Dashboard
          </button>
        </div>
      </CenteredLayout>
    );
  }

  const handleApprove = async (userId: string, name: string) => {
    setProcessingId(userId);
    try {
      await backendService.api.put(`/advisors/admin/${userId}/approve`);
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
    setProcessingId(rejectModal.userId);
    try {
      await backendService.api.put(`/advisors/admin/${rejectModal.userId}/reject`, { reason: rejectReason });
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

  const openDocument = async (applicationId: string, docType: 'pan' | 'aadhaar' | 'cert') => {
    const key = `${applicationId}-${docType}`;
    setLoadingDocUrl(key);
    try {
      const res = await backendService.api.get(`/advisors/application/${applicationId}/document/${docType}`);
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Failed to load document');
    } finally {
      setLoadingDocUrl(null);
    }
  };

  const displayList: AdvisorApplicationRow[] =
    activeTab === 'pending' ? pending
    : activeTab === 'approved' ? approved
    : activeTab === 'rejected' ? rejected
    : allApplications;

  const statusBadge = (status: AdvisorApplicationRow['status']) => {
    const cfg = STATUS_CONFIG[status];
    const Icon = cfg.icon;
    return (
      <span className={cn('flex items-center gap-1 px-2.5 py-1 border rounded-full text-[11px] font-bold', cfg.color)}>
        <Icon size={12} /> {cfg.label}
      </span>
    );
  };

  return (
    <CenteredLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button data-testid="admin-advisor-verification-go-back" type="button" onClick={goBack} aria-label="Go back" className="p-2 hover:bg-gray-100 rounded-xl transition-colors md:!hidden">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none flex-1">
            Advisor Verification
          </h1>
          <button data-testid="admin-advisor-verification-refresh"
            type="button"
            onClick={fetchApplications}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Pending', value: pending.length, icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-200' },
            { label: 'Approved', value: approved.length, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
            { label: 'Rejected', value: rejected.length, icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200' },
            { label: 'Total', value: allApplications.length, icon: Users, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
          ].map((stat) => (
            <div key={stat.label} className={cn('rounded-2xl border p-4', stat.color)}>
              <stat.icon size={18} className="mb-2" />
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
            { id: 'approved', label: `Approved (${approved.length})` },
            { id: 'rejected', label: `Rejected (${rejected.length})` },
            { id: 'all', label: 'All' },
          ] as { id: FilterTab; label: string }[]).map((tab) => (
            <button data-testid={`admin-advisor-verification-button-${tab.id}`}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn('px-4 py-2 rounded-lg text-sm font-bold transition-all', activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
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
              {displayList.map((app) => {
                const isExpanded = expandedId === app.applicationId;
                return (
                  <motion.div
                    key={app.applicationId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    {/* Card Header */}
                    <div className="flex items-start gap-4 p-5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shrink-0">
                        {app.fullName?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-gray-900">{app.fullName}</h3>
                          {statusBadge(app.status)}
                          {app.user?.sessionCount !== undefined && app.user.sessionCount > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-gray-500">
                              <Star size={11} className="text-amber-400" /> {app.user.sessionCount} sessions
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 text-sm text-gray-500">
                            <Mail size={12} /> {app.email}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Calendar size={11} /> {new Date(app.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Briefcase size={11} /> {app.experienceYears}y · {app.expertise}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button data-testid={`admin-advisor-verification-is-expanded-collapse-details-${app.applicationId}`}
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : app.applicationId)}
                          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                        >
                          {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                        </button>

                        {app.status === 'PENDING' && (
                          <>
                            <button data-testid={`admin-advisor-verification-approve-${app.applicationId}`}
                              type="button"
                              onClick={() => handleApprove(app.userId, app.fullName)}
                              disabled={processingId === app.userId}
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                            >
                              {processingId === app.userId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              Approve
                            </button>
                            <button data-testid={`admin-advisor-verification-reject-${app.applicationId}`}
                              type="button"
                              onClick={() => setRejectModal({ userId: app.userId, name: app.fullName })}
                              disabled={processingId === app.userId}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-bold hover:bg-red-100 transition-all disabled:opacity-50"
                            >
                              <XCircle size={14} />
                              Reject
                            </button>
                          </>
                        )}

                        {app.status === 'APPROVED' && (
                          <button data-testid={`admin-advisor-verification-revoke-${app.applicationId}`}
                            type="button"
                            onClick={() => setRejectModal({ userId: app.userId, name: app.fullName })}
                            disabled={processingId === app.userId}
                            className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-sm font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                          >
                            <UserX size={14} />
                            Revoke
                          </button>
                        )}

                        {app.status === 'REJECTED' && (
                          <button data-testid={`admin-advisor-verification-approve-2-${app.applicationId}`}
                            type="button"
                            onClick={() => handleApprove(app.userId, app.fullName)}
                            disabled={processingId === app.userId}
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                          >
                            {processingId === app.userId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Approve
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">

                            {/* Bio + Professional */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Professional Bio</p>
                                <p className="text-sm text-gray-700 leading-relaxed">{app.bio}</p>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Details</p>
                                  <div className="space-y-1 text-sm text-gray-700">
                                    <p><span className="text-gray-400">Phone:</span> {app.phone}</p>
                                    <p><span className="text-gray-400">Experience:</span> {app.experienceYears} years</p>
                                    <p><span className="text-gray-400">Expertise:</span> {app.expertise}</p>
                                    {app.organizationName && <p><span className="text-gray-400">Organization:</span> {app.organizationName}</p>}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Rejection reason (if rejected) */}
                            {app.status === 'REJECTED' && app.rejectionReason && (
                              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                                <p className="text-xs font-bold text-red-600 mb-1">Rejection Reason</p>
                                <p className="text-sm text-red-800">{app.rejectionReason}</p>
                              </div>
                            )}

                            {/* Documents */}
                            <div>
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Uploaded Documents</p>
                              <div className="flex gap-2 flex-wrap">
                                {[
                                  { label: 'PAN Card', type: 'pan' as const, has: app.hasPan },
                                  { label: 'Aadhaar Card', type: 'aadhaar' as const, has: app.hasAadhaar },
                                  { label: 'Certificate', type: 'cert' as const, has: app.hasCert },
                                ].map((doc) => {
                                  const key = `${app.applicationId}-${doc.type}`;
                                  return doc.has ? (
                                    <button data-testid={`admin-advisor-verification-button-2-${doc.type}`}
                                      key={doc.type}
                                      type="button"
                                      onClick={() => openDocument(app.applicationId, doc.type)}
                                      disabled={loadingDocUrl === key}
                                      className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors disabled:opacity-50"
                                    >
                                      {loadingDocUrl === key ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                                      {doc.label}
                                      <ExternalLink size={11} />
                                    </button>
                                  ) : (
                                    <span key={doc.type} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-400 rounded-xl text-xs">
                                      <FileText size={12} />
                                      {doc.label} — not uploaded
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
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
                <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-2">Reason (optional)</label>
                <textarea data-testid="admin-advisor-verification-explain-why-this-application"
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                  placeholder="Explain why this application is being rejected..."
                />
                <div className="flex gap-3 mt-4">
                  <button data-testid="admin-advisor-verification-cancel"
                    type="button"
                    onClick={() => { setRejectModal(null); setRejectReason(''); }}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button data-testid="admin-advisor-verification-confirm-reject"
                    type="button"
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
