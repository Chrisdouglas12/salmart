// Import idb-keyval functions
import { get, set, del, clear, keys, values, entries } from './idb-keyval-iife.js';


const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

/**
 * SalmartCache2 - Chat messaging cache system with offline capabilities
 */
class SalmartCache2 {
    constructor(apiBaseUrl = API_BASE_URL) {
        this.API_BASE_URL = apiBaseUrl;
    }

    /**
     * Get auth headers for API requests
     * @returns {Object} - Authorization headers
     */
    _getAuthHeaders() {
        const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    /**
     * Fetch with network fallback
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @returns {Promise} - Fetch response
     */
    async _fetchWithNetworkFallback(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Network request failed:', error);
            throw error;
        }
    }

    /**
     * Fetches chat messages for a specific conversation with proper cache-to-server sync
     * @param {string} userId - The current user's ID
     * @param {string} receiverId - The other participant's ID
     * @returns {Promise<Array>} - Array of chat messages
     */
    async getChatMessages(userId, receiverId) {
        if (!userId || !receiverId) return [];
        
        const chatKey = [userId, receiverId].sort().join('_');
        const dbKey = `chat_messages_${chatKey}`;
        
        // Return cached data immediately, then update in background
        try {
            const cachedMessages = (await get(dbKey)) || [];
            if (cachedMessages.length > 0) {
                console.log(`✅ [SalmartCache] Serving ${cachedMessages.length} chat messages from IndexedDB.`);
                
                // Background sync for new messages
                this._backgroundSyncChatMessages(userId, receiverId, cachedMessages)
                    .catch(e => console.warn('Background chat message sync failed:', e));
                
                return cachedMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            }
        } catch (e) {
            console.error('❌ [SalmartCache] Error reading chat messages from IndexedDB:', e);
        }
        
        // Network fetch if no cache
        try {
            console.log(`🔄 [SalmartCache] Initial fetch for chat messages.`);
            const messagesFromNetwork = await this._fetchWithNetworkFallback(`${this.API_BASE_URL}/messages?user1=${userId}&user2=${receiverId}`, {
                headers: this._getAuthHeaders(),
            });
            
            // Cache the fetched messages
            if (messagesFromNetwork.length > 0) {
                await set(dbKey, messagesFromNetwork);
                console.log(`💾 [SalmartCache] Saved ${messagesFromNetwork.length} chat messages to cache.`);
            }
            
            return messagesFromNetwork;

        } catch (error) {
            console.error('❌ [SalmartCache] Failed to fetch chat messages from network.', error);
            // Return cached data as fallback, even if empty
            return (await get(dbKey)) || [];
        }
    }

    /**
     * Background sync for new chat messages
     * @param {string} userId - Current user ID
     * @param {string} receiverId - Other participant ID
     * @param {Array} cachedMessages - Currently cached messages
     */
    async _backgroundSyncChatMessages(userId, receiverId, cachedMessages) {
        const chatKey = [userId, receiverId].sort().join('_');
        const dbKey = `chat_messages_${chatKey}`;
        const mostRecentMessageTimestamp = cachedMessages.length > 0 
            ? Math.max(...cachedMessages.map(msg => new Date(msg.createdAt).getTime()))
            : null;
        
        try {
            console.log(`🔄 [SalmartCache] Background sync for new chat messages since:`, mostRecentMessageTimestamp || 'beginning of time');
            
            const url = new URL(`${this.API_BASE_URL}/messages`);
            url.searchParams.set('user1', userId);
            url.searchParams.set('user2', receiverId);
            
            if (mostRecentMessageTimestamp) {
                url.searchParams.set('since', new Date(mostRecentMessageTimestamp).toISOString());
            }

            const newMessages = await this._fetchWithNetworkFallback(url.toString(), {
                priority: 'low',
                headers: this._getAuthHeaders(),
            });

            if (newMessages.length > 0) {
                console.log(`🔄 [SalmartCache] Fetched ${newMessages.length} new chat messages in background.`);
                
                // Combine and deduplicate
                const combinedMessages = [...cachedMessages, ...newMessages];
                const uniqueMessagesMap = new Map(combinedMessages.map(msg => [msg._id || msg.tempId, msg]));
                const updatedMessages = Array.from(uniqueMessagesMap.values())
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                
                await set(dbKey, updatedMessages);
                console.log(`💾 [SalmartCache] Updated chat message cache with ${updatedMessages.length} total messages.`);
                
                // Notify the UI about new messages
                this._notifyNewChatMessages(newMessages, userId, receiverId);
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Background chat message sync failed:', error.message);
        }
    }

    /**
     * Adds a new chat message to cache
     * @param {string} userId - User ID
     * @param {string} receiverId - Receiver ID
     * @param {object} newMessage - New message to add
     */
    async addNewChatMessageToCache(userId, receiverId, newMessage) {
        if (!userId || !receiverId || !newMessage) return;

        const chatKey = [userId, receiverId].sort().join('_');
        const dbKey = `chat_messages_${chatKey}`;
        
        try {
            let cachedMessages = (await get(dbKey)) || [];
            
            // Check for duplicates by _id or tempId
            const exists = cachedMessages.some(msg => 
                (msg._id && msg._id === newMessage._id) || 
                (msg.tempId && msg.tempId === newMessage.tempId)
            );
            
            if (!exists) {
                cachedMessages.push(newMessage);
                
                // Sort by date
                cachedMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                
                await set(dbKey, cachedMessages);
                console.log(`💾 [SalmartCache] Added new chat message to cache`);
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error adding chat message to cache:', error);
        }
    }

    /**
     * Updates a chat message in cache (for status updates, tempId replacement, etc.)
     * @param {string} userId - User ID
     * @param {string} receiverId - Receiver ID
     * @param {string} messageId - Message ID (_id or tempId)
     * @param {object} updates - Updates to apply
     */
    async updateChatMessageInCache(userId, receiverId, messageId, updates) {
        if (!userId || !receiverId || !messageId || !updates) return;

        const chatKey = [userId, receiverId].sort().join('_');
        const dbKey = `chat_messages_${chatKey}`;
        
        try {
            let cachedMessages = (await get(dbKey)) || [];
            
            const messageIndex = cachedMessages.findIndex(msg => 
                msg._id === messageId || msg.tempId === messageId
            );
            
            if (messageIndex !== -1) {
                cachedMessages[messageIndex] = { ...cachedMessages[messageIndex], ...updates };
                await set(dbKey, cachedMessages);
                console.log(`💾 [SalmartCache] Updated chat message ${messageId} in cache`);
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error updating chat message in cache:', error);
        }
    }

    /**
     * Queues a message for sending when network is available
     * @param {string} userId - Sender ID
     * @param {string} receiverId - Receiver ID
     * @param {object} messageData - Message data to queue
     */
    async queueMessageForSending(userId, receiverId, messageData) {
        if (!userId || !receiverId || !messageData) return;

        const queueKey = `message_queue_${userId}`;
        
        try {
            let messageQueue = (await get(queueKey)) || [];
            
            const queuedMessage = {
                ...messageData,
                queuedAt: new Date().toISOString(),
                chatKey: [userId, receiverId].sort().join('_'),
                attempts: 0,
                maxAttempts: 3
            };
            
            messageQueue.push(queuedMessage);
            await set(queueKey, messageQueue);
            
            console.log(`📤 [SalmartCache] Queued message for sending when network is available`);
            
            // Also add to chat cache as pending
            await this.addNewChatMessageToCache(userId, receiverId, {
                ...messageData,
                status: 'queued',
                isQueued: true
            });
        } catch (error) {
            console.error('❌ [SalmartCache] Error queuing message:', error);
        }
    }

    /**
     * Gets queued messages for sending
     * @param {string} userId - User ID
     * @returns {Promise<Array>} - Array of queued messages
     */
    async getQueuedMessages(userId) {
        if (!userId) return [];
        
        const queueKey = `message_queue_${userId}`;
        
        try {
            return (await get(queueKey)) || [];
        } catch (error) {
            console.error('❌ [SalmartCache] Error getting queued messages:', error);
        }
        
        return [];
    }

    /**
     * Removes a message from the send queue
     * @param {string} userId - User ID
     * @param {string} tempId - Temporary ID of the message to remove
     */
    async removeFromMessageQueue(userId, tempId) {
        if (!userId || !tempId) return;
        
        const queueKey = `message_queue_${userId}`;
        
        try {
            let messageQueue = (await get(queueKey)) || [];
            const originalLength = messageQueue.length;
            
            messageQueue = messageQueue.filter(msg => msg.tempId !== tempId);
            
            if (messageQueue.length !== originalLength) {
                await set(queueKey, messageQueue);
                console.log(`📤 [SalmartCache] Removed message ${tempId} from queue`);
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error removing message from queue:', error);
        }
    }

    /**
     * Updates attempt count for a queued message
     * @param {string} userId - User ID
     * @param {string} tempId - Temporary ID of the message
     */
    async incrementMessageQueueAttempt(userId, tempId) {
        if (!userId || !tempId) return;
        
        const queueKey = `message_queue_${userId}`;
        
        try {
            let messageQueue = (await get(queueKey)) || [];
            
            const messageIndex = messageQueue.findIndex(msg => msg.tempId === tempId);
            if (messageIndex !== -1) {
                messageQueue[messageIndex].attempts = (messageQueue[messageIndex].attempts || 0) + 1;
                messageQueue[messageIndex].lastAttempt = new Date().toISOString();
                
                await set(queueKey, messageQueue);
                console.log(`📤 [SalmartCache] Incremented attempt count for message ${tempId}`);
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error incrementing message queue attempt:', error);
        }
    }

    /**
     * Processes the message queue when network becomes available
     * @param {string} userId - User ID
     * @param {function} sendFunction - Function to send messages (should return Promise)
     */
    async processMessageQueue(userId, sendFunction) {
        if (!userId || typeof sendFunction !== 'function') return;
        
        const queuedMessages = await this.getQueuedMessages(userId);
        
        if (queuedMessages.length === 0) {
            console.log(`📤 [SalmartCache] No queued messages to process`);
            return;
        }
        
        console.log(`📤 [SalmartCache] Processing ${queuedMessages.length} queued messages`);
        
        for (const queuedMessage of queuedMessages) {
            try {
                // Check if we've exceeded max attempts
                if (queuedMessage.attempts >= queuedMessage.maxAttempts) {
                    console.warn(`📤 [SalmartCache] Message ${queuedMessage.tempId} exceeded max attempts, removing from queue`);
                    await this.removeFromMessageQueue(userId, queuedMessage.tempId);
                    
                    // Update message status in cache
                    const [user1, user2] = queuedMessage.chatKey.split('_');
                    await this.updateChatMessageInCache(user1, user2, queuedMessage.tempId, {
                        status: 'failed',
                        isQueued: false,
                        error: 'Max send attempts exceeded'
                    });
                    continue;
                }
                
                // Attempt to send the message
                await this.incrementMessageQueueAttempt(userId, queuedMessage.tempId);
                const result = await sendFunction(queuedMessage);
                
                if (result.success) {
                    // Remove from queue on successful send
                    await this.removeFromMessageQueue(userId, queuedMessage.tempId);
                    console.log(`📤 [SalmartCache] Successfully sent queued message ${queuedMessage.tempId}`);
                } else {
                    throw new Error(result.error || 'Send failed');
                }
                
            } catch (error) {
                console.error(`📤 [SalmartCache] Failed to send queued message ${queuedMessage.tempId}:`, error);
                
                // If this was the last attempt, mark as failed
                if (queuedMessage.attempts >= queuedMessage.maxAttempts - 1) {
                    await this.removeFromMessageQueue(userId, queuedMessage.tempId);
                    
                    const [user1, user2] = queuedMessage.chatKey.split('_');
                    await this.updateChatMessageInCache(user1, user2, queuedMessage.tempId, {
                        status: 'failed',
                        isQueued: false,
                        error: error.message
                    });
                }
            }
        }
    }

    /**
     * Clears all queued messages for a user
     * @param {string} userId - User ID
     */
    async clearMessageQueue(userId) {
        if (!userId) return;
        
        const queueKey = `message_queue_${userId}`;
        
        try {
            await del(queueKey);
            console.log(`🗑️ [SalmartCache] Cleared message queue for user: ${userId}`);
        } catch (error) {
            console.error('❌ [SalmartCache] Error clearing message queue:', error);
        }
    }

    /**
     * Notifies UI about new chat messages
     * @param {Array} newMessages - Array of new messages
     * @param {string} userId - Current user ID
     * @param {string} receiverId - Other participant ID
     */
    _notifyNewChatMessages(newMessages, userId, receiverId) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('newChatMessagesFromCache', {
                detail: { 
                    messages: newMessages, 
                    userId, 
                    receiverId,
                    chatKey: [userId, receiverId].sort().join('_')
                }
            }));
        }
    }

    /**
     * Checks if the app is currently online
     * @returns {boolean} - True if online
     */
    isOnline() {
        return navigator.onLine;
    }

    /**
     * Sets up network status monitoring
     * @param {function} onOnline - Callback for when network comes back online
     * @param {function} onOffline - Callback for when network goes offline
     */
    setupNetworkMonitoring(onOnline, onOffline) {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('🌐 [SalmartCache] Network came back online');
                if (typeof onOnline === 'function') {
                    onOnline();
                }
            });
            
            window.addEventListener('offline', () => {
                console.log('🌐 [SalmartCache] Network went offline');
                if (typeof onOffline === 'function') {
                    onOffline();
                }
            });
        }
    }
}

// Export the SalmartCache2 class
export default SalmartCache2;