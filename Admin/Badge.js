// Update badge function
function updateBadge(badgeId, count) {
  const badge = document.getElementById(badgeId);
  if (!badge) {
    console.error(`❌ Badge element not found: ${badgeId}`);
    return;
  }
  const safeCount = Number(count) || 0; // Ensure valid number
  console.log(`🔄 Updating badge ${badgeId} with count: ${safeCount}`);
  badge.textContent = safeCount > 9 ? '9+' : safeCount.toString();
  badge.style.display = safeCount > 0 ? 'inline-block' : 'none';
}

// Check for new content
async function checkForNewContent() {
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('authToken');
  if (!userId || !token) {
    console.warn('⚠️ No userId or token found');
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/notification-counts?userId=${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    console.log(`📊 Received notification counts: ${JSON.stringify(data)}`);
    updateBadge('alerts-badge', data.notificationCount || 0);
    updateBadge('messages-badge', data.messagesCount || 0);
    updateBadge('deals-badge', 0);
  } catch (error) {
    console.error(`💥 Error fetching notification counts: ${error.message}`);
    updateBadge('alerts-badge', 0);
    updateBadge('messages-badge', 0);
    updateBadge('deals-badge', 0);
  }
}

// Clear badge
async function clearBadge(type) {
  const badgeId = `${type}-badge`;
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('authToken');
  if (!userId || !token) {
    console.warn('⚠️ User not logged in or no token found');
    return;
  }
  updateBadge(badgeId, 0);
  try {
    const response = await fetch(`${API_BASE_URL}/${type}/mark-as-viewed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to mark ${type} as viewed: ${response.status}`);
    }
    const data = await response.json();
    console.log(`✅ ${type} marked as viewed:`, data);
    socket.emit('badge-update', { type, count: 0, userId });
    await checkForNewContent();
  } catch (error) {
    console.error(`❌ Error clearing ${type} badge: ${error.message}`);
    checkForNewContent();
  }
}

// Socket.IO connection
socket.on('connect', () => {
  console.log('✅ Socket.IO connected with ID:', socket.id);
  const userId = localStorage.getItem('userId');
  if (userId) {
    console.log('✅ Registering user with Socket.IO:', userId);
    socket.emit('joinRoom', userId);
  } else {
    console.warn('⚠️ No userId found in localStorage');
  }
});

socket.on('disconnect', () => {
  console.log('❌ Socket.IO disconnected');
});

socket.on('connect_error', (error) => {
  console.error('🔥 Socket.IO error:', error.message);
});

// Socket.IO notification handlers
socket.on('notification', (data) => {
  console.log('📢 Received notification:', data);
  const message =
    data.type === 'follow'
      ? `${data.sender.firstName} ${data.sender.lastName} followed you`
      : data.type === 'like'
      ? `${data.sender.firstName} ${data.sender.lastName} liked your post`
      : data.type === 'comment'
      ? `${data.sender.firstName} ${data.sender.lastName} commented on your post`
      : data.type === 'reply'
      ? `${data.sender.firstName} ${data.sender.lastName} replied to your comment`
      : 'New notification';
  showToast(message, '#28a745');
  checkForNewContent();
});

socket.on('badge-update', (data) => {
  const userId = localStorage.getItem('userId');
  if (data.userId === userId) {
    console.log(`✅ Received badge-update: ${JSON.stringify(data)}`);
    const badgeId = data.type === 'message' ? 'messages-badge' : data.type === 'deal' ? 'deals-badge' : 'alerts-badge';
    updateBadge(badgeId, data.count || 0);
  }
});

socket.on('countsUpdate', (data) => {
  const userId = localStorage.getItem('userId');
  if (data.userId === userId || !data.userId) {
    console.log(`✅ Received countsUpdate: ${JSON.stringify(data)}`);
    updateBadge('alerts-badge', data.notificationCount || 0);
    updateBadge('messages-badge', data.messagesCount || 0);
  }
});

socket.on('receiveMessage', (data) => {
  console.log('📩 Received message:', data);
  showToast(`New message from ${data.chatPartnerName || data.senderId}`, '#28a745');
  checkForNewContent();
});

// Interaction functions
function likePost(postId, userId) {
  console.log(`👍 Emitting likePost for postId: ${postId} by user: ${userId}`);
  socket.emit('likePost', { postId, userId });
}

function commentPost(postId, userId, comment) {
  console.log(`💬 Emitting commentPost for postId: ${postId} by user: ${userId}`);
  socket.emit('commentPost', { postId, userId, comment });
}

function sendMessage(senderId, receiverId, text) {
  console.log(`📤 Sending message from ${senderId} to ${receiverId}`);
  socket.emit('sendMessage', { senderId, receiverId, text });
}

// Toast notification
function showToast(message, color = '#28a745') {
  const toast = document.getElementById('toast');
  if (!toast) {
    console.error('❌ Toast element not found');
    return;
  }
  console.log(`🍞 Showing toast: ${message}`);
  toast.textContent = message;
  toast.style.backgroundColor = color;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('🏁 Page loaded - initializing badges');
  checkForNewContent();
  setTimeout(() => {
    console.log('🔍 Badge elements:', {
      alerts: !!document.getElementById('alerts-badge'),
      messages: !!document.getElementById('messages-badge'),
      deals: !!document.getElementById('deals-badge'),
    });
  }, 1000);
});

// Polling
setInterval(checkForNewContent, 30000);