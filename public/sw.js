
// Service Worker for PWA

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // Pre-cache assets here if needed
  // event.waitUntil(self.skipWaiting()); // Optional: forces the waiting service worker to become the active service worker.
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  // Claim clients immediately so that the new service worker takes control.
  event.waitUntil(clients.claim());
  // Clean up old caches here if needed
});

// Basic fetch handler (can be expanded for caching strategies)
// For now, it just passes the request through to the network.
// self.addEventListener('fetch', (event) => {
//   // console.log('Service Worker: Fetching', event.request.url);
//   event.respondWith(fetch(event.request));
// });

    