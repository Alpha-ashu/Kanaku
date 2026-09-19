import { apiClient, TokenManager } from '@/lib/api';
import { buildApiUrl, getConfiguredApiBase } from '@/lib/apiBase';
import { getPinUnlockToken } from '@/lib/pinUnlockCoordinator';

export interface VaultFolder {
  id: string;
  userId: string;
  parentId?: string | null;
  name: string;
  category: string;
  isDefault: boolean;
  color?: string | null;
  icon?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    documents: number;
    subfolders?: number;
  };
}

export interface VaultDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  note?: string | null;
  createdAt: string;
}

export interface VaultShare {
  id: string;
  ownerId: string;
  sharedWithUserId: string;
  documentId?: string | null;
  folderId?: string | null;
  permission: 'viewer' | 'editor';
  status: 'active' | 'revoked';
  canDownload: boolean;
  grantedAt: string;
  expiresAt?: string | null;
  owner?: { id: string; name: string; email: string };
  sharedWithUser?: { id: string; name: string; email: string };
  document?: {
    id: string;
    title: string;
    category: string;
    originalFileName: string;
    fileType?: string;
    fileSize?: number;
    expiryDate?: string | null;
    currentVersion?: number;
  };
  folder?: {
    id: string;
    name: string;
    category: string;
    color?: string | null;
    icon?: string | null;
    _count?: { documents: number };
  };
}

export interface VaultDocument {
  id: string;
  userId: string;
  folderId?: string | null;
  title: string;
  originalFileName: string;
  fileType: string;
  fileSize: number;
  isEncrypted: boolean;
  category: string;
  description?: string | null;
  tags: string[];
  institution?: string | null;
  documentNumber?: string | null;
  expiryDate?: string | null;
  renewalDate?: string | null;
  reminderDate?: string | null;
  currentVersion: number;
  isSensitive: boolean;
  createdAt: string;
  updatedAt: string;
  folder?: VaultFolder | null;
  versions?: VaultDocumentVersion[];
  shares?: VaultShare[];
  userRole?: 'owner' | 'editor' | 'viewer';
  canDownload?: boolean;
}

export interface VaultDashboardData {
  totalDocuments: number;
  totalFolders: number;
  totalStorageBytes: number;
  storageLimitBytes: number;
  sharedWithOthersCount: number;
  sharedWithMeCount: number;
  categoryBreakdown: Record<string, number>;
  expiringDocuments: VaultDocument[];
  recentlyAdded: VaultDocument[];
}

export interface VaultStorageUsage {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
}

export interface VaultAuditLog {
  id: string;
  ownerId: string;
  actorId: string;
  action: string;
  details?: string | null;
  documentId?: string | null;
  folderId?: string | null;
  createdAt: string;
  actor?: { id: string; name: string; email: string };
  document?: { id: string; title: string };
  folder?: { id: string; name: string };
}

export interface VaultLockStatus {
  isLockEnabled: boolean;
  hasPin: boolean;
  pinLength?: number;
  autoLockMinutes: number;
  lastUnlockedAt?: string | null;
}

