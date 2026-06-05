import { randomInt } from 'crypto';
import { prisma } from '../../db/prisma';
import { audit } from '../../utils/auditLogger';
import { getRedisClient, getRedisStatus } from '../../cache/redis';

const OTP_EXPIRY_SECONDS = 5 * 60;       // 5 minutes — Redis TTL, auto-expires
const OTP_RATE_WINDOW_SECONDS = 15 * 60; // 15 minutes — rate-limit counter window
const MAX_OTP_ATTEMPTS = 5;
const MAX_RESENDS_BEFORE_RESTRICT = 3;

interface OtpResult {
  success: boolean;
  message: string;
  expiresAt?: Date;
}

/** Stored in Redis as JSON at otp:{userId} */
interface OtpRecord {
  code: string;
  attempts: number;
}

const otpCodeKey  = (userId: string) => `otp:${userId}`;
const otpRateKey  = (userId: string) => `otp:rate:${userId}`;

/** Returns the Redis client if it is healthy, otherwise null (triggers DB fallback). */
function getActiveRedis() {
  const status = getRedisStatus();
  if (status === 'disabled' || status === 'error') return null;
  return getRedisClient();
}

// ──────────────────────────────────────────────────────────────────────────────
// Redis-backed implementation (primary path)
// ──────────────────────────────────────────────────────────────────────────────

async function generateOtpRedis(userId: string): Promise<OtpResult> {
  const redis = getActiveRedis()!;

  // Rate-limit: increment a per-user counter with a 15-min sliding window.
  // INCR is atomic; on first call we set the TTL so the key auto-expires.
  const rateKey = otpRateKey(userId);
  const recentCount = await redis.incr(rateKey);
  if (recentCount === 1) {
    await redis.expire(rateKey, OTP_RATE_WINDOW_SECONDS);
  }

  if (recentCount > MAX_RESENDS_BEFORE_RESTRICT) {
    await prisma.user.update({ where: { id: userId }, data: { status: 'limited_access' } });
    audit({ event: 'otp.rate_limited', userId, meta: { recentCount } });
    return { success: false, message: 'Too many OTP requests. Account restricted.' };
  }

  const code = randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

  // Overwrite any previous OTP for this user; EX sets the TTL so it auto-expires.
  const record: OtpRecord = { code, attempts: 0 };
  await redis.set(otpCodeKey(userId), JSON.stringify(record), 'EX', OTP_EXPIRY_SECONDS);

  audit({ event: 'otp.generated', userId, meta: { expiresAt: expiresAt.toISOString() } });
  return { success: true, message: 'OTP generated', expiresAt };
}

async function verifyOtpRedis(userId: string, inputCode: string): Promise<OtpResult> {
  const redis = getActiveRedis()!;
  const key   = otpCodeKey(userId);
  const raw   = await redis.get(key);

  if (!raw) {
    return { success: false, message: 'No active OTP found. Please request a new one.' };
  }

  let record: OtpRecord;
  try {
    record = JSON.parse(raw) as OtpRecord;
  } catch {
    await redis.del(key);
    return { success: false, message: 'No active OTP found. Please request a new one.' };
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await redis.del(key);
    audit({ event: 'otp.max_attempts', userId });
    return { success: false, message: 'Too many failed attempts. Please request a new OTP.' };
  }

  if (record.code !== inputCode) {
    // Increment attempt counter while preserving the remaining TTL
    record.attempts += 1;
    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      await redis.set(key, JSON.stringify(record), 'EX', ttl);
    } else {
      await redis.del(key); // Key expired between GET and TTL; treat as expired
    }
    audit({ event: 'otp.invalid', userId, meta: { attempts: record.attempts } });
    return { success: false, message: 'Invalid OTP code.' };
  }

  // Correct code — delete immediately (single-use guarantee)
  await redis.del(key);
  audit({ event: 'otp.verified', userId });
  return { success: true, message: 'OTP verified successfully.' };
}

// ──────────────────────────────────────────────────────────────────────────────
// DB-backed fallback (when Redis is unavailable)
// ──────────────────────────────────────────────────────────────────────────────

async function generateOtpDB(userId: string): Promise<OtpResult> {
  const recentCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const recentCount  = await prisma.otpCode.count({
    where: { userId, createdAt: { gte: recentCutoff } },
  });

  if (recentCount >= MAX_RESENDS_BEFORE_RESTRICT) {
    await prisma.user.update({ where: { id: userId }, data: { status: 'limited_access' } });
    audit({ event: 'otp.rate_limited', userId, meta: { recentCount } });
    return { success: false, message: 'Too many OTP requests. Account restricted.' };
  }

  await prisma.otpCode.updateMany({ where: { userId, used: false }, data: { used: true } });

  const code      = randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

  await prisma.otpCode.create({
    data: { userId, code, expiresAt },
  });

  audit({ event: 'otp.generated', userId, meta: { expiresAt: expiresAt.toISOString() } });
  return { success: true, message: 'OTP generated', expiresAt };
}

async function verifyOtpDB(userId: string, inputCode: string): Promise<OtpResult> {
  const otp = await prisma.otpCode.findFirst({
    where: { userId, used: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    return { success: false, message: 'No active OTP found. Please request a new one.' };
  }

  if (otp.expiresAt < new Date()) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    audit({ event: 'otp.expired', userId });
    return { success: false, message: 'OTP expired. Please request a new one.' };
  }

  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    audit({ event: 'otp.max_attempts', userId });
    return { success: false, message: 'Too many failed attempts. Please request a new OTP.' };
  }

  if (otp.code !== inputCode) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: otp.attempts + 1 } });
    audit({ event: 'otp.invalid', userId, meta: { attempts: otp.attempts + 1 } });
    return { success: false, message: 'Invalid OTP code.' };
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
  audit({ event: 'otp.verified', userId });
  return { success: true, message: 'OTP verified successfully.' };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API — delegates to Redis or DB based on availability
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generate a 6-digit OTP for a user.
 * Primary store: Redis (auto-expires after 5 min, no cleanup needed).
 * Fallback: Postgres (when Redis is unavailable).
 */
export async function generateOtp(userId: string): Promise<OtpResult> {
  return getActiveRedis() ? generateOtpRedis(userId) : generateOtpDB(userId);
}

/**
 * Verify an OTP code for a user.
 * Matches the store used by generateOtp (Redis → DB fallback).
 */
export async function verifyOtp(userId: string, inputCode: string): Promise<OtpResult> {
  return getActiveRedis() ? verifyOtpRedis(userId, inputCode) : verifyOtpDB(userId, inputCode);
}
