// ===== Use Firebase 8.x (recommended for service workers) =====
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

  console.log('🔥 [ServiceWorker] Initializing Firebase...');
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
    const { url } = event.notification.data || {};
    if (url) {
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
  console.error('❌ [ServiceWorker] Initialization failed:', error);
  throw error;
}