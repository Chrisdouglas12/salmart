importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCmu0kXlzWE29eNlRDMoYG0qYyxnC5Vra4",
  authDomain: "salmart-330ab.firebaseapp.com",
  projectId: "salmart-330ab",
  messagingSenderId: "396604566472",
  appId: "1:396604566472:web:60eff66ef26ab223a12efd"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);

  const { title, body } = payload.notification;
  const { type, postId, senderId } = payload.data || {};

  const notificationOptions = {
    body,
    icon: '/favicon.ico', // Replace with your app icon
    badge: '/badge.png', // Optional: small badge icon
    data: { type, postId, senderId },
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification.data);
  event.notification.close();

  const { type, postId, senderId } = event.notification.data || {};
  let url = 'https://salmart.vercel.app'; // Default URL

  if (type === 'like' || type === 'comment') {
    url = `https://salmart.vercel.app/post.html?postId=${postId}`; // Adjust to your post page
  } else if (type === 'message') {
    url = `https://salmart.vercel.app/Messages.html?userId=${senderId}`; // Adjust to your messages page
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if none found
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});