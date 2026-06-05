import bcrypt from 'bcryptjs';
import { User, RegisterInput, LoginInput, AuthTokens } from './auth.types';
import { prisma } from '../../db/prisma';
import { generateTokens } from '../../utils/auth';
import { Prisma } from '../../db/prisma-client';
import { logger } from '../../config/logger';
import { getSupabaseAdminClient } from '../../db/supabase';

export class AuthService {
  async register(input: RegisterInput & {
    firstName?: string;
    lastName?: string;
    salary?: number;
    dateOfBirth?: Date;
    jobType?: string;
  }): Promise<AuthTokens> {

    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: input.email },
      });


      if (existingUser) {
        throw new Error('Email already registered');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Never trust a raw role value from the client. Users may request advisor
      // onboarding, but privileged roles must still be granted by the backend.
      const role = input.role === 'advisor' ? 'advisor' : 'user';
      const isApproved = role === 'user'; // Advisors require explicit admin approval


      // Create user with profile information
      const user = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          password: hashedPassword,
          role,
          isApproved,
          firstName: input.firstName,
          lastName: input.lastName,
          salary: input.salary,
          dateOfBirth: input.dateOfBirth,
          jobType: input.jobType,
        },
      });

      const tokens = generateTokens(user);
      return tokens;
    } catch (error) {
      logger.error('[AuthService] Registration error:', error);
      throw error;
    }
  }

  async completeProfile(userId: string, profileData: {
    firstName: string;
    lastName: string;
    salary: number;
    dateOfBirth: Date;
    jobType: string;
  }): Promise<User> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: profileData,
    });

    return user;
  }

  async updateProfile(userId: string, data: any, email?: string): Promise<any> {
    const {
      firstName,
      lastName,
      gender,
      country,
      state,
      city,
      monthlyIncome,
      dateOfBirth,
      jobType,
      phone,
      mobile,
      avatarId,
      avatarUrl,
    } = data;
    const resolvedPhone = phone ?? mobile ?? null;

    logger.info(`[AuthService] Processing profile update for userId: ${userId}`);

    // Standardize income - handle potential float/string/null
    let decimalMonthlyIncome: Prisma.Decimal | null = null;
    let decimalAnnualIncome: Prisma.Decimal | null = null;
    try {
      if (monthlyIncome !== undefined && monthlyIncome !== null) {
        const incomeNum = Number(monthlyIncome);
        if (!isNaN(incomeNum)) {
          decimalMonthlyIncome = new Prisma.Decimal(incomeNum);
          decimalAnnualIncome = new Prisma.Decimal(incomeNum * 12);
        }
      }
    } catch (e) {
      logger.warn('[AuthService] Income conversion error:', e);
    }

    // Standardize DOB
    let dob: Date | undefined;
    if (dateOfBirth) {
      try {
        const parsedDate = new Date(dateOfBirth);
        if (!isNaN(parsedDate.getTime())) {
          dob = parsedDate;
        }
      } catch (e) {
        logger.warn('[AuthService] DOB conversion error:', e);
      }
    }

    // 1. Primary Update: local User table (PostgreSQL public schema)
    try {
      logger.info(`[AuthService] Updating User table for ID: ${userId}, Email: ${email || 'none'}`);

      // Safety: Ensure email is never empty if we are creating a new record
      // In a hybrid system, we prefer the email from the JWT/Session
      const activeEmail = email || data.email || `user-${userId.substring(0, 8)}@placeholder.KANKU.app`;

      const user = await prisma.user.upsert({
        where: { id: userId },
        update: {
          name: `${firstName || ''} ${lastName || ''}`.trim() || 'User',
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          gender: gender || undefined,
          country: country || undefined,
          state: state || undefined,
          city: city || undefined,
          salary: monthlyIncome ? Number(monthlyIncome) * 12 : undefined,
          dateOfBirth: dob,
          jobType,
          avatarId: avatarId || undefined,
          updatedAt: new Date(),
        } as any,
        create: {
          id: userId,
          email: activeEmail,
          name: `${firstName || ''} ${lastName || ''}`.trim() || 'User',
          password: 'supabase-managed-account',
          firstName: firstName || null,
          lastName: lastName || null,
          gender: gender || null,
          country: country || null,
          state: state || null,
          city: city || null,
          salary: monthlyIncome ? Number(monthlyIncome) * 12 : 0,
          dateOfBirth: dob,
          jobType,
          avatarId: avatarId || null,
          updatedAt: new Date(),
          createdAt: new Date(),
        } as any
      });
      logger.info('[AuthService] User table updated successfully');

      // 2. Best-effort Sync: profiles table (often managed by Supabase)
      try {
        logger.info('[AuthService] Syncing to public.profiles table...');
        // We use raw SQL for the profiles table because it might have foreign keys or 
        // schema issues that conflict with Prisma's standard ORM expectations for multi-schema.
        await prisma.$executeRaw`
          INSERT INTO public.profiles (
            id, email, first_name, last_name, full_name, gender, 
            country, state, city, phone, avatar_url, avatar_id, monthly_income, annual_income, 
            date_of_birth, job_type, updated_at
          ) VALUES (
            ${userId}::uuid, ${email || null}, ${firstName || null}, ${lastName || null}, 
            ${(`${firstName || ''} ${lastName || ''}`.trim() || null)}, ${gender || null},
            ${country || null}, ${state || null}, ${city || null}, ${resolvedPhone}, ${avatarUrl || null}, ${avatarId || null},
            ${decimalMonthlyIncome}, ${decimalAnnualIncome}, 
            ${dob || null}, ${jobType || null}, NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            full_name = EXCLUDED.full_name,
            gender = EXCLUDED.gender,
            country = EXCLUDED.country,
            state = EXCLUDED.state,
            city = EXCLUDED.city,
            phone = EXCLUDED.phone,
            avatar_url = EXCLUDED.avatar_url,
            avatar_id = EXCLUDED.avatar_id,
            monthly_income = EXCLUDED.monthly_income,
            annual_income = EXCLUDED.annual_income,
            date_of_birth = EXCLUDED.date_of_birth,
            job_type = EXCLUDED.job_type,
            updated_at = NOW();
        `;
        logger.info('[AuthService] profiles table synced successfully');
      } catch (syncError: any) {
        // Non-blocking error for the profiles table sync
        logger.warn('[AuthService] Non-blocking profiles sync failed', {
          message: syncError.message,
          code: syncError.code,
          meta: syncError.meta,
        });
      }

      return user;
    } catch (primaryError: any) {
      logger.error('[AuthService] Critical User update failed:', primaryError);
      throw primaryError; // This will return 500 to the client correctly
    }
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    let isPasswordValid = false;

    if (!user.password || user.password === 'supabase-managed-account') {
      logger.info(`[AuthService] User ${input.email} has a Supabase-managed or unmigrated account. Authenticating via Supabase...`);
      const supabaseAdmin = getSupabaseAdminClient();
      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin.auth.signInWithPassword({
          email: input.email,
          password: input.password
        });
        
        if (!error && data.user) {
          isPasswordValid = true;
          // Migrating password hash to local DB for future logins
          try {
            const hashedPassword = await bcrypt.hash(input.password, 10);
            await prisma.user.update({
              where: { id: user.id },
              data: { password: hashedPassword }
            });
            logger.info(`[AuthService] Migrated password hash for user ${input.email} to local DB.`);
          } catch (migrateErr: any) {
            logger.warn(`[AuthService] Password migration failed for user ${input.email}:`, migrateErr);
          }
        }
      }
    } else {
      isPasswordValid = await bcrypt.compare(input.password, user.password);
    }

    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Check if user is approved (especially important for advisors)
    // For now, still allow login even if not approved, but token will indicate status
    return generateTokens(user);
  }

  async getUser(userId: string): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  async updateUserRole(userId: string, role: 'admin' | 'advisor' | 'user'): Promise<User> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return user;
  }

  async approveAdvisor(advisorId: string): Promise<User> {
    const user = await prisma.user.update({
      where: { id: advisorId },
      data: { isApproved: true },
    });

    return user;
  }

  async rejectAdvisor(advisorId: string): Promise<void> {
    await prisma.user.update({
      where: { id: advisorId },
      data: { role: 'user', isApproved: false },
    });
  }

  async getAdvisors(): Promise<User[]> {
    const advisors = await prisma.user.findMany({
      where: { role: 'advisor', isApproved: true },
    });

    return advisors;
  }

  // API Keys and Credentials
  getApiKey(key: string): string | undefined {
    return process.env[key as keyof NodeJS.ProcessEnv] as string | undefined;
  }

  getStripeApiKey(): string | undefined {
    return this.getApiKey('STRIPE_API_KEY');
  }

  getOpenAIApiKey(): string | undefined {
    return this.getApiKey('OPENAI_API_KEY');
  }

  getGoogleApiKey(): string | undefined {
    return this.getApiKey('GOOGLE_API_KEY');
  }

  getFirebaseSecret(): string | undefined {
    return this.getApiKey('FIREBASE_SECRET');
  }

  getAwsSecretAccessKey(): string | undefined {
    return this.getApiKey('AWS_SECRET_ACCESS_KEY');
  }

  getSendGridApiKey(): string | undefined {
    return this.getApiKey('SENDGRID_API_KEY');
  }

  async deleteAccount(userId: string): Promise<void> {
    logger.info(`[AuthService] Deleting account for userId: ${userId}`);

    // 1. Verify user exists before attempting deletion
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      // User might be Supabase-only (no Prisma record) — proceed to Supabase deletion
      logger.warn(`[AuthService] Prisma user not found for deletion: ${userId}`);
    }

    // 2. Delete from Prisma (cascades to all related data: transactions, accounts, etc.)
    if (user) {
      try {
        await prisma.user.delete({ where: { id: userId } });
        logger.info(`[AuthService] Prisma user deleted successfully: ${userId}`);
      } catch (prismaError: any) {
        logger.error('[AuthService] Failed to delete user from Prisma:', {
          userId,
          message: prismaError.message,
        });
        throw new Error('Failed to delete account data. Please contact support.');
      }
    }

    // 3. Best-effort: Delete from Supabase Auth (requires service role key)
    try {
      const adminClient = getSupabaseAdminClient();
      if (adminClient) {
        const { error } = await adminClient.auth.admin.deleteUser(userId);
        if (error) {
          logger.warn('[AuthService] Supabase auth user deletion returned an error (non-fatal):', {
            userId,
            message: error.message,
          });
        } else {
          logger.info(`[AuthService] Supabase auth user deleted successfully: ${userId}`);
        }
      } else {
        logger.warn('[AuthService] Supabase admin client not available — skipping Supabase auth deletion.');
      }
    } catch (supabaseError: any) {
      // Non-blocking: the Prisma record is already gone so the account is effectively deleted
      logger.warn('[AuthService] Non-blocking Supabase auth deletion failed:', {
        userId,
        message: supabaseError.message,
      });
    }
  }
}
