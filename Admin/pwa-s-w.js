const CACHE_NAME = 'salmart-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/Style.css',
  '/homeScript.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Add more files you want to cache
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});