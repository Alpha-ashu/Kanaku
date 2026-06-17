// Environment configuration for production
export const ENVIRONMENT_CONFIG = {
  // Environment type
  NODE_ENV: process.env.NODE_ENV || 'production',

  // API configuration
  API_BASE_URL: process.env.VITE_API_BASE_URL || '',
  API_TIMEOUT: 30000, // 30 seconds

  // Database configuration
  DB_NAME: 'KANAKUDB',
  DB_VERSION: 3,
  DB_ENCRYPTION_ENABLED: true,

  // Feature flags
  FEATURES: {
    VOICE_INPUT: process.env.VITE_FEATURE_VOICE_INPUT === 'true',
    BIOMETRIC_AUTH: process.env.VITE_FEATURE_BIOMETRIC_AUTH === 'true',
    CLOUD_SYNC: process.env.VITE_FEATURE_CLOUD_SYNC === 'true',
    ADVANCED_REPORTS: process.env.VITE_FEATURE_ADVANCED_REPORTS === 'true',
    INVESTMENT_TRACKING: process.env.VITE_FEATURE_INVESTMENT_TRACKING === 'true'
  },

  // Analytics and monitoring
  ANALYTICS_ENABLED: process.env.VITE_ANALYTICS_ENABLED === 'true',
  ERROR_REPORTING_ENABLED: process.env.VITE_ERROR_REPORTING_ENABLED === 'true',

  // Security settings
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes

  // Performance settings
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  BATCH_SIZE: 100,
  VIRTUALIZATION_THRESHOLD: 50,

  // PWA settings
  PWA_UPDATE_CHECK_INTERVAL: 60000, // 1 minute
  PWA_INSTALL_PROMPT_DELAY: 5000, // 5 seconds
  PWA_OFFLINE_RETRY_ATTEMPTS: 3,

  // Mobile app settings
  MOBILE_APP_STORE_URL: {
    ios: process.env.VITE_IOS_APP_STORE_URL || '',
    android: process.env.VITE_ANDROID_APP_STORE_URL || ''
  }
};

// Environment detection utilities
export class EnvironmentDetector {
  static isDevelopment(): boolean {
    return ENVIRONMENT_CONFIG.NODE_ENV === 'development';
  }

  static isProduction(): boolean {
    return ENVIRONMENT_CONFIG.NODE_ENV === 'production';
  }

  static isTesting(): boolean {
    return ENVIRONMENT_CONFIG.NODE_ENV === 'test';
  }

  static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  static isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  static isAndroid(): boolean {
    return /Android/.test(navigator.userAgent);
  }

  static isPWA(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
  }

  static getConnectionType(): string {
    if ('connection' in navigator) {
      const connection = navigator.connection as any;
      return connection.effectiveType || 'unknown';
    }
    return 'unknown';
  }

  static getDeviceMemory(): number {
    if ('deviceMemory' in navigator) {
      return (navigator as any).deviceMemory;
    }
    return 4; // Default assumption
  }

  static getCPUConcurrency(): number {
    if ('hardwareConcurrency' in navigator) {
      return (navigator as any).hardwareConcurrency;
    }
    return 4; // Default assumption
  }
}

// Configuration validation
export function validateEnvironmentConfig(): void {
  const requiredEnvVars = [
    'VITE_API_BASE_URL'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0 && EnvironmentDetector.isProduction()) {
    console.warn('Missing required environment variables:', missingVars);
  }
}

// Feature flag management
export class FeatureFlags {
  static isEnabled(feature: keyof typeof ENVIRONMENT_CONFIG.FEATURES): boolean {
    return ENVIRONMENT_CONFIG.FEATURES[feature];
  }

  static enable(feature: keyof typeof ENVIRONMENT_CONFIG.FEATURES): void {
    ENVIRONMENT_CONFIG.FEATURES[feature] = true;
  }

  static disable(feature: keyof typeof ENVIRONMENT_CONFIG.FEATURES): void {
    ENVIRONMENT_CONFIG.FEATURES[feature] = false;
  }

  static toggle(feature: keyof typeof ENVIRONMENT_CONFIG.FEATURES): void {
    ENVIRONMENT_CONFIG.FEATURES[feature] = !ENVIRONMENT_CONFIG.FEATURES[feature];
  }
}

// Environment-specific logging
export class EnvironmentLogger {
  static log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (EnvironmentDetector.isDevelopment()) {
      console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    } else if (level === 'error' || level === 'warn') {
      console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    }
  }

  static debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  static info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  static warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  static error(message: string, data?: any): void {
    this.log('error', message, data);
  }
}

// Environment health check
export class EnvironmentHealth {
  static async checkHealth(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    issues: string[];
    performance: {
      connectionType: string;
      deviceMemory: number;
      cpuConcurrency: number;
      storageQuota: number;
      storageUsed: number;
    };
  }> {
    const issues: string[] = [];
    const performance = {
      connectionType: EnvironmentDetector.getConnectionType(),
      deviceMemory: EnvironmentDetector.getDeviceMemory(),
      cpuConcurrency: EnvironmentDetector.getCPUConcurrency(),
      storageQuota: 0,
      storageUsed: 0
    };

    // Check storage quota
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        performance.storageQuota = estimate.quota || 0;
        performance.storageUsed = estimate.usage || 0;

        const storageUsagePercent = (performance.storageUsed / performance.storageQuota) * 100;
        if (storageUsagePercent > 90) {
          issues.push('Storage usage is above 90%');
        }
      } catch (error) {
        issues.push('Unable to check storage quota');
      }
    }

    // Check service worker
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length === 0) {
          issues.push('No service worker registered');
        }
      } catch (error) {
        issues.push('Unable to check service worker status');
      }
    }

    // Check PWA installation
    if (!EnvironmentDetector.isPWA()) {
      issues.push('App not installed as PWA');
    }

    // Check connection quality
    if (performance.connectionType === 'slow-2g' || performance.connectionType === '2g') {
      issues.push('Poor network connection detected');
    }

    // Determine status
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (issues.length > 0) {
      status = issues.some(issue => issue.includes('Unable to')) ? 'error' : 'warning';
    }

    return { status, issues, performance };
  }

  static async reportHealth(): Promise<void> {
    const health = await this.checkHealth();

    if (health.status === 'error') {
      EnvironmentLogger.error('Environment health check failed', health);
    } else if (health.status === 'warning') {
      EnvironmentLogger.warn('Environment health check has warnings', health);
    } else {
      EnvironmentLogger.info('Environment health check passed', health);
    }
  }
}

// Initialize environment
export function initializeEnvironment(): void {
  // Validate configuration
  validateEnvironmentConfig();

  // Report health in development
  if (EnvironmentDetector.isDevelopment()) {
    EnvironmentHealth.reportHealth();
  }

  // Set up periodic health checks in production
  if (EnvironmentDetector.isProduction()) {
    setInterval(() => {
      EnvironmentHealth.reportHealth();
    }, 10 * 60 * 1000); // Every 10 minutes
  }
}

