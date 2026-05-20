import { prisma } from '../../db/prisma';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { generateDeviceId } from '../../utils/device';
import { audit } from '../../utils/auditLogger';
import { eventBus } from '../../utils/eventBus';

export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet';
  platform?: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'web';
  appVersion?: string;
}

export interface SyncPullRequest {
  userId: string;
  deviceId: string;
  lastSyncedAt?: string; // ISO timestamp
  entityTypes?: string[]; // Specific entity types to sync
}

export interface SyncPushRequest {
  userId: string;
  deviceId: string;
  entities: {
    entityType: string;
    operation: 'create' | 'update' | 'delete';
    entityId: string;
    data?: any; // For create/update operations
    timestamp: string; // When the operation occurred locally
  }[];
}

export interface SyncResponse {
  success: boolean;
  data?: {
    accounts: any[];
    transactions: any[];
    goals: any[];
    loans: any[];
    settings?: any;
    lastSyncedAt: string;
  };
  conflicts?: {
    entityType: string;
    entityId: string;
    localData: any;
    remoteData: any;
  }[];
  errors?: string[];
}

class SyncService {
  /**
   * Register or update a device for a user
   */
  async registerDevice(userId: string, deviceInfo: DeviceInfo) {
    try {
      // Check if device already exists
      const existingDevice = await prisma.device.findUnique({
        where: { deviceId: deviceInfo.deviceId },
      });

      if (existingDevice) {
        if (existingDevice.userId !== userId) {
          throw new Error('DEVICE_ID_CONFLICT');
        }

        // Update existing device
        const updatedDevice = await prisma.device.update({
          where: { deviceId: deviceInfo.deviceId },
          data: {
            deviceName: deviceInfo.deviceName,
            deviceType: deviceInfo.deviceType,
            platform: deviceInfo.platform,
            appVersion: deviceInfo.appVersion,
            isActive: true,
            lastSeenAt: new Date(),
          },
        });
        return updatedDevice;
      } else {
        // Create new device
        const newDevice = await prisma.device.create({
          data: {
            id: randomUUID(),
            userId,
            deviceId: deviceInfo.deviceId,
            updatedAt: new Date(),
            ...(deviceInfo.deviceName ? { deviceName: deviceInfo.deviceName } : {}),
            ...(deviceInfo.deviceType ? { deviceType: deviceInfo.deviceType } : {}),
            ...(deviceInfo.platform ? { platform: deviceInfo.platform } : {}),
            ...(deviceInfo.appVersion ? { appVersion: deviceInfo.appVersion } : {}),
            isActive: true,
            lastSeenAt: new Date(),
          },
        });
        return newDevice;
      }
    } catch (error) {
      console.error('Failed to register device:', error);
      throw new Error('Device registration failed');
    }
  }

