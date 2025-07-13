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
  throw initErr;
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

    // Request notification permission with more persistent approach
    console.log('🔐 [Notifications] Requesting notification permission...');
    let permission = Notification.permission;
    
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    
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
      showToast('Please enable notifications in your browser settings for the best experience.', '#e74c3c');
    }
  } catch (err) {
    console.error('❌ [Notifications] Error initializing notifications:', err, err.stack);
    showToast('Failed to initialize notifications: ' + err.message, '#e74c3c');
    throw err;
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

// Enhanced notification display with WhatsApp-like behavior
function displayWhatsAppStyleNotification(title, body, options = {}) {
  const notificationOptions = {
    body: body || 'New notification',
    icon: options.icon || '/salmart-192x192.png',
    badge: '/salmart-192x192.png',
    image: options.image,
    vibrate: [200, 100, 200], // More pronounced vibration
    requireInteraction: false, // Allow auto-dismiss like WhatsApp
    silent: false, // Enable sound
    tag: options.tag || `salmart-${Date.now()}`,
    renotify: true, // Show even if tag exists
    timestamp: Date.now(),
    data: options.data || {},
    actions: [
      { action: 'view', title: '👁️ View', icon: '/icons/view.png' },
      { action: 'dismiss', title: '❌ Dismiss', icon: '/icons/dismiss.png' }
    ],
    // These properties enhance the WhatsApp-like experience
    dir: 'auto',
    lang: 'en'
  };

  // Create and show notification
  const notification = new Notification(title || 'Salmart', notificationOptions);
  
  // Auto-dismiss after 5 seconds (like WhatsApp)
  setTimeout(() => {
    notification.close();
  }, 5000);

  // Handle notification click
  notification.onclick = (event) => {
    event.preventDefault();
    const { url } = event.target.data || {};
    console.log('🖱️ [FCM] Notification clicked:', { url });
    
    // Focus window and navigate
    window.focus();
    if (url) {
      window.location.href = url;
    }
    notification.close();
  };

  // Handle notification close
  notification.onclose = () => {
    console.log('🔔 [FCM] Notification closed');
  };

  // Handle errors
  notification.onerror = (error) => {
    console.error('❌ [FCM] Notification error:', error);
  };

  return notification;
}

// Enhanced foreground message handling
if (messaging) {
  onMessage(messaging, (payload) => {
    console.log('📩 [FCM] Foreground message received:', JSON.stringify(payload, null, 2));
    
    if (Notification.permission === 'granted') {
      const { title, body, image } = payload.notification || {};
      const { type, postId, senderId } = payload.data || {};

      console.log('🔔 [FCM] Displaying foreground notification:', { title, body, image, type, postId, senderId });

      // Display WhatsApp-style notification
      displayWhatsAppStyleNotification(title, body, {
        image: image || '/salmart-192x192.png',
        tag: `salmart-${type}-${postId || senderId || Date.now()}`,
        data: { 
          type, 
          postId, 
          senderId, 
          url: getNotificationUrl(type, postId, senderId),
          timestamp: Date.now()
        }
      });

      // Play notification sound (optional)
      playNotificationSound();
      
    } else {
      console.warn('⚠️ [FCM] Cannot display notification: Permission not granted');
      // Show in-app notification as fallback
      showInAppNotification(payload.notification?.title, payload.notification?.body);
    }
  });
} else {
  console.warn('⚠️ [FCM] Messaging not initialized, skipping foreground message handling');
}

// Play notification sound
function playNotificationSound() {
  try {
    const audio = new Audio('/sounds/notification.mp3'); // Add your notification sound
    audio.volume = 0.5;
    audio.play().catch(e => console.log('🔇 [Audio] Could not play notification sound:', e));
  } catch (error) {
    console.log('🔇 [Audio] Audio not available:', error);
  }
}

// Fallback in-app notification for when push notifications are denied
function showInAppNotification(title, body) {
  // Create in-app notification element
  const inAppNotification = document.createElement('div');
  inAppNotification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #128C7E;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 300px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: slideIn 0.3s ease-out;
  `;
  
  inAppNotification.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;">${title || 'Salmart'}</div>
    <div style="font-size: 14px; opacity: 0.9;">${body || 'New notification'}</div>
  `;
  
  // Add slide-in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(inAppNotification);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    inAppNotification.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => {
      if (inAppNotification.parentNode) {
        inAppNotification.parentNode.removeChild(inAppNotification);
      }
    }, 300);
  }, 4000);
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

// Enhanced service worker message handling
navigator.serviceWorker.addEventListener('message', (event) => {
  console.log('📨 [ServiceWorker] Message received:', event.data);
  
  if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
    const { url, action } = event.data;
    
    if (action === 'view' && url) {
      window.focus();
      window.location.href = url;
    }
  }
});

// Request persistent notification permission on user interaction
document.addEventListener('click', async () => {
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('✅ [Notifications] Permission granted after user interaction');
      showToast('Notifications enabled!', '#28a745');
    }
  }
}, { once: true });

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

// Handle visibility change for better notification management
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('👁️ [Visibility] App became visible, clearing notifications');
    // Clear notifications when app becomes visible
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.getNotifications().then(notifications => {
          notifications.forEach(notification => notification.close());
        });
      });
    }
  }
});

// Export for external use
window.SalmartNotifications = {
  displayNotification: displayWhatsAppStyleNotification,
  playSound: playNotificationSound,
  showInApp: showInAppNotification
};