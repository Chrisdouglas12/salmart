import { get, set, del } from './idb-keyval-iife.js';

const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

// This class will contain the methods related to messages and followers
// It assumes the common utility methods like _fetchWithNetworkFallback, _getAuthHeaders, and _getPersonalizedDBKey are available,
// so you might need to create a base class or import them from a shared utility file.
// For now, I'm including them here for a complete, self-contained file.
class SalmartMessagesFollowersCache {
    constructor() {
        console.log('SalmartMessagesFollowersCache initialized with IndexedDB support.');
    }
    
    async get(key) {
        if (typeof get !== 'undefined') {
            try {
                return await get(key);
            } catch (error) {
                console.error(`❌ [SalmartCache] Error getting key '${key}':`, error);
                return null;
            }
        }
        return null;
    }

    async set(key, value) {
        if (typeof set !== 'undefined') {
            try {
                await set(key, value);
            } catch (error) {
                console.error(`❌ [SalmartCache] Error setting key '${key}':`, error);
            }
        }
    }

    async del(key) {
        if (typeof del !== 'undefined') {
            try {
                await del(key);
            } catch (error) {
                console.error(`❌ [SalmartCache] Error deleting key '${key}':`, error);
            }
        }
    }

    async _fetchWithNetworkFallback(url, options = {}) {
        const fetchOptions = {
            ...options,
            headers: new Headers(options.headers || {}),
        };

        try {
            const response = await fetch(url, fetchOptions);
            if (!response.ok) {
                let errorDetails = '';
                try {
                    const errorJson = await response.json();
                    errorDetails = errorJson.message || JSON.stringify(errorJson);
                } catch (e) {
                    errorDetails = response.statusText;
                }
                throw new Error(`API Error: ${response.status} - ${errorDetails}`);
            }
            return response.json();
        } catch (error) {
            console.error(`❌ [SalmartCache] Network fetch failed for ${url}:`, error);
            throw error;
        }
    }

    _getAuthHeaders() {
        const authToken = localStorage.getItem('authToken');
        const headers = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        return headers;
    }

    _getPersonalizedDBKey(baseKey) {
        const userId = localStorage.getItem('userId') || 'anonymous';
        return `${baseKey}_${userId}`;
    }

    // --- Message-related methods ---

