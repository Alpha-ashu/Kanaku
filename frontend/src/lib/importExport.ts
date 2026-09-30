import { db } from './database';
import { toast } from 'sonner';
import { downloadFile } from './download';

// Export all data to JSON
export const exportDataToJSON = async (): Promise<string> => {
  try {
    const data = {
      accounts: await db.accounts.toArray(),
      transactions: await db.transactions.toArray(),
      categories: await db.categories.toArray(),
      loans: await db.loans.toArray(),
      loanPayments: await db.loanPayments.toArray(),
      goals: await db.goals.toArray(),
      goalContributions: await db.goalContributions.toArray(),
      groupExpenses: await db.groupExpenses.toArray(),
      investments: await db.investments.toArray(),
      notifications: await db.notifications.toArray(),
      friends: await db.friends.toArray(),
      importHistories: await db.importHistories.toArray(),
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };

    return JSON.stringify(data, null, 2);
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};


export interface BackupSummary {
  id: string;
  filename: string;
  size: number;
  timestamp: string;
}

/** Newest-first; older backups beyond this are pruned on each new backup. */
const MAX_STORED_BACKUPS = 10;

const backupFilename = (timestamp: string) =>
  `kanaku-backup-${timestamp.replace(/[:.]/g, '-')}.json`;

/**
 * Snapshot every local table into `db.backups`.
 *
 * The previous version serialized the whole database and then THREW THE JSON
 * AWAY — it wrote only `{filename, size, timestamp}` into `db.settings`, so the
 * UI listed backups that contained nothing and could never be restored. The
 * payload now lands in `db.backups`, the table that already exists for it
 * (`{ id, data, timestamp, size }`), which is also what `restoreBackup` reads.
 */
export const createBackup = async (): Promise<BackupSummary> => {
  try {
    const data = await exportDataToJSON();
    const createdAt = new Date();
    const timestamp = createdAt.toISOString();
    const id = `${createdAt.getTime()}`;

    await db.backups.put({ id, data, timestamp: createdAt, size: data.length });

    // Keep the newest MAX_STORED_BACKUPS. Unbounded snapshots of the entire
    // database would grow IndexedDB without limit.
    const stored = await db.backups.orderBy('timestamp').reverse().toArray();
    if (stored.length > MAX_STORED_BACKUPS) {
      await db.backups.bulkDelete(stored.slice(MAX_STORED_BACKUPS).map((entry) => entry.id));
    }

    toast.success('Backup created');
    return { id, filename: backupFilename(timestamp), size: data.length, timestamp };
  } catch (error) {
    console.error('Backup creation failed:', error);
    toast.error('Failed to create backup');
    throw error;
  }
};

/** List stored backups, newest first. */
export const listBackups = async (): Promise<BackupSummary[]> => {
  try {
    const stored = await db.backups.orderBy('timestamp').reverse().toArray();
    return stored.map((entry) => {
      const timestamp = new Date(entry.timestamp).toISOString();
      return { id: entry.id, filename: backupFilename(timestamp), size: entry.size, timestamp };
    });
  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
};

/**
 * Save a stored backup to the user's device. A backup that only ever lives in
 * this browser's IndexedDB does not survive the thing a backup exists for —
 * clearing site data, losing the device, reinstalling.
 */
export const downloadBackup = async (backupId: string): Promise<void> => {
  const entry = await db.backups.get(backupId);
  if (!entry) {
    toast.error('Backup not found');
    return;
  }

  const timestamp = new Date(entry.timestamp).toISOString();
  // downloadFile(), not a raw blob-URL <a download> click: Android's WebView
  // ignores the download attribute on blob: URLs (no DownloadListener wired to
  // the bridge) and WKWebView opens the blob in a tab that dies with the object
  // URL — both platforms would report success and produce no file. See
  // lib/nativeFiles.ts for the full explanation; it's the same trap Reports.tsx
  // and BillUpload.tsx already route around.
  await downloadFile({
    filename: backupFilename(timestamp),
    mimeType: 'application/json',
    data: entry.data,
    shareTitle: 'KANAKU backup',
  });
};

/**
 * A stored backup as a File, for the import dialog.
 *
 * Restoring used to wipe this device's tables and write the snapshot's rows back
 * with their old server ids — the next sync then deleted whatever the server no
 * longer had, and nothing reached the server. A snapshot now goes through the
 * normal reviewed import instead: matched to existing accounts, duplicates
 * skipped, merged, and saved to the account on the server.
 */
export const backupAsFile = async (backupId: string): Promise<File> => {
  const entry = await db.backups.get(backupId);
  if (!entry) {
    throw new Error('Backup not found');
  }
  const timestamp = new Date(entry.timestamp).toISOString();
  return new File([entry.data], backupFilename(timestamp), { type: 'application/json' });
};

/**
 * One-time cleanup of the metadata-only rows the old createBackup() left in
 * `db.settings`. They hold no data, so they can only mislead — a user seeing
 * them listed would believe they had restorable backups.
 */
export const purgeLegacyBackupRecords = async (): Promise<number> => {
  try {
    const legacy = await db.settings.where('key').startsWith('backup-').toArray();
    if (legacy.length === 0) return 0;
    await db.settings.bulkDelete(legacy.map((row) => row.key));
    return legacy.length;
  } catch (error) {
    console.error('Failed to purge legacy backup records:', error);
    return 0;
  }
};
