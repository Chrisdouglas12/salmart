 
  // Import Firebase modular SDK
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
  import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging.js';

  // Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyCmu0kXlzWE29eNlRDMoYG0qYyxnC5Vra4",
    authDomain: "salmart-330ab.firebaseapp.com",
    projectId: "salmart-330ab",
    messagingSenderId: "396604566472",
    appId: "1:396604566472:web:60eff66ef26ab223a12efd",
  };

  // Enhanced showToast function using the #toast element
  function showToast(message, color = '#28a745') {
    const toast = document.getElementById('toast');
    if (!toast) {
      console.error('❌ Toast element not found for message:', message);
      console.log(`[Toast Fallback] ${message} (Color: ${color})`);
      return;
    }
    console.log(`[Toast] ${message} (Color: ${color})`);
    toast.textContent = message;
    toast.style.backgroundColor = color;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }

  // Initialize Firebase
  console.log('🔥 [Firebase] Starting Firebase initialization...');
  let app;
  try {
    app = initializeApp(firebaseConfig);
    console.log('✅ [Firebase] Firebase initialized successfully');
  } catch (initErr) {
    console.error('❌ [Firebase] Firebase initialization failed:', initErr, initErr.stack);
    showToast('Failed to initialize Firebase. Notifications unavailable.', '#e74c3c');
    throw initErr; // Propagate error for debugging
  }

  // Initialize Firebase Messaging
  let messaging;
  try {
    messaging = getMessaging(app);
    console.log('✅ [Firebase] Firebase Messaging initialized');
  } catch (messagingErr) {
    console.error('❌ [Firebase] Firebase Messaging initialization failed:', messagingErr, messagingErr.stack);
    showToast('Failed to initialize Firebase Messaging. Notifications unavailable.', '#e74c3c');
    throw messagingErr;
  }

  // Initialize notifications
  async function initializeNotifications() {
    if (!messaging) {
      console.warn('⚠️ [Notifications] Firebase Messaging not initialized, skipping notifications');
      showToast('Notifications unavailable due to initialization error.', '#e74c3c');
      return;
    }

    console.log('🔍 [Notifications] Entering initializeNotifications...');

    // Check Notification API support
    if (!('Notification' in window)) {
      console.warn('⚠️ [Notifications] Notification API not supported in this browser');
      showToast('Your browser does not support notifications. Please use Chrome.', '#e74c3c');
      return;
    }
    console.log('✅ [Notifications] Notification API supported');

    // Check ServiceWorker API support
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ [Notifications] ServiceWorker API not supported in this browser');
      showToast('Your browser does not support service workers. Please use Chrome.', '#e74c3c');
      return;
    }
    console.log('✅ [Notifications] ServiceWorker API supported');

    try {
      // Register ServiceWorker with detailed logging
      console.log('📡 [ServiceWorker] Registering service worker at /firebase-messaging-sw.js...');
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      console.log('✅ [ServiceWorker] ServiceWorker registered with scope:', registration.scope);

      // Log active ServiceWorker state
      if (registration.active) {
        console.log('ℹ️ [ServiceWorker] Active ServiceWorker state:', registration.active.state);
      } else {
        console.warn('⚠️ [ServiceWorker] No active ServiceWorker yet');
      }

      // Request notification permission
      console.log('🔐 [Notifications] Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('ℹ️ [Notifications] Notification permission result:', permission);

      if (permission === 'granted') {
        console.log('✅ [Notifications] Notification permission granted');
        showToast('Notifications enabled, generating FCM token', '#28a745');

        try {
          // Generate FCM token
          console.log('🔑 [FCM] Generating FCM token...');
          const token = await getToken(messaging, {
            vapidKey: 'BCtAsyYJYCSfpg_kXL2aO59szQsPFE3DvmqqLOnW03JTVR88Jb435-jDnUgj0j0mL5VCWLiGGfErTuwQ-XUArho',
            serviceWorkerRegistration: registration,
          });
          console.log('🎉 [FCM] FCM Token generated:', token);
          await saveToken(token);
        } catch (tokenErr) {
          console.error('❌ [FCM] Error generating FCM token:', tokenErr, tokenErr.stack);
          showToast('Failed to generate notification token.', '#e74c3c');
        }
      } else {
        console.warn('⚠️ [Notifications] Notification permission denied:', permission);
        showToast('Please enable notifications in your browser settings.', '#e74c3c');
      }
    } catch (err) {
      console.error('❌ [Notifications] Error initializing notifications:', err, err.stack);
      showToast('Failed to initialize notifications: ' + err.message, '#e74c3c');
      throw err; // Propagate for debugging
    }
  }

  // Save FCM token to server
  async function saveToken(token) {
    console.log('💾 [FCM] Attempting to save FCM token:', token);
    const userId = localStorage.getItem('userId');
    const jwt = localStorage.getItem('authToken');
    console.log('ℹ️ [FCM] User ID:', userId, 'JWT:', jwt ? '[Present]' : '[Missing]');

    if (userId && jwt) {
      try {
        console.log('📤 [FCM] Sending token to server:', `${API_BASE_URL}/api/save-fcm-token`);
        const response = await fetch(`${API_BASE_URL}/api/save-fcm-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
          },
          body: JSON.stringify({ userId, token }),
        });
        const responseText = await response.text();
        if (response.ok) {
          console.log('✅ [FCM] Token saved to server');
          showToast('Notifications enabled successfully!', '#28a745');
        } else {
          console.error('❌ [FCM] Failed to save token:', response.status, responseText);
          showToast('Failed to enable notifications: ' + responseText, '#e74c3c');
        }
      } catch (err) {
        console.error('❌ [FCM] Error saving token:', err, err.stack);
        showToast('Error enabling notifications: ' + err.message, '#e74c3c');
      }
    } else {
      console.warn('⚠️ [FCM] No userId or JWT found:', { userId, jwt });
      showToast('Please log in to enable notifications.', '#e74c3c');
    }
  }

  // Handle foreground messages
  if (messaging) {
    onMessage(messaging, (payload) => {
      console.log('📩 [FCM] Foreground message received:', JSON.stringify(payload, null, 2));
      if (Notification.permission === 'granted') {
        const { title, body, image } = payload.notification || {};
        const { type, postId, senderId } = payload.data || {};

        console.log('🔔 [FCM] Displaying foreground notification:', { title, body, image, type, postId, senderId });

        // WhatsApp-like notification options
        const notificationOptions = {
          body: body || 'New notification',
          icon: '/salmart-192x192.png',
          badge: '/salmart-192x192.png',
          image: image || '/salmart-192x192.png',
          vibrate: [100, 50, 100],
          requireInteraction: true,
          tag: `salmart-${type}-${postId || senderId || Date.now()}`,
          data: { type, postId, senderId, url: getNotificationUrl(type, postId, senderId) },
          actions: [
            { action: 'view', title: 'View' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        };

        try {
          // Display the notification
          const notification = new Notification(title || 'Salmart', notificationOptions);
          console.log('✅ [FCM] Notification displayed:', title);

          // Handle notification click
          notification.onclick = (event) => {
            event.preventDefault();
            const { url } = event.target.data || {};
            console.log('🖱️ [FCM] Notification clicked:', { url, type, postId, senderId });
            if (url) {
              window.focus();
              window.location.href = url;
            }
            notification.close();
          };

          // Handle action buttons
          notification.onclose = () => console.log('🔔 [FCM] Notification closed');
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.action) {
              console.log('🖱️ [FCM] Notification action:', event.data);
              if (event.data.action === 'view') {
                window.focus();
                window.location.href = event.data.url;
              }
            }
          });
        } catch (notificationErr) {
          console.error('❌ [FCM] Error displaying notification:', notificationErr, notificationErr.stack);
          showToast('Failed to display notification.', '#e74c3c');
        }
      } else {
        console.warn('⚠️ [FCM] Cannot display notification: Permission not granted');
      }
    });
  } else {
    console.warn('⚠️ [FCM] Messaging not initialized, skipping foreground message handling');
  }

  // Helper function to generate notification URL
  function getNotificationUrl(type, postId, senderId) {
    console.log('🔗 [FCM] Generating notification URL:', { type, postId, senderId });
    if (type === 'like' || type === 'comment') {
      const url = `product.html?postId=${postId}`;
      console.log('✅ [FCM] Generated URL:', url);
      return url;
    } else if (type === 'message') {
      const url = `Messages.html?userId=${senderId}`;
      console.log('✅ [FCM] Generated URL:', url);
      return url;
    }
    console.log('ℹ️ [FCM] Fallback URL: /');
    return '/';
  }

  // Initialize notifications on page load
  console.log('🌐 [Notifications] Adding load event listener...');
  window.addEventListener('load', async () => {
    console.log('🌐 [Notifications] Page loaded, initializing notifications...');
    try {
      await initializeNotifications();
      console.log('✅ [Notifications] Notification initialization complete');
    } catch (err) {
      console.error('❌ [Notifications] Failed to initialize notifications:', err, err.stack);
      showToast('Notification setup failed: ' + err.message, '#e74c3c');
    }
  });

  // Debug ServiceWorker state on load
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('ℹ️ [ServiceWorker] Current ServiceWorker registrations:', registrations.map(r => ({
        scope: r.scope,
        scriptURL: r.active?.scriptURL,
        state: r.active?.state,
      })));
    } catch (err) {
      console.error('❌ [ServiceWorker] Error checking registrations:', err, err.stack);
    }
  });

