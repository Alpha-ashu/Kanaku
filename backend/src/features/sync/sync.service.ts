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
    budgets: any[];
    investments: any[];
    recurringTransactions: any[];
    goldAssets: any[];
    friends: any[];
    settings?: any;
    lastSyncedAt: string;
    // Cursor for the next incremental pull — clients should store this and send
    // it back as `lastSyncedAt`. Identical to lastSyncedAt; named explicitly so
    // its purpose is unambiguous.
    serverTimestamp: string;
  };
  conflicts?: {
    entityType: string;
    entityId: string;
    localData: any;
    remoteData: any;
  }[];
  errors?: string[];
}

// ─── Syncable-field allow-lists (Prisma field names) ───────────────────────────
const SYNC_FIELDS = {
  budgets: ['category', 'amount', 'spent', 'period', 'threshold', 'startDate', 'endDate', 'alertEnabled', 'alertChannels', 'syncStatus'] as const,
  investments: [
    'assetType', 'assetName', 'quantity', 'buyPrice', 'currentPrice', 'totalInvested', 'currentValue', 'profitLoss',
    'purchaseDate', 'lastUpdated', 'metadata', 'broker', 'description', 'assetCurrency', 'baseCurrency', 'buyFxRate',
    'lastKnownFxRate', 'totalInvestedNative', 'currentValueNative', 'valuationVersion', 'positionStatus', 'closedAt',
    'closePrice', 'closeFxRate', 'grossSaleValue', 'netSaleValue', 'purchaseFees', 'closingFees', 'realizedProfitLoss',
    'closeNotes', 'syncStatus',
  ] as const,
  recurringTransactions: [
    'title', 'amount', 'category', 'subcategory', 'interval', 'nextDueDate', 'autoProcess', 'status', 'accountId',
    'description', 'merchant', 'type', 'startDate', 'endDate', 'reminderDaysBefore', 'notes', 'transferToAccountId', 'syncStatus',
  ] as const,
  goldAssets: ['type', 'quantity', 'unit', 'purchasePrice', 'currentPrice', 'purchaseDate', 'purityPercentage', 'location', 'certificateNumber', 'notes', 'syncStatus'] as const,
  friends: ['name', 'email', 'phone', 'avatar', 'notes', 'syncStatus'] as const,
};

class SyncService {
  private pickAllowedFields(data: any, allowed: readonly string[]): Record<string, any> {
    const result: Record<string, any> = {};
    if (!data || typeof data !== 'object') return result;
    for (const key of allowed) {
      if (data[key] !== undefined) {
        result[key] = data[key];
      }
    }
    return result;
  }
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

      const want = (t: string) => !entityTypes || entityTypes.includes(t);

      // Fetch all user data in parallel
      const [accounts, transactions, goals, loans, budgets, investments, recurring, goldAssets, friends, settings] = await Promise.all([
        want('accounts') ? prisma.account.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('transactions') ? prisma.transaction.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('goals') ? prisma.goal.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('loans') ? prisma.loan.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('budgets') ? prisma.budget.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('investments') ? prisma.investment.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('recurringTransactions') ? prisma.recurringTransaction.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('goldAssets') ? prisma.goldAsset.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('friends') ? prisma.friend.findMany({ where: whereClause, orderBy: { updatedAt: 'asc' } }) : [],
        want('settings') ? prisma.userSettings.findUnique({ where: { userId } }) : null,
      ]);

      // Update user's last synced timestamp
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastSynced: new Date(),
          syncToken: this.generateSyncToken(userId, deviceId),
        },
      });

      const now = new Date().toISOString();
      const strip = <T extends { deletedAt?: Date | null }>(rows: T[]) =>
        rows.map((r) => ({ ...r, deletedAt: r.deletedAt || undefined }));

      return {
        success: true,
        data: {
          accounts: strip(accounts as any),
          transactions: strip(transactions as any),
          goals: strip(goals as any),
          loans: strip(loans as any),
          budgets: strip(budgets as any),
          investments: strip(investments as any),
          // Surface Dexie-friendly aliases (name/frequency) alongside canonical columns.
          recurringTransactions: strip(recurring as any).map((r: any) => ({ ...r, name: r.title, frequency: r.interval })),
          goldAssets: strip(goldAssets as any),
          friends: strip(friends as any),
          settings: settings || undefined,
          lastSyncedAt: now,
          serverTimestamp: now,
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
          // Pass the client-controlled entity fields as separate arguments, not
          // interpolated into the format string, so a crafted entityType/entityId
          // (e.g. "%s%s") cannot be interpreted as a console format specifier.
          console.error('Failed to process sync entity:', entity.entityType, entity.entityId, error);
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
      case 'budgets':
        await this.processRecordOperation({ delegate: prisma.budget, entityType, userId, operation, entityId, data, localTimestamp, conflicts, allowed: SYNC_FIELDS.budgets });
        break;
      case 'investments':
        await this.processRecordOperation({ delegate: prisma.investment, entityType, userId, operation, entityId, data, localTimestamp, conflicts, allowed: SYNC_FIELDS.investments });
        break;
      case 'recurringTransactions':
        await this.processRecordOperation({
          delegate: prisma.recurringTransaction, entityType, userId, operation, entityId,
          // Map Dexie names onto canonical Prisma columns so nothing is dropped.
          data: this.mapRecurringInbound(data), localTimestamp, conflicts, allowed: SYNC_FIELDS.recurringTransactions,
        });
        break;
      case 'goldAssets':
        await this.processRecordOperation({ delegate: prisma.goldAsset, entityType, userId, operation, entityId, data, localTimestamp, conflicts, allowed: SYNC_FIELDS.goldAssets });
        break;
      case 'friends':
        await this.processRecordOperation({ delegate: prisma.friend, entityType, userId, operation, entityId, data, localTimestamp, conflicts, allowed: SYNC_FIELDS.friends });
        break;
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  /** Normalize a recurring-transaction payload coming from the Dexie client. */
  private mapRecurringInbound(data: any): any {
    if (!data || typeof data !== 'object') return data;
    const mapped = { ...data };
    if (mapped.name !== undefined && mapped.title === undefined) mapped.title = mapped.name;
    if (mapped.frequency !== undefined && mapped.interval === undefined) mapped.interval = mapped.frequency;
    return mapped;
  }

  /**
   * Generic create/update/delete handler with idempotent create, owner-scoped
   * delete, and latest-timestamp-wins conflict resolution. Used for the
   * self-contained record types (budgets, investments, recurring, gold, friends).
   */
  private async processRecordOperation(args: {
    delegate: any;
    entityType: string;
    userId: string;
    operation: string;
    entityId: string;
    data: any;
    localTimestamp: Date;
    conflicts: any[];
    allowed: readonly string[];
  }) {
    const { delegate, entityType, userId, operation, entityId, data, localTimestamp, conflicts, allowed } = args;
    const sanitizedData = this.pickAllowedFields(data, allowed);

    if (operation === 'delete') {
      // Owner-scoped soft delete.
      await delegate.updateMany({
        where: { id: entityId, userId },
        data: { deletedAt: new Date(), updatedAt: localTimestamp },
      });
      return;
    }

    if (operation === 'create') {
      // Idempotent create — a retried create is a silent no-op.
      await delegate.upsert({
        where: { id: entityId },
        create: { ...sanitizedData, id: entityId, userId, syncStatus: 'synced', createdAt: localTimestamp, updatedAt: localTimestamp },
        update: {},
      });
      return;
    }

    // update
    const existing = await delegate.findUnique({ where: { id: entityId } });
    if (!existing) {
      await delegate.create({
        data: { ...sanitizedData, id: entityId, userId, syncStatus: 'synced', createdAt: localTimestamp, updatedAt: localTimestamp },
      });
      return;
    }
    if (existing.userId !== userId) {
      // Never let one user's push mutate another user's record.
      return;
    }
    if (existing.updatedAt > localTimestamp) {
      conflicts.push({ entityType, entityId, localData: data, remoteData: existing });
    } else {
      await delegate.update({
        where: { id: entityId },
        data: { ...sanitizedData, syncStatus: 'synced', updatedAt: localTimestamp },
      });
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
    const allowed = ['name', 'type', 'provider', 'country', 'balance', 'currency', 'color', 'icon', 'syncStatus'];
    const sanitizedData = this.pickAllowedFields(data, allowed);

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
      // Idempotent create: a retried create (e.g. after a dropped response)
      // must not throw a primary-key violation. Treat re-creates as no-ops.
      await prisma.account.upsert({
        where: { id: entityId },
        create: {
          ...sanitizedData,
          id: entityId,
          userId,
          deviceId,
          syncStatus: 'synced',
          createdAt: localTimestamp,
          updatedAt: localTimestamp,
        } as any,
        update: {},
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
          } as any,
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
    const allowed = [
      'accountId', 'type', 'amount', 'category', 'subcategory', 
      'description', 'merchant', 'date', 'tags', 'transferToAccountId', 
      'transferType', 'version', 'syncStatus'
    ];
    const sanitizedData = this.pickAllowedFields(data, allowed);

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
        } as any,
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
          } as any,
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
    const allowed = ['name', 'targetAmount', 'currentAmount', 'targetDate', 'category', 'isGroupGoal', 'syncStatus'];
    const sanitizedData = this.pickAllowedFields(data, allowed);

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
      // Idempotent create — see processAccountOperation for rationale.
      await prisma.goal.upsert({
        where: { id: entityId },
        create: {
          ...sanitizedData,
          id: entityId,
          userId,
          deviceId,
          syncStatus: 'synced',
          createdAt: localTimestamp,
          updatedAt: localTimestamp,
        } as any,
        update: {},
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
          } as any,
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
    const allowed = [
      'name', 'type', 'principalAmount', 'outstandingBalance', 'interestRate',
      'emiAmount', 'dueDate', 'frequency', 'contactPerson', 'status', 'syncStatus',
      // Extended fields (schema alignment)
      'totalPayable', 'loanDate', 'contactEmail', 'contactPhone', 'bankName',
      'tenureMonths', 'downPayment', 'loanCategory', 'notes',
    ];
    const sanitizedData = this.pickAllowedFields(data, allowed);

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
      // Idempotent create — see processAccountOperation for rationale.
      await prisma.loan.upsert({
        where: { id: entityId },
        create: {
          ...sanitizedData,
          id: entityId,
          userId,
          deviceId,
          syncStatus: 'synced',
          createdAt: localTimestamp,
          updatedAt: localTimestamp,
        } as any,
        update: {},
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
          } as any,
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
