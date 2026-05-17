import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { getCacheMetricsSnapshot, getRedisStatus, resetCacheMetrics } from '../../cache/redis';
import { getSystemMetrics } from '../../utils/system';

// Get all users (admin only)
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
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(users);
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

// Feature flags management
export const getFeatureFlags = async (req: AuthRequest, res: Response) => {
  try {
    // Find the first admin user in the system to load global feature flags
    const adminUser = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (!adminUser) {
      // Fallback if no admin is seeded yet
      return res.json({});
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId: adminUser.id },
    });

    if (!settings || !settings.settings) {
      return res.json({});
    }

    const parsedSettings = JSON.parse(settings.settings);
    const featureFlags = parsedSettings.admin_global_feature_settings || {};
    res.json(featureFlags);
  } catch (error: any) {
    logger.error('Failed to fetch feature flags', { error });
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

    const adminUser = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (!adminUser) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    let settings = await prisma.userSettings.findUnique({
      where: { userId: adminUser.id },
    });

    let currentSettings: Record<string, any> = {};
    if (settings && settings.settings) {
      try {
        currentSettings = JSON.parse(settings.settings);
      } catch {
        currentSettings = {};
      }
    }

    // Save under the key 'admin_global_feature_settings'
    currentSettings.admin_global_feature_settings = features;

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId: adminUser.id,
          settings: JSON.stringify(currentSettings),
        },
      });
    } else {
      settings = await prisma.userSettings.update({
        where: { userId: adminUser.id },
        data: {
          settings: JSON.stringify(currentSettings),
          updatedAt: new Date(),
        },
      });
    }

    res.json({
      message: 'Global feature flags saved successfully',
      features,
    });
  } catch (error: any) {
    logger.error('Failed to toggle feature flag', { error });
    res.status(500).json({ error: 'Failed to toggle feature flag' });
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

    res.json({ message: `User role updated to ${role} successfully`, user: updated });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
};
