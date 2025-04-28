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

messaging.onBackgroundMessage((payload) => {
  try {
    console.log('Background message received:', payload);

    // Ensure notification data exists
    const notification = payload.notification || {};
    const data = payload.data || {};

    const { title = 'Salmart Notification', body = '' } = notification;
    const { type, postId, senderId } = data;

    const notificationOptions = {
      body,
      icon: '/favicon.ico', // Ensure this exists in /public
      badge: '/badge.png', // Ensure this exists in /public
      data: { type, postId, senderId },
    };

    self.registration.showNotification(title, notificationOptions);
  } catch (error) {
    console.error('Error handling background message:', error);
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification.data);
  event.notification.close();

  try {
    const { type, postId, senderId } = event.notification.data || {};
    let url = 'https://salmart.vercel.app'; // Default URL

    if (type === 'like' || type === 'comment') {
      url = `https://salmart.vercel.app/post.html?postId=${postId}`;
    } else if (type === 'message') {
      url = `https://salmart.vercel.app/Messages.html?userId=${senderId}`;
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
  } catch (error) {
    console.error('Error handling notification click:', error);
  }
});