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

/**
 * SECURITY — everything below treats a deep link as untrusted input.
 *
 * The manifest registers `kanaku://` with BROWSABLE, which means ANY web page can
 * navigate the user's browser to `kanaku://<anything>?<anything>=<anything>` and
 * this module will be handed the result. Previously every query parameter was
 * written verbatim into `localStorage` under `deepLink_<key>`, so a hostile page
 * could seed arbitrary keys that destination screens later read to prefill forms.
 *
 * Two allowlists close that: only known pages can be navigated to, and only known
 * parameters are persisted. Anything else is dropped with a warning rather than
 * silently honoured.
 */
const ALLOWED_PAGES = new Set<string>([
  'dashboard',
  'accounts',
  'transactions',
  'add-transaction',
  'add-account',
  'loans',
  'goals',
  'groups',
  'investments',
  'reports',
  'calendar',
  'settings',
  'notifications',
  'user-profile',
  'todo-lists',
  'budget-alerts',
  'recurring-transactions',
  'ai-insights',
  'receipt-scanner',
  'voice-input',
  'pay-emi',
  'friends',
]);

/**
 * Parameters a deep link may persist for the destination screen. Values are
 * length-capped because they end up in localStorage; ids and short tokens are all
 * these screens read.
 */
const ALLOWED_PARAMS = new Set<string>([
  'smsTransactionId',
  'transactionId',
  'accountId',
  'goalId',
  'groupId',
  'loanId',
  'investmentId',
  'listId',
  'tab',
  'notificationId',
]);

const MAX_PARAM_LENGTH = 128;

/** Keeps only allowlisted params whose values are plausible ids/short tokens. */
const sanitizeParams = (params: URLSearchParams): Array<[string, string]> => {
  const safe: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (!ALLOWED_PARAMS.has(key)) {
      console.warn(`[DeepLink] Dropped unrecognised parameter: ${key}`);
      return;
    }
    if (value.length > MAX_PARAM_LENGTH) {
      console.warn(`[DeepLink] Dropped over-long value for: ${key}`);
      return;
    }
    safe.push([key, value]);
  });
  return safe;
};

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

  // Refuse to navigate anywhere that is not a known destination. A hostile page
  // firing kanaku://<arbitrary> should be a no-op, not a route change.
  if (!ALLOWED_PAGES.has(page)) {
    console.warn(`[DeepLink] Ignored link to unknown page: ${page}`);
    return false;
  }

  for (const [key, value] of sanitizeParams(params)) {
    try {
      localStorage.setItem(`deepLink_${key}`, value);
    } catch {
      /* storage unavailable — navigation still works, just without prefill */
    }
  }

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

  // A link that launched the app can arrive twice: once through appUrlOpen (the
  // listener below attaches before getLaunchUrl() is read) and once as the launch
  // URL itself. Processing it twice re-navigates and re-writes localStorage, so
  // the same URL is only honoured once per registration.
  const handled = new Set<string>();
  const openOnce = (url: string) => {
    if (!url || handled.has(url)) return;
    handled.add(url);
    void openDeepLink(url, navigate);
  };

  try {
    handles.push(
      await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        // Cleared per event so a genuine second tap on the SAME link still works;
        // only the launch-time duplicate is suppressed.
        setTimeout(() => handled.delete(url), 1000);
        openOnce(url);
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
      openOnce(launchUrl.url);
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
