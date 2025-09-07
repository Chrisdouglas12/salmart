
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  FlatList,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Mock data for posts (replace with actual API calls)
const mockPosts = [
  {
    id: 1,
    username: 'John Doe',
    avatar: 'https://via.placeholder.com/40',
    title: 'iPhone 13 Pro Max',
    description: 'Brand new iPhone 13 Pro Max, 256GB, unlocked',
    price: '₦450,000',
    image: 'https://via.placeholder.com/300x200',
    category: 'electronics',
    location: 'Lagos, Nigeria',
    time: '2 hours ago',
  },
  {
    id: 2,
    username: 'Sarah Johnson',
    avatar: 'https://via.placeholder.com/40',
    title: 'Nike Air Jordan',
    description: 'Authentic Nike Air Jordan sneakers, size 42',
    price: '₦85,000',
    image: 'https://via.placeholder.com/300x200',
    category: 'fashion',
    location: 'Abuja, Nigeria',
    time: '4 hours ago',
  },
  {
    id: 3,
    username: 'Mike Wilson',
    avatar: 'https://via.placeholder.com/40',
    title: 'Toyota Camry 2018',
    description: 'Clean Toyota Camry 2018, low mileage, excellent condition',
    price: '₦8,500,000',
    image: 'https://via.placeholder.com/300x200',
    category: 'vehicles',
    location: 'Port Harcourt, Nigeria',
    time: '6 hours ago',
  },
];

const categories = [
  { id: 'all', name: 'All', icon: '📱' },
  { id: 'electronics', name: 'Electronics', icon: '💻' },
  { id: 'fashion', name: 'Fashion', icon: '👕' },
  { id: 'home', name: 'Home & Garden', icon: '🏠' },
  { id: 'vehicles', name: 'Vehicles', icon: '🚗' },
  { id: 'music', name: 'Music Gear', icon: '🎸' },
  { id: 'others', name: 'Other', icon: '📦' },
];

export default function HomeScreen({ navigation }) {
  const [posts, setPosts] = useState(mockPosts);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter posts by category
  const filteredPosts = posts.filter(post => 
    selectedCategory === 'all' || post.category === selectedCategory
  );

  const onRefresh = () => {
    setRefreshing(true);
    // Simulate API call
    setTimeout(() => {
      setRefreshing(false);
    }, 2000);
  };

  const handleCategorySelect = (categoryId) => {
    setSelectedCategory(categoryId);
  };

  const handleSearch = () => {
    navigation.navigate('Search', { query: searchQuery });
  };

  const PostItem = ({ item }) => (
    <View style={styles.postCard}>
      {/* Post Header */}
      <View style={styles.postHeader}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={styles.userInfo}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={styles.timeLocation}>{item.time} • {item.location}</Text>
        </View>
        <TouchableOpacity style={styles.menuButton}>
          <Text style={styles.menuDots}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Post Content */}
      <Text style={styles.postTitle}>{item.title}</Text>
      <Text style={styles.postDescription}>{item.description}</Text>
      <Text style={styles.price}>{item.price}</Text>

      {/* Post Image */}
      <TouchableOpacity onPress={() => {/* Open image modal */}}>
        <Image source={{ uri: item.image }} style={styles.postImage} />
      </TouchableOpacity>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.contactButton}>
          <Text style={styles.contactButtonText}>💬 Contact Seller</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveButton}>
          <Text style={styles.saveButtonText}>🤍 Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const CategoryItem = ({ item, selected, onPress }) => (
    <TouchableOpacity 
      style={[styles.categoryButton, selected && styles.categoryButtonActive]}
      onPress={() => onPress(item.id)}
    >
      <Text style={styles.categoryIcon}>{item.icon}</Text>
      <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.menuIcon}
          onPress={() => setSidebarVisible(true)}
        >
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Salmart</Text>
        
        <TouchableOpacity style={styles.searchIcon} onPress={handleSearch}>
          <Text style={styles.searchIconText}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Create Post Buttons */}
      <View style={styles.createPostContainer}>
        <TouchableOpacity 
          style={styles.createAdButton}
          onPress={() => navigation.navigate('CreateAd')}
        >
          <Text style={styles.createAdText}>📢 Create an ad</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.createRequestButton}
          onPress={() => navigation.navigate('CreateRequest')}
        >
          <Text style={styles.createRequestText}>Create a request ➕</Text>
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CategoryItem
            item={item}
            selected={selectedCategory === item.id}
            onPress={handleCategorySelect}
          />
        )}
        style={styles.categoryContainer}
        contentContainerStyle={styles.categoryContent}
      />

      {/* Posts Feed */}
      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <PostItem item={item} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.postsContainer}
      />

      {/* Sidebar Modal */}
      <Modal
        visible={sidebarVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSidebarVisible(false)}
      >
        <View style={styles.sidebarOverlay}>
          <TouchableOpacity 
            style={styles.sidebarBackground}
            onPress={() => setSidebarVisible(false)}
          />
          <View style={styles.sidebar}>
            <View style={styles.sidebarHeader}>
              <Image 
                source={{ uri: 'https://via.placeholder.com/60' }} 
                style={styles.sidebarAvatar} 
              />
              <Text style={styles.sidebarUsername}>Username</Text>
            </View>
            
            <View style={styles.sidebarMenu}>
              {[
                { name: 'Market', icon: '🏪', screen: 'Home' },
                { name: 'Alerts', icon: '🔔', screen: 'Alerts' },
                { name: 'Messages', icon: '💬', screen: 'Messages' },
                { name: 'Deals', icon: '🛒', screen: 'Deals' },
                { name: 'Profile', icon: '👤', screen: 'Profile' },
                { name: 'Privacy Policy', icon: '🔒', screen: 'Privacy' },
                { name: 'Community Standards', icon: 'ℹ️', screen: 'Community' },
              ].map((item, index) => (
                <TouchableOpacity 
                  key={index}
                  style={styles.sidebarMenuItem}
                  onPress={() => {
                    setSidebarVisible(false);
                    navigation.navigate(item.screen);
                  }}
                >
                  <Text style={styles.sidebarMenuIcon}>{item.icon}</Text>
                  <Text style={styles.sidebarMenuText}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.logoutButton}>
              <Text style={styles.logoutText}>🚪 Log out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  menuIcon: {
    width: 30,
    height: 30,
    justifyContent: 'center',
  },
  menuLine: {
    width: 20,
    height: 3,
    backgroundColor: '#28a745',
    marginVertical: 2,
    borderRadius: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#28a745',
    fontFamily: 'Poppins',
  },
  searchIcon: {
    width: 35,
    height: 35,
    borderRadius: 20,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIconText: {
    fontSize: 16,
    color: '#28a745',
  },
  createPostContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  createAdButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flex: 0.48,
    alignItems: 'center',
  },
  createAdText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  createRequestButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flex: 0.48,
    alignItems: 'center',
  },
  createRequestText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  categoryContainer: {
    backgroundColor: 'white',
    paddingVertical: 10,
    marginBottom: 10,
  },
  categoryContent: {
    paddingHorizontal: 15,
  },
  categoryButton: {
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginHorizontal: 5,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    minWidth: 80,
  },
  categoryButtonActive: {
    backgroundColor: '#28a745',
  },
  categoryIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  categoryTextActive: {
    color: 'white',
  },
  postsContainer: {
    paddingHorizontal: 15,
  },
  postCard: {
    backgroundColor: 'white',
    marginVertical: 8,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontWeight: '600',
    fontSize: 14,
    color: '#333',
  },
  timeLocation: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  menuButton: {
    padding: 5,
  },
  menuDots: {
    fontSize: 18,
    color: '#666',
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  postDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: '#28a745',
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 15,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  contactButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    flex: 0.7,
    alignItems: 'center',
  },
  contactButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    flex: 0.25,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#666',
    fontSize: 12,
  },
  // Sidebar Styles
  sidebarOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebarBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sidebar: {
    width: 280,
    backgroundColor: 'white',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  sidebarHeader: {
    alignItems: 'center',
    paddingBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sidebarAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 10,
  },
  sidebarUsername: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  sidebarMenu: {
    paddingVertical: 20,
  },
  sidebarMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
  },
  sidebarMenuIcon: {
    fontSize: 18,
    marginRight: 15,
    width: 25,
  },
  sidebarMenuText: {
    fontSize: 16,
    color: '#333',
  },
  logoutButton: {
    marginTop: 30,
    paddingVertical: 15,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 16,
    color: '#dc3545',
    fontWeight: '600',
  },
});
