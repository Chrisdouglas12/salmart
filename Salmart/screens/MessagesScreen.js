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
  const [activeChatRooms, setActiveChatRooms] = useState(new Set());
  
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
      
      // Join chat rooms for all active conversations
      if (socket && socket.connected) {
        data.forEach(msg => {
          const chatPartnerId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
          const chatRoomId = [currentUserId, chatPartnerId].sort().join('_');
          socket.emit('joinChatRoom', chatRoomId);
          console.log('Joined chat room:', chatRoomId);
        });
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    }
  }, [socket]);

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

  // Enhanced handleNewMessage function that works with your backend structure
  const handleNewMessage = useCallback((newMessage) => {
    console.log('New message received:', newMessage);
    
    setMessages(prevMessages => {
      // Check if message already exists
      if (prevMessages.some(msg => msg._id === newMessage._id)) {
        console.log('Message already exists, skipping duplicate');
        return prevMessages;
      }

      // Transform the message to match your messages list format
      const formattedMessage = {
        _id: newMessage._id,
        senderId: newMessage.senderId,
        receiverId: newMessage.receiverId,
        text: newMessage.text,
        messageType: newMessage.messageType || 'text',
        createdAt: newMessage.createdAt || new Date().toISOString(),
        isRead: newMessage.isRead || false,
        status: newMessage.status || 'delivered',
        // Use the fields from your backend exactly as they come
        chatPartnerName: newMessage.senderName || newMessage.chatPartnerName || 'Unknown',
        chatPartnerProfilePicture: newMessage.senderProfilePicture || newMessage.chatPartnerProfilePicture || 'default-avater-url',
        senderName: newMessage.senderName || 'Unknown',
        senderProfilePicture: newMessage.senderProfilePicture || 'default-avater-url',
        receiverName: newMessage.receiverName || 'Unknown',
        receiverProfilePicture: newMessage.receiverProfilePicture || 'default-avater-url',
        // Additional fields from your backend
        offerDetails: newMessage.offerDetails,
        attachment: newMessage.attachment,
        metadata: newMessage.metadata || { isSystemMessage: false },
        // Determine chat partner ID
        chatPartnerId: newMessage.senderId === userId ? newMessage.receiverId : newMessage.senderId
      };

      // Update existing message if it's from the same conversation, otherwise add new
      const updatedMessages = prevMessages.filter(msg => {
        const existingChatPartnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
        const newChatPartnerId = formattedMessage.senderId === userId ? formattedMessage.receiverId : formattedMessage.senderId;
        return existingChatPartnerId !== newChatPartnerId;
      });

      // Add the new message to the top of the list (most recent first)
      const finalMessages = [formattedMessage, ...updatedMessages];
      console.log('Messages updated, new count:', finalMessages.length);
      
      return finalMessages;
    });
  }, [userId]);

  // Handle message updates (like read status changes)
  const handleMessageUpdate = useCallback((updatedMessage) => {
    console.log('Message updated:', updatedMessage);
    
    setMessages(prevMessages => {
      return prevMessages.map(msg => 
        msg._id === updatedMessage._id ? { ...msg, ...updatedMessage } : msg
      );
    });
  }, []);

  // Handle new message notifications (alternative to newMessage)
  const handleNewMessageNotification = useCallback((notificationData) => {
    console.log('New message notification received:', notificationData);
    
    // You can either refresh messages or handle the notification directly
    if (userId) {
      fetchMessages(userId);
    }
  }, [userId, fetchMessages]);

  // Handle messages being marked as seen
  const handleMessagesSeen = useCallback((seenData) => {
    console.log('Messages seen:', seenData);
    
    setMessages(prevMessages => {
      return prevMessages.map(msg => {
        if (seenData.messageIds.includes(msg._id)) {
          return { ...msg, isRead: true, status: 'seen', seenAt: seenData.seenAt };
        }
        return msg;
      });
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

          // Get the token for socket authentication
          const token = await AsyncStorage.getItem('token');
          
          // Initialize socket connection with authentication
          const newSocket = io(API_BASE_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000,
            auth: {
              token: token
            },
            query: {
              token: token
            }
          });

          newSocket.on('connect', () => {
            console.log('Socket connected with ID:', newSocket.id);
            // Join the user's personal room for direct messages
            newSocket.emit('joinRoom', storedUserId);
            console.log('Joined user room:', storedUserId);
          });

          // Listen for new messages from chat rooms (matches your backend)
          newSocket.on('newMessage', (messageData) => {
            console.log('Raw newMessage received:', messageData);
            handleNewMessage(messageData);
          });

          // Listen for new message notifications from user rooms
          newSocket.on('newMessageNotification', (notificationData) => {
            console.log('New message notification received:', notificationData);
            handleNewMessageNotification(notificationData);
          });
          
          // Listen for message updates (like read status)
          newSocket.on('messageUpdate', handleMessageUpdate);
          
          // Listen for messages being seen
          newSocket.on('messagesSeen', handleMessagesSeen);
          
          // Listen for typing indicators
          newSocket.on('typing', (data) => {
            console.log('User typing:', data);
            // You can implement typing indicators here
          });

          // Handle offer-related events
          newSocket.on('offerAccepted', (data) => {
            console.log('Offer accepted:', data);
            // Refresh messages to show updated offer status
            if (storedUserId) {
              fetchMessages(storedUserId);
            }
          });

          newSocket.on('offerDeclined', (data) => {
            console.log('Offer declined:', data);
            // Refresh messages to show updated offer status
            if (storedUserId) {
              fetchMessages(storedUserId);
            }
          });

          newSocket.on('bargainEnded', (data) => {
            console.log('Bargain ended:', data);
            // Refresh messages to show updated bargain status
            if (storedUserId) {
              fetchMessages(storedUserId);
            }
          });

          // Handle image view confirmations
          newSocket.on('imageViewedConfirmation', (data) => {
            console.log('Image viewed confirmation:', data);
            handleMessageUpdate(data);
          });

          newSocket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
          });

          newSocket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            // Rejoin user room
            newSocket.emit('joinRoom', storedUserId);
            // Fetch messages again to rejoin chat rooms
            fetchMessages(storedUserId);
          });

          newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
          });

          // Handle authentication errors
          newSocket.on('connect_error', (error) => {
            if (error.message.includes('Authentication error')) {
              console.error('Socket authentication failed:', error.message);
              Alert.alert('Authentication Error', 'Please log in again.');
            }
          });

          setSocket(newSocket);
          
          // Fetch initial data
          await Promise.all([
            fetchMessages(storedUserId),
            fetchFollowers(storedUserId)
          ]);

        } else {
          console.log('No userId found in storage.');
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

    // Cleanup function
    return () => {
      if (socket) {
        console.log('Disconnecting socket...');
        socket.off('newMessage');
        socket.off('newMessageNotification');
        socket.off('messageUpdate');
        socket.off('messagesSeen');
        socket.off('typing');
        socket.off('offerAccepted');
        socket.off('offerDeclined');
        socket.off('bargainEnded');
        socket.off('imageViewedConfirmation');
        socket.disconnect();
      }
    };
  }, []); // Remove dependencies to prevent reconnection loops

  // Effect to handle socket events and chat room joining when userId or messages change
  useEffect(() => {
    if (socket && socket.connected && userId) {
      socket.emit('joinRoom', userId);
    }
  }, [socket, userId]);

  const handleMessagePress = (partnerId, partnerName, partnerProfile) => {
    setSelectedPartnerId(partnerId);
    
    // Join the specific chat room for this conversation
    if (socket && socket.connected && userId) {
      const chatRoomId = [userId, partnerId].sort().join('_');
      socket.emit('joinChatRoom', chatRoomId);
      console.log('Joined chat room for conversation:', chatRoomId);
    }
    
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
    const chatPartnerId = item.chatPartnerId || (item.senderId === userId ? item.receiverId : item.senderId);
    const isUnread = !item.isRead && item.senderId !== userId;
    
    // Use the exact field names from your backend response
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

    // Handle JSON-formatted messages
    if (messagePreview.startsWith('{')) {
      try {
        const parsed = JSON.parse(messagePreview);
        messagePreview = parsed.text || parsed.content || messagePreview;
      } catch (e) {
        // Keep original text if JSON parsing fails
      }
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
          {/* Connection status indicator */}
          <View style={[
            styles.connectionStatus,
            { backgroundColor: socket?.connected ? '#10B981' : '#EF4444' }
          ]} />
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
  connectionStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
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