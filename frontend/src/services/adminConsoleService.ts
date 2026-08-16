import { apiClient } from '@/lib/api';

export interface SystemStatsDto {
  users: {
    total: number;
    advisors: number;
    advisorRequests: number;
    activeToday: number;
  };
  bookings: {
    total: number;
    completedSessions: number;
    pendingBookings: number;
  };
  payments: {
    total: number;
    totalRevenue: number;
    currency: string;
  };
  system: {
    cpu: {
      load: number;
      cores: number;
      model: string;
    };
    memory: {
      total: number;
      used: number;
      percent: number;
    };
    storage: {
      usedBytes: number;
      totalBytes: number;
    };
    uptime: number;
    nodeVersion: string;
    platform: string;
    hostname: string;
  };
}

export interface UserMetricsDto {
  total: number;
  active: number;
  disabled: number;
  pending: number;
  demo: number;
  normal: number;
  advisors: number;
  managers: number;
  admins: number;
  users: number;
}

export interface UserActivityDto {
  aiScans: any[];
  syncs: any[];
  imports: any[];
}

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  isApproved: boolean;
  status?: string;
  accountType?: 'NORMAL' | 'DEMO';
  demoStatus?: 'ENABLED' | 'DISABLED';
  emailVerified?: boolean;
  createdAt: string;
  lastSynced?: string | null;
  phone?: string | null;
}

export interface DemoUserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  accountType: string;
  demoStatus: string;
  emailVerified: boolean;
  isApproved: boolean;
  lastSynced?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    transactions: number;
    accounts: number;
    goals: number;
    loans: number;
    investments: number;
  };
}

export interface ApprovalRequestDto {
  id: string;
  requesterId: string;
  targetUserId?: string | null;
  actionType: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason?: string | null;
  payload?: any;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt?: string;
  requester?: { id: string; name: string; email: string; role: string };
  targetUser?: { id: string; name: string; email: string; role: string; accountType?: string; demoStatus?: string; status?: string };
  reviewer?: { id: string; name: string; email: string };
}

export interface AuditLogDto {
  id: string;
  timestamp: string;
  action: string;
  resource: string;
  userId: string;
  status: string;
  ip?: string | null;
  userAgent?: string | null;
  details?: any;
}

export interface UserStorageStatsDto {
  userId: string;
  stats: {
    transactions: number;
    accounts: number;
    goals: number;
    investments: number;
    loans: number;
    todos: number;
    notifications: number;
    devices: number;
    aiScans: number;
    friends: number;
  };
  totalRecords: number;
  estimatedBytes: number;
}

export const adminConsoleService = {
  getStats: async () => {
    const res = await apiClient.get<SystemStatsDto>('/admin/stats');
    return res.data;
  },

  getUserStats: async (): Promise<UserMetricsDto> => {
    const res = await apiClient.get<{ success: boolean; data: UserMetricsDto }>('/admin/users/stats');
    return (res.data as any)?.data || res.data;
  },

  getUsers: async (filters?: {
    role?: string;
    approved?: boolean;
    status?: string;
    accountType?: string;
    demoStatus?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    let url = '/admin/users';
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.approved !== undefined) params.append('approved', filters.approved.toString());
    if (filters?.status) params.append('status', filters.status);
    if (filters?.accountType) params.append('accountType', filters.accountType);
    if (filters?.demoStatus) params.append('demoStatus', filters.demoStatus);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    if (params.toString()) url += `?${params.toString()}`;
    
    const res = await apiClient.get<AdminUserDto[]>(url);
    return res.data;
  },

  getActivity: async (userId?: string, limit = 50) => {
    let url = `/admin/users/activity?limit=${limit}`;
    if (userId) url += `&userId=${userId}`;
    const res = await apiClient.get<UserActivityDto>(url);
    return res.data;
  },

  toggleUserStatus: async (userId: string, status: 'verified' | 'blocked' | 'disabled' | 'active') => {
    const res = await apiClient.post(`/admin/users/${userId}/status`, { status });
    return res.data;
  },

  updateUserRole: async (userId: string, role: 'admin' | 'manager' | 'advisor' | 'user') => {
    const res = await apiClient.post(`/admin/users/${userId}/role`, { role });
    return res.data;
  },

  deleteUser: async (userId: string) => {
    const res = await apiClient.delete(`/admin/users/${userId}`);
    return res.data;
  },

  getUserStorageStats: async (userId: string): Promise<UserStorageStatsDto> => {
    const res = await apiClient.get<UserStorageStatsDto>(`/admin/users/${userId}/storage`);
    return res.data as UserStorageStatsDto;
  },

  // ── Demo Accounts ──────────────────────────────────────────────────────────
  getDemoAccounts: async (filters?: { role?: string; status?: string; search?: string; page?: number; limit?: number }) => {
    let url = '/admin/demo-accounts';
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    if (params.toString()) url += `?${params.toString()}`;
    const res = await apiClient.get<{ success: boolean; users: DemoUserDto[]; pagination: any }>(url);
    return res.data;
  },

  toggleDemoStatus: async (userId: string, status: 'ENABLED' | 'DISABLED', reason?: string) => {
    const res = await apiClient.post<{ success: boolean; approvalRequired?: boolean; message: string; user?: any }>(
      `/admin/demo-accounts/${userId}/status`,
      { status, reason }
    );
    return res.data;
  },

  createDemoAccount: async (data: { name: string; email: string; password?: string; role: 'user' | 'advisor' | 'manager' | 'admin' }) => {
    const res = await apiClient.post<{ success: boolean; message: string; user: any }>(
      '/admin/demo-accounts/create',
      data
    );
    return res.data;
  },

  resetDemoAccount: async (userId: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(
      `/admin/demo-accounts/${userId}/reset`,
      {}
    );
    return res.data;
  },

  // ── Approval Requests (Manager -> Admin) ───────────────────────────────────
  getApprovals: async (status?: string, page = 1, limit = 20) => {
    let url = `/admin/approvals?page=${page}&limit=${limit}`;
    if (status && status !== 'all') url += `&status=${status}`;
    const res = await apiClient.get<{ success: boolean; requests: ApprovalRequestDto[]; pagination: any }>(url);
    return res.data;
  },

  approveRequest: async (requestId: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(
      `/admin/approvals/${requestId}/approve`,
      {}
    );
    return res.data;
  },

  rejectRequest: async (requestId: string, reason?: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(
      `/admin/approvals/${requestId}/reject`,
      { reason }
    );
    return res.data;
  },

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  getAuditLogs: async (filters?: { action?: string; userId?: string; status?: string; page?: number; limit?: number }) => {
    let url = '/admin/audit-logs';
    const params = new URLSearchParams();
    if (filters?.action) params.append('action', filters.action);
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    if (params.toString()) url += `?${params.toString()}`;
    const res = await apiClient.get<{ success: boolean; logs: AuditLogDto[]; pagination: any }>(url);
    return res.data;
  },
};
