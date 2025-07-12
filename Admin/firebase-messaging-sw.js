// This file is firebase-messaging-sw.js

// ===== Firebase 8.x for Service Worker Notifications =====
try {
  console.log('🔥 [ServiceWorker] Loading Firebase scripts...');
  // Ensure these paths are correct relative to where your service worker is located
  importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js');
  importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js');
  console.log('✅ [ServiceWorker] Firebase scripts loaded');

  const firebaseConfig = {
    apiKey: "AIzaSyCmu0kXlzWE29eNlRDMoYG0qYyxnC5Vra4",
    authDomain: "salmart-330ab.firebaseapp.com",
    projectId: "salmart-330ab",
    messagingSenderId: "396604566472",
    appId: "1:396604566472:web:60eff66ef26ab223a12efd"
  };

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  console.log('✅ [ServiceWorker] Firebase Messaging initialized');

  messaging.setBackgroundMessageHandler((payload) => {
    console.log('📩 [ServiceWorker] Background message received:', payload);

    const notification = payload.notification || {};
    const data = payload.data || {};
    const { title = 'Salmart', body = 'New notification', image } = notification;
    const { type, postId, senderId } = data;

    const notificationOptions = {
      body,
      icon: '/salmart-192x192.png',
      badge: '/salmart-192x192.png',
      image: image || '/salmart-192x192.png',
      vibrate: [100, 50, 100],
      requireInteraction: true,
      tag: `salmart-${type}-${postId || senderId || Date.now()}`,
      data: {
        type,
        postId,
        senderId,
        url: getNotificationUrl(type, postId, senderId),
      },
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
      priority: 'high',
      renotify: true,
      silent: false,
      visibility: 'public',
    };

    return self.registration.showNotification(title, notificationOptions);
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const { url } = event.notification.data || {};
    if (url) {
      event.waitUntil(clients.openWindow(url));
    }
  });

  function getNotificationUrl(type, postId, senderId) {
    // Dynamically get the base URL from the service worker's scope
    const baseUrl = self.location.origin;
    if (type === 'like' || type === 'comment') return `${baseUrl}/product.html?postId=${postId}`;
    if (type === 'message') return `${baseUrl}/Messages.html?userId=${senderId}`;
    return baseUrl;
  }

} catch (error) {
  console.error('❌ [ServiceWorker] Firebase init failed:', error);
}

// ===== PWA Caching Configuration =====
const CACHE_NAME = 'salmart-cache-v1.37.1'; // Incremented version
const DYNAMIC_CACHE_NAME = 'salmart-dynamic-v1.37.1'; // Incremented version

// Add all critical static assets here for comprehensive offline UI
const urlsToCache = [
  '/',
  '/index.html',
  '/Style.css',
  '/posts.js',
  '/auth.js',
  '/posts-sharing.js',
  '/video-controls.js',
  '/posts-interaction.js',
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
  '/Badge.js',
  '/salmart-192x192.png',
  '/salmart-512x512.png',
  '/manifest.json',
  '/Offline.html',
  '/SignIn.html',
  '/SignUp.html',
  '/create-post.html',
  '/promote.html',
  '/edit-post.html',
  '/messages-styles.css',
  '/notifications.html',
  '/settings.html',
  '/upload-profile.html',
  '/salmartCache.js', // Crucial to cache your custom caching helper!
  '/idb-keyval-iife.js', // NEW: Add idb-keyval to static cache
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Serif+Display:ital@0;0&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;0,800;0,900&display=swap'
];

// ===== Dynamic Content Cache Strategies =====
// Use pathname prefixes for better matching of API routes,
// even if they have query parameters or dynamic IDs.
const CACHE_STRATEGIES = {
  '/post': 120000,          // 2 minutes - Posts (e.g., /post, /post?category=..., /post/:id)
  '/get-transactions': 300000,     // 5 minutes - User transactions (e.g., /get-transactions/:userId)
  '/messages': 60000,        // 1 minute - Messages (e.g., /messages?user1=...)
  '/notifications': 90000,          // 1.5 minutes - User notifications
  '/requests': 180000,    // 3 minutes - Requests (e.g., /requests?category=...)
  '/user': 300000,          // 5 minutes - User profiles (e.g., /user/:userId, /user/:userId/follow)
  '/is-following-list': 120000, // 2 minutes - Following list
  '/api/is-following-list': 120000, // Explicitly add this if used in your other scripts with /api prefix
  '/api/user-suggestions': 120000, // For user suggestions
};

function getCacheTTL(url) {
  const pathname = new URL(url).pathname;
  for (const [path, ttl] of Object.entries(CACHE_STRATEGIES)) {
    if (pathname.startsWith(path)) {
      return ttl;
    }
  }
  return 300000; // Default 5 minutes for unknown dynamic content
}

function isCacheStale(cachedResponse, maxAge) {
  const timestamp = cachedResponse.headers.get('sw-cache-timestamp');
  if (!timestamp) return true;
  const age = Date.now() - parseInt(timestamp);
  return age > maxAge;
}

async function fetchAndCache(request, cacheName = DYNAMIC_CACHE_NAME) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const responseClone = response.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cache-timestamp', Date.now().toString());

      const modifiedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });

      const cache = await caches.open(cacheName);
      await cache.put(request, modifiedResponse);
      console.log(`🔄 [SW] Cached dynamic content: ${request.url}`);
    } else if (response && response.status !== 200) {
        console.warn(`⚠️ [SW] Not caching response for ${request.url} due to status: ${response.status}`);
    } else if (response && response.type !== 'basic') {
        console.warn(`⚠️ [SW] Not caching response for ${request.url} due to type: ${response.type}`);
    }
    return response;
  } catch (error) {
    console.error(`❌ [SW] Network error for ${request.url}:`, error);
    throw error;
  }
}

function isDynamicContent(requestUrl) {
  // Check if it's your backend API by matching origin and path prefix
  // This assumes your backend is on the same origin as your frontend, or its base URL
  // is known and handled elsewhere (like your API_BASE_URL variable in salmartCache.js)
  const apiPaths = Object.keys(CACHE_STRATEGIES);
  for (const path of apiPaths) {
    // Use requestUrl.pathname.startsWith for more robust matching of API routes
    if (requestUrl.pathname.startsWith(path)) {
      // Further refinement: Ensure it's for your API_BASE_URL origin
      // if it's different from self.location.origin
      // For now, assuming API_BASE_URL is generally on the same host or proxy.
      return true;
    }
  }

  // Include Firebase API calls (often dynamic and cross-origin)
  if (requestUrl.hostname.includes('firebaseio.com') || requestUrl.hostname.includes('googleapis.com')) {
    return true;
  }
  return false;
}

// ===== Service Worker Events =====
self.addEventListener('install', (event) => {
  console.log('📦 [ServiceWorker] Installing and caching static assets...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(error => {
        console.error('❌ [ServiceWorker] Failed to cache some URLs during install:', error);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('🧹 [ServiceWorker] Activating and cleaning old caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== DYNAMIC_CACHE_NAME) {
            console.log(`🗑️ [ServiceWorker] Deleting old cache: ${name}`);
            return caches.delete(name);
          }
        })
      )
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' ||
      event.request.url.includes('sockjs-node') ||
      event.request.url.includes('hot-update')) {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (isDynamicContent(requestUrl)) {
    event.respondWith(
      caches.match(event.request).then(async (cachedResponse) => {
        const cacheTTL = getCacheTTL(event.request.url);

        const networkFetchPromise = fetchAndCache(event.request).catch(err => {
            console.warn(`⚠️ [SW] Network fetch/update failed for ${event.request.url}: ${err.message}`);
            // This error is caught here, but for critical API calls, we need a fallback.
            throw err; // Re-throw to propagate to the outer catch for offline fallbacks
        });

        if (cachedResponse) {
          const isStale = isCacheStale(cachedResponse, cacheTTL);
          if (!isStale) {
            console.log(`⚡ [SW] Serving fresh cached dynamic content: ${event.request.url}`);
            event.waitUntil(networkFetchPromise.catch(err => {})); // Update in background
            return cachedResponse;
          }
          console.log(`🔄 [SW] Serving stale dynamic content, updating in background: ${event.url}`);
          event.waitUntil(networkFetchPromise.catch(err => {})); // Update in background
          return cachedResponse;
        }

        console.log(`📡 [SW] No cache, fetching dynamic content: ${event.request.url}`);
        return networkFetchPromise;
      }).catch(async (error) => {
        console.error(`❌ [SW] Dynamic fetch strategy failed for ${event.request.url}:`, error);
        // This is the true offline fallback for dynamic API calls
        if (event.request.headers.get('accept')?.includes('application/json')) {
            console.log(`🌐 [SW] Network/cache failed for JSON API, providing offline fallback data.`);
            return new Response(JSON.stringify({
                error: 'Network unavailable and no cached content for API.',
                offline: true,
                data: [] // Provide an empty array as a fallback for data endpoints
            }), {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response('Network error occurred for dynamic content', {
            status: 503,
            statusText: 'Service Unavailable'
        });
      })
    );
    return;
  }

  // ===== Static Content Strategy (Cache-First, with network fallback) =====
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log(`💾 [SW] Serving from static cache: ${event.request.url}`);
        return cachedResponse;
      }

      console.log(`📡 [SW] Fetching and caching static content: ${event.request.url}`);
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/Offline.html');
          }
          return new Response('Network error occurred', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
    })
  );
});

