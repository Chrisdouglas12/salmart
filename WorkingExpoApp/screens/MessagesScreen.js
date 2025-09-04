import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  RefreshControl,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome as Icon } from '@expo/vector-icons';
import io from 'socket.io-client';
import { formatDistanceToNow } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MessagesScreen = () => {
  const navigation = useNavigation();
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [socket, setSocket] = useState(null);
  
  const API_BASE_URL = 'https://salmart.onrender.com';

  

  const fetchMessages = useCallback(async (currentUserId) => {
  try {
    if (!currentUserId) return;
    const token = await AsyncStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/api/messages?userId=${currentUserId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    setMessages(data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    Alert.alert('Error', 'Failed to load messages');
  }
}, []);

const fetchFollowers = useCallback(async (currentUserId) => {
  try {
    if (!currentUserId) return;
    const token = await AsyncStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/followers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    setFollowers(data);
  } catch (error) {
    console.error('Error fetching followers:', error);
  }
}, []);
  const handleNewMessage = useCallback((newMessage) => {
    setMessages(prev => {
      if (prev.some(msg => msg._id === newMessage._id)) return prev;
      return [newMessage, ...prev];
    });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (userId) {
      await fetchMessages(userId);
      await fetchFollowers(userId);
    }
    setRefreshing(false);
  }, [userId, fetchMessages, fetchFollowers]);

  useEffect(() => {
    const initializeScreen = async () => {
      setLoading(true);
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        if (storedUserId) {
          setUserId(storedUserId);

          const newSocket = io(API_BASE_URL, {
            transports: ['websocket'],
            reconnection: true,
          });

          newSocket.on('connect', () => {
            console.log('Socket connected');
            newSocket.emit('joinRoom', storedUserId);
          });
          newSocket.on('newMessage', handleNewMessage);
          newSocket.on('disconnect', () => console.log('Socket disconnected'));
          setSocket(newSocket);
          
          await Promise.all([
            fetchMessages(storedUserId),
            fetchFollowers(storedUserId)
          ]);

        } else {
          console.log('No userId found in storage. Redirecting or showing an empty state.');
          Alert.alert('User Error', 'User not logged in. Please log in again.');
        }
      } catch (error) {
        console.error('Initialization error:', error);
        Alert.alert('Error', 'Failed to load screen data.');
      } finally {
        setLoading(false);
      }
    };

    initializeScreen();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [fetchMessages, fetchFollowers, handleNewMessage]);

  const handleMessagePress = (partnerId, partnerName, partnerProfile) => {
    setSelectedPartnerId(partnerId);
    navigation.navigate('Chat', {
      userId,
      recipientId: partnerId,
      recipientName: partnerName,
      recipientProfile: partnerProfile,
    });
  };

  const renderFollowerItem = ({ item }) => (
    <TouchableOpacity
      style={styles.followerItem}
      onPress={() => handleMessagePress(item._id, `${item.firstName} ${item.lastName}`, item.profilePicture)}
    >
      <View style={styles.followerAvatarContainer}>
        <Image
          source={{ uri: item.profilePicture || 'default-avater-url' }}
          style={styles.followerAvatar}
          defaultSource={require('../assets/default-avater.png')}
        />
      </View>
      <Text style={styles.followerName} numberOfLines={1}>
        {item.firstName}
      </Text>
    </TouchableOpacity>
  );

  const renderMessageItem = ({ item }) => {
    const chatPartnerId = item.senderId === userId ? item.receiverId : item.senderId;
    const isUnread = !item.isRead && item.senderId !== userId;
    const partnerName = item.chatPartnerName || 'Unknown';
    const partnerProfile = item.chatPartnerProfilePicture || 'default-avater-url';

    let messagePreview = '';
    if (item.messageType === 'image') {
      messagePreview = '📷 Photo';
    } else if (item.metadata?.isSystemMessage) {
      messagePreview = item.text || 'System notification';
    } else {
      messagePreview = item.text || 'New message';
    }

    return (
      <TouchableOpacity
        style={[
          styles.messageItem,
          isUnread && styles.unreadMessage,
          chatPartnerId === selectedPartnerId && styles.selectedMessage,
        ]}
        onPress={() => handleMessagePress(chatPartnerId, partnerName, partnerProfile)}
      >
        <View style={styles.messageAvatarContainer}>
          <Image
            source={{ uri: partnerProfile }}
            style={styles.messageAvatar}
            defaultSource={require('../assets/default-avater.png')}
          />
          {isUnread && <View style={styles.onlineIndicator} />}
        </View>

        <View style={styles.messageContent}>
          <View style={styles.messageHeader}>
            <Text style={styles.messageName}>{partnerName}</Text>
            <Text style={styles.messageTime}>
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </Text>
          </View>
          <Text style={styles.messagePreview} numberOfLines={1}>
            {messagePreview}
          </Text>
        </View>

        {isUnread && <View style={styles.unreadIndicator} />}
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#28a745" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Icon name="comments" size={24} color="#28a745" />
          <Text style={styles.headerTitleText}>Messages</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => navigation.navigate('Search')}
          >
            <Icon name="search" size={18} color="#28a745" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Image
              source={{ uri: 'user-profile-picture-url' }}
              style={styles.profileAvatar}
              defaultSource={require('../assets/default-avater.png')}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Followers List */}
      {followers.length > 0 && (
        <View style={styles.followersContainer}>
          <FlatList
            data={followers}
            renderItem={renderFollowerItem}
            keyExtractor={item => item._id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.followersList}
          />
        </View>
      )}

      {/* Messages List */}
      <FlatList
        data={messages}
        renderItem={renderMessageItem}
        keyExtractor={item => item._id}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#28a745']}
            tintColor="#28a745"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyStateIcon}>
              <Icon name="comments" size={32} color="white" />
            </View>
            <Text style={styles.emptyStateTitle}>No messages yet</Text>
            <Text style={styles.emptyStateText}>
              Start a conversation to see your messages here
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginTop: 30,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#28a745',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#28a745',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  followersContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: 'white',
  },
  followersList: {
    paddingHorizontal: 16,
  },
  followerItem: {
    alignItems: 'center',
    marginRight: 12,
  },
  followerAvatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  followerAvatar: {
    width: '100%',
    height: '100%',
  },
  followerName: {
    marginTop: 8,
    fontSize: 12,
    color: '#6C757D',
    maxWidth: 70,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 80, // Space for bottom tab bar
  },
  messageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unreadMessage: {
    borderColor: '#28a745',
  },
  selectedMessage: {
    backgroundColor: '#F8F9FA',
    borderColor: '#28a745',
  },
  messageAvatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  messageAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#E5E7EB',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    backgroundColor: '#10B981',
    borderWidth: 3,
    borderColor: 'white',
    borderRadius: 8,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  messageName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  unreadMessageName: {
    fontWeight: '700',
    color: '#28a745',
  },
  messageTime: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  messagePreview: {
    fontSize: 14,
    color: '#6C757D',
  },
  unreadMessagePreview: {
    color: '#1A1A1A',
    fontWeight: '500',
  },
  unreadIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 12,
    height: 12,
    backgroundColor: '#28a745',
    borderRadius: 6,
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#28a745',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptyStateText: {
    color: '#6C757D',
    fontSize: 14,
  },
});

export default MessagesScreen;
