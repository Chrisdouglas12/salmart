// utils.js
function showToast(message, color = '#28a745') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.backgroundColor = color;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
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

async function clearBadge(type) {
  const badgeId = `${type}-badge`;
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('authToken');
  if (!userId || !token) return;
  updateBadge(badgeId, 0);
  try {
    const response = await fetch(`${window.API_BASE_URL}/${type}/mark-as-viewed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error(`Failed to mark ${type} as viewed`);
    window.socket.emit('badge-update', { type, count: 0, userId });
    await checkForNewContent();
  } catch (error) {
    console.error(`Error clearing ${type} badge:`, error);
  }
}

async function checkForNewContent() {
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('authToken');
  if (!userId || !token) return;
  try {
    const response = await fetch(`${window.API_BASE_URL}/notification-counts?userId=${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    updateBadge('alerts-badge', data.alertsCount || 0);
    updateBadge('messages-badge', data.messagesCount || 0);
    updateBadge('deals-badge', data.dealsCount || 0);
  } catch (error) {
    console.error('Error fetching notification counts:', error);
  }
}

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

async function markNotificationsAsRead() {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.error('No auth token found. Please log in.');
      return;
    }
    const response = await fetch(`${window.API_BASE_URL}/alerts/mark-as-viewed`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to mark notifications as read');
    clearBadge('alerts');
  } catch (error) {
    console.error('Error marking notifications as read:', error);
  }
}

window.showToast = showToast;
window.updateBadge = updateBadge;
window.clearBadge = clearBadge;
window.checkForNewContent = checkForNewContent;
window.formatTime = formatTime;
window.markNotificationsAsRead = markNotificationsAsRead;