// socket.js
const socket = io(window.API_BASE_URL, {
  path: '/socket.io',
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('Connected to server');
  const userId = localStorage.getItem('userId');
  if (userId) socket.emit('joinRoom', userId);
});

socket.on('notification', (data) => {
  window.showToast(`${data.sender.firstName} ${data.sender.lastName} ${data.type === 'like' ? 'liked' : 'commented on'} your post`, '#28a745');
  if (window.location.pathname === '/alerts') {
    const notificationsContainer = document.getElementById('notifications');
    const noAlertsMessage = document.getElementById('no-alerts');
    const notificationElement = document.createElement('div');
    notificationElement.classList.add('notification');
    const notificationText = data.type === 'like' ? `Someone liked your post.` : `Someone commented: "${data.comment}"`;
    notificationElement.innerHTML = `
      <img src="${data.sender.profilePicture || 'default-avatar.png'}" class="notification-avatar">
      <div class="notification-content">
        <p><a href="/post-details?postId=${data.postId}" data-link style="text-decoration: none; color: inherit">${notificationText}</a></p>
        <span class="notification-time">Just now</span>
      </div>
    `;
    notificationsContainer.prepend(notificationElement);
    noAlertsMessage.style.display = 'none';
  }
});

socket.on('receiveMessage', (message) => {
  window.showToast(`New message from ${message.senderId}`, '#28a745');
});

socket.on('badge-update', (data) => {
  const userId = localStorage.getItem('userId');
  if (data.userId === userId) {
    window.updateBadge(`${data.type}-badge`, data.count);
  }
});

function likePost(postId, userId) {
  socket.emit('likePost', { postId, userId });
}

function commentPost(postId, userId, comment) {
  socket.emit('commentPost', { postId, userId, comment });
}

function sendMessage(senderId, receiverId, text) {
  socket.emit('sendMessage', { senderId, receiverId, text });
}

window.socket = socket;
window.likePost = likePost;
window.commentPost = commentPost;
window.sendMessage = sendMessage;