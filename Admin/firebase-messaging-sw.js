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
const CACHE_NAME = 'salmart-cache-v1.20.0'; // Incremented version
const DYNAMIC_CACHE_NAME = 'salmart-dynamic-v1.20.0'; // Incremented version

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



// ===== OFFLINE MESSAGE QUEUEING =====
const OFFLINE_QUEUE_STORE = 'salmart-offline-queue';
const MESSAGE_TYPES = {
  POST: 'post',
  MESSAGE: 'message',
  COMMENT: 'comment',
  LIKE: 'like',
  FOLLOW: 'follow'
};

// Initialize offline queue storage
async function initOfflineQueue() {
  if (!self.indexedDB) return;
  
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open(OFFLINE_QUEUE_STORE, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create queue store for offline actions
      if (!db.objectStoreNames.contains('queue')) {
        const queueStore = db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('timestamp', 'timestamp');
        queueStore.createIndex('type', 'type');
        queueStore.createIndex('retry_count', 'retry_count');
      }
      
      // Create drafts store for unsent messages
      if (!db.objectStoreNames.contains('drafts')) {
        const draftsStore = db.createObjectStore('drafts', { keyPath: 'id', autoIncrement: true });
        draftsStore.createIndex('conversation_id', 'conversation_id');
        draftsStore.createIndex('timestamp', 'timestamp');
      }
    };
  });
}

// Queue offline actions
async function queueOfflineAction(action) {
  try {
    const db = await initOfflineQueue();
    const transaction = db.transaction(['queue'], 'readwrite');
    const store = transaction.objectStore('queue');
    
    const queueItem = {
      ...action,
      timestamp: Date.now(),
      retry_count: 0,
      status: 'pending'
    };
    
    await store.add(queueItem);
    console.log('📦 [SW] Queued offline action:', queueItem);
    
    // Show user notification that action is queued
    await self.registration.showNotification('Action Queued', {
      body: `Your ${action.type} will be sent when you're back online`,
      icon: '/salmart-192x192.png',
      badge: '/salmart-192x192.png',
      tag: 'offline-queue',
      actions: [
        { action: 'view-queue', title: 'View Queue' }
      ]
    });
    
  } catch (error) {
    console.error('❌ [SW] Failed to queue offline action:', error);
  }
}

// Process queued actions when back online
async function processOfflineQueue() {
  try {
    const db = await initOfflineQueue();
    const transaction = db.transaction(['queue'], 'readwrite');
    const store = transaction.objectStore('queue');
    const index = store.index('timestamp');
    
    const queuedItems = await new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    console.log(`🔄 [SW] Processing ${queuedItems.length} queued actions`);
    
    for (const item of queuedItems) {
      if (item.status === 'pending' && item.retry_count < 3) {
        try {
          await processQueuedAction(item);
          await store.delete(item.id);
          console.log('✅ [SW] Successfully processed queued action:', item.id);
        } catch (error) {
          console.error('❌ [SW] Failed to process queued action:', item.id, error);
          
          // Update retry count
          item.retry_count++;
          item.last_error = error.message;
          item.last_attempt = Date.now();
          
          if (item.retry_count >= 3) {
            item.status = 'failed';
            await self.registration.showNotification('Action Failed', {
              body: `Failed to send your ${item.type} after 3 attempts`,
              icon: '/salmart-192x192.png',
              tag: 'action-failed'
            });
          }
          
          await store.put(item);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ [SW] Failed to process offline queue:', error);
  }
}

// Process individual queued action
async function processQueuedAction(item) {
  const { type, data, endpoint, method = 'POST' } = item;
  
  const response = await fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${data.authToken || ''}` // You'll need to store this
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

// ===== DRAFT MANAGEMENT =====
async function saveDraft(conversationId, content, messageType = 'text') {
  try {
    const db = await initOfflineQueue();
    const transaction = db.transaction(['drafts'], 'readwrite');
    const store = transaction.objectStore('drafts');
    
    const draft = {
      conversation_id: conversationId,
      content,
      message_type: messageType,
      timestamp: Date.now()
    };
    
    // Check if draft already exists for this conversation
    const index = store.index('conversation_id');
    const existing = await new Promise((resolve, reject) => {
      const request = index.get(conversationId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (existing) {
      draft.id = existing.id;
      await store.put(draft);
    } else {
      await store.add(draft);
    }
    
    console.log('💾 [SW] Draft saved for conversation:', conversationId);
    
  } catch (error) {
    console.error('❌ [SW] Failed to save draft:', error);
  }
}

// ===== ENHANCED FETCH EVENT WITH OFFLINE QUEUEING =====
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    // Handle POST/PUT/DELETE requests that might need queueing
    event.respondWith(handleNonGetRequest(event.request));
    return;
  }
  
  // ... rest of your existing GET request handling
});

async function handleNonGetRequest(request) {
  try {
    // Try to make the request
    const response = await fetch(request);
    
    if (response.ok) {
      return response;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
    
  } catch (error) {
    console.warn('⚠️ [SW] Non-GET request failed, checking if should queue:', request.url);
    
    // Check if this is a request that should be queued
    if (shouldQueueRequest(request)) {
      const requestData = await extractRequestData(request);
      
      await queueOfflineAction({
        type: determineActionType(request.url),
        endpoint: request.url,
        method: request.method,
        data: requestData
      });
      
      // Return a success response to the client indicating it's queued
      return new Response(JSON.stringify({
        success: true,
        queued: true,
        message: 'Action queued for when you\'re back online'
      }), {
        status: 202, // Accepted
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // If not queueable, return error
    return new Response(JSON.stringify({
      error: 'Network unavailable',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function shouldQueueRequest(request) {
  const url = new URL(request.url);
  const queueableEndpoints = [
    '/messages',
    '/post',
    '/comment',
    '/like',
    '/follow',
    '/unfollow'
  ];
  
  return queueableEndpoints.some(endpoint => url.pathname.includes(endpoint));
}

function determineActionType(url) {
  const urlObj = new URL(url);
  if (urlObj.pathname.includes('/messages')) return MESSAGE_TYPES.MESSAGE;
  if (urlObj.pathname.includes('/post')) return MESSAGE_TYPES.POST;
  if (urlObj.pathname.includes('/comment')) return MESSAGE_TYPES.COMMENT;
  if (urlObj.pathname.includes('/like')) return MESSAGE_TYPES.LIKE;
  if (urlObj.pathname.includes('/follow')) return MESSAGE_TYPES.FOLLOW;
  return 'unknown';
}

async function extractRequestData(request) {
  try {
    const clonedRequest = request.clone();
    const data = await clonedRequest.json();
    return data;
  } catch (error) {
    console.warn('⚠️ [SW] Could not extract request data:', error);
    return {};
  }
}

// ===== ENHANCED SYNC EVENT =====
self.addEventListener('sync', (event) => {
  console.log('🔄 [SW] Sync event triggered:', event.tag);
  
  if (event.tag === 'background-sync-posts') {
    event.waitUntil(updateCriticalPostsData());
  } else if (event.tag === 'process-offline-queue') {
    event.waitUntil(processOfflineQueue());
  }
});

// ===== ONLINE/OFFLINE EVENT HANDLERS =====
self.addEventListener('online', () => {
  console.log('🌐 [SW] Back online - processing queued actions');
  processOfflineQueue();
});

self.addEventListener('offline', () => {
  console.log('📴 [SW] Gone offline - will queue future actions');
});

// ===== MESSAGE HANDLING FOR COMMUNICATION WITH CLIENT =====
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'QUEUE_ACTION':
      queueOfflineAction(data);
      break;
    case 'SAVE_DRAFT':
      saveDraft(data.conversationId, data.content, data.messageType);
      break;
    case 'PROCESS_QUEUE':
      processOfflineQueue();
      break;
    default:
      console.log('🔔 [SW] Unknown message type:', type);
  }
});

// ===== NOTIFICATION CLICK HANDLING =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const { action } = event;
  const { url, type } = event.notification.data || {};
  
  if (action === 'view-queue') {
    event.waitUntil(clients.openWindow('/offline-queue.html'));
  } else if (url) {
    event.waitUntil(clients.openWindow(url));
  }
});

// Initialize offline queue on service worker startup
self.addEventListener('activate', (event) => {
  console.log('🧹 [ServiceWorker] Activating and cleaning old caches...');
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME && name !== DYNAMIC_CACHE_NAME) {
              console.log(`🗑️ [ServiceWorker] Deleting old cache: ${name}`);
              return caches.delete(name);
            }
          })
        )
      ),
      initOfflineQueue(),
      clients.claim()
    ])
  );
});