export type VaultCategory =
  | 'Personal Documents'
  | 'Property Documents'
  | 'Insurance'
  | 'Financial Documents'
  | 'Legal Documents'
  | 'Medical Documents'
  | 'Other'
  | string;

export type VaultPermission = 'viewer' | 'editor';

export type VaultShareStatus = 'active' | 'revoked';

export type VaultAuditAction =
  | 'UPLOAD'
  | 'VIEW'
  | 'DOWNLOAD'
  | 'UPDATE'
  | 'DELETE'
  | 'FOLDER_CREATE'
  | 'FOLDER_RENAME'
  | 'FOLDER_DELETE'
  | 'SHARE_GRANT'
  | 'SHARE_REVOKE'
  | 'PERMISSION_CHANGE'
  | 'ACCESS_DENIED'
  | 'LOCK_SETUP'
  | 'LOCK_VERIFY'
  | 'BATCH_MOVE';

export interface CreateFolderDTO {
  name: string;
  category?: string;
  parentId?: string | null;
  color?: string;
  icon?: string;
}

export interface UpdateFolderDTO {
  name?: string;
  parentId?: string | null;
  color?: string;
  icon?: string;
}

export interface UploadDocumentDTO {
  title: string;
  folderId?: string | null;
  category: string;
  description?: string;
  tags?: string[];
  institution?: string;
  documentNumber?: string;
  expiryDate?: string;
  renewalDate?: string;
  reminderDate?: string;
  isSensitive?: boolean;
}

export interface UpdateDocumentDTO {
  title?: string;
  folderId?: string | null;
  category?: string;
  description?: string;
  tags?: string[];
  institution?: string;
  documentNumber?: string;
  expiryDate?: string | null;
  renewalDate?: string | null;
  reminderDate?: string | null;
  isSensitive?: boolean;
}

export interface CreateShareDTO {
  sharedWithUserEmailOrId: string;
  documentId?: string;
  folderId?: string;
  permission: VaultPermission;
  canDownload?: boolean;
  expiresAt?: string | null;
}

export interface UpdateShareDTO {
  permission?: VaultPermission;
  canDownload?: boolean;
  expiresAt?: string | null;
}

export interface ConfigureLockDTO {
  isLockEnabled: boolean;
  vaultPin?: string;
  autoLockMinutes?: number;
}

export interface VerifyLockDTO {
  vaultPin: string;
}
