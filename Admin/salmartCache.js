// public/salmartCache.js

// IMPORTANT: This file now relies on 'idb-keyval' for IndexedDB operations.
// Ensure you include idb-keyval.js script tag in your HTML files BEFORE this script.
// Example: <script src="/idb-keyval-iife.js"></script>

const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

class SalmartCache {
  constructor() {
    // Network status awareness
    this.isOnline = navigator.onLine;
    this.pendingUpdates = new Map();
    
    // Listen for network changes
    window.addEventListener('online', () => {
      this.isOnline = true;
      this._processPendingUpdates();
      console.log('🌐 [SalmartCache] Back online - processing pending updates');
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📴 [SalmartCache] Gone offline - will serve cached content');
    });
    
    console.log('SalmartCache initialized with IndexedDB support.');
  }

  /**
   * Fetches data from the given URL and passes options (like headers) to the fetch request.
   * Now with better offline handling.
   */
  async fetchWithNetworkFallback(url, options = {}) {
    const fetchOptions = {
      ...options,
      headers: new Headers(options.headers || {}),
    };

    // If offline, immediately throw to trigger cache fallback
    if (!this.isOnline) {
      throw new Error('Network unavailable - offline mode');
    }

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

  /**
   * Helper to get common headers, especially for authorization.
   */
  _getAuthHeaders() {
    const authToken = localStorage.getItem('authToken');
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
  }

  /**
   * Generates a unique IndexedDB key for user-specific data.
   */
  _getPersonalizedDBKey(baseKey) {
    const userId = localStorage.getItem('userId') || 'anonymous';
    return `${baseKey}_${userId}`;
  }

  /**
   * Check if cached data is stale (older than 5 minutes for posts, 1 minute for messages)
   */
  async _isCacheStale(dbKey, maxAge = 300000) { // 5 minutes default
    const timestampKey = `${dbKey}_timestamp`;
    if (typeof get !== 'undefined') {
      const lastFetch = await get(timestampKey) || 0;
      return Date.now() - lastFetch > maxAge;
    }
    return true;
  }

  /**
   * Update timestamp for cache freshness tracking
   */
  async _updateCacheTimestamp(dbKey) {
    const timestampKey = `${dbKey}_timestamp`;
    if (typeof set !== 'undefined') {
      await set(timestampKey, Date.now());
    }
  }

  /**
   * Manage cache size to prevent unlimited growth
   */
  async _manageCacheSize(data, maxItems = 100) {
    if (Array.isArray(data) && data.length > maxItems) {
      // Keep most recent items (assuming they have createdAt or similar)
      const sortedData = data.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.updatedAt || 0);
        const dateB = new Date(b.createdAt || b.updatedAt || 0);
        return dateB - dateA;
      });
      return sortedData.slice(0, maxItems);
    }
    return data;
  }

  /**
   * Enhanced posts fetching with improved offline support
   */
  async getPostsByCategory(category = 'all', forceNetwork = false) {
    const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
    
    // ALWAYS try IndexedDB first for immediate response
    let cachedData = [];
    if (typeof get !== 'undefined') {
      try {
        cachedData = await get(dbKey) || [];
        console.log(`📦 [SalmartCache] Found ${cachedData.length} cached posts for category '${category}'`);
      } catch (e) {
        console.error('❌ [SalmartCache] Error reading posts from IndexedDB:', e);
      }
    }

    // If we have cached data, return it immediately
    if (cachedData.length > 0) {
      console.log(`✅ [SalmartCache] Serving ${cachedData.length} posts for category '${category}' from cache`);
      
      // If online and cache might be stale, update in background
      if (this.isOnline && !forceNetwork) {
        const isStale = await this._isCacheStale(dbKey, 300000); // 5 minutes
        if (isStale) {
          console.log(`🔄 [SalmartCache] Cache is stale, updating in background`);
          this.fetchPostsAndUpdateDB(category, true).catch(e => 
            console.warn('Background network update failed:', e)
          );
        }
      }
      
      return cachedData;
    }

    // If no cached data and offline, return empty array with message
    if (!this.isOnline && !forceNetwork) {
      console.log(`📴 [SalmartCache] Offline with no cached data for category '${category}'`);
      return [];
    }

    // If online or forceNetwork, fetch from network
    try {
      return await this.fetchPostsAndUpdateDB(category, false);
    } catch (error) {
      console.error(`❌ [SalmartCache] Network fetch failed, returning empty array`);
      return [];
    }
  }

  /**
   * Internal method to fetch posts from network and update IndexedDB.
   */
  async fetchPostsAndUpdateDB(category, silent = false) {
    const url = `${API_BASE_URL}/post?category=${encodeURIComponent(category)}`;
    const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);

    try {
      const data = await this.fetchWithNetworkFallback(url, { 
        priority: 'high', 
        headers: this._getAuthHeaders() 
      });
      
      if (typeof set !== 'undefined') {
        // Manage cache size before storing
        const managedData = await this._manageCacheSize(data, 100);
        await set(dbKey, managedData);
        await this._updateCacheTimestamp(dbKey);
        console.log(`🔄 [SalmartCache] Fetched and stored ${managedData.length} posts for category '${category}'`);
      }
      
      return data;
    } catch (error) {
      if (!silent) {
        console.error(`❌ [SalmartCache] Failed to fetch posts for category '${category}':`, error);
        
        // Try to return cached data as final fallback
        if (typeof get !== 'undefined') {
          const fallbackData = await get(dbKey) || [];
          if (fallbackData.length > 0) {
            console.log(`⚠️ [SalmartCache] Serving ${fallbackData.length} posts from cache as fallback`);
            return fallbackData;
          }
        }
        throw error;
      } else {
        console.warn(`⚠️ [SalmartCache] Background fetch for category '${category}' failed:`, error.message);
      }
      return [];
    }
  }

  /**
   * Enhanced user posts fetching
   */
  async getPostsByUserId(targetUserId, forceNetwork = false) {
    const dbKey = this._getPersonalizedDBKey(`posts_user_${targetUserId}`);
    
    // Always try cache first
    let cachedData = [];
    if (typeof get !== 'undefined') {
      try {
        cachedData = await get(dbKey) || [];
      } catch (e) {
        console.error('❌ [SalmartCache] Error reading user posts from IndexedDB:', e);
      }
    }

    // Return cached data if available
    if (cachedData.length > 0) {
      console.log(`✅ [SalmartCache] Serving ${cachedData.length} posts for user '${targetUserId}' from cache`);
      
      // Background update if online and stale
      if (this.isOnline && !forceNetwork) {
        const isStale = await this._isCacheStale(dbKey, 300000);
        if (isStale) {
          this.fetchUserPostsAndUpdateDB(targetUserId, true).catch(e => 
            console.warn('Background user posts update failed:', e)
          );
        }
      }
      
      return cachedData;
    }

    // If offline, return empty array
    if (!this.isOnline) {
      console.log(`📴 [SalmartCache] Offline with no cached posts for user '${targetUserId}'`);
      return [];
    }

    // Fetch from network
    return this.fetchUserPostsAndUpdateDB(targetUserId);
  }

  async fetchUserPostsAndUpdateDB(targetUserId, silent = false) {
    const url = `${API_BASE_URL}/post?userId=${encodeURIComponent(targetUserId)}`;
    const dbKey = this._getPersonalizedDBKey(`posts_user_${targetUserId}`);
    
    try {
      const data = await this.fetchWithNetworkFallback(url, { 
        priority: 'high', 
        headers: this._getAuthHeaders() 
      });
      
      if (typeof set !== 'undefined') {
        const managedData = await this._manageCacheSize(data, 50);
        await set(dbKey, managedData);
        await this._updateCacheTimestamp(dbKey);
        console.log(`🔄 [SalmartCache] Fetched and stored ${managedData.length} posts for user '${targetUserId}'`);
      }
      
      return data;
    } catch (error) {
      if (!silent) {
        console.error(`❌ [SalmartCache] Failed to fetch posts for user '${targetUserId}':`, error);
        
        // Final fallback to cache
        if (typeof get !== 'undefined') {
          const fallbackData = await get(dbKey) || [];
          if (fallbackData.length > 0) {
            console.log(`⚠️ [SalmartCache] Serving ${fallbackData.length} user posts from cache as fallback`);
            return fallbackData;
          }
        }
        throw error;
      } else {
        console.warn(`⚠️ [SalmartCache] Background fetch for user '${targetUserId}' failed:`, error.message);
      }
      return [];
    }
  }

  /**
   * Enhanced messages with offline support
   */
  async getMessages(user1Id, user2Id, forceNetwork = false) {
    const dbKey = this._getPersonalizedDBKey(`messages_${user1Id}_${user2Id}`);
    
    // Always try cache first
    let cachedData = [];
    if (typeof get !== 'undefined') {
      try {
        cachedData = await get(dbKey) || [];
      } catch (e) {
        console.error('❌ [SalmartCache] Error reading messages from IndexedDB:', e);
      }
    }

    // Return cached data if available
    if (cachedData.length > 0) {
      console.log(`✅ [SalmartCache] Serving ${cachedData.length} messages from cache`);
      
      // Background update if online and stale (1 minute for messages)
      if (this.isOnline && !forceNetwork) {
        const isStale = await this._isCacheStale(dbKey, 60000); // 1 minute
        if (isStale) {
          this._fetchMessagesAndUpdateDB(user1Id, user2Id, true).catch(e => 
            console.warn('Background messages update failed:', e)
          );
        }
      }
      
      return cachedData;
    }

    // If offline, return empty array
    if (!this.isOnline) {
      console.log(`📴 [SalmartCache] Offline with no cached messages`);
      return [];
    }

    // Fetch from network
    return this._fetchMessagesAndUpdateDB(user1Id, user2Id);
  }

  async _fetchMessagesAndUpdateDB(user1Id, user2Id, silent = false) {
    const url = `${API_BASE_URL}/messages?user1=${user1Id}&user2=${user2Id}`;
    const dbKey = this._getPersonalizedDBKey(`messages_${user1Id}_${user2Id}`);
    
    try {
      const data = await this.fetchWithNetworkFallback(url, {
        priority: 'high',
        headers: this._getAuthHeaders()
      });
      
      if (typeof set !== 'undefined') {
        const managedData = await this._manageCacheSize(data, 200); // Keep more messages
        await set(dbKey, managedData);
        await this._updateCacheTimestamp(dbKey);
        console.log(`🔄 [SalmartCache] Fetched and stored ${managedData.length} messages`);
      }
      
      return data;
    } catch (error) {
      if (!silent) {
        console.error(`❌ [SalmartCache] Failed to fetch messages:`, error);
        
        // Final fallback to cache
        if (typeof get !== 'undefined') {
          const fallbackData = await get(dbKey) || [];
          if (fallbackData.length > 0) {
            console.log(`⚠️ [SalmartCache] Serving ${fallbackData.length} messages from cache as fallback`);
            return fallbackData;
          }
        }
        throw error;
      }
      return [];
    }
  }

  /**
   * Optimistic like with offline queuing
   */
  async likePost(postId) {
    // If offline, queue the action
    if (!this.isOnline) {
      console.log(`📴 [SalmartCache] Queuing like for post ${postId} (offline)`);
      this.pendingUpdates.set(`like_${postId}`, {
        type: 'like',
        postId,
        timestamp: Date.now()
      });
      return { success: true, queued: true };
    }

    const url = `${API_BASE_URL}/post/${postId}/like`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this._getAuthHeaders(),
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to like post.');
      }
      
      const updatedPost = await response.json();
      
      // Update cached posts with new like status
      this._updatePostInCache(postId, updatedPost);
      
      return updatedPost;
    } catch (error) {
      console.error('Error liking post:', error);
      throw error;
    }
  }

  /**
   * Update a specific post in all relevant caches
   */
  async _updatePostInCache(postId, updatedPost) {
    if (typeof get === 'undefined' || typeof set === 'undefined') return;
    
    try {
      const userId = localStorage.getItem('userId');
      const cacheKeys = [
        this._getPersonalizedDBKey('posts_category_all'),
        this._getPersonalizedDBKey(`posts_user_${userId}`),
        // Add other category keys as needed
      ];
      
      for (const key of cacheKeys) {
        const cachedPosts = await get(key) || [];
        const postIndex = cachedPosts.findIndex(p => p._id === postId);
        
        if (postIndex !== -1) {
          cachedPosts[postIndex] = { ...cachedPosts[postIndex], ...updatedPost };
          await set(key, cachedPosts);
          console.log(`🔄 [SalmartCache] Updated post ${postId} in cache ${key}`);
        }
      }
    } catch (error) {
      console.error('Error updating post in cache:', error);
    }
  }

  /**
   * Process pending updates when back online
   */
  async _processPendingUpdates() {
    if (this.pendingUpdates.size === 0) return;
    
    console.log(`🔄 [SalmartCache] Processing ${this.pendingUpdates.size} pending updates`);
    
    for (const [key, update] of this.pendingUpdates.entries()) {
      try {
        switch (update.type) {
          case 'like':
            await this.likePost(update.postId);
            break;
          // Add other update types as needed
        }
        this.pendingUpdates.delete(key);
      } catch (error) {
        console.error(`Failed to process pending update ${key}:`, error);
      }
    }
  }

  /**
   * Get all posts with enhanced offline support
   */
  async getAllPosts(forceNetwork = false) {
    return this.getPostsByCategory('all', forceNetwork);
  }

  // Enhanced versions of other methods...
  async getTransactions(userId, forceNetwork = false) {
    const dbKey = this._getPersonalizedDBKey(`transactions_${userId}`);
    
    // Try cache first
    if (!forceNetwork && typeof get !== 'undefined') {
      try {
        const cachedData = await get(dbKey) || [];
        if (cachedData.length > 0) {
          console.log(`✅ [SalmartCache] Serving ${cachedData.length} transactions from cache`);
          return cachedData;
        }
      } catch (e) {
        console.error('❌ [SalmartCache] Error reading transactions from IndexedDB:', e);
      }
    }

    if (!this.isOnline) {
      console.log(`📴 [SalmartCache] Offline with no cached transactions`);
      return [];
    }

    const url = `${API_BASE_URL}/get-transactions/${userId}`;
    try {
      const data = await this.fetchWithNetworkFallback(url, {
        priority: 'medium',
        headers: this._getAuthHeaders()
      });
      
      if (typeof set !== 'undefined') {
        await set(dbKey, data);
        await this._updateCacheTimestamp(dbKey);
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  async getNotifications(forceNetwork = false) {
    const dbKey = this._getPersonalizedDBKey('notifications');
    
    // Try cache first
    if (!forceNetwork && typeof get !== 'undefined') {
      try {
        const cachedData = await get(dbKey) || [];
        if (cachedData.length > 0) {
          console.log(`✅ [SalmartCache] Serving ${cachedData.length} notifications from cache`);
          
          // Background update if online and stale
          if (this.isOnline) {
            const isStale = await this._isCacheStale(dbKey, 120000); // 2 minutes
            if (isStale) {
              this._fetchNotificationsAndUpdateDB(true).catch(e => 
                console.warn('Background notifications update failed:', e)
              );
            }
          }
          
          return cachedData;
        }
      } catch (e) {
        console.error('❌ [SalmartCache] Error reading notifications from IndexedDB:', e);
      }
    }

    if (!this.isOnline) {
      console.log(`📴 [SalmartCache] Offline with no cached notifications`);
      return [];
    }

    return this._fetchNotificationsAndUpdateDB();
  }

  async _fetchNotificationsAndUpdateDB(silent = false) {
    const url = `${API_BASE_URL}/notifications`;
    const dbKey = this._getPersonalizedDBKey('notifications');
    
    try {
      const data = await this.fetchWithNetworkFallback(url, {
        priority: 'high',
        headers: this._getAuthHeaders()
      });
      
      if (typeof set !== 'undefined') {
        const managedData = await this._manageCacheSize(data, 50);
        await set(dbKey, managedData);
        await this._updateCacheTimestamp(dbKey);
        console.log(`🔄 [SalmartCache] Fetched and stored ${managedData.length} notifications`);
      }
      
      return data;
    } catch (error) {
      if (!silent) {
        console.error(`❌ [SalmartCache] Failed to fetch notifications:`, error);
        
        // Final fallback to cache
        if (typeof get !== 'undefined') {
          const fallbackData = await get(dbKey) || [];
          if (fallbackData.length > 0) {
            console.log(`⚠️ [SalmartCache] Serving ${fallbackData.length} notifications from cache as fallback`);
            return fallbackData;
          }
        }
        throw error;
      }
      return [];
    }
  }

  async getRequests(category, forceNetwork = false) {
    const dbKey = this._getPersonalizedDBKey(`requests_${category}`);
    
    // Try cache first
    if (!forceNetwork && typeof get !== 'undefined') {
      try {
        const cachedData = await get(dbKey) || [];
        if (cachedData.length > 0) {
          console.log(`✅ [SalmartCache] Serving ${cachedData.length} requests from cache`);
          return cachedData;
        }
      } catch (e) {
        console.error('❌ [SalmartCache] Error reading requests from IndexedDB:', e);
      }
    }

    if (!this.isOnline) {
      console.log(`📴 [SalmartCache] Offline with no cached requests`);
      return [];
    }

    const url = `${API_BASE_URL}/requests?category=${encodeURIComponent(category)}&sort=-createdAt`;
    try {
      const data = await this.fetchWithNetworkFallback(url, { 
        priority: 'high', 
        headers: this._getAuthHeaders() 
      });
      
      if (typeof set !== 'undefined') {
        const managedData = await this._manageCacheSize(data, 50);
        await set(dbKey, managedData);
        await this._updateCacheTimestamp(dbKey);
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching requests:', error);
      return [];
    }
  }

  async toggleFollow(userIdToFollow) {
    // If offline, queue the action
    if (!this.isOnline) {
      console.log(`📴 [SalmartCache] Queuing follow toggle for user ${userIdToFollow} (offline)`);
      this.pendingUpdates.set(`follow_${userIdToFollow}`, {
        type: 'follow',
        userIdToFollow,
        timestamp: Date.now()
      });
      return { success: true, queued: true };
    }

    const url = `${API_BASE_URL}/follow/${userIdToFollow}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this._getAuthHeaders(),
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to toggle follow status.');
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error toggling follow status:', error);
      throw error;
    }
  }

  async deletePost(postId) {
    // If offline, queue the action
    if (!this.isOnline) {
      console.log(`📴 [SalmartCache] Queuing delete for post ${postId} (offline)`);
      this.pendingUpdates.set(`delete_${postId}`, {
        type: 'delete',
        postId,
        timestamp: Date.now()
      });
      return { success: true, queued: true };
    }

    const url = `${API_BASE_URL}/post/${postId}`;
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this._getAuthHeaders()
      });
      
      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || 'Failed to delete post.');
      }
      
      // Remove from cache
      this._removePostFromCache(postId);
      
      return response.json();
    } catch (error) {
      console.error('Error deleting post:', error);
      throw error;
    }
  }

  /**
   * Remove a post from all relevant caches
   */
  async _removePostFromCache(postId) {
    if (typeof get === 'undefined' || typeof set === 'undefined') return;
    
    try {
      const userId = localStorage.getItem('userId');
      const cacheKeys = [
        this._getPersonalizedDBKey('posts_category_all'),
        this._getPersonalizedDBKey(`posts_user_${userId}`),
      ];
      
      for (const key of cacheKeys) {
        const cachedPosts = await get(key) || [];
        const filteredPosts = cachedPosts.filter(p => p._id !== postId);
        
        if (filteredPosts.length !== cachedPosts.length) {
          await set(key, filteredPosts);
          console.log(`🔄 [SalmartCache] Removed post ${postId} from cache ${key}`);
        }
      }
    } catch (error) {
      console.error('Error removing post from cache:', error);
    }
  }

  /**
   * Clear all cache (useful for logout)
   */
  async clearCache() {
    if (typeof get === 'undefined' || typeof set === 'undefined') return;
    
    try {
      const userId = localStorage.getItem('userId') || 'anonymous';
      const keysToDelete = [
        `posts_category_all_${userId}`,
        `posts_user_${userId}_${userId}`,
        `messages_${userId}`,
        `transactions_${userId}`,
        `notifications_${userId}`,
        // Add timestamp keys
        `posts_category_all_${userId}_timestamp`,
        `posts_user_${userId}_${userId}_timestamp`,
        `messages_${userId}_timestamp`,
        `transactions_${userId}_timestamp`,
        `notifications_${userId}_timestamp`,
      ];
      
      for (const key of keysToDelete) {
        await set(key, undefined);
      }
      
      console.log('🗑️ [SalmartCache] Cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get cache status for debugging
   */
  async getCacheStatus() {
    if (typeof get === 'undefined') return { error: 'IndexedDB not available' };
    
    try {
      const userId = localStorage.getItem('userId') || 'anonymous';
      const status = {
        isOnline: this.isOnline,
        pendingUpdates: this.pendingUpdates.size,
        cacheKeys: {}
      };
      
      const keysToCheck = [
        `posts_category_all_${userId}`,
        `posts_user_${userId}_${userId}`,
        `messages_${userId}`,
        `transactions_${userId}`,
        `notifications_${userId}`,
      ];
      
      for (const key of keysToCheck) {
        const data = await get(key) || [];
        const timestamp = await get(`${key}_timestamp`) || 0;
        status.cacheKeys[key] = {
          itemCount: Array.isArray(data) ? data.length : 0,
          lastUpdate: new Date(timestamp).toISOString(),
          isStale: await this._isCacheStale(key)
        };
      }
      
      return status;
    } catch (error) {
      return { error: error.message };
    }
  }
}

export const salmartCache = new SalmartCache();