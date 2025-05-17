
function formatTime(timestamp) {
  const now = new Date();
  const postDate = new Date(timestamp);
  const diffInSeconds = Math.floor((now - postDate) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hrs ago`;
  if (diffInSeconds < 172800) return "Yesterday";
  return postDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function fetchNotifications() {
  try {
    const response = await fetch(`${API_BASE_URL}/notifications`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });

    if (!response.ok) throw new Error('Failed to fetch notifications');
    // Skip fetching if loaded from cache
    if (window.skipFetch && notificationsContainer.children.length > 0) {
      console.log('Skipping fetchNotifications: using cached content');
      return;
    }

    const notifications = await response.json();
    displayNotifications(notifications);

    await markNotificationsAsRead();
  } catch (error) {
    console.error('Error fetching notifications:', error);
  }
}

function displayNotifications(notifications) {
  const notificationsContainer = document.getElementById('notifications');
  const noAlertsMessage = document.getElementById('no-alerts');

  notificationsContainer.innerHTML = '';

  if (notifications.length === 0) {
    noAlertsMessage.style.display = 'block';
    return;
  }

  noAlertsMessage.style.display = 'none';

  notifications.forEach(notification => {
    const notificationElement = document.createElement('div');
    notificationElement.classList.add('notification');

    let notificationText = '';
    if (notification.type === 'like') {
      notificationText = `<p style="margin-top: 0%; margin-bottom: 0px; margin-left: 70%; color: #17a2b8; font-weight: 600;">Reactions</p>${notification.senderId.firstName} ${notification.senderId.lastName} liked your post.`;
    } else if (notification.type === 'comment') {
      notificationText = `${notification.senderId.firstName} ${notification.senderId.lastName} commented on your ad`;
    } else if (notification.type === 'payment') {
      notificationText = `<p style="color: #28a745; margin-left: -100%; margin-bottom: 10px; font-weight: 600;">Payment</p><strong>${notification.senderId.firstName} ${notification.senderId.lastName}</strong> paid for <strong>"${notification.payment}"</strong> kindly release delivery address`;
    } else if (notification.type === 'delivery') {
      notificationText = `<p style="color: #28a745; margin-left: -100%; margin-bottom: 10px; font-weight: 600;">Funds Transfer</p><strong>${notification.senderId.firstName} ${notification.senderId.lastName}</strong> has confirmed your delivery of <strong>"${notification.payment}"</strong>. Your funds have been released to your bank account.`;
    } else if (notification.type === 'warning') {
      notificationText = `<p style="color: #28a745; margin-left: -100%; margin-bottom: 10px; font-weight: 600;">Bank Details</p>Please add your bank details to receive payment from <strong>${notification.senderId.firstName} ${notification.senderId.lastName}</strong>.`;
    }

    notificationElement.innerHTML = `
      <img src="${notification.senderId.profilePicture || 'default-avatar.png'}" class="notification-avatar">
      <div class="notification-content">
        <p><a href="post-details.html?postId=${notification.postId}" style="text-decoration: none; color: inherit">${notificationText}</a></p>
        <span class="notification-time">${formatTime(notification.createdAt)}</span>
      </div>
    `;

    notificationsContainer.appendChild(notificationElement);
  });
}

async function markNotificationsAsRead() {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.error('No auth token found. Please log in.');
      return;
    }

    const response = await fetch(`${API_BASE_URL}/alerts/mark-as-viewed`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to mark notifications as read');
    }

    console.log('Notifications marked as read successfully');
    // Update cache after fetching
    routeCache.alerts.content = document.getElementById('main-content').innerHTML;
    routeCache.alerts.isLoaded = true;
  } catch (error) {
    console.error('Error marking notifications as read:', error);
  }
}

// Real-time notification handling
window.socket.on('notification', (notification) => {
  console.log('Received notification:', notification);

  const notificationElement = document.createElement('div');
  notificationElement.classList.add('notification');

  let notificationText = '';
  if (notification.type === 'like') {
    notificationText = `Someone liked your post.`;
  } else if (notification.type === 'comment') {
    notificationText = `Someone commented: "${notification.comment}"`;
  }

  notificationElement.innerHTML = `
    <img src="${notification.sender.profilePicture || 'default-avatar.png'}" class="notification-avatar">
    <div class="notification-content">
      <p>${notificationText}</p>
      <span class="notification-time">Just now</span>
    </div>
  `;

  const notificationsContainer = document.getElementById('notifications');
  notificationsContainer.prepend(notificationElement);

  document.getElementById('no-alerts').style.display = 'none';
  window.showToast(`${notification.sender.firstName} ${notification.sender.lastName} ${notification.type === 'like' ? 'liked' : 'commented on'} your post`);
});

// Initial fetch
fetchNotifications();