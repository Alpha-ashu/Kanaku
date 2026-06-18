/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * KANAKU IMPLEMENTATION GUIDE - CRITICAL SECURITY & ARCHITECTURE FIXES
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * 
 * This guide provides step-by-step implementation for the 6 CRITICAL issues
 * Start with these in Week 1-2 before any feature development
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */

/**
 * â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 * â”‚ CRITICAL #1: IMPLEMENT IDEMPOTENCY KEYS (HIGHEST PRIORITY - 10 HOURS)      â”‚
 * â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
 * 
 * Why First: Prevents duplicate transactions immediately (quick win)
 * Risk Mitigation: Stops user money loss from network retries
 * Implementation: Can be done in parallel with other work
 */

export const step1_IdempotencyImplementation = {
  estimated_effort: '10 hours',
  developer_skill: 'Senior',
  blockers: 'None',

  tasks: [
    {
      task_id: 'IDEM-1',
      description: 'Create IdempotencyKey model in Prisma',
      file: 'backend/prisma/schema.prisma',
      effort: '1 hour',
      code: `
        model IdempotencyKey {
          id String @id @default(uuid())
          key String @unique // Client-provided UUID
          userId String
          
          // Which operation was idempotent
          endpoint String // e.g., "/api/v1/transactions"
          method String // POST, PUT, DELETE
          
          // Cached response
          statusCode Int
          responseBody Json
          
          // Metadata
          expiresAt DateTime // 24 hours from creation
          createdAt DateTime @default(now())
          
          user User @relation(fields: [userId], references: [id], onDelete: Cascade)
          
          @@index([userId, expiresAt])
          @@index([key])
        }
      `,
      testing: `
        // Test 1: Same idempotency key returns cached response
        test('POST /transactions with same idempotency key returns cached', async () => {
          const key = 'uuid-123';
          
          const res1 = await request(app)
            .post('/api/v1/transactions')
            .set('Idempotency-Key', key)
            .send(transactionData);
          
          expect(res1.status).toBe(201);
          const tx1Id = res1.body.id;
          
          // Retry with same key
          const res2 = await request(app)
            .post('/api/v1/transactions')
            .set('Idempotency-Key', key)
            .send(transactionData);
          
          expect(res2.status).toBe(201);
          expect(res2.body.id).toBe(tx1Id); // Same transaction
          
          // Verify only 1 transaction created (not 2)
          const count = await prisma.transaction.count({
            where: { amount: transactionData.amount }
          });
          expect(count).toBe(1);
        });
      `
    },

    {
      task_id: 'IDEM-2',
      description: 'Create idempotency middleware',
      file: 'backend/src/middleware/idempotency.ts',
      effort: '3 hours',
      code: `
        import { Request, Response, NextFunction } from 'express';
        import { prisma } from '../db/prisma';
        import { AuthRequest } from './auth';
        
        /**
         * IDEMPOTENCY MIDDLEWARE
         * Prevents duplicate operations from network retries
         * 
         * Usage:
         *   router.post('/transactions', idempotencyMiddleware, createTransactionHandler)
         * 
         * Client sends: Idempotency-Key: <UUID>
         */
        export const idempotencyMiddleware = async (
          req: AuthRequest,
          res: Response,
          next: NextFunction
        ) => {
          // Only apply to write operations
          if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
            return next();
          }
          
          // Require idempotency key for financial operations
          const idempotencyKey = req.headers['idempotency-key'] as string;
          if (!idempotencyKey || !isValidUUID(idempotencyKey)) {
            return res.status(400).json({
              error: 'Idempotency-Key header required for financial operations',
              message: 'Provide a UUID v4 in Idempotency-Key header to safely retry requests'
            });
          }
          
          if (!req.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
          }
          
          // Check if this request was already processed
          const existingKey = await prisma.idempotencyKey.findUnique({
            where: { key: idempotencyKey }
          });
          
          if (existingKey) {
            // Return cached response immediately (no duplicate operation!)
            return res.status(existingKey.statusCode).json(
              JSON.parse(existingKey.responseBody.toString())
            );
          }
          
          // Intercept response to cache it
          const originalJson = res.json.bind(res);
          res.json = function(body: any) {
            // Only cache successful responses (200, 201)
            if (res.statusCode === 200 || res.statusCode === 201) {
              // Store in background (don't block response)
              prisma.idempotencyKey.create({
                data: {
                  key: idempotencyKey,
                  userId: req.userId!,
                  endpoint: req.path,
                  method: req.method,
                  statusCode: res.statusCode,
                  responseBody: JSON.stringify(body),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                }
              }).catch(err => {
                // Log but don't fail the request if caching fails
                console.error('Failed to store idempotency key:', err);
              });
            }
            
            return originalJson(body);
          };
          
          next();
        };
        
        function isValidUUID(uuid: string): boolean {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return uuidRegex.test(uuid);
        }
      `
    },

    {
      task_id: 'IDEM-3',
      description: 'Apply idempotency to critical routes',
      file: 'backend/src/features/transactions/transaction.routes.ts',
      effort: '2 hours',
      code: `
        import { Router } from 'express';
        import { authMiddleware } from '../../middleware/auth';
        import { idempotencyMiddleware } from '../../middleware/idempotency';
        import { validateRequest } from '../../middleware/validate';
        import { createTransactionSchema } from './transaction.schema';
        import { createTransactionHandler } from './transaction.controller';
        
        export const transactionRoutes = Router();
        
        // CREATE transaction - apply idempotency
        transactionRoutes.post(
          '/',
          authMiddleware,
          idempotencyMiddleware, // â† Add here
          validateRequest(createTransactionSchema),
          createTransactionHandler
        );
        
        // UPDATE transaction - apply idempotency
        transactionRoutes.put(
          '/:id',
          authMiddleware,
          idempotencyMiddleware, // â† Add here
          validateRequest(updateTransactionSchema),
          updateTransactionHandler
        );
        
        // DELETE transaction - apply idempotency
        transactionRoutes.delete(
          '/:id',
          authMiddleware,
          idempotencyMiddleware, // â† Add here
          deleteTransactionHandler
        );
        
        // Also apply to:
        // - Account creation/updates
        // - Loan payments
        // - Group expense creation
      `
    },

    {
      task_id: 'IDEM-4',
      description: 'Create cleanup job for expired keys',
      file: 'backend/src/workers/idempotency-cleanup.worker.ts',
      effort: '2 hours',
      code: `
        import { CronJob } from 'cron';
        import { prisma } from '../db/prisma';
        import { logger } from '../config/logger';
        
        /**
         * Run every 12 hours - clean up expired idempotency keys
         * Keys expire after 24 hours
         */
        export const startIdempotencyCleanup = () => {
          const job = new CronJob('0 */12 * * *', async () => {
            try {
              logger.info('Starting idempotency key cleanup...');
              
              const deleted = await prisma.idempotencyKey.deleteMany({
                where: {
                  expiresAt: {
                    lt: new Date() // Past date
                  }
                }
              });
              
              logger.info(\`Deleted \${deleted.count} expired idempotency keys\`);
            } catch (error) {
              logger.error('Idempotency cleanup failed:', error);
            }
          });
          
          job.start();
          return job;
        };
      `
    },

    {
      task_id: 'IDEM-5',
      description: 'Update frontend API client',
      file: 'frontend/src/lib/api-client.ts',
      effort: '2 hours',
      code: `
        import axios, { AxiosInstance } from 'axios';
        import { v4 as uuidv4 } from 'uuid';
        
        export class ApiClient {
          private client: AxiosInstance;
          
          constructor(baseURL: string, token: string) {
            this.client = axios.create({
              baseURL,
              headers: {
                Authorization: \`Bearer \${token}\`,
                'Content-Type': 'application/json'
              }
            });
          }
          
          /**
           * POST with automatic idempotency
           * Generates UUID for each request
           */
          async post<T>(path: string, data: any): Promise<T> {
            const idempotencyKey = uuidv4();
            
            const response = await this.client.post<T>(path, data, {
              headers: {
                'Idempotency-Key': idempotencyKey
              }
            });
            
            return response.data;
          }
          
          /**
           * PUT with automatic idempotency
           */
          async put<T>(path: string, data: any): Promise<T> {
            const idempotencyKey = uuidv4();
            
            const response = await this.client.put<T>(path, data, {
              headers: {
                'Idempotency-Key': idempotencyKey
              }
            });
            
            return response.data;
          }
          
          /**
           * DELETE with automatic idempotency
           */
          async delete<T>(path: string): Promise<T> {
            const idempotencyKey = uuidv4();
            
            const response = await this.client.delete<T>(path, {
              headers: {
                'Idempotency-Key': idempotencyKey
              }
            });
            
            return response.data;
          }
          
          // GET requests (no idempotency needed)
          async get<T>(path: string): Promise<T> {
            const response = await this.client.get<T>(path);
            return response.data;
          }
        }
        
        // Usage in components:
        const api = new ApiClient(
          process.env.REACT_APP_API_URL,
          authToken
        );
        
        // Transaction creation - automatically includes idempotency key
        const tx = await api.post('/api/v1/transactions', {
          amount: 100,
          category: 'food',
          date: new Date()
        });
      `
    }
  ]
};

/**
 * â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 * â”‚ CRITICAL #2: PER-USER RATE LIMITING (8 HOURS)                               â”‚
 * â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
 */

export const step2_RateLimitingImplementation = {
  estimated_effort: '8 hours',
  why_critical: 'Prevents brute force attacks on login, bulk scraping, DoS',

  tasks: [
    {
      task_id: 'RATE-1',
      description: 'Create Redis-backed rate limiter',
      file: 'backend/src/utils/rate-limiter.ts',
      effort: '2 hours',
      code: `
        import Redis from 'ioredis';
        
        export interface RateLimitResult {
          allowed: boolean;
          remaining: number;
          resetAt: Date;
          retryAfter: number; // seconds
        }
        
        export class RateLimiter {
          private redis: Redis;
          
          constructor(redisUrl: string) {
            this.redis = new Redis(redisUrl);
          }
          
          /**
           * Check rate limit using sliding window algorithm
           * More accurate than fixed buckets, slightly more memory usage
           */
          async checkLimit(
            key: string,
            limit: number,
            windowSeconds: number = 60
          ): Promise<RateLimitResult> {
            const now = Date.now();
            const windowStart = now - windowSeconds * 1000;
            
            // Remove old entries outside window
            await this.redis.zremrangebyscore(key, '-inf', windowStart);
            
            // Count requests in window
            const count = await this.redis.zcard(key);
            
            const allowed = count < limit;
            
            if (allowed) {
              // Add current request
              await this.redis.zadd(key, now, \`\${now}-\${Math.random()}\`);
              // Set expiry on key
              await this.redis.expire(key, windowSeconds);
            }
            
            // Get oldest request timestamp for reset time
            const oldest = await this.redis.zrange(key, 0, 0);
            const resetAt = oldest.length > 0
              ? new Date(parseInt(oldest[0]) + windowSeconds * 1000)
              : new Date(now + windowSeconds * 1000);
            
            return {
              allowed,
              remaining: Math.max(0, limit - count),
              resetAt,
              retryAfter: Math.ceil((resetAt.getTime() - now) / 1000)
            };
          }
          
          /**
           * Async check - used in middleware
           */
          async checkUserLimit(
            userId: string,
            limit: number = 100,
            windowSeconds: number = 60
          ): Promise<RateLimitResult> {
            return this.checkLimit(\`rate:user:\${userId}\`, limit, windowSeconds);
          }
          
          /**
           * IP-based rate limiting (for login, signup)
           */
          async checkIpLimit(
            ip: string,
            limit: number,
            windowSeconds: number = 60
          ): Promise<RateLimitResult> {
            return this.checkLimit(\`rate:ip:\${ip}\`, limit, windowSeconds);
          }
          
          /**
           * Endpoint-specific rate limiting
           */
          async checkEndpointLimit(
            userId: string,
            endpoint: string,
            limit: number,
            windowSeconds: number = 60
          ): Promise<RateLimitResult> {
            return this.checkLimit(
              \`rate:user:\${userId}:endpoint:\${endpoint}\`,
              limit,
              windowSeconds
            );
          }
        }
        
        export const rateLimiter = new RateLimiter(
          process.env.REDIS_URL || 'redis://localhost:6379'
        );
      `
    },

    {
      task_id: 'RATE-2',
      description: 'Create rate limit middleware',
      file: 'backend/src/middleware/rate-limit.ts',
      effort: '2 hours',
      code: `
        import { Request, Response, NextFunction } from 'express';
        import { AuthRequest } from './auth';
        import { rateLimiter } from '../utils/rate-limiter';
        
        /**
         * Middleware factory for per-user rate limiting
         */
        export const perUserRateLimit = (
          limit: number = 100,
          windowSeconds: number = 60
        ) => {
          return async (req: AuthRequest, res: Response, next: NextFunction) => {
            if (!req.userId) {
              return next(); // Not authenticated, skip
            }
            
            const result = await rateLimiter.checkUserLimit(
              req.userId,
              limit,
              windowSeconds
            );
            
            // Add rate limit headers
            res.set({
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': result.resetAt.toISOString(),
              'Retry-After': result.retryAfter.toString()
            });
            
            if (!result.allowed) {
              return res.status(429).json({
                error: 'Too many requests',
                message: \`Rate limit exceeded. Try again in \${result.retryAfter} seconds.\`,
                retryAfter: result.retryAfter,
                resetAt: result.resetAt
              });
            }
            
            next();
          };
        };
        
        /**
         * IP-based rate limiting for authentication endpoints
         */
        export const ipRateLimit = (
          limit: number = 5,
          windowSeconds: number = 60
        ) => {
          return async (req: Request, res: Response, next: NextFunction) => {
            const ip = getClientIp(req);
            
            const result = await rateLimiter.checkIpLimit(
              ip,
              limit,
              windowSeconds
            );
            
            res.set({
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'Retry-After': result.retryAfter.toString()
            });
            
            if (!result.allowed) {
              return res.status(429).json({
                error: 'Too many login attempts',
                message: \`Too many login attempts from this IP. Try again in \${result.retryAfter} seconds.\`,
                retryAfter: result.retryAfter
              });
            }
            
            next();
          };
        };
        
        /**
         * Endpoint-specific rate limiting
         * Example: Export can only be done 1x per minute
         */
        export const endpointRateLimit = (
          limit: number,
          windowSeconds: number = 60
        ) => {
          return async (req: AuthRequest, res: Response, next: NextFunction) => {
            if (!req.userId) return next();
            
            const endpoint = req.path; // /api/v1/transactions/export
            
            const result = await rateLimiter.checkEndpointLimit(
              req.userId,
              endpoint,
              limit,
              windowSeconds
            );
            
            res.set('Retry-After', result.retryAfter.toString());
            
            if (!result.allowed) {
              return res.status(429).json({
                error: 'Endpoint rate limit exceeded',
                retryAfter: result.retryAfter
              });
            }
            
            next();
          };
        };
        
        function getClientIp(req: Request): string {
          return (
            (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
            (req.headers['x-real-ip'] as string) ||
            req.socket.remoteAddress ||
            'unknown'
          );
        }
      `
    },

    {
      task_id: 'RATE-3',
      description: 'Apply rate limits to critical routes',
      file: 'backend/src/features/auth/auth.routes.ts',
      effort: '2 hours',
      code: `
        import { Router } from 'express';
        import { ipRateLimit, perUserRateLimit } from '../../middleware/rate-limit';
        import { loginHandler, signupHandler } from './auth.controller';
        
        export const authRoutes = Router();
        
        // LOGIN: 5 attempts per minute per IP
        authRoutes.post(
          '/login',
          ipRateLimit(5, 60), // â† Limit by IP
          loginHandler
        );
        
        // SIGNUP: 3 new accounts per minute per IP
        authRoutes.post(
          '/signup',
          ipRateLimit(3, 60), // â† Limit by IP
          signupHandler
        );
        
        // REFRESH TOKEN: 20 per minute per user
        authRoutes.post(
          '/refresh',
          authMiddleware,
          perUserRateLimit(20, 60), // â† Limit per user
          refreshHandler
        );
      `,
      reference: `
        // Transaction routes
        transactionRoutes.post(
          '/',
          authMiddleware,
          perUserRateLimit(10, 60), // 10 per minute
          idempotencyMiddleware,
          createTransactionHandler
        );
        
        transactionRoutes.get(
          '/',
          authMiddleware,
          perUserRateLimit(30, 60), // 30 per minute
          getTransactionsHandler
        );
        
        // Export: 1 per minute
        transactionRoutes.get(
          '/export',
          authMiddleware,
          endpointRateLimit(1, 60),
          exportHandler
        );
      `
    },

    {
      task_id: 'RATE-4',
      description: 'Create monitoring dashboard',
      file: 'backend/src/features/admin/rate-limit-monitor.ts',
      effort: '2 hours',
      responsibility: `
        - Admin endpoint: GET /api/v1/admin/rate-limits
        - Show top users by API calls
        - Show IPs with suspicious patterns
        - Automatically block IPs with 100+ failed logins
      `
    }
  ]
};

/**
 * â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 * â”‚ CRITICAL #3: DATABASE CONSTRAINTS (12 HOURS)                                â”‚
 * â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
 */

export const step3_DatabaseConstraints = {
  estimated_effort: '12 hours',
  why_critical: 'Prevents silent data corruption (negative balances, impossible states)',

  migration_script: `
    -- File: backend/prisma/migrations/[timestamp]_add_constraints.sql
    -- Run AFTER backing up database
    
    BEGIN;
    
    -- ========== ACCOUNT CONSTRAINTS ==========
    -- Prevent negative balances
    ALTER TABLE accounts
      ADD CONSTRAINT check_balance_non_negative 
        CHECK (balance >= 0);
    
    -- Prevent invalid account types
    CREATE TYPE account_type AS ENUM (
      'bank',
      'credit_card', 
      'debit_card',
      'digital_wallet',
      'cash'
    );
    
    ALTER TABLE accounts
      ADD COLUMN type_enum account_type;
    
    -- Migrate data (set intelligent defaults)
    UPDATE accounts 
      SET type_enum = CASE 
        WHEN type = 'bank' THEN 'bank'::account_type
        WHEN type = 'credit_card' THEN 'credit_card'::account_type
        WHEN type = 'card' THEN 'debit_card'::account_type
        ELSE 'cash'::account_type
      END;
    
    -- Drop old type column and rename
    ALTER TABLE accounts DROP COLUMN type;
    ALTER TABLE accounts RENAME COLUMN type_enum TO type;
    
    -- Create index for queries
    CREATE INDEX idx_accounts_user_active ON accounts(user_id, is_active);
    
    -- ========== TRANSACTION CONSTRAINTS ==========
    -- Amount must be positive
    ALTER TABLE transactions
      ADD CONSTRAINT check_amount_positive 
        CHECK (amount > 0);
    
    -- Date can't be in future
    ALTER TABLE transactions
      ADD CONSTRAINT check_date_not_future 
        CHECK (date <= CURRENT_TIMESTAMP);
    
    -- Unique dedup hash prevents duplicates
    CREATE UNIQUE INDEX idx_dedup_hash ON transactions(dedup_hash) 
      WHERE deleted_at IS NULL;
    
    -- Performance indexes
    CREATE INDEX idx_transactions_user_date 
      ON transactions(user_id, date DESC) 
      WHERE deleted_at IS NULL;
    
    CREATE INDEX idx_transactions_account_date 
      ON transactions(account_id, date DESC) 
      WHERE deleted_at IS NULL;
    
    -- ========== LOAN CONSTRAINTS ==========
    -- Principal must be positive
    ALTER TABLE loans
      ADD CONSTRAINT check_principal_positive 
        CHECK (principal_amount > 0);
    
    -- Outstanding can't exceed principal
    ALTER TABLE loans
      ADD CONSTRAINT check_balance_valid 
        CHECK (outstanding_balance <= principal_amount);
    
    -- Outstanding can't be negative
    ALTER TABLE loans
      ADD CONSTRAINT check_balance_non_negative 
        CHECK (outstanding_balance >= 0);
    
    CREATE TYPE loan_status AS ENUM (
      'pending',
      'active',
      'paused',
      'closed',
      'defaulted'
    );
    
    -- ========== LOAN PAYMENT CONSTRAINTS ==========
    ALTER TABLE loan_payments
      ADD CONSTRAINT check_payment_positive 
        CHECK (amount > 0);
    
    -- ========== GROUP EXPENSE CONSTRAINTS ==========
    ALTER TABLE group_expenses
      ADD CONSTRAINT check_total_positive 
        CHECK (total_amount > 0);
    
    CREATE INDEX idx_group_user_date 
      ON group_expenses(user_id, date DESC) 
      WHERE deleted_at IS NULL;
    
    COMMIT;
    
    -- Verify constraints
    SELECT constraint_name, table_name 
    FROM information_schema.table_constraints 
    WHERE constraint_type = 'CHECK' 
    ORDER BY table_name;
  `,

  steps: [
    {
      step: 1,
      task: 'Backup database',
      command: 'pg_dump KANAKU > KANAKU_backup_$(date +%Y%m%d).sql',
      timing: '5 min'
    },
    {
      step: 2,
      task: 'Create migration file',
      file: 'backend/prisma/migrations/[timestamp]_add_database_constraints/migration.sql',
      timing: '2 hours',
      content: 'See migration_script above'
    },
    {
      step: 3,
      task: 'Test in staging',
      command: 'npx prisma migrate deploy --preview-feature',
      timing: '1 hour'
    },
    {
      step: 4,
      task: 'Create validation service',
      file: 'backend/src/services/data-validation.service.ts',
      timing: '3 hours',
      responsibility: `
        - Validate account balance >= 0 before accepting
        - Validate transaction amount > 0 and date <= now()
        - Validate loan outstanding <= principal
        - Add pre-save validation hooks
      `
    },
    {
      step: 5,
      task: 'Create balance reconciliation job',
      file: 'backend/src/workers/balance-reconciliation.worker.ts',
      timing: '4 hours',
      responsibility: `
        - Run daily at 3 AM UTC
        - Recalculate each account balance from transactions
        - Compare to database balance
        - Alert if mismatch > 0.01
        - Log all discrepancies for audit
      `
    }
  ]
};

/**
 * IMPLEMENTATION TIMELINE
 * â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
 * 
 * Week 1 (Mon-Fri):
 * - Mon: IDEM (idempotency) - 10h
 * - Tue-Wed: RATE (rate limiting) - 8h
 * - Thu-Fri: DB Constraints - 12h (backup + apply + test)
 * 
 * Total: 30 hours / 5 days = 6h per day (feasible with 2 engineers)
 * 
 * Parallel:
 * - QA testing can start Wed on idempotency
 * - Load testing can start Thu on rate limiting
 * - Staging deployment Fri EOD
 */
