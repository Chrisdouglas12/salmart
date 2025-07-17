// ===== Firebase 8.x for Service Worker Notifications =====
try {
  console.log('🔥 [ServiceWorker] Loading Firebase scripts...');
  
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

  // Enhanced WhatsApp-like notification handler
  messaging.setBackgroundMessageHandler((payload) => {
    console.log('📩 [ServiceWorker] Background message received:', payload);

    const notification = payload.notification || {};
    const data = payload.data || {};
    const { title = 'Salmart', body = 'New notification', image } = notification;
    const { type, postId, senderId } = data;

    // Enhanced WhatsApp-like notification options
    const notificationOptions = {
      body,
      icon: '/salmart-192x192.png',
      badge: '/salmart-192x192.png',
      image: image || '/salmart-192x192.png',
      vibrate: [200, 100, 200], // More pronounced vibration
      requireInteraction: false, // Allow auto-dismiss like WhatsApp
      silent: false, // Enable sound
      tag: `salmart-${type}-${postId || senderId || Date.now()}`,
      renotify: true, // Show even if tag exists
      timestamp: Date.now(),
      data: {
        type,
        postId,
        senderId,
        url: getNotificationUrl(type, postId, senderId),
        timestamp: Date.now()
      },
      actions: [
        { 
          action: 'view', 
          title: '👁️ View',
          icon: '/icons/view.png' 
        },
        { 
          action: 'dismiss', 
          title: '❌ Dismiss',
          icon: '/icons/dismiss.png' 
        }
      ],
      dir: 'auto',
      lang: 'en'
    };

    console.log('🔔 [ServiceWorker] Showing notification:', title, notificationOptions);
    return self.registration.showNotification(title, notificationOptions);
  });

  // Enhanced notification click handler
  self.addEventListener('notificationclick', (event) => {
    console.log('🖱️ [ServiceWorker] Notification clicked:', event);
    
    const { action, notification } = event;
    const { url, type, postId, senderId } = notification.data || {};
    
    // Close the notification
    notification.close();
    
    if (action === 'dismiss') {
      console.log('❌ [ServiceWorker] Notification dismissed');
      return;
    }
    
    // Handle view action or default click
    if (url) {
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clientList) => {
            // Check if app is already open
            for (const client of clientList) {
              if (client.url.includes(self.location.origin)) {
                console.log('🔍 [ServiceWorker] Found existing client, focusing and navigating');
                client.focus();
                client.postMessage({
                  type: 'NOTIFICATION_CLICKED',
                  url,
                  action,
                  data: { type, postId, senderId }
                });
                return;
              }
            }
            
            // Open new window if none exists
            console.log('🆕 [ServiceWorker] Opening new window:', url);
            return clients.openWindow(url);
          })
      );
    }
  });

  // Enhanced notification close handler
  self.addEventListener('notificationclose', (event) => {
    console.log('🔔 [ServiceWorker] Notification closed:', event);
    
    // Optional: Track notification dismissal
    const { type, postId, senderId } = event.notification.data || {};
    console.log('📊 [ServiceWorker] Notification dismissed:', { type, postId, senderId });
  });

  // Auto-dismiss notifications after 5 seconds (WhatsApp-like behavior)
  self.addEventListener('push', (event) => {
    console.log('📨 [ServiceWorker] Push event received');
    
    // Auto-dismiss notifications after 5 seconds
    event.waitUntil(
      new Promise((resolve) => {
        setTimeout(() => {
          self.registration.getNotifications().then((notifications) => {
            notifications.forEach((notification) => {
              // Check if notification is older than 5 seconds
              const notificationTime = notification.data?.timestamp || 0;
              const currentTime = Date.now();
              
              if (currentTime - notificationTime >= 5000) {
                console.log('⏰ [ServiceWorker] Auto-dismissing notification after 5 seconds');
                notification.close();
              }
            });
          });
          resolve();
        }, 5000);
      })
    );
  });

  function getNotificationUrl(type, postId, senderId) {
    const baseUrl = self.location.origin;
    if (type === 'like' || type === 'comment') return `${baseUrl}/product.html?postId=${postId}`;
    if (type === 'message') return `${baseUrl}/Messages.html?userId=${senderId}`;
    return baseUrl;
  }

} catch (error) {
  console.error('❌ [ServiceWorker] Firebase init failed:', error);
}

// ===== PWA Caching Configuration =====
const CACHE_NAME = 'salmart-cache-v1.54.15';
const DYNAMIC_CACHE_NAME = 'salmart-dynamic-v1.54.15';

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
  '/salmartCache.js',
  '/idb-keyval-iife.js',
  // Add notification assets
  '/sounds/notification.mp3',
  '/icons/view.png',
  '/icons/dismiss.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Serif+Display:ital@0;0&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;0,800;0,900&display=swap'
];

// ===== Dynamic Content Cache Strategies =====
const CACHE_STRATEGIES = {
  '/post': 120000,
  '/get-transactions': 300000,
  '/messages': 60000,
  '/notifications': 90000,
  '/requests': 180000,
  '/user': 300000,
  '/is-following-list': 120000,
  '/api/is-following-list': 120000,
  '/api/user-suggestions': 120000,
};

function getCacheTTL(url) {
  const pathname = new URL(url).pathname;
  for (const [path, ttl] of Object.entries(CACHE_STRATEGIES)) {
    if (pathname.startsWith(path)) {
      return ttl;
    }
  }
  return 300000;
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
  const apiPaths = Object.keys(CACHE_STRATEGIES);
  for (const path of apiPaths) {
    if (requestUrl.pathname.startsWith(path)) {
      return true;
    }
  }

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
            throw err;
        });

        if (cachedResponse) {
          const isStale = isCacheStale(cachedResponse, cacheTTL);
          if (!isStale) {
            console.log(`⚡ [SW] Serving fresh cached dynamic content: ${event.request.url}`);
            event.waitUntil(networkFetchPromise.catch(err => {}));
            return cachedResponse;
          }
          console.log(`🔄 [SW] Serving stale dynamic content, updating in background: ${event.request.url}`);
          event.waitUntil(networkFetchPromise.catch(err => {}));
          return cachedResponse;
        }

        console.log(`📡 [SW] No cache, fetching dynamic content: ${event.request.url}`);
        return networkFetchPromise;
      }).catch(async (error) => {
        console.error(`❌ [SW] Dynamic fetch strategy failed for ${event.request.url}:`, error);
        if (event.request.headers.get('accept')?.includes('application/json')) {
            console.log(`🌐 [SW] Network/cache failed for JSON API, providing offline fallback data.`);
            return new Response(JSON.stringify({
                error: 'Network unavailable and no cached content for API.',
                offline: true,
                data: []
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

  // Static Content Strategy
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

// ===== Enhanced Message Handling =====
self.addEventListener('message', (event) => {
  console.log('📨 [ServiceWorker] Message from main thread:', event.data);
  
  if (event.data && event.data.type === 'CLEAR_NOTIFICATIONS') {
    // Clear all notifications
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((notification) => notification.close());
      console.log('🧹 [ServiceWorker] Cleared all notifications');
    });
  }
  
  if (event.data && event.data.type === 'UPDATE_NOTIFICATION_SETTINGS') {
    // Handle notification settings updates
    console.log('⚙️ [ServiceWorker] Updating notification settings:', event.data.settings);
  }
});

// ===== Background Sync for Proactive Updates =====
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-posts') {
    console.log('🔄 [SW] Background sync triggered: background-sync-posts');
    event.waitUntil(updateCriticalPostsData());
  }
});

async function updateCriticalPostsData() {
  console.log('🔄 [SW] Attempting to update critical posts data in background...');
  
  const commonEndpointsToUpdate = [
      '/post?category=all',
  ];

  const updatePromises = commonEndpointsToUpdate.map(async (endpoint) => {
      try {
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
  console.log('✅ [SW] Background sync for posts completed');
}

// ===== Notification Management =====
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('🔄 [ServiceWorker] Push subscription changed');
  // Handle push subscription changes
  event.waitUntil(
    // Re-register push subscription
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: 'BCtAsyYJYCSfpg_kXL2aO59szQsPFE3DvmqqLOnW03JTVR88Jb435-jDnUgj0j0mL5VCWLiGGfErTuwQ-XUArho'
    }).then((subscription) => {
      console.log('✅ [ServiceWorker] Push subscription renewed');
      // Send new subscription to server
      return fetch('/api/update-push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
    })
  );
});

console.log('✅ [ServiceWorker] Enhanced Firebase Messaging Service Worker loaded with WhatsApp-like features');