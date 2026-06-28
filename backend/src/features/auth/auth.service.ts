import bcrypt from 'bcryptjs';
import { User, RegisterInput, LoginInput, AuthTokens } from './auth.types';
import { prisma } from '../../db/prisma';
import { generateTokens } from '../../utils/auth';
import { Prisma } from '../../db/prisma-client';
import { logger } from '../../config/logger';
import { getSupabaseAdminClient } from '../../db/supabase';
import { authProvider } from './auth.provider';
import {
  normalizePhone,
  deriveLocaleAndCurrency,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_CATEGORIES,
} from './registration.defaults';

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
      // ── Pre-checks (friendly errors). The DB unique constraints are the
      // AUTHORITATIVE guard against races — the transaction + P2002 mapping in
      // the controller handle the rare concurrent-duplicate case.
      const [existingUser, existingProfile] = await Promise.all([
        prisma.user.findUnique({ where: { email: input.email } }),
        prisma.profiles.findFirst({ where: { email: input.email } }),
      ]);
      if (existingUser || existingProfile) {
        logger.warn(`[AuthService] Registration failed: Email ${input.email} is already registered`);
        throw new Error('Email already registered');
      }

      const normalizedPhone = normalizePhone(input.phone ?? input.mobile);
      if (normalizedPhone) {
        const existingPhoneProfile = await prisma.profiles.findFirst({ where: { phone: normalizedPhone } });
        if (existingPhoneProfile) {
          logger.warn('[AuthService] Registration failed: phone number already in use');
          throw new Error('Phone number already in use');
        }
      }

      // Hash OUTSIDE the transaction — bcrypt is CPU-bound; never hold a DB
      // transaction open while hashing.
      const hashedPassword = await bcrypt.hash(input.password, 12);

      // Never trust a client role — privileged roles are granted by the backend.
      const role = input.role === 'advisor' ? 'advisor' : 'user';
      const isApproved = role === 'user'; // advisors require explicit admin approval

      // Currency/locale derived from the signup country (calling code embedded in
      // the submitted phone, e.g. "+91 …" → INR / en-IN). Sensible fallback otherwise.
      const locale = deriveLocaleAndCurrency(input.phone ?? input.mobile);

      const nameParts = input.name.trim().split(/\s+/).filter(Boolean);
      const firstName = input.firstName || nameParts[0] || '';
      const lastName = input.lastName || nameParts.slice(1).join(' ') || '';
      const annualIncome = input.salary != null ? Number(input.salary) : null;
      const monthlyIncome = annualIncome != null ? Math.round(annualIncome / 12) : null;

      // ── Atomic registration ────────────────────────────────────────────────
      // User + profile + settings + default categories are ALL-OR-NOTHING. A
      // failure in any step rolls the whole transaction back — no partial users.
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: input.email, name: input.name, password: hashedPassword, role, isApproved },
        });

        // Profile is MANDATORY now (previously best-effort/swallowed). The FK
        // profiles.id → User.id is satisfied because `created` exists in this tx;
        // any failure here throws and rolls back the User insert too.
        await tx.$executeRaw`
          INSERT INTO public.profiles (
            id, email, first_name, last_name, full_name, phone,
            date_of_birth, job_type, monthly_income, annual_income, created_at, updated_at
          ) VALUES (
            ${created.id}::uuid, ${created.email}, ${firstName || null}, ${lastName || null},
            ${created.name}, ${normalizedPhone},
            ${input.dateOfBirth ?? null}, ${input.jobType ?? null}, ${monthlyIncome}, ${annualIncome},
            NOW(), NOW()
          );
        `;

        // Baseline settings: currency/locale derived from country + default
        // notification preferences (stored in the existing settings JSON — no new table).
        await tx.userSettings.create({
          data: {
            userId: created.id,
            currency: locale.currency,
            language: locale.language,
            timezone: locale.timezone,
            settings: { notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES } },
          },
        });

        // Seed the curated default personal-finance categories.
        await tx.category.createMany({
          data: DEFAULT_CATEGORIES.map((c) => ({
            userId: created.id, name: c.name, type: c.type, color: c.color, icon: c.icon,
          })),
        });

        return created;
      });

      logger.info(`[AuthService] Registered atomically (user+profile+settings+categories): ${user.id}`);

      // Post-commit, best-effort: link any pending collaboration invitations.
      // Intentionally OUTSIDE the transaction — an invitation-link failure must
      // never roll back an otherwise-valid registration.
      try {
        const { linkPendingInvitationsForUser } = await import('../collaboration/invitation.service');
        await linkPendingInvitationsForUser(user.id, user.email);
      } catch (linkError: any) {
        logger.warn('[AuthService] Non-blocking pending-invitation link failed', { message: linkError.message });
      }

      return generateTokens(user);
    } catch (error) {
      logger.error('[AuthService] Registration error:', error);
      throw error;
    }
  }

  async updateProfile(userId: string, data: any, email?: string): Promise<any> {
    // Log only the field NAMES being updated — never the values (PII hygiene).
    logger.info(`[AuthService] Processing profile update for userId: ${userId}. Fields: ${Object.keys(data || {}).join(', ')}`);

    // Fetch existing records for merging
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    const existingProfile = await prisma.profiles.findUnique({ where: { id: userId } });

    // Perform a field-by-field merge of incoming data with existing DB state
    // `profiles` is the single source of truth for PII. Fall back to the
    // existing profiles row (not User) when a field is omitted from the update.
    const merged = {
      firstName: data.firstName !== undefined ? data.firstName : (existingProfile?.first_name ?? null),
      lastName: data.lastName !== undefined ? data.lastName : (existingProfile?.last_name ?? null),
      gender: data.gender !== undefined ? data.gender : (existingProfile?.gender ?? null),
      country: data.country !== undefined ? data.country : (existingProfile?.country ?? null),
      state: data.state !== undefined ? data.state : (existingProfile?.state ?? null),
      city: data.city !== undefined ? data.city : (existingProfile?.city ?? null),
      avatarId: data.avatarId !== undefined ? data.avatarId : (existingProfile?.avatar_id ?? null),
      avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : (existingProfile?.avatar_url ?? null),
      jobType: data.jobType !== undefined ? data.jobType : (existingProfile?.job_type ?? null),
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
      } else {
        monthlyIncomeVal = null;
      }
    }

    // Defensive clamp: `User.salary` is Decimal(12, 2) (max 9,999,999,999.99).
    // Without this, an oversized salary overflows the column and Prisma throws,
    // returning a 500 during onboarding. Clamp the monthly figure so the derived
    // annual value (monthly * 12) always fits the column. Negative/NaN -> null.
    const MAX_ANNUAL_INCOME = 1_000_000_000; // 1 billion / year
    const MAX_MONTHLY_INCOME = Math.floor(MAX_ANNUAL_INCOME / 12);
    if (monthlyIncomeVal !== null && monthlyIncomeVal !== undefined) {
      const n = Number(monthlyIncomeVal);
      if (!Number.isFinite(n) || n < 0) {
        monthlyIncomeVal = null;
      } else {
        monthlyIncomeVal = Math.min(n, MAX_MONTHLY_INCOME);
      }
    }

    // Standardize dateOfBirth - fall back to DB if omitted (undefined)
    let dobVal = data.dateOfBirth;
    if (dobVal === undefined) {
      dobVal = existingProfile?.date_of_birth ?? null;
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

      // User holds only auth/identity now (name + email). All PII is written to
      // `profiles` by the sync below — the single source of truth.
      const user = await prisma.user.upsert({
        where: { id: userId },
        update: {
          name: `${merged.firstName || ''} ${merged.lastName || ''}`.trim() || 'User',
          updatedAt: new Date(),
        } as any,
        create: {
          id: userId,
          email: finalActiveEmail,
          name: `${merged.firstName || ''} ${merged.lastName || ''}`.trim() || 'User',
          password: 'supabase-managed-account',
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
      // Verify against the external identity provider (hidden behind AuthProvider).
      if (await authProvider.verifyCredentials(input.email, input.password)) {
        isPasswordValid = true;
        // Migrate the password to our local bcrypt hash for future logins.
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
    } else {
      isPasswordValid = await bcrypt.compare(input.password, user.password);
    }

    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Reject suspended accounts before issuing tokens (mirrors /refresh + the auth
    // middleware). The controller maps this message to 403 ACCOUNT_SUSPENDED.
    if ((user as any).status === 'suspended') {
      throw new Error('Account suspended');
    }

    // Approval (e.g. advisors) is reflected in the token claims, not blocked here.
    return generateTokens(user);
  }

  /**
   * Verify a password without issuing tokens (used by /login/challenge).
   * Returns the validity plus the account status so the caller can reject
   * suspended accounts before issuing a challenge. Passwords are always plain
   * over the (HTTPS-encrypted) wire — bcrypt is the security gate.
   */
  async verifyPasswordOnly(email: string, passwordStr: string): Promise<{ valid: boolean; status: string | null }> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { valid: false, status: null };
    }

    let isPasswordValid = false;

    if (!user.password || user.password === 'supabase-managed-account') {
      logger.info(`[AuthService] User ${email} has a Supabase-managed or unmigrated account. Authenticating via Supabase...`);
      // Verify against the external identity provider (hidden behind AuthProvider).
      if (await authProvider.verifyCredentials(email, passwordStr)) {
        isPasswordValid = true;
        // Migrate the password to our local bcrypt hash for future logins.
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
    } else {
      isPasswordValid = await bcrypt.compare(passwordStr, user.password);
    }

    return { valid: isPasswordValid, status: (user as any).status ?? null };
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

  async deleteAccount(userId: string): Promise<void> {
    logger.info(`[AuthService] Deleting account for userId: ${userId}`);

    // 1. Verify user exists before attempting deletion
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      // User might be Supabase-only (no Prisma record) — proceed to Supabase deletion
      logger.warn(`[AuthService] Prisma user not found for deletion: ${userId}`);
    }

    // 2. Delete from profiles & Prisma (cascades to all related data: transactions, accounts, etc.)
    try {
      await prisma.profiles.delete({ where: { id: userId } });
      logger.info(`[AuthService] Profiles row deleted successfully: ${userId}`);
    } catch (profileErr: any) {
      if (profileErr.code !== 'P2025') {
        logger.warn(`[AuthService] Non-fatal error deleting profiles row for user ${userId}:`, profileErr);
      }
    }

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
