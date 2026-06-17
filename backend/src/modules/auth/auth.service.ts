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
    phone?: string;
    mobile?: string;
  }): Promise<AuthTokens> {
    logger.info(`[AuthService] Starting registration process in service for email: ${input.email}`);
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        logger.warn(`[AuthService] Registration failed: Email ${input.email} is already registered`);
        throw new Error('Email already registered');
      }

      const resolvedPhone = input.phone ?? input.mobile ?? null;
      if (resolvedPhone) {
        // Check if phone number is already registered by another user
        const existingPhoneProfile = await prisma.profiles.findFirst({
          where: { phone: resolvedPhone }
        });
        if (existingPhoneProfile) {
          logger.warn(`[AuthService] Registration failed: Phone ${resolvedPhone} already in use`);
          throw new Error('Phone number already in use');
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 12);

      // Never trust a raw role value from the client. Users may request advisor
      // onboarding, but privileged roles must still be granted by the backend.
      const role = input.role === 'advisor' ? 'advisor' : 'user';
      const isApproved = role === 'user'; // Advisors require explicit admin approval

      logger.info(`[AuthService] Creating user record in database for email: ${input.email}, role: ${role}`);
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
      logger.info(`[AuthService] User record created successfully with ID: ${user.id}`);

      // Sync user to public.profiles table
      try {
        const nameParts = input.name.trim().split(/\s+/).filter(Boolean);
        const firstName = input.firstName || nameParts[0] || '';
        const lastName = input.lastName || nameParts.slice(1).join(' ') || '';
        logger.info(`[AuthService] Syncing registered user ${user.id} to public.profiles table`);
        await prisma.$executeRaw`
          INSERT INTO public.profiles (
            id, email, first_name, last_name, full_name, phone, created_at, updated_at
          ) VALUES (
            ${user.id}::uuid, ${user.email}, ${firstName || null}, ${lastName || null}, 
            ${user.name}, ${resolvedPhone}, NOW(), NOW()
          ) ON CONFLICT (id) DO NOTHING;
        `;
        logger.info(`[AuthService] Initial profile synced for registered user: ${user.id}`);
      } catch (syncError: any) {
        logger.warn('[AuthService] Non-blocking initial profile sync failed', {
          message: syncError.message,
        });
      }

      // Match this email against any pending collaboration invitations
      // (Group Expenses, Together To-Do Lists, Together Goals) and link them.
      try {
        const { linkPendingInvitationsForUser } = await import('../collaboration/invitation.service');
        await linkPendingInvitationsForUser(user.id, user.email);
      } catch (linkError: any) {
        logger.warn('[AuthService] Non-blocking pending-invitation link failed', {
          message: linkError.message,
        });
      }

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
    logger.info(`[AuthService] Processing profile update for userId: ${userId}. Input data: ${JSON.stringify(data)}`);

    // Fetch existing records for merging
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    const existingProfile = await prisma.profiles.findUnique({ where: { id: userId } });

    // Perform a field-by-field merge of incoming data with existing DB state
    const merged = {
      firstName: data.firstName !== undefined ? data.firstName : (existingUser?.firstName ?? existingProfile?.first_name ?? null),
      lastName: data.lastName !== undefined ? data.lastName : (existingUser?.lastName ?? existingProfile?.last_name ?? null),
      gender: data.gender !== undefined ? data.gender : (existingUser?.gender ?? existingProfile?.gender ?? null),
      country: data.country !== undefined ? data.country : (existingUser?.country ?? existingProfile?.country ?? null),
      state: data.state !== undefined ? data.state : (existingUser?.state ?? existingProfile?.state ?? null),
      city: data.city !== undefined ? data.city : (existingUser?.city ?? existingProfile?.city ?? null),
      avatarId: data.avatarId !== undefined ? data.avatarId : (existingUser?.avatarId ?? existingProfile?.avatar_id ?? null),
      avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : (existingProfile?.avatar_url ?? null),
      jobType: data.jobType !== undefined ? data.jobType : (existingUser?.jobType ?? existingProfile?.job_type ?? null),
    };

    // Standardize phone - if phone or mobile is provided in request, use it. Otherwise fall back to DB.
    let resolvedPhone: string | null = null;
    if (data.phone !== undefined || data.mobile !== undefined) {
      resolvedPhone = data.phone ?? data.mobile ?? null;
    } else {
      resolvedPhone = existingProfile?.phone ?? null;
    }

    // Standardize monthlyIncome - fall back to DB if omitted (undefined)
    let monthlyIncomeVal = data.monthlyIncome;
    if (monthlyIncomeVal === undefined) {
      if (existingProfile?.monthly_income !== null && existingProfile?.monthly_income !== undefined) {
        monthlyIncomeVal = Number(existingProfile.monthly_income);
      } else if (existingUser?.salary !== null && existingUser?.salary !== undefined) {
        monthlyIncomeVal = Number(existingUser.salary) / 12;
      } else {
        monthlyIncomeVal = null;
      }
    }

    // Standardize dateOfBirth - fall back to DB if omitted (undefined)
    let dobVal = data.dateOfBirth;
    if (dobVal === undefined) {
      dobVal = existingUser?.dateOfBirth ?? existingProfile?.date_of_birth ?? null;
    }

    // Validate email if provided in data
    const activeEmail = email || data.email;
    if (activeEmail) {
      const existingEmailUser = await prisma.user.findFirst({
        where: {
          email: activeEmail,
          NOT: {
            id: userId
          }
        }
      });
      if (existingEmailUser) {
        throw new Error('Email already in use');
      }
    }

    // Validate phone uniqueness
    if (resolvedPhone) {
      const existingPhoneProfile = await prisma.profiles.findFirst({
        where: {
          phone: resolvedPhone,
          NOT: {
            id: userId
          }
        }
      });
      if (existingPhoneProfile) {
        logger.warn(`[AuthService] Profile update failed: Phone number ${resolvedPhone} is already in use by another user`);
        throw new Error('Phone number already in use');
      }
    }

    // Standardize income - handle potential float/string/null
    let decimalMonthlyIncome: Prisma.Decimal | null = null;
    let decimalAnnualIncome: Prisma.Decimal | null = null;
    try {
      if (monthlyIncomeVal !== undefined && monthlyIncomeVal !== null) {
        const incomeNum = Number(monthlyIncomeVal);
        if (!isNaN(incomeNum)) {
          decimalMonthlyIncome = new Prisma.Decimal(incomeNum);
          decimalAnnualIncome = new Prisma.Decimal(incomeNum * 12);
        }
      }
    } catch (e) {
      logger.warn('[AuthService] Income conversion error:', e);
    }

    // Standardize DOB
    let dob: Date | null = null;
    if (dobVal) {
      try {
        const parsedDate = new Date(dobVal);
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
      const finalActiveEmail = email || data.email || existingUser?.email || `user-${userId.substring(0, 8)}@noemail.invalid`;

      const user = await prisma.user.upsert({
        where: { id: userId },
        update: {
          name: `${merged.firstName || ''} ${merged.lastName || ''}`.trim() || 'User',
          firstName: merged.firstName,
          lastName: merged.lastName,
          gender: merged.gender,
          country: merged.country,
          state: merged.state,
          city: merged.city,
          salary: monthlyIncomeVal ? Number(monthlyIncomeVal) * 12 : null,
          dateOfBirth: dob,
          jobType: merged.jobType,
          avatarId: merged.avatarId,
          updatedAt: new Date(),
        } as any,
        create: {
          id: userId,
          email: finalActiveEmail,
          name: `${merged.firstName || ''} ${merged.lastName || ''}`.trim() || 'User',
          password: 'supabase-managed-account',
          firstName: merged.firstName,
          lastName: merged.lastName,
          gender: merged.gender,
          country: merged.country,
          state: merged.state,
          city: merged.city,
          salary: monthlyIncomeVal ? Number(monthlyIncomeVal) * 12 : 0,
          dateOfBirth: dob,
          jobType: merged.jobType,
          avatarId: merged.avatarId,
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
            ${userId}::uuid, ${finalActiveEmail || null}, ${merged.firstName || null}, ${merged.lastName || null}, 
            ${(`${merged.firstName || ''} ${merged.lastName || ''}`.trim() || null)}, ${merged.gender || null},
            ${merged.country || null}, ${merged.state || null}, ${merged.city || null}, ${resolvedPhone}, ${merged.avatarUrl || null}, ${merged.avatarId || null},
            ${decimalMonthlyIncome}, ${decimalAnnualIncome}, 
            ${dob || null}, ${merged.jobType || null}, NOW()
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
            const hashedPassword = await bcrypt.hash(input.password, 12);
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

  async verifyPasswordOnly(email: string, passwordStr: string, isSha256 = false): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return false;
    }

    let isPasswordValid = false;

    if (!user.password || user.password === 'supabase-managed-account') {
      logger.info(`[AuthService] User ${email} has a Supabase-managed or unmigrated account. Authenticating via Supabase...`);
      if (isSha256) {
        // Cannot verify a SHA-256 pre-hash against Supabase auth (needs plaintext).
        // Return false; frontend will fall back to plain encoding on retry.
        return false;
      }
      const supabaseAdmin = getSupabaseAdminClient();
      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin.auth.signInWithPassword({
          email,
          password: passwordStr
        });
        
        if (!error && data.user) {
          isPasswordValid = true;
          // Migrate password hash to local DB for future logins
          try {
            const hashedPassword = await bcrypt.hash(passwordStr, 12);
            await prisma.user.update({
              where: { id: user.id },
              data: { password: hashedPassword }
            });
            logger.info(`[AuthService] Migrated password hash for user ${email} to local DB.`);
          } catch (migrateErr: any) {
            logger.warn(`[AuthService] Password migration failed for user ${email}:`, migrateErr);
          }
        }
      }
    } else if (isSha256) {
      // Client sent SHA-256(plaintext). We cannot bcrypt.compare a sha256 digest
      // directly — bcrypt requires the original plaintext. So we fall through to
      // treating the digest as-is; if the column doesn't exist this will fail and
      // return false, causing the frontend to retry with plain encoding.
      // This is safe: SHA-256 only obscures the wire representation (HTTPS already
      // encrypts the payload). Bcrypt comparison is the actual security gate.
      try {
        isPasswordValid = await bcrypt.compare(passwordStr, user.password);
      } catch {
        isPasswordValid = false;
      }
    } else {
      isPasswordValid = await bcrypt.compare(passwordStr, user.password);
    }

    return isPasswordValid;
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
