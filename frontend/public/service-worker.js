/* eslint-disable no-restricted-globals */
// Service Worker with offline support and API response caching

const CACHE_NAME = 'financelife-v4';
const API_CACHE_NAME = 'financelife-api-v3';
const OFFLINE_URL = '/offline.html';

// Max age for cached API responses (30 minutes)
const API_CACHE_MAX_AGE = 30 * 60 * 1000;

// URLs to always cache on install
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
];

// Install event: cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE).catch(() => {
        // It's okay if some URLs fail to cache
        console.log('Some URLs failed to cache on install');
      });
    })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event: network first, fall back to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip service worker for email confirmation redirects and auth API calls
  if (request.url.includes('/confirm-email') || 
      request.url.includes('/api/v1/auth/')) {
    return;
  }

  // Stock API: network-first with cache fallback
  if (request.url.includes('/api/v1/stocks/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ status: 'error', error: 'Offline' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  const isAssetRequest = request.url.includes('/assets/');
  const isStaticDestination = ['script', 'style', 'font', 'image'].includes(request.destination);

  if (isAssetRequest || isStaticDestination) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const contentType = response.headers.get('content-type') || '';
          const isJavascript = contentType.includes('javascript');
          const isCss = contentType.includes('text/css');
          const isFont = contentType.includes('font');
          const isImage = contentType.startsWith('image/');
          const shouldCache = response && response.status === 200 && (isJavascript || isCss || isFont || isImage);

          if (shouldCache) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          } else if (isAssetRequest && contentType.includes('text/html')) {
            // Avoid caching HTML responses for asset requests (prevents MIME errors on dynamic chunks)
            console.warn('Service worker bypassed caching HTML for asset request:', request.url);
          }

          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Other API calls: network-only (no caching)
  if (request.url.includes('/api/')) {
    return;
  }

  // Skip caching for dev resources in development
  if (request.url.includes('/@vite') || 
      request.url.includes('/@react') || 
      request.url.includes('/node_modules') ||
      request.url.includes('localhost:5173')) {
    event.respondWith(
      fetch(request).catch(() => {
        // For dev resources, try to return a minimal response or let it fail gracefully
        if (request.url.includes('/@vite/client')) {
          return new Response('// Service worker disabled for Vite client', {
            headers: { 'Content-Type': 'application/javascript' }
          });
        }
        if (request.url.includes('/@react-refresh')) {
          return new Response('// Service worker disabled for React refresh', {
            headers: { 'Content-Type': 'text/plain' }
          });
        }
        return new Response('Dev resource unavailable', { status: 503 });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache successful responses
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Try to return cached response if fetch fails
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Return offline page for navigation requests
          if (request.destination === 'document' || request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          
          // For other requests, return a basic offline response
          return new Response(
            JSON.stringify({ error: 'Network request failed' }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'application/json'
              })
            }
          );
        });
      })
  );
});
