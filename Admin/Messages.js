import { salmartCache } from './salmartCache.js';

// Global variables
const userId = localStorage?.getItem("userId");
const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
const MESSAGE_DB_KEY = `messages_${userId}`; 
let socket = null;
let isInitialLoad = true;
let isClickProcessing = false;
let messages = [];
let followers = []; // Array to store followers
let messageUpdateTimeouts = new Map();
let selectedPartnerId = null;

// DOM elements
const messageListElement = document.getElementById("message-list");
const emptyStateElement = document.getElementById("empty-state");
const chatIframe = document.getElementById("desktop-iframe");
const followersListElement = document.getElementById("followers-list");

// Initialize app
if (!userId) {
  console.error('No userId found, redirecting to SignIn');
  window.location.href = "SignIn.html";
} else {
  initialize();
}

async function initialize() {
  console.log('Initializing Messages page...');
  setupSocketIO();
  await fetchFollowers(); // Fetch followers first
  await fetchMessages();
  setupEventListeners();
}

function setupEventListeners() {
  window.addEventListener('focus', () => {
    if (!document.hidden) {
      fetchMessages();
    }
  });

  // Event delegation for message clicks
  messageListElement.addEventListener('click', (e) => {
    const messageItem = e.target.closest('.message-item');
    if (messageItem) {
      const partnerId = messageItem.getAttribute('data-partner-id');
      const partnerName = messageItem.getAttribute('data-partner-name');
      const partnerProfile = messageItem.getAttribute('data-partner-profile');

      handleMessageClick(
        encodeURIComponent(partnerId),
        encodeURIComponent(partnerName),
        encodeURIComponent(partnerProfile)
      );
    }
  });
  
  // Event delegation for follower clicks
  followersListElement.addEventListener('click', (e) => {
    const followerItem = e.target.closest('.follower-item');
    if (followerItem) {
      const partnerId = followerItem.getAttribute('data-partner-id');
      const partnerName = followerItem.getAttribute('data-partner-name');
      const partnerProfile = followerItem.getAttribute('data-partner-profile');
      handleMessageClick(
        encodeURIComponent(partnerId),
        encodeURIComponent(partnerName),
        encodeURIComponent(partnerProfile)
      );
    }
  });

  // Pull-to-refresh functionality
  let touchStartY = 0;
  let touchEndY = 0;

  messageListElement.addEventListener('touchstart', (e) => {
    touchStartY = e.changedTouches[0].screenY;
  });

  messageListElement.addEventListener('touchend', (e) => {
    touchEndY = e.changedTouches[0].screenY;
    if (touchEndY - touchStartY > 100 && messageListElement.scrollTop === 0) {
      fetchMessages();
      fetchFollowers(); // Also refresh followers on pull-to-refresh
    }
  });

  // Add listener for message cache notifications
  window.addEventListener('newMessagesFromCache', (event) => {
    console.log('🔔 New messages detected from cache background sync:', event.detail.messages);
    
    // Update local messages and re-render
    event.detail.messages.forEach(newMsg => {
      const exists = messages.some(msg => msg._id === newMsg._id);
      if (!exists) {
        messages.unshift(newMsg);
      }
    });
    
    // Sort and re-render
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderMessages();
  });

  // Add listener for follower cache notifications
  window.addEventListener('followersUpdateFromCache', (event) => {
    console.log('🔔 Followers updated from cache background sync:', event.detail.followers);
    
    // Update local followers and re-render
    followers = event.detail.followers;
    renderFollowers();
  });

  // Add focus refresh with debouncing for messages
  let focusTimeout;
  window.addEventListener('focus', () => {
    if (!document.hidden) {
      clearTimeout(focusTimeout);
      focusTimeout = setTimeout(() => {
        console.log('👁️ Window focused, refreshing messages...');
        fetchMessages();
      }, 1000);
    }
  });

  // Add follower refresh on window focus (with debouncing)
  let followerFocusTimeout;
  window.addEventListener('focus', () => {
    if (!document.hidden) {
      clearTimeout(followerFocusTimeout);
      followerFocusTimeout = setTimeout(() => {
        console.log('👁️ Window focused, refreshing followers...');
        fetchFollowers();
      }, 1500); // Slight delay after message refresh
    }
  });
}

function setupSocketIO() {
  console.log('Setting up Socket.IO...');
  socket = io(API_BASE_URL, {
    auth: { userId, token: localStorage.getItem('authToken') },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 5000
  });

  socket.on('connect', () => {
    console.log('Socket.IO connected, joining room for user:', userId);
    socket.emit('joinRoom', userId);
  });

  socket.on('newMessage', (newMessage) => {
    console.log('Received newMessage:', newMessage);
    handleNewMessage(newMessage);
  });

  socket.on('messageError', (data) => {
    console.error('Server message error:', data.error);
    showErrorMessage('Failed to receive message updates');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
    if (error.message === 'Authentication error') {
      console.error('Authentication failed, redirecting to SignIn');
      localStorage.removeItem('authToken');
      window.location.href = 'SignIn.html';
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket.IO disconnected');
  });
}

// UPDATED: Function to fetch followers using cache (similar to fetchMessages)
async function fetchFollowers() {
  console.log('🔄 [Messages] Fetching followers using cache...');
  
  try {
    // Use the new cache method
    const fetchedFollowers = await salmartCache.getFollowers(userId);
    
    console.log('📥 Received followers:', {
      count: fetchedFollowers.length,
      first3: fetchedFollowers.slice(0, 3).map(f => ({
        id: f._id,
        name: `${f.firstName} ${f.lastName}`,
        profile: f.profilePicture
      }))
    });
    
    // Update local followers array
    followers = fetchedFollowers;
    renderFollowers();
    
  } catch (error) {
    console.error('❌ [Messages] Failed to fetch followers:', error);
    // Show empty state or error message for followers section
    followersListElement.innerHTML = '<div class="error-message">Failed to load followers</div>';
  }
}

// Function to render the followers list
function renderFollowers() {
  if (followers.length === 0) {
    followersListElement.innerHTML = '';
    return;
  }

  const followersHTML = followers.map(follower => {
    const profilePic = follower.profilePicture || 'default-avater.png';
    const fullName = `${follower.firstName} ${follower.lastName}`;
    return `
      <div class="follower-item" 
           data-partner-id="${escapeHTML(follower._id)}" 
           data-partner-name="${escapeHTML(fullName)}"
           data-partner-profile="${escapeHTML(profilePic)}">
        <div class="follower-avatar">
          <img src="${escapeHTML(profilePic)}" alt="${escapeHTML(fullName)}" onerror="this.src='default-avater.png'">
        </div>
        <p class="follower-name">${escapeHTML(follower.firstName)}</p>
      </div>
    `;
  }).join('');
  followersListElement.innerHTML = followersHTML;
}

function createSkeletonLoader() {
  return `
    <div class="skeleton-wrapper">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-content">
        <div class="skeleton-line title"></div>
        <div class="skeleton-line subtitle"></div>
        <div class="skeleton-line time"></div>
      </div>
    </div>
  `;
}

function showSkeletonLoaders(count = 6) {
  const skeletonHTML = Array(count).fill(createSkeletonLoader()).join('');
  messageListElement.innerHTML = skeletonHTML;
  emptyStateElement.style.display = "none";
}

function showErrorMessage(message) {
  messageListElement.innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
      ${message}
    </div>
  `;
  emptyStateElement.style.display = "none";
}

async function fetchMessages() {
    if (isInitialLoad) {
        showSkeletonLoaders();
    }

    try {
        console.log('🔄 [Messages] Fetching messages using cache...');
        
        // Use the proper cache method (similar to how posts work)
        const fetchedMessages = await salmartCache.getMessages(userId);
        
        console.log('📥 Received messages:', {
            count: fetchedMessages.length,
            first3: fetchedMessages.slice(0, 3).map(m => ({
                id: m._id,
                from: m.senderId,
                to: m.receiverId,
                partner: m.chatPartnerName,
                text: m.text?.substring(0, 30)
            }))
        });
        
        // Update local messages array
        messages = fetchedMessages;
        renderMessages();
        
        if (messages.length === 0) {
            emptyStateElement.style.display = "block";
        } else {
            emptyStateElement.style.display = "none";
        }

    } catch (error) {
        console.error('❌ [Messages] Failed to fetch messages:', error);
        showErrorMessage('Failed to load messages. Please check your connection.');
    } finally {
        isInitialLoad = false;
    }
}

// Update handleNewMessage to use cache properly
async function handleNewMessage(newMessage) {
    try {
        console.log('📨 Handling new message:', newMessage._id);
        
        // Check for exact duplicates in current messages array
        const existingMessage = messages.find(msg => msg._id === newMessage._id);
        if (existingMessage) {
            console.log('❌ Duplicate message skipped:', newMessage._id);
            return;
        }

        // Validate message structure
        if (!newMessage._id || !newMessage.senderId || !newMessage.receiverId) {
            console.error('❌ Invalid message structure:', newMessage);
            return;
        }

        // Add to cache using proper method
        await salmartCache.addNewMessageToCache(userId, newMessage);
        
        // Update local array
        messages.unshift(newMessage);
        
        // Remove duplicates and sort
        const seenIds = new Set();
        messages = messages.filter(msg => {
            if (seenIds.has(msg._id)) {
                return false;
            }
            seenIds.add(msg._id);
            return true;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Update UI
        renderMessages();
        messageListElement.scrollTop = 0;
        emptyStateElement.style.display = "none";

        console.log('✅ New message processed successfully');

    } catch (error) {
        console.error('❌ Error in handleNewMessage:', error);
        // Force refresh on error
        setTimeout(() => fetchMessages(), 1000);
    }
}

// Add force refresh function for testing messages
async function forceRefreshMessages() {
    console.log('🔄 Force refreshing messages...');
    showSkeletonLoaders();
    
    try {
        const freshMessages = await salmartCache.refreshMessages(userId);
        messages = freshMessages;
        renderMessages();
        console.log('✅ Force refresh completed');
    } catch (error) {
        console.error('❌ Force refresh failed:', error);
        showErrorMessage('Failed to refresh messages');
    }
}

// Add clear cache function for testing messages
async function clearMessageCache() {
    console.log('🗑️ Clearing message cache...');
    await salmartCache.clearMessageCache(userId);
    messages = [];
    renderMessages();
    console.log('✅ Message cache cleared');
}

// Add force refresh function for testing followers
async function forceRefreshFollowers() {
    console.log('🔄 Force refreshing followers...');
    
    try {
        const freshFollowers = await salmartCache.refreshFollowers(userId);
        followers = freshFollowers;
        renderFollowers();
        console.log('✅ Follower force refresh completed');
    } catch (error) {
        console.error('❌ Follower force refresh failed:', error);
        followersListElement.innerHTML = '<div class="error-message">Failed to refresh followers</div>';
    }
}

// Add clear follower cache function for testing
async function clearFollowerCache() {
    console.log('🗑️ Clearing follower cache...');
    await salmartCache.clearFollowerCache(userId);
    followers = [];
    renderFollowers();
    console.log('✅ Follower cache cleared');
}

// Make functions available for debugging
window.forceRefreshMessages = forceRefreshMessages;
window.clearMessageCache = clearMessageCache;
window.forceRefreshFollowers = forceRefreshFollowers;
window.clearFollowerCache = clearFollowerCache;

// Add periodic refresh (every 30 seconds) to catch missed messages
setInterval(() => {
    if (!document.hidden && !isInitialLoad) {
        console.log('⏰ Periodic message refresh...');
        fetchMessages();
    }
}, 30000);

// Add periodic refresh for followers (every 2 minutes to avoid too frequent calls)
setInterval(() => {
    if (!document.hidden && !isInitialLoad) {
        console.log('⏰ Periodic follower refresh...');
        fetchFollowers();
    }
}, 120000); // 2 minutes

function debugMessages() {
  console.log('Current messages count:', messages.length);
  console.log('First 3 messages:', messages.slice(0, 3).map(m => ({
    id: m._id,
    from: m.senderId,
    to: m.receiverId,
    text: m.text?.substring(0, 30),
    date: m.createdAt,
    isRead: m.isRead
  })));
}

function debugFollowers() {
  console.log('Current followers count:', followers.length);
  console.log('First 3 followers:', followers.slice(0, 3).map(f => ({
    id: f._id,
    name: `${f.firstName} ${f.lastName}`,
    profile: f.profilePicture
  })));
}

function renderMessages() {
  debugMessages();
  
  if (messages.length === 0) {
    console.log('No messages to display');
    messageListElement.innerHTML = '';
    emptyStateElement.style.display = "block";
    return;
  }

  emptyStateElement.style.display = "none";
  messageListElement.innerHTML = generateMessageHTML(messages);
}

function generateMessageHTML(messages) {
  const uniqueChats = {};
  messages.forEach(msg => {
    const chatPartnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
    if (!uniqueChats[chatPartnerId]) {
      uniqueChats[chatPartnerId] = msg;
    } else {
      // Always keep the most recent message OR prioritize unread messages
      const currentMsg = uniqueChats[chatPartnerId];
      const newMsgDate = new Date(msg.createdAt);
      const currentMsgDate = new Date(currentMsg.createdAt);
      
      // Show this message if it's newer OR if it's unread and current isn't
      const msgIsUnread = !msg.isRead && msg.senderId !== userId;
      const currentIsUnread = !currentMsg.isRead && currentMsg.senderId !== userId;
      
      if (newMsgDate > currentMsgDate || (msgIsUnread && !currentIsUnread)) {
        uniqueChats[chatPartnerId] = msg;
      }
    }
  });

  const sortedChats = Object.values(uniqueChats)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return sortedChats.map(message => {
    const chatPartnerId = message.senderId === userId ? message.receiverId : message.senderId;
    const isUnread = !message.isRead && message.senderId !== userId;
    const isNew = messages.indexOf(message) === 0 && !isInitialLoad;
    const isSelected = chatPartnerId === selectedPartnerId;

    let messagePreview = '';
    let messageIcon = '';
    
    if (message.messageType === 'image') {
      messagePreview = '📷 Photo';
      messageIcon = '<i class="fas fa-image"></i>';
    } else if (message.metadata?.isSystemMessage) {
      messagePreview = message.text || 'System notification';
      messageIcon = '<i class="fas fa-info-circle"></i>';
    } else {
      messagePreview = message.text || 'New message';
      messageIcon = '<i class="fas fa-comment"></i>';
    }

    return `
      <div class="message-item ${isUnread ? 'unread' : ''} ${isNew ? 'new' : ''} ${isSelected ? 'selected' : ''}" 
           data-message-id="${escapeHTML(message._id)}" 
           data-partner-id="${escapeHTML(chatPartnerId)}"
           data-partner-name="${escapeHTML(message.chatPartnerName)}"
           data-partner-profile="${escapeHTML(message.chatPartnerProfilePicture) || 'Default.png'}">
        
        <div class="message-avatar">
          <img src="${escapeHTML(message.chatPartnerProfilePicture) || 'default-avater.png'}" 
               
               onerror="this.src='default-avater.png'">
        </div>
        
        <div class="message-content">
          <div class="message-header">
            <h3 class="message-name">${escapeHTML(message.chatPartnerName)}</h3>
            <span class="message-time">${formatTime(message.createdAt)}</span>
          </div>
          <p class="message-preview">${escapeHTML(messagePreview)}</p>
          <div class="message-meta">
            <span class="message-type-icon">
              ${messageIcon}
            </span>
          </div>
        </div>
        
        ${isUnread ? '<div class="unread-indicator"></div>' : ''}
      </div>
    `;
  }).join('');
}

async function handleMessageClick(partnerId, partnerName, partnerProfile) {
    if (isClickProcessing) {
        console.log('Click processing, ignoring...');
        return;
    }

    isClickProcessing = true;
    const decodedPartnerId = decodeURIComponent(partnerId);

    try {
        selectedPartnerId = decodedPartnerId;
        
        const updatedMessages = messages.map(msg => {
            const isFromPartner = (msg.senderId === decodedPartnerId && msg.receiverId === userId);
            return {
                ...msg,
                isRead: isFromPartner ? true : msg.isRead
            };
        });
        messages = updatedMessages;
        await salmartCache.set(MESSAGE_DB_KEY, messages);
        renderMessages();

        if (window.innerWidth >= 768) {
            const chatUrl = `Chats.html?user_id=${encodeURIComponent(userId)}&recipient_id=${partnerId}&recipient_username=${partnerName}&recipient_profile_picture_url=${partnerProfile}`;
            chatIframe.src = chatUrl;

            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_BASE_URL}/api/messages/mark-as-viewed`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    userId,
                    partnerId: decodedPartnerId
                })
            });

            if (!response.ok) {
                console.warn('Failed to mark messages as viewed on server.');
            }
        } else {
            const chatUrl = `Chats.html?user_id=${encodeURIComponent(userId)}&recipient_id=${partnerId}&recipient_username=${partnerName}&recipient_profile_picture_url=${partnerProfile}`;
            window.location.href = chatUrl;
        }
    } catch (error) {
        console.error('Error in handleMessageClick:', error);
    } finally {
        isClickProcessing = false;
    }
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    if (isNaN(date)) {
      console.warn('Invalid timestamp:', timestamp);
      return '';
    }

    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    else if (minutes < 60) return `${minutes}m`;
    else if (hours < 24) return `${hours}h`;
    else if (days < 7) return `${days}d`;
    else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
  } catch (error) {
    console.warn('Error formatting timestamp:', timestamp);
    return '';
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clearBadge(badgeType) {
  const badge = document.getElementById(`${badgeType}-badge`);
  if (badge) {
    badge.style.display = 'none';
  }
}

window.addEventListener('beforeunload', () => {
  messageUpdateTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  messageUpdateTimeouts.clear();
  if (socket) {
    socket.disconnect();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !isInitialLoad) {
    fetchMessages();
    fetchFollowers(); // Also refresh followers when page becomes visible
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}