/**
 * Push notification registration (Android/iOS).
 *
 * The backend half of push was already complete before this file existed:
 * `Device.fcmToken`/`apnsToken` columns, `PUT /devices/:deviceId/tokens`, a
 * notification outbox with a `push` channel, an FCM sender behind Firebase Admin,
 * retry/backoff, and dead-token cleanup (backend/src/workers/index.ts).
 *
 * What was missing was the client end: nothing ever registered for push, so no
 * device ever had a token and every queued push resolved to `no_device`. This
 * module closes that loop:
 *
 *   permission → APNs/FCM registration → token
 *     → POST /devices            (register/refresh this device)
 *     → PUT  /devices/:id/tokens (attach the push token)
 *     → tap  → lib/nativeDeepLinks (same routing as local notifications)
 *
 * Delivery still requires `google-services.json` (Android) and an APNs key
 * (iOS) plus `FIREBASE_*` env vars on the server. Without them registration fails
 * gracefully and the app is unaffected — see docs/release/MOBILE_RELEASE_GUIDE.md.
 */

import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiClient } from '@/lib/api';
import { createNotificationRecord } from '@/lib/notifications';
import { openDeepLink, type NavigateToPage } from '@/lib/nativeDeepLinks';

const DEVICE_ID_KEY = 'device_id';
/** Remembers the last token we successfully synced, to avoid redundant PUTs. */
const SYNCED_TOKEN_KEY = 'KANAKU_push_token_synced';

let listenerHandles: PluginListenerHandle[] = [];
let initialised = false;

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Stable per-install id. Shared with the socket client, which already uses this key. */
const getDeviceId = (): string => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

/**
 * Registers this device with the backend and attaches the push token.
 *
 * POST /devices upserts on (userId, deviceId) and already accepts the token, so
 * one call is normally enough; the follow-up PUT exists for the APNs/FCM token
 * *refresh* case, where the device row exists but the token has rotated.
 */
const syncTokenToBackend = async (token: string): Promise<void> => {
  const deviceId = getDeviceId();
  const platform = Capacitor.getPlatform();

  // iOS hands back an APNs token; Android an FCM registration token. The backend
  // stores them in separate columns and the sender picks the right transport.
  const tokenField = platform === 'ios' ? 'apnsToken' : 'fcmToken';

  try {
    const info = await Device.getInfo();

    await apiClient.post(
      '/devices',
      {
        deviceId,
        deviceName: info.name || `${info.manufacturer ?? ''} ${info.model ?? ''}`.trim() || 'Mobile device',
        deviceType: info.model?.toLowerCase().includes('ipad') ? 'tablet' : 'mobile',
        osType: info.operatingSystem || platform,
        osVersion: info.osVersion,
        [tokenField]: token,
      },
      { showErrorToast: false },
    );

    // Covers token rotation on an already-registered device.
    await apiClient.put(
      `/devices/${encodeURIComponent(deviceId)}/tokens`,
      { [tokenField]: token },
      { showErrorToast: false },
    );

    localStorage.setItem(SYNCED_TOKEN_KEY, token);
    console.info('[Push] Device registered and token synced.');
  } catch (error) {
    // Never surface this to the user — push is an enhancement, and in-app plus
    // local notifications keep working regardless.
    console.info(
      '[Push] Token sync skipped:',
      error instanceof Error ? error.message : String(error),
    );
  }
};

const removeListeners = async () => {
  await Promise.all(listenerHandles.map((handle) => handle.remove().catch(() => undefined)));
  listenerHandles = [];
};

/**
 * Requests permission and registers for push. Call only AFTER PIN unlock —
 * registration ties a push token to an authenticated user, and the payloads that
 * come back reference that user's data.
 *
 * Safe to call repeatedly; only the first call per session does work.
 */
export const initializePushNotifications = async (navigate: NavigateToPage): Promise<void> => {
  if (!isNative() || initialised) return;
  initialised = true;

  try {
    // Do not prompt if the user already said no — iOS never re-prompts anyway, and
    // on Android re-asking every launch is hostile.
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }

    if (permission.receive !== 'granted') {
      // Stay "initialised" so we do not re-check on every unlock. iOS never
      // re-prompts once refused, and on Android checkPermissions would just keep
      // returning 'denied'. A fresh launch resets this module, and signing out calls
      // teardown — both give the user a natural retry after granting in Settings.
      console.info('[Push] Permission not granted; push disabled for this device.');
      return;
    }

    await removeListeners();

    listenerHandles.push(
      await PushNotifications.addListener('registration', (token) => {
        // Fires on first registration and on every token rotation.
        if (token.value && token.value !== localStorage.getItem(SYNCED_TOKEN_KEY)) {
          void syncTokenToBackend(token.value);
        }
      }),
    );

    listenerHandles.push(
      await PushNotifications.addListener('registrationError', (error) => {
        // Typically a missing google-services.json or APNs entitlement.
        console.warn('[Push] Registration failed:', error.error);
      }),
    );

    // Delivered while the app is in the foreground. The OS does not draw a banner
    // in that case, so mirror it into the in-app notification centre instead —
    // otherwise a foreground push is invisible.
    listenerHandles.push(
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const deepLink = (notification.data as Record<string, string> | undefined)?.deepLink;
        void createNotificationRecord({
          type: 'message',
          title: notification.title || 'KANAKU',
          message: notification.body || '',
          deepLink: deepLink || undefined,
        });
      }),
    );

    // The user tapped the notification — route exactly like a local one.
    listenerHandles.push(
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const deepLink = (action.notification.data as Record<string, string> | undefined)?.deepLink;
        if (deepLink) void openDeepLink(deepLink, navigate);
      }),
    );

    await PushNotifications.register();
  } catch (error) {
    initialised = false;
    console.info(
      '[Push] Initialisation skipped:',
      error instanceof Error ? error.message : String(error),
    );
  }
};

/**
 * Tears down push for this device. Called on sign-out so a subsequent user on the
 * same device does not receive the previous user's notifications.
 */
export const teardownPushNotifications = async (): Promise<void> => {
  initialised = false;
  localStorage.removeItem(SYNCED_TOKEN_KEY);

  if (!isNative()) return;

  await removeListeners();

  try {
    // Detach the token server-side so the outbox stops targeting this device.
    const deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (deviceId) {
      await apiClient.post(
        `/devices/${encodeURIComponent(deviceId)}/deactivate`,
        undefined,
        { showErrorToast: false },
      );
    }
  } catch {
    /* best effort — the server also prunes tokens that FCM reports as dead */
  }

  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    /* ignore */
  }
};
