// Bump on every behavioural change so the activate handler purges the
// old cache. (Browsers also refetch the SW when its bytes change.)
const CACHE_NAME = 'lingo-map-v89';

// Bare-minimum precache: stuff every player needs on every map. Kept
// short so install never fails — `cache.addAll` rejects atomically on
// any 404, and a missing entry here used to wedge the SW in
// "installing" state forever, defeating the cache strategy below.
const PRECACHE_URLS = [
  '/assets/placeholder/grass.webp',
  '/assets/placeholder/path.webp',
  '/assets/placeholder/tree.webp',
  '/assets/placeholder/rock.webp',
  '/assets/placeholder/house-base.webp',
  '/assets/placeholder/house-roof.webp',
  '/assets/placeholder/npc.webp',
  '/assets/placeholder/floor.webp',
  '/assets/placeholder/wall.webp',
  '/assets/me-char-atlas.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // `addAll` is still atomic; if any URL goes missing in the future
      // it'll fail the whole install. Keep this list short and verified.
      cache.addAll(PRECACHE_URLS)
    )
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

// Strategy chooser per request — different content has different
// freshness/speed tradeoffs.
//
//   /_next/static/*    : CACHE-FIRST
//     Content-addressable: Next.js hashes the filename, so a changed
//     file means a different URL. Once cached, never go back to the
//     network unless the cache misses.
//
//   /assets/*          : STALE-WHILE-REVALIDATE
//     URLs are stable (`/assets/me-bundle/foo.png`) but the contents
//     CAN change between deploys. Cache-first would lock users on
//     stale art forever (or until a manual CACHE_NAME bump). SWR
//     serves cached instantly for snappy boot, then refetches in
//     background — next visit picks up the fresh version.
//
//   /api/* and HTML    : NETWORK-FIRST, fallback to cache
//     Editor saves the disk file, the runtime needs to see fresh
//     /api/maps and /api/car-collisions on every visit. Cache exists
//     only as an offline backstop.
//
//   everything else    : NETWORK-FIRST
//     Safer default — better to be a little slower than serve stale
//     dynamic content.
function pickStrategy(url) {
  const path = url.pathname;
  if (path.startsWith('/_next/static/')) return 'cache-first';
  if (path.startsWith('/assets/')) return 'stale-while-revalidate';
  return 'network-first';
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  // Cache miss — fetch and cache for next time.
  const response = await fetch(request);
  if (response.ok && request.method === 'GET') {
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  // Kick off the network update unconditionally so the cache catches
  // up to whatever's deployed. Don't await it before serving cached.
  const networkUpdate = fetch(request)
    .then((response) => {
      if (response.ok && request.method === 'GET') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  // Cache hit: serve immediately, refresh in background. Cache miss:
  // wait for the network we just kicked off.
  return cached || (await networkUpdate) || new Response('Offline', { status: 503 });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  // Skip non-GET (POST etc. — editor save endpoints, never cacheable).
  if (event.request.method !== 'GET') return;
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  // Only handle same-origin requests; cross-origin (analytics, fonts)
  // bypass the SW entirely.
  if (url.origin !== self.location.origin) return;
  const strategy = pickStrategy(url);
  if (strategy === 'cache-first') {
    event.respondWith(cacheFirst(event.request));
  } else if (strategy === 'stale-while-revalidate') {
    event.respondWith(staleWhileRevalidate(event.request));
  } else {
    event.respondWith(networkFirst(event.request));
  }
});
