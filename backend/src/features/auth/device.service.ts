import { randomUUID } from 'crypto';
import { prisma } from '../../db/prisma';
import { audit } from '../../utils/auditLogger';

export interface DeviceCheckResult {
  isKnown: boolean;
  isTrusted: boolean;
  deviceId: string;
  requiresOtp: boolean;
}

/**
 * Check whether a device is known and trusted for a user.
 * Returns whether OTP verification is required.
 */
export async function checkDeviceTrust(userId: string, deviceId: string): Promise<DeviceCheckResult> {
  if (!deviceId) {
    return { isKnown: false, isTrusted: false, deviceId: '', requiresOtp: true };
  }

  const device = await prisma.device.findUnique({
    where: { deviceId },
  });

  if (!device || device.userId !== userId) {
    return { isKnown: false, isTrusted: false, deviceId, requiresOtp: true };
  }

  return {
    isKnown: true,
    isTrusted: device.isTrusted,
    deviceId,
    requiresOtp: !device.isTrusted,
  };
}

/**
 * Trust a device after successful OTP verification.
 */
export async function trustDevice(userId: string, deviceId: string, deviceInfo?: {
  deviceName?: string;
  deviceType?: string;
  platform?: string;
  appVersion?: string;
}): Promise<void> {
  const existing = await prisma.device.findUnique({ where: { deviceId } });

  if (existing) {
    if (existing.userId !== userId) {
      throw new Error('DEVICE_ID_CONFLICT');
    }

    await prisma.device.update({
      where: { deviceId },
      data: {
        isTrusted: true,
        isActive: true,
        lastSeenAt: new Date(),
        ...(deviceInfo?.deviceName && { deviceName: deviceInfo.deviceName }),
        ...(deviceInfo?.platform && { platform: deviceInfo.platform }),
        ...(deviceInfo?.appVersion && { appVersion: deviceInfo.appVersion }),
      },
    });
  } else {
    await prisma.device.create({
      data: {
        id: randomUUID(),
        userId,
        deviceId,
        isTrusted: true,
        isActive: true,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
        ...(deviceInfo?.deviceName ? { deviceName: deviceInfo.deviceName } : {}),
        ...(deviceInfo?.deviceType ? { deviceType: deviceInfo.deviceType } : {}),
        ...(deviceInfo?.platform ? { platform: deviceInfo.platform } : {}),
        ...(deviceInfo?.appVersion ? { appVersion: deviceInfo.appVersion } : {}),
      },
    });
  }

  audit({ event: 'device.trusted', userId, meta: { deviceId } });
}

/**
 * Revoke trust for a device.
 */
export async function revokeDeviceTrust(userId: string, deviceId: string): Promise<void> {
  await prisma.device.updateMany({
    where: { deviceId, userId },
    data: { isTrusted: false },
  });
  audit({ event: 'device.revoked', userId, meta: { deviceId } });
}

/**
 * List all devices for a user.
 */
export async function listUserDevices(userId: string) {
  return prisma.device.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      deviceId: true,
      deviceName: true,
      deviceType: true,
      platform: true,
      appVersion: true,
      isTrusted: true,
      lastSeenAt: true,
      createdAt: true,
    },
    orderBy: { lastSeenAt: 'desc' },
  });
}
