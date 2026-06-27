// PWA Registration and Setup
import { toast } from 'sonner';

let hasReloadedForServiceWorkerUpdate = false;

const showUpdateToast = (worker: ServiceWorker) => {
  toast.info('New version available!', {
    description: 'Update now to load the latest features and security fixes.',
    duration: Infinity,
    id: 'pwa-update-toast',
    action: {
      label: 'Update',
      onClick: () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
      },
    },
  });
};

export const registerServiceWorker = async () => {
  // Don't register service worker in development or for email confirmation flows
  const shouldSkip =
    import.meta.env.DEV ||
    window.location.search.includes('confirm-email') ||
    window.location.hash.includes('confirm-email') ||
    window.location.pathname.includes('confirm-email');

  if (shouldSkip) {
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_PWA === 'true') {
      console.info('Skipping service worker registration in development or email confirmation flow');
    }
    return null;
  }

  if ('serviceWorker' in navigator) {
    try {
      // Capture whether this page was ALREADY under a service worker's control
      // at registration time. On a first-ever visit (e.g. the first login) the
      // page loads with no controller; the new worker then skipWaiting()s and
      // clients.claim()s, firing `controllerchange` even though nothing actually
      // updated. Reloading on that initial claim cold-restarts the app mid-login
      // — wiping the in-memory access token and bouncing the user to /login.
      // We therefore only reload for a GENUINE update: a new worker taking over
      // a page that already had a controller.
      const hadActiveControllerAtRegister = !!navigator.serviceWorker.controller;

      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
      });

      console.log('Service Worker registered successfully:', registration.scope);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hasReloadedForServiceWorkerUpdate) {
          return;
        }

        // First-load claim (no prior controller) — the page is already running
        // the latest assets, so a reload is pointless and disruptive. Skip it.
        if (!hadActiveControllerAtRegister) {
          return;
        }

        // HARDENING ROUTE GUARD: Never automatically reload if the user is on the login page
        // or during the registration/onboarding flow to avoid losing form data / active requests.
        const isAuthFlowActive =
          window.location.pathname.includes('/login') ||
          window.location.pathname.includes('/register') ||
          window.location.search.includes('confirm-email') ||
          window.location.hash.includes('confirm-email') ||
          document.getElementById('auth-flow-container') !== null;

        if (isAuthFlowActive) {
          console.warn('[PWA] Service Worker controller changed, but reload was suppressed during auth flow.');
          return;
        }

        hasReloadedForServiceWorkerUpdate = true;
        window.location.reload();
      });

      await registration.update();

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateToast(registration.waiting);
      }

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000); // Check every hour

      // Handle service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              console.log('New service worker available');
              showUpdateToast(newWorker);
            }
          });
        }
      });

      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
};

// Check if app is installed
export const isAppInstalled = (): boolean => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
};

// PWA Install Prompt
let deferredPrompt: any = null;
let installPromptListenersBound = false;

const isPwaInstallPromptSuppressed = (): boolean => {
  try {
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (!dismissed) {
      return false;
    }

    const dismissedAt = Number(dismissed);
    if (!Number.isFinite(dismissedAt)) {
      return false;
    }

    const daysSinceDismissed = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    return daysSinceDismissed < 7;
  } catch {
    return false;
  }
};

export const setupPWAInstallPrompt = () => {
  if (import.meta.env.DEV || installPromptListenersBound) {
    return;
  }

  installPromptListenersBound = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    if (isPwaInstallPromptSuppressed()) {
      deferredPrompt = null;
      return;
    }

    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    if (import.meta.env.VITE_DEBUG_PWA === 'true') {
      console.info('PWA install prompt available');
    }
    // Notify listeners that the install prompt is now available
    window.dispatchEvent(new Event('pwainstallready'));
  });

  window.addEventListener('appinstalled', () => {
    if (import.meta.env.VITE_DEBUG_PWA === 'true') {
      console.info('PWA was installed');
    }
    deferredPrompt = null;
  });
};

export const showInstallPrompt = async (): Promise<boolean> => {
  if (!deferredPrompt) {
    if (import.meta.env.VITE_DEBUG_PWA === 'true') {
      console.info('Install prompt not available');
    }
    return false;
  }

  try {
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    if (import.meta.env.VITE_DEBUG_PWA === 'true') {
      console.info(`User response to install prompt: ${outcome}`);
    }
    
    // We've used the prompt, can't use it again
    deferredPrompt = null;

    return outcome === 'accepted';
  } catch (error) {
    console.error('Error showing install prompt:', error);
    return false;
  }
};

// Check if install prompt is available
export const canInstallPWA = (): boolean => {
  return deferredPrompt !== null;
};

// Network status detection
export const setupNetworkListener = (
  onOnline: () => void,
  onOffline: () => void
) => {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
};

export const isOnline = (): boolean => {
  return navigator.onLine;
};

// App lifecycle hooks
export const setupAppLifecycle = (callbacks: {
  onVisibilityChange?: (isVisible: boolean) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) => {
  const handleVisibilityChange = () => {
    if (callbacks.onVisibilityChange) {
      callbacks.onVisibilityChange(!document.hidden);
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (callbacks.onFocus) {
    window.addEventListener('focus', callbacks.onFocus);
  }

  if (callbacks.onBlur) {
    window.addEventListener('blur', callbacks.onBlur);
  }

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (callbacks.onFocus) {
      window.removeEventListener('focus', callbacks.onFocus);
    }
    if (callbacks.onBlur) {
      window.removeEventListener('blur', callbacks.onBlur);
    }
  };
};