    /**
     * Fetches messages with proper cache-to-server sync.
     * @param {string} userId - The current user's ID
     * @returns {Promise<Array>} - Array of messages
     */
    async getMessages(userId) {
        if (!userId) return [];

        const dbKey = `messages_${userId}`;

        try {
            if (typeof get !== 'undefined') {
                const cachedMessages = (await get(dbKey)) || [];
                if (cachedMessages.length > 0) {
                    console.log(`✅ [SalmartCache] Serving ${cachedMessages.length} messages from IndexedDB.`);
                    this._backgroundSyncNewMessages(userId, cachedMessages)
                        .catch(e => console.warn('Background message sync failed:', e));
                    return cachedMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                }
            }
        } catch (e) {
            console.error('❌ [SalmartCache] Error reading messages from IndexedDB:', e);
        }

        try {
            console.log(`🔄 [SalmartCache] Initial fetch for messages.`);
            const messagesFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/api/messages?userId=${userId}`, {
                headers: this._getAuthHeaders(),
            });
            if (messagesFromNetwork.length > 0 && typeof set !== 'undefined') {
                await set(dbKey, messagesFromNetwork);
                console.log(`💾 [SalmartCache] Saved ${messagesFromNetwork.length} messages to cache.`);
            }
            return messagesFromNetwork;
        } catch (error) {
            console.error('❌ [SalmartCache] Failed to fetch messages from network.', error);
            return (await get(dbKey)) || [];
        }
    }

    async _backgroundSyncNewMessages(userId, cachedMessages) {
        const dbKey = `messages_${userId}`;
        const mostRecentMessageTimestamp = cachedMessages.length > 0 ? cachedMessages[0].createdAt : null;

        try {
            console.log(`🔄 [SalmartCache] Background sync for new messages since:`, mostRecentMessageTimestamp || 'beginning of time');

            const url = new URL(`${API_BASE_URL}/api/messages`);
            url.searchParams.set('userId', userId);
            if (mostRecentMessageTimestamp) {
                url.searchParams.set('since', mostRecentMessageTimestamp);
            }

            const newMessages = await this._fetchWithNetworkFallback(url.toString(), {
                priority: 'low',
                headers: this._getAuthHeaders(),
            });

            if (newMessages.length > 0) {
                console.log(`🔄 [SalmartCache] Fetched ${newMessages.length} new messages in background.`);
                const combinedMessages = [...newMessages, ...cachedMessages];
                const uniqueMessagesMap = new Map(combinedMessages.map(msg => [msg._id, msg]));
                const updatedMessages = Array.from(uniqueMessagesMap.values())
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                if (typeof set !== 'undefined') {
                    await set(dbKey, updatedMessages);
                    console.log(`💾 [SalmartCache] Updated message cache with ${updatedMessages.length} total messages.`);
                    this._notifyNewMessages(newMessages);
                }
            } else {
                console.log(`✅ [SalmartCache] No new messages found in background sync.`);
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Background message sync failed:', error.message);
        }
    }

    async updateMessageInCache(userId, messageId, updates) {
        if (!userId || !messageId || !updates) return;

        const dbKey = `messages_${userId}`;
        try {
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedMessages = (await get(dbKey)) || [];
                const messageIndex = cachedMessages.findIndex(msg => msg._id === messageId);
                if (messageIndex !== -1) {
                    cachedMessages[messageIndex] = { ...cachedMessages[messageIndex], ...updates };
                    await set(dbKey, cachedMessages);
                    console.log(`💾 [SalmartCache] Updated message ${messageId} in cache`);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error updating message in cache:', error);
        }
    }

    async addNewMessageToCache(userId, newMessage) {
        if (!userId || !newMessage) return;
        const dbKey = `messages_${userId}`;

        try {
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedMessages = (await get(dbKey)) || [];
                const exists = cachedMessages.some(msg => msg._id === newMessage._id);
                if (!exists) {
                    cachedMessages.unshift(newMessage);
                    cachedMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    await set(dbKey, cachedMessages);
                    console.log(`💾 [SalmartCache] Added new message to cache`);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error adding message to cache:', error);
        }
    }

    async refreshMessages(userId) {
        if (!userId) return [];
        const dbKey = `messages_${userId}`;

        try {
            console.log(`🔄 [SalmartCache] Force refreshing messages from server`);
            const messagesFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/api/messages?userId=${userId}`, {
                headers: this._getAuthHeaders(),
            });
            if (typeof set !== 'undefined') {
                await set(dbKey, messagesFromNetwork);
                console.log(`💾 [SalmartCache] Force updated message cache with ${messagesFromNetwork.length} messages.`);
            }
            return messagesFromNetwork;
        } catch (error) {
            console.error('❌ [SalmartCache] Error force refreshing messages:', error);
            return [];
        }
    }

    async clearMessageCache(userId) {
        if (!userId) return;
        const dbKey = `messages_${userId}`;
        try {
            if (typeof del !== 'undefined') {
                await del(dbKey);
                console.log(`🗑️ [SalmartCache] Cleared message cache for user: ${userId}`);
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error clearing message cache:', error);
        }
    }

    _notifyNewMessages(newMessages) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('newMessagesFromCache', {
                detail: { messages: newMessages }
            }));
        }
    }

    // --- Follower-related methods ---

    async getFollowers(userId) {
        if (!userId) return [];
        const dbKey = `followers_${userId}`;

        try {
            if (typeof get !== 'undefined') {
                const cachedFollowers = (await get(dbKey)) || [];
                if (cachedFollowers.length > 0) {
                    console.log(`✅ [SalmartCache] Serving ${cachedFollowers.length} followers from IndexedDB.`);
                    this._backgroundSyncFollowers(userId, cachedFollowers)
                        .catch(e => console.warn('Background follower sync failed:', e));
                    return cachedFollowers;
                }
            }
        } catch (e) {
            console.error('❌ [SalmartCache] Error reading followers from IndexedDB:', e);
        }

        try {
            console.log(`🔄 [SalmartCache] Initial fetch for followers.`);
            const followersFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/followers`, {
                headers: this._getAuthHeaders(),
            });
            if (followersFromNetwork.length > 0 && typeof set !== 'undefined') {
                await set(dbKey, followersFromNetwork);
                console.log(`💾 [SalmartCache] Saved ${followersFromNetwork.length} followers to cache.`);
            }
            return followersFromNetwork;
        } catch (error) {
            console.error('❌ [SalmartCache] Failed to fetch followers from network.', error);
            return (await get(dbKey)) || [];
        }
    }

    async _backgroundSyncFollowers(userId, cachedFollowers) {
        const dbKey = `followers_${userId}`;

        try {
            console.log(`🔄 [SalmartCache] Background sync for followers data...`);
            const updatedFollowers = await this._fetchWithNetworkFallback(`${API_BASE_URL}/followers`, {
                priority: 'low',
                headers: this._getAuthHeaders(),
            });

            const hasChanges = this._hasFollowerChanges(cachedFollowers, updatedFollowers);
            if (hasChanges) {
                console.log(`🔄 [SalmartCache] Follower data changed, updating cache.`);
                if (typeof set !== 'undefined') {
                    await set(dbKey, updatedFollowers);
                    console.log(`💾 [SalmartCache] Updated follower cache with ${updatedFollowers.length} total followers.`);
                    this._notifyFollowerUpdates(updatedFollowers);
                }
            } else {
                console.log(`✅ [SalmartCache] No follower changes found in background sync.`);
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Background follower sync failed:', error.message);
        }
    }

    _hasFollowerChanges(cachedFollowers, newFollowers) {
        if (cachedFollowers.length !== newFollowers.length) {
            return true;
        }

        const cachedIds = new Set(cachedFollowers.map(f => f._id));
        const newIds = new Set(newFollowers.map(f => f._id));

        if (cachedIds.size !== newIds.size) {
            return true;
        }

        for (const id of cachedIds) {
            if (!newIds.has(id)) {
                return true;
            }
        }
        return false;
    }

    async addNewFollowerToCache(userId, newFollower) {
        if (!userId || !newFollower) return;
        const dbKey = `followers_${userId}`;

        try {
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedFollowers = (await get(dbKey)) || [];
                const exists = cachedFollowers.some(follower => follower._id === newFollower._id);
                if (!exists) {
                    cachedFollowers.push(newFollower);
                    await set(dbKey, cachedFollowers);
                    console.log(`💾 [SalmartCache] Added new follower to cache`);
                    this._notifyFollowerUpdates(cachedFollowers);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error adding follower to cache:', error);
        }
    }

    async removeFollowerFromCache(userId, followerId) {
        if (!userId || !followerId) return;
        const dbKey = `followers_${userId}`;

        try {
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedFollowers = (await get(dbKey)) || [];
                const originalLength = cachedFollowers.length;
                cachedFollowers = cachedFollowers.filter(follower => follower._id !== followerId);
                if (cachedFollowers.length !== originalLength) {
                    await set(dbKey, cachedFollowers);
                    console.log(`💾 [SalmartCache] Removed follower from cache`);
                    this._notifyFollowerUpdates(cachedFollowers);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error removing follower from cache:', error);
        }
    }

    async refreshFollowers(userId) {
        if (!userId) return [];
        const dbKey = `followers_${userId}`;

        try {
            console.log(`🔄 [SalmartCache] Force refreshing followers from server`);
            const followersFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/followers`, {
                headers: this._getAuthHeaders(),
            });
            if (typeof set !== 'undefined') {
                await set(dbKey, followersFromNetwork);
                console.log(`💾 [SalmartCache] Force updated follower cache with ${followersFromNetwork.length} followers.`);
            }
            return followersFromNetwork;
        } catch (error) {
            console.error('❌ [SalmartCache] Error force refreshing followers:', error);
            return [];
        }
    }

    async clearFollowerCache(userId) {
        if (!userId) return;
        const dbKey = `followers_${userId}`;
        try {
            if (typeof del !== 'undefined') {
                await del(dbKey);
                console.log(`🗑️ [SalmartCache] Cleared follower cache for user: ${userId}`);
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error clearing follower cache:', error);
        }
    }

    _notifyFollowerUpdates(updatedFollowers) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('followersUpdateFromCache', {
                detail: { followers: updatedFollowers }
            }));
        }
    }
}

export const salmartMessagesFollowersCache = new SalmartMessagesFollowersCache();
