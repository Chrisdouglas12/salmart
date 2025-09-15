// Add this to your main client-side JavaScript files

class OfflineManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.setupEventListeners();
    this.initServiceWorker();
  }

  setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.onOnline();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.onOffline();
    });
  }

  async initServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        
        // Register sync for processing offline queue
        if ('sync' in registration) {
          await registration.sync.register('process-offline-queue');
        }
        
        console.log('✅ [Client] Service Worker ready for offline support');
      } catch (error) {
        console.error('❌ [Client] Service Worker registration failed:', error);
      }
    }
  }

  // Send message to service worker
  async sendMessageToSW(type, data) {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        registration.active.postMessage({ type, data });
      }
    }
  }

  // Enhanced fetch with offline queueing
  async fetchWithOfflineQueue(url, options = {}) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return response;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn('⚠️ [Client] Fetch failed, might be offline:', error);
      
      // If it's a POST/PUT/DELETE request and we're offline, queue it
      if (!this.isOnline && options.method && options.method !== 'GET') {
        return this.queueOfflineAction(url, options);
      }
      
      throw error;
    }
  }

  // Queue action for offline processing
  async queueOfflineAction(url, options) {
    const actionData = {
      type: this.determineActionType(url),
      endpoint: url,
      method: options.method || 'POST',
      data: options.body ? JSON.parse(options.body) : {}
    };

    await this.sendMessageToSW('QUEUE_ACTION', actionData);
    
    // Show user feedback
    this.showOfflineNotification(`Your ${actionData.type} will be sent when you're back online`);
    
    // Return a mock success response
    return new Response(JSON.stringify({
      success: true,
      queued: true,
      message: 'Action queued for when you\'re back online'
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  determineActionType(url) {
    if (url.includes('/messages')) return 'message';
    if (url.includes('/post')) return 'post';
    if (url.includes('/comment')) return 'comment';
    if (url.includes('/like')) return 'like';
    if (url.includes('/follow')) return 'follow';
    return 'action';
  }

  // Save draft messages
  async saveDraft(conversationId, content, messageType = 'text') {
    await this.sendMessageToSW('SAVE_DRAFT', {
      conversationId,
      content,
      messageType
    });
  }

  // UI feedback methods
  showOfflineNotification(message) {
    // Create a toast notification or banner
    const notification = document.createElement('div');
    notification.className = 'offline-notification';
    notification.innerHTML = `
      <div class="offline-notification-content">
        <span class="offline-icon">📴</span>
        <span class="offline-message">${message}</span>
        <button class="offline-dismiss" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);
  }

  updateConnectionStatus() {
    const statusIndicator = document.getElementById('connection-status');
    if (statusIndicator) {
      statusIndicator.textContent = this.isOnline ? '🌐 Online' : '📴 Offline';
      statusIndicator.className = this.isOnline ? 'online' : 'offline';
    }
  }

  onOnline() {
    console.log('🌐 [Client] Back online');
    this.updateConnectionStatus();
    this.showOfflineNotification('Back online! Syncing queued actions...');
    
    // Process any queued actions
    this.sendMessageToSW('PROCESS_QUEUE', {});
  }

  onOffline() {
    console.log('📴 [Client] Gone offline');
    this.updateConnectionStatus();
    this.showOfflineNotification('You\'re offline. Actions will be queued.');
  }
}

// Enhanced message sending with offline support
class MessageSender {
  constructor(offlineManager) {
    this.offlineManager = offlineManager;
  }

  async sendMessage(conversationId, content, messageType = 'text') {
    const messageData = {
      conversationId,
      content,
      messageType,
      timestamp: Date.now(),
      tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    try {
      // Show message immediately in UI with "sending" status
      this.addMessageToUI(messageData, 'sending');
      
      // Try to send via API
      const response = await this.offlineManager.fetchWithOfflineQueue('/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(messageData)
      });

      const result = await response.json();
      
      if (result.queued) {
        // Update UI to show "queued" status
        this.updateMessageStatus(messageData.tempId, 'queued');
        
        // Save as draft
        await this.offlineManager.saveDraft(conversationId, content, messageType);
      } else {
        // Update UI to show "sent" status
        this.updateMessageStatus(messageData.tempId, 'sent');
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ [Client] Message send failed:', error);
      this.updateMessageStatus(messageData.tempId, 'failed');
      throw error;
    }
  }

  addMessageToUI(messageData, status) {
    const messageContainer = document.getElementById('messages-container');
    if (!messageContainer) return;

    const messageElement = document.createElement('div');
    messageElement.className = `message sent ${status}`;
    messageElement.setAttribute('data-temp-id', messageData.tempId);
    
    messageElement.innerHTML = `
      <div class="message-content">${messageData.content}</div>
      <div class="message-meta">
        <span class="message-time">${new Date(messageData.timestamp).toLocaleTimeString()}</span>
        <span class="message-status">${this.getStatusIcon(status)}</span>
      </div>
    `;
    
    messageContainer.appendChild(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;
  }

  updateMessageStatus(tempId, status) {
    const messageElement = document.querySelector(`[data-temp-id="${tempId}"]`);
    if (messageElement) {
      messageElement.className = `message sent ${status}`;
      const statusElement = messageElement.querySelector('.message-status');
      if (statusElement) {
        statusElement.innerHTML = this.getStatusIcon(status);
      }
    }
  }

  getStatusIcon(status) {
    switch (status) {
      case 'sending': return '⏳';
      case 'queued': return '📤';
      case 'sent': return '✓';
      case 'delivered': return '✓✓';
      case 'failed': return '❌';
      default: return '';
    }
  }
}

// Initialize offline support
const offlineManager = new OfflineManager();
const messageSender = new MessageSender(offlineManager);

// Example usage in your existing code:
// Replace your existing message sending with:
// messageSender.sendMessage(conversationId, messageContent);

// Add connection status indicator to your HTML
document.addEventListener('DOMContentLoaded', () => {
  const statusIndicator = document.createElement('div');
  statusIndicator.id = 'connection-status';
  statusIndicator.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    padding: 5px 10px;
    border-radius: 15px;
    font-size: 12px;
    font-weight: bold;
    z-index: 1000;
    background: #4CAF50;
    color: white;
  `;
  document.body.appendChild(statusIndicator);
  
  offlineManager.updateConnectionStatus();
});