// Bump on every behavioural change so the activate handler purges the
// old cache. (Browsers also refetch the SW when its bytes change.)
const CACHE_NAME = 'lingo-map-v86';

// Bare-minimum precache: stuff every player needs on every map. Kept
// short so install never fails — `cache.addAll` rejects atomically on
// any 404, and a missing entry here used to wedge the SW in
// "installing" state forever, defeating the cache strategy below.
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
//   /_next/static/* and /assets/*    : CACHE-FIRST
//     Both are content-addressable (Next hashes the filename, our
//     pack/placeholder PNGs only change with a deploy). Once cached,
//     never go back to the network unless the cache misses.
//
//   /api/* and HTML navigations      : NETWORK-FIRST, fallback to cache
//     Editor saves the disk file, the runtime needs to see fresh
//     /api/maps and /api/car-collisions on every visit. Cache exists
//     only as an offline backstop.
//
//   everything else                  : NETWORK-FIRST, fallback to cache
//     Same as API. Safer default — better to be a little slower than
//     to serve stale dynamic content.
function isCacheFirst(url) {
  const path = url.pathname;
  return path.startsWith('/_next/static/') || path.startsWith('/assets/');
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  // Cache miss — fetch and cache for next time. Failures fall through
  // to the network error so the caller sees the same behaviour as a
  // direct fetch.
  const response = await fetch(request);
  if (response.ok && request.method === 'GET') {
    cache.put(request, response.clone());
  }
  return response;
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
  event.respondWith(
    isCacheFirst(url) ? cacheFirst(event.request) : networkFirst(event.request)
  );
});
