import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  adminConsoleService,
  SystemStatsDto,
  AdminUserDto,
  UserActivityDto,
  UserStorageStatsDto,
  UserMetricsDto,
  DemoUserDto,
  ApprovalRequestDto,
  AuditLogDto,
} from '@/services/adminConsoleService';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import {
  ChevronLeft, ChevronRight, Shield, Activity, Receipt,
  Users, UserCog, User, ShieldCheck, Plus, Search,
  Trash2, Ban, CheckCircle2, XCircle, Database, Clock,
  RefreshCw, Check, AlertCircle, FileText, CheckSquare, Sparkles, Filter, Lock, Unlock, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const AdminDashboard: React.FC = () => {
  const { setCurrentPage, goBack } = useApp();
  const { role } = useAuth();
  const { resetToDefaults } = useFeatureFlags();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'demo-accounts' | 'approvals' | 'audit-logs'>('overview');

  // Core stats
  const [stats, setStats] = useState<SystemStatsDto | null>(null);
  const [userMetrics, setUserMetrics] = useState<UserMetricsDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Users Tab state
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDto | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivityDto | null>(null);
  const [userStorageStats, setUserStorageStats] = useState<UserStorageStatsDto | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedAccountTypeFilter, setSelectedAccountTypeFilter] = useState<string>('all');
  const [userSearchText, setUserSearchText] = useState<string>('');
  const [usersPage, setUsersPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Demo Accounts Tab state
  const [demoAccounts, setDemoAccounts] = useState<DemoUserDto[]>([]);
  const [demoRoleFilter, setDemoRoleFilter] = useState<string>('all');
  const [demoStatusFilter, setDemoStatusFilter] = useState<string>('all');
  const [demoSearchText, setDemoSearchText] = useState<string>('');
  const [demoLoading, setDemoLoading] = useState(false);
  const [showCreateDemoModal, setShowCreateDemoModal] = useState(false);
  const [createDemoForm, setCreateDemoForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' as 'user' | 'advisor' | 'manager' | 'admin',
  });
  const [creatingDemo, setCreatingDemo] = useState(false);

  // Approvals Tab state
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequestDto[]>([]);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<string>('PENDING');
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; requestId: string | null; reason: string }>({
    open: false,
    requestId: null,
    reason: '',
  });

  // Audit Logs Tab state
  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([]);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  // Modals / confirmations
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; user: AdminUserDto | null }>({ open: false, user: null });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const hasFetchedRef = useRef(false);
  const activityAbortRef = useRef<AbortController | null>(null);

  // Fetch metrics & overview
  const fetchOverviewData = useCallback(async () => {
    try {
      setLoading(true);
      const [s, m] = await Promise.all([
        adminConsoleService.getStats(),
        adminConsoleService.getUserStats(),
      ]);
      if (s) setStats(s);
      if (m) setUserMetrics(m);
    } catch {
      toast.error('Failed to load system metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch users with filters
  const fetchUsers = useCallback(async () => {
    try {
      const u = await adminConsoleService.getUsers({
        role: selectedRoleFilter === 'all' ? undefined : selectedRoleFilter,
        status: selectedStatusFilter === 'all' ? undefined : selectedStatusFilter,
        accountType: selectedAccountTypeFilter === 'all' ? undefined : selectedAccountTypeFilter,
        search: userSearchText.trim() || undefined,
      });
      if (u) setUsers(u);
    } catch {
      toast.error('Failed to fetch user list');
    }
  }, [selectedRoleFilter, selectedStatusFilter, selectedAccountTypeFilter, userSearchText]);

  // Fetch demo accounts
  const fetchDemoAccounts = useCallback(async () => {
    try {
      setDemoLoading(true);
      const res = await adminConsoleService.getDemoAccounts({
        role: demoRoleFilter === 'all' ? undefined : demoRoleFilter,
        status: demoStatusFilter === 'all' ? undefined : demoStatusFilter,
        search: demoSearchText.trim() || undefined,
      });
      if (res && res.users) {
        setDemoAccounts(res.users);
      }
    } catch {
      toast.error('Failed to fetch demo accounts');
    } finally {
      setDemoLoading(false);
    }
  }, [demoRoleFilter, demoStatusFilter, demoSearchText]);

  // Fetch approvals
  const fetchApprovals = useCallback(async () => {
    try {
      setApprovalsLoading(true);
      const res = await adminConsoleService.getApprovals(approvalStatusFilter);
      if (res && res.requests) {
        setApprovalRequests(res.requests);
      }
    } catch {
      toast.error('Failed to fetch approval requests');
    } finally {
      setApprovalsLoading(false);
    }
  }, [approvalStatusFilter]);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      setAuditLogsLoading(true);
      const res = await adminConsoleService.getAuditLogs({
        action: auditActionFilter || undefined,
        limit: 50,
      });
      if (res && res.logs) {
        setAuditLogs(res.logs);
      }
    } catch {
      toast.error('Failed to fetch audit logs');
    } finally {
      setAuditLogsLoading(false);
    }
  }, [auditActionFilter]);

  // Initial load
  useEffect(() => {
    if (role !== 'admin' || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    void fetchOverviewData();
    void fetchUsers();
  }, [role, fetchOverviewData, fetchUsers]);

  // Refresh tab data on switch
  useEffect(() => {
    if (activeTab === 'overview') {
      void fetchOverviewData();
    } else if (activeTab === 'users') {
      void fetchUsers();
    } else if (activeTab === 'demo-accounts') {
      void fetchDemoAccounts();
    } else if (activeTab === 'approvals') {
      void fetchApprovals();
    } else if (activeTab === 'audit-logs') {
      void fetchAuditLogs();
    }
  }, [activeTab, fetchOverviewData, fetchUsers, fetchDemoAccounts, fetchApprovals, fetchAuditLogs]);

  // User pagination
  const totalPages = Math.ceil(users.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const startIndex = (usersPage - 1) * itemsPerPage;
    return users.slice(startIndex, startIndex + itemsPerPage);
  }, [users, usersPage, itemsPerPage]);

  useEffect(() => {
    setUsersPage(1);
  }, [users]);

  const fetchUserActivity = async (u: AdminUserDto) => {
    if (activityAbortRef.current) activityAbortRef.current.abort();
    const controller = new AbortController();
    activityAbortRef.current = controller;

    try {
      setSelectedUser(u);
      setUserActivity(null);
      setUserStorageStats(null);
      const act = await adminConsoleService.getActivity(u.id);
      if (!controller.signal.aborted && act) setUserActivity(act);

      setStorageLoading(true);
      try {
        const storage = await adminConsoleService.getUserStorageStats(u.id);
        if (!controller.signal.aborted) setUserStorageStats(storage);
      } catch {
        // non-blocking
      } finally {
        if (!controller.signal.aborted) setStorageLoading(false);
      }
    } catch {
      if (!controller.signal.aborted) toast.error('Failed to load user activity');
    }
  };

  const handleToggleStatus = async (u: AdminUserDto) => {
    const newStatus = u.status === 'blocked' ? 'verified' : 'blocked';
    if (!confirm(`Are you sure you want to ${newStatus === 'blocked' ? 'BLOCK' : 'UNBLOCK'} ${u.name}?`)) return;

    try {
      await adminConsoleService.toggleUserStatus(u.id, newStatus);
      toast.success(`User ${newStatus} successfully`);
      void fetchUsers();
      void fetchOverviewData();
      if (selectedUser?.id === u.id) setSelectedUser({ ...u, status: newStatus });
    } catch {
      toast.error('Failed to update user status');
    }
  };

  const handleRoleChange = async (u: AdminUserDto, newRole: 'admin' | 'manager' | 'advisor' | 'user') => {
    if (!confirm(`Are you sure you want to change ${u.name}'s role to ${newRole.toUpperCase()}?`)) return;

    try {
      await adminConsoleService.updateUserRole(u.id, newRole);
      toast.success(`Role updated to ${newRole.toUpperCase()} successfully`);
      void fetchUsers();
      void fetchOverviewData();
      if (selectedUser?.id === u.id) setSelectedUser({ ...u, role: newRole });
    } catch {
      toast.error('Failed to update user role');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirm.user) return;
    try {
      setDeleteLoading(true);
      await adminConsoleService.deleteUser(deleteConfirm.user.id);
      toast.success('User deleted successfully');
      setDeleteConfirm({ open: false, user: null });
      if (selectedUser?.id === deleteConfirm.user.id) setSelectedUser(null);
      void fetchUsers();
      void fetchOverviewData();
    } catch {
      toast.error('Failed to delete user');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Demo Account Handlers
  const handleToggleDemoStatus = async (demoUser: DemoUserDto) => {
    const nextStatus = demoUser.demoStatus === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    const actionWord = nextStatus === 'ENABLED' ? 'enable' : 'disable';

    if (!confirm(`Are you sure you want to ${actionWord} the demo account for ${demoUser.name}? ${nextStatus === 'DISABLED' ? 'The user will immediately be signed out.' : ''}`)) {
      return;
    }

    try {
      const res = await adminConsoleService.toggleDemoStatus(demoUser.id, nextStatus);
      if (res?.approvalRequired) {
        toast.info(res.message);
      } else {
        toast.success(res?.message || 'Demo account status updated');
      }
      void fetchDemoAccounts();
      void fetchOverviewData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to toggle demo status');
    }
  };

  const handleResetDemoAccount = async (demoUser: DemoUserDto) => {
    if (!confirm(`Reset all financial balances and transactions for demo account ${demoUser.name}? This will restore a clean demo profile.`)) {
      return;
    }

    try {
      await adminConsoleService.resetDemoAccount(demoUser.id);
      toast.success('Demo account data reset successfully.');
      void fetchDemoAccounts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset demo account');
    }
  };

  const handleCreateDemoAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createDemoForm.name || !createDemoForm.email) {
      toast.error('Please enter name and email.');
      return;
    }

    setCreatingDemo(true);
    try {
      await adminConsoleService.createDemoAccount(createDemoForm);
      toast.success('Demo account created successfully!');
      setShowCreateDemoModal(false);
      setCreateDemoForm({ name: '', email: '', password: '', role: 'user' });
      void fetchDemoAccounts();
      void fetchOverviewData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create demo account');
    } finally {
      setCreatingDemo(false);
    }
  };

  // Approval Handlers
  const handleApproveRequest = async (requestId: string) => {
    if (!confirm('Approve and execute this action?')) return;
    try {
      await adminConsoleService.approveRequest(requestId);
      toast.success('Request approved and executed successfully');
      void fetchApprovals();
      void fetchOverviewData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve request');
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectModal.requestId) return;
    try {
      await adminConsoleService.rejectRequest(rejectModal.requestId, rejectModal.reason);
      toast.success('Request rejected');
      setRejectModal({ open: false, requestId: null, reason: '' });
      void fetchApprovals();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject request');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
      <CenteredLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button data-testid="admin-dashboard-button" onClick={goBack} className="lg:!hidden p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Admin Console</h2>
                <p className="text-slate-500 font-medium text-sm mt-0.5">System governance, RBAC & demo accounts</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-2xl w-fit shadow-inner">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'users', label: 'User Directory' },
                { id: 'demo-accounts', label: 'Demo Accounts' },
                { id: 'approvals', label: 'Approvals Queue' },
                { id: 'audit-logs', label: 'Audit Logs' },
              ].map(tab => (
                <button
                  data-testid={`admin-dashboard-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-black transition-all select-none',
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ─── OVERVIEW TAB ──────────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Primary User Breakdown KPI Grid */}
              {userMetrics && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Users</span>
                    <span className="text-xl font-black text-slate-900">{userMetrics.total}</span>
                  </div>
                  <div className="bg-emerald-50/60 border border-emerald-100/80 rounded-2xl p-4 shadow-sm">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1">Active</span>
                    <span className="text-xl font-black text-emerald-700">{userMetrics.active}</span>
                  </div>
                  <div className="bg-rose-50/60 border border-rose-100/80 rounded-2xl p-4 shadow-sm">
                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-1">Disabled</span>
                    <span className="text-xl font-black text-rose-700">{userMetrics.disabled}</span>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-100/80 rounded-2xl p-4 shadow-sm">
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-1">Pending Verify</span>
                    <span className="text-xl font-black text-amber-700">{userMetrics.pending}</span>
                  </div>
                  <div className="bg-indigo-50/60 border border-indigo-100/80 rounded-2xl p-4 shadow-sm">
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Demo Accounts</span>
                    <span className="text-xl font-black text-indigo-700">{userMetrics.demo}</span>
                  </div>
                  <div className="bg-blue-50/60 border border-blue-100/80 rounded-2xl p-4 shadow-sm">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-1">Normal Users</span>
                    <span className="text-xl font-black text-blue-700">{userMetrics.normal}</span>
                  </div>
                </div>
              )}

              {/* Roles Breakdown */}
              {userMetrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Advisors</span>
                      <span className="text-lg font-black text-slate-900">{userMetrics.advisors}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                      <UserCog size={20} />
                    </div>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Managers</span>
                      <span className="text-lg font-black text-slate-900">{userMetrics.managers}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                      <Users size={20} />
                    </div>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Administrators</span>
                      <span className="text-lg font-black text-slate-900">{userMetrics.admins}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      <ShieldCheck size={20} />
                    </div>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Regular Users</span>
                      <span className="text-lg font-black text-slate-900">{userMetrics.users}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center font-bold">
                      <User size={20} />
                    </div>
                  </div>
                </div>
              )}

              {/* Server Metrics */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-white border border-slate-100 rounded-[32px] p-6 lg:p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Server Infrastructure</h3>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE: {stats?.system.hostname || 'Production'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* CPU Load */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">CPU Load</span>
                        <span className="text-sm font-bold text-slate-900">{stats?.system.cpu.load.toFixed(1) ?? '0.0'}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full transition-all duration-1000" style={{ width: `${stats?.system.cpu.load ?? 0}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">{stats?.system.cpu.cores ?? 1} Cores • {stats?.system.cpu.model.split('@')[0] ?? 'Node.js'}</p>
                    </div>

                    {/* RAM Usage */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">RAM Usage</span>
                        <span className="text-sm font-bold text-slate-900">{stats?.system.memory.percent.toFixed(1) ?? '0.0'}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full transition-all duration-1000" style={{ width: `${stats?.system.memory.percent ?? 0}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">{formatBytes(stats?.system.memory.used ?? 0)} / {formatBytes(stats?.system.memory.total ?? 0)}</p>
                    </div>

                    {/* Storage */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Storage</span>
                        <span className="text-sm font-bold text-slate-900">{((stats?.system.storage.usedBytes ?? 0) / (stats?.system.storage.totalBytes ?? 1) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600 rounded-full transition-all duration-1000" style={{ width: `${((stats?.system.storage.usedBytes ?? 0) / (stats?.system.storage.totalBytes ?? 1) * 100)}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">{formatBytes(stats?.system.storage.usedBytes ?? 0)} consumed</p>
                    </div>
                  </div>
                </div>

                {/* Master Feature Matrix Quick Access */}
                <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm group hover:border-indigo-100 transition-colors flex flex-col justify-between h-full">
                  <div className="flex flex-col gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Shield size={24} />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-slate-900 tracking-tight">Master Feature Matrix</h4>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed mt-2">
                        Configure role-based access control, manage global feature visibility, and control application readiness across all user segments.
                      </p>
                    </div>
                  </div>
                  <button
                    data-testid="admin-dashboard-manage-feature-matrix"
                    onClick={() => setCurrentPage('admin-feature-panel')}
                    className="mt-8 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 active:scale-95 text-center shrink-0"
                  >
                    Manage Feature Matrix
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── USER DIRECTORY TAB ────────────────────────────────────────────────── */}
          {activeTab === 'users' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Filter and Search Bar */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="relative w-full md:w-72">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search name, email..."
                    value={userSearchText}
                    onChange={(e) => setUserSearchText(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
                  {/* Role filter */}
                  <select
                    value={selectedRoleFilter}
                    onChange={(e) => setSelectedRoleFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl outline-none cursor-pointer"
                  >
                    <option value="all">All Roles</option>
                    <option value="user">Users</option>
                    <option value="advisor">Advisors</option>
                    <option value="manager">Managers</option>
                    <option value="admin">Admins</option>
                  </select>

                  {/* Status filter */}
                  <select
                    value={selectedStatusFilter}
                    onChange={(e) => setSelectedStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active / Verified</option>
                    <option value="disabled">Disabled / Blocked</option>
                    <option value="pending_verification">Pending Verify</option>
                  </select>

                  {/* Account Type filter */}
                  <select
                    value={selectedAccountTypeFilter}
                    onChange={(e) => setSelectedAccountTypeFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl outline-none cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="NORMAL">Normal</option>
                    <option value="DEMO">Demo Only</option>
                  </select>
                </div>
              </div>

              {/* Master-Detail User View */}
              <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,360px)_1fr] gap-4">
                {/* User List Panel */}
                <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm flex flex-col" style={{ minHeight: '440px', maxHeight: '72vh' }}>
                  <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">User Directory</h3>
                      <p className="text-[11px] text-slate-400 font-medium">{users.length} matching accounts</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                    {paginatedUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => fetchUserActivity(u)}
                        className={cn(
                          'w-full p-3.5 flex items-center gap-3 text-left transition-colors',
                          selectedUser?.id === u.id ? 'bg-slate-100/80' : 'hover:bg-slate-50/60'
                        )}
                      >
                        <div className={cn(
                          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-xs',
                          u.status === 'blocked' ? 'bg-rose-50 text-rose-600' :
                          u.accountType === 'DEMO' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-700'
                        )}>
                          {u.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-slate-900 truncate">{u.name}</p>
                            {u.accountType === 'DEMO' && (
                              <span className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md">DEMO</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold uppercase text-slate-500">{u.role}</span>
                            <span className="text-[9px] text-slate-300">•</span>
                            <span className={cn(
                              'text-[9px] font-semibold',
                              u.status === 'blocked' ? 'text-rose-500' :
                              u.emailVerified === false ? 'text-amber-500' : 'text-emerald-600'
                            )}>
                              {u.status === 'blocked' ? 'Blocked' : u.emailVerified === false ? 'Pending Verify' : 'Active'}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                    {users.length === 0 && (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        No users match current filters
                      </div>
                    )}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="p-3 border-t border-slate-50 flex items-center justify-between bg-slate-50/50">
                      <button
                        onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                        disabled={usersPage === 1}
                        className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-[11px] font-bold text-slate-600">Page {usersPage} of {totalPages}</span>
                      <button
                        onClick={() => setUsersPage(p => Math.min(totalPages, p + 1))}
                        disabled={usersPage === totalPages}
                        className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* User Detail & Control Panel */}
                <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm flex flex-col justify-between" style={{ minHeight: '440px' }}>
                  {!selectedUser ? (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-center text-slate-400">
                      <User size={36} className="mb-2 text-slate-300" />
                      <p className="text-xs font-bold text-slate-700">Select a user to view profile and manage permissions</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-base">
                            {selectedUser.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-slate-900">{selectedUser.name}</h3>
                              {selectedUser.accountType === 'DEMO' && (
                                <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg">DEMO</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-medium">{selectedUser.email}</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleStatus(selectedUser)}
                            className={cn(
                              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5',
                              selectedUser.status === 'blocked'
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            )}
                          >
                            {selectedUser.status === 'blocked' ? <Unlock size={14} /> : <Ban size={14} />}
                            {selectedUser.status === 'blocked' ? 'Unblock User' : 'Block User'}
                          </button>

                          <button
                            onClick={() => setDeleteConfirm({ open: true, user: selectedUser })}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                            title="Delete User"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* User Metadata Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-100">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Role</span>
                          <select
                            value={selectedUser.role}
                            onChange={(e) => handleRoleChange(selectedUser, e.target.value as any)}
                            className="bg-transparent text-xs font-bold text-slate-900 outline-none cursor-pointer"
                          >
                            <option value="user">User</option>
                            <option value="advisor">Advisor</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>

                        <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-100">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Status</span>
                          <span className={cn(
                            'text-xs font-bold uppercase tracking-wider',
                            selectedUser.status === 'blocked' ? 'text-rose-600' : 'text-emerald-600'
                          )}>
                            {selectedUser.status || 'verified'}
                          </span>
                        </div>

                        <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-100">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Email Verified</span>
                          <span className="text-xs font-bold text-slate-900">
                            {selectedUser.emailVerified !== false ? 'Yes' : 'Pending'}
                          </span>
                        </div>

                        <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-100">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Joined</span>
                          <span className="text-xs font-bold text-slate-900">
                            {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Storage Breakdown */}
                      {storageLoading ? (
                        <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <RefreshCw size={14} className="animate-spin" /> Loading storage metrics...
                        </div>
                      ) : userStorageStats ? (
                        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                          <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-3">Resource Allocation</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                            <div className="bg-white p-2 rounded-xl border border-slate-100">
                              <span className="text-slate-400 text-[10px] block">Transactions</span>
                              <span className="font-bold text-slate-800">{userStorageStats.stats.transactions}</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100">
                              <span className="text-slate-400 text-[10px] block">Accounts</span>
                              <span className="font-bold text-slate-800">{userStorageStats.stats.accounts}</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100">
                              <span className="text-slate-400 text-[10px] block">Goals</span>
                              <span className="font-bold text-slate-800">{userStorageStats.stats.goals}</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100">
                              <span className="text-slate-400 text-[10px] block">Loans</span>
                              <span className="font-bold text-slate-800">{userStorageStats.stats.loans}</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100">
                              <span className="text-slate-400 text-[10px] block">Investments</span>
                              <span className="font-bold text-slate-800">{userStorageStats.stats.investments}</span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── DEMO ACCOUNTS HUB TAB ─────────────────────────────────────────────── */}
          {activeTab === 'demo-accounts' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">Demo Accounts Management</h3>
                  <p className="text-xs text-slate-500">Database-driven testing identities. Disabling revokes active sessions immediately.</p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={demoRoleFilter}
                    onChange={(e) => setDemoRoleFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl outline-none cursor-pointer"
                  >
                    <option value="all">All Roles</option>
                    <option value="user">Users</option>
                    <option value="advisor">Advisors</option>
                    <option value="manager">Managers</option>
                    <option value="admin">Admins</option>
                  </select>

                  <select
                    value={demoStatusFilter}
                    onChange={(e) => setDemoStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="ENABLED">Enabled</option>
                    <option value="DISABLED">Disabled</option>
                  </select>

                  <button
                    onClick={() => setShowCreateDemoModal(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-100"
                  >
                    <Plus size={14} /> New Demo Account
                  </button>
                </div>
              </div>

              {/* Demo Accounts List */}
              <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm overflow-x-auto">
                {demoLoading ? (
                  <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin" /> Loading demo accounts...
                  </div>
                ) : demoAccounts.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No demo accounts found matching filters.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[10px]">
                        <th className="pb-3 font-black">Identity</th>
                        <th className="pb-3 font-black">Role</th>
                        <th className="pb-3 font-black">Demo Status</th>
                        <th className="pb-3 font-black">Data Overview</th>
                        <th className="pb-3 font-black text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {demoAccounts.map(demoUser => (
                        <tr key={demoUser.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 pr-4">
                            <p className="font-bold text-slate-900 text-sm">{demoUser.name}</p>
                            <p className="text-slate-400 text-[11px] font-mono">{demoUser.email}</p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <span className={cn(
                              'px-2 py-0.5 rounded-md font-bold uppercase text-[10px]',
                              demoUser.role === 'admin' ? 'bg-red-50 text-red-700' :
                              demoUser.role === 'manager' ? 'bg-blue-50 text-blue-700' :
                              demoUser.role === 'advisor' ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-700'
                            )}>
                              {demoUser.role}
                            </span>
                          </td>
                          <td className="py-3.5 pr-4">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase',
                              demoUser.demoStatus === 'ENABLED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                            )}>
                              {demoUser.demoStatus === 'ENABLED' ? <Check size={12} /> : <Ban size={12} />}
                              {demoUser.demoStatus}
                            </span>
                          </td>
                          <td className="py-3.5 pr-4 text-[11px] text-slate-600">
                            {demoUser._count ? (
                              <span>{demoUser._count.transactions} txs • {demoUser._count.accounts} accts • {demoUser._count.goals} goals</span>
                            ) : (
                              <span className="text-slate-400">Baseline schema</span>
                            )}
                          </td>
                          <td className="py-3.5 text-right space-x-2">
                            <button
                              onClick={() => handleToggleDemoStatus(demoUser)}
                              className={cn(
                                'px-3 py-1.5 rounded-xl font-bold transition-all text-xs',
                                demoUser.demoStatus === 'ENABLED'
                                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              )}
                            >
                              {demoUser.demoStatus === 'ENABLED' ? 'Disable Access' : 'Enable Access'}
                            </button>
                            <button
                              onClick={() => handleResetDemoAccount(demoUser)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all text-xs"
                            >
                              Reset Data
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ─── APPROVALS QUEUE TAB ───────────────────────────────────────────────── */}
          {activeTab === 'approvals' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">Manager Approval Requests</h3>
                  <p className="text-xs text-slate-500">Privileged actions submitted by managers requiring administrator review.</p>
                </div>
                <div className="flex gap-2">
                  {['PENDING', 'APPROVED', 'REJECTED', 'all'].map(st => (
                    <button
                      key={st}
                      onClick={() => setApprovalStatusFilter(st)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all',
                        approvalStatusFilter === st ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Approvals List */}
              <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm">
                {approvalsLoading ? (
                  <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin" /> Loading approval queue...
                  </div>
                ) : approvalRequests.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No approval requests found with status {approvalStatusFilter}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {approvalRequests.map(req => (
                      <div key={req.id} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-xs uppercase tracking-wider">{req.actionType.replace(/_/g, ' ')}</span>
                            <span className={cn(
                              'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider',
                              req.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                              req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            )}>
                              {req.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Requested by <span className="font-bold text-slate-800">{req.requester?.name || req.requesterId}</span>
                            {req.targetUser && (
                              <> for target <span className="font-bold text-slate-800">{req.targetUser.name} ({req.targetUser.email})</span></>
                            )}
                          </p>
                          {req.reason && <p className="text-xs text-slate-500 italic">Reason: &ldquo;{req.reason}&rdquo;</p>}
                          {req.rejectionReason && <p className="text-xs text-rose-500">Rejection note: {req.rejectionReason}</p>}
                          <p className="text-[10px] text-slate-400">{new Date(req.createdAt).toLocaleString()}</p>
                        </div>

                        {req.status === 'PENDING' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleApproveRequest(req.id)}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              onClick={() => setRejectModal({ open: true, requestId: req.id, reason: '' })}
                              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1"
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── AUDIT LOGS TAB ────────────────────────────────────────────────────── */}
          {activeTab === 'audit-logs' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">Immutable Audit Trail</h3>
                  <p className="text-xs text-slate-500">Comprehensive server-recorded logs of all mutations, logins, and privileged actions.</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter by action (e.g. auth, role)..."
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm overflow-x-auto">
                {auditLogsLoading ? (
                  <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin" /> Loading audit records...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">No audit logs found.</div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[10px]">
                        <th className="pb-3 font-black">Timestamp</th>
                        <th className="pb-3 font-black">Action</th>
                        <th className="pb-3 font-black">Resource</th>
                        <th className="pb-3 font-black">Actor</th>
                        <th className="pb-3 font-black">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {auditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/50 font-mono text-[11px]">
                          <td className="py-3 text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="py-3 font-bold text-slate-900">{log.action}</td>
                          <td className="py-3 text-slate-600">{log.resource || '—'}</td>
                          <td className="py-3 text-slate-500 truncate max-w-[120px]">{log.userId}</td>
                          <td className="py-3">
                            <span className={cn(
                              'px-2 py-0.5 rounded text-[9px] font-bold uppercase',
                              log.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                            )}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </CenteredLayout>

      {/* Create Demo Account Modal */}
      {showCreateDemoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Create New Demo Account</h3>
              <button onClick={() => setShowCreateDemoModal(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateDemoAccount} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Demo Advisor 6"
                  value={createDemoForm.name}
                  onChange={(e) => setCreateDemoForm({ ...createDemoForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. demoadvisor6@kanaku.com"
                  value={createDemoForm.email}
                  onChange={(e) => setCreateDemoForm({ ...createDemoForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Assigned Role</label>
                <select
                  value={createDemoForm.role}
                  onChange={(e) => setCreateDemoForm({ ...createDemoForm, role: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="user">User (Standard account with mock savings/bills)</option>
                  <option value="advisor">Advisor (Verified advisor with availability slots)</option>
                  <option value="manager">Manager (Manager access)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Initial Password (Optional)</label>
                <input
                  type="password"
                  placeholder="Leave blank to use default (DemoPass@123)"
                  value={createDemoForm.password}
                  onChange={(e) => setCreateDemoForm({ ...createDemoForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateDemoModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingDemo}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {creatingDemo ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-black text-slate-900">Reject Approval Request</h3>
            <p className="text-xs text-slate-500">Please provide a reason for rejecting this manager request.</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              placeholder="e.g. Requires additional verification..."
              className="w-full p-3 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500/20 h-24 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectModal({ open: false, requestId: null, reason: '' })}
                className="flex-1 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectRequest}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteConfirm.open && deleteConfirm.user && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-black text-rose-600">Permanently Delete User?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This action will permanently delete <span className="font-bold text-slate-900">{deleteConfirm.user.name}</span> ({deleteConfirm.user.email}) and all associated records.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirm({ open: false, user: null })}
                disabled={deleteLoading}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
