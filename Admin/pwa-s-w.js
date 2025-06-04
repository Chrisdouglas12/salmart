const CACHE_NAME = 'salmart-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/Style.css',
  '/homeScript.js',
  '/Chats.js',
  '/Chats.html',
  '/requestlists.html',
  '/requestScript.js',
  '/Alerts.html',
  '/Messages.html',
  '/Profile.html',
  '/profilePostScript.js',
  '/profile styles.css',
  '/reply.html',
  '/reply.js',
  '/Deals.js',
  '/Deals.html',  
  '/Deals.css',
  '/product.html',
   '/Badges.js',
  '/salmart-192x192.png',
  '/salmart2-512x512.png',
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