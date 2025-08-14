import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

// Import screens
import LoginScreen from './LoginScreen';
import RegistrationScreen from './RegistrationScreen';
import BottomTabNavigator from './BottomTabNavigator';

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
                name="MainTabs" 
                component={BottomTabNavigator} 
              />
              {/* Add other screens that should be accessible after login */}
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
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

// Placeholder screens for the additional functionality
const SearchScreen = () => {
  const { View, Text, StyleSheet } = require('react-native');
  return (
    <View style={searchStyles.container}>
      <Text style={searchStyles.text}>🔍 Search functionality coming soon!</Text>
    </View>
  );
};

const CreateAdScreen = () => {
  const { View, Text, StyleSheet } = require('react-native');
  return (
    <View style={searchStyles.container}>
      <Text style={searchStyles.text}>📢 Create Ad functionality coming soon!</Text>
    </View>
  );
};

const CreateRequestScreen = () => {
  const { View, Text, StyleSheet } = require('react-native');
  return (
    <View style={searchStyles.container}>
      <Text style={searchStyles.text}>➕ Create Request functionality coming soon!</Text>
    </View>
  );
};

const searchStyles = {
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