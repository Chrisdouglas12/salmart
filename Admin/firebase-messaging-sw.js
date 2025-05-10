try {
  console.log('🔥 [ServiceWorker] Loading Firebase scripts...');
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js');
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
  messaging.onBackgroundMessage((payload) => {
    try {
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

      console.log('🔔 [ServiceWorker] Displaying notification:', { title, body, type, postId, senderId });
      self.registration.showNotification(title, notificationOptions);
    } catch (error) {
      console.error('❌ [ServiceWorker] Error handling background message:', error, error.stack);
    }
  });

  console.log('🔍 [ServiceWorker] Setting up notification click handler...');
  self.addEventListener('notificationclick', (event) => {
    try {
      console.log('🖱️ [ServiceWorker] Notification clicked:', {
        action: event.action,
        data: event.notification.data,
      });
      event.notification.close();

      const { type, postId, senderId, url } = event.notification.data || {};

      if (event.action === 'view' && url) {
        event.waitUntil(openOrFocusWindow(url));
      } else if (event.action === 'dismiss') {
        // Notification already closed
      } else if (url) {
        event.waitUntil(openOrFocusWindow(url));
      }

      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            action: event.action,
            type,
            postId,
            senderId,
            url,
          });
        });
      });
    } catch (error) {
      console.error('❌ [ServiceWorker] Error handling notification click:', error, error.stack);
    }
  });

  async function openOrFocusWindow(url) {
    try {
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          console.log('✅ [ServiceWorker] Focusing existing window:', url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        console.log('✅ [ServiceWorker] Opening new window:', url);
        return clients.openWindow(url);
      }
    } catch (error) {
      console.error('❌ [ServiceWorker] Error opening/focusing window:', error, error.stack);
    }
  }

  function getNotificationUrl(type, postId, senderId) {
    console.log('🔗 [ServiceWorker] Generating notification URL:', { type, postId, senderId });
    const baseUrl = 'https://salmart.vercel.app';
    if (type === 'like' || type === 'comment') {
      const url = `${baseUrl}/post.html?postId=${postId}`;
      console.log('✅ [ServiceWorker] Generated URL:', url);
      return url;
    } else if (type === 'message') {
      const url = `${baseUrl}/Messages.html?userId=${senderId}`;
      console.log('✅ [ServiceWorker] Generated URL:', url);
      return url;
    }
    console.log('ℹ️ [ServiceWorker] Fallback URL:', baseUrl);
    return baseUrl;
  }
} catch (error) {
  console.error('❌ [ServiceWorker] Initialization failed:', error, error.stack);
  throw error; // Propagate error to fail registration
}