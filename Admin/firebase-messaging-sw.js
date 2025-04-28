importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging.js');

const firebaseConfig = {
  apiKey: "AIzaSyCmu0kXlzWE29eNlRDMoYG0qYyxnC5Vra4",
  authDomain: "salmart-330ab.firebaseapp.com",
  projectId: "salmart-330ab",
  messagingSenderId: "396604566472",
  appId: "1:396604566472:web:60eff66ef26ab223a12efd",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

console.log('🔥 Service Worker: Firebase Messaging initialized');

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  try {
    console.log('📩 Service Worker: Background message received:', JSON.stringify(payload, null, 2));

    // Ensure notification and data exist
    const notification = payload.notification || {};
    const data = payload.data || {};

    const { title = 'Salmart', body = 'New notification', image } = notification;
    const { type, postId, senderId } = data;

    // WhatsApp-like notification options
    const notificationOptions = {
      body,
      icon: '/images/icon-128x128.png', // High-quality 128x128px icon
      badge: '/images/badge-128x128.png', // Monochrome 128x128px badge for tray
      image: image || '/images/notification-banner.jpg', // Optional banner image (450px wide recommended)
      vibrate: [100, 50, 100], // Vibration pattern for Android (not supported on iOS)
      requireInteraction: true, // Keep on screen until user interacts (Chrome/Edge)
      tag: `salmart-${type}-${postId || senderId || Date.now()}`, // Prevent duplicate notifications
      data: {
        type,
        postId,
        senderId,
        url: getNotificationUrl(type, postId, senderId)
      },
      actions: [
        { action: 'view', title: 'View' }, // Action button for navigation
        { action: 'dismiss', title: 'Dismiss' } // Action button to close
      ]
    };

    console.log('🔔 Service Worker: Displaying notification:', { title, body, type, postId, senderId });

    // Show the notification
    self.registration.showNotification(title, notificationOptions);
  } catch (error) {
    console.error('❌ Service Worker: Error handling background message:', error);
  }
});

// Helper function to generate notification URL
function getNotificationUrl(type, postId, senderId) {
  const baseUrl = 'https://salmart.vercel.app';
  if (type === 'like' || type === 'comment') {
    return `${baseUrl}/post.html?postId=${postId}`;
  } else if (type === 'message') {
    return `${baseUrl}/Messages.html?userId=${senderId}`;
  }
  return baseUrl; // Default URL
}

// Handle notification click and actions
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Service Worker: Notification clicked:', {
    action: event.action,
    data: event.notification.data
  });
  event.notification.close();

  try {
    const { type, postId, senderId, url } = event.notification.data || {};

    // Handle action buttons or default click
    if (event.action === 'view' && url) {
      event.waitUntil(openOrFocusWindow(url));
    } else if (event.action === 'dismiss') {
      // Notification is already closed, no further action needed
    } else if (url) {
      // Default click behavior
      event.waitUntil(openOrFocusWindow(url));
    }

    // Post message to clients for action handling (if needed by client-side code)
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          action: event.action,
          type,
          postId,
          senderId,
          url
        });
      });
    });
  } catch (error) {
    console.error('❌ Service Worker: Error handling notification click:', error);
  }
});

// Helper function to focus or open a window
async function openOrFocusWindow(url) {
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    if (client.url === url && 'focus' in client) {
      return client.focus();
    }
  }
  if (clients.openWindow) {
    return clients.openWindow(url);
  }
}