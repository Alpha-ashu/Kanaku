import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { invalidateUserSnapshotCache } from '../../middleware/auth';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { approvalService } from './approval.service';
import bcrypt from 'bcrypt';
import { DEFAULT_CATEGORIES, DEFAULT_NOTIFICATION_PREFERENCES } from '../auth/registration.defaults';
import { audit } from '../../utils/auditLogger';

export interface ListDemoAccountsFilter {
  role?: string;
  status?: string; // ENABLED | DISABLED | ALL
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateDemoAccountInput {
  name: string;
  email: string;
  password?: string;
  role?: 'user' | 'advisor' | 'manager' | 'admin';
}

export class DemoService {
  /**
   * List all demo accounts with pagination, search, and dynamic stats.
   */
  async listDemoAccounts(filter?: ListDemoAccountsFilter) {
    const page = Math.max(1, Number(filter?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      accountType: 'DEMO',
    };

    if (filter?.role && filter.role !== 'all') {
      where.role = filter.role.toLowerCase();
    }

    if (filter?.status && filter.status !== 'all') {
      where.demoStatus = filter.status.toUpperCase();
    }

    if (filter?.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          accountType: true,
          demoStatus: true,
          emailVerified: true,
          isApproved: true,
          lastSynced: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              transactions: true,
              accounts: true,
              goals: true,
              loans: true,
              investments: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Enable or disable a demo account.
   * If requested by Manager, submits an ApprovalRequest.
   * If executed by Admin, applies the change immediately, invalidates cache & revokes tokens.
   */
  async toggleDemoAccountStatus(
    actorId: string,
    actorRole: string,
    targetUserId: string,
    nextStatus: 'ENABLED' | 'DISABLED',
    reason?: string,
  ) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw AppError.notFound('Demo account');
    }

    if (targetUser.accountType !== 'DEMO') {
      throw AppError.badRequest('Target user is not a demo account.', 'NOT_A_DEMO_ACCOUNT');
    }

    // Role-based separation: Managers submit approval requests
    if (actorRole === 'manager') {
      const actionType = nextStatus === 'ENABLED' ? 'ENABLE_DEMO_ACCOUNT' : 'DISABLE_DEMO_ACCOUNT';
      const request = await approvalService.createApprovalRequest({
        requesterId: actorId,
        actionType,
        targetUserId,
        payload: { nextStatus },
        reason,
      });

      return {
        approvalRequired: true,
        message: 'Approval request submitted to administrator.',
        requestId: request.id,
      };
    }

    // Admin direct execution
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: targetUserId },
        data: { demoStatus: nextStatus },
        select: { id: true, email: true, name: true, role: true, accountType: true, demoStatus: true },
      });

      if (nextStatus === 'DISABLED') {
        // Revoke active sessions and refresh tokens immediately
        await tx.refreshToken.deleteMany({
          where: { userId: targetUserId },
        });
      }

