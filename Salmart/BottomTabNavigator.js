import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';

// Import your actual screens
import MessageScreen from './screens/MessagesScreen'; // Your actual messages screen

// Placeholder screens (create these later)
const HomeScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>🏪 Market Screen</Text>
    <Text style={styles.placeholderSubtext}>Coming Soon!</Text>
  </View>
);

const RequestsScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>🗒️ Requests Screen</Text>
    <Text style={styles.placeholderSubtext}>Coming Soon!</Text>
  </View>
);

const AlertsScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>🔔 Alerts Screen</Text>
    <Text style={styles.placeholderSubtext}>Coming Soon!</Text>
  </View>
);

const DealsScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>🛒 Deals Screen</Text>
    <Text style={styles.placeholderSubtext}>Coming Soon!</Text>
  </View>
);

const ProfileScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>👤 Profile Screen</Text>
    <Text style={styles.placeholderSubtext}>Coming Soon!</Text>
  </View>
);

const Tab = createBottomTabNavigator();

// Custom Tab Bar Icon Component
const TabIcon = ({ focused, emoji, label }) => (
  <View style={styles.tabIconContainer}>
    <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.6 }]}>{emoji}</Text>
    <Text style={[
      styles.tabLabel, 
      { color: focused ? '#28a745' : '#666', fontWeight: focused ? '600' : '400' }
    ]}>
      {label}
    </Text>
  </View>
);

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Messages" // Set Messages as the default tab
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#eee',
          paddingBottom: 40, // Increased bottom padding for safe area
          paddingTop: 10,
          height: 80, // Increased height to accommodate padding
          position: 'absolute', // Position it above content
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Market"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} emoji="🏪" label="Market" />
          ),
        }}
      />
      <Tab.Screen
        name="Requests"
        component={RequestsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} emoji="🗒️" label="Requests" />
          ),
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} emoji="🔔" label="Alerts" />
          ),
          tabBarBadge: 3, // Example notification badge
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessageScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} emoji="💬" label="Messages" />
          ),
          tabBarBadge: 5, // Example notification badge
        }}
      />
      <Tab.Screen
        name="Deals"
        component={DealsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} emoji="🛒" label="Deals" />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} emoji="👤" label="Profile" />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  placeholderSubtext: {
    fontSize: 16,
    color: '#666',
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    
  },
  tabEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});