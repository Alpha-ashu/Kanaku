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


// Import data from JSON
export const importDataFromJSON = async (jsonData: string): Promise<void> => {
  try {
    const data = JSON.parse(jsonData);

    // Validate data structure
    if (!data.accounts || !Array.isArray(data.accounts)) {
      throw new Error('Invalid data format: missing accounts');
    }

    // Clear existing data
    await db.accounts.clear();
    await db.transactions.clear();
    await db.categories.clear();
    await db.loans.clear();
    await db.loanPayments.clear();
    await db.goals.clear();
    await db.goalContributions.clear();
    await db.groupExpenses.clear();
    await db.investments.clear();
    await db.notifications.clear();
    await db.friends.clear();
    await db.importHistories.clear();

    // Import data
    if (data.accounts.length > 0) {
      await db.accounts.bulkAdd(data.accounts);
    }
    if (data.transactions?.length > 0) {
      await db.transactions.bulkAdd(data.transactions);
    }
    if (data.categories?.length > 0) {
      await db.categories.bulkAdd(data.categories);
    }
    if (data.loans?.length > 0) {
      await db.loans.bulkAdd(data.loans);
    }
    if (data.loanPayments?.length > 0) {
      await db.loanPayments.bulkAdd(data.loanPayments);
    }
    if (data.goals?.length > 0) {
      await db.goals.bulkAdd(data.goals);
    }
    if (data.goalContributions?.length > 0) {
      await db.goalContributions.bulkAdd(data.goalContributions);
    }
    if (data.groupExpenses?.length > 0) {
      await db.groupExpenses.bulkAdd(data.groupExpenses);
    }
    if (data.investments?.length > 0) {
      await db.investments.bulkAdd(data.investments);
    }
    if (data.notifications?.length > 0) {
      await db.notifications.bulkAdd(data.notifications);
    }
    if (data.friends?.length > 0) {
      await db.friends.bulkAdd(data.friends);
    }
    if (data.importHistories?.length > 0) {
      await db.importHistories.bulkAdd(data.importHistories);
    }

    toast.success('Data imported successfully');
  } catch (error) {
    console.error('Import failed:', error);
    throw error;
  }
};


// Upload data from file
export const uploadDataFromFile = async (file: File): Promise<void> => {
  try {
    const text = await file.text();

    if (file.name.endsWith('.json')) {
      await importDataFromJSON(text);
    } else if (file.name.endsWith('.csv')) {
      // CSV import would need more sophisticated parsing
      toast.error('CSV import not yet implemented');
    } else {
      throw new Error('Unsupported file format');
    }
  } catch (error) {
    console.error('Upload failed:', error);
    toast.error('Failed to import data');
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

/** Replace all local data with a stored backup's contents. */
export const restoreBackup = async (backupId: string): Promise<void> => {
  const entry = await db.backups.get(backupId);
  if (!entry) {
    throw new Error('Backup not found');
  }
  await importDataFromJSON(entry.data);
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
