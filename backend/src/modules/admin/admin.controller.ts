import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { getCacheMetricsSnapshot, getRedisStatus, resetCacheMetrics } from '../../cache/redis';
import { getSystemMetrics } from '../../utils/system';
import { invalidateFeatureCache, invalidateAIFeatureCache } from '../../middleware/featureGate';
import { getPlatformSettings, updatePlatformSettings } from '../../utils/platformSettings';
import { auditLog } from '../../middleware/rbac';
import { getSupabaseAdminClient } from '../../db/supabase';
import { getSocketManager } from '../../sockets';
import { 
  getVisibleFeaturesForRole, 
  getAccessibleSubFeatures,
  UserRole,
} from '../../utils/roleBasedFeatures';
import {
  transformFeaturesToRoleCentric,
  reconstructFeatures,
  transformAIFeaturesToRoleCentric,
  reconstructAIFeatures,
} from '../../utils/featureHelpers';

// Get all users (admin only)

/**
 * BUG-04 FIX: Strip internal roleAccess matrix from feature flag responses for non-admin users.
 * Non-admins only see { enabled: boolean, children?: {...} } — never the full RBAC matrix.
 */
function stripRoleAccessMatrix(features: Record<string, any>): Record<string, any> {
  const stripped: Record<string, any> = {};
  for (const [key, value] of Object.entries(features)) {
    if (value && typeof value === 'object') {
      const { roleAccess, ...rest } = value;
      if (rest.children && typeof rest.children === 'object') {
        rest.children = stripRoleAccessMatrix(rest.children);
      }
      stripped[key] = rest;
    } else {
      stripped[key] = value;
    }
  }
  return stripped;
}

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { role, approved } = req.query;

    let query: any = {};

    if (role) {
      query.role = role;
    }

    if (approved === 'true') {
      query.isApproved = true;
    } else if (approved === 'false') {
      query.isApproved = false;
    }

    const users = await prisma.user.findMany({
      where: query,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with phone from profiles table
    const userIds = users.map(u => u.id);
    let phoneMap: Map<string, string | null> = new Map();
    try {
      const profiles = await prisma.profiles.findMany({
        where: { id: { in: userIds } },
        select: { id: true, phone: true },
      });
      profiles.forEach(p => phoneMap.set(p.id, p.phone ?? null));
    } catch (profileErr) {
      logger.warn('[AdminController] Could not fetch profiles for phone enrichment', { error: profileErr });
    }

    const enriched = users.map(u => ({ ...u, phone: phoneMap.get(u.id) ?? null }));
    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Get pending advisor requests (admin only)
export const getPendingAdvisors = async (req: AuthRequest, res: Response) => {
  try {
    const advisors = await prisma.user.findMany({
      where: {
        role: 'advisor',
        isApproved: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(advisors);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch pending advisors' });
  }
};

// Approve advisor (admin only)
export const approveAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const { advisorId } = req.params;

    const advisor = await prisma.user.findUnique({
      where: { id: advisorId },
    });

    if (!advisor || advisor.role !== 'advisor') {
      return res.status(404).json({ error: 'Advisor not found' });
    }

    const updated = await prisma.user.update({
      where: { id: advisorId },
      data: { isApproved: true },
    });

    // Notify advisor
    await prisma.notification.create({
      data: {
        userId: advisorId,
        title: 'Advisor Approved',
        message: 'Your advisor account has been approved. You can now accept bookings.',
        category: 'system',
        deepLink: '/advisor-panel',
      },
    });

    res.json({
      message: 'Advisor approved',
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        isApproved: updated.isApproved,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to approve advisor' });
  }
};

// Reject advisor (admin only)
export const rejectAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const { advisorId } = req.params;
    const { reason } = req.body;

    const advisor = await prisma.user.findUnique({
      where: { id: advisorId },
    });

    if (!advisor || advisor.role !== 'advisor') {
      return res.status(404).json({ error: 'Advisor not found' });
    }

    // Update user back to regular user
    const updated = await prisma.user.update({
      where: { id: advisorId },
      data: {
        role: 'user',
        isApproved: false,
      },
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: advisorId,
        title: 'Advisor Request Rejected',
        message: `Your advisor request has been rejected${reason ? ': ' + reason : ''}`,
        category: 'system',
      },
    });

    res.json({
      message: 'Advisor rejected',
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to reject advisor' });
  }
};

// Get platform statistics (admin only)
export const getPlatformStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers,
      advisorCount,
      approvedAdvisors,
      totalBookings,
      completedSessions,
      totalPayments,
      totalRevenue,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'advisor' } }),
      prisma.user.count({ where: { role: 'advisor', isApproved: true } }),
      prisma.bookingRequest.count(),
      prisma.advisorSession.count({ where: { status: 'completed' } }),
      prisma.payment.count({ where: { status: 'completed' } }),
      prisma.payment.aggregate({
        where: { status: 'completed' },
        _sum: { amount: true },
      }),
    ]);

    const system = await getSystemMetrics();

    res.json({
      users: {
        total: totalUsers,
        advisors: approvedAdvisors,
        advisorRequests: advisorCount - approvedAdvisors,
        activeToday: await prisma.user.count({
          where: { lastSynced: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
        })
      },
      bookings: {
        total: totalBookings,
        completedSessions,
        pendingBookings: await prisma.bookingRequest.count({ where: { status: 'pending' } }),
      },
      payments: {
        total: totalPayments,
        totalRevenue: totalRevenue._sum.amount || 0,
        currency: 'USD',
      },
      system
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

export const getFeatureFlags = async (req: AuthRequest, res: Response) => {
  try {
    // Validate user has role
    if (!req.user?.role) {
      return res.status(401).json({ error: 'User role not found' });
    }

    const userRole = req.user.role as UserRole;

    // BUG-04 FIX: Set proper cache control to prevent CDN caching of user-specific data
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('Vary', 'Authorization');

    const platformSettings = await getPlatformSettings();
    const globalFeatures: Record<string, any> = platformSettings.admin_global_feature_settings || {};

    // Non-admin users get only their role's enabled/disabled features — no roleAccess matrix
    const reconstructed = reconstructFeatures(globalFeatures, userRole === 'admin' ? undefined : userRole);

    // BUG-04 FIX: Strip roleAccess from responses for non-admin users
    if (userRole !== 'admin') {
      const filtered = stripRoleAccessMatrix(reconstructed);
      return res.json(filtered);
    }

    res.json(reconstructed);
  } catch (error: any) {
    logger.error('Failed to fetch feature flags', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch feature flags' });
  }
};

// Toggle feature flag (admin only)
export const toggleFeatureFlag = async (req: AuthRequest, res: Response) => {
  try {
    const { features } = req.body; // Expecting the complete features settings object/array

    if (!features) {
      return res.status(400).json({ error: 'Missing required field: features' });
    }

    // Save under the key 'admin_global_feature_settings'
    const roleCentricFeatures = transformFeaturesToRoleCentric(features);
    await updatePlatformSettings({ admin_global_feature_settings: roleCentricFeatures });

    invalidateFeatureCache();

    await auditLog(req.userId, 'FEATURE_FLAGS_UPDATE', 'platform_settings:global_features', 'success', {
      keys: Object.keys(roleCentricFeatures),
    });

    // Broadcast real-time update to all connected clients
    try {
      getSocketManager().broadcastToAll('feature_flags_updated', {
        type: 'global',
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Socket not initialized (e.g. during tests) — non-blocking
    }

    const reconstructed = reconstructFeatures(roleCentricFeatures);
    res.json({
      message: 'Global feature flags saved successfully',
      features: reconstructed,
    });
  } catch (error: any) {
    logger.error('Failed to toggle feature flag', { error });
    res.status(500).json({ error: 'Failed to toggle feature flag' });
  }
};

// AI Feature flags management
export const getAIFeatureFlags = async (req: AuthRequest, res: Response) => {
  try {
    // Validate user has role
    if (!req.user?.role) {
      return res.status(401).json({ error: 'User role not found' });
    }

    const userRole = req.user.role as UserRole;

    const platformSettings = await getPlatformSettings();
    const globalAIFeatures: Record<string, any> = platformSettings.admin_ai_feature_settings || {};

    const reconstructed = reconstructAIFeatures(globalAIFeatures, userRole === 'admin' ? undefined : userRole);
    res.json(reconstructed);
  } catch (error: any) {
    logger.error('Failed to fetch AI feature flags', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch AI feature flags' });
  }
};

// Save AI feature flags (admin only)
export const toggleAIFeatureFlags = async (req: AuthRequest, res: Response) => {
  try {
    const { features } = req.body;

    if (!features) {
      return res.status(400).json({ error: 'Missing required field: features' });
    }

    const roleCentricAIFeatures = transformAIFeaturesToRoleCentric(features);
    await updatePlatformSettings({ admin_ai_feature_settings: roleCentricAIFeatures });

    invalidateAIFeatureCache();

    await auditLog(req.userId, 'FEATURE_FLAGS_UPDATE', 'platform_settings:ai_features', 'success', {
      keys: Object.keys(roleCentricAIFeatures),
    });

    // Broadcast real-time update to all connected clients
    try {
      getSocketManager().broadcastToAll('feature_flags_updated', {
        type: 'ai',
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Socket not initialized (e.g. during tests) — non-blocking
    }

    const reconstructed = reconstructAIFeatures(roleCentricAIFeatures);
    res.json({
      message: 'Global AI feature flags saved successfully',
      features: reconstructed,
    });
  } catch (error: any) {
    logger.error('Failed to toggle AI feature flags', { error });
    res.status(500).json({ error: 'Failed to toggle AI feature flags' });
  }
};


// Get users report (admin only)
export const getUsersReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      total: users.length,
      users,
      generatedAt: new Date(),
    });
  } catch (error: any) {
    logger.error('Failed to generate users report', { error });
    res.status(500).json({ error: 'Failed to generate users report' });
  }
};

// Get revenue report (admin only)
export const getRevenueReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let where: any = { status: 'completed' };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        advisor: {
          select: { name: true },
        },
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const byAdvisor = payments.reduce(
      (acc, p) => {
        const advisorName = p.advisor.name;
        if (!acc[advisorName]) {
          acc[advisorName] = { count: 0, total: 0 };
        }
        acc[advisorName].count += 1;
        acc[advisorName].total += Number(p.amount);
        return acc;
      },
      {} as Record<string, { count: number; total: number }>
    );

    res.json({
      totalRevenue,
      paymentCount: payments.length,
      currency: 'USD',
      byAdvisor,
      generatedAt: new Date(),
    });
  } catch (error: any) {
    logger.error('Failed to generate revenue report', { error });
    res.status(500).json({ error: 'Failed to generate revenue report' });
  }
};

// Get cache metrics (admin only)
export const getCacheMetrics = async (req: AuthRequest, res: Response) => {
  try {
    const reset = req.query.reset === 'true';

    const metrics = getCacheMetricsSnapshot();

    if (reset) {
      resetCacheMetrics();
    }

    res.json({
      success: true,
      data: {
        redisStatus: getRedisStatus(),
        cachePrefixes: metrics,
        reset,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch cache metrics', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch cache metrics' });
  }
};
// Get user activity log (admin only)
export const getUserActivity = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, limit = 50 } = req.query;

    const [events, syncs, imports] = await Promise.all([
      prisma.aiScan.findMany({
        where: userId ? { userId: userId as string } : {},
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } }
      }),
      prisma.syncQueue.findMany({
        where: userId ? { userId: userId as string } : {},
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.importLog.findMany({
        where: userId ? { userId: userId as string } : {},
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } }
      })
    ]);

    res.json({
      aiScans: events,
      syncs,
      imports
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
};

// Delete user (admin only) — cascade-deletes all user data and Supabase Auth record
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const adminId = req.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (userId === adminId) {
      return res.status(400).json({ error: 'Administrators cannot delete their own account via the admin panel' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cascade-delete from Prisma (all related data via onDelete: Cascade)
    await prisma.user.delete({ where: { id: userId } });
    logger.info(`[AdminController] Prisma user deleted by admin ${adminId}: ${userId}`);

    // Best-effort Supabase Auth deletion
    try {
      const adminClient = getSupabaseAdminClient();
      if (adminClient) {
        const { error } = await adminClient.auth.admin.deleteUser(userId);
        if (error) {
          logger.warn('[AdminController] Supabase auth deletion returned an error (non-fatal):', { userId, message: error.message });
        } else {
          logger.info(`[AdminController] Supabase auth user deleted: ${userId}`);
        }
      }
    } catch (supabaseErr: any) {
      logger.warn('[AdminController] Non-blocking Supabase auth deletion failed:', { userId, message: supabaseErr.message });
    }

    res.json({ message: `User ${user.email} deleted successfully`, userId });
  } catch (error: any) {
    logger.error('[AdminController] Failed to delete user', { error });
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Get user storage statistics (admin only)
export const getUserStorageStats = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const [transactions, accounts, goals, investments, loans, todos, notifications, devices, aiScans, friends] = await Promise.all([
      prisma.transaction.count({ where: { userId } }),
      prisma.account.count({ where: { userId } }),
      prisma.goal.count({ where: { userId } }),
      prisma.investment.count({ where: { userId } }),
      prisma.loan.count({ where: { userId } }),
      prisma.todo.count({ where: { userId } }),
      prisma.notification.count({ where: { userId } }),
      prisma.device.count({ where: { userId } }),
      prisma.aiScan.count({ where: { userId } }),
      prisma.friend.count({ where: { userId } }),
    ]);

    const totalRecords = transactions + accounts + goals + investments + loans + todos + notifications + devices + aiScans + friends;
    // Rough approximation: ~512 bytes average per record
    const estimatedBytes = totalRecords * 512;

    res.json({
      userId,
      stats: {
        transactions,
        accounts,
        goals,
        investments,
        loans,
        todos,
        notifications,
        devices,
        aiScans,
        friends,
      },
      totalRecords,
      estimatedBytes,
    });
  } catch (error: any) {
    logger.error('[AdminController] Failed to get user storage stats', { error });
    res.status(500).json({ error: 'Failed to get user storage statistics' });
  }
};

// Block/Unblock user (admin only)
export const toggleUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { status } = req.body; // 'verified' or 'blocked'

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, email: true, status: true }
    });

    res.json({ message: `User ${status} successfully`, user });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
};

// Update user role (admin only)
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body; // 'admin', 'manager', 'advisor', 'user'

    if (!['admin', 'manager', 'advisor', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    const before = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role,
        isApproved: role === 'advisor' ? true : undefined
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true
      }
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: userId,
        title: 'Role Updated',
        message: `Your account role has been updated to ${role} by the administrator.`,
        category: 'system',
      },
    });

    await auditLog(req.userId, 'ROLE_CHANGE', `user:${userId}`, 'success', {
      targetEmail: updated.email,
      fromRole: before?.role ?? null,
      toRole: role,
    });

    res.json({ message: `User role updated to ${role} successfully`, user: updated });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
};
