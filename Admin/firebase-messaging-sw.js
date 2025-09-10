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
    
    const { type, postId, senderId } = event.notification.data || {};
    console.log('📊 [ServiceWorker] Notification dismissed:', { type, postId, senderId });
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
        url = `${baseUrl}/Deals.html`;
        break;

      case 'payout_queued':
      case 'payout_queued_balance_error':
      case 'refund_rejected':
      case 'refund_processed':
      case 'warning':
      case 'promotion':
      case 'reply':
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

// ===== CRITICAL: Enhanced Update Management with Force Cache Bust =====

// IMPORTANT: Change this timestamp for every deployment to force cache updates
const BUILD_TIMESTAMP = '2025-09-10-v2.01.11'; 

const CACHE_NAME = `salmart-cache-${BUILD_TIMESTAMP}`;
const DYNAMIC_CACHE_NAME = `salmart-dynamic-${BUILD_TIMESTAMP}`;

// Version info for debugging
const SW_VERSION = {
  version: BUILD_TIMESTAMP,
  timestamp: Date.now(),
  features: ['firebase-messaging', 'pwa-caching', 'auto-update', 'enhanced-notifications', 'force-cache-bust']
};

console.log(`🚀 [ServiceWorker] Version ${SW_VERSION.version} initializing...`);

// Add cache-busting query parameter to all cached URLs
const cacheBustParam = `sw-version=${BUILD_TIMESTAMP}`;

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
  '/sounds/notification.mp3',
  '/icons/view.png',
  '/icons/dismiss.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Serif+Display:ital@0;0&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;0,800;0,900&display=swap'
].map(url => {
  // Don't add cache busting to external URLs
  if (url.startsWith('http')) return url;
  // Add cache busting parameter to local URLs
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${cacheBustParam}`;
});

// ===== ENHANCED Cache Strategies with Aggressive Refresh =====
const CACHE_STRATEGIES = {
  '/post': { ttl: 60000, forceRefresh: true, maxAge: 30000 }, // 30 seconds max age
  '/get-transactions': { ttl: 120000, forceRefresh: true, maxAge: 60000 },
  '/messages': { ttl: 30000, forceRefresh: true, maxAge: 15000 }, // Very fresh
  '/notifications': { ttl: 45000, forceRefresh: true, maxAge: 20000 },
  '/requests': { ttl: 90000, forceRefresh: true, maxAge: 45000 },
  '/user': { ttl: 0, forceRefresh: true, maxAge: 0 }, // Always fresh user data
  '/is-following-list': { ttl: 60000, forceRefresh: true, maxAge: 30000 },
  '/api/is-following-list': { ttl: 60000, forceRefresh: true, maxAge: 30000 },
  '/api/user-suggestions': { ttl: 120000, forceRefresh: true, maxAge: 60000 },
  '/auth': { ttl: 0, forceRefresh: true, maxAge: 0 }, // Never cache auth
  '/login': { ttl: 0, forceRefresh: true, maxAge: 0 },
  '/logout': { ttl: 0, forceRefresh: true, maxAge: 0 },
  '/verify-token': { ttl: 0, forceRefresh: true, maxAge: 0 },
  '/refresh-token': { ttl: 0, forceRefresh: true, maxAge: 0 }
};

// Helper functions remain the same but with enhanced logging
function isAuthRequest(requestUrl) {
  const authPaths = ['/auth', '/login', '/logout', '/verify-token', '/refresh-token'];
  const isAuth = authPaths.some(path => requestUrl.pathname.startsWith(path)) ||
         requestUrl.searchParams.has('token') ||
         requestUrl.pathname.includes('firebase') ||
         requestUrl.hostname.includes('googleapis.com') ||
         requestUrl.hostname.includes('firebaseio.com');
  
  if (isAuth) {
    console.log(`🔐 [SW] Auth request detected: ${requestUrl.pathname}`);
  }
  return isAuth;
}

function isUserSpecificRequest(requestUrl) {
  const userPaths = ['/user', '/profile', '/messages', '/notifications', '/requests'];
  const isUserSpecific = userPaths.some(path => requestUrl.pathname.startsWith(path)) ||
         requestUrl.searchParams.has('userId') ||
         requestUrl.searchParams.has('token');
  
  if (isUserSpecific) {
    console.log(`👤 [SW] User-specific request detected: ${requestUrl.pathname}`);
  }
  return isUserSpecific;
}

function getCacheStrategy(url) {
  const pathname = new URL(url).pathname;
  for (const [path, strategy] of Object.entries(CACHE_STRATEGIES)) {
    if (pathname.startsWith(path)) {
      console.log(`📋 [SW] Cache strategy for ${pathname}: TTL=${strategy.ttl}, Force=${strategy.forceRefresh}`);
      return strategy;
    }
  }
  return { ttl: 300000, forceRefresh: false, maxAge: 150000 };
}

function isCacheStale(cachedResponse, maxAge) {
  const timestamp = cachedResponse.headers.get('sw-cache-timestamp');
  if (!timestamp) {
    console.log('⏰ [SW] No timestamp found in cached response - considering stale');
    return true;
  }
  
  const age = Date.now() - parseInt(timestamp);
  const isStale = age > maxAge;
  
  console.log(`⏰ [SW] Cache age: ${age}ms, Max age: ${maxAge}ms, Stale: ${isStale}`);
  return isStale;
}

async function fetchAndCache(request, cacheName = DYNAMIC_CACHE_NAME) {
  try {
    console.log(`📡 [SW] Fetching fresh content: ${request.url}`);
    
    // Add cache-busting parameter for dynamic content
    const url = new URL(request.url);
    if (!url.searchParams.has('sw-version')) {
      url.searchParams.set('sw-version', BUILD_TIMESTAMP);
    }
    url.searchParams.set('_t', Date.now().toString());
    
    const bustingRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      mode: request.mode,
      credentials: request.credentials,
      cache: 'no-cache' // Force fresh fetch
    });
    
    const response = await fetch(bustingRequest);
    
    if (response && response.status === 200) {
      const responseClone = response.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cache-timestamp', Date.now().toString());
      headers.set('sw-version', BUILD_TIMESTAMP);

      const modifiedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });

      const cache = await caches.open(cacheName);
      
      // Cache with original request URL (without cache busting params)
      await cache.put(request, modifiedResponse);
      console.log(`✅ [SW] Successfully cached: ${request.url}`);
    } else {
      console.warn(`⚠️ [SW] Not caching response for ${request.url} - Status: ${response?.status}`);
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

  if (requestUrl.hostname.includes('firebaseio.com') || 
      requestUrl.hostname.includes('googleapis.com') ||
      requestUrl.pathname.startsWith('/api/')) {
    return true;
  }
  return false;
}

// ===== ENHANCED Service Worker Events with Aggressive Cache Clearing =====
self.addEventListener('install', (event) => {
  console.log(`📦 [ServiceWorker] Installing version ${SW_VERSION.version}...`);
  
  // Force immediate activation
  self.skipWaiting();
  
  event.waitUntil(
    Promise.all([
      // Clear ALL existing caches first
      caches.keys().then((cacheNames) => {
        console.log(`🗑️ [SW] Found existing caches:`, cacheNames);
        return Promise.all(
          cacheNames.map((name) => {
            if (name.includes('salmart')) {
              console.log(`🗑️ [SW] Deleting old cache during install: ${name}`);
              return caches.delete(name);
            }
          })
        );
      }),
      
      // Then cache new assets
      caches.open(CACHE_NAME).then((cache) => {
        console.log(`📦 [SW] Caching ${urlsToCache.length} URLs...`);
        return cache.addAll(urlsToCache).catch(error => {
          console.error('❌ [ServiceWorker] Failed to cache URLs during install:', error);
          // Try to cache individually
          return Promise.allSettled(
            urlsToCache.map(url => 
              cache.add(url).catch(err => 
                console.error(`❌ Failed to cache ${url}:`, err)
              )
            )
          );
        });
      }),
      
      // Notify all clients about new version immediately
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        console.log(`📢 [SW] Notifying ${clients.length} clients about installation`);
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_VERSION_UPDATE',
            version: SW_VERSION,
            action: 'installed',
            shouldReload: true
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
      // Aggressively delete ALL old caches
      caches.keys().then((cacheNames) => {
        console.log(`🗑️ [SW] Cleaning up caches. Found:`, cacheNames);
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME && name !== DYNAMIC_CACHE_NAME) {
              console.log(`🗑️ [ServiceWorker] Deleting old cache: ${name}`);
              return caches.delete(name);
            }
          })
        );
      }),
      
      // Take control of ALL clients immediately
      self.clients.claim().then(() => {
        console.log('👑 [SW] Claimed all clients');
      }),
      
      // Force refresh all tabs
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        console.log(`🔄 [SW] Force refreshing ${clients.length} clients`);
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_VERSION_UPDATE',
            version: SW_VERSION,
            action: 'activated',
            shouldReload: true,
            forceRefresh: true
          });
        });
      })
    ])
  );
});

// ===== ENHANCED Fetch Handler with Network-First Strategy =====
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and dev tools
  if (event.request.method !== 'GET' ||
      event.request.url.includes('sockjs-node') ||
      event.request.url.includes('hot-update') ||
      event.request.url.includes('chrome-extension')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  
  // Handle version check endpoint
  if (event.request.url.endsWith('/sw-version')) {
    event.respondWith(
      new Response(JSON.stringify(SW_VERSION), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
    );
    return;
  }

  // Always bypass cache for auth requests
  if (isAuthRequest(requestUrl)) {
    console.log(`🔐 [SW] Bypassing all cache for auth: ${event.request.url}`);
    event.respondWith(
      fetch(event.request).catch(() => 
        new Response('Auth service unavailable', { status: 503 })
      )
    );
    return;
  }

  // Handle dynamic content with network-first approach
  if (isDynamicContent(requestUrl)) {
    event.respondWith(handleDynamicContentNetworkFirst(event.request));
    return;
  }

  // Handle static content
  event.respondWith(handleStaticContentNetworkFirst(event.request));
});

// Network-first dynamic content handler
async function handleDynamicContentNetworkFirst(request) {
  const requestUrl = new URL(request.url);
  const strategy = getCacheStrategy(request.url);
  
  console.log(`🔄 [SW] Handling dynamic content: ${request.url}`);
  
  try {
    // Always try network first for critical or user-specific data
    if (strategy.forceRefresh || isUserSpecificRequest(requestUrl) || strategy.ttl === 0) {
      console.log(`📡 [SW] Network-first for critical content: ${request.url}`);
      const networkResponse = await fetchAndCache(request);
      return networkResponse;
    }
    
    // For other content, try network with timeout
    const networkPromise = fetchAndCache(request);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Network timeout')), 3000)
    );
    
    try {
      const networkResponse = await Promise.race([networkPromise, timeoutPromise]);
      console.log(`⚡ [SW] Network success: ${request.url}`);
      return networkResponse;
    } catch (networkError) {
      console.log(`⚠️ [SW] Network failed/timeout, checking cache: ${request.url}`);
      
      // Fall back to cache
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.log(`📦 [SW] Serving from cache after network failure: ${request.url}`);
        // Try to update cache in background
        fetchAndCache(request).catch(() => {});
        return cachedResponse;
      }
      
      throw networkError;
    }
    
  } catch (error) {
    console.error(`❌ [SW] Both network and cache failed for ${request.url}:`, error);
    
    // Return structured error for API requests
    if (request.headers.get('accept')?.includes('application/json')) {
      return new Response(JSON.stringify({
        error: 'Content unavailable',
        offline: true,
        message: 'Please check your connection and try again',
        data: []
      }), {
        status: 503,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    }
    
    throw error;
  }
}

// Network-first static content handler
async function handleStaticContentNetworkFirst(request) {
  console.log(`📄 [SW] Handling static content: ${request.url}`);
  
  try {
    // Try network first for static content too
    console.log(`📡 [SW] Network-first for static: ${request.url}`);
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const responseToCache = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, responseToCache);
      console.log(`✅ [SW] Cached static content: ${request.url}`);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log(`⚠️ [SW] Network failed for static content, checking cache: ${request.url}`);
    
    // Fall back to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`📦 [SW] Serving static from cache: ${request.url}`);
      return cachedResponse;
    }
    
    console.error(`❌ [SW] No cache available for static content: ${request.url}`, error);
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/Offline.html');
      return offlinePage || new Response('Offline - Please check your connection', { 
        status: 503,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    return new Response('Resource unavailable', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// ===== ENHANCED Message Handling =====
self.addEventListener('message', (event) => {
  console.log('📨 [ServiceWorker] Message from client:', event.data);
  
  const data = event.data;
  
  if (data?.type === 'SKIP_WAITING') {
    console.log('⏭️ [ServiceWorker] Skip waiting requested');
    self.skipWaiting();
    return;
  }
  
  if (data?.type === 'GET_VERSION') {
    const response = {
      type: 'SW_VERSION',
      version: SW_VERSION
    };
    if (event.ports[0]) {
      event.ports[0].postMessage(response);
    } else {
      event.source.postMessage(response);
    }
    return;
  }
  
  if (data?.type === 'FORCE_UPDATE') {
    console.log('🔄 [ServiceWorker] Force update requested');
    event.waitUntil(
      Promise.all([
        // Clear all caches
        caches.keys().then(names => 
          Promise.all(names.map(name => caches.delete(name)))
        ),
        // Skip waiting and activate immediately
        self.skipWaiting()
      ])
    );
    return;
  }
  
  if (data?.type === 'CLEAR_ALL_CACHES') {
    console.log('🧹 [ServiceWorker] Clearing all caches');
    event.waitUntil(
      caches.keys().then(cacheNames => 
        Promise.all(
          cacheNames.map(name => {
            console.log(`🗑️ [ServiceWorker] Deleting cache: ${name}`);
            return caches.delete(name);
          })
        )
      ).then(() => {
        // Notify client that caches are cleared
        event.source.postMessage({
          type: 'CACHES_CLEARED',
          success: true
        });
      })
    );
    return;
  }
  
  if (data?.type === 'CLEAR_NOTIFICATIONS') {
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((notification) => notification.close());
      console.log('🧹 [ServiceWorker] Cleared all notifications');
    });
    return;
  }
});

// ===== Background Sync for Critical Updates =====
self.addEventListener('sync', (event) => {
  console.log(`🔄 [SW] Background sync triggered: ${event.tag}`);
  
  if (event.tag === 'background-sync-critical') {
    event.waitUntil(updateCriticalData());
  }
});

async function updateCriticalData() {
  console.log('🔄 [SW] Updating critical data in background...');
  
  const criticalEndpoints = [
    '/post?category=all',
    '/notifications',
    '/messages',
    '/user'
  ];

  const updatePromises = criticalEndpoints.map(async (endpoint) => {
    try {
      const url = `${self.location.origin}${endpoint}?sw-update=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-cache' });
      
      if (response.ok) {
        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        const headers = new Headers(response.headers);
        headers.set('sw-cache-timestamp', Date.now().toString());
        
        const cachedResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: headers
        });
        
        await cache.put(new Request(`${self.location.origin}${endpoint}`), cachedResponse);
        console.log(`✅ [SW] Background updated: ${endpoint}`);
      }
    } catch (error) {
      console.log(`⚠️ [SW] Background update failed for ${endpoint}:`, error.message);
    }
  });

  await Promise.allSettled(updatePromises);
  console.log('✅ [SW] Background sync completed');
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

console.log(`✅ [ServiceWorker] Enhanced version ${SW_VERSION.version} loaded with aggressive cache management and force updates`);