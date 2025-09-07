import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import screens
import LoginScreen from './screens/LoginScreen';
import RegistrationScreen from './screens/RegistrationScreen';
import BottomTabNavigator from './BottomTabNavigator';
import ChatScreen from './screens/ChatScreen';
import MessagesScreen from './screens/MessagesScreen'

// Import notification manager
import notificationManager from './firebase';

const Stack = createStackNavigator();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize app and check login status
    const initializeApp = async () => {
      try {
        // Check login status from AsyncStorage
        const userToken = await AsyncStorage.getItem('authToken');
        const userId = await AsyncStorage.getItem('userId');
        
        if (userToken && userId) {
          setIsLoggedIn(true);
          // Initialize notifications for logged in users
          await notificationManager.initializeNotifications();
        } else {
          setIsLoggedIn(false);
        }
      } catch (error) {
        console.error('Error initializing app:', error);
        setIsLoggedIn(false);
      } finally {
        setIsInitialized(true);
      }
    };

    initializeApp();

    // Cleanup notifications on app unmount
    return () => {
      notificationManager.cleanup();
    };
  }, []);

  // Handle login state change
  useEffect(() => {
    if (isLoggedIn && isInitialized) {
      // Initialize notifications when user logs in
      notificationManager.initializeNotifications();
    }
  }, [isLoggedIn, isInitialized]);

  // Show loading screen while initializing
  if (!isInitialized) {
    const { View, ActivityIndicator, Text } = require('react-native');
    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff'
      }}>
        <ActivityIndicator size="large" color="#28a745" />
        <Text style={{ marginTop: 16, color: '#666' }}>Loading...</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isLoggedIn ? (
            // Auth Stack
            <>
              <Stack.Screen 
                name="Login" 
                options={{ title: 'Sign In' }}
              >
                {(props) => (
                  <LoginScreen 
                    {...props} 
                    setIsLoggedIn={setIsLoggedIn}
                    onLoginSuccess={async () => {
                      // Initialize notifications after successful login
                      await notificationManager.initializeNotifications();
                    }}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen 
                name="Register" 
                component={RegistrationScreen} 
                options={{ 
                  title: 'Create Account',
                  headerShown: true,
                  headerStyle: { backgroundColor: '#007AFF' },
                  headerTintColor: '#fff',
                  headerTitleStyle: { fontWeight: 'bold' },
                }}
              />
            </>
          ) : (
            // Main App Stack
            <>
              {/* Main Tab Navigator */}
              <Stack.Screen 
                name="MainTabs" 
                component={BottomTabNavigator}
                options={{ 
                  headerShown: false,
                }}
              />

              {/* Modal/Overlay screens */}
              <Stack.Screen 
                name="Search" 
                component={SearchScreen}
                options={{ 
                  title: 'Search',
                  headerShown: true,
                  headerStyle: { backgroundColor: '#28a745' },
                  headerTintColor: '#fff',
                  presentation: 'modal',
                }}
              />
              <Stack.Screen 
                name="CreateAd" 
                component={CreateAdScreen}
                options={{ 
                  title: 'Create Advertisement',
                  headerShown: true,
                  headerStyle: { backgroundColor: '#28a745' },
                  headerTintColor: '#fff',
                  presentation: 'modal',
                }}
              />
              <Stack.Screen 
                name="CreateRequest" 
                component={CreateRequestScreen}
                options={{ 
                  title: 'Create Request',
                  headerShown: true,
                  headerStyle: { backgroundColor: '#007AFF' },
                  headerTintColor: '#fff',
                  presentation: 'modal',
                }}
              />
              
              {/* Individual Chat Screen */}
              <Stack.Screen 
                name="Chat" 
                component={ChatScreen}
                options={({ route }) => ({
                  title: route.params?.recipientName || 'Chat',
                  headerShown: false,
                  headerStyle: { backgroundColor: '#28a745' },
                  headerTintColor: '#fff',
                  headerBackTitleVisible: false,
                })}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

// Enhanced notification manager integration for the app
class AppNotificationManager {
  static async handleLogout() {
    try {
      // Clear user data
      await AsyncStorage.multiRemove(['authToken', 'userId', 'userEmail']);
      
      // Clear notifications
      notificationManager.cleanup();
      
      console.log('User logged out and notifications cleared');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  static async handleLogin(userToken, userId, userEmail) {
    try {
      // Save user data
      await AsyncStorage.multiSet([
        ['authToken', userToken],
        ['userId', userId],
        ['userEmail', userEmail]
      ]);
      
      // Initialize notifications
      await notificationManager.initializeNotifications();
      
      console.log('User logged in and notifications initialized');
    } catch (error) {
      console.error('Error during login setup:', error);
    }
  }
}

// Export the app notification manager for use in other screens
export { AppNotificationManager };

// Placeholder screens for the additional functionality
const SearchScreen = () => {
  const { View, Text } = require('react-native');
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>Search functionality coming soon!</Text>
    </View>
  );
};

const CreateAdScreen = () => {
  const { View, Text } = require('react-native');
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>Create Ad functionality coming soon!</Text>
    </View>
  );
};

const CreateRequestScreen = () => {
  const { View, Text } = require('react-native');
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>Create Request functionality coming soon!</Text>
    </View>
  );
};

const placeholderStyles = {
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
};