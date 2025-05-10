// ===================== Firebase Service Worker (Firebase 8.x.x) =====================

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
    appId: "1:396604566472:web:60eff66ef26ab223a12efd",
  };

  console.log('🔥 [ServiceWorker] Initializing Firebase...');
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  console.log('✅ [ServiceWorker] Firebase Messaging initialized');

  console.log('🔍 [ServiceWorker] Setting up background message handler...');
  messaging.setBackgroundMessageHandler((payload) => {
    console.log('📩 [ServiceWorker] Background message received:', JSON.stringify(payload, null, 2));

    const notification = payload.notification || {};
    const data = payload.data || {};

    const { title = 'Salmart', body = 'New notification', image } = notification;
    const { type, postId, senderId } = data;

    const notificationOptions = {
      body,
      icon: '/images/icon-128x128.png',
      badge: '/images/badge-128x128.png',
      image: image || '/images/notification-banner.jpg',
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
    };

    return self.registration.showNotification(title, notificationOptions);
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const { type, postId, senderId, url } = event.notification.data || {};

    if (event.action === 'view' && url) {
      event.waitUntil(clients.openWindow(url));
    } else if (url) {
      event.waitUntil(clients.openWindow(url));
    }
  });

  function getNotificationUrl(type, postId, senderId) {
    const baseUrl = 'https://salmart.vercel.app';
    if (type === 'like' || type === 'comment') return `${baseUrl}/post.html?postId=${postId}`;
    if (type === 'message') return `${baseUrl}/Messages.html?userId=${senderId}`;
    return baseUrl;
  }

} catch (error) {
  console.error('❌ [ServiceWorker] Initialization failed:', error, error.stack);
  throw error;
}


// ===================== Firebase Service Worker (Firebase 9.x.x) =====================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getMessaging, onBackgroundMessage } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-sw.js';

const firebaseConfig = {
  apiKey: "AIzaSyCmu0kXlzWE29eNlRDMoYG0qYyxnC5Vra4",
  authDomain: "salmart-330ab.firebaseapp.com",
  projectId: "salmart-330ab",
  messagingSenderId: "396604566472",
  appId: "1:396604566472:web:60eff66ef26ab223a12efd",
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  const { title, body, image } = payload.notification;
  const notificationOptions = {
    body,
    icon: '/images/icon-128x128.png',
    image,
    vibrate: [100, 50, 100],
  };
  self.registration.showNotification(title, notificationOptions);
});
