// public/salmartCache.js

// IMPORTANT: This file now relies on 'idb-keyval' for IndexedDB operations.
// Ensure you include idb-keyval.js script tag in your HTML files BEFORE this script.
// Example: <script src="/idb-keyval-iife.js"></script>

const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

// Using idb-keyval for IndexedDB operations
// idb-keyval exposes `get` and `set` methods globally if using the IIFE version.
// If using module version, you'd import { get, set } from './idb-keyval.js';
// For the purpose of a full snippet, we'll assume the IIFE is loaded globally.

class SalmartCache {
  constructor() {
    // Optionally set up default store names for idb-keyval if needed
    // set('key', 'value', 'custom-store-name');
    console.log('SalmartCache initialized with IndexedDB support.');
  }

  /**
   * Fetches data from the given URL and passes options (like headers) to the fetch request.
   * This method still interacts with the network, which your Service Worker will intercept.
   * @param {string} url - The URL to fetch.
   * @param {object} options - Options for the fetch request (e.g., headers).
   * @returns {Promise<any>} - The JSON response from the server.
   */
  async fetchWithNetworkFallback(url, options = {}) {
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

  /**
   * Helper to get common headers, especially for authorization.
   * @returns {object} - Object containing headers.
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
   * @param {string} baseKey - A descriptive base for the key (e.g., 'posts', 'messages').
   * @returns {string} - The generated key.
   */
  _getPersonalizedDBKey(baseKey) {
    const userId = localStorage.getItem('userId') || 'anonymous';
    return `${baseKey}_${userId}`;
  }

  /**
   * Fetches posts by category, prioritizing IndexedDB for offline access.
   * @param {string} category - The category of posts to fetch.
   * @param {boolean} forceNetwork - If true, bypasses IndexedDB and fetches directly from network.
   * @returns {Promise<Array<object>>} - An array of post objects.
   */
  async getPostsByCategory(category = 'all', forceNetwork = false) {
    const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
    let dataFromDB = [];

    // 1. Try to get from IndexedDB first
    if (!forceNetwork && typeof get !== 'undefined') { // Check if idb-keyval 'get' is available
      try {
        dataFromDB = await get(dbKey) || [];
        if (dataFromDB.length > 0) {
          console.log(`✅ [SalmartCache] Serving ${dataFromDB.length} posts for category '${category}' from IndexedDB.`);
          // If we have data, we can return it immediately for speed/offline,
          // but also initiate a background network fetch to update the cache for next time.
          this.fetchPostsAndUpdateDB(category, true).catch(e => console.warn('Background network update failed:', e));
          return dataFromDB;
        }
      } catch (e) {
        console.error('❌ [SalmartCache] Error reading posts from IndexedDB:', e);
      }
    }

    // 2. If not in DB or forceNetwork is true, fetch from network and store in DB
    return this.fetchPostsAndUpdateDB(category);
  }

  /**
   * Internal method to fetch posts from network and update IndexedDB.
   * @param {string} category - The category of posts to fetch.
   * @param {boolean} silent - If true, suppress errors that are not critical (e.g., for background updates).
   * @returns {Promise<Array<object>>} - An array of post objects.
   */
  async fetchPostsAndUpdateDB(category, silent = false) {
    const url = `${API_BASE_URL}/post?category=${encodeURIComponent(category)}`;
    const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);

    try {
      const data = await this.fetchWithNetworkFallback(url, { priority: 'high', headers: this._getAuthHeaders() });
      if (typeof set !== 'undefined') { // Check if idb-keyval 'set' is available
        await set(dbKey, data);
        console.log(`🔄 [SalmartCache] Fetched and stored ${data.length} posts for category '${category}' in IndexedDB.`);
      }
      return data;
    } catch (error) {
      if (!silent) {
        console.error(`❌ [SalmartCache] Failed to fetch posts for category '${category}' from network:`, error);
        // If network fails, and it's not a silent update, try to retrieve from DB one last time
        if (typeof get !== 'undefined') {
            const fallbackData = await get(dbKey) || [];
            if (fallbackData.length > 0) {
                console.log(`⚠️ [SalmartCache] Network failed, serving ${fallbackData.length} posts from IndexedDB as fallback.`);
                return fallbackData;
            }
        }
        throw error; // Re-throw if no fallback data found
      } else {
          console.warn(`⚠️ [SalmartCache] Background fetch for category '${category}' failed:`, error.message);
      }
      return []; // Return empty array for silent failures
    }
  }

  /**
   * Fetches posts by a specific user ID, prioritizing IndexedDB.
   * IMPORTANT: Ensure your backend /post route can filter by 'userId' if this is used for general user profiles.
   * If it's for the currently logged-in user's posts, `_getAuthHeaders()` is sufficient.
   * @param {string} targetUserId - The ID of the user whose posts to fetch.
   * @param {boolean} forceNetwork - If true, bypasses IndexedDB.
   * @returns {Promise<Array<object>>} - An array of post objects belonging to the user.
   */
  async getPostsByUserId(targetUserId, forceNetwork = false) {
      const dbKey = this._getPersonalizedDBKey(`posts_user_${targetUserId}`);
      let dataFromDB = [];

      if (!forceNetwork && typeof get !== 'undefined') {
          try {
              dataFromDB = await get(dbKey) || [];
              if (dataFromDB.length > 0) {
                  console.log(`✅ [SalmartCache] Serving ${dataFromDB.length} posts for user '${targetUserId}' from IndexedDB.`);
                  this.fetchUserPostsAndUpdateDB(targetUserId, true).catch(e => console.warn('Background user posts update failed:', e));
                  return dataFromDB;
              }
          } catch (e) {
              console.error('❌ [SalmartCache] Error reading user posts from IndexedDB:', e);
          }
      }
      return this.fetchUserPostsAndUpdateDB(targetUserId);
  }

  async fetchUserPostsAndUpdateDB(targetUserId, silent = false) {
      const url = `${API_BASE_URL}/post?userId=${encodeURIComponent(targetUserId)}`; // Make sure backend handles this
      const dbKey = this._getPersonalizedDBKey(`posts_user_${targetUserId}`);
      try {
          const data = await this.fetchWithNetworkFallback(url, { priority: 'high', headers: this._getAuthHeaders() });
          if (typeof set !== 'undefined') {
              await set(dbKey, data);
              console.log(`🔄 [SalmartCache] Fetched and stored ${data.length} posts for user '${targetUserId}' in IndexedDB.`);
          }
          return data;
      } catch (error) {
          if (!silent) {
              console.error(`❌ [SalmartCache] Failed to fetch posts for user '${targetUserId}' from network:`, error);
              if (typeof get !== 'undefined') {
                  const fallbackData = await get(dbKey) || [];
                  if (fallbackData.length > 0) {
                      console.log(`⚠️ [SalmartCache] Network failed, serving ${fallbackData.length} user posts from IndexedDB as fallback.`);
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
   * Fetches all posts (e.g., for a home feed), prioritizing IndexedDB.
   * @param {boolean} forceNetwork - If true, bypasses IndexedDB.
   * @returns {Promise<Array<object>>} - An array of all post objects.
   */
  async getAllPosts(forceNetwork = false) {
    // This is essentially same as getPostsByCategory('all') if your backend handles it that way
    return this.getPostsByCategory('all', forceNetwork);
  }

  // --- Other Methods (mostly stay the same, some can use _getAuthHeaders directly) ---

  async getTransactions(userId) {
    const url = `${API_BASE_URL}/get-transactions/${userId}`;
    return this.fetchWithNetworkFallback(url, {
      priority: 'medium',
      headers: this._getAuthHeaders()
    });
  }

  async getMessages(user1Id, user2Id) {
    const url = `${API_BASE_URL}/messages?user1=${user1Id}&user2=${user2Id}`;
    return this.fetchWithNetworkFallback(url, {
      priority: 'high',
      headers: this._getAuthHeaders()
    });
  }

  async getNotifications() {
    const url = `${API_BASE_URL}/notifications`;
    return this.fetchWithNetworkFallback(url, {
      priority: 'high',
      headers: this._getAuthHeaders()
    });
  }

  async getRequests(category) {
    const url = `${API_BASE_URL}/requests?category=${encodeURIComponent(category)}&sort=-createdAt`;
    // Assuming requests can be public or auth is optional for them
    return this.fetchWithNetworkFallback(url, { priority: 'high', headers: this._getAuthHeaders() });
  }

  async likePost(postId) {
      const url = `${API_BASE_URL}/post/${postId}/like`;
      try {
          const response = await fetch(url, { // Direct fetch here, let service worker handle cache
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
          // After like/unlike, you might want to refresh the main post feed
          // to reflect the updated like count (e.g., call getPostsByCategory again)
          return updatedPost;
      } catch (error) {
          console.error('Error liking post:', error);
          throw error;
      }
  }

  async toggleFollow(userIdToFollow) {
      const url = `${API_BASE_URL}/follow/${userIdToFollow}`;
      try {
          const response = await fetch(url, { // Direct fetch here, let service worker handle cache
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
      const url = `${API_BASE_URL}/post/${postId}`;
      try {
          const response = await fetch(url, { // Direct fetch here
              method: 'DELETE',
              headers: this._getAuthHeaders()
          });
          if (!response.ok) {
              const errorBody = await response.json();
              throw new Error(errorBody.message || 'Failed to delete post.');
          }
          // After deletion, you should ideally invalidate or re-fetch the relevant post lists.
          return response.json();
      } catch (error) {
          console.error('Error deleting post:', error);
          throw error;
      }
  }
}

export const salmartCache = new SalmartCache();
