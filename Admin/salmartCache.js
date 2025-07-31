// salmartCache.js

// IMPORTANT: This file relies on 'idb-keyval' for IndexedDB operations.
// You must include the idb-keyval library (e.g., via a <script> tag).
// For this code to work, we'll assume `get` and `set` are globally available.

const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

class SalmartCache {
    constructor() {
        console.log('SalmartCache initialized with IndexedDB support.');
        this._postCacheStore = 'posts_cache'; // Define a separate store name for posts
    }

    /**
     * Fetches data from the given URL with a network fallback.
     * This method is now a generalized utility for all API calls.
     * @param {string} url - The URL to fetch.
     * @param {object} options - Options for the fetch request.
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

    /**
     * The core function for fetching and managing posts with a delta-sync strategy.
     * This function is now much cleaner and more efficient.
     * @param {string} category - The category of posts to fetch.
     * @returns {Promise<Array<object>>} - An array of all posts (cached + new), sorted by date.
     */
    async getPostsByCategory(category = 'all') {
        const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
        
        let allPosts = [];
        let mostRecentPostTimestamp = null;
        
        // 1. Get posts from IndexedDB first for instant rendering.
        try {
            if (typeof get !== 'undefined') {
                allPosts = (await get(dbKey)) || [];
                if (allPosts.length > 0) {
                    // Find the most recent post's creation time to request new posts from the server.
                    // Assuming 'createdAt' is a string in ISO format.
                    mostRecentPostTimestamp = allPosts.reduce((latest, post) => {
                        const postDate = new Date(post.createdAt);
                        return postDate > latest ? postDate : latest;
                    }, new Date(0));
                }
                console.log(`✅ [SalmartCache] Serving ${allPosts.length} posts for category '${category}' from IndexedDB.`);
            }
        } catch (e) {
            console.error('❌ [SalmartCache] Error reading posts from IndexedDB:', e);
            allPosts = []; // Fallback to empty array on read error
        }

        // 2. Fetch new posts from the network.
        try {
            const url = new URL(`${API_BASE_URL}/post`);
            url.searchParams.set('category', category);
            // Append the `since` parameter if we have a recent post timestamp.
            if (mostRecentPostTimestamp) {
                url.searchParams.set('since', mostRecentPostTimestamp.toISOString());
            }

            const newPosts = await this.fetchWithNetworkFallback(url.toString(), {
                priority: 'high',
                headers: this._getAuthHeaders(),
            });

            if (newPosts.length > 0) {
                console.log(`🔄 [SalmartCache] Fetched ${newPosts.length} new posts from network.`);
                
                // 3. Merge old and new posts and remove duplicates.
                const combinedPosts = [...allPosts, ...newPosts];
                const uniquePostsMap = new Map(combinedPosts.map(post => [post._id, post]));
                allPosts = Array.from(uniquePostsMap.values());
                
                // 4. Update the cache with the new combined list.
                if (typeof set !== 'undefined') {
                    await set(dbKey, allPosts);
                    console.log(`💾 [SalmartCache] Updated cache with ${allPosts.length} total posts.`);
                }
            } else if (allPosts.length === 0) {
                console.log(`⚠️ [SalmartCache] No posts found, even from the network.`);
            }

        } catch (error) {
            // Log a warning, but don't re-throw. We already have the cached data to return.
            // This is the key to providing a good offline experience.
            console.warn(`⚠️ [SalmartCache] Network update failed. Serving only cached data.`, error.message);
        }

        // 5. Sort the final list and return it.
        // It's crucial to sort here because the new posts will be appended to the end.
        return allPosts.sort((a, b) => {
            const dateA = new Date(a.createdAt);
            const dateB = new Date(b.createdAt);
            return dateB.getTime() - dateA.getTime();
        });
    }

    /**
     * Gets a single post by its ID from the cache or network.
     * @param {string} postId - The ID of the post to get.
     * @returns {Promise<object|null>} - The post object or null if not found.
     */
    async getPostById(postId) {
        const dbKey = this._getPersonalizedDBKey('posts_all'); // Assuming a single large cache key
        let post = null;

        // Try to find the post in the cache first
        try {
            if (typeof get !== 'undefined') {
                const cachedPosts = (await get(dbKey)) || [];
                post = cachedPosts.find(p => p._id === postId);
                if (post) {
                    console.log(`✅ [SalmartCache] Found post ${postId} in cache.`);
                    // We can return the cached post immediately
                    return post;
                }
            }
        } catch (e) {
            console.error('❌ [SalmartCache] Error reading from cache:', e);
        }

        // If not in cache, or cache read failed, fetch from network
        try {
            const url = `${API_BASE_URL}/post/${postId}`;
            post = await this.fetchWithNetworkFallback(url, { headers: this._getAuthHeaders() });
            console.log(`🔄 [SalmartCache] Fetched post ${postId} from network.`);
            
            // You might want to update the cache with this single post here
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                 const currentPosts = (await get(dbKey)) || [];
                 const existingPostIndex = currentPosts.findIndex(p => p._id === postId);
                 if (existingPostIndex > -1) {
                    currentPosts[existingPostIndex] = post; // Update existing post
                 } else {
                    currentPosts.push(post); // Add new post
                 }
                 await set(dbKey, currentPosts);
            }
            return post;
        } catch (error) {
            console.error(`❌ [SalmartCache] Failed to get post ${postId}:`, error);
            return null; // Return null if post is not found on network either
        }
    }


    // The other methods (likePost, deletePost, etc.) should not be modified to
    // return cached data, as they are actions that modify state. They should
    // continue to make direct network requests to perform their action.
    // However, after a successful action (like, delete), you should call
    // `getPostsByCategory` again to refresh the cache and UI.

    // Example of how to integrate post-action with caching:
    async likePost(postId) {
        try {
            const updatedPost = await this.fetchWithNetworkFallback(`${API_BASE_URL}/post/${postId}/like`, {
                method: 'POST',
                headers: {
                    ...this._getAuthHeaders(),
                    'Content-Type': 'application/json'
                }
            });

            // Update the cache with the single modified post
            const dbKey = this._getPersonalizedDBKey(`posts_category_all`); // Or the specific category
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                const cachedPosts = (await get(dbKey)) || [];
                const postIndex = cachedPosts.findIndex(p => p._id === postId);
                if (postIndex > -1) {
                    cachedPosts[postIndex] = updatedPost;
                    await set(dbKey, cachedPosts);
                }
            }
            return updatedPost;

        } catch (error) {
            console.error('Error liking post:', error);
            throw error;
        }
    }

    // The other methods like deletePost, toggleFollow etc can be structured similarly
    // to first make the network call, then update the cache with the new state.
    // This is known as the "write-through" cache strategy.
    
    // ... [The rest of your methods like `getTransactions`, `getMessages`, etc., can remain as is] ...
    
}

export const salmartCache = new SalmartCache();
