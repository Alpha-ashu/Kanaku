import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

/**
 * Firebase Admin SDK Initialization
 * Used for Firebase Cloud Messaging (FCM) push notifications
 *
 * Requires environment variables:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_PRIVATE_KEY_ID
 * - FIREBASE_PRIVATE_KEY
 * - FIREBASE_CLIENT_EMAIL
 * - FIREBASE_CLIENT_ID
 * - FIREBASE_AUTH_URI
 * - FIREBASE_TOKEN_URI
 * - FIREBASE_AUTH_PROVIDER_X509_CERT_URL
 * - FIREBASE_CLIENT_X509_CERT_URL
 */

const firebaseConfig = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url:
    process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

/**
 * Initialize Firebase Admin SDK
 * Called once on application startup
 */
export function initializeFirebase() {
  if (getApps().length > 0) return;

  // No credentials configured: skip cleanly (push disabled) in dev; hard-fail in
  // production where FCM is expected. Avoids dumping a full stack trace locally.
  if (!firebaseConfig.project_id) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Firebase Admin not configured: FIREBASE_* env vars are missing.");
    }
    console.warn("⚠ Firebase Admin not configured (FIREBASE_* env vars missing) — push notifications disabled in dev.");
    return;
  }

  try {
    initializeApp({ credential: cert(firebaseConfig as any) });
    console.log("✓ Firebase Admin SDK initialized");
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
    console.warn(
      "⚠ Firebase initialization skipped (development):",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.project_id && firebaseConfig.private_key && firebaseConfig.client_email);
}

/**
 * Get Firebase Admin instance
 * Returns the messaging service for sending push notifications
 */
export function getFirebaseMessaging() {
  if (getApps().length === 0) {
    initializeFirebase();
  }
  if (getApps().length === 0) {
    throw new Error("Firebase Admin not initialized: credentials are missing or invalid.");
  }
  return getMessaging();
}

/**
 * Send push notification via Firebase Cloud Messaging
 */
export async function sendPushNotification(
  fcmToken: string,
  {
    title,
    body,
    data = {},
  }: {
    title: string;
    body: string;
    data?: { [key: string]: string };
  }
) {
  if (!isFirebaseConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[Push/DevMock] Simulated push notification to ${fcmToken.substring(0, 8)}...: "${title}" - "${body}"`);
      return "mock-message-id";
    }
    throw new Error("Firebase Admin not configured: FIREBASE_* env vars are missing.");
  }

  try {
    const messaging = getFirebaseMessaging();

    const message = {
      notification: {
        title,
        body,
      },
      data,
      token: fcmToken,
      webpush: {
        fcmOptions: {
          link: data.deepLink || "/",
        },
        notification: {
          icon: "/icon-192x192.png",
          badge: "/badge-72x72.png",
          tag: "KANAKU-notification",
          requireInteraction: false,
        },
      },
      android: {
        priority: data.priority === "high" ? "high" : "normal",
        notification: {
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
          channelId: "KANAKU_notifications",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await messaging.send(message as any);
    console.log("Push notification sent:", response);
    return response;
  } catch (error) {
    console.error("Error sending push notification:", error);
    throw error;
  }
}

/**
 * Send multicast push notifications to multiple devices
 */
export async function sendMulticastPushNotifications(
  fcmTokens: string[],
  {
    title,
    body,
    data = {},
  }: {
    title: string;
    body: string;
    data?: { [key: string]: string };
  }
) {
  try {
    const messaging = getFirebaseMessaging();

    const message = {
      notification: {
        title,
        body,
      },
      data,
      webpush: {
        fcmOptions: {
          link: data.deepLink || "/",
        },
      },
      android: {
        priority: data.priority === "high" ? "high" : "normal",
      },
    };

    const response = await messaging.sendEachForMulticast({
      ...message,
      tokens: fcmTokens,
    } as any);

    console.log(
      `Multicast notification sent: ${response.successCount} succeeded, ${response.failureCount} failed`
    );
    return response;
  } catch (error) {
    console.error("Error sending multicast push notifications:", error);
    throw error;
  }
}

export default {
  initializeFirebase,
  getFirebaseMessaging,
  sendPushNotification,
  sendMulticastPushNotifications,
};