// ===== Background Sync for Proactive Updates =====
// IMPORTANT: For background sync to work, your web app must register a sync.
// Example in posts.js (or similar):
// if ('serviceWorker' in navigator && 'SyncManager' in window) {
//   navigator.serviceWorker.ready.then(reg => {
//     reg.sync.register('background-sync-posts'); // Use a specific tag
//   }).catch(err => console.error('Background sync registration failed:', err));
// }

self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-posts') { // Match the tag from registration
    console.log('🔄 [SW] Background sync triggered: background-sync-posts');
    event.waitUntil(updateCriticalPostsData()); // Call a specific update function
  }
  // Add other sync tags if needed, e.g., 'background-sync-messages'
});

async function updateCriticalPostsData() {
  console.log('🔄 [SW] Attempting to update critical posts data in background...');
  const userId = localStorage.getItem('userId'); // Cannot reliably get localStorage in SW for auth token
  if (!userId) {
      console.warn('Cannot perform personalized background sync: User not logged in or userId not available.');
      return; // Cannot sync personalized data without user context
  }

  // --- Crucial limitation for Service Worker background sync with AUTHENTICATED requests ---
  // A Service Worker cannot directly access localStorage or IndexedDB from the client.
  // This means it cannot get the user's authToken directly.
  // To perform authenticated background syncs, you need to:
  // 1. Have your backend provide a "refresh token" or "long-lived token" specifically for SW,
  //    or use a secure messaging channel from client to SW to pass the token.
  // 2. OR, more simply for personalized feeds, background sync should trigger the
  //    `salmartCache.getPostsByCategory` method from the *client* after it's back online.
  //    The sync event just acts as a wake-up call for the client.

  // For this example, we will assume a simplified approach:
  // We'll call a general /post endpoint, but this WON'T be personalized by the SW itself
  // because it lacks the auth token.
  // The primary source of offline personalized data should come from salmartCache (IndexedDB).

  const commonEndpointsToUpdate = [
      '/post?category=all', // This will fetch public/generic posts if SW can't get auth
      // Add other common, non-personalized endpoints here.
      // For personalized updates, the client's IndexedDB approach is superior.
  ];

  const updatePromises = commonEndpointsToUpdate.map(async (endpoint) => {
      try {
          // In a real authenticated background sync, you'd need a mechanism
          // for the SW to get the auth token (e.g., passed via `fetch` from client,
          // or a background fetch API that can use credential parameters).
          // For now, these SW-initiated fetches will be unauthenticated by default.
          const response = await fetch(`${self.location.origin}${endpoint}`);
          if (response.ok) {
              const cache = await caches.open(DYNAMIC_CACHE_NAME);
              await cache.put(new Request(`${self.location.origin}${endpoint}`), response.clone());
              console.log(`✅ [SW] Updated cache for background sync: ${endpoint}`);
          } else {
              console.log(`⚠️ [SW] Failed background sync update for ${endpoint}: ${response.status} ${response.statusText}`);
          }
      } catch (error) {
          console.log(`⚠️ [SW] Background sync network error for ${endpoint}: ${error.message}`);
      }
  });

  await Promise.allSettled(updatePromises);
  console.log('✅ [SW] Background sync for posts completed (may not be personalized)');
}




