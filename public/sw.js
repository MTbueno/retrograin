// public/sw.js
self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
  // You can add self.skipWaiting() here if you want the new service worker to activate immediately
  // event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating.');
  // You can add self.clients.claim() here to take control of open clients immediately
  // event.waitUntil(self.clients.claim());
});

// O manipulador de evento 'fetch' foi removido para depuração de problemas de autenticação.
// Se o login funcionar agora, este manipulador estava causando interferência.
// Poderemos reintroduzir um manipulador 'fetch' mais tarde com uma estratégia de cache cuidadosa.

// Exemplo de um manipulador fetch muito básico que apenas loga e passa adiante (SE FOR REABILITADO):
/*
self.addEventListener('fetch', (event) => {
  console.log('[Service Worker] Fetching:', event.request.url);
  event.respondWith(fetch(event.request));
});
*/
