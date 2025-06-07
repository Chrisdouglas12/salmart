// This file is firebase-messaging-sw.js

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

  messaging.setBackgroundMessageHandler((payload) => {
    console.log('📩 [ServiceWorker] Background message received:', payload);

    const notification = payload.notification || {};
    const data = payload.data || {};
    const { title = 'Salmart', body = 'New notification', image } = notification;
    const { type, postId, senderId } = data;

    const notificationOptions = {
      body,
      icon: '/salmart-192x192.png', // Ensure this path is correct AND exists in your manifest.json
      badge: '/salmart-192x192.png', // Ensure this path is correct AND exists in your manifest.json
      image: image || '/salmart-192x192.png', // Ensure this path is correct AND exists in your manifest.json
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
      requireInteraction: true,
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
    // Note: The base URL for the service worker notifications should be the deployed URL
    // since this runs in the background. Your main script's baseUrl is good for the client.
    const baseUrl = 'https://salmart.vercel.app'; // Or https://salmart.onrender.com
    if (type === 'like' || type === 'comment') return `${baseUrl}/product.html?postId=${postId}`;
    if (type === 'message') return `${baseUrl}/Messages.html?userId=${senderId}`;
    return baseUrl;
  }

} catch (error) {
  console.error('❌ [ServiceWorker] Firebase init failed:', error);
}

// ===== PWA Caching (Crucial for Install Prompt) =====
const CACHE_NAME = 'salmart-cache-v3.1.4'; // Increment this on new deployments to update cache
const urlsToCache = [
  '/',
  '/index.html',
  '/Style.css',
  '/homeScript.js', // This script itself!
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
  '/Badge.js', // Corrected from Badges.js (plural)
  '/salmart-192x192.png', // Ensure this exists
  '/salmart-512x512.png', // Ensure this exists and is listed in manifest
  // IMPORTANT: Ensure manifest.json is also in this list
  '/manifest.json',
  '/Offline.html', // Optional fallback page (add to public folder)

  // Add any other critical assets: fonts, images, etc.
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Serif+Display:ital@0;1&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap'
];

self.addEventListener('install', (event) => {
  console.log('📦 [ServiceWorker] Installing and caching static assets...');
  self.skipWaiting(); // Activates new SW immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use a try-catch for addAll to log problematic URLs
      return cache.addAll(urlsToCache).catch(error => {
        console.error('❌ [ServiceWorker] Failed to cache some URLs during install:', error);
        // You might want to remove the specific failing URL from urlsToCache
        // or handle it more robustly. For now, logging is good.
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
          if (name !== CACHE_NAME) {
            console.log(`🗑️ [ServiceWorker] Deleting old cache: ${name}`);
            return caches.delete(name);
          }
        })
      )
    ).then(() => clients.claim()) // Takes control of existing pages
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle navigation and GET requests for caching strategy
  if (event.request.method === 'GET' && !event.request.url.includes('sockjs-node') && !event.request.url.includes('hot-update')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          console.log(`Serve from cache: ${event.request.url}`);
          return cachedResponse;
        }

        console.log(`Fetch from network and cache: ${event.request.url}`);
        return fetch(event.request)
          .then((networkResponse) => {
            // Only cache successful responses (status 200)
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
            // For other failing requests (e.g., images), you might want to return a fallback image
            // or just let the browser handle the network error.
            return new Response('Network error occurred', { status: 503, statusText: 'Service Unavailable' });
          });
      })
    );
  }
});
