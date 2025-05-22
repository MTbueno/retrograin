// Service Worker for RetroGrain PWA

const CACHE_NAME = 'retrograin-cache-v1.2'; // Increment version to force update
const APP_SHELL_FILES = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  // Add paths to your main JS/CSS bundles if you know them and want to pre-cache
  // e.g., '/_next/static/css/main.css', '/_next/static/chunks/main.js'
  // Add paths to critical icons for PWA (e.g., '/icons/icon-192x192.png')
];

// Install event: Cache the app shell
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell:', APP_SHELL_FILES);
        return cache.addAll(APP_SHELL_FILES);
      })
      .then(() => {
        console.log('[Service Worker] App shell cached successfully');
        return self.skipWaiting(); // Force the waiting service worker to become the active service worker
      })
      .catch((error) => {
        console.error('[Service Worker] Caching app shell failed:', error);
      })
  );
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim(); // Take control of all open clients
    })
  );
});

// Fetch event: Serve from cache first, then network
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests and requests to http/https protocols
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    // For non-GET requests or non-http/s requests, just pass through to the network
    // event.respondWith(fetch(event.request)); // This line can cause issues if not handled carefully for all types
    return; // Let the browser handle it
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // console.log('[Service Worker] Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // console.log('[Service Worker] Fetching from network:', event.request.url);
        return fetch(event.request).then((networkResponse) => {
          // Check if we received a valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // IMPORTANT: Clone the response. A response is a stream
          // and because we want the browser to consume the response
          // as well as the cache consuming the response, we need
          // to clone it so we have two streams.
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              // console.log('[Service Worker] Caching new resource:', event.request.url);
              cache.put(event.request, responseToCache);
            });

          return networkResponse;
        }).catch((error) => {
          console.error('[Service Worker] Fetching from network failed:', error, event.request.url);
          // Optionally, you could return a custom offline page here if appropriate
          // For example: return caches.match('/offline.html');
          // For now, just re-throw the error if it's a critical resource for the app shell that wasn't cached.
          // Or simply let the browser handle the failed fetch.
        });
      })
  );
});
