// Messages.js
import { salmartCache } from './Salmartcache.js';

// Global variables
const userId = localStorage?.getItem("userId");
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
const MESSAGE_DB_KEY = `messages_${userId}`; 
let socket = null;
let isInitialLoad = true;
let isClickProcessing = false;
let messages = [];
let messageUpdateTimeouts = new Map();
let selectedPartnerId = null;

// DOM elements
const messageListElement = document.getElementById("message-list");
const emptyStateElement = document.getElementById("empty-state");
const chatIframe = document.getElementById("desktop-iframe");

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

async function handleNewMessage(newMessage) {
    try {
        if (messages.some(msg => msg._id === newMessage._id)) {
            console.log('Duplicate message skipped:', newMessage._id);
            return;
        }

        messages.unshift(newMessage);
        messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        await salmartCache.set(MESSAGE_DB_KEY, messages); 
        console.log('💾 [Messages] Added new message to cache.');

        renderMessages();
        messageListElement.scrollTop = 0;
        emptyStateElement.style.display = "none";

        if (messageUpdateTimeouts.has(newMessage._id)) {
            clearTimeout(messageUpdateTimeouts.get(newMessage._id));
        }

        const timeoutId = setTimeout(() => {
            const messageElement = document.querySelector(`[data-message-id="${newMessage._id}"]`);
            if (messageElement) {
                messageElement.classList.remove('new');
            }
            messageUpdateTimeouts.delete(newMessage._id);
        }, 500);

        messageUpdateTimeouts.set(newMessage._id, timeoutId);
    } catch (error) {
        console.error('Error handling newMessage:', error);
        fetchMessages();
    }
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

    let hasCachedData = false;
    try {
        const cachedMessages = await salmartCache.get(MESSAGE_DB_KEY);
        if (cachedMessages && cachedMessages.length > 0) {
            messages = cachedMessages;
            renderMessages();
            console.log('✅ [Messages] Serving messages from cache.');
            hasCachedData = true;
        }
    } catch (e) {
        console.error('❌ [Messages] Error loading from cache:', e);
    }

    try {
        console.log('🔄 [Messages] Fetching latest messages from network...');
        const response = await fetch(`${API_BASE_URL}/api/messages?userId=${userId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const fetchedMessages = await response.json();
        
        if (JSON.stringify(fetchedMessages) !== JSON.stringify(messages)) {
            messages = fetchedMessages;
            await salmartCache.set(MESSAGE_DB_KEY, messages);
            console.log('💾 [Messages] Updated messages in cache.');
            renderMessages();
        } else {
            console.log('No new messages from network.');
        }

    } catch (error) {
        console.warn('⚠️ [Messages] Network fetch failed:', error);
        if (!hasCachedData) {
            showErrorMessage('You are offline. Failed to load messages.');
        }
    } finally {
        isInitialLoad = false;
    }
}

function renderMessages() {
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
    if (!uniqueChats[chatPartnerId] || new Date(msg.createdAt) > new Date(uniqueChats[chatPartnerId].createdAt)) {
      uniqueChats[chatPartnerId] = msg;
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
               alt="${escapeHTML(message.chatPartnerName)}" 
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

// **This is the updated function with the fix**
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
        // Reset the flag immediately after the try/catch block finishes
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
