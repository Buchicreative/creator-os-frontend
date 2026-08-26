/* ═══════════════════════════════════════
   Crevers Service Worker
   Caches the app shell for instant loads
   ═══════════════════════════════════════ */
var CACHE_NAME = 'crevers-v1';
var SHELL = [
  '/',
  '/favicon.svg',
  '/favicon.ico',
  '/logo.svg',
  '/logo-light.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

/* Install — cache the app shell */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* Activate — clean up old caches */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key)   { return caches.delete(key);  })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* Fetch — network first, fall back to cache for shell */
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  /* Always go network for API calls, auth, external requests */
  if(url.origin !== self.location.origin ||
     url.pathname.startsWith('/auth') ||
     url.pathname.startsWith('/ai') ||
     url.pathname.startsWith('/payments') ||
     url.pathname.startsWith('/projects')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(function(response) {
        /* Cache successful GET responses for shell assets */
        if(e.request.method === 'GET' && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        /* Network failed — serve from cache */
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('/');
        });
      })
  );
});
