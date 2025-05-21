

async function checkForNewContent() {
      try {
        const userId = localStorage.getItem('userId');
        if (!userId) return;
        const response = await fetch(`${API_BASE_URL}/notification-counts?userId=${userId}`);
        const data = await response.json();
        updateBadge('alerts-badge', data.alertsCount);
        updateBadge('messages-badge', data.messagesCount);
        updateBadge('deals-badge', data.dealsCount);
      } catch (error) {
        console.error('Error fetching notification counts:', error);
      }
    }
    function updateBadge(badgeId, count) {
      const badge = document.getElementById(badgeId);
      if (!badge) return;
      if (count > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = count > 9 ? '9+' : count;
      } else {
        badge.style.display = 'none';
      }
    }
    setInterval(checkForNewContent, 30000);
    document.addEventListener('DOMContentLoaded', checkForNewContent);
    socket.on('new-notification', (data) => {
      if (data.type === 'alert') {
        updateBadge('alerts-badge', data.count);
      } else if (data.type === 'message') {
        updateBadge('messages-badge', data.count);
      } else if (data.type === 'deal') {
        updateBadge('deals-badge', data.count);
      }
    });
    socket.on("connect", () => {
      console.log("✅ Socket.IO connected with ID:", socket.id);
      const userId = localStorage.getItem("userId");
      if (userId) {
        console.log("👤 Registering user with Socket.IO:", userId);
        socket.emit("joinRoom", userId);
      } else {
        console.warn("⚠️ No userId found in localStorage");
      }
    });
    socket.on("disconnect", () => {
      console.log("❌ Socket.IO disconnected");
    });
    socket.on("connect_error", (error) => {
      console.error("🔥 Socket.IO connection error:", error);
    });
    function updateBadge(badgeId, count) {
      const badge = document.getElementById(badgeId);
      if (!badge) {
        console.error(`❌ Badge element not found: ${badgeId}`);
        return;
      }
      console.log(`🔄 Updating badge ${badgeId} with count:`, count);
      if (count > 0) {
        badge.style.display = "inline-block";
        badge.textContent = count > 9 ? "9+" : count;
      } else {
        badge.style.display = "none";
        badge.textContent = "0";
      }
    }
    async function clearBadge(type) {
      const badgeId = `${type}-badge`;
      const userId = localStorage.getItem("userId");
      const token = localStorage.getItem("authToken");
      if (!userId || !token) {
        console.warn("⚠️ User not logged in or no token found");
        return;
      }
      updateBadge(badgeId, 0);
      try {
        const response = await fetch(`${API_BASE_URL}/${type}/mark-as-viewed`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        });
        if (!response.ok) {
          throw new Error(`Failed to mark ${type} as viewed: ${response.status}`);
        }
        const data = await response.json();
        console.log(`✅ ${type} marked as viewed:`, data);
        socket.emit("badge-update", { type, count: 0, userId });
        await checkForNewContent();
      } catch (error) {
        console.error(`❌ Error clearing ${type} badge:`, error);
        checkForNewContent();
      }
    }
    async function checkForNewContent() {
      const userId = localStorage.getItem("userId");
      const token = localStorage.getItem("authToken");
      if (!userId || !token) return;
      try {
        const response = await fetch(`${API_BASE_URL}/notification-counts?userId=${userId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log("📊 Notification counts:", data);
        updateBadge("alerts-badge", data.alertsCount || 0);
        updateBadge("messages-badge", data.messagesCount || 0);
        updateBadge("deals-badge", data.dealsCount || 0);
      } catch (error) {
        console.error("💥 Error fetching notification counts:", error);
      }
    }
    socket.on("badge-update", (data) => {
      const userId = localStorage.getItem("userId");
      if (data.userId === userId) {
        console.log("📢 Received badge update:", data);
        updateBadge(`${data.type}-badge`, data.count);
      }
    });
    document.addEventListener("DOMContentLoaded", () => {
      console.log("🏁 Page loaded - initializing badges");
      checkForNewContent();
      setTimeout(() => {
        console.log("🔍 Badge elements:", {
          alerts: document.getElementById("alerts-badge"),
          messages: document.getElementById("messages-badge"),
          deals: document.getElementById("deals-badge"),
        });
      }, 1000);
    });
    setInterval(checkForNewContent, 30000);
    
        socket.on('notification', (data) => {
      console.log('Received notification:', data);
      showToast(`${data.sender.firstName} ${data.sender.lastName} ${data.type === 'like' ? 'liked' : 'commented on'} your post`, '#28a745');
    });
    socket.on('receiveMessage', (message) => {
      console.log('New message:', message);
      showToast(`New message from ${message.senderId}`, '#28a745');
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
    function showToast(message, color = '#28a745') {
      const toast = document.getElementById("toast");
      if (!toast) {
        console.error('Toast element not found');
        return;
      }
      toast.textContent = message;
      toast.style.backgroundColor = color;
      toast.classList.add("show");
      setTimeout(() => {
        toast.classList.remove("show");
      }, 3000);
    }
    function likePost(postId, userId) {
      socket.emit("like", { postId, userId });
    }
    function commentPost(postId, userId, comment) {
      socket.emit("comment", { postId, userId, comment });
    }
    socket.on("new-like", (data) => {
      console.log("New like:", data);
      alert(`User ${data.userId} liked post ${data.postId}`);
    });
    socket.on("new-comment", (data) => {
      console.log("New comment:", data);
      alert(`User ${data.userId} commented on post ${data.postId}: "${data.comment}"`);
    });