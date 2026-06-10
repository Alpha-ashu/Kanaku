import { db } from './database';

// Health check status
export interface HealthStatus {
  status: 'healthy' | 'warning' | 'error';
  timestamp: Date;
  components: {
    database: { status: string; message: string };
    serviceWorker: { status: string; message: string };
    storage: { status: string; message: string; details: any };
    network: { status: string; message: string };
    memory: { status: string; message: string; details: any };
  };
}

// Real-time health checker
export class HealthChecker {
  private static lastCheck: HealthStatus | null = null;

  static async checkHealth(): Promise<HealthStatus> {
    const timestamp = new Date();
    const components: HealthStatus['components'] = {
      database: await this.checkDatabase(),
      serviceWorker: await this.checkServiceWorker(),
      storage: await this.checkStorage(),
      network: await this.checkNetwork(),
      memory: await this.checkMemory(),
    };

    // Determine overall status
    const statusValues = Object.values(components).map(c => c.status);
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (statusValues.includes('error')) status = 'error';
    else if (statusValues.includes('warning')) status = 'warning';

    const health: HealthStatus = {
      status,
      timestamp,
      components,
    };

    this.lastCheck = health;
    return health;
  }

  private static async checkDatabase(): Promise<{ status: string; message: string }> {
    try {
      const count = await db.accounts.count();
      return {
        status: 'healthy',
        message: `Database operational (${count} accounts)`,
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Database error: ${error}`,
      };
    }
  }

  private static async checkServiceWorker(): Promise<{ status: string; message: string }> {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          return {
            status: 'healthy',
            message: 'Service Worker registered and active',
          };
        } else {
          return {
            status: 'warning',
            message: 'Service Worker not registered',
          };
        }
      } else {
        return {
          status: 'warning',
          message: 'Service Workers not supported',
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Service Worker error: ${error}`,
      };
    }
  }

  private static async checkStorage(): Promise<{ status: string; message: string; details: any }> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentage = (usage / quota) * 100;

        let status = 'healthy';
        if (percentage > 90) status = 'warning';
        if (percentage > 95) status = 'error';

        return {
          status,
          message: `Storage: ${(percentage).toFixed(1)}% used`,
          details: {
            usage: (usage / 1024 / 1024).toFixed(2) + ' MB',
            quota: (quota / 1024 / 1024).toFixed(2) + ' MB',
            percentage: percentage.toFixed(1) + '%',
          },
        };
      }
      return {
        status: 'warning',
        message: 'Storage quota API not available',
        details: {},
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Storage check error: ${error}`,
        details: {},
      };
    }
  }

  private static async checkNetwork(): Promise<{ status: string; message: string }> {
    const online = navigator.onLine;
    const connection = (navigator as any).connection;

    if (!online) {
      return {
        status: 'warning',
        message: 'Offline - data sync paused',
      };
    }

    if (connection) {
      const effectiveType = connection.effectiveType;
      const downlink = connection.downlink;

      if (effectiveType === '4g' || effectiveType === 'wifi') {
        return {
          status: 'healthy',
          message: `Online - ${effectiveType} connection (${downlink} Mbps)`,
        };
      } else {
        return {
          status: 'warning',
          message: `Online - ${effectiveType} connection (${downlink} Mbps)`,
        };
      }
    }

    return {
      status: 'healthy',
      message: 'Online',
    };
  }

  private static async checkMemory(): Promise<{ status: string; message: string; details: any }> {
    try {
      if ((performance as any).memory) {
        const memory = (performance as any).memory;
        const usedJSHeapSize = memory.usedJSHeapSize;
        const jsHeapSizeLimit = memory.jsHeapSizeLimit;
        const percentage = (usedJSHeapSize / jsHeapSizeLimit) * 100;

        let status = 'healthy';
        if (percentage > 80) status = 'warning';
        if (percentage > 95) status = 'error';

        return {
          status,
          message: `Memory: ${(percentage).toFixed(1)}% used`,
          details: {
            used: (usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
            limit: (jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB',
            percentage: percentage.toFixed(1) + '%',
          },
        };
      }

      return {
        status: 'healthy',
        message: 'Memory info not available',
        details: {},
      };
    } catch (error) {
      return {
        status: 'warning',
        message: `Memory check error: ${error}`,
        details: {},
      };
    }
  }

  static getLastCheck(): HealthStatus | null {
    return this.lastCheck;
  }

  static async startPeriodicCheck(interval: number = 60000): Promise<() => void> {
    const checkInterval = setInterval(() => {
      this.checkHealth();
    }, interval);

    // Do initial check
    await this.checkHealth();

    // Return cleanup function
    return () => clearInterval(checkInterval);
  }
}

// Status reporter
export class StatusReporter {
  static async generateReport(): Promise<string> {
    const health = await HealthChecker.checkHealth();
    const dataStats = {
      accounts: await db.accounts.count(),
      transactions: await db.transactions.count(),
      loans: await db.loans.count(),
      goals: await db.goals.count(),
      investments: await db.investments.count(),
    };

    const report = `
=== KANAKU Status Report ===
Generated: ${new Date().toLocaleString()}
Overall Status: ${health.status.toUpperCase()}

Data Statistics:
  - Accounts: ${dataStats.accounts}
  - Transactions: ${dataStats.transactions}
  - Loans: ${dataStats.loans}
  - Goals: ${dataStats.goals}
  - Investments: ${dataStats.investments}

System Health:
  Database: ${health.components.database.status} - ${health.components.database.message}
  Service Worker: ${health.components.serviceWorker.status} - ${health.components.serviceWorker.message}
  Storage: ${health.components.storage.status} - ${health.components.storage.message}
    ${JSON.stringify(health.components.storage.details)}
  Network: ${health.components.network.status} - ${health.components.network.message}
  Memory: ${health.components.memory.status} - ${health.components.memory.message}
    ${JSON.stringify(health.components.memory.details)}

Browser Info:
  User Agent: ${navigator.userAgent}
  Online: ${navigator.onLine}
  Languages: ${navigator.languages.join(', ')}
`;

    return report;
  }

  static async logReport(): Promise<void> {
    const report = await this.generateReport();
    console.log(report);
  }

  static async downloadReport(): Promise<void> {
    const report = await this.generateReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KANAKU-status-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export default HealthChecker;
