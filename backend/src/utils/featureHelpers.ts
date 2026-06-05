import { UserRole, getVisibleFeaturesForRole, SUB_FEATURES, isSubFeatureAccessible } from './roleBasedFeatures';

const roles: UserRole[] = ['admin', 'manager', 'advisor', 'user'];

export const DEFAULT_AI_FEATURES = {
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

/**
 * Transforms a feature-centric structure (keyed by feature key, containing roleAccess mapping)
 * into a role-centric flat configuration dictionary (keyed by role name).
 */
export const transformFeaturesToRoleCentric = (features: any): Record<string, Record<string, any>> => {
  const roleCentric: Record<string, Record<string, any>> = {
    admin: {},
    manager: {},
    advisor: {},
    user: {}
  };

  for (const [fKey, fVal] of Object.entries(features) as [string, any][]) {
    const isFeatureEnabled = fVal.enabled !== false;
    
    roles.forEach(role => {
      const roleHasAccess = fVal.roleAccess ? fVal.roleAccess[role] === true : false;
      roleCentric[role][fKey] = isFeatureEnabled && roleHasAccess;
      if (fVal.lastUpdated) {
        roleCentric[role][`${fKey}_lastUpdated`] = fVal.lastUpdated;
      }

      if (fVal.children) {
        for (const [cKey, cVal] of Object.entries(fVal.children) as [string, any][]) {
          const isChildEnabled = cVal.enabled !== false;
          const childRoleHasAccess = cVal.roleAccess ? cVal.roleAccess[role] === true : false;
          roleCentric[role][`${fKey}_${cKey}`] = isFeatureEnabled && roleHasAccess && isChildEnabled && childRoleHasAccess;
        }
      }
    });
  }

  return roleCentric;
};

/**
 * Reconstructs a feature-centric structure from the database's role-centric flat structure.
 * If targetRole is specified, only that role's access permissions are returned in the roleAccess map (hiding other roles).
 */
export const reconstructFeatures = (roleCentric: any, targetRole?: UserRole): Record<string, any> => {
  const result: Record<string, any> = {};
  const rolesToProcess = targetRole ? [targetRole] : roles;

  // Get all default features
  const defaultFeatures = getVisibleFeaturesForRole('admin');

  Object.entries(defaultFeatures).forEach(([fKey, defaultHasAccess]) => {
    const roleAccess: Record<string, boolean> = {};
    let lastUpdated = new Date(0).toISOString();

    rolesToProcess.forEach(r => {
      if (roleCentric && roleCentric[r] && roleCentric[r].hasOwnProperty(fKey)) {
        roleAccess[r] = roleCentric[r][fKey] === true;
      } else {
        roleAccess[r] = getVisibleFeaturesForRole(r)[fKey] === true;
      }

      if (roleCentric && roleCentric[r] && roleCentric[r][`${fKey}_lastUpdated`]) {
        const t = roleCentric[r][`${fKey}_lastUpdated`];
        if (new Date(t).getTime() > new Date(lastUpdated).getTime()) {
          lastUpdated = t;
        }
      }
    });

    if (lastUpdated === new Date(0).toISOString()) {
      lastUpdated = new Date().toISOString();
    }

    const enabled = targetRole 
      ? (roleAccess[targetRole] === true)
      : Object.values(roleAccess).some(v => v === true);

    const featureObj: any = {
      enabled,
      roleAccess,
      lastUpdated,
    };

    // Reconstruct children
    const defaultSubFeatures = SUB_FEATURES[fKey];
    if (defaultSubFeatures) {
      const childrenObj: Record<string, any> = {};
      Object.keys(defaultSubFeatures).forEach(cKey => {
        const childRoleAccess: Record<string, boolean> = {};
        rolesToProcess.forEach(r => {
          const dbKey = `${fKey}_${cKey}`;
          if (roleCentric && roleCentric[r] && roleCentric[r].hasOwnProperty(dbKey)) {
            childRoleAccess[r] = roleCentric[r][dbKey] === true;
          } else {
            childRoleAccess[r] = isSubFeatureAccessible(r, fKey, cKey);
          }
        });

        const childEnabled = targetRole 
          ? (childRoleAccess[targetRole] === true)
          : Object.values(childRoleAccess).some(v => v === true);

        childrenObj[cKey] = {
          enabled: childEnabled,
          roleAccess: childRoleAccess,
        };
      });
      featureObj.children = childrenObj;
    }

    result[fKey] = featureObj;
  });

  return result;
};

/**
 * Transforms AI feature-centric structure into a role-centric flat configuration.
 */
export const transformAIFeaturesToRoleCentric = (aiFeatures: any): Record<string, Record<string, any>> => {
  const roleCentric: Record<string, Record<string, any>> = {
    admin: {},
    manager: {},
    advisor: {},
    user: {}
  };

  for (const [fKey, fVal] of Object.entries(aiFeatures) as [string, any][]) {
    const isFeatureEnabled = fVal.enabled !== false;
    
    roles.forEach(role => {
      const roleHasAccess = fVal.roleAccess ? fVal.roleAccess[role] === true : false;
      roleCentric[role][fKey] = isFeatureEnabled && roleHasAccess;
      if (fVal.lastUpdated) {
        roleCentric[role][`${fKey}_lastUpdated`] = fVal.lastUpdated;
      }

      if (fVal.capabilities) {
        for (const [cKey, cVal] of Object.entries(fVal.capabilities) as [string, any][]) {
          const isCapEnabled = cVal.enabled !== false;
          const capRoleHasAccess = cVal.roleAccess ? cVal.roleAccess[role] === true : false;
          roleCentric[role][`${fKey}_${cKey}`] = isFeatureEnabled && roleHasAccess && isCapEnabled && capRoleHasAccess;
        }
      }
    });
  }

  return roleCentric;
};

/**
 * Reconstructs AI feature-centric structure from database's role-centric flat structure.
 */
export const reconstructAIFeatures = (roleCentric: any, targetRole?: UserRole): Record<string, any> => {
  const result: Record<string, any> = {};
  const rolesToProcess = targetRole ? [targetRole] : roles;

  Object.entries(DEFAULT_AI_FEATURES).forEach(([fKey, defaultVal]) => {
    const roleAccess: Record<string, boolean> = {};
    let lastUpdated = new Date(0).toISOString();

    rolesToProcess.forEach(r => {
      if (roleCentric && roleCentric[r] && roleCentric[r].hasOwnProperty(fKey)) {
        roleAccess[r] = roleCentric[r][fKey] === true;
      } else {
        roleAccess[r] = defaultVal.roleAccess[r] === true;
      }

      if (roleCentric && roleCentric[r] && roleCentric[r][`${fKey}_lastUpdated`]) {
        const t = roleCentric[r][`${fKey}_lastUpdated`];
        if (new Date(t).getTime() > new Date(lastUpdated).getTime()) {
          lastUpdated = t;
        }
      }
    });

    if (lastUpdated === new Date(0).toISOString()) {
      lastUpdated = new Date().toISOString();
    }

    const enabled = targetRole 
      ? (roleAccess[targetRole] === true)
      : Object.values(roleAccess).some(v => v === true);

    const featureObj: any = {
      enabled,
      roleAccess,
      lastUpdated,
      capabilities: {},
    };

    if (defaultVal.capabilities) {
      Object.entries(defaultVal.capabilities).forEach(([cKey, cDefaultVal]) => {
        const childRoleAccess: Record<string, boolean> = {};
        rolesToProcess.forEach(r => {
          const dbKey = `${fKey}_${cKey}`;
          if (roleCentric && roleCentric[r] && roleCentric[r].hasOwnProperty(dbKey)) {
            childRoleAccess[r] = roleCentric[r][dbKey] === true;
          } else {
            childRoleAccess[r] = cDefaultVal.roleAccess[r] === true;
          }
        });

        const childEnabled = targetRole 
          ? (childRoleAccess[targetRole] === true)
          : Object.values(childRoleAccess).some(v => v === true);

        featureObj.capabilities[cKey] = {
          enabled: childEnabled,
          roleAccess: childRoleAccess,
        };
      });
    }

    result[fKey] = featureObj;
  });

  return result;
};
