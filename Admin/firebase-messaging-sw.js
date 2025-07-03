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
    const baseUrl = 'https://salmart.vercel.app';
    if (type === 'like' || type === 'comment') return `${baseUrl}/product.html?postId=${postId}`;
    if (type === 'message') return `${baseUrl}/Messages.html?userId=${senderId}`;
    return baseUrl;
  }

} catch (error) {
  console.error('❌ [ServiceWorker] Firebase init failed:', error);
}

// ===== PWA Caching Configuration =====
const CACHE_NAME = 'salmart-cache-v1.12.6'; // Incremented version
const DYNAMIC_CACHE_NAME = 'salmart-dynamic-v1.12.6'; // Incremented version

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
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Serif+Display:ital@0;0&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap'
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
};

function getCacheTTL(url) {
  const pathname = new URL(url).pathname; 
  for (const [path, ttl] of Object.entries(CACHE_STRATEGIES)) {
    // Check if the request's pathname starts with any of our defined API paths
    if (pathname.startsWith(path)) {
      return ttl;
    }
  }
  return 300000; // Default 5 minutes for unknown dynamic content
}

function isCacheStale(cachedResponse, maxAge) {
  const timestamp = cachedResponse.headers.get('sw-cache-timestamp');
  if (!timestamp) return true; // If no timestamp, assume stale
  
  const age = Date.now() - parseInt(timestamp);
  return age > maxAge;
}

async function fetchAndCache(request, cacheName = DYNAMIC_CACHE_NAME) {
  try {
    const response = await fetch(request);
    
    // Only cache successful responses
    // Also, avoid caching opaque responses (type 'opaque') as they can't be read later
    // and might not be useful for replaying.
    if (response && response.status === 200 && response.type === 'basic') { 
      const responseClone = response.clone();
      
      // Add timestamp header for TTL tracking
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
  // Determine if the request is for your backend API or other dynamic external content
  // IMPORTANT: Assume your backend API is on the same origin as your frontend
  // or that your `API_BASE_URL` in `salmartCache.js` correctly points to it.
  const apiBaseUrlOrigin = new URL(self.location.origin).origin; // Get your app's origin
  const requestOrigin = requestUrl.origin;

  // Check if it's your backend API by matching origin and path prefix
  if (requestOrigin === apiBaseUrlOrigin) {
    const apiPaths = Object.keys(CACHE_STRATEGIES);
    for (const path of apiPaths) {
      if (requestUrl.pathname.startsWith(path)) {
        return true;
      }
    }
  }
  
  // Include Firebase API calls (often dynamic and cross-origin)
  if (requestUrl.hostname.includes('firebaseio.com') || requestUrl.hostname.includes('googleapis.com')) {
    return true;
  }

  // Add any other custom dynamic content flags if you use them
  // if (requestUrl.searchParams.has('dynamic') || requestUrl.pathname.includes('data')) {
  //   return true;
  // }
  
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
  // Skip non-GET requests and development/hot-reloading files
  if (event.request.method !== 'GET' || 
      event.request.url.includes('sockjs-node') || 
      event.request.url.includes('hot-update')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  
  // Apply dynamic content strategy for specific API paths and Firebase/Google APIs
  if (isDynamicContent(requestUrl)) {
    event.respondWith(
      caches.match(event.request).then(async (cachedResponse) => {
        const cacheTTL = getCacheTTL(event.request.url);
        
        // This promise fetches from network and updates cache
        const networkFetchPromise = fetchAndCache(event.request).catch(err => {
            console.log(`⚠️ [SW] Network fetch/update failed for ${event.request.url}: ${err.message}`);
            throw err; // Re-throw to propagate the error
        });
        
        // If we have cached content
        if (cachedResponse) {
          const isStale = isCacheStale(cachedResponse, cacheTTL);
          
          if (!isStale) {
            console.log(`⚡ [SW] Serving fresh cached dynamic content: ${event.request.url}`);
            // Serve fresh cache, but also try to update in background for next time
            event.waitUntil(networkFetchPromise.catch(err => {})); // Don't block, but log
            return cachedResponse;
          }
          
          // Content is stale - return it immediately but update in background
          console.log(`🔄 [SW] Serving stale dynamic content, updating in background: ${event.request.url}`);
          event.waitUntil(networkFetchPromise.catch(err => {})); // Don't block, but log
          return cachedResponse;
        }
        
        // No cached content - wait for network response and cache it
        console.log(`📡 [SW] No cache, fetching dynamic content: ${event.request.url}`);
        return networkFetchPromise; // This will return the response from the network and also cache it
      }).catch(async (error) => {
        console.error(`❌ [SW] Dynamic fetch strategy failed for ${event.request.url}:`, error);
        // If network failed AND no cache was found, return a generic offline JSON for API calls.
        // Or, for specific API calls, you might want to return an empty array or default data.
        if (event.request.headers.get('accept').includes('application/json')) {
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
        // Fallback for non-JSON dynamic requests (e.g., images from Firebase storage if they were dynamic)
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
          // Check if we received a valid response and it's a 'basic' type (not opaque)
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback for navigation requests to HTML pages
          if (event.request.mode === 'navigate') {
            return caches.match('/Offline.html');
          }
          // For other failed static requests, return a generic error
          return new Response('Network error occurred', { 
            status: 503, 
            statusText: 'Service Unavailable' 
          });
        });
    })
  );
});

// ===== Background Sync for Proactive Updates =====
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('🔄 [SW] Background sync triggered');
    event.waitUntil(updateCriticalData());
  }
});

async function updateCriticalData() {
  // IMPORTANT: Ensure these endpoints exactly match the API calls you want to proactively update.
  // For parameterized routes, you might list a typical example if you want to sync specific data.
  // For general endpoints, just the base path.
  const criticalEndpoints = [
    '/post?category=all',         // Fetch all posts (common feed)
    '/post?category=electronics', // Example: a specific important category
    '/get-transactions',          // General endpoint for transactions
    '/messages',                  // General endpoint for messages
    '/notifications',             // General endpoint for notifications
    '/requests?category=all',     // Fetch all requests
    // '/user',                   // If you have a general user list or current user endpoint
    '/is-following-list',         // To keep the following list up-to-date
    // Add other critical API endpoints you want to proactively update on background sync
    // e.g., if you have /deals, /chats, etc.
  ];
  
  console.log('🔄 [SW] Updating critical data in background...');
  
  const updatePromises = criticalEndpoints.map(async (endpoint) => {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        await cache.put(endpoint, response.clone());
        console.log(`✅ [SW] Updated cache for: ${endpoint}`);
      } else {
        console.log(`⚠️ [SW] Failed to update ${endpoint}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`⚠️ [SW] Failed to update ${endpoint} due to network error: ${error.message}`);
    }
  });
  
  await Promise.allSettled(updatePromises);
  console.log('✅ [SW] Background sync completed');
}
