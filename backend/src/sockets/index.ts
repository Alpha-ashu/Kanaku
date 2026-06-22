import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { prisma } from '../db/prisma';
import { isAllowedOrigin } from '../config/cors';
import { getPurposeClient } from '../config/redis-connections';

const SOCKET_AUTH_CACHE_TTL = 60; // seconds — cache verified identity to avoid DB on every connect

interface AuthenticatedSocket extends Socket {
  userId: string;
  userRole: string;
  deviceId: string;
}

interface SocketUserIdentity {
  id: string;
  role: string;
}

const BOOKING_STATUS_UPDATES = new Set(['accepted', 'rejected']);
const PAYMENT_STATUS_UPDATES = new Set(['completed', 'failed', 'refunded']);
const PAYMENT_TRANSITIONS: Record<string, string[]> = {
  pending: ['completed', 'failed'],
  processing: ['completed', 'failed'],
  completed: ['refunded'],
  failed: [],
  refunded: [],
};

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;
const ALLOW_TEST_ROLE_FALLBACK = process.env.NODE_ENV === 'test';

export class SocketManager {
  private io: Server;
  private connectedUsers = new Map<string, Set<string>>();
  private userDevices = new Map<string, Set<string>>();

  constructor(httpServer: any) {
    this.io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || isAllowedOrigin(origin)) {
            callback(null, true);
          } else {
            callback(null, false);
          }
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    this.io.use(async (socket, next) => {
      const authSocket = socket as AuthenticatedSocket;
      try {
        const token = authSocket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const user = await this.verifyToken(token);
        if (!user) {
          return next(new Error('Authentication error: Invalid token'));
        }

        authSocket.userId = user.id;
        authSocket.userRole = user.role;
        authSocket.deviceId = authSocket.handshake.auth.deviceId || 'unknown';

        this.trackUserConnection(user.id, authSocket.id, authSocket.deviceId);
        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication error'));
      }
    });
  }

  private async verifyToken(token: string): Promise<SocketUserIdentity | null> {
    const customSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';

    if (customSecret) {
      try {
        const decoded = jwt.verify(token, customSecret) as jwt.JwtPayload;
        const userId = typeof decoded === 'object' ? decoded.userId || decoded.sub : null;

        if (typeof userId === 'string' && userId.length > 0) {
          const identity = await this.resolveUserIdentity(userId, decoded);
          if (identity) return identity;
        }
      } catch {
        // Fall through to Supabase validation.
      }
    }

    if (!supabase) return null;

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return null;
      return await this.resolveUserIdentity(user.id, null);
    } catch (error) {
      console.error('Token verification error:', error);
      return null;
    }
  }

  /** Resolves user identity from Redis cache; falls back to DB and caches the result. */
  private async resolveUserIdentity(
    userId: string,
    decodedToken: jwt.JwtPayload | null
  ): Promise<SocketUserIdentity | null> {
    const cacheKey = `socket:user:${userId}`;
    const cache = getPurposeClient('cache');

    // Check cache first
    try {
      const cached = cache ? await cache.get(cacheKey) : null;
      if (cached) {
        return JSON.parse(cached) as SocketUserIdentity;
      }
    } catch {
      // Redis unavailable — fall through to DB
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (dbUser?.status === 'suspended') return null;

    const identity: SocketUserIdentity = {
      id: userId,
      role: dbUser?.role ?? (ALLOW_TEST_ROLE_FALLBACK && typeof decodedToken?.role === 'string'
        ? decodedToken.role
        : 'user'),
    };

    // Cache for SOCKET_AUTH_CACHE_TTL seconds
    try {
      if (cache) await cache.set(cacheKey, JSON.stringify(identity), 'EX', SOCKET_AUTH_CACHE_TTL);
    } catch {
      // Redis unavailable — non-fatal
    }

    return identity;
  }

  private trackUserConnection(userId: string, socketId: string, deviceId: string) {
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socketId);

    if (!this.userDevices.has(userId)) {
      this.userDevices.set(userId, new Set());
    }
    this.userDevices.get(userId)!.add(deviceId);
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const authSocket = socket as AuthenticatedSocket;
      const userId = authSocket.userId;
      const userRole = authSocket.userRole;
      const deviceId = authSocket.deviceId;

      authSocket.join(`user:${userId}`);
      authSocket.join(`device:${deviceId}`);

      authSocket.on('sync_request', async (data) => {
        try {
          const { lastSyncedAt, entityTypes } = data;
          const syncData = await this.getSyncData(userId, lastSyncedAt, entityTypes);

          authSocket.emit('sync_response', {
            success: true,
            data: syncData,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Sync request error:', error);
          authSocket.emit('sync_response', {
            success: false,
            error: 'Sync failed',
            timestamp: new Date().toISOString(),
          });
        }
      });

      authSocket.on('transaction_update', async (data) => {
        try {
          const { transaction } = data;
          const savedTransaction = await this.saveTransaction(userId, transaction);

          this.broadcastToUserDevices(userId, 'transaction_updated', {
            transaction: savedTransaction,
            timestamp: new Date().toISOString(),
          });

          authSocket.emit('transaction_saved', {
            success: true,
            transaction: savedTransaction,
          });
        } catch (error) {
          console.error('Transaction update error:', error);
          authSocket.emit('transaction_saved', {
            success: false,
            error: 'Failed to save transaction',
          });
        }
      });

      authSocket.on('account_update', async (data) => {
        try {
          const { account } = data;
          const savedAccount = await this.saveAccount(userId, account);

          this.broadcastToUserDevices(userId, 'account_updated', {
            account: savedAccount,
            timestamp: new Date().toISOString(),
          });

          authSocket.emit('account_saved', {
            success: true,
            account: savedAccount,
          });
        } catch (error) {
          console.error('Account update error:', error);
          authSocket.emit('account_saved', {
            success: false,
            error: 'Failed to save account',
          });
        }
      });

      authSocket.on('goal_update', async (data) => {
        try {
          const { goal } = data;
          const savedGoal = await this.saveGoal(userId, goal);

          this.broadcastToUserDevices(userId, 'goal_updated', {
            goal: savedGoal,
            timestamp: new Date().toISOString(),
          });

          authSocket.emit('goal_saved', {
            success: true,
            goal: savedGoal,
          });
        } catch (error) {
          console.error('Goal update error:', error);
          authSocket.emit('goal_saved', {
            success: false,
            error: 'Failed to save goal',
          });
        }
      });

      authSocket.on('booking_request', async (data) => {
        try {
          const { bookingId, message } = data ?? {};
          if (!bookingId || typeof bookingId !== 'string') {
            authSocket.emit('booking_notification', {
              success: false,
              error: 'Booking ID is required',
            });
            return;
          }

          const booking = await prisma.bookingRequest.findUnique({
            where: { id: bookingId },
            include: {
              client: { select: { name: true, email: true } },
            },
          });

          if (!booking) {
            authSocket.emit('booking_notification', {
              success: false,
              error: 'Booking not found',
            });
            return;
          }

          if (booking.clientId !== userId && userRole !== 'admin') {
            authSocket.emit('booking_notification', {
              success: false,
              error: 'Access denied',
            });
            return;
          }

          this.io.to(`user:${booking.advisorId}`).emit('booking_notification', {
            type: 'new_booking',
            booking: {
              id: booking.id,
              clientName: booking.client.name,
              clientEmail: booking.client.email,
              sessionType: booking.sessionType,
              proposedDate: booking.proposedDate,
              amount: booking.amount,
              message: typeof message === 'string' ? message : undefined,
            },
            timestamp: new Date().toISOString(),
          });

          authSocket.emit('booking_notification', {
            success: true,
            message: 'Booking request sent',
          });
        } catch (error) {
          console.error('Booking request error:', error);
          authSocket.emit('booking_notification', {
            success: false,
            error: 'Failed to send booking request',
          });
        }
      });

      authSocket.on('booking_status_update', async (data) => {
        try {
          const { bookingId, status, rejectionReason } = data ?? {};
          if (!bookingId || typeof bookingId !== 'string') {
            authSocket.emit('booking_status_updated', {
              success: false,
              error: 'Booking ID is required',
            });
            return;
          }

          if (typeof status !== 'string' || !BOOKING_STATUS_UPDATES.has(status)) {
            authSocket.emit('booking_status_updated', {
              success: false,
              error: 'Invalid booking status',
            });
            return;
          }

          const booking = await prisma.bookingRequest.findUnique({
            where: { id: bookingId },
            include: {
              advisor: { select: { name: true } },
            },
          });

          if (!booking) {
            authSocket.emit('booking_status_updated', {
              success: false,
              error: 'Booking not found',
            });
            return;
          }

          if (booking.advisorId !== userId && userRole !== 'admin') {
            authSocket.emit('booking_status_updated', {
              success: false,
              error: 'Access denied',
            });
            return;
          }

          const updatedBooking = await prisma.bookingRequest.update({
            where: { id: bookingId },
            data: {
              status,
              rejectionReason: status === 'rejected' && typeof rejectionReason === 'string'
                ? rejectionReason.trim() || null
                : null,
            },
            include: {
              client: { select: { name: true } },
              advisor: { select: { name: true } },
            },
          });

          let sessionId: string | undefined;
          if (status === 'accepted') {
            const sessionEnd = new Date(updatedBooking.proposedDate);
            sessionEnd.setMinutes(sessionEnd.getMinutes() + updatedBooking.duration);

            const session = await prisma.advisorSession.upsert({
              where: { bookingId: updatedBooking.id },
              update: {
                advisorId: updatedBooking.advisorId,
                clientId: updatedBooking.clientId,
                startTime: updatedBooking.proposedDate,
                endTime: sessionEnd,
                sessionType: updatedBooking.sessionType,
                status: 'scheduled',
              },
              create: {
                bookingId: updatedBooking.id,
                advisorId: updatedBooking.advisorId,
                clientId: updatedBooking.clientId,
                startTime: updatedBooking.proposedDate,
                endTime: sessionEnd,
                sessionType: updatedBooking.sessionType,
                status: 'scheduled',
              },
            });
            sessionId = session.id;
          }

          await prisma.notification.create({
            data: {
              userId: updatedBooking.clientId,
              title: status === 'accepted' ? 'Booking Accepted' : 'Booking Rejected',
              message: status === 'accepted'
                ? 'Your advisor has accepted your booking request'
                : `Your advisor rejected your booking request${updatedBooking.rejectionReason ? `: ${updatedBooking.rejectionReason}` : ''}`,
              category: 'booking',
              deepLink: sessionId ? `/sessions/${sessionId}` : '/bookings',
            },
          });

          this.io.to(`user:${updatedBooking.clientId}`).emit('booking_status_changed', {
            booking: {
              id: updatedBooking.id,
              status: updatedBooking.status,
              rejectionReason: updatedBooking.rejectionReason,
              advisorName: updatedBooking.advisor.name,
              sessionId,
            },
            timestamp: new Date().toISOString(),
          });

          authSocket.emit('booking_status_updated', {
            success: true,
            booking: {
              ...updatedBooking,
              sessionId,
            },
          });
        } catch (error) {
          console.error('Booking status update error:', error);
          authSocket.emit('booking_status_updated', {
            success: false,
            error: 'Failed to update booking status',
          });
        }
      });

      authSocket.on('payment_status_update', async (data) => {
        try {
          const { paymentId, status } = data ?? {};
          if (!paymentId || typeof paymentId !== 'string') {
            authSocket.emit('payment_status_updated', {
              success: false,
              error: 'Payment ID is required',
            });
            return;
          }

          if (typeof status !== 'string' || !PAYMENT_STATUS_UPDATES.has(status)) {
            authSocket.emit('payment_status_updated', {
              success: false,
              error: 'Invalid payment status',
            });
            return;
          }

          const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
              client: { select: { name: true } },
              advisor: { select: { name: true } },
            },
          });

          if (!payment) {
            authSocket.emit('payment_status_updated', {
              success: false,
              error: 'Payment not found',
            });
            return;
          }

          const actorCanUpdate = status === 'refunded'
            ? payment.advisorId === userId || userRole === 'admin'
            : payment.clientId === userId || userRole === 'admin';

          if (!actorCanUpdate) {
            authSocket.emit('payment_status_updated', {
              success: false,
              error: 'Access denied',
            });
            return;
          }

          if (payment.status !== status) {
            const allowedTransitions = PAYMENT_TRANSITIONS[payment.status] || [];
            if (!allowedTransitions.includes(status)) {
              authSocket.emit('payment_status_updated', {
                success: false,
                error: 'Invalid payment state transition',
              });
              return;
            }
          }

          const updatedPayment = payment.status === status
            ? payment
            : await prisma.payment.update({
              where: { id: paymentId },
              data: { status },
              include: {
                client: { select: { name: true } },
                advisor: { select: { name: true } },
              },
            });

          if (status === 'completed') {
            await prisma.notification.create({
              data: {
                userId: updatedPayment.advisorId,
                title: 'Payment Received',
                message: `You received a payment of ${updatedPayment.amount} ${updatedPayment.currency}`,
                category: 'payment',
                deepLink: `/payments/${updatedPayment.id}`,
              },
            });
          } else if (status === 'failed') {
            await prisma.notification.create({
              data: {
                userId: updatedPayment.clientId,
                title: 'Payment Failed',
                message: `Your payment of ${updatedPayment.amount} ${updatedPayment.currency} failed. Please try again.`,
                category: 'payment',
                deepLink: `/sessions/${updatedPayment.sessionId}`,
              },
            });
          } else if (status === 'refunded') {
            await prisma.notification.createMany({
              data: [
                {
                  userId: updatedPayment.clientId,
                  title: 'Payment Refunded',
                  message: `Your payment of ${updatedPayment.amount} ${updatedPayment.currency} has been refunded`,
                  category: 'payment',
                },
                {
                  userId: updatedPayment.advisorId,
                  title: 'Payment Refunded',
                  message: `A payment of ${updatedPayment.amount} ${updatedPayment.currency} was refunded`,
                  category: 'payment',
                },
              ],
            });
          }

          this.io.to(`user:${updatedPayment.clientId}`).emit('payment_status_changed', {
            payment: {
              id: updatedPayment.id,
              status: updatedPayment.status,
              amount: updatedPayment.amount,
              advisorName: updatedPayment.advisor.name,
            },
            timestamp: new Date().toISOString(),
          });

          this.io.to(`user:${updatedPayment.advisorId}`).emit('payment_received', {
            payment: {
              id: updatedPayment.id,
              status: updatedPayment.status,
              amount: updatedPayment.amount,
              clientName: updatedPayment.client.name,
            },
            timestamp: new Date().toISOString(),
          });

          authSocket.emit('payment_status_updated', {
            success: true,
            payment: updatedPayment,
          });
        } catch (error) {
          console.error('Payment status update error:', error);
          authSocket.emit('payment_status_updated', {
            success: false,
            error: 'Failed to update payment status',
          });
        }
      });

      authSocket.on('chat_message', async (data) => {
        try {
          const { sessionId, message } = data ?? {};
          const trimmedMessage = typeof message === 'string' ? message.trim() : '';

          if (!sessionId || typeof sessionId !== 'string' || !trimmedMessage) {
            authSocket.emit('message_sent', {
              success: false,
              error: 'Session ID and message are required',
            });
            return;
          }

          const session = await prisma.advisorSession.findUnique({
            where: { id: sessionId },
            include: {
              client: { select: { name: true } },
              advisor: { select: { name: true } },
            },
          });

          if (!session) {
            authSocket.emit('message_sent', {
              success: false,
              error: 'Session not found',
            });
            return;
          }

          if (
            session.clientId !== userId
            && session.advisorId !== userId
            && userRole !== 'admin'
          ) {
            authSocket.emit('message_sent', {
              success: false,
              error: 'Access denied',
            });
            return;
          }

          const chatMessage = await prisma.chatMessage.create({
            data: {
              sessionId,
              senderId: userId,
              message: trimmedMessage,
            },
            include: {
              session: {
                include: {
                  client: { select: { name: true } },
                  advisor: { select: { name: true } },
                },
              },
            },
          });

          this.io.to(`user:${session.clientId}`).emit('new_message', {
            message: chatMessage,
            timestamp: new Date().toISOString(),
          });

          this.io.to(`user:${session.advisorId}`).emit('new_message', {
            message: chatMessage,
            timestamp: new Date().toISOString(),
          });

          authSocket.emit('message_sent', {
            success: true,
            message: chatMessage,
          });
        } catch (error) {
          console.error('Chat message error:', error);
          authSocket.emit('message_sent', {
            success: false,
            error: 'Failed to send message',
          });
        }
      });

      authSocket.on('disconnect', () => {
        this.handleDisconnect(userId, socket.id, deviceId);
      });

      authSocket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });
  }

  private async getSyncData(userId: string, lastSyncedAt?: string, entityTypes?: string[]) {
    const whereClause = lastSyncedAt
      ? {
        userId,
        updatedAt: {
          gt: new Date(lastSyncedAt),
        },
      }
      : { userId };

    const data: any = {};

    if (!entityTypes || entityTypes.includes('accounts')) {
      data.accounts = await prisma.account.findMany({
        where: whereClause,
      });
    }

    if (!entityTypes || entityTypes.includes('transactions')) {
      data.transactions = await prisma.transaction.findMany({
        where: whereClause,
      });
    }

    if (!entityTypes || entityTypes.includes('goals')) {
      data.goals = await prisma.goal.findMany({
        where: whereClause,
      });
    }

    if (!entityTypes || entityTypes.includes('loans')) {
      data.loans = await prisma.loan.findMany({
        where: whereClause,
      });
    }

    if (!entityTypes || entityTypes.includes('settings')) {
      data.settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
    }

    return data;
  }

  private pickAllowedFields(payload: any, allowed: string[]) {
    const result: Record<string, any> = {};
    if (!payload || typeof payload !== 'object') return result;
    for (const key of allowed) {
      if (payload[key] !== undefined) {
        result[key] = payload[key];
      }
    }
    return result;
  }

  private async saveTransaction(userId: string, transaction: any) {
    if (!transaction || typeof transaction !== 'object') {
      throw new Error('Invalid transaction payload');
    }

    const { id } = transaction;

    const allowed = [
      'accountId', 'type', 'amount', 'category', 'subcategory', 
      'description', 'merchant', 'date', 'tags', 'transferToAccountId', 
      'transferType', 'version', 'syncStatus'
    ];
    const filtered = this.pickAllowedFields(transaction, allowed);

    if (!filtered.accountId) throw new Error('accountId is required');
    if (filtered.type && !['income', 'expense', 'transfer'].includes(filtered.type)) {
      throw new Error('Invalid transaction type');
    }
    if (filtered.amount !== undefined) {
      const amount = Number(filtered.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Transaction amount must be a positive number');
      }
      filtered.amount = Number(amount.toFixed(2));
    }
    if (filtered.date) {
      filtered.date = new Date(filtered.date);
      if (isNaN(filtered.date.getTime())) {
        throw new Error('Invalid transaction date');
      }
    }

    if (id) {
      return prisma.transaction.update({
        where: { id, userId },
        data: {
          ...filtered,
          updatedAt: new Date(),
        } as any,
      });
    }

    return prisma.transaction.create({
      data: {
        ...filtered,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    });
  }

  private async saveAccount(userId: string, account: any) {
    if (!account || typeof account !== 'object') {
      throw new Error('Invalid account payload');
    }

    const { id } = account;

    const allowed = [
      'name', 'type', 'provider', 'country', 'balance', 'currency', 
      'color', 'icon', 'syncStatus'
    ];
    const filtered = this.pickAllowedFields(account, allowed);

    if (!filtered.name) throw new Error('Account name is required');
    if (!filtered.type) throw new Error('Account type is required');
    if (filtered.balance !== undefined) {
      const balance = Number(filtered.balance);
      if (!Number.isFinite(balance) || balance < 0) {
        throw new Error('Account balance must be a non-negative number');
      }
      filtered.balance = balance;
    }

    if (id) {
      return prisma.account.update({
        where: { id, userId },
        data: {
          ...filtered,
          updatedAt: new Date(),
        } as any,
      });
    }

    return prisma.account.create({
      data: {
        ...filtered,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    });
  }

  private async saveGoal(userId: string, goal: any) {
    if (!goal || typeof goal !== 'object') {
      throw new Error('Invalid goal payload');
    }

    const { id } = goal;

    const allowed = [
      'name', 'targetAmount', 'currentAmount', 'targetDate', 'category', 
      'isGroupGoal', 'syncStatus'
    ];
    const filtered = this.pickAllowedFields(goal, allowed);

    if (!filtered.name) throw new Error('Goal name is required');
    if (filtered.targetAmount !== undefined) {
      const targetAmount = Number(filtered.targetAmount);
      if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
        throw new Error('Goal target amount must be a positive number');
      }
      filtered.targetAmount = targetAmount;
    }
    if (filtered.currentAmount !== undefined) {
      const currentAmount = Number(filtered.currentAmount);
      if (!Number.isFinite(currentAmount) || currentAmount < 0) {
        throw new Error('Goal current amount must be a non-negative number');
      }
      filtered.currentAmount = currentAmount;
    }
    if (filtered.targetDate) {
      filtered.targetDate = new Date(filtered.targetDate);
      if (isNaN(filtered.targetDate.getTime())) {
        throw new Error('Invalid goal target date');
      }
    }

    if (id) {
      return prisma.goal.update({
        where: { id, userId },
        data: {
          ...filtered,
          updatedAt: new Date(),
        } as any,
      });
    }

    return prisma.goal.create({
      data: {
        ...filtered,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    });
  }

  private broadcastToUserDevices(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  private handleDisconnect(userId: string, socketId: string, deviceId: string) {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
        this.userDevices.delete(userId);
      }
    }
  }

  public notifyUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  public notifyDevice(deviceId: string, event: string, data: any) {
    this.io.to(`device:${deviceId}`).emit(event, data);
  }

  public broadcastToAll(event: string, data: any) {
    this.io.emit(event, data);
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  public getUserConnections(userId: string): number {
    return this.connectedUsers.get(userId)?.size || 0;
  }
}

let socketManager: SocketManager | null = null;

export function initializeSocket(httpServer: any) {
  if (!socketManager) {
    socketManager = new SocketManager(httpServer);
  }
  return socketManager;
}

export function getSocketManager(): SocketManager {
  if (!socketManager) {
    throw new Error('Socket manager not initialized');
  }
  return socketManager;
}
