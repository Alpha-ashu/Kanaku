import { Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { AuthRequest } from './auth';
import { reconstructFeatures, reconstructAIFeatures } from '../utils/featureHelpers';

// 30-second in-memory cache for global feature settings
let cachedFeatures: any = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

// Default sub-feature role access and state (matching frontend featureFlags.ts)
const DEFAULT_SUB_FEATURES: Record<string, Record<string, { enabled: boolean; roleAccess: Record<string, boolean> }>> = {
  accounts: {
    importStatement: { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    exportData:      { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    createAccount:   { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    editAccount:     { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    deleteAccount:   { enabled: true, roleAccess: { admin: true, manager: true, advisor: false, user: false } },
    accountTransfer: { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
  },
  transactions: {
    addTransaction:    { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    editTransaction:   { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    deleteTransaction: { enabled: true, roleAccess: { admin: true, manager: true, advisor: false, user: false } },
    importStatement:   { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    exportStatement:   { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
  },
  reports: {
    pdfExport:       { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    excelExport:     { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    csvExport:       { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
  },
};

// Default module baseline role access
const DEFAULT_MODULE_ACCESS: Record<string, Record<string, boolean>> = {
  accounts: { admin: true, manager: true, advisor: true, user: true },
  transactions: { admin: true, manager: true, advisor: true, user: true },
  reports: { admin: true, manager: true, advisor: true, user: true },
};

export const invalidateFeatureCache = () => {
  cachedFeatures = null;
  cacheTimestamp = 0;
  logger.info('[FeatureGate] Global feature flags cache invalidated');
};

const getGlobalFeatures = async () => {
  const now = Date.now();
  if (cachedFeatures && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return cachedFeatures;
  }

  try {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (!adminUser) {
      return {};
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId: adminUser.id },
    });

    if (!settings || !settings.settings) {
      return {};
    }

    const parsedSettings = JSON.parse(settings.settings);
    const roleCentric = parsedSettings.admin_global_feature_settings || {};
    cachedFeatures = reconstructFeatures(roleCentric);
    cacheTimestamp = now;
    return cachedFeatures;
  } catch (error) {
    logger.error('[FeatureGate] Failed to fetch feature flags from database:', error);
    // If error, return cached settings if available (fail-soft)
    return cachedFeatures || {};
  }
};

export const requireFeature = (moduleKey: string, childKey?: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || 'user';
      const features = await getGlobalFeatures();

      const moduleSettings = features[moduleKey];

      // 1. Check Module-Level access
      if (moduleSettings) {
        if (typeof moduleSettings.enabled === 'boolean' && !moduleSettings.enabled) {
          return res.status(403).json({ error: `Feature module '${moduleKey}' is currently disabled.` });
        }
        const readiness = moduleSettings.readiness;
        if (readiness === 'deprecated') {
          return res.status(403).json({ error: `Feature module '${moduleKey}' is currently disabled.` });
        }
        if (readiness === 'unreleased' && userRole !== 'admin') {
          return res.status(403).json({ error: `Feature module '${moduleKey}' is currently disabled.` });
        }
        if (readiness === 'beta' && userRole !== 'admin' && userRole !== 'advisor' && userRole !== 'manager') {
          return res.status(403).json({ error: `Feature module '${moduleKey}' is currently disabled.` });
        }

        // Check module roleAccess override
        if (moduleSettings.roleAccess && typeof moduleSettings.roleAccess[userRole] === 'boolean') {
          if (!moduleSettings.roleAccess[userRole]) {
            return res.status(403).json({ error: `You do not have access to feature module '${moduleKey}'.` });
          }
        }
      } else {
        // Fallback to hardcoded module role access defaults
        const defaultRoleAllowed = DEFAULT_MODULE_ACCESS[moduleKey]?.[userRole] ?? true;
        if (!defaultRoleAllowed) {
          return res.status(403).json({ error: `You do not have access to feature module '${moduleKey}'.` });
        }
      }

      // 2. Check Sub-Feature level access if childKey is provided
      if (childKey) {
        let childEnabled = true;
        let childRoleAllowed = true;

        const defaultChild = DEFAULT_SUB_FEATURES[moduleKey]?.[childKey];
        if (defaultChild) {
          childEnabled = defaultChild.enabled;
          childRoleAllowed = defaultChild.roleAccess[userRole] ?? true;
        }

        const savedChild = moduleSettings?.children?.[childKey];
        if (savedChild) {
          if (typeof savedChild.enabled === 'boolean') {
            childEnabled = savedChild.enabled;
          }
          if (savedChild.roleAccess && typeof savedChild.roleAccess[userRole] === 'boolean') {
            childRoleAllowed = savedChild.roleAccess[userRole];
          }
        }

        if (!childEnabled) {
          return res.status(403).json({ error: `Sub-feature '${childKey}' is currently disabled.` });
        }

        if (!childRoleAllowed) {
          return res.status(403).json({ error: `You do not have access to sub-feature '${childKey}'.` });
        }
      }

      return next();
    } catch (error) {
      logger.error(`[FeatureGate] Error checking sub-feature gate: ${moduleKey}.${childKey}`, error);
      // Fail closed on error to prevent bypassing feature guards
      return res.status(503).json({
        success: false,
        error: 'Feature temporarily unavailable. Please try again.',
        code: 'FEATURE_GATE_ERROR',
      });
    }
  };
};

// --- AI Feature Management ---

let cachedAIFeatures: any = null;
let cacheAITimestamp = 0;

export const invalidateAIFeatureCache = () => {
  cachedAIFeatures = null;
  cacheAITimestamp = 0;
  logger.info('[FeatureGate] AI feature flags cache invalidated');
};

// Default AI feature configuration - all features enabled for all roles
const DEFAULT_AI_FEATURES = {
  ocrEngine: {
    enabled: true,
    roleAccess: { admin: true, manager: true, advisor: true, user: true },
    capabilities: {
      transactionOCR: { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    },
  },
  voiceAssistant: {
    enabled: true,
    roleAccess: { admin: true, manager: true, advisor: true, user: true },
    capabilities: {},
  },
  aiAutomation: {
    enabled: true,
    roleAccess: { admin: true, manager: true, advisor: true, user: true },
    capabilities: {
      smartCategorization: { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      subscriptionDetection: { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      healthScoring: { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      anomalyDetection: { enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    },
  },
};

const getAIGlobalFeatures = async () => {
  const now = Date.now();
  if (cachedAIFeatures && (now - cacheAITimestamp < CACHE_TTL_MS)) {
    return cachedAIFeatures;
  }

  try {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (!adminUser) {
      // No admin user found, use defaults
      cachedAIFeatures = DEFAULT_AI_FEATURES;
      cacheAITimestamp = now;
      return cachedAIFeatures;
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId: adminUser.id },
    });

    if (!settings || !settings.settings) {
      // No settings found, use defaults
      cachedAIFeatures = DEFAULT_AI_FEATURES;
      cacheAITimestamp = now;
      return cachedAIFeatures;
    }

    const parsedSettings = JSON.parse(settings.settings);
    // Use configured settings if available, otherwise use defaults
    const roleCentric = parsedSettings.admin_ai_feature_settings || {};
    cachedAIFeatures = reconstructAIFeatures(roleCentric);
    cacheAITimestamp = now;
    return cachedAIFeatures;
  } catch (error) {
    logger.error('[FeatureGate] Failed to fetch AI feature flags from database:', error);
    // Return defaults on error to ensure AI features are accessible
    return cachedAIFeatures || DEFAULT_AI_FEATURES;
  }
};

export const requireAIFeature = (moduleKey: string, capabilityKey?: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || 'user';
      const features = await getAIGlobalFeatures();

      const moduleSettings = features[moduleKey];
      
      let moduleEnabled = true;
      let moduleRoleAllowed = true;
      
      if (moduleSettings) {
        if (typeof moduleSettings.enabled === 'boolean') {
          moduleEnabled = moduleSettings.enabled;
        }
        if (moduleSettings.roleAccess && typeof moduleSettings.roleAccess[userRole] === 'boolean') {
          moduleRoleAllowed = moduleSettings.roleAccess[userRole];
        }
      }

      if (!moduleEnabled) {
        return res.status(403).json({ error: `AI Module '${moduleKey}' is currently disabled.` });
      }

      if (!moduleRoleAllowed) {
        return res.status(403).json({ error: `You do not have access to AI Module '${moduleKey}'.` });
      }

      if (capabilityKey) {
        let capEnabled = true;
        let capRoleAllowed = true;

        const savedCap = moduleSettings?.capabilities?.[capabilityKey];
        if (savedCap) {
          if (typeof savedCap.enabled === 'boolean') {
            capEnabled = savedCap.enabled;
          }
          if (savedCap.roleAccess && typeof savedCap.roleAccess[userRole] === 'boolean') {
            capRoleAllowed = savedCap.roleAccess[userRole];
          }
        }

        if (!capEnabled) {
          return res.status(403).json({ error: `AI Capability '${capabilityKey}' is currently disabled.` });
        }

        if (!capRoleAllowed) {
          return res.status(403).json({ error: `You do not have access to AI Capability '${capabilityKey}'.` });
        }
      }

      return next();
    } catch (error) {
      logger.error(`[FeatureGate] Error checking AI feature gate: ${moduleKey}.${capabilityKey}`, error);
      return res.status(503).json({
        success: false,
        error: 'AI Feature temporarily unavailable. Please try again.',
        code: 'AI_FEATURE_GATE_ERROR',
      });
    }
  };
};
