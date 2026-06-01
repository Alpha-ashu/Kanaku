import { Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { AuthRequest } from './auth';

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
    cachedFeatures = parsedSettings.admin_global_feature_settings || {};
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
      // In case of unexpected server errors checking feature gate, we fail-open for stability but log it.
      return next();
    }
  };
};
