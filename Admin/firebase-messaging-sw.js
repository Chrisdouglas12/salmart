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
                // This message handler should be in your main app script
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

  // --- UPDATED getNotificationUrl function ---
  function getNotificationUrl(type, postId, senderId) {
    const baseUrl = self.location.origin;
    let url = baseUrl;

    switch (type) {
      case 'like':
      case 'comment':
      case 'new_post':
      case 'notify-followers':
        if (postId) url = `${baseUrl}/product.html?postId=${postId}`;
        break;

      case 'deal':
      case 'payment':
      case 'payment_released':
      case 'delivery':
        // These are related to deals and transactions
        url = `${baseUrl}/Deals.html`;
        break;

      case 'payout_queued':
      case 'payout_queued_balance_error':
      case 'refund_rejected':
      case 'refund_processed':
      case 'warning':
      case 'promotion':
        case 'reply':
        // These are alerts and account-related
        url = `${baseUrl}/Alerts.html`;
        break;

      case 'message':
      
        if (senderId) url = `${baseUrl}/Messages.html?userId=${senderId}`;
        break;
      
      default:
        console.log('ℹ️ [ServiceWorker] No specific URL for this notification type. Using default.');
    }
    return url;
  }
} catch (error) {
  console.error('❌ [ServiceWorker] Firebase init failed:', error);
}

// ===== Enhanced Update Management =====

const BUILD_TIMESTAMP = '2024-08-10-v1.76.59'; 

const CACHE_NAME = `salmart-cache-${BUILD_TIMESTAMP}`;
const DYNAMIC_CACHE_NAME = `salmart-dynamic-${BUILD_TIMESTAMP}`;

// Version info for debugging
const SW_VERSION = {
  version: BUILD_TIMESTAMP,
  timestamp: Date.now(),
  features: ['firebase-messaging', 'pwa-caching', 'auto-update', 'enhanced-notifications']
};

console.log(`🚀 [ServiceWorker] Version ${SW_VERSION.version} initializing...`);

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

// ===== Enhanced Dynamic Content Cache Strategies =====
const CACHE_STRATEGIES = {
  '/post': { ttl: 120000, forceRefresh: true },
  '/get-transactions': { ttl: 300000, forceRefresh: true },
  '/messages': { ttl: 60000, forceRefresh: true },
  '/notifications': { ttl: 90000, forceRefresh: true },
  '/requests': { ttl: 180000, forceRefresh: true },
  '/user': { ttl: 300000, forceRefresh: true }, // Always refresh user data
  '/is-following-list': { ttl: 120000, forceRefresh: true },
  '/api/is-following-list': { ttl: 120000, forceRefresh: true },
  '/api/user-suggestions': { ttl: 120000, forceRefresh: true },
  '/auth': { ttl: 0, forceRefresh: true }, // Never cache auth
  '/login': { ttl: 0, forceRefresh: true },
  '/logout': { ttl: 0, forceRefresh: true },
  '/verify-token': { ttl: 0, forceRefresh: true },
  '/refresh-token': { ttl: 0, forceRefresh: true }
};

// Helper function to identify auth requests
function isAuthRequest(requestUrl) {
  const authPaths = ['/auth', '/login', '/logout', '/verify-token', '/refresh-token'];
  return authPaths.some(path => requestUrl.pathname.startsWith(path)) ||
         requestUrl.searchParams.has('token') ||
         requestUrl.pathname.includes('firebase') ||
         requestUrl.hostname.includes('googleapis.com') ||
         requestUrl.hostname.includes('firebaseio.com');
}

// Helper function to identify user-specific requests
function isUserSpecificRequest(requestUrl) {
  const userPaths = ['/user', '/profile', '/messages', '/notifications', '/requests'];
  return userPaths.some(path => requestUrl.pathname.startsWith(path)) ||
         requestUrl.searchParams.has('userId') ||
         requestUrl.searchParams.has('token');
}

function getCacheStrategy(url) {
  const pathname = new URL(url).pathname;
  for (const [path, strategy] of Object.entries(CACHE_STRATEGIES)) {
    if (pathname.startsWith(path)) {
      return strategy;
    }
  }
  return { ttl: 300000, forceRefresh: false };
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

// ===== Enhanced Service Worker Events =====
self.addEventListener('install', (event) => {
  console.log(`📦 [ServiceWorker] Installing version ${SW_VERSION.version}...`);
  
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(urlsToCache).catch(error => {
          console.error('❌ [ServiceWorker] Failed to cache some URLs during install:', error);
        });
      }),
      
      // Clear old dynamic caches immediately
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name.includes('salmart-dynamic-') && name !== DYNAMIC_CACHE_NAME) {
              console.log(`🗑️ [ServiceWorker] Clearing old dynamic cache: ${name}`);
              return caches.delete(name);
            }
          })
        );
      }),
      
      // Notify clients about new version
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_VERSION_UPDATE',
            version: SW_VERSION,
            action: 'installed'
          });
        });
      })
    ])
  );
});

self.addEventListener('activate', (event) => {
  console.log(`🧹 [ServiceWorker] Activating version ${SW_VERSION.version}...`);
  
  event.waitUntil(
    Promise.all([
      // Delete all old caches
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
      
      // Take control immediately
      self.clients.claim(),
      
      // Notify all clients about activation
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          console.log('🔄 [ServiceWorker] Notifying client about activation');
          client.postMessage({
            type: 'SW_VERSION_UPDATE',
            version: SW_VERSION,
            action: 'activated',
            shouldReload: true
          });
        });
      })
    ])
  );
});

// ===== Enhanced Fetch Handler =====
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' ||
      event.request.url.includes('sockjs-node') ||
      event.request.url.includes('hot-update')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  
  // Never cache authentication requests
  if (isAuthRequest(requestUrl)) {
    console.log(`🔐 [SW] Bypassing cache for auth request: ${event.request.url}`);
    event.respondWith(fetch(event.request));
    return;
  }

  // Handle version check endpoint
  if (event.request.url.endsWith('/sw-version')) {
    event.respondWith(
      new Response(JSON.stringify(SW_VERSION), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    return;
  }

  if (isDynamicContent(requestUrl)) {
    event.respondWith(handleDynamicContent(event.request));
    return;
  }

  // Handle static content
  event.respondWith(handleStaticContent(event.request));
});

// Enhanced dynamic content handler
async function handleDynamicContent(request) {
  const requestUrl = new URL(request.url);
  const strategy = getCacheStrategy(request.url);
  
  try {
    // Always fetch fresh for critical user data or auth
    if (strategy.forceRefresh || isUserSpecificRequest(requestUrl) || isAuthRequest(requestUrl)) {
      console.log(`📡 [SW] Force refreshing: ${request.url}`);
      return await fetchAndCache(request);
    }
    
    // Standard cache strategy
    const cachedResponse = await caches.match(request);
    const cacheTTL = strategy.ttl;

    if (cachedResponse && !isCacheStale(cachedResponse, cacheTTL)) {
      console.log(`⚡ [SW] Serving fresh cached content: ${request.url}`);
      // Update in background
      fetchAndCache(request).catch(() => {});
      return cachedResponse;
    }

    console.log(`🔄 [SW] Fetching fresh content: ${request.url}`);
    return await fetchAndCache(request);
    
  } catch (error) {
    console.error(`❌ [SW] Dynamic fetch failed for ${request.url}:`, error);
    
    // Return cached version if available
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`📦 [SW] Returning stale cached content: ${request.url}`);
      return cachedResponse;
    }
    
    // Return error response
    if (request.headers.get('accept')?.includes('application/json')) {
      return new Response(JSON.stringify({
        error: 'Network unavailable',
        offline: true,
        data: []
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    throw error;
  }
}

// Static content handler
async function handleStaticContent(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`💾 [SW] Serving from static cache: ${request.url}`);
      return cachedResponse;
    }

    console.log(`📡 [SW] Fetching and caching static content: ${request.url}`);
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
      const responseToCache = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, responseToCache);
    }
    return networkResponse;
    
  } catch (error) {
    console.error(`❌ [SW] Static fetch failed for ${request.url}:`, error);
    
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/Offline.html');
      return offlinePage || new Response('Offline', { status: 503 });
    }
    
    return new Response('Network error occurred', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// ===== Enhanced Message Handling =====
self.addEventListener('message', (event) => {
  console.log('📨 [ServiceWorker] Message from main thread:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('⏭️ [ServiceWorker] Skip waiting requested');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      type: 'SW_VERSION',
      version: SW_VERSION
    });
  }
  
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    console.log('🧹 [ServiceWorker] Clearing all caches');
    event.waitUntil(
      caches.keys().then(cacheNames => 
        Promise.all(
          cacheNames.map(name => {
            if (name.includes('salmart')) {
              console.log(`🗑️ [ServiceWorker] Deleting cache: ${name}`);
              return caches.delete(name);
            }
          })
        )
      )
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_NOTIFICATIONS') {
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((notification) => notification.close());
      console.log('🧹 [ServiceWorker] Cleared all notifications');
    });
  }
  
  if (event.data && event.data.type === 'UPDATE_NOTIFICATION_SETTINGS') {
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
              console.log(`⚠️ [SW] Failed background sync update for ${endpoint}: ${response.status}`);
          }
      } catch (error) {
          console.log(`⚠️ [SW] Background sync network error for ${endpoint}: ${error.message}`);
      }
  });

  await Promise.allSettled(updatePromises);
  console.log('✅ [SW] Background sync for posts completed');
}

// ===== Push Subscription Management =====
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('🔄 [ServiceWorker] Push subscription changed');
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: 'BCtAsyYJYCSfpg_kXL2aO59szQsPFE3DvmqqLOnW03JTVR88Jb435-jDnUgj0j0mL5VCWLiGGfErTuwQ-XUArho'
    }).then((subscription) => {
      console.log('✅ [ServiceWorker] Push subscription renewed');
      return fetch('/api/update-push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
    }).catch(error => {
      console.error('❌ [ServiceWorker] Push subscription renewal failed:', error);
    })
  );
});

console.log(`✅ [ServiceWorker] Enhanced version ${SW_VERSION.version} loaded with Firebase messaging and auto-update features`);
