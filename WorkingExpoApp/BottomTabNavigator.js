import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';

// Import your screens
import HomeScreen from './HomeScreen';

// Placeholder screens (create these later)
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

const MessagesScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>💬 Messages Screen</Text>
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
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#eee',
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
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
        component={MessagesScreen}
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
    fontSize: 24,
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
