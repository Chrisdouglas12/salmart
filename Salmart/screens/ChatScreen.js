import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { io } from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';

// This URL should match your backend server
const APIBASEURL = 'https://salmart.onrender.com';

const ChatScreen = ({ route, navigation }) => {
  const {
    userId, // Passed from MessagesScreen, this is the current user's ID
    recipientId, // This is the other person's ID
    recipientName,
    recipientProfile,
    predefinedMessage,
    productImage,
    productId,
    productName,
    originalPrice,
  } = route.params;

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState(predefinedMessage || '');
  const [isTyping, setIsTyping] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authToken, setAuthToken] = useState(null);
  const flatListRef = useRef();
  
  // These are placeholder functions. Implement them as needed.
  const reportUser = () => Alert.alert("Report User", "Functionality to report a user will be added here.");
  const blockUser = () => Alert.alert("Block User", "Functionality to block a user will be added here.");

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current) {
      setTimeout(() => flatListRef.current.scrollToEnd({ animated: true }), 100);
    }
  }, []);

  const handleNewMessage = useCallback((newMessage) => {
    setMessages(prev => {
      // Check for duplicates based on tempId (for optimistic updates) or _id (from server)
      const isDuplicate = prev.some(msg => msg.tempId === newMessage.tempId || msg._id === newMessage._id);
      if (isDuplicate) {
        return prev;
      }
      return [...prev, newMessage];
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const handleTyping = useCallback((data) => {
    if (data.senderId === recipientId) {
      setIsTyping(true);
      const timer = setTimeout(() => setIsTyping(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [recipientId]);

  const handleMessageStatusUpdate = useCallback((data) => {
    setMessages(prevMessages => 
      prevMessages.map(msg => 
        msg.tempId === data.tempId ? { ...msg, ...data, status: 'delivered' } : msg
      )
    );
  }, []);
  
  const handleMessagesSeen = (data) => {};
  const handleImageViewed = (data) => {};
  const handleImageDeleted = (data) => {};

  const loadChatHistory = useCallback(async (token) => {
    if (!token || !userId || !recipientId) {
      console.error('Missing token, userId, or recipientId for chat history.');
      setIsLoading(false);
      return;
    }

    try {
      // Use the correct backend endpoint: /messages with user1 and user2 query params
      const response = await fetch(`${APIBASEURL}/messages?user1=${userId}&user2=${recipientId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data || []);
      } else {
        Alert.alert('Error', data.message || 'Failed to load chat history.');
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      Alert.alert('Error', 'Network problem. Failed to load chat history.');
    } finally {
      setIsLoading(false);
    }
  }, [userId, recipientId]);

  useEffect(() => {
    let newSocket;
    const initializeChat = async () => {
      setIsLoading(true);
      try {
        const storedToken = await AsyncStorage.getItem('token');
        if (!storedToken) {
          Alert.alert('Authentication Error', 'You are not logged in.');
          navigation.goBack();
          return;
        }
        setAuthToken(storedToken);

        newSocket = io(APIBASEURL, {
          transports: ['websocket', 'polling'],
          auth: { token: storedToken }
        });

        newSocket.on('connect', () => {
          console.log('Connected to server');
          newSocket.emit('joinRoom', userId);
        });

        newSocket.on('newMessage', handleNewMessage);
        newSocket.on('typing', handleTyping);
        newSocket.on('messagesSeen', handleMessagesSeen);
        newSocket.on('messageStatusUpdate', handleMessageStatusUpdate);
        newSocket.on('imageViewedConfirmation', handleImageViewed);
        newSocket.on('imageViewDeleted', handleImageDeleted);
        newSocket.on('disconnect', () => console.log('Socket disconnected'));

        setSocket(newSocket);
        
        loadChatHistory(storedToken);

      } catch (error) {
        console.error('Error initializing chat:', error);
        Alert.alert('Error', 'Failed to initialize chat connection.');
        setIsLoading(false);
      }
    };

    initializeChat();

    return () => {
      if (newSocket) {
        newSocket.off('newMessage', handleNewMessage);
        newSocket.off('typing', handleTyping);
        newSocket.disconnect();
      }
    };
  }, [userId, recipientId, handleNewMessage, handleTyping, handleMessageStatusUpdate, navigation, loadChatHistory]);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (imageUri, tempMessageData) => {
    if (!authToken) {
      Alert.alert('Error', 'Not authenticated.');
      return;
    }

    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: `chat_image_${Date.now()}.jpg`,
    });
    formData.append('senderId', userId);
    formData.append('receiverId', recipientId);
    formData.append('tempId', tempMessageData.tempId);
    formData.append('content', message);
    formData.append('viewOnce', JSON.stringify({ enabled: viewOnce }));

    try {
      const response = await fetch(`${APIBASEURL}/messages/upload-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Image upload failed');
      }

      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg.tempId === tempMessageData.tempId 
            ? { ...msg, _id: data.messageId, attachment: { url: data.imageUrl }, status: 'delivered' } 
            : msg
        )
      );

      if (socket) {
        socket.emit('sendMessage', {
          ...tempMessageData,
          _id: data.messageId,
          attachment: { url: data.imageUrl },
          status: 'delivered'
        });
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Upload Error', 'Failed to upload image.');
      setMessages(prevMessages => prevMessages.filter(msg => msg.tempId !== tempMessageData.tempId));
    }
  };

  const sendMessage = async () => {
    if (!message.trim() && !selectedImage) return;
    if (!socket || !userId || !recipientId) {
      Alert.alert('Error', 'Chat not connected. Please try again.');
      return;
    }

    const tempId = `temp_${Date.now()}`;
    const messageData = {
      receiverId: recipientId,
      text: message,
      senderId: userId,
      createdAt: new Date().toISOString(),
      tempId,
      status: 'sending',
      messageType: selectedImage ? 'image' : 'text',
      attachment: selectedImage ? { url: selectedImage } : undefined,
      viewOnce: selectedImage ? { enabled: viewOnce } : undefined,
    };

    setMessages(prev => [...prev, messageData]);
    scrollToBottom();

    setMessage('');
    setSelectedImage(null);
    setViewOnce(false);

    if (selectedImage) {
      uploadImage(selectedImage, messageData);
    } else {
      socket.emit('sendMessage', messageData);
    }
  };

  const renderMessage = ({ item }) => {
    const isSent = item.senderId === userId;
    
    return (
      <View style={[
        styles.messageContainer,
        isSent ? styles.sentMessageContainer : styles.receivedMessageContainer
      ]}>
        {item.messageType === 'image' ? (
          <View>
            {item.text && <Text style={[styles.messageText, isSent ? styles.sentMessageText : styles.receivedMessageText]}>{item.text}</Text>}
            <Image 
              source={{ uri: item.attachment?.url || 'https://via.placeholder.com/150' }}
              style={styles.chatImage}
              resizeMode="cover"
            />
            {item.viewOnce?.enabled && (
              <Text style={styles.viewOnceLabel}>View Once</Text>
            )}
            {item.status === 'sending' && (
              <ActivityIndicator size="small" color={isSent ? 'white' : '#6c757d'} style={styles.sendingIndicator} />
            )}
          </View>
        ) : (
          <Text style={[styles.messageText, isSent ? styles.sentMessageText : styles.receivedMessageText]}>
            {item.text}
          </Text>
        )}
        <View style={styles.messageFooter}>
          <Text style={[styles.timestamp, isSent ? styles.sentTimestamp : styles.receivedTimestamp]}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isSent && (
            <Ionicons 
              name={item.status === 'delivered' ? 'checkmark-done' : 'checkmark'}
              size={14} 
              color={item.status === 'delivered' ? '#38bdf8' : 'white'}
              style={{ marginLeft: 5 }}
            />
          )}
        </View>
      </View>
    );
  };
  
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#28a756" />
        <Text style={{ marginTop: 10, color: '#6c757d' }}>Loading chat...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.select({ ios: 90, android: 10 })}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <LinearGradient
          colors={['#fff', '#f8fafc']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.header}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1a202c" />
          </TouchableOpacity>
          
          <Image 
            source={{ uri: recipientProfile || 'https://via.placeholder.com/150' }} 
            style={styles.profileImage}
          />
          
          <View style={styles.userInfo}>
            <Text style={styles.username}>{recipientName}</Text>
            {isTyping && (
              <Text style={styles.typingText}>typing...</Text>
            )}
          </View>

          <TouchableOpacity onPress={() => setShowOptions(!showOptions)} style={styles.optionsButton}>
            <Ionicons name="ellipsis-vertical" size={24} color="#64748b" />
          </TouchableOpacity>
        </LinearGradient>
      </TouchableWithoutFeedback>

      {showOptions && (
        <View style={styles.optionsMenu}>
          <TouchableOpacity style={styles.optionItem} onPress={reportUser}>
            <Ionicons name="flag" size={20} color="red" />
            <Text style={styles.optionText}>Report User</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionItem} onPress={blockUser}>
            <Ionicons name="person-remove" size={20} color="red" />
            <Text style={styles.optionText}>Block User</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item._id || item.tempId}
        style={styles.messagesList}
        onContentSizeChange={scrollToBottom}
      />
      
      {productImage && (
        <View style={styles.urlPhotoPreview}>
          <View style={styles.urlPreviewContent}>
            <Text style={styles.urlPreviewMessage}>
              I'm interested in this product:
            </Text>
            <Image
              source={{ uri: productImage }}
              style={styles.urlPreviewImage}
            />
            <Text style={styles.urlPreviewProductName}>{productName}</Text>
            <Text style={styles.urlPreviewProductPrice}>
              ${originalPrice}
            </Text>
          </View>
        </View>
      )}

      {selectedImage && (
        <View style={styles.imagePreview}>
          <Image source={{ uri: selectedImage }} style={styles.previewImage} />
          <View style={styles.previewActions}>
            <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.closePreviewBtn}>
              <Ionicons name="close-circle" size={24} color="#ef4444" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewOnce(!viewOnce)}>
              <Text style={viewOnce ? styles.viewOnceActive : styles.viewOnceInactive}>
                View Once
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={pickImage} style={styles.actionBtn}>
          <Ionicons name="attach" size={24} color="#64748b" />
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          value={message}
          onChangeText={setMessage}
          placeholder="Type a message..."
          multiline
          placeholderTextColor="#9ca3af"
        />

        <TouchableOpacity onPress={sendMessage} style={[styles.actionBtn, styles.sendButton]}>
          <Ionicons name="send" size={24} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5e7eb', // A lighter background for the chat area
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    marginTop: 30,
    zIndex: 9999,
  },
  backButton: {
    paddingRight: 12,
  },
  profileImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: 2,
  },
  typingText: {
    fontSize: 12,
    color: '#4ade80',
    fontWeight: '500',
  },
  optionsButton: {
    padding: 8,
    borderRadius: 20,
  },
  optionsMenu: {
    position: 'absolute',
    top: 70,
    right: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  optionText: {
    marginLeft: 8,
    color: '#4a5568',
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  messageContainer: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 4,
    borderRadius: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  sentMessageContainer: {
    alignSelf: 'flex-end',
    backgroundColor: '#28a745',
     color: '#fff',
    borderTopRightRadius: 2, // WhatsApp-like tail
    marginRight: 10,
  },
  receivedMessageContainer: {
    alignSelf: 'flex-start',
    backgroundColor: 'white',
    borderTopLeftRadius: 2, // WhatsApp-like tail
    marginLeft: 10,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 4,
    color: '#1f2937',
  },
  sentMessageText: {
    color: '#fff',
  },
  receivedMessageText: {
    color: '#1f2937',
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
    paddingLeft: 10,
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  sentTimestamp: {
    color: '#6b7280',
  },
  receivedTimestamp: {
    color: '#9ca3af',
  },
  chatImage: {
    width: 250,
    height: 180,
    borderRadius: 8,
    marginTop: 5,
  },
  sendingIndicator: {
    position: 'absolute',
    bottom: 5,
    left: 5,
  },
  viewOnceLabel: {
    fontSize: 10,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    position: 'absolute',
    top: 5,
    right: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    shadowColor: '#ddd',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    fontSize: 16,
    lineHeight: 24,
    backgroundColor: '#f9fafb',
    marginHorizontal: 8,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    backgroundColor: '#25d366', // WhatsApp green
  },
  imagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f0f2f5',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 15,
  },
  previewActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  closePreviewBtn: {},
  viewOnceActive: {
    color: '#28a756',
    fontWeight: 'bold',
  },
  viewOnceInactive: {
    color: '#64748b',
    fontWeight: 'normal',
  },
  urlPhotoPreview: {
    backgroundColor: '#e6f7ff',
    borderWidth: 1,
    borderColor: '#b3e0ff',
    borderRadius: 12,
    padding: 15,
    margin: 15,
    maxWidth: 400,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  urlPreviewContent: {
    width: '100%',
    alignItems: 'center',
  },
  urlPreviewMessage: {
    fontSize: 14,
    color: '#333',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  urlPreviewImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  urlPreviewProductName: {
    fontWeight: 'bold',
    color: '#0056b3',
    fontSize: 16,
    marginTop: 5,
  },
  urlPreviewProductPrice: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
  },
});

export default ChatScreen;
