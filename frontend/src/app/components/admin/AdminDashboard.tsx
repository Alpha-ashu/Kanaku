import React, { useMemo, useState, useEffect } from 'react';
import { adminConsoleService, SystemStatsDto, AdminUserDto, UserActivityDto } from '@/services/adminConsoleService';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { FeatureKey } from '@/lib/featureFlags';
import {
 ChevronLeft, RotateCcw, Shield, Activity, Brain, LayoutDashboard, Wallet, Receipt,
 CreditCard, Target, Users, TrendingUp, BarChart3, Calendar, CheckSquare, Calculator,
 UserCog, Bell, User, Settings as SettingsIcon, ToggleLeft, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';




export const AdminDashboard: React.FC = () => {
 const { setCurrentPage, goBack } = useApp();
 const { role, loading: authLoading, dataReady } = useAuth();
 const { toggleFeature, resetToDefaults, getFeatureStatus } = useFeatureFlags();
 const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview');
 const [stats, setStats] = useState<SystemStatsDto | null>(null);
 const [users, setUsers] = useState<AdminUserDto[]>([]);
 const [selectedUser, setSelectedUser] = useState<AdminUserDto | null>(null);
 const [userActivity, setUserActivity] = useState<UserActivityDto | null>(null);
 const [loading, setLoading] = useState(true);

 const fetchData = async () => {
 try {
 setLoading(true);
 const [s, u] = await Promise.all([
 adminConsoleService.getStats(),
 adminConsoleService.getUsers()
 ]);
 if (s) setStats(s);
 if (u) setUsers(u);
 } catch (err) {
 toast.error('Failed to connect to admin services');
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 if (role === 'admin') {
 fetchData();
 }
 }, [role]);

 const fetchUserActivity = async (user: AdminUserDto) => {
 try {
 setSelectedUser(user);
 setUserActivity(null);
 const activity = await adminConsoleService.getActivity(user.id);
 if (activity) setUserActivity(activity);
 } catch (err) {
 toast.error('Failed to load user activity');
 }
 };

 const handleToggleStatus = async (user: AdminUserDto) => {
 const newStatus = user.status === 'blocked' ? 'verified' : 'blocked';
 if (!confirm(`Are you sure you want to ${newStatus === 'blocked' ? 'BLOCK' : 'UNBLOCK'} ${user.name}?`)) return;

 try {
 await adminConsoleService.toggleUserStatus(user.id, newStatus);
 toast.success(`User ${newStatus} successfully`);
 fetchData(); // Refresh list
 if (selectedUser?.id === user.id) {
 setSelectedUser({ ...user, status: newStatus });
 }
 } catch (err) {
 toast.error('Failed to update user status');
 }
 };

 const handleRoleChange = async (user: AdminUserDto, newRole: 'admin' | 'manager' | 'advisor' | 'user') => {
 if (!confirm(`Are you sure you want to change ${user.name}'s role to ${newRole.toUpperCase()}?`)) return;

 try {
 await adminConsoleService.updateUserRole(user.id, newRole);
 toast.success(`Role updated to ${newRole.toUpperCase()} successfully`);
 fetchData(); // Refresh list
 if (selectedUser?.id === user.id) {
 setSelectedUser({ ...user, role: newRole });
 }
 } catch (err) {
 toast.error('Failed to update user role');
 }
 };

 const handleReset = () => {
 if (confirm('Reset all feature flags to defaults? This cannot be undone.')) {
 resetToDefaults();
 toast.success('Feature flags reset to defaults');
 }
 };

  if (authLoading || !dataReady) {
    return (
      <CenteredLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-10 h-10 border-4 border-gray-200 border-t-indigo-600 rounded-full" />
        </div>
      </CenteredLayout>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="w-full min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-rose-500" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Access Denied</h2>
          <p className="text-gray-500 mb-6 font-medium">Only administrators can access the system feature matrix.</p>
          <button onClick={() => setCurrentPage('dashboard')} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

 const formatBytes = (bytes: number) => {
 if (bytes === 0) return '0 B';
 const k = 1024;
 const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
 };

 return (
 <CenteredLayout>
 <div className="space-y-6">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div className="flex items-center gap-4">
 <button onClick={goBack} className="lg:!hidden p-2 hover:bg-gray-100 rounded-xl transition-colors">
 <ChevronLeft size={20} />
 </button>
 <div>
 <h2 className="text-2xl font-black text-slate-900 tracking-tight">Admin Console</h2>
 <p className="text-slate-500 font-medium text-sm mt-0.5">System monitoring & feature control</p>
 </div>
 </div>

 {/* Tab Navigation */}
 <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
 {[
 { id: 'overview', label: 'Overview' },
 { id: 'users', label: 'User Activity' }
 ].map(tab => (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id as any)}
 className={cn(
"px-5 py-2 rounded-xl text-xs font-black transition-all",
 activeTab === tab.id ?"bg-white text-slate-900 shadow-sm" :"text-slate-500 hover:text-slate-700"
 )}
 >
 {tab.label}
 </button>
 ))}
 </div>
 </div>

 {activeTab === 'overview' && (
 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
 {/* Stats Grid */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {[
 { label: 'Active Users', value: stats?.users.total ?? '...', trend: `+${stats?.users.activeToday ?? 0} today`, color: 'blue', icon: User },
 { label: 'Verified Advisors', value: stats?.users.advisors ?? '...', trend: `+${stats?.users.advisorRequests ?? 0} req`, color: 'indigo', icon: UserCog },
 { label: 'Total Revenue', value: stats?.payments ? `$${stats.payments.totalRevenue.toLocaleString()}` : '...', trend: 'Stable', color: 'emerald', icon: Receipt },
 { label: 'System Health', value: stats?.system ? `${stats.system.cpu.load.toFixed(1)}%` : '...', trend: 'Stable', color: 'violet', icon: Activity },
 ].map((stat, i) => (
 <div key={i} className="bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm hover:shadow-md transition-all group">
 <div className="flex items-start justify-between mb-4">
 <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
 stat.color === 'blue' ?"bg-blue-50 text-blue-600" :
 stat.color === 'indigo' ?"bg-indigo-50 text-indigo-600" :
 stat.color === 'emerald' ?"bg-emerald-50 text-emerald-600" :
"bg-violet-50 text-violet-600"
 )}>
 <stat.icon size={24} />
 </div>
 <span className={cn("text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest",
 stat.color === 'blue' ?"bg-blue-50 text-blue-600" :
 stat.color === 'indigo' ?"bg-indigo-50 text-indigo-600" :
 stat.color === 'emerald' ?"bg-emerald-50 text-emerald-600" :
"bg-violet-50 text-violet-600"
 )}>
 {stat.trend}
 </span>
 </div>
 <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{stat.label}</p>
 <h4 className="text-2xl font-black text-slate-900 tracking-tight">{stat.value}</h4>
 </div>
 ))}
 </div>

 {/* Server Metrics */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2 bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm">
 <div className="flex items-center justify-between mb-8">
 <h3 className="text-lg font-black text-slate-900 tracking-tight">Server Infrastructure</h3>
 <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
 <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
 LIVE: {stats?.system.hostname}
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
 {/* CPU Load */}
 <div className="space-y-4">
 <div className="flex justify-between items-end">
 <span className="text-xs font-black text-slate-400 uppercase tracking-widest">CPU Load</span>
 <span className="text-sm font-bold text-slate-900">{stats?.system.cpu.load.toFixed(1)}%</span>
 </div>
 <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
 <div className="h-full bg-blue-600 rounded-full transition-all duration-1000" style={{ width: `${stats?.system.cpu.load ?? 0}%` }} />
 </div>
 <p className="text-[10px] text-slate-400 font-medium">{stats?.system.cpu.cores} Cores • {stats?.system.cpu.model.split('@')[0]}</p>
 </div>

 {/* RAM Usage */}
 <div className="space-y-4">
 <div className="flex justify-between items-end">
 <span className="text-xs font-black text-slate-400 uppercase tracking-widest">RAM Usage</span>
 <span className="text-sm font-bold text-slate-900">{stats?.system.memory.percent.toFixed(1)}%</span>
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

 {/* Feature Matrix Quick Access */}
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
 onClick={() => setCurrentPage('admin-feature-panel')}
 className="mt-8 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 active:scale-95 text-center shrink-0"
 >
 Manage Feature Matrix
 </button>
 </div>
 </div>
 </div>
 )}


 {activeTab === 'users' && (
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
 {/* User List */}
 <div className="lg:col-span-1 bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm flex flex-col h-[600px]">
 <div className="p-6 border-b border-slate-50">
 <h3 className="text-lg font-black text-slate-900 tracking-tight">Active Users</h3>
 <p className="text-xs text-slate-400 font-medium mt-1">Select a user to view detailed activity</p>
 </div>
 <div className="flex-1 overflow-y-auto">
 {users.map(user => (
 <button
 key={user.id}
 onClick={() => fetchUserActivity(user)}
 className={cn(
"w-full p-4 flex items-center gap-3 border-b border-slate-50 transition-all text-left",
 selectedUser?.id === user.id ?"bg-slate-50" :"hover:bg-slate-50/50"
 )}
 >
 <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs",
 user.status === 'blocked' ?"bg-rose-50 text-rose-600" :"bg-slate-100 text-slate-600"
 )}>
 {user.name.charAt(0).toUpperCase()}
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
 <p className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-widest">{user.role} • {user.status || 'verified'}</p>
 </div>
 </button>
 ))}
 </div>
 </div>

 {/* Activity Detail */}
 <div className="lg:col-span-2 bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm flex flex-col h-[600px]">
 {!selectedUser ? (
 <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
 <User size={64} className="mb-4" />
 <p className="font-bold text-slate-900">No User Selected</p>
 <p className="text-sm text-slate-500">Choose a user from the list to see their logs</p>
 </div>
 ) : (
 <div className="flex flex-col h-full">
 <div className="flex items-start justify-between mb-8">
 <div>
 <h3 className="text-xl font-black text-slate-900 tracking-tight">{selectedUser.name}</h3>
 <p className="text-sm text-slate-400 font-medium">{selectedUser.email}</p>
 </div>
 <div className="flex items-center gap-2">
 <select
 value={selectedUser.role}
 onChange={(e) => handleRoleChange(selectedUser, e.target.value as any)}
 className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
 >
 <option value="user">User</option>
 <option value="advisor">Advisor</option>
 <option value="manager">Manager</option>
 <option value="admin">Admin</option>
 </select>
 <button
 onClick={() => handleToggleStatus(selectedUser)}
 className={cn(
"px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
 selectedUser.status === 'blocked'
 ?"bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
 :"bg-rose-50 text-rose-600 hover:bg-rose-100"
 )}
 >
 {selectedUser.status === 'blocked' ? 'Unblock' : 'Block'}
 </button>
 </div>
 </div>

 <div className="flex-1 overflow-y-auto space-y-6">
 {/* Activity Tabs inside details? No, just list everything */}
 <div className="space-y-4">
 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recent Activity Log</h4>
 {!userActivity ? (
 <div className="py-20 flex items-center justify-center">
 <div className="animate-spin w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full" />
 </div>
 ) : (
 <div className="space-y-3">
 {[
 ...userActivity.aiScans.map(s => ({ type: 'AI_SCAN', time: s.createdAt, msg: `Processed document with ${Math.round(s.confidence * 100)}% confidence` })),
 ...userActivity.syncs.map(s => ({ type: 'SYNC', time: s.createdAt, msg: `${s.operation} on ${s.entityType}: ${s.status}` })),
 ...userActivity.imports.map(i => ({ type: 'IMPORT', time: i.createdAt, msg: `Imported ${i.importedRecords} records from ${i.fileName}` })),
 ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((log, i) => (
 <div key={i} className="flex gap-4 p-4 bg-slate-50 rounded-2xl">
 <div className="pt-1">
 <div className={cn("w-2 h-2 rounded-full",
 log.type === 'AI_SCAN' ?"bg-cyan-500" :
 log.type === 'SYNC' ?"bg-indigo-500" :
"bg-emerald-500"
 )} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex justify-between items-center mb-1">
 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.type}</span>
 <span className="text-[10px] text-slate-400">{new Date(log.time).toLocaleString()}</span>
 </div>
 <p className="text-sm font-bold text-slate-900 truncate">{log.msg}</p>
 </div>
 </div>
 ))}
 {userActivity.aiScans.length + userActivity.syncs.length + userActivity.imports.length === 0 && (
 <p className="text-center py-10 text-slate-400 text-sm font-medium">No recent activity logs found for this user.</p>
 )}
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 )}

 </div>
 </CenteredLayout>
 );
};

