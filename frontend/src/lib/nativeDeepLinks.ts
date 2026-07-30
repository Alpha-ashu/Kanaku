/**
 * Native deep-link routing (Android + iOS).
 *
 * The app already has a deep-link convention on the web side: a notification
 * carries `deepLink: "/add-transaction?smsTransactionId=12"`, the handler routes
 * to the page and drops each query param into `localStorage` under
 * `deepLink_<key>` for the destination screen to pick up (see Header.tsx and
 * Notifications.tsx).
 *
 * On device that convention was unreachable. Nothing listened for `appUrlOpen`,
 * and nothing listened for `localNotificationActionPerformed`, so tapping a
 * system notification only raised the app to whatever screen it was last on —
 * the SMS "New Transaction Detected" alert in particular dead-ended. This module
 * is the missing half: it feeds native entry points into the same convention.
 *
 * Accepted forms:
 *   kanaku://add-transaction?smsTransactionId=12   custom scheme (manifest + Info.plist)
 *   https://<host>/add-transaction?...             https link into the app
 *   /add-transaction?smsTransactionId=12           raw notification payload
 *   kanaku://sms-transaction?sourceSmsId=<id>      native SMS notification; the
 *                                                  Android side only knows the
 *                                                  platform SMS id, so it is
 *                                                  resolved to the local record here.
 */

import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from '@/lib/database';

export type NavigateToPage = (page: string) => void;

/** Route that carries a platform SMS id instead of a local record id. */
const SMS_TRANSACTION_ROUTE = 'sms-transaction';
const SMS_TRANSACTION_TARGET_PAGE = 'add-transaction';

interface ParsedDeepLink {
  page: string;
  params: URLSearchParams;
}

const parseDeepLink = (raw: string): ParsedDeepLink | null => {
  const value = (raw || '').trim();
  if (!value) return null;

  let path = value;
  let query = '';

  // Strip a scheme+authority when present. `kanaku://add-transaction?x=1` puts
  // "add-transaction" in the host, while `https://app.example/add-transaction`
  // puts it in the pathname — URL parsing normalises both.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    const fromPath = url.pathname.replace(/^\/+/, '');
    path = fromPath || url.hostname;
    query = url.search.replace(/^\?/, '');
  } else {
    const [rawPath, rawQuery = ''] = value.split('?');
    path = rawPath;
    query = rawQuery;
  }

  const page = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!page) return null;

  return { page, params: new URLSearchParams(query) };
};

/**
 * Resolves `sourceSmsId` (the platform's SMS row id, the only identifier the
 * Android notification has) to the local Dexie record id the add-transaction
 * screen expects.
 */
const resolveSmsTransactionId = async (sourceSmsId: string): Promise<number | null> => {
  try {
    const record = await db.smsTransactions.where('sourceSmsId').equals(sourceSmsId).first();
    return record?.id ?? null;
  } catch (error) {
    console.warn('[DeepLink] Could not resolve sourceSmsId:', error);
    return null;
  }
};

/**
 * Applies a deep link: stores its params where the destination screen reads them,
 * then navigates. Returns false when the link could not be understood, so callers
 * can leave the user where they are rather than bouncing them somewhere wrong.
 */
export const openDeepLink = async (raw: string, navigate: NavigateToPage): Promise<boolean> => {
  const parsed = parseDeepLink(raw);
  if (!parsed) return false;

  let { page } = parsed;
  const { params } = parsed;

  if (page === SMS_TRANSACTION_ROUTE) {
    const sourceSmsId = params.get('sourceSmsId');
    const smsTransactionId = sourceSmsId ? await resolveSmsTransactionId(sourceSmsId) : null;

    // The record is written by the JS layer when it drains the native queue. If
    // the user taps the notification before that has happened there is nothing to
    // prefill, so open the blank add-transaction form rather than a broken one.
    if (smsTransactionId !== null) {
      params.set('smsTransactionId', String(smsTransactionId));
    }
    params.delete('sourceSmsId');
    page = SMS_TRANSACTION_TARGET_PAGE;
  }

  params.forEach((value, key) => {
    try {
      localStorage.setItem(`deepLink_${key}`, value);
    } catch {
      /* storage unavailable — navigation still works, just without prefill */
    }
  });

  navigate(page);
  return true;
};

/**
 * Wires every native entry point into {@link openDeepLink}. Safe to call on web,
 * where it is a no-op. Returns a cleanup function that removes the listeners.
 */
export const registerNativeDeepLinks = async (navigate: NavigateToPage): Promise<() => void> => {
  if (!Capacitor.isNativePlatform()) {
    return () => undefined;
  }

  const handles: PluginListenerHandle[] = [];

  try {
    handles.push(
      await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        void openDeepLink(url, navigate);
      }),
    );
  } catch (error) {
    console.warn('[DeepLink] appUrlOpen listener unavailable:', error);
  }

  try {
    handles.push(
      await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        const deepLink = (notification.extra as { deepLink?: string } | undefined)?.deepLink;
        if (deepLink) void openDeepLink(deepLink, navigate);
      }),
    );
  } catch (error) {
    console.warn('[DeepLink] localNotificationActionPerformed listener unavailable:', error);
  }

  // Cold start: the app was launched *by* the link, so the event above already
  // fired before this listener existed.
  try {
    const launchUrl = await CapacitorApp.getLaunchUrl();
    if (launchUrl?.url) {
      void openDeepLink(launchUrl.url, navigate);
    }
  } catch {
    /* no launch url */
  }

  return () => {
    handles.forEach((handle) => {
      void handle.remove();
    });
  };
};