  /**
   * Pull data from server for a specific device
   * This implements the "source of truth" pattern
   */
  async pullData(request: SyncPullRequest): Promise<SyncResponse> {
    try {
      const { userId, deviceId, lastSyncedAt, entityTypes } = request;

      // Update device last seen
      await this.updateDeviceLastSeen(deviceId, userId);

      // Build where clause for incremental sync
      const whereClause = lastSyncedAt 
        ? {
            userId,
            updatedAt: {
              gt: new Date(lastSyncedAt),
            },
          }
        : { userId };

      // Fetch all user data in parallel
      const [accounts, transactions, goals, loans, settings] = await Promise.all([
        (!entityTypes || entityTypes.includes('accounts')) 
          ? prisma.account.findMany({
              where: whereClause,
              orderBy: { updatedAt: 'asc' },
            })
          : [],
        (!entityTypes || entityTypes.includes('transactions'))
          ? prisma.transaction.findMany({
              where: whereClause,
              orderBy: { updatedAt: 'asc' },
            })
          : [],
        (!entityTypes || entityTypes.includes('goals'))
          ? prisma.goal.findMany({
              where: whereClause,
              orderBy: { updatedAt: 'asc' },
            })
          : [],
        (!entityTypes || entityTypes.includes('loans'))
          ? prisma.loan.findMany({
              where: whereClause,
              orderBy: { updatedAt: 'asc' },
            })
          : [],
        (!entityTypes || entityTypes.includes('settings'))
          ? prisma.userSettings.findUnique({
              where: { userId },
            })
          : null,
      ]);

      // Update user's last synced timestamp
      await prisma.user.update({
        where: { id: userId },
        data: { 
          lastSynced: new Date(),
          syncToken: this.generateSyncToken(userId, deviceId),
        },
      });

      return {
        success: true,
        data: {
          accounts: accounts.map(acc => ({ ...acc, deletedAt: acc.deletedAt || undefined })),
          transactions: transactions.map(txn => ({ ...txn, deletedAt: txn.deletedAt || undefined })),
          goals: goals.map(goal => ({ ...goal, deletedAt: goal.deletedAt || undefined })),
          loans: loans.map(loan => ({ ...loan, deletedAt: loan.deletedAt || undefined })),
          settings: settings || undefined,
          lastSyncedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      audit({ event: 'sync.pull', userId: request.userId, meta: { success: false, error: String(error) } });
      console.error('Pull sync failed:', error);
      return {
        success: false,
        errors: ['Failed to pull data from server'],
      };
    }
  }

  /**
   * Push local changes to server
   * Handles conflict resolution using "latest timestamp wins"
   */
  async pushData(request: SyncPushRequest): Promise<SyncResponse> {
    try {
      const { userId, deviceId, entities } = request;
      const conflicts: any[] = [];
      const errors: string[] = [];

      // Update device last seen
      await this.updateDeviceLastSeen(deviceId, userId);

      // Process each entity
      for (const entity of entities) {
        try {
          await this.processEntityOperation(userId, deviceId, entity, conflicts);
        } catch (error) {
          console.error(`Failed to process ${entity.entityType} ${entity.entityId}:`, error);
          const message = error instanceof Error ? error.message : 'Unknown sync error';
          errors.push(`Failed to sync ${entity.entityType}: ${message}`);
        }
      }

      // Update user's last synced timestamp
      await prisma.user.update({
        where: { id: userId },
        data: { 
          lastSynced: new Date(),
          syncToken: this.generateSyncToken(userId, deviceId),
        },
      });

      eventBus.emit({
        type: 'SYNC_COMPLETED',
        payload: { userId, deviceId, entityCount: entities.length },
      });

      return {
        success: conflicts.length === 0 && errors.length === 0,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      audit({ event: 'sync.push', userId: request.userId, meta: { success: false, error: String(error) } });
      console.error('Push sync failed:', error);
      return {
        success: false,
        errors: ['Failed to push data to server'],
      };
    }
  }

  /**
   * Process individual entity operation with conflict resolution
   */
  private async processEntityOperation(
    userId: string, 
    deviceId: string, 
    entity: any, 
    conflicts: any[]
  ) {
    const { entityType, operation, entityId, data, timestamp } = entity;
    const localTimestamp = new Date(timestamp);

    switch (entityType) {
      case 'accounts':
        await this.processAccountOperation(userId, deviceId, operation, entityId, data, localTimestamp, conflicts);
        break;
      case 'transactions':
        await this.processTransactionOperation(userId, deviceId, operation, entityId, data, localTimestamp, conflicts);
        break;
      case 'goals':
        await this.processGoalOperation(userId, deviceId, operation, entityId, data, localTimestamp, conflicts);
        break;
      case 'loans':
        await this.processLoanOperation(userId, deviceId, operation, entityId, data, localTimestamp, conflicts);
        break;
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  private async processAccountOperation(
    userId: string, 
    deviceId: string, 
    operation: string, 
    entityId: string, 
    data: any, 
    localTimestamp: Date,
    conflicts: any[]
  ) {
    const { id: _, userId: __, ...sanitizedData } = data || {};

    if (operation === 'delete') {
      // Soft delete
      await prisma.account.update({
        where: { id: entityId, userId },
        data: { 
          deletedAt: new Date(),
          updatedAt: localTimestamp,
          deviceId,
        },
      });
    } else if (operation === 'create') {
      await prisma.account.create({
        data: {
          ...sanitizedData,
          id: entityId,
          userId,
          deviceId,
          syncStatus: 'synced',
          createdAt: localTimestamp,
          updatedAt: localTimestamp,
        },
      });
    } else if (operation === 'update') {
      const existing = await prisma.account.findUnique({
        where: { id: entityId, userId },
      });

      if (!existing) {
        // Account doesn't exist, create it
        await prisma.account.create({
          data: {
            ...sanitizedData,
            id: entityId,
            userId,
            deviceId,
            syncStatus: 'synced',
            createdAt: localTimestamp,
            updatedAt: localTimestamp,
          },
        });
      } else {
        // Check for conflict
        if (existing.updatedAt > localTimestamp) {
          conflicts.push({
            entityType: 'accounts',
            entityId,
            localData: data,
            remoteData: existing,
          });
        } else {
          // No conflict, update
          await prisma.account.update({
            where: { id: entityId },
            data: {
              ...sanitizedData,
              userId,
              deviceId,
              syncStatus: 'synced',
              updatedAt: localTimestamp,
            },
          });
        }
      }
    }
  }

  private async processTransactionOperation(
    userId: string, 
    deviceId: string, 
    operation: string, 
    entityId: string, 
    data: any, 
    localTimestamp: Date,
    conflicts: any[]
  ) {
    const { id: _, userId: __, ...sanitizedData } = data || {};

    if (operation === 'delete') {
      await prisma.transaction.update({
        where: { id: entityId, userId },
        data: { 
          deletedAt: new Date(),
          updatedAt: localTimestamp,
          deviceId,
        },
      });
    } else if (operation === 'create') {
      // Generate dedup hash to prevent duplicate transactions from multi-device sync
      const amount = sanitizedData?.amount ?? 0;
      const dateStr = sanitizedData?.date ? new Date(sanitizedData.date).toISOString().slice(0, 10) : '';
      const desc = sanitizedData?.description ?? '';
      const dedupHash = createHash('sha256').update(`${userId}:${amount}:${dateStr}:${desc}`).digest('hex');

      const existingDup = await prisma.transaction.findUnique({ where: { dedupHash } });
      if (existingDup) {
        // Duplicate from another device  skip silently
        return;
      }

      await prisma.transaction.create({
        data: {
          ...sanitizedData,
          id: entityId,
          userId,
          deviceId,
          dedupHash,
          syncStatus: 'synced',
          createdAt: localTimestamp,
          updatedAt: localTimestamp,
        },
      });
    } else if (operation === 'update') {
      const existing = await prisma.transaction.findUnique({
        where: { id: entityId, userId },
      });

      if (!existing) {
        const amount = sanitizedData?.amount ?? 0;
        const dateStr = sanitizedData?.date ? new Date(sanitizedData.date).toISOString().slice(0, 10) : '';
        const desc = sanitizedData?.description ?? '';
        const dedupHash = createHash('sha256').update(`${userId}:${amount}:${dateStr}:${desc}`).digest('hex');

        const existingDup = await prisma.transaction.findUnique({ where: { dedupHash } });
        if (existingDup) {
          return;
        }

        await prisma.transaction.create({
          data: {
            ...sanitizedData,
            id: entityId,
            userId,
            deviceId,
            dedupHash,
            syncStatus: 'synced',
            createdAt: localTimestamp,
            updatedAt: localTimestamp,
          },
        });
      } else {
        const localVersion = typeof sanitizedData?.version === 'number' ? sanitizedData.version : 0;
        if (localVersion <= existing.version) {
          // Server version is same or newer  conflict
          conflicts.push({
            entityType: 'transactions',
            entityId,
            localData: data,
            remoteData: existing,
          });
        } else {
          await prisma.transaction.update({
            where: { id: entityId },
            data: {
              ...sanitizedData,
              version: localVersion,
              userId,
              deviceId,
              syncStatus: 'synced',
              updatedAt: localTimestamp,
            },
          });
        }
      }
    }
  }

  private async processGoalOperation(
    userId: string, 
    deviceId: string, 
    operation: string, 
    entityId: string, 
    data: any, 
    localTimestamp: Date,
    conflicts: any[]
  ) {
    const { id: _, userId: __, ...sanitizedData } = data || {};

    if (operation === 'delete') {
      await prisma.goal.update({
        where: { id: entityId, userId },
        data: { 
          deletedAt: new Date(),
          updatedAt: localTimestamp,
          deviceId,
        },
      });
    } else if (operation === 'create') {
      await prisma.goal.create({
        data: {
          ...sanitizedData,
          id: entityId,
          userId,
          deviceId,
          syncStatus: 'synced',
          createdAt: localTimestamp,
          updatedAt: localTimestamp,
        },
      });
    } else if (operation === 'update') {
      const existing = await prisma.goal.findUnique({
        where: { id: entityId, userId },
      });

      if (!existing) {
        await prisma.goal.create({
          data: {
            ...sanitizedData,
            id: entityId,
            userId,
            deviceId,
            syncStatus: 'synced',
            createdAt: localTimestamp,
            updatedAt: localTimestamp,
          },
        });
      } else {
        if (existing.updatedAt > localTimestamp) {
          conflicts.push({
            entityType: 'goals',
            entityId,
            localData: data,
            remoteData: existing,
          });
        } else {
          await prisma.goal.update({
            where: { id: entityId },
            data: {
              ...sanitizedData,
              userId,
              deviceId,
              syncStatus: 'synced',
              updatedAt: localTimestamp,
            },
          });
        }
      }
    }
  }

  private async processLoanOperation(
    userId: string, 
    deviceId: string, 
    operation: string, 
    entityId: string, 
    data: any, 
    localTimestamp: Date,
    conflicts: any[]
  ) {
    const { id: _, userId: __, ...sanitizedData } = data || {};

    if (operation === 'delete') {
      await prisma.loan.update({
        where: { id: entityId, userId },
        data: { 
          deletedAt: new Date(),
          updatedAt: localTimestamp,
          deviceId,
        },
      });
    } else if (operation === 'create') {
      await prisma.loan.create({
        data: {
          ...sanitizedData,
          id: entityId,
          userId,
          deviceId,
          syncStatus: 'synced',
          createdAt: localTimestamp,
          updatedAt: localTimestamp,
        },
      });
    } else if (operation === 'update') {
      const existing = await prisma.loan.findUnique({
        where: { id: entityId, userId },
      });

      if (!existing) {
        await prisma.loan.create({
          data: {
            ...sanitizedData,
            id: entityId,
            userId,
            deviceId,
            syncStatus: 'synced',
            createdAt: localTimestamp,
            updatedAt: localTimestamp,
          },
        });
      } else {
        if (existing.updatedAt > localTimestamp) {
          conflicts.push({
            entityType: 'loans',
            entityId,
            localData: data,
            remoteData: existing,
          });
        } else {
          await prisma.loan.update({
            where: { id: entityId },
            data: {
              ...sanitizedData,
              userId,
              deviceId,
              syncStatus: 'synced',
              updatedAt: localTimestamp,
            },
          });
        }
      }
    }
  }

  private async updateDeviceLastSeen(deviceId: string, userId: string) {
    await prisma.device.updateMany({
      where: { deviceId, userId },
      data: { lastSeenAt: new Date() },
    }).catch(() => {
      // Device might not exist or belong to another user, ignore
    });
  }

  private generateSyncToken(userId: string, deviceId: string): string {
    return Buffer.from(`${userId}:${deviceId}:${Date.now()}`).toString('base64');
  }

  /**
   * Get all devices for a user
   */
  async getUserDevices(userId: string) {
    return await prisma.device.findMany({
      where: { userId, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /**
   * Deactivate a device
   */
  async deactivateDevice(userId: string, deviceId: string) {
    return await prisma.device.update({
      where: { deviceId, userId },
      data: { isActive: false },
    });
  }
}

export const syncService = new SyncService();
