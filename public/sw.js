// public/sw.js

const CACHE_NAME = 'retrograin-cache-v1'; // Incremente para novas versões de cache
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  // Adicione caminhos para seus ícones PWA principais aqui, se ainda não estiverem no manifest ou se quiser controle mais fino
  // Exemplo: '/icons/icon-192x192.png', '/icons/icon-512x512.png'
  // O Next.js lida com o cache de seus próprios chunks JS/CSS via headers HTTP,
  // então focar no app shell e manifesto é um bom começo para o SW.
];

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(error => {
      console.error('Service Worker: Failed to cache app shell:', error);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  // Remove caches antigos
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return clients.claim(); // Garante que o novo SW assuma o controle imediatamente
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Para as requisições do app shell, tente servir do cache primeiro.
  // Para outras requisições (ex: APIs, imagens não cacheadas), vá para a rede.
  const url = new URL(event.request.url);

  // Só aplicar cache-first para requisições do mesmo domínio e que sejam GET
  if (event.request.method === 'GET' && ASSETS_TO_CACHE.includes(url.pathname) && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          // console.log('Service Worker: Serving from cache:', event.request.url);
          return response;
        }
        // console.log('Service Worker: Fetching from network:', event.request.url);
        return fetch(event.request).then((networkResponse) => {
          // Opcional: clonar e colocar no cache para futuras requisições
          // if (networkResponse && networkResponse.status === 200) {
          //   const responseToCache = networkResponse.clone();
          //   caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          // }
          return networkResponse;
        });
      }).catch(error => {
        console.error('Service Worker: Error fetching from cache or network:', error, event.request.url);
        // Poderia retornar uma página offline genérica aqui, se tivesse uma
      })
    );
  } else {
    // Para todas as outras requisições, apenas siga a rede (comportamento padrão do navegador)
    // Isso evita problemas com requisições POST, APIs de terceiros, etc.
    return;
  }
});
