const CACHE_NAME = 'lingo-map-v75';

const PRECACHE_URLS = [
  '/assets/placeholder/grass.png',
  '/assets/placeholder/path.png',
  '/assets/placeholder/player-down.png',
  '/assets/placeholder/player-up.png',
  '/assets/placeholder/player-left.png',
  '/assets/placeholder/player-right.png',
  '/assets/placeholder/tree.png',
  '/assets/placeholder/rock.png',
  '/assets/placeholder/house-base.png',
  '/assets/placeholder/house-roof.png',
  '/assets/placeholder/npc.png',
  '/assets/placeholder/floor.png',
  '/assets/placeholder/wall.png',
  '/assets/placeholder/furniture.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses for offline use
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — fall back to cache
        return caches.match(event.request).then((cached) =>
          cached || new Response('Offline', { status: 503 })
        );
      })
  );
});
