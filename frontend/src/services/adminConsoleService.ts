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
  createdAt: string;
  phone?: string | null;
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

  getUsers: async (role?: string, approved?: boolean) => {
    let url = '/admin/users';
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (approved !== undefined) params.append('approved', approved.toString());
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

  toggleUserStatus: async (userId: string, status: 'verified' | 'blocked') => {
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
};

