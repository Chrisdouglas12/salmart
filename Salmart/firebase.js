// firebase.js - Firebase configuration for React Native
import { initializeApp } from './firebase/app';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration (same as your web app)
const firebaseConfig = {
  apiKey: "AIzaSyCmu0kXlzWE29eNlRDMoYG0qYyxnC5Vra4",
  authDomain: "salmart-330ab.firebaseapp.com",
  projectId: "salmart-330ab",
  messagingSenderId: "396604566472",
  appId: "1:396604566472:web:60eff66ef26ab223a12efd",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Your API base URL - using the same as your login
const API_BASE_URL = 'https://salmart.onrender.com';

class NotificationManager {
  constructor() {
    this.expoPushToken = null;
    this.notificationListener = null;
    this.responseListener = null;
  }

  // Initialize push notifications
  async initializeNotifications() {
    try {
      console.log('🔔 [Notifications] Initializing push notifications...');
      
      // Register for push notifications
      const token = await this.registerForPushNotificationsAsync();
      if (token) {
        this.expoPushToken = token;
        await this.saveTokenToServer(token);
      }

      // Set up notification listeners
      this.setupNotificationListeners();

      console.log('✅ [Notifications] Push notifications initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ [Notifications] Failed to initialize:', error);
      return false;
    }
  }

  // Register for push notifications (equivalent to your web FCM setup)
  async registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#28a745',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.warn('⚠️ [Notifications] Push notification permissions denied');
        return null;
      }
      
      try {
        token = (await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })).data;
        console.log('🎉 [Notifications] Expo push token generated:', token);
      } catch (error) {
        console.error('❌ [Notifications] Error generating push token:', error);
        return null;
      }
    } else {
      console.warn('⚠️ [Notifications] Must use physical device for Push Notifications');
      return null;
    }

    return token;
  }

  // Save token to your backend (equivalent to your saveToken function)
  async saveTokenToServer(token) {
    try {
      console.log('💾 [Notifications] Saving token to server...');
      
      // Get user data from AsyncStorage (you'll need to import AsyncStorage)
      // For now, using a placeholder - replace with your actual user data retrieval
      const userId = await this.getUserId();
      const authToken = await this.getAuthToken();

      if (!userId || !authToken) {
        console.warn('⚠️ [Notifications] No user ID or auth token found');
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/api/save-fcm-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ 
          userId, 
          token,
          platform: Platform.OS,
          deviceType: 'expo'
        }),
      });

      if (response.ok) {
        console.log('✅ [Notifications] Token saved to server successfully');
        return true;
      } else {
        const errorText = await response.text();
        console.error('❌ [Notifications] Failed to save token:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('❌ [Notifications] Error saving token to server:', error);
      return false;
    }
  }

  // Set up notification listeners (equivalent to your onMessage handler)
  setupNotificationListeners() {
    // Listener for notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('📩 [Notifications] Foreground notification received:', notification);
      this.handleForegroundNotification(notification);
    });

    // Listener for when user taps notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 [Notifications] Notification tapped:', response);
      this.handleNotificationResponse(response);
    });
  }

  // Handle notifications received in foreground
  handleForegroundNotification(notification) {
    const { title, body, data } = notification.request.content;
    console.log('🔔 [Notifications] Processing foreground notification:', { title, body, data });

    // You can customize this based on your app's needs
    // For example, show an in-app notification or update UI
  }

  // Handle notification taps (equivalent to your notification click handler)
  handleNotificationResponse(response) {
    const { data } = response.notification.request.content;
    console.log('🖱️ [Notifications] Handling notification tap with data:', data);

    // Navigate based on notification type
    if (data) {
      this.navigateBasedOnNotificationType(data);
    }
  }

  // Navigate to appropriate screen based on notification type
  navigateBasedOnNotificationType(data) {
    const { type, postId, senderId } = data;
    
    // You'll need to implement navigation based on your React Navigation setup
    // This is just an example structure
    switch (type) {
      case 'like':
      case 'comment':
      case 'new_post':
      case 'deal':
        if (postId) {
          // Navigate to product/post screen
          console.log('🧭 [Navigation] Navigating to post:', postId);
          // navigation.navigate('Product', { postId });
        }
        break;

      case 'message':
        if (senderId) {
          // Navigate to messages screen
          console.log('🧭 [Navigation] Navigating to messages:', senderId);
          // navigation.navigate('Messages', { userId: senderId });
        }
        break;

      case 'payment':
      case 'delivery':
        // Navigate to deals screen
        console.log('🧭 [Navigation] Navigating to deals');
        // navigation.navigate('Deals');
        break;

      default:
        // Navigate to home screen
        console.log('🧭 [Navigation] Navigating to home');
        // navigation.navigate('Home');
    }
  }

  // Get user data from AsyncStorage (matching your login system)
  async getUserId() {
    try {
      const userId = await AsyncStorage.getItem('userId');
      return userId;
    } catch (error) {
      console.error('Error getting userId:', error);
      return null;
    }
  }

  async getAuthToken() {
    try {
      // Try both 'authToken' and 'token' keys for compatibility
      const authToken = await AsyncStorage.getItem('authToken') || await AsyncStorage.getItem('token');
      return authToken;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  // Clean up listeners
  cleanup() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
  }

  // Test notification function (for development)
  async sendTestNotification() {
    if (this.expoPushToken) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Test Notification",
          body: "This is a test notification from your app!",
          data: { type: 'test' },
        },
        trigger: { seconds: 1 },
      });
    }
  }
}

// Export singleton instance
const notificationManager = new NotificationManager();
export default notificationManager;

