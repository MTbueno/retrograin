// public/sw.js
self.addEventListener('install', (event) => {
  // console.log('Service Worker: Installing...');
});

self.addEventListener('activate', (event) => {
  // console.log('Service Worker: Activating...');
});

self.addEventListener('fetch', (event) => {
  // console.log('Service Worker: Fetching ', event.request.url);
  // This is a basic service worker. For offline capabilities,
  // you would need to implement caching strategies here.
});
