import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

// Import screens
import LoginScreen from './screens/LoginScreen';
import RegistrationScreen from './screens/RegistrationScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';

const Stack = createStackNavigator();

export default function App() {
  // In a real app, this would check AsyncStorage for login status
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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
                {(props) => <LoginScreen {...props} setIsLoggedIn={setIsLoggedIn} />}
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
              <Stack.Screen 
                name="MessagesScreen" 
                component={MessagesScreen}
                options={{ 
                  title: 'Messages',
                  headerShown: false,
                }}
              />

              <Stack.Screen 
                name="Search" 
                component={SearchScreen}
                options={{ 
                  title: 'Search',
                  headerShown: true,
                  headerStyle: { backgroundColor: '#28a745' },
                  headerTintColor: '#fff',
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
                }}
              />
              <Stack.Screen 
                name="Profile" 
                component={ProfileScreen}
                options={{ 
                  title: 'Profile',
                  headerShown: true,
                  headerStyle: { backgroundColor: '#28a745' },
                  headerTintColor: '#fff',
                }}
              />
              <Stack.Screen 
                name="Chat" 
                component={ChatScreen}
                options={({ route }) => ({
                  title: route.params?.recipientName || 'Chat',
                  headerShown: false,
                  headerStyle: { backgroundColor: '#28a745' },
                  headerTintColor: '#fff',
                })}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

// Placeholder screens for the additional functionality
const SearchScreen = () => {
  const { View, Text } = require('react-native');
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>🔍 Search functionality coming soon!</Text>
    </View>
  );
};

const CreateAdScreen = () => {
  const { View, Text } = require('react-native');
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>📢 Create Ad functionality coming soon!</Text>
    </View>
  );
};

const CreateRequestScreen = () => {
  const { View, Text } = require('react-native');
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>➕ Create Request functionality coming soon!</Text>
    </View>
  );
};

const ProfileScreen = () => {
  const { View, Text } = require('react-native');
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>👤 Profile functionality coming soon!</Text>
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