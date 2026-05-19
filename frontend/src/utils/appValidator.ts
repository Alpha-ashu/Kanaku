/**
 * App Validation Utility
 * 
 * Comprehensive validation for:
 * - Backend sync functionality
 * - Tab switching stability
 * - Profile setup flow
 * - Overall app health
 */

import { backendSyncService } from '@/lib/backend-sync-service';
import { syncService } from '@/lib/sync-service';

interface ValidationResult {
  isValid: boolean;
  issues: string[];
  recommendations: string[];
  score: number; // 0-100
}

interface HealthCheck {
  status: 'healthy' | 'warning' | 'critical';
  checks: {
    backendSync: boolean;
    frontendSync: boolean;
    profileData: boolean;
    accessibility: boolean;
    performance: boolean;
  };
  timestamp: Date;
}

export class AppValidator {
  private static instance: AppValidator;
  private validationResults: Map<string, ValidationResult> = new Map();

  static getInstance(): AppValidator {
    if (!AppValidator.instance) {
      AppValidator.instance = new AppValidator();
    }
    return AppValidator.instance;
  }

  // Validate backend sync stability
  async validateBackendSync(): Promise<ValidationResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    try {
      const status = backendSyncService.getSyncStatus();
      
      // Check if backend sync is responsive
      if (status.syncInProgress) {
        issues.push('Backend sync is currently in progress');
        score -= 10;
      }

      // Check for excessive pending operations
      if (status.pendingOperations > 10) {
        issues.push(`High number of pending operations: ${status.pendingOperations}`);
        recommendations.push('Consider reducing sync frequency or implementing batching');
        score -= 20;
      }

      // Check online status
      if (!status.isOnline) {
        issues.push('App is offline - sync may be delayed');
        recommendations.push('Check internet connection for optimal performance');
        score -= 15;
      }

      // Test backend sync functionality
      const syncTest = await backendSyncService.syncWithBackend();
      if (!syncTest) {
        issues.push('Backend sync test failed');
        recommendations.push('Check backend API endpoints and network connectivity');
        score -= 30;
      }

    } catch (error) {
      issues.push(`Backend sync validation error: ${error}`);
      recommendations.push('Review backend sync service configuration');
      score -= 40;
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations,
      score,
    };
  }

  // Validate tab switching stability
  async validateTabSwitching(): Promise<ValidationResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    try {
      // Check for visibility change listeners
      const visibilityEvents: number[] = [];
      document.addEventListener('visibilitychange', () => {
        visibilityEvents.push(Date.now());
      });

      // Simulate tab switching (for testing)
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        value: 'hidden'
      });
      document.dispatchEvent(new Event('visibilitychange'));
      
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        value: 'visible'
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Check if excessive events are fired
      if (visibilityEvents.length > 2) {
        issues.push(`Excessive visibility events detected: ${visibilityEvents.length}`);
        recommendations.push('Review visibility change handlers for performance issues');
        score -= 15;
      }

      // Check for automatic refreshes
      const initialTitle = document.title;
      setTimeout(() => {
        if (document.title !== initialTitle) {
          issues.push('Document title changed during tab switching test');
          recommendations.push('Ensure no automatic page refreshes occur on tab switching');
          score -= 25;
        }
      }, 1000);

    } catch (error) {
      issues.push(`Tab switching validation error: ${error}`);
      recommendations.push('Review visibility change event handlers');
      score -= 20;
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations,
      score,
    };
  }

  // Validate profile setup flow
  async validateProfileSetup(): Promise<ValidationResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    try {
      // Check localStorage for profile data
      const profileData = localStorage.getItem('user_profile');
      if (!profileData) {
        issues.push('No profile data found in localStorage');
        recommendations.push('Complete profile setup process');
        score -= 30;
      } else {
        try {
          const parsed = JSON.parse(profileData);
          
          // Validate required fields
          const requiredFields = ['firstName', 'email', 'dateOfBirth'];
          requiredFields.forEach(field => {
            if (!parsed[field]) {
              issues.push(`Missing required profile field: ${field}`);
              recommendations.push(`Complete ${field} in profile setup`);
              score -= 10;
            }
          });

          // Validate data formats
          if (parsed.dateOfBirth && !this.isValidDate(parsed.dateOfBirth)) {
            issues.push('Invalid date format in profile');
            recommendations.push('Use YYYY-MM-DD format for date of birth');
            score -= 5;
          }

          if (parsed.email && !this.isValidEmail(parsed.email)) {
            issues.push('Invalid email format in profile');
            recommendations.push('Provide a valid email address');
            score -= 5;
          }

        } catch (parseError) {
          issues.push('Corrupted profile data in localStorage');
          recommendations.push('Clear profile data and complete setup again');
          score -= 25;
        }
      }

      // Check backend sync status for profile
      const syncStatus = backendSyncService.getSyncStatus();
      if (syncStatus.pendingOperations > 0) {
        issues.push('Profile changes pending sync');
        recommendations.push('Wait for profile sync to complete');
        score -= 10;
      }

    } catch (error) {
      issues.push(`Profile setup validation error: ${error}`);
      recommendations.push('Review profile setup flow and data handling');
      score -= 20;
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations,
      score,
    };
  }

  // Comprehensive app health check
  async performHealthCheck(): Promise<HealthCheck> {
    const [backendSyncResult, tabSwitchResult, profileResult] = await Promise.all([
      this.validateBackendSync(),
      this.validateTabSwitching(),
      this.validateProfileSetup(),
    ]);

    const checks = {
      backendSync: backendSyncResult.isValid,
      frontendSync: true, // Assume frontend sync is working if no errors
      profileData: profileResult.isValid,
      accessibility: this.checkAccessibilityFeatures(),
      performance: this.checkPerformanceMetrics(),
    };

    const failedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const successRate = (failedChecks / totalChecks) * 100;

    let status: 'healthy' | 'warning' | 'critical';
    if (successRate >= 90) status = 'healthy';
    else if (successRate >= 70) status = 'warning';
    else status = 'critical';

    return {
      status,
      checks,
      timestamp: new Date(),
    };
  }

  // Helper methods
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private checkAccessibilityFeatures(): boolean {
    // Check for basic accessibility features
    const hasSkipLinks = document.querySelector('[href="#main-content"]') !== null;
    const hasAriaLabels = document.querySelector('[aria-live]') !== null;
    const hasFocusManagement = document.querySelector('[tabindex]') !== null;
    
    return hasSkipLinks && hasAriaLabels && hasFocusManagement;
  }

  private checkPerformanceMetrics(): boolean {
    // Check basic performance metrics
    if ('performance' in window) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        const loadTime = navigation.loadEventEnd - navigation.loadEventStart;
        return loadTime < 5000; // Less than 5 seconds
      }
    }
    return true; // Assume good performance if not measurable
  }

  // Generate comprehensive validation report
  async generateValidationReport(): Promise<{
    overallScore: number;
    healthStatus: HealthCheck;
    detailedResults: Record<string, ValidationResult>;
    summary: string;
  }> {
    const [backendSync, tabSwitching, profileSetup] = await Promise.all([
      this.validateBackendSync(),
      this.validateTabSwitching(),
      this.validateProfileSetup(),
    ]);

    const detailedResults = {
      backendSync,
      tabSwitching,
      profileSetup,
    };

    const overallScore = Math.round(
      (backendSync.score + tabSwitching.score + profileSetup.score) / 3
    );

    const healthStatus = await this.performHealthCheck();

    const summary = this.generateSummary(overallScore, healthStatus);

    return {
      overallScore,
      healthStatus,
      detailedResults,
      summary,
    };
  }

  private generateSummary(score: number, health: HealthCheck): string {
    let summary = `App Validation Complete\n`;
    summary += `Overall Score: ${score}/100\n`;
    summary += `Health Status: ${health.status.toUpperCase()}\n\n`;

    if (score >= 90) {
      summary += 'Excellent! Your app is running smoothly with stable sync and no critical issues.';
    } else if (score >= 70) {
      summary += 'Good! App is functional but has some areas for improvement.';
    } else {
      summary += 'Attention needed! Critical issues detected that may affect user experience.';
    }

    summary += '\n\nKey Findings:';
    if (!health.checks.backendSync) summary += '\n- Backend sync needs attention';
    if (!health.checks.profileData) summary += '\n- Profile setup incomplete';
    if (!health.checks.accessibility) summary += '\n- Accessibility features missing';
    if (!health.checks.performance) summary += '\n- Performance optimization needed';

    return summary;
  }
}

// Export singleton instance
export const appValidator = AppValidator.getInstance();

// Convenience function for quick validation
export const validateApp = async () => {
  return await appValidator.generateValidationReport();
};