      return u;
    });

    // Invalidate caches
    invalidateUserSnapshotCache(targetUserId);
    await cacheDeleteByPrefix(`dashboard:${targetUserId}:`);
    await cacheDeleteByPrefix(`todos:${targetUserId}:`);

    // Structured audit logging
    audit({
      event: 'admin.demo_account_toggle',
      userId: actorId,
      resource: 'User',
      resourceId: targetUserId,
      meta: {
        previousStatus: targetUser.demoStatus,
        newStatus: nextStatus,
        reason,
      },
    });

    logger.info(`[DemoService] Demo account ${targetUserId} status set to ${nextStatus} by ${actorId}`);
    return {
      approvalRequired: false,
      message: `Demo account status set to ${nextStatus}.`,
      user: updated,
    };
  }

  /**
   * Dynamically create a demo account with configurable identity and initial fixtures.
   */
  async createDemoAccount(
    actorId: string,
    actorRole: string,
    params: {
      name: string;
      email: string;
      password?: string;
      role?: 'user' | 'advisor' | 'manager' | 'admin';
    }
  ) {
    if (actorRole !== 'admin') {
      throw AppError.forbidden('Only administrators can create demo accounts.');
    }

    const { name, email, password, role = 'user' } = params;
    const cleanEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      throw AppError.badRequest('An account with this email address already exists.', 'EMAIL_EXISTS');
    }

    const initialPassword = password || process.env.SEED_TEST_PASSWORD || 'DemoPass@123';
    const hashedPassword = await bcrypt.hash(initialPassword, 12);

    const isApproved = role === 'advisor' || role === 'user' || role === 'manager' || role === 'admin';

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: cleanEmail,
          password: hashedPassword,
          role,
          accountType: 'DEMO',
          demoStatus: 'ENABLED',
          status: 'verified',
          emailVerified: true,
          isApproved,
        },
      });

      // Default profile
      const nameParts = name.trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || 'Demo';
      const lastName = nameParts.slice(1).join(' ') || 'User';

      await tx.$executeRaw`
        INSERT INTO public.profiles (
          id, email, first_name, last_name, full_name,
          job_type, monthly_income, annual_income, created_at, updated_at
        ) VALUES (
          ${user.id}::uuid, ${user.email}, ${firstName}, ${lastName}, ${user.name},
          ${role === 'advisor' ? 'Financial Advisor' : 'Demo Professional'},
          150000, 1800000, NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      // Default user settings
      await tx.userSettings.create({
        data: {
          userId: user.id,
          currency: 'INR',
          language: 'en-IN',
          timezone: 'Asia/Kolkata',
          settings: { notifications: { email: true, push: true, inApp: true } },
        },
      });

      // Primary default bank account
      await tx.account.create({
        data: {
          userId: user.id,
          name: 'Demo Savings Account',
          type: 'savings',
          balance: 100000,
          currency: 'INR',
          institution: 'Demo Bank',
        },
      });

      // If advisor, setup advisor profile and application
      if (role === 'advisor') {
        await tx.advisorApplication.create({
          data: {
            userId: user.id,
            fullName: user.name,
            email: user.email,
            phone: '+919876543210',
            status: 'APPROVED',
            experienceYears: 7,
            expertise: 'Retirement Planning, Tax Optimization, Mutual Funds',
            bio: 'Certified financial planner with 7+ years advising retail and HNI clients on wealth creation and tax planning.',
            hourlyRate: 1500,
            reviewedBy: actorId,
            reviewedAt: new Date(),
          },
        });
      }

      return user;
    });

    audit({
      event: 'admin.demo_account_create',
      userId: actorId,
      resource: 'User',
      resourceId: created.id,
      meta: { email: cleanEmail, role },
    });

    logger.info(`[DemoService] Created demo account: ${created.id} (${cleanEmail})`);
    return created;
  }

  /**
   * Reset demo account mock data to clean baseline state.
   */
  async resetDemoAccount(actorId: string, actorRole: string, targetUserId: string) {
    if (actorRole !== 'admin') {
      throw AppError.forbidden('Only administrators can reset demo account data.');
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, accountType: true, name: true },
    });

    if (!user || user.accountType !== 'DEMO') {
      throw AppError.badRequest('Target user is not a demo account.', 'NOT_A_DEMO_ACCOUNT');
    }

    // Reset transactions, sync queues, and restore account balances to baseline
    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { userId: targetUserId } });
      await tx.goal.deleteMany({ where: { userId: targetUserId } });
      await tx.loan.deleteMany({ where: { userId: targetUserId } });
      await tx.investment.deleteMany({ where: { userId: targetUserId } });
      await tx.syncQueue.deleteMany({ where: { userId: targetUserId } });

      // Reset balance on primary account
      await tx.account.updateMany({
        where: { userId: targetUserId },
        data: { balance: 100000, openingBalance: 100000 },
      });
    });

    // Invalidate caches
    invalidateUserSnapshotCache(targetUserId);
    await cacheDeleteByPrefix(`dashboard:${targetUserId}:`);
    await cacheDeleteByPrefix(`todos:${targetUserId}:`);

    audit({
      event: 'admin.demo_account_reset',
      userId: actorId,
      resource: 'User',
      resourceId: targetUserId,
      meta: { timestamp: new Date().toISOString() },
    });

    logger.info(`[DemoService] Reset demo account data for ${targetUserId}`);
    return { success: true, message: 'Demo account data reset successfully.' };
  }
}

export const demoService = new DemoService();
