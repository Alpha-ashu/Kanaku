// PWA service worker registration (using native approach)
declare global {
  interface Window {
    __pwaInstallManager: PWAInstallManager;
  }
}

// Mock registerSW for development
function registerSW(config: any) {
  // In production, this would be provided by Vite PWA plugin
  console.log('Service worker registration config:', config);
  return () => { }; // Mock update function
}

// PWA configuration for production
export const PWA_CONFIG = {
  // Update strategy
  UPDATE_STRATEGY: 'auto', // 'auto' | 'prompt' | 'none'

  // Installation prompt
  INSTALL_PROMPT_DELAY: 5000, // 5 seconds

  // Update checking
  UPDATE_CHECK_INTERVAL: 60000, // 1 minute

  // Offline handling
  OFFLINE_RETRY_ATTEMPTS: 3,
  OFFLINE_RETRY_DELAY: 2000
};

// PWA service worker registration
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    // Register service worker
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        // Show update notification
        showUpdateNotification();
      },
      onOfflineReady: () => {
        console.log('App is ready for offline use');
      },
      onRegisterError: (error: any) => {
        console.error('Service worker registration failed:', error);
      }
    });

    // Check for updates periodically
    setInterval(() => {
      updateSW();
    }, PWA_CONFIG.UPDATE_CHECK_INTERVAL);
  }
}

// Update notification
function showUpdateNotification(): void {
  // Create custom update notification
  const notification = document.createElement('div');
  notification.className = 'pwa-update-notification';
  notification.innerHTML = `
    <div class="pwa-update-content">
      <span>New version available!</span>
      <div class="pwa-update-actions">
        <button class="pwa-update-btn" onclick="window.location.reload()">Update</button>
        <button class="pwa-update-btn pwa-update-dismiss">Later</button>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .pwa-update-notification {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .pwa-update-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .pwa-update-actions {
      display: flex;
      gap: 8px;
    }
    .pwa-update-btn {
      padding: 8px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font-size: 14px;
    }
    .pwa-update-btn:hover {
      background: #f3f4f6;
    }
    .pwa-update-dismiss {
      background: #f9fafb;
    }
  `;
  document.head.appendChild(style);

  // Add to DOM
  document.body.appendChild(notification);

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 30000);

  // Handle dismiss button
  const dismissBtn = notification.querySelector('.pwa-update-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });
  }
}

// PWA installation prompt
export class PWAInstallManager {
  private static instance: PWAInstallManager;
  private deferredPrompt: Event | null = null;

  static getInstance(): PWAInstallManager {
    if (!PWAInstallManager.instance) {
      PWAInstallManager.instance = new PWAInstallManager();
    }
    return PWAInstallManager.instance;
  }

  initialize(): void {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      this.deferredPrompt = e;

      // Show custom install button or prompt
      this.showInstallPrompt();
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      console.log('PWA was installed');
    });
  }

  private showInstallPrompt(): void {
    // Create install prompt
    const prompt = document.createElement('div');
    prompt.className = 'pwa-install-prompt';
    prompt.innerHTML = `
      <div class="pwa-install-content">
        <span>Install KANAKU App</span>
        <div class="pwa-install-actions">
          <button class="pwa-install-btn" onclick="window.__pwaInstallManager.install()">Install</button>
          <button class="pwa-install-btn pwa-install-dismiss">Not Now</button>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .pwa-install-prompt {
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .pwa-install-content {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .pwa-install-actions {
        display: flex;
        gap: 8px;
      }
      .pwa-install-btn {
        padding: 8px 16px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
        font-size: 14px;
      }
      .pwa-install-btn:hover {
        background: #f3f4f6;
      }
      .pwa-install-dismiss {
        background: #f9fafb;
      }
    `;
    document.head.appendChild(style);

    // Add to DOM
    document.body.appendChild(prompt);

    // Auto-dismiss after 60 seconds
    setTimeout(() => {
      if (prompt.parentNode) {
        prompt.parentNode.removeChild(prompt);
      }
    }, 60000);

    // Handle dismiss button
    const dismissBtn = prompt.querySelector('.pwa-install-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        if (prompt.parentNode) {
          prompt.parentNode.removeChild(prompt);
        }
      });
    }
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) return;

    // Show the install prompt
    const promptEvent = this.deferredPrompt as any;
    promptEvent.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await promptEvent.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    this.deferredPrompt = null;
  }
}

// Offline handling
export class OfflineManager {
  private static instance: OfflineManager;
  private isOnline: boolean = navigator.onLine;
  private retryQueue: Array<() => Promise<any>> = [];

  static getInstance(): OfflineManager {
    if (!OfflineManager.instance) {
      OfflineManager.instance = new OfflineManager();
    }
    return OfflineManager.instance;
  }

  initialize(): void {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('Back online');
      this.processRetryQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('Offline');
    });
  }

  async withOfflineHandling<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.isOnline) {
      // Queue the operation for when we're back online
      return new Promise((resolve, reject) => {
        this.retryQueue.push(async () => {
          try {
            const result = await operation();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    try {
      return await operation();
    } catch (error) {
      // If it's a network error, queue for retry
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return this.queueForRetry(operation);
      }
      throw error;
    }
  }

  private async queueForRetry<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.retryQueue.push(async () => {
        let attempts = 0;
        while (attempts < PWA_CONFIG.OFFLINE_RETRY_ATTEMPTS) {
          try {
            if (this.isOnline) {
              const result = await operation();
              resolve(result);
              return;
            }
          } catch (error) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, PWA_CONFIG.OFFLINE_RETRY_DELAY * Math.pow(2, attempts)));
          }
        }
        reject(new Error('Max retry attempts exceeded'));
      });
    });
  }

  private async processRetryQueue(): Promise<void> {
    const queue = [...this.retryQueue];
    this.retryQueue = [];

    for (const operation of queue) {
      try {
        await operation();
      } catch (error) {
        console.error('Failed to retry operation:', error);
      }
    }
  }
}

// PWA performance optimization
export class PWAOptimizer {
  static optimizeForPWA(): void {
    // Optimize for mobile devices
    if (window.matchMedia('(max-width: 768px)').matches) {
      // Reduce animations on mobile
      document.body.classList.add('mobile-optimized');

      // Optimize touch interactions
      document.body.style.touchAction = 'manipulation';
    }

    // Optimize for installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      document.body.classList.add('pwa-standalone');
    }

    // Preload critical resources for PWA
    this.preloadPWACriticalResources();
  }

  private static preloadPWACriticalResources(): void {
    const criticalResources = [
      '/manifest.json',
      '/service-worker.js',
      '/icons/icon-192x192.png',
      '/icons/icon-512x512.png'
    ];

    criticalResources.forEach(src => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = src;
      if (src.endsWith('.png')) {
        link.as = 'image';
      } else if (src.endsWith('.js')) {
        link.as = 'script';
      } else {
        link.as = 'fetch';
      }
      document.head.appendChild(link);
    });
  }
}

// Initialize PWA features
export function initializePWAFeatures(): void {
  // Register service worker
  registerServiceWorker();

  // Initialize PWA install manager
  const installManager = PWAInstallManager.getInstance();
  installManager.initialize();
  window.__pwaInstallManager = installManager;

  // Initialize offline manager
  const offlineManager = OfflineManager.getInstance();
  offlineManager.initialize();

  // Optimize for PWA
  PWAOptimizer.optimizeForPWA();

  // Set up periodic health checks
  setInterval(() => {
    checkPWAHealth();
  }, 5 * 60 * 1000); // Every 5 minutes
}

// PWA health check
function checkPWAHealth(): void {
  // Check service worker status
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      const activeSW = registrations.find(r => r.active);
      if (!activeSW) {
        console.warn('Service worker not active');
        registerServiceWorker();
      }
    });
  }

  // Check manifest
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (!manifestLink) {
    console.warn('Manifest not found');
  }

  // Check critical icons
  const criticalIcons = ['/icons/icon-192x192.png', '/icons/icon-512x512.png'];
  criticalIcons.forEach(icon => {
    const img = new Image();
    img.onload = () => console.log(`Icon ${icon} loaded successfully`);
    img.onerror = () => console.warn(`Icon ${icon} failed to load`);
    img.src = icon;
  });
}
