// public/salmartCache.js

// This file provides a centralized way to make API requests.
// IMPORTANT: The actual caching of responses is handled by your Service Worker (e.g., service-worker.js).
// Ensure your Service Worker is configured to cache responses from the API_BASE_URL
// for optimal performance and offline capabilities.

const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://salmart.onrender.com';

class SalmartCache {
  constructor() {
    // You can add initialization logic here if needed,
    // e.g., for IndexedDB if you plan to use it alongside the service worker.
  }

  /**
   * Fetches data from the given URL and passes options (like headers) to the fetch request.
   * This method relies on an active Service Worker to handle the actual caching of responses.
   * @param {string} url - The URL to fetch.
   * @param {object} options - Options for the fetch request (e.g., headers).
   * @returns {Promise<any>} - The JSON response from the server.
   */
  async fetchWithCache(url, options = {}) {
    const { headers } = options;

    const fetchOptions = {
      headers: new Headers(headers),
    };

    try {
      // The service worker will intercept this fetch request if configured to do so.
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

      return response.json(); // Assuming all your API endpoints return JSON
    } catch (error) {
      console.error(`❌ [SalmartCache] Error fetching from ${url}:`, error);
      // Re-throw the error so the calling component can handle it (e.g., display an error message).
      throw error;
    }
  }

  /**
   * Fetches posts by category.
   * @param {string} category - The category of posts to fetch.
   * @returns {Promise<Array<object>>} - An array of post objects.
   */
  async getPostsByCategory(category) {
    const url = `${API_BASE_URL}/post?category=${encodeURIComponent(category)}`;
    return this.fetchWithCache(url, { priority: 'high' }); // priority is illustrative for now
  }

  /**
   * Fetches transactions for a user.
   * @param {string} userId - The ID of the user.
   * @param {string} authToken - The authentication token.
   * @returns {Promise<Array<object>>} - An array of transaction objects.
   */
  async getTransactions(userId, authToken) {
    const url = `${API_BASE_URL}/get-transactions/${userId}`;
    return this.fetchWithCache(url, {
      priority: 'medium',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
  }

  /**
   * Fetches messages between two users.
   * @param {string} user1Id - The ID of the first user.
   * @param {string} user2Id - The ID of the second user.
   * @param {string} authToken - The authentication token.
   * @returns {Promise<Array<object>>} - An array of message objects.
   */
  async getMessages(user1Id, user2Id, authToken) {
    const url = `${API_BASE_URL}/messages?user1=${user1Id}&user2=${user2Id}`;
    return this.fetchWithCache(url, {
      priority: 'high',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
  }

  /**
   * Fetches notifications for the authenticated user.
   * @param {string} authToken - The authentication token.
   * @returns {Promise<Array<object>>} - An array of notification objects.
   */
  async getNotifications(authToken) {
    const url = `${API_BASE_URL}/notifications`;
    return this.fetchWithCache(url, {
      priority: 'high',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
  }

  /**
   * Fetches requests by category.
   * @param {string} category - The category of requests to fetch.
   * @returns {Promise<Array<object>>} - An array of request objects.
   */
  async getRequests(category) {
    const url = `${API_BASE_URL}/requests?category=${encodeURIComponent(category)}&sort=-createdAt`;
    return this.fetchWithCache(url, { priority: 'high' });
  }

  /**
   * Handles liking a post.
   * This sends a request to the server and updates cache if successful.
   * @param {string} postId - The ID of the post to like/unlike.
   * @param {string} authToken - The authentication token.
   * @returns {Promise<object>} - The updated post object or a confirmation.
   */
  async likePost(postId, authToken) {
      const url = `${API_BASE_URL}/post/${postId}/like`;
      try {
          const response = await fetch(url, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${authToken}`,
                  'Content-Type': 'application/json'
              }
          });
          if (!response.ok) {
              const errorBody = await response.json();
              throw new Error(errorBody.message || 'Failed to like post.');
          }
          const updatedPost = await response.json();
          // After a successful like/unlike, you might want to refresh the cache for this post
          // or update the existing cached post if you have an IndexedDB implementation.
          // For now, this relies on the service worker's revalidation strategy or next fetch.
          return updatedPost;
      } catch (error) {
          console.error('Error liking post:', error);
          throw error;
      }
  }

  /**
   * Toggles follow status for a user.
   * @param {string} userIdToFollow - The ID of the user to follow/unfollow.
   * @param {string} authToken - The authentication token.
   * @returns {Promise<object>} - The updated follow status.
   */
  async toggleFollow(userIdToFollow, authToken) {
      const url = `${API_BASE_URL}/user/${userIdToFollow}/follow`;
      try {
          const response = await fetch(url, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${authToken}`,
                  'Content-Type': 'application/json'
              }
          });
          if (!response.ok) {
              const errorBody = await response.json();
              throw new Error(errorBody.message || 'Failed to toggle follow status.');
          }
          const result = await response.json();
          // No direct cache update needed here, as posts.js will re-fetch following list
          return result;
      } catch (error) {
          console.error('Error toggling follow status:', error);
          throw error;
      }
  }

  /**
   * Deletes a post.
   * @param {string} postId - The ID of the post to delete.
   * @param {string} authToken - The authentication token.
   * @returns {Promise<object>} - Confirmation of deletion.
   */
  async deletePost(postId, authToken) {
      const url = `${API_BASE_URL}/post/${postId}`;
      try {
          const response = await fetch(url, {
              method: 'DELETE',
              headers: {
                  'Authorization': `Bearer ${authToken}`
              }
          });
          if (!response.ok) {
              const errorBody = await response.json();
              throw new Error(errorBody.message || 'Failed to delete post.');
          }
          // After deletion, the cache for posts should ideally be invalidated or refreshed.
          // For now, posts.js will re-fetch all posts, which implicitly handles this.
          return response.json(); // Or simply response.status
      } catch (error) {
          console.error('Error deleting post:', error);
          throw error;
      }
  }
}

export const salmartCache = new SalmartCache();
