
    const API_BASE_URL = window.location.hostname === 'localhost' 
      ? 'http://localhost:3000' 
      : 'https://salmart.onrender.com';

    const socket = io(API_BASE_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });

    // Initialize Socket.IO
    socket.on('connect', () => {
      console.log('Connected to server');
      const userId = localStorage.getItem('userId');
      if (userId) {
        socket.emit('joinRoom', userId);
      }
    });

    // Toast Notification
    function showToast(message, bgColor = '#28a745') {
      const toast = document.createElement('div');
      toast.className = 'toast-message';
      toast.style.backgroundColor = bgColor;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 100);
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    // Skeleton Loader
    function createSkeletonLoader() {
      const skeleton = document.createElement('div');
      skeleton.classList.add('skeleton-wrapper');
      skeleton.innerHTML = `
        <div class="skeleton-avatar"></div>
        <div class="skeleton-content">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line time"></div>
        </div>
      `;
      return skeleton;
    }

    function showSkeletonLoaders(container, count = 6) {
      container.innerHTML = '';
      for (let i = 0; i < count; i++) {
        container.appendChild(createSkeletonLoader());
      }
    }

    // Format Timestamp
    function formatTime(timestamp) {
      const now = new Date();
      const postDate = new Date(timestamp);
      const diffInSeconds = Math.floor((now - postDate) / 1000);

      if (diffInSeconds < 60) return 'Just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hrs ago`;
      if (diffInSeconds < 172800) return 'Yesterday';
      return postDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    
    // --- NEW LOGIC: Centralized notification processing and rendering ---
    function processNotificationData(notification) {
      const defaultAvatar = 'default-avater.png';
      const senderName = notification.senderId ? `${notification.senderId.firstName} ${notification.senderId.lastName}` : 'System';
      const avatarSrc = notification.senderId?.profilePicture || defaultAvatar;
      let typeLabel = '';
      let notificationText = notification.message || ''; // Use the message if available, otherwise it's empty
      const postId = notification.postId;
      const href = postId ? `product.html?postId=${postId}` : '#';

      switch (notification.type) {
        case 'like':
          typeLabel = `<i class="fas fa-heart" style="color:#28a745; margin-right:5px;"></i> Like`;
          if (!notificationText) notificationText = `${senderName} liked your post.`;
          break;
        case 'comment':
          typeLabel = `<i class="fas fa-comment" style="color:#28a745; margin-right:5px;"></i> Comment`;
          if (!notificationText) notificationText = `${senderName} commented on your post.`;
          break;
        case 'reply':
          typeLabel = `<i class="fas fa-reply" style="color:#28a745; margin-right:5px;"></i> Reply`;
          if (!notificationText) notificationText = `${senderName} replied to your comment.`;
          break;
        case 'message':
          typeLabel = `<i class="fas fa-envelope" style="color:#28a745; margin-right:5px;"></i> Message`;
          if (!notificationText) notificationText = `${senderName} sent you a message.`;
          break;
        case 'payment':
          typeLabel = `<i class="fas fa-money-bill-wave" style="color:#28a745; margin-right:5px;"></i> Payment`;
          if (!notificationText) notificationText = `${senderName} has paid for "${notification.data?.productName}". Kindly share the delivery address.`;
          break;
        case 'payment_released':
          typeLabel = `<i class="fas fa-unlock" style="color:#28a745; margin-right:5px;"></i> Payment Released`;
          if (!notificationText) notificationText = `Funds for "${notification.data?.productName}" have been released to your bank account.`;
          break;
        case 'payout_queued':
          typeLabel = `<i class="fas fa-clock" style="color:#28a745; margin-right:5px;"></i> Payout Queued`;
          if (!notificationText) notificationText = `Your payout of ₦${notification.data?.amount} has been queued for processing.`;
          break;
        case 'payout_queued_balance_error':
          typeLabel = `<i class="fas fa-exclamation-triangle" style="color:#dc3545; margin-right:5px;"></i> Payout Issue`;
          if (!notificationText) notificationText = `Your payout failed due to a balance error. Please contact support.`;
          break;
        case 'delivery':
          typeLabel = `<i class="fas fa-truck" style="color:#28a745; margin-right:5px;"></i> Delivery`;
          if (!notificationText) notificationText = `${senderName} confirmed delivery of "${notification.data?.productName}".`;
          break;
        case 'deal':
          typeLabel = `<i class="fas fa-handshake" style="color:#28a745; margin-right:5px;"></i> Deal`;
          if (!notificationText) notificationText = `${senderName} made a deal offer on your post.`;
          break;
        case 'promotion':
          typeLabel = `<i class="fas fa-bullhorn" style="color:#28a745; margin-right:5px;"></i> Promotion`;
          if (!notificationText) notificationText = `Your promotion has been approved.`;
          break;
        case 'warning':
          typeLabel = `<i class="fas fa-exclamation-circle" style="color:#dc3545; margin-right:5px;"></i> Warning`;
          if (!notificationText) notificationText = `A warning has been issued on your account.`;
          break;
        case 'refund_rejected':
          typeLabel = `<i class="fas fa-times-circle" style="color:#dc3545; margin-right:5px;"></i> Refund Rejected`;
          if (!notificationText) notificationText = `The refund request for "${notification.data?.productName}" has been rejected.`;
          break;
        case 'refund_processed':
          typeLabel = `<i class="fas fa-check-circle" style="color:#28a745; margin-right:5px;"></i> Refund Processed`;
          if (!notificationText) notificationText = `The refund for "${notification.data?.productName}" has been processed.`;
          break;
        case 'new_post':
          typeLabel = `<i class="fas fa-bolt" style="color:#28a745; margin-right:5px;"></i> New Post`;
          if (!notificationText) notificationText = `${senderName} has posted a new product.`;
          break;
        case 'notify-followers':
          typeLabel = `<i class="fas fa-bolt" style="color:#28a745; margin-right:5px;"></i> New Post`;
          if (!notificationText) notificationText = `${senderName} is asking you to checkout a product.`;
          break;
        default:
          typeLabel = `<i class="fas fa-info-circle" style="color:#2c3e50; margin-right:5px;"></i> Alert`;
          if (!notificationText) notificationText = `You have a new alert from ${senderName}.`;
      }

      return { typeLabel, notificationText, avatarSrc, href };
    }

    function createNotificationElement(notification, isRealTime = false) {
      const { typeLabel, notificationText, avatarSrc, href } = processNotificationData(notification);
      const timeDisplay = isRealTime ? 'Just now' : formatTime(notification.createdAt);

      const notificationElement = document.createElement('div');
      notificationElement.classList.add('notification');
      if (!notification.isRead) {
        notificationElement.classList.add('unread');
      }

      notificationElement.innerHTML = `
        <img src="${avatarSrc}" class="notification-avatar" alt="User avatar" loading="lazy" onerror="this.src='default-avater.png'">
        <div class="notification-content">
          <div class="notification-type">${typeLabel}</div>
          <div class="notification-message">
            <a href="${href}" style="text-decoration: none; color: inherit">${notificationText}</a>
          </div>
          <span class="notification-time">${timeDisplay}</span>
        </div>
        <button class="notification-dismiss" aria-label="Dismiss notification">
          <i class="fas fa-times"></i>
        </button>
      `;

      // Add dismiss functionality
      notificationElement.querySelector('.notification-dismiss').addEventListener('click', async (e) => {
        e.stopPropagation();
        await dismissNotification(notification._id);
        notificationElement.remove();
        const notificationsContainer = document.getElementById('notifications');
        const noAlertsMessage = document.getElementById('no-alerts');
        if (!notificationsContainer.children.length) {
          noAlertsMessage.style.display = 'block';
        }
      });
      return notificationElement;
    }


    // Fetch and Display Notifications
    async function fetchNotifications() {
      const notificationsContainer = document.getElementById('notifications');
      const noAlertsMessage = document.getElementById('no-alerts');

      showSkeletonLoaders(notificationsContainer);

      try {
        const response = await fetch(`${API_BASE_URL}/notifications`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const notifications = await response.json();
        displayNotifications(notifications);
        await markNotificationsAsRead();
      } catch (error) {
        console.error('Error fetching notifications:', error);
        notificationsContainer.innerHTML = '';
        noAlertsMessage.style.display = 'block';
        showToast('Failed to load notifications', '#dc3545');
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
        const notificationElement = createNotificationElement(notification);
        notificationsContainer.appendChild(notificationElement);
      });
    }

    // Mark Notifications as Read
    async function markNotificationsAsRead() {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) {
          console.error('No auth token found. Please log in.');
          return;
        }

        const response = await fetch(`${API_BASE_URL}/alerts/mark-as-viewed`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Failed to mark notifications as read');
        }

        console.log('Notifications marked as read');
      } catch (error) {
        console.error('Error marking notifications as read:', error);
      }
    }

    // Dismiss Notification
    async function dismissNotification(notificationId) {
      try {
        const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/dismiss`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });

        if (!response.ok) {
          throw new Error('Failed to dismiss notification');
        }

        showToast('Notification dismissed', '#28a745');
      } catch (error) {
        console.error('Error dismissing notification:', error);
        showToast('Failed to dismiss notification', '#dc3545');
      }
    }

    // Real-time Notifications
    socket.on('notification', (notification) => {
      console.log('Received real-time notification:', notification);
      const notificationsContainer = document.getElementById('notifications');
      const noAlertsMessage = document.getElementById('no-alerts');

      if (noAlertsMessage.style.display === 'block') {
          noAlertsMessage.style.display = 'none';
      }

      const notificationElement = createNotificationElement(notification, true);
      notificationsContainer.prepend(notificationElement);
      showToast(notification.message || 'You have a new alert', '#28a745');
    });

    // Handle New Messages
    socket.on('receiveMessage', (message) => {
      console.log('New message:', message);
      showToast(`New message from ${message.chatPartnerName || 'a user'}`, '#28a745');
    });

    // Initialize
    document.addEventListener('DOMContentLoaded', fetchNotifications);
  