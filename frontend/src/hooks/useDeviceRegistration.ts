/**
 * Device Registration Hook
 * Handles device lifecycle management and token updates
 * Integrates with Firebase Cloud Messaging for push notifications
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { deviceManager, RegisteredDevice } from '@/lib/device-manager';

interface UseDeviceRegistrationOptions {
  autoRegister?: boolean;
  enablePushNotifications?: boolean;
  onRegistered?: (device: RegisteredDevice) => void;
  onError?: (error: Error) => void;
}

interface UseDeviceRegistrationReturn {
  device: RegisteredDevice | null;
  isRegistering: boolean;
  error: Error | null;
  hasMultipleDevices: boolean;
  otherDevices: RegisteredDevice[];
  registerDevice: () => Promise<void>;
  updateTokens: (fcmToken?: string, apnsToken?: string) => Promise<void>;
  deactivateDevice: () => Promise<void>;
  deleteDevice: () => Promise<void>;
  refreshDevices: () => Promise<void>;
}

/**
 * Hook for managing device registration and push notifications
 */
export function useDeviceRegistration(
  options: UseDeviceRegistrationOptions = {}
): UseDeviceRegistrationReturn {
  const {
    autoRegister = true,
    enablePushNotifications = true,
    onRegistered,
    onError,
  } = options;

  const [device, setDevice] = useState<RegisteredDevice | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMultipleDevices, setHasMultipleDevices] = useState(false);
  const [otherDevices, setOtherDevices] = useState<RegisteredDevice[]>([]);

  const registrationAttempted = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Request FCM token from Firebase Cloud Messaging
   */
  const requestFCMToken = useCallback(async (): Promise<string | undefined> => {
    if (!enablePushNotifications) {
      return undefined;
    }

    try {
      // Firebase Cloud Messaging is optional — only runs if the firebase package is available.
      // Dynamic imports are guarded so missing the package is non-fatal.
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const firebaseMessaging = await import('firebase/messaging' as any).catch(() => null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const firebaseApp = await import('firebase/app' as any).catch(() => null);

        if (!firebaseMessaging || !firebaseApp) {
          console.info('Firebase SDK not installed — push notifications disabled.');
          return undefined;
        }

        const { getMessaging, getToken } = firebaseMessaging;
        try {
          const msg = getMessaging();
          const token = await getToken(msg, {
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          });
          console.log('FCM token obtained:', token ? 'success' : 'failed');
          return token;
        } catch (err) {
          console.warn('FCM token request failed:', err);
          return undefined;
        }
      }
    } catch (err) {
      console.warn('Firebase Messaging not available:', err);
    }

    return undefined;
  }, [enablePushNotifications]);

  /**
   * Register device with backend
   */
  const registerDevice = useCallback(async () => {
    setIsRegistering(true);
    setError(null);

    try {
      const fcmToken = await requestFCMToken();

      const registeredDevice = await deviceManager.registerDevice(fcmToken);

      setDevice(registeredDevice);
      onRegistered?.(registeredDevice);

      // Start sync keep-alive timer
      if (!syncIntervalRef.current) {
        syncIntervalRef.current = setInterval(() => {
          deviceManager.updateSyncTimestamp().catch((err) => {
            console.warn('Sync timestamp update failed:', err);
          });
        }, 5 * 60 * 1000); // Every 5 minutes
      }

      // Check for multiple devices
      const multiple = await deviceManager.hasMultipleDevices();
      setHasMultipleDevices(multiple);

      if (multiple) {
        const others = await deviceManager.getOtherActiveDevices();
        setOtherDevices(others);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      console.error('Device registration failed:', error);
    } finally {
      setIsRegistering(false);
    }
  }, [requestFCMToken, onRegistered, onError]);

  /**
   * Update push notification tokens
   */
  const updateTokens = useCallback(
    async (fcmToken?: string, apnsToken?: string) => {
      try {
        const updated = await deviceManager.updateNotificationTokens(fcmToken, apnsToken);
        if (updated) {
          setDevice(updated);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);
      }
    },
    [onError]
  );

  /**
   * Deactivate device
   */
  const deactivateDevice = useCallback(async () => {
    try {
      await deviceManager.deactivateDevice();
      setDevice(null);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    }
  }, [onError]);

  /**
   * Delete device
   */
  const deleteDevice = useCallback(async () => {
    try {
      await deviceManager.deleteDevice();
      setDevice(null);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    }
  }, [onError]);

  /**
   * Refresh devices list
   */
  const refreshDevices = useCallback(async () => {
    try {
      const multiple = await deviceManager.hasMultipleDevices();
      setHasMultipleDevices(multiple);

      if (multiple) {
        const others = await deviceManager.getOtherActiveDevices();
        setOtherDevices(others);
      }
    } catch (err) {
      console.warn('Failed to refresh devices:', err);
    }
  }, []);

  /**
   * Auto-register on mount
   */
  useEffect(() => {
    if (!autoRegister || registrationAttempted.current) {
      return;
    }

    registrationAttempted.current = true;

    // Check if user is authenticated before registering
    const isAuthenticated = (() => {
      try {
        const sbKey = Object.keys(localStorage).find(
          (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
        );
        return sbKey !== undefined;
      } catch {
        return false;
      }
    })();

    if (isAuthenticated) {
      registerDevice();
    }
  }, [autoRegister, registerDevice]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  return {
    device,
    isRegistering,
    error,
    hasMultipleDevices,
    otherDevices,
    registerDevice,
    updateTokens,
    deactivateDevice,
    deleteDevice,
    refreshDevices,
  };
}

export type { RegisteredDevice };
