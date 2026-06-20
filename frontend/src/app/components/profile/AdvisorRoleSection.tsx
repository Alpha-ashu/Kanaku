import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle,
  Upload, FileText, AlertTriangle, Loader2, ToggleLeft, ToggleRight,
  Wifi, WifiOff, Minus, Star, Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { backendService } from '@/lib/backend-api';
import { cn } from '@/lib/utils';

interface ApplicationState {
  id: string;
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
}

interface Props {
  userRole: string;
  userName: string;
  userEmail: string;
}

const STATUS_CONFIG = {
  PENDING: { label: 'Pending Review', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock },
  APPROVED: { label: 'Approved', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
};

const ONLINE_STATUS_CONFIG = {
  AVAILABLE: { label: 'Available', color: 'bg-emerald-500', icon: Wifi, textColor: 'text-emerald-700' },
  BUSY: { label: 'Busy', color: 'bg-red-500', icon: Minus, textColor: 'text-red-700' },
  NOT_AVAILABLE: { label: 'Not Available', color: 'bg-gray-400', icon: WifiOff, textColor: 'text-gray-600' },
};

type OnlineStatus = 'AVAILABLE' | 'BUSY' | 'NOT_AVAILABLE';

export const AdvisorRoleSection: React.FC<Props> = ({ userRole, userName, userEmail }) => {
  const [expanded, setExpanded] = useState(true);
  const [application, setApplication] = useState<ApplicationState | null>(null);
  const [roleMode, setRoleMode] = useState<'user' | 'advisor'>('user');
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('NOT_AVAILABLE');
  const [loadingApp, setLoadingApp] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [switchingStatus, setSwitchingStatus] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    fullName: userName,
    email: userEmail,
    phone: '',
    experienceYears: '',
    expertise: '',
    organizationName: '',
    bio: '',
    confirmed: false,
  });
  const [panFile, setPanFile] = useState<File | null>(null);
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const panRef = useRef<HTMLInputElement>(null);
  const aadhaarRef = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);

  const isAdvisor = userRole === 'advisor';
  const isApprovedAdvisor = isAdvisor && isApproved;

  // Always fetch on mount so approved advisors see their controls immediately
  useEffect(() => {
    fetchApplication();
  }, []);

  // Also re-fetch when panel is expanded (in case state changed)
  useEffect(() => {
    if (expanded && !loadingApp) {
      fetchApplication();
    }
  }, [expanded]);

  const fetchApplication = async () => {
    setLoadingApp(true);
    try {
      const res = await backendService.api.get('/advisors/application/my');
      setApplication(res.data.application);
      setIsApproved(res.data.isApproved ?? false);
      setRoleMode(res.data.roleMode ?? 'user');
      setOnlineStatus(res.data.advisorStatus ?? 'NOT_AVAILABLE');
    } catch {
      // non-fatal; user may not have an application yet
    } finally {
      setLoadingApp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.confirmed) {
      toast.error('Please confirm that all submitted information is accurate');
      return;
    }
    if (!panFile) { toast.error('PAN Card is required'); return; }
    if (!aadhaarFile) { toast.error('Aadhaar Card is required'); return; }

    const data = new FormData();
    data.append('fullName', formData.fullName);
    data.append('email', formData.email);
    data.append('phone', formData.phone);
    data.append('experienceYears', formData.experienceYears);
    data.append('expertise', formData.expertise);
    data.append('organizationName', formData.organizationName);
    data.append('bio', formData.bio);
    data.append('panDocument', panFile);
    data.append('aadhaarDocument', aadhaarFile);
    if (certFile) data.append('certDocument', certFile);

    setSubmitting(true);
    try {
      await backendService.api.post('/advisors/apply', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Application submitted! Our team will review within 4–7 business days.');
      setShowForm(false);
      await fetchApplication();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchMode = async () => {
    const newMode = roleMode === 'advisor' ? 'user' : 'advisor';
    setSwitchingMode(true);
    try {
      await backendService.api.put('/advisors/role-mode', { mode: newMode });
      setRoleMode(newMode);
      toast.success(`Switched to ${newMode} mode`);
    } catch {
      toast.error('Failed to switch mode');
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleStatusChange = async (status: OnlineStatus) => {
    if (status === onlineStatus) return;
    setSwitchingStatus(true);
    try {
      await backendService.api.put('/advisors/online-status', { status });
      setOnlineStatus(status);
      toast.success(`Status updated to ${ONLINE_STATUS_CONFIG[status].label}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setSwitchingStatus(false);
    }
  };

  const renderStatusBadge = (status: ApplicationState['status']) => {
    const cfg = STATUS_CONFIG[status];
    const Icon = cfg.icon;
    return (
      <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border', cfg.color)}>
        <Icon size={12} />
        {cfg.label}
      </span>
    );
  };

  const renderFileInput = (
    label: string,
    required: boolean,
    file: File | null,
    setFile: (f: File | null) => void,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div data-testid="advisor-role-section-div"
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors',
          file ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-indigo-300 bg-gray-50',
        )}
      >
        {file ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <Upload size={16} className="text-gray-400 shrink-0" />}
        <span className={cn('text-sm truncate', file ? 'text-emerald-700 font-medium' : 'text-gray-500')}>
          {file ? file.name : 'Click to upload (PDF, JPG, PNG)'}
        </span>
        {file && (
          <button data-testid="advisor-role-section-button"
            type="button"
            onClick={(ev) => { ev.stopPropagation(); setFile(null); }}
            className="ml-auto text-gray-400 hover:text-red-500"
          >
            ×
          </button>
        )}
      </div>
      <input data-testid="advisor-role-section-upload"
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        aria-label={`Upload ${label}`}
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
    </div>
  );

  // If already an approved advisor — show controls only
  if (isApprovedAdvisor) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Star size={16} className="text-indigo-600" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">Advisor Controls</p>
            <p className="text-xs text-gray-500">Manage your advisor mode and availability</p>
          </div>
          <span className="ml-auto px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
            Approved Advisor
          </span>
        </div>

        <div className="p-6 space-y-5">
          {/* Role Mode Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 text-sm">Role Mode</p>
              <p className="text-xs text-gray-500 mt-0.5">Switch between user and advisor experience</p>
            </div>
            <button data-testid="advisor-role-section-button-2"
              type="button"
              onClick={handleSwitchMode}
              disabled={switchingMode}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {switchingMode
                ? <Loader2 size={16} className="animate-spin text-indigo-500" />
                : roleMode === 'advisor'
                  ? <ToggleRight size={20} className="text-indigo-600" />
                  : <ToggleLeft size={20} className="text-gray-400" />}
              <span className="text-sm font-bold capitalize">{roleMode}</span>
            </button>
          </div>

          {/* Online Status */}
          <div>
            <p className="font-semibold text-gray-900 text-sm mb-3">Availability Status</p>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(ONLINE_STATUS_CONFIG) as OnlineStatus[]).map((s) => {
                const cfg = ONLINE_STATUS_CONFIG[s];
                return (
                  <button data-testid={`advisor-role-section-button-3-${s}`}
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(s)}
                    disabled={switchingStatus}
                    className={cn(
                      'flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all disabled:opacity-50',
                      onlineStatus === s
                        ? `${cfg.textColor} bg-white border-current shadow-sm ring-1 ring-current`
                        : 'text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100',
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', cfg.color)} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // User or pending advisor
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Toggle header */}
      <button data-testid="advisor-role-section-button-4"
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
          <Briefcase size={16} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">Request Advisor Role</p>
          <p className="text-xs text-gray-500 mt-0.5">Apply to become a verified financial advisor</p>
        </div>
        {application && renderStatusBadge(application.status)}
        {expanded ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 p-6 space-y-5">
              {loadingApp ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                </div>
              ) : application ? (
                // Show current application status
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    {renderStatusBadge(application.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">Application Status</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Submitted {new Date(application.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {application.status === 'PENDING' && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Under Review</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          Your application has been submitted and is awaiting review. Verification takes approximately 4–7 business days.
                          You will receive an email notification once a decision is made.
                        </p>
                      </div>
                    </div>
                  )}

                  {application.status === 'APPROVED' && (
                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">Approved!</p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          Your advisor application has been approved. Your account now has advisor access.
                        </p>
                      </div>
                    </div>
                  )}

                  {application.status === 'REJECTED' && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                        <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-red-800">Application Not Approved</p>
                          {application.rejectionReason && (
                            <p className="text-xs text-red-700 mt-1">Reason: {application.rejectionReason}</p>
                          )}
                          <p className="text-xs text-red-600 mt-1">
                            You may review the feedback and submit a new application.
                          </p>
                        </div>
                      </div>
                      <button data-testid="advisor-role-section-resubmit-application"
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors"
                      >
                        Resubmit Application
                      </button>
                    </div>
                  )}
                </div>
              ) : showForm ? (
                // Application form
                <form data-testid="advisor-role-section-form" onSubmit={handleSubmit} className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-gray-900">Advisor Application</h4>
                    <button data-testid="advisor-role-section-cancel" type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-500 hover:text-gray-700">
                      Cancel
                    </button>
                  </div>

                  {/* Personal Info */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Personal Information</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="adv-fullName" className="block text-sm font-semibold text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                        <input data-testid="advisor-role-section-input"
                          id="adv-fullName"
                          type="text"
                          required
                          value={formData.fullName}
                          onChange={(e) => setFormData((p) => ({ ...p, fullName: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div>
                        <label htmlFor="adv-phone" className="block text-sm font-semibold text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label>
                        <input data-testid="advisor-role-section-91-xxxxx-xxxxx"
                          id="adv-phone"
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                          placeholder="+91 XXXXX XXXXX"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="adv-email" className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                      <input data-testid="advisor-role-section-input-2"
                        id="adv-email"
                        type="email"
                        value={formData.email}
                        readOnly
                        className="w-full px-3 py-2.5 border border-gray-100 bg-gray-50 rounded-xl text-sm text-gray-500 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Professional Info */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Professional Information</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="adv-experience" className="block text-sm font-semibold text-gray-700 mb-1">Years of Experience <span className="text-red-500">*</span></label>
                        <input data-testid="advisor-role-section-0"
                          id="adv-experience"
                          type="number"
                          required
                          min={0}
                          max={60}
                          placeholder="0"
                          value={formData.experienceYears}
                          onChange={(e) => setFormData((p) => ({ ...p, experienceYears: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div>
                        <label htmlFor="adv-expertise" className="block text-sm font-semibold text-gray-700 mb-1">Area of Expertise <span className="text-red-500">*</span></label>
                        <select data-testid="advisor-role-section-area-of-expertise"
                          id="adv-expertise"
                          required
                          title="Area of Expertise"
                          value={formData.expertise}
                          onChange={(e) => setFormData((p) => ({ ...p, expertise: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        >
                          <option data-testid="advisor-role-section-select-expertise" value="">Select expertise</option>
                          <option data-testid="advisor-role-section-financial-planning" value="Financial Planning">Financial Planning</option>
                          <option data-testid="advisor-role-section-investment-advisory" value="Investment Advisory">Investment Advisory</option>
                          <option data-testid="advisor-role-section-tax-planning" value="Tax Planning">Tax Planning</option>
                          <option data-testid="advisor-role-section-insurance-advisory" value="Insurance Advisory">Insurance Advisory</option>
                          <option data-testid="advisor-role-section-retirement-planning" value="Retirement Planning">Retirement Planning</option>
                          <option data-testid="advisor-role-section-wealth-management" value="Wealth Management">Wealth Management</option>
                          <option data-testid="advisor-role-section-debt-management" value="Debt Management">Debt Management</option>
                          <option data-testid="advisor-role-section-other" value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="adv-org" className="block text-sm font-semibold text-gray-700 mb-1">Organization Name <span className="text-gray-400 font-normal">(Optional)</span></label>
                      <input data-testid="advisor-role-section-company-or-firm-name"
                        id="adv-org"
                        type="text"
                        placeholder="Company or firm name"
                        value={formData.organizationName}
                        onChange={(e) => setFormData((p) => ({ ...p, organizationName: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Professional Bio <span className="text-red-500">*</span></label>
                      <textarea data-testid="advisor-role-section-describe-your-professional-background"
                        required
                        rows={4}
                        value={formData.bio}
                        onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
                        placeholder="Describe your professional background, qualifications, and how you can help clients..."
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                      />
                    </div>
                  </div>

                  {/* Documents */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Document Upload</p>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2">
                      <Shield size={14} className="shrink-0 mt-0.5" />
                      All documents are encrypted and only accessible to our verification team.
                    </div>
                    {renderFileInput('PAN Card', true, panFile, setPanFile, panRef)}
                    {renderFileInput('Aadhaar Card', true, aadhaarFile, setAadhaarFile, aadhaarRef)}
                    {renderFileInput('Professional Certificate / License', false, certFile, setCertFile, certRef)}
                    <p className="text-xs text-gray-400">
                      Accepted: CA Certification · CFP Certification · Investment Advisor License · Financial Advisor Certification · Other
                    </p>
                  </div>

                  {/* Declaration */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input data-testid="advisor-role-section-checkbox"
                      type="checkbox"
                      checked={formData.confirmed}
                      onChange={(e) => setFormData((p) => ({ ...p, confirmed: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">
                      I confirm that all submitted information and documents are accurate and I understand that false information may result in permanent account suspension.
                    </span>
                  </label>

                  <button data-testid="advisor-role-section-button-5"
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                    {submitting ? 'Submitting Application...' : 'Submit Application'}
                  </button>
                </form>
              ) : (
                // Info panel (pre-application)
                <div className="space-y-5">
                  {/* Benefits */}
                  <div>
                    <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <Star size={16} className="text-amber-500" />
                      Become an Advisor
                    </h4>
                    <ul className="space-y-2">
                      {[
                        'Provide financial guidance to users.',
                        'Earn through advisor consultations.',
                        'Receive advisor dashboard access.',
                        'Manage client sessions.',
                        'Build professional reputation within the platform.',
                      ].map((b) => (
                        <li key={b} className="flex items-start gap-2 text-sm text-gray-700">
                          <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Verification process */}
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <h5 className="font-semibold text-gray-900 text-sm mb-2 flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-500" />
                      Verification Process
                    </h5>
                    <ul className="space-y-1.5 text-xs text-gray-600">
                      <li>• All advisor applications are manually reviewed.</li>
                      <li>• Verification takes approximately 4–7 business days.</li>
                      <li>• Submitted documents will be reviewed by our management team.</li>
                      <li>• You will receive email notifications regarding application status.</li>
                    </ul>
                  </div>

                  {/* Required documents */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Required Documents</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['PAN Card (mandatory)', 'Aadhaar Card (mandatory)', 'Professional Certificate', 'Advisor License'].map((d) => (
                        <div key={d} className="flex items-center gap-2 p-2 bg-white border border-gray-100 rounded-lg text-xs text-gray-700">
                          <FileText size={12} className="text-indigo-500 shrink-0" />
                          {d}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button data-testid="advisor-role-section-apply-now"
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Briefcase size={16} />
                    Apply Now
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
