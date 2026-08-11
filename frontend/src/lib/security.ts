import { db } from './database';
import { PRODUCTION_CONFIG } from './production';

// Security configuration
export const SECURITY_CONFIG = {
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  PASSWORD_MIN_LENGTH: 8,
  ENCRYPTION_KEY_ROUNDS: 1000
};

// Session management
export class SessionManager {
  private static instance: SessionManager;
  private sessionTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  // Store bound handler references so we can actually remove them
  private activityHandlers: Map<string, EventListener> = new Map();
  private activityDebounce: NodeJS.Timeout | null = null;

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  startSession(): void {
    this.resetTimer();
    this.setupActivityListeners();
  }

  endSession(): void {
    this.clearTimer();
    this.clearActivityListeners();
    this.lockApp();
  }

  private resetTimer(): void {
    this.clearTimer();
    this.lastActivity = Date.now();
    this.sessionTimer = setInterval(() => {
      const now = Date.now();
      if (now - this.lastActivity > SECURITY_CONFIG.SESSION_TIMEOUT) {
        this.endSession();
      }
    }, 60000); // Check every minute
  }

  private clearTimer(): void {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  private setupActivityListeners(): void {
    // Remove any existing listeners first to avoid duplicates
    this.clearActivityListeners();

    const events = ['mousedown', 'keypress', 'scroll', 'touchstart'];
    events.forEach(eventName => {
      const handler: EventListener = () => {
        // Debounce activity updates to avoid thrashing on scroll/mouse
        if (this.activityDebounce) clearTimeout(this.activityDebounce);
        this.activityDebounce = setTimeout(() => {
          this.lastActivity = Date.now();
        }, 500);
      };
      this.activityHandlers.set(eventName, handler);
      document.addEventListener(eventName, handler, { passive: true });
    });
  }

  private clearActivityListeners(): void {
    this.activityHandlers.forEach((handler, eventName) => {
      document.removeEventListener(eventName, handler);
    });
    this.activityHandlers.clear();
    if (this.activityDebounce) {
      clearTimeout(this.activityDebounce);
      this.activityDebounce = null;
    }
  }

  private lockApp(): void {
    // Trigger PIN authentication
    const event = new CustomEvent('session-timeout', { detail: { reason: 'timeout' } });
    window.dispatchEvent(event);
  }
}

// Input validation and sanitization
export class InputValidator {
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < SECURITY_CONFIG.PASSWORD_MIN_LENGTH) {
      errors.push(`Password must be at least ${SECURITY_CONFIG.PASSWORD_MIN_LENGTH} characters long`);
    }

    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/(?=.*[!@#$%^&*])/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static sanitizeInput(input: string): string {
    return input.replace(/[<>"'&]/g, (match) => {
      const map: Record<string, string> = {
        '<': '<',
        '>': '>',
        '"': '"',
        "'": '&#x27;',
        '&': '&'
      };
      return map[match];
    });
  }

  static validateAmount(amount: string): boolean {
    const num = parseFloat(amount);
    return !isNaN(num) && isFinite(num) && num > 0;
  }

  static validateDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }
}

// Rate limiting
export class RateLimiter {
  private static instance: RateLimiter;
  private attempts: Map<string, { count: number; firstAttempt: number }> = new Map();

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  async isAllowed(identifier: string): Promise<boolean> {
    const now = Date.now();
    const attempt = this.attempts.get(identifier);

    if (!attempt) {
      this.attempts.set(identifier, { count: 1, firstAttempt: now });
      return true;
    }

    // Check if lockout period has expired
    if (now - attempt.firstAttempt > SECURITY_CONFIG.LOCKOUT_DURATION) {
      this.attempts.set(identifier, { count: 1, firstAttempt: now });
      return true;
    }

    // Check if max attempts reached
    if (attempt.count >= SECURITY_CONFIG.MAX_FAILED_ATTEMPTS) {
      return false;
    }

    // Increment attempt count
    attempt.count++;
    return true;
  }

  resetAttempts(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

// Content Security Policy helper
export class CSPManager {
  static setDefaultCSP(): void {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'"
    ].join('; ');

    // CSP is applied via meta tag in index.html - this method is kept for future
    // server-side header configuration reference.
  }
}

// Data integrity checks
export class DataIntegrity {
  static async verifyDatabaseIntegrity(): Promise<boolean> {
    try {
      // Check if all required tables exist
      const tables = await db.tables;
      const requiredTables = ['accounts', 'transactions', 'loans', 'goals', 'investments'];

      for (const table of requiredTables) {
        if (!tables.find(t => t.name === table)) {
          throw new Error(`Missing required table: ${table}`);
        }
      }

      // Check for corrupted data
      const accountCount = await db.accounts.count();
      const transactionCount = await db.transactions.count();

      if (accountCount < 0 || transactionCount < 0) {
        throw new Error('Database integrity check failed');
      }

      return true;
    } catch (error) {
      console.error('Database integrity check failed:', error);
      return false;
    }
  }

  static async backupAndVerify(): Promise<void> {
    const integrityOk = await DataIntegrity.verifyDatabaseIntegrity();

    if (!integrityOk) {
      throw new Error('Database integrity check failed before backup');
    }

    // Create backup
    const backupData = {
      timestamp: new Date().toISOString(),
      accounts: await db.accounts.toArray(),
      transactions: await db.transactions.toArray(),
      loans: await db.loans.toArray(),
      goals: await db.goals.toArray(),
      investments: await db.investments.toArray()
    };

    // Verify backup integrity
    const backupIntegrityOk = await DataIntegrity.verifyBackupIntegrity(backupData);

    if (!backupIntegrityOk) {
      throw new Error('Backup integrity check failed');
    }

    console.log('Backup created and verified successfully');
  }

  private static async verifyBackupIntegrity(backupData: any): Promise<boolean> {
    try {
      // Structural integrity checks - verify data is present and well-formed
      if (!backupData.timestamp || !Array.isArray(backupData.accounts)) {
        return false;
      }

      // Verify backup timestamp is recent (within last 5 minutes)
      const backupAge = Date.now() - new Date(backupData.timestamp).getTime();
      if (backupAge > 5 * 60 * 1000) {
        return false;
      }

      // Verify account records have valid non-NaN balances
      for (const account of backupData.accounts) {
        if (typeof account.balance !== 'number' || isNaN(account.balance)) {
          return false;
        }
      }

      // Verify transactions have required fields
      for (const tx of (backupData.transactions ?? [])) {
        if (!tx.type || typeof tx.amount !== 'number' || isNaN(tx.amount)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Backup integrity check failed:', error);
      return false;
    }
  }
}

// Security initialization
export function initializeSecurity(): void {
  // Set up CSP
  CSPManager.setDefaultCSP();

  // Start session management
  const sessionManager = SessionManager.getInstance();
  sessionManager.startSession();

  // Set up periodic integrity checks
  setInterval(async () => {
    try {
      const integrityOk = await DataIntegrity.verifyDatabaseIntegrity();
      if (!integrityOk) {
        console.error('Database integrity check failed');
        // In a real app, you might trigger a backup restore or alert the user
      }
    } catch (error) {
      console.error('Integrity check error:', error);
    }
  }, 60 * 60 * 1000); // Check every hour
}