export const vaultService = {
  getDashboard: async (): Promise<VaultDashboardData> => {
    const res = await apiClient.get<VaultDashboardData>('/vault/dashboard');
    if (!res.data) throw new Error(res.error?.message || 'Failed to load dashboard');
    return res.data;
  },

  getStorageUsage: async (): Promise<VaultStorageUsage> => {
    const res = await apiClient.get<VaultStorageUsage>('/vault/storage');
    if (!res.data) throw new Error(res.error?.message || 'Failed to load storage usage');
    return res.data;
  },

  getFolders: async (): Promise<VaultFolder[]> => {
    const res = await apiClient.get<VaultFolder[]>('/vault/folders');
    return res.data || [];
  },

  createFolder: async (data: {
    name: string;
    category?: string;
    parentId?: string | null;
    color?: string;
    icon?: string;
  }): Promise<VaultFolder> => {
    const res = await apiClient.post<VaultFolder>('/vault/folders', data);
    if (!res.data) throw new Error(res.error?.message || 'Failed to create folder');
    return res.data;
  },

  updateFolder: async (
    id: string,
    data: { name?: string; parentId?: string | null; color?: string; icon?: string },
  ): Promise<VaultFolder> => {
    const res = await apiClient.patch<VaultFolder>(`/vault/folders/${id}`, data);
    if (!res.data) throw new Error(res.error?.message || 'Failed to update folder');
    return res.data;
  },

  deleteFolder: async (id: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/vault/folders/${id}`);
    return res.data || { success: true, message: 'Folder deleted' };
  },

  getDocuments: async (params?: {
    folderId?: string;
    category?: string;
    search?: string;
    tag?: string;
    isSensitive?: boolean;
    expiringSoon?: boolean;
  }): Promise<VaultDocument[]> => {
    const query = new URLSearchParams();
    if (params?.folderId) query.set('folderId', params.folderId);
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    if (params?.tag) query.set('tag', params.tag);
    if (params?.isSensitive !== undefined) query.set('isSensitive', String(params.isSensitive));
    if (params?.expiringSoon) query.set('expiringSoon', 'true');

    const qs = query.toString();
    const endpoint = qs ? `/vault/documents?${qs}` : '/vault/documents';
    const res = await apiClient.get<VaultDocument[]>(endpoint);
    return res.data || [];
  },

  uploadDocument: async (formData: FormData): Promise<VaultDocument> => {
    const res = await apiClient.upload<VaultDocument>('/vault/documents', formData);
    if (!res.data) throw new Error(res.message || 'Upload failed');
    return res.data;
  },

  uploadNewVersion: async (documentId: string, formData: FormData): Promise<VaultDocument> => {
    const res = await apiClient.upload<VaultDocument>(`/vault/documents/${documentId}/version`, formData);
    if (!res.data) throw new Error(res.message || 'Upload failed');
    return res.data;
  },

  getDocument: async (id: string): Promise<VaultDocument> => {
    const res = await apiClient.get<VaultDocument>(`/vault/documents/${id}`);
    if (!res.data) throw new Error(res.error?.message || 'Document not found');
    return res.data;
  },

  updateDocument: async (id: string, data: Partial<VaultDocument>): Promise<VaultDocument> => {
    const res = await apiClient.patch<VaultDocument>(`/vault/documents/${id}`, data);
    if (!res.data) throw new Error(res.error?.message || 'Failed to update document');
    return res.data;
  },

  deleteDocument: async (id: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/vault/documents/${id}`);
    return res.data || { success: true, message: 'Document deleted' };
  },

  downloadDocument: async (id: string, originalFileName?: string): Promise<void> => {
    const token = TokenManager.getAccessToken();
    const pinToken = getPinUnlockToken();
    const url = buildApiUrl(getConfiguredApiBase(), `/vault/documents/${id}/download`);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (pinToken) headers['X-Pin-Unlock'] = pinToken;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson.error || errorJson.message || 'Failed to download document');
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = originalFileName || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
  },

  previewDocument: async (id: string): Promise<{ objectUrl: string; contentType: string; cleanup: () => void }> => {
    const token = TokenManager.getAccessToken();
    const pinToken = getPinUnlockToken();
    const url = buildApiUrl(getConfiguredApiBase(), `/vault/documents/${id}/preview`);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (pinToken) headers['X-Pin-Unlock'] = pinToken;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson.error || errorJson.message || 'Failed to preview document');
    }

    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);

    return {
      objectUrl,
      contentType,
      cleanup: () => window.URL.revokeObjectURL(objectUrl),
    };
  },

  getShares: async (): Promise<VaultShare[]> => {
    const res = await apiClient.get<VaultShare[]>('/vault/shares');
    return res.data || [];
  },

  createShare: async (data: {
    sharedWithUserEmailOrId: string;
    documentId?: string;
    folderId?: string;
    permission: 'viewer' | 'editor';
    canDownload?: boolean;
    expiresAt?: string | null;
  }): Promise<VaultShare> => {
    const res = await apiClient.post<VaultShare>('/vault/shares', data);
    if (!res.data) throw new Error(res.error?.message || 'Failed to share');
    return res.data;
  },

  updateShare: async (
    id: string,
    data: { permission?: 'viewer' | 'editor'; canDownload?: boolean; expiresAt?: string | null },
  ): Promise<VaultShare> => {
    const res = await apiClient.patch<VaultShare>(`/vault/shares/${id}`, data);
    if (!res.data) throw new Error(res.error?.message || 'Failed to update share');
    return res.data;
  },

  revokeShare: async (id: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/vault/shares/${id}`);
    return res.data || { success: true, message: 'Share revoked' };
  },

  getSharedWithMe: async (): Promise<VaultShare[]> => {
    const res = await apiClient.get<VaultShare[]>('/vault/shared-with-me');
    return res.data || [];
  },

  getAuditLogs: async (): Promise<VaultAuditLog[]> => {
    const res = await apiClient.get<VaultAuditLog[]>('/vault/audit-logs');
    return res.data || [];
  },

  getLockStatus: async (): Promise<VaultLockStatus> => {
    const res = await apiClient.get<VaultLockStatus>('/vault/lock/status');
    if (!res.data) throw new Error(res.error?.message || 'Failed to check lock status');
    return res.data;
  },

  configureLock: async (data: {
    isLockEnabled: boolean;
    vaultPin?: string;
    autoLockMinutes?: number;
  }): Promise<VaultLockStatus> => {
    const res = await apiClient.post<VaultLockStatus>('/vault/lock/configure', data);
    if (!res.data) throw new Error(res.error?.message || 'Failed to configure lock');
    return res.data;
  },

  verifyLock: async (vaultPin: string): Promise<{ verified: boolean; unlockedAt: string }> => {
    const res = await apiClient.post<{ verified: boolean; unlockedAt: string }>('/vault/lock/verify', { vaultPin });
    if (!res.data) throw new Error(res.error?.message || 'Failed to verify PIN');
    return res.data;
  },

  resetLock: async (newPin?: string): Promise<{ success: boolean; message: string; isLockEnabled: boolean; pinLength: number }> => {
    const res = await apiClient.post<{ success: boolean; message: string; isLockEnabled: boolean; pinLength: number }>('/vault/lock/reset', { newPin });
    if (!res.data) throw new Error(res.error?.message || 'Failed to reset PIN');
    return res.data;
  },
};
