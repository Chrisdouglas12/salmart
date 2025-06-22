
    // Global variables
    const userId = localStorage?.getItem("userId");
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
    let socket = null;
    let isInitialLoad = true;
    let isClickProcessing = false;
    let messages = [];
    let messageUpdateTimeouts = new Map();

    // DOM elements
    const messageListElement = document.getElementById("message-list");
    const emptyStateElement = document.getElementById("empty-state");
    const desktopIframe = document.getElementById('desktop-iframe');

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
      // Add refresh functionality
      window.addEventListener('focus', () => {
        if (!isInitialLoad) {
          fetchMessages();
        }
      });

      // Add pull-to-refresh simulation
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

    function handleNewMessage(newMessage) {
      try {
        // Check for duplicate messages
        if (messages.some(msg => msg._id === newMessage._id)) {
          console.log('Duplicate message skipped:', newMessage._id);
          return;
        }

        // Add new message to the beginning
        messages.unshift(newMessage);
        
        // Sort messages by creation date (newest first)
        messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Re-render messages
        renderMessages();
        
        // Scroll to top to show new message
        messageListElement.scrollTop = 0;
        
        // Hide empty state
        emptyStateElement.style.display = "none";
        
        // Clear any existing timeout for this message
        if (messageUpdateTimeouts.has(newMessage._id)) {
          clearTimeout(messageUpdateTimeouts.get(newMessage._id));
        }
        
        // Set timeout to remove 'new' class after animation
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
        fetchMessages(); // Fallback to refetch
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
        console.log('Showing skeleton loaders...');
        showSkeletonLoaders();
      }

      try {
        console.log('Fetching messages for user:', userId);
        const response = await fetch(`${API_BASE_URL}/api/messages?userId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const fetchedMessages = await response.json();
        console.log('Fetched messages:', fetchedMessages);
        
        // Update messages array
        messages = fetchedMessages;
        
        // Render messages
        renderMessages();
        
        isInitialLoad = false;
        
      } catch (error) {
        console.error('Fetch messages error:', error);
        showErrorMessage('Failed to load messages. Please try again later.');
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
      // Group messages by chat partner (most recent message per partner)
      const uniqueChats = {};
      messages.forEach(msg => {
        const chatPartnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
        if (!uniqueChats[chatPartnerId] || new Date(msg.createdAt) > new Date(uniqueChats[chatPartnerId].createdAt)) {
          uniqueChats[chatPartnerId] = msg;
        }
      });

      // Sort by most recent message
      const sortedChats = Object.values(uniqueChats)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return sortedChats.map(message => {
        const chatPartnerId = message.senderId === userId ? message.receiverId : message.senderId;
        const isUnread = !message.isRead && message.senderId !== userId;
        const isNew = messages.indexOf(message) === 0 && !isInitialLoad;

        // Generate message preview
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
          <div class="message-item ${isUnread ? 'unread' : ''} ${isNew ? 'new' : ''}" 
               data-message-id="${message._id}" 
               onclick="handleMessageClick('${encodeURIComponent(chatPartnerId)}', '${encodeURIComponent(message.chatPartnerName)}', '${encodeURIComponent(message.chatPartnerProfilePicture || 'Default.png')}')">
            
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

    async function handleMessageClick(partnerId, partnerName, partnerProfile) {
      if (window.innerWidth >= 768) {
        // Desktop logic: load chat content in iframe
        const decodedPartnerId = decodeURIComponent(partnerId);
        const chatUrl = `Chats.html?user_id=${encodeURIComponent(userId)}&recipient_id=${partnerId}&recipient_username=${partnerName}&recipient_profile_picture_url=${partnerProfile}`;
        desktopIframe.src = chatUrl;

        // Optionally, mark as read on click even on desktop
        try {
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
            console.warn('Failed to mark messages as viewed on server (desktop)');
          }
     
          fetchMessages();
        } catch (error) {
          console.error('Error marking messages as viewed (desktop):', error);
        }

      } else {
        // Mobile logic: navigate to chat page (existing logic)
        if (isClickProcessing) {
          console.log('Click processing, ignoring...');
          return;
        }

        isClickProcessing = true;
        const decodedPartnerId = decodeURIComponent(partnerId);

        try {
          // Mark messages as read immediately in UI
          // This part needs to be more specific to the clicked message item
          // For simplicity, we'll refetch all messages after marking as viewed
          // or you could target the specific item and remove its 'unread' class/indicator.

          // Mark messages as viewed on server
          console.log('Marking messages as viewed for partner:', decodedPartnerId);
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
            console.warn('Failed to mark messages as viewed on server');
          }
          // After marking as viewed, refresh the messages to update the unread status
          await fetchMessages();

          // Navigate to chat
          const chatUrl = `Chats.html?user_id=${encodeURIComponent(userId)}&recipient_id=${partnerId}&recipient_username=${partnerName}&recipient_profile_picture_url=${partnerProfile}`;
          console.log('Navigating to:', chatUrl);
          window.location.href = chatUrl;

        } catch (error) {
          console.error('Error in handleMessageClick:', error);
          // Navigate anyway as a fallback
          const chatUrl = `Chats.html?user_id=${encodeURIComponent(userId)}&recipient_id=${partnerId}&recipient_username=${partnerName}&recipient_profile_picture_url=${partnerProfile}`;
          window.location.href = chatUrl;
        } finally {
          // Reset processing flag after a delay
          setTimeout(() => {
            isClickProcessing = false;
          }, 1000);
        }
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

        // Less than 1 minute ago
        if (minutes < 1) {
          return 'Just now';
        }
        // Less than 1 hour ago
        else if (minutes < 60) {
          return `${minutes}m`;
        }
        // Less than 24 hours ago
        else if (hours < 24) {
          return `${hours}h`;
        }
        // Less than 7 days ago
        else if (days < 7) {
          return `${days}d`;
        }
        // Same year
        else if (date.getFullYear() === now.getFullYear()) {
          return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        // Different year
        else {
          return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
        }
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
        .replace(/'/g, '&#39;');
    }

    // Clear notification badge function
    function clearBadge(badgeType) {
      const badge = document.getElementById(`${badgeType}-badge`);
      if (badge) {
        badge.style.display = 'none';
      }
    }

    // Cleanup function
    window.addEventListener('beforeunload', () => {
      // Clear all timeouts
      messageUpdateTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      messageUpdateTimeouts.clear();
      
      // Disconnect socket
      if (socket) {
        socket.disconnect();
      }
    });

    // Handle visibility change (when tab becomes active/inactive)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !isInitialLoad) {
        // Refresh messages when tab becomes active
        fetchMessages();
      }
    });

    // Add service worker for better performance (optional)
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  