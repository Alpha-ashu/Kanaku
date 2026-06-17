import { db } from './database';
import { encryptData, decryptData } from './encryption';
import { showNotification } from './notifications';

// Production environment configuration
export const PRODUCTION_CONFIG = {
  // Database settings
  DB_ENCRYPTION_KEY: process.env.VITE_DB_ENCRYPTION_KEY || '',
  DB_BACKUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  
  // Security settings
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  
  // Performance settings
  BATCH_SIZE: 100,
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  
  // Error handling
  ERROR_REPORTING_ENABLED: true,
  LOG_LEVEL: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
};

// Production error handler
export class ProductionErrorHandler {
  private static instance: ProductionErrorHandler;
  private errorQueue: Array<{ error: Error; context: any }> = [];
  private isReporting = false;

  static getInstance(): ProductionErrorHandler {
    if (!ProductionErrorHandler.instance) {
      ProductionErrorHandler.instance = new ProductionErrorHandler();
    }
    return ProductionErrorHandler.instance;
  }

  async handleError(error: Error, context?: any): Promise<void> {
    // Log error locally
    this.logError(error, context);
    
    // Add to queue for reporting
    this.errorQueue.push({ error, context });
    
    // Show user-friendly error message
    this.showUserError(error);
    
    // Report error if enabled
    if (PRODUCTION_CONFIG.ERROR_REPORTING_ENABLED) {
      await this.reportError(error, context);
    }
  }

  private logError(error: Error, context?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Store in database for offline access
    db.logs.add({
      id: Date.now().toString(),
      level: 'error',
      message: JSON.stringify(logEntry),
      timestamp: new Date()
    }).catch(console.error);
  }

  private showUserError(error: Error): void {
    const userMessage = this.getUserFriendlyMessage(error);
    showNotification(userMessage, 'error');
  }

  private getUserFriendlyMessage(error: Error): string {
    if (error.message.includes('Network')) {
      return 'Network error. Please check your internet connection and try again.';
    }
    if (error.message.includes('Database')) {
      return 'Database error. Please restart the app and try again.';
    }
    if (error.message.includes('Permission')) {
      return 'Permission denied. Please check app permissions.';
    }
    return 'An unexpected error occurred. Please try again.';
  }

  private async reportError(error: Error, context?: any): Promise<void> {
    if (this.isReporting) return;
    
    this.isReporting = true;
    
    try {
      // In production, you would send to your error reporting service
      // For now, we'll just store it locally
      const errorReport = {
        error: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      await db.errorReports.add({
        id: Date.now().toString(),
        report: JSON.stringify(errorReport),
        timestamp: new Date()
      });
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
    } finally {
      this.isReporting = false;
    }
  }
}

// Database backup and recovery
export class DatabaseBackupManager {
  private static instance: DatabaseBackupManager;
  private backupTimer: NodeJS.Timeout | null = null;

  static getInstance(): DatabaseBackupManager {
    if (!DatabaseBackupManager.instance) {
      DatabaseBackupManager.instance = new DatabaseBackupManager();
    }
    return DatabaseBackupManager.instance;
  }

  startBackupScheduler(): void {
    this.stopBackupScheduler();
    
    this.backupTimer = setInterval(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        console.error('Backup failed:', error);
      }
    }, PRODUCTION_CONFIG.DB_BACKUP_INTERVAL);
  }

  stopBackupScheduler(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }

  async createBackup(): Promise<void> {
    try {
      // Get all data from database
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: {
          accounts: await db.accounts.toArray(),
          transactions: await db.transactions.toArray(),
          categories: await db.categories.toArray(),
          budgets: await db.budgets.toArray(),
          goals: await db.goals.toArray(),
          loans: await db.loans.toArray(),
          investments: await db.investments.toArray(),
          groups: await db.groups.toArray(),
          settings: await db.settings.toArray()
        }
      };

      // Encrypt backup data
      const encryptedBackup = encryptData(JSON.stringify(backupData), PRODUCTION_CONFIG.DB_ENCRYPTION_KEY);

      // Store backup
      await db.backups.add({
        id: Date.now().toString(),
        data: encryptedBackup,
        timestamp: new Date(),
        size: encryptedBackup.length
      });

      // Clean up old backups (keep last 10)
      const backups = await db.backups.orderBy('timestamp').reverse().toArray();
      if (backups.length > 10) {
        const toDelete = backups.slice(10);
        await db.backups.bulkDelete(toDelete.map(b => b.id));
      }

      console.log('Backup created successfully');
    } catch (error) {
      console.error('Backup creation failed:', error);
      throw error;
    }
  }

  async restoreFromBackup(backupId: string): Promise<void> {
    try {
      const backup = await db.backups.get(backupId);
      if (!backup) {
        throw new Error('Backup not found');
      }

      // Decrypt backup data
      const decryptedData = decryptData(backup.data, PRODUCTION_CONFIG.DB_ENCRYPTION_KEY);
      const backupData = JSON.parse(decryptedData);

      // Clear current data
      await Promise.all([
        db.accounts.clear(),
        db.transactions.clear(),
        db.categories.clear(),
        db.budgets.clear(),
        db.goals.clear(),
        db.loans.clear(),
        db.investments.clear(),
        db.groups.clear(),
        db.settings.clear()
      ]);

      // Restore data
      await Promise.all([
        db.accounts.bulkAdd(backupData.data.accounts),
        db.transactions.bulkAdd(backupData.data.transactions),
        db.categories.bulkAdd(backupData.data.categories),
        db.budgets.bulkAdd(backupData.data.budgets),
        db.goals.bulkAdd(backupData.data.goals),
        db.loans.bulkAdd(backupData.data.loans),
        db.investments.bulkAdd(backupData.data.investments),
        db.groups.bulkAdd(backupData.data.groups),
        db.settings.bulkAdd(backupData.data.settings)
      ]);

      console.log('Backup restored successfully');
    } catch (error) {
      console.error('Backup restoration failed:', error);
      throw error;
    }
  }

  async getBackups(): Promise<Array<{ id: string; timestamp: Date; size: number }>> {
    return await db.backups.orderBy('timestamp').reverse().toArray();
  }
}

// Performance monitoring
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTimer(operation: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(operation, duration);
      
      // Log slow operations
      if (duration > 1000) { // Operations taking more than 1 second
        console.warn(`Slow operation: ${operation} took ${duration.toFixed(2)}ms`);
      }
    };
  }

  private recordMetric(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const durations = this.metrics.get(operation)!;
    durations.push(duration);
    
    // Keep only last 100 measurements
    if (durations.length > 100) {
      durations.shift();
    }
  }

  getAverageTime(operation: string): number {
    const durations = this.metrics.get(operation);
    if (!durations || durations.length === 0) {
      return 0;
    }
    
    return durations.reduce((sum, time) => sum + time, 0) / durations.length;
  }

  getAllMetrics(): Record<string, { average: number; count: number; min: number; max: number }> {
    const result: Record<string, { average: number; count: number; min: number; max: number }> = {};
    
    this.metrics.forEach((durations, operation) => {
      const sum = durations.reduce((sum, time) => sum + time, 0);
      result[operation] = {
        average: sum / durations.length,
        count: durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations)
      };
    });
    
    return result;
  }
}

// Initialize production features
export function initializeProductionFeatures(): void {
  // Set up error handling
  const errorHandler = ProductionErrorHandler.getInstance();
  
  // Global error handler
  window.addEventListener('error', (event) => {
    errorHandler.handleError(event.error, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    errorHandler.handleError(new Error(event.reason), {
      type: 'unhandledrejection',
      reason: event.reason
    });
  });

  // Initialize database backup
  const backupManager = DatabaseBackupManager.getInstance();
  backupManager.startBackupScheduler();

  // Initialize performance monitoring
  const performanceMonitor = PerformanceMonitor.getInstance();
  
  // Monitor app startup time
  const endStartupTimer = performanceMonitor.startTimer('app_startup');
  window.addEventListener('load', endStartupTimer);
}

// Cleanup function
export function cleanupProductionFeatures(): void {
  const backupManager = DatabaseBackupManager.getInstance();
  backupManager.stopBackupScheduler();
}
