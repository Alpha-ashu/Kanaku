import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

const GLOBAL_ID = 'global';

/**
 * Platform-wide admin configuration (feature flags, AI feature flags, AI
 * configurations) lives in one singleton row, independent of which admin
 * user accounts exist. Do not key this off `User.role === 'admin'` — that
 * pattern is what caused admin settings to silently reset whenever the set
 * of admin accounts changed (see PlatformSettings model comment).
 */
export async function getPlatformSettings(): Promise<Record<string, any>> {
  try {
    const row = await prisma.platformSettings.findUnique({ where: { id: GLOBAL_ID } });
    if (!row?.settings) return {};
    return typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings as any);
  } catch (error) {
    logger.error('Failed to load platform settings', { error });
    return {};
  }
}

export async function updatePlatformSettings(patch: Record<string, any>): Promise<Record<string, any>> {
  const current = await getPlatformSettings();
  const next = { ...current, ...patch };
  await prisma.platformSettings.upsert({
    where: { id: GLOBAL_ID },
    create: { id: GLOBAL_ID, settings: next },
    update: { settings: next },
  });
  return next;
}
