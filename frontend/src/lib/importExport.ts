import { db } from './database';
import { toast } from 'sonner';

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

// Create automatic backup
export const createBackup = async (): Promise<string> => {
  try {
    const data = await exportDataToJSON();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `finance-life-backup-${timestamp}.json`;

    // Store backup info in settings
    await db.settings.put({
      key: `backup-${timestamp}`,
      value: {
        filename,
        size: data.length,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date()
    });

    toast.success('Backup created successfully');
    return data;
  } catch (error) {
    console.error('Backup creation failed:', error);
    toast.error('Failed to create backup');
    throw error;
  }
};

// List available backups
export const listBackups = async (): Promise<Array<{ filename: string; size: number; timestamp: string }>> => {
  try {
    const backups = await db.settings
      .where('key')
      .startsWith('backup-')
      .toArray();

    return backups.map(b => b.value).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
};
