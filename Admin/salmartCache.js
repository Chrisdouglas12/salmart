import { get, set, del } from './idb-keyval-iife.js';

const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

class SalmartCache {
    constructor() {
        this.pendingUpdates = new Map(); // Track pending updates
        console.log('SalmartCache initialized with IndexedDB support and real-time sync.');
    }

    // New generic get/set/del methods for any data.
    // These methods allow other modules (like Messages.js) to use SalmartCache
    // as a general-purpose key-value store for IndexedDB.
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


    /**
     * Fetches data from the given URL with a network fallback.
     * This is a generalized utility for all API calls.
     * @param {string} url - The URL to fetch.
     * @param {object} options - Options for the fetch request.
     * @returns {Promise<any>} - The JSON response from the server.
     */
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

    /**
     * Updates a specific post in the cache with new data (likes, comments, etc.)
     * @param {string} postId - The ID of the post to update
     * @param {object} updates - The updates to apply to the post
     * @param {string} category - The category of the post
     */
    async updatePostInCache(postId, updates, category = 'all') {
        if (!postId || !updates) return;

        const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
        
        try {
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedPosts = (await get(dbKey)) || [];
                
                const postIndex = cachedPosts.findIndex(post => post._id === postId);
                if (postIndex !== -1) {
                    // Update the post with new data
                    cachedPosts[postIndex] = { ...cachedPosts[postIndex], ...updates };
                    await set(dbKey, cachedPosts);
                    console.log(`💾 [SalmartCache] Updated post ${postId} in cache for category ${category}`);
                    
                    // Also update other categories if the post exists there
                    await this._updatePostInAllCategories(postId, updates);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error updating post in cache:', error);
        }
    }

    /**
     * Updates a post across all cached categories
     * @param {string} postId - The ID of the post to update
     * @param {object} updates - The updates to apply
     */
    async _updatePostInAllCategories(postId, updates) {
        const categories = ['all', 'electronics', 'fashion', 'home', 'sports', 'books', 'automotive'];
        const userId = localStorage.getItem('userId') || 'anonymous';
        
        for (const category of categories) {
            try {
                const dbKey = `posts_category_${category}_${userId}`;
                if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                    let cachedPosts = (await get(dbKey)) || [];
                    const postIndex = cachedPosts.findIndex(post => post._id === postId);
                    
                    if (postIndex !== -1) {
                        cachedPosts[postIndex] = { ...cachedPosts[postIndex], ...updates };
                        await set(dbKey, cachedPosts);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [SalmartCache] Could not update post in category ${category}:`, error);
            }
        }
    }

    /**
     * Optimistically updates likes in cache and syncs with server
     * @param {string} postId - The post ID
     * @param {boolean} isLiked - Whether the post is being liked or unliked
     * @param {string} userId - The current user's ID
     * @param {string} category - The post category
     */
    async optimisticLikeUpdate(postId, isLiked, userId, category = 'all') {
        if (!postId || !userId) return;

        // Store pending update
        this.pendingUpdates.set(`like_${postId}`, { isLiked, timestamp: Date.now() });

        try {
            // Get current cached post to update likes optimistically
            const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
            let cachedPosts = [];
            
            if (typeof get !== 'undefined') {
                cachedPosts = (await get(dbKey)) || [];
            }

            const postIndex = cachedPosts.findIndex(post => post._id === postId);
            if (postIndex !== -1) {
                const post = cachedPosts[postIndex];
                let updatedLikes = [...(post.likes || [])];

                if (isLiked) {
                    if (!updatedLikes.includes(userId)) {
                        updatedLikes.push(userId);
                    }
                } else {
                    updatedLikes = updatedLikes.filter(id => id !== userId);
                }

                // Update cache optimistically
                await this.updatePostInCache(postId, { likes: updatedLikes }, category);
                
                // Update UI immediately
                this._updateLikeUI(postId, updatedLikes, userId);
            }

            const response = await this._fetchWithNetworkFallback(`${API_BASE_URL}/post/like/${postId}`, {
                method: 'POST',
                headers: {
                    ...this._getAuthHeaders(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: isLiked ? 'like' : 'unlike' }),
            });

            // Update cache with server response
            if (response.likes) {
                await this.updatePostInCache(postId, { likes: response.likes }, category);
                this._updateLikeUI(postId, response.likes, userId);
            }

            // Remove pending update
            this.pendingUpdates.delete(`like_${postId}`);

        } catch (error) {
            console.error('❌ [SalmartCache] Error in optimistic like update:', error);
            
            this.pendingUpdates.delete(`like_${postId}`);
            
            // Revert optimistic update on error
            // Re-fetch the post to get accurate data
            await this._refreshPostData(postId, category);
        }
    }


    /**
     * Adds a new post to the cache after creation
     * @param {object} newPost - The newly created post
     * @param {string} category - The category of the post
     */
    async addNewPostToCache(newPost, category = 'all') {
        try {
            const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
            
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedPosts = (await get(dbKey)) || [];
                
                // Add new post to the beginning (most recent)
                const updatedPosts = [newPost, ...cachedPosts];
                
                // Remove duplicates by ID
                const uniquePosts = updatedPosts.filter((post, index, arr) => 
                    arr.findIndex(p => p._id === post._id) === index
                );
                
                await set(dbKey, uniquePosts);
                console.log(`💾 [SalmartCache] Added new post to cache for category: ${category}`);
                
                // Also add to 'all' category if not already 'all'
                if (category !== 'all') {
                    await this.addNewPostToCache(newPost, 'all');
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error adding new post to cache:', error);
            // Fallback: clear cache
            await this.clearCache(category);
        }
    }

    /**
     * Updates the like UI elements
     * @param {string} postId - The post ID
     * @param {Array} likes - Array of user IDs who liked the post
     * @param {string} currentUserId - Current user's ID
     */
    _updateLikeUI(postId, likes, currentUserId) {
        const likeButtons = document.querySelectorAll(`.like-button[data-post-id="${postId}"]`);
        const isLiked = likes.includes(currentUserId);
        
        likeButtons.forEach(button => {
            const icon = button.querySelector('i');
            const countSpan = button.querySelector('.like-count');
            
            if (icon) {
                icon.className = isLiked ? 'fas fa-heart' : 'far fa-heart';
            }
            if (countSpan) {
                countSpan.textContent = likes.length;
            }
        });
    }

    /**
     * Updates comment count in cache
     * @param {string} postId - The post ID
     * @param {number} commentCount - New comment count
     * @param {string} category - Post category
     */
    async updateCommentCount(postId, commentCount, category = 'all') {
        await this.updatePostInCache(postId, { 
            comments: Array(commentCount).fill(null) // Simple way to set length
        }, category);

        // Update UI
        const commentButtons = document.querySelectorAll(`.reply-button[data-post-id="${postId}"]`);
        commentButtons.forEach(button => {
            const countSpan = button.querySelector('.comment-count');
            if (countSpan) {
                countSpan.textContent = commentCount;
            }
        });
    }

    /**
     * Refreshes a specific post's data from the server
     * @param {string} postId - The post ID
     * @param {string} category - Post category
     */
    async _refreshPostData(postId, category = 'all') {
        try {
            const response = await this._fetchWithNetworkFallback(`${API_BASE_URL}/post/${postId}`, {
                headers: this._getAuthHeaders(),
            });

            if (response) {
                await this.updatePostInCache(postId, response, category);
                
                // Update UI with fresh data
                const currentUserId = localStorage.getItem('userId');
                if (response.likes && currentUserId) {
                    this._updateLikeUI(postId, response.likes, currentUserId);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error refreshing post data:', error);
        }
    }

    /**
     * Fetches posts for a given category, handling both initial load and infinite scrolling.
     * Now includes real-time sync for interactions data.
     * @param {string} category - The category of posts to fetch.
     * @param {string} [lastPostId=null] - The ID of the last post for pagination.
     * @returns {Promise<Array<object>>} - A promise that resolves to an array of posts.
     */
    async getPosts(category = 'all', lastPostId = null) {
        const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
        
        // Return cached data immediately for initial load, then update in background.
        if (!lastPostId) {
            try {
                if (typeof get !== 'undefined') {
                    const cachedPosts = (await get(dbKey)) || [];
                    if (cachedPosts.length > 0) {
                        console.log(`✅ [SalmartCache] Serving ${cachedPosts.length} posts for category '${category}' from IndexedDB.`);
                        // Sort by createdAt and return the cached posts.
                        const sortedCachedPosts = cachedPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                        
                        // Background update for delta-sync AND interactions sync
                        this._backgroundSyncNewPosts(category, sortedCachedPosts).catch(e => console.warn('Background sync failed:', e));
                        this._syncInteractionsData(sortedCachedPosts, category).catch(e => console.warn('Interactions sync failed:', e));
                        
                        return sortedCachedPosts;
                    }
                }
            } catch (e) {
                console.error('❌ [SalmartCache] Error reading posts from IndexedDB:', e);
            }
        }
        
        // Network fetch for new posts or older posts.
        try {
            const url = new URL(`${API_BASE_URL}/post`);
            url.searchParams.set('category', category);
            
            // For infinite scroll, use the 'before' parameter.
            if (lastPostId) {
                url.searchParams.set('before', lastPostId);
                console.log(`🔄 [SalmartCache] Fetching older posts before ID: ${lastPostId}.`);
            } else {
                console.log(`🔄 [SalmartCache] Initial fetch for category: ${category}.`);
            }

            const postsFromNetwork = await this._fetchWithNetworkFallback(url.toString(), {
                priority: lastPostId ? 'low' : 'high',
                headers: this._getAuthHeaders(),
            });
            
            // If it's the initial load, cache the fetched posts.
            if (!lastPostId) {
                if (postsFromNetwork.length > 0 && typeof set !== 'undefined') {
                    await set(dbKey, postsFromNetwork);
                    console.log(`💾 [SalmartCache] Saved ${postsFromNetwork.length} posts to cache.`);
                }
            }
            
            return postsFromNetwork;

        } catch (error) {
            console.error('❌ [SalmartCache] Failed to fetch posts from network.', error);
            // If the network call fails on the initial load, and there's no cache, return an empty array.
            return (await get(dbKey)) || [];
        }
    }

    /**
     * Syncs interaction data (likes, comments) for cached posts
     * @param {Array} cachedPosts - The cached posts
     * @param {string} category - Post category
     */
    async _syncInteractionsData(cachedPosts, category) {
        if (!cachedPosts.length) return;

        try {
            const postIds = cachedPosts.map(post => post._id).filter(Boolean);
            if (postIds.length === 0) return;

            // Fetch interaction data for all posts
            const response = await this._fetchWithNetworkFallback(`${API_BASE_URL}/posts/interactions`, {
                method: 'POST',
                headers: {
                    ...this._getAuthHeaders(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ postIds }),
            });

            if (response.interactions) {
                const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
                let hasUpdates = false;

                // Update cached posts with latest interaction data
                const updatedPosts = cachedPosts.map(post => {
                    const interaction = response.interactions.find(i => i.postId === post._id);
                    if (interaction) {
                        const needsUpdate = 
                            (post.likes?.length || 0) !== (interaction.likes?.length || 0) ||
                            (post.comments?.length || 0) !== (interaction.comments?.length || 0);

                        if (needsUpdate) {
                            hasUpdates = true;
                            return {
                                ...post,
                                likes: interaction.likes || [],
                                comments: interaction.comments || []
                            };
                        }
                    }
                    return post;
                });

                if (hasUpdates) {
                    if (typeof set !== 'undefined') {
                        await set(dbKey, updatedPosts);
                        console.log(`🔄 [SalmartCache] Updated interaction data for ${category} posts`);
                    }

                    // Update UI with latest data
                    this._updateInteractionUI(response.interactions);
                }
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Failed to sync interactions data:', error);
        }
    }

    /**
     * Updates UI elements with latest interaction data
     * @param {Array} interactions - Array of interaction data
     */
    _updateInteractionUI(interactions) {
        const currentUserId = localStorage.getItem('userId');
        if (!currentUserId) return;

        interactions.forEach(({ postId, likes, comments }) => {
            // Update like buttons
            if (likes) {
                this._updateLikeUI(postId, likes, currentUserId);
            }

            // Update comment counts
            if (comments) {
                const commentButtons = document.querySelectorAll(`.reply-button[data-post-id="${postId}"]`);
                commentButtons.forEach(button => {
                    const countSpan = button.querySelector('.comment-count');
                    if (countSpan) {
                        countSpan.textContent = comments.length;
                    }
                });
            }
        });
    }

    /**
     * Internal method to fetch new posts since the most recent cached post.
     * This runs in the background and updates the cache without blocking the UI.
     * @param {string} category 
     * @param {Array<object>} cachedPosts 
     */
    async _backgroundSyncNewPosts(category, cachedPosts) {
        if (cachedPosts.length === 0) return;

        const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
        const mostRecentPostTimestamp = cachedPosts[0].createdAt; // Assumes sorted list
        
        try {
            const url = new URL(`${API_BASE_URL}/post`);
            url.searchParams.set('category', category);
            url.searchParams.set('since', mostRecentPostTimestamp);

            const newPosts = await this._fetchWithNetworkFallback(url.toString(), {
                priority: 'low',
                headers: this._getAuthHeaders(),
            });

            if (newPosts.length > 0) {
                console.log(`🔄 [SalmartCache] Fetched ${newPosts.length} new posts in background.`);
                
                const combinedPosts = [...newPosts, ...cachedPosts];
                const uniquePostsMap = new Map(combinedPosts.map(post => [post._id, post]));
                const updatedPosts = Array.from(uniquePostsMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                if (typeof set !== 'undefined') {
                    await set(dbKey, updatedPosts);
                    console.log(`💾 [SalmartCache] Updated cache with ${updatedPosts.length} total posts.`);
                }
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Background sync failed:', error.message);
        }
    }

    /**
     * Clears cache for a specific category or all categories
     * @param {string} [category=null] - Category to clear, or null for all
     */
    async clearCache(category = null) {
        try {
            if (category) {
                const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
                if (typeof del !== 'undefined') {
                    await del(dbKey);
                    console.log(`🗑️ [SalmartCache] Cleared cache for category: ${category}`);
                }
            } else {
                // Clear all post caches
                const categories = ['all', 'electronics', 'fashion', 'home', 'sports', 'books', 'automotive'];
                const userId = localStorage.getItem('userId') || 'anonymous';
                
                for (const cat of categories) {
                    const dbKey = `posts_category_${cat}_${userId}`;
                    if (typeof del !== 'undefined') {
                        await del(dbKey);
                    }
                }
                console.log('🗑️ [SalmartCache] Cleared all post caches');
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error clearing cache:', error);
        }
    }

// Add these methods to your SalmartCache class after the existing message methods

/**
 * Fetches followers with proper cache-to-server sync (similar to getMessages/getPosts)
 * @param {string} userId - The current user's ID
 * @returns {Promise<Array>} - Array of followers
 */
async getFollowers(userId) {
    if (!userId) return [];
    
    const dbKey = `followers_${userId}`;
    
    // Return cached data immediately, then update in background
    try {
        if (typeof get !== 'undefined') {
            const cachedFollowers = (await get(dbKey)) || [];
            if (cachedFollowers.length > 0) {
                console.log(`✅ [SalmartCache] Serving ${cachedFollowers.length} followers from IndexedDB.`);
                
                // Background sync for updated follower data
                this._backgroundSyncFollowers(userId, cachedFollowers)
                    .catch(e => console.warn('Background follower sync failed:', e));
                
                return cachedFollowers;
            }
        }
    } catch (e) {
        console.error('❌ [SalmartCache] Error reading followers from IndexedDB:', e);
    }
    
    // Network fetch if no cache
    try {
        console.log(`🔄 [SalmartCache] Initial fetch for followers.`);
        const followersFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/followers`, {
            headers: this._getAuthHeaders(),
        });
        
        // Cache the fetched followers
        if (followersFromNetwork.length > 0 && typeof set !== 'undefined') {
            await set(dbKey, followersFromNetwork);
            console.log(`💾 [SalmartCache] Saved ${followersFromNetwork.length} followers to cache.`);
        }
        
        return followersFromNetwork;

    } catch (error) {
        console.error('❌ [SalmartCache] Failed to fetch followers from network.', error);
        // Return cached data as fallback, even if empty
        return (await get(dbKey)) || [];
    }
}

/**
 * Background sync for updated follower data
 * @param {string} userId - Current user ID
 * @param {Array} cachedFollowers - Currently cached followers
 */
async _backgroundSyncFollowers(userId, cachedFollowers) {
    const dbKey = `followers_${userId}`;
    
    try {
        console.log(`🔄 [SalmartCache] Background sync for followers data...`);

        const updatedFollowers = await this._fetchWithNetworkFallback(`${API_BASE_URL}/followers`, {
            priority: 'low',
            headers: this._getAuthHeaders(),
        });

        // Check if there are any changes
        const hasChanges = this._hasFollowerChanges(cachedFollowers, updatedFollowers);
        
        if (hasChanges) {
            console.log(`🔄 [SalmartCache] Follower data changed, updating cache.`);
            
            if (typeof set !== 'undefined') {
                await set(dbKey, updatedFollowers);
                console.log(`💾 [SalmartCache] Updated follower cache with ${updatedFollowers.length} total followers.`);
                
                // Notify the UI about follower updates
                this._notifyFollowerUpdates(updatedFollowers);
            }
        } else {
            console.log(`✅ [SalmartCache] No follower changes found in background sync.`);
        }
    } catch (error) {
        console.warn('⚠️ [SalmartCache] Background follower sync failed:', error.message);
    }
}

/**
 * Checks if there are changes between cached and new follower data
 * @param {Array} cachedFollowers - Cached followers
 * @param {Array} newFollowers - New followers from server
 * @returns {boolean} - True if there are changes
 */
_hasFollowerChanges(cachedFollowers, newFollowers) {
    if (cachedFollowers.length !== newFollowers.length) {
        return true;
    }
    
    // Create sets of follower IDs for comparison
    const cachedIds = new Set(cachedFollowers.map(f => f._id));
    const newIds = new Set(newFollowers.map(f => f._id));
    
    // Check if any IDs are different
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

/**
 * Adds a new follower to cache
 * @param {string} userId - User ID
 * @param {object} newFollower - New follower to add
 */
async addNewFollowerToCache(userId, newFollower) {
    if (!userId || !newFollower) return;

    const dbKey = `followers_${userId}`;
    
    try {
        if (typeof get !== 'undefined' && typeof set !== 'undefined') {
            let cachedFollowers = (await get(dbKey)) || [];
            
            // Check for duplicates
            const exists = cachedFollowers.some(follower => follower._id === newFollower._id);
            if (!exists) {
                cachedFollowers.push(newFollower);
                
                await set(dbKey, cachedFollowers);
                console.log(`💾 [SalmartCache] Added new follower to cache`);
                
                // Notify UI
                this._notifyFollowerUpdates(cachedFollowers);
            }
        }
    } catch (error) {
        console.error('❌ [SalmartCache] Error adding follower to cache:', error);
    }
}

/**
 * Removes a follower from cache
 * @param {string} userId - User ID
 * @param {string} followerId - Follower ID to remove
 */
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
                
                // Notify UI
                this._notifyFollowerUpdates(cachedFollowers);
            }
        }
    } catch (error) {
        console.error('❌ [SalmartCache] Error removing follower from cache:', error);
    }
}

/**
 * Forces a refresh of followers from server
 * @param {string} userId - User ID
 */
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

/**
 * Clears follower cache for a user
 * @param {string} userId - User ID
 */
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

/**
 * Notifies UI about follower updates (can be overridden by implementing classes)
 * @param {Array} updatedFollowers - Array of updated followers
 */
_notifyFollowerUpdates(updatedFollowers) {
    // Dispatch custom event for UI to listen to
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('followersUpdateFromCache', {
            detail: { followers: updatedFollowers }
        }));
    }
}
    /**
     * Fetches the list of users the current user is following, with caching.
     * @returns {Promise<string[]>} - A promise that resolves to an array of user IDs.
     */
    async fetchFollowingList() {
        const userId = localStorage.getItem('userId');
        if (!userId) return [];

        const dbKey = this._getPersonalizedDBKey('following_list');
        
        try {
            if (typeof get !== 'undefined') {
                const cachedList = await get(dbKey);
                if (cachedList) {
                    console.log("✅ [SalmartCache] Serving following list from IndexedDB.");
                    this._fetchWithNetworkFallback(`${API_BASE_URL}/api/is-following-list`, { headers: this._getAuthHeaders() })
                        .then(response => {
                            if (response && Array.isArray(response.following)) {
                                const following = response.following.filter(u => u && u._id).map(u => u._id.toString());
                                set(dbKey, [...new Set(following)]);
                            }
                        })
                        .catch(e => console.warn('Background following list update failed:', e));
                    return cachedList;
                }
            }

            const response = await this._fetchWithNetworkFallback(`${API_BASE_URL}/api/is-following-list`, {
                headers: this._getAuthHeaders()
            });
            const following = Array.isArray(response.following)
                ? [...new Set(response.following.filter(user => user && user._id).map(user => user._id.toString()))]
                : [];
            
            if (typeof set !== 'undefined') {
                await set(dbKey, following);
            }
            return following;
        } catch (error) {
            console.error('Error fetching following list:', error);
            throw error;
        }
    }

    /**
     * Toggles the follow status for a user and updates the cache.
     * @param {string} userIdToFollow - The ID of the user to follow/unfollow.
     * @param {boolean} isCurrentlyFollowing - The current follow status.
     * @returns {Promise<object>} - A promise that resolves to the API response.
     */
    async toggleFollow(userIdToFollow, isCurrentlyFollowing) {
        if (!userIdToFollow) {
            throw new Error('User ID is required to toggle follow status.');
        }
        
        const endpoint = isCurrentlyFollowing ? `${API_BASE_URL}/unfollow/${userIdToFollow}` : `${API_BASE_URL}/follow/${userIdToFollow}`;
        const dbKey = this._getPersonalizedDBKey('following_list');
        
        try {
            const response = await this._fetchWithNetworkFallback(endpoint, {
                method: 'POST',
                headers: this._getAuthHeaders(),
            });
            
            // Optimistically update the cache
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedList = await get(dbKey) || [];
                if (isCurrentlyFollowing) {
                    cachedList = cachedList.filter(id => id !== userIdToFollow);
                } else {
                    cachedList.push(userIdToFollow);
                }
                await set(dbKey, [...new Set(cachedList)]);
            }

            return response;
        } catch (error) {
            console.error('Error toggling follow status:', error);
            throw error;
        }
    }


/**
 * Fetches notifications with proper cache-to-server sync (similar to getMessages/getPosts)
 * @param {string} userId - The current user's ID
 * @returns {Promise<Array>} - Array of notifications
 */
async getNotifications(userId) {
    if (!userId) return [];
    
    const dbKey = `notifications_${userId}`;
    
    // Return cached data immediately, then update in background
    try {
        if (typeof get !== 'undefined') {
            const cachedNotifications = (await get(dbKey)) || [];
            if (cachedNotifications.length > 0) {
                console.log(`✅ [SalmartCache] Serving ${cachedNotifications.length} notifications from IndexedDB.`);
                
                // Background sync for new notifications
                this._backgroundSyncNotifications(userId, cachedNotifications)
                    .catch(e => console.warn('Background notification sync failed:', e));
                
                return cachedNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }
        }
    } catch (e) {
        console.error('❌ [SalmartCache] Error reading notifications from IndexedDB:', e);
    }
    
    // Network fetch if no cache
    try {
        console.log(`🔄 [SalmartCache] Initial fetch for notifications.`);
        const notificationsFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/notifications`, {
            headers: this._getAuthHeaders(),
        });
        
        // Cache the fetched notifications
        if (notificationsFromNetwork.length > 0 && typeof set !== 'undefined') {
            await set(dbKey, notificationsFromNetwork);
            console.log(`💾 [SalmartCache] Saved ${notificationsFromNetwork.length} notifications to cache.`);
        }
        
        return notificationsFromNetwork;

    } catch (error) {
        console.error('❌ [SalmartCache] Failed to fetch notifications from network.', error);
        // Return cached data as fallback, even if empty
        return (await get(dbKey)) || [];
    }
}

/**
 * Background sync for new notifications (similar to _backgroundSyncNewMessages)
 * @param {string} userId - Current user ID
 * @param {Array} cachedNotifications - Currently cached notifications
 */
async _backgroundSyncNotifications(userId, cachedNotifications) {
    const dbKey = `notifications_${userId}`;
    const mostRecentNotificationTimestamp = cachedNotifications.length > 0 ? cachedNotifications[0].createdAt : null;
    
    try {
        console.log(`🔄 [SalmartCache] Background sync for new notifications since:`, mostRecentNotificationTimestamp || 'beginning of time');
        
        const url = new URL(`${API_BASE_URL}/notifications`);
        
        if (mostRecentNotificationTimestamp) {
            url.searchParams.set('since', mostRecentNotificationTimestamp);
        }

        const newNotifications = await this._fetchWithNetworkFallback(url.toString(), {
            priority: 'low',
            headers: this._getAuthHeaders(),
        });

        if (newNotifications.length > 0) {
            console.log(`🔄 [SalmartCache] Fetched ${newNotifications.length} new notifications in background.`);
            
            // Combine and deduplicate
            const combinedNotifications = [...newNotifications, ...cachedNotifications];
            const uniqueNotificationsMap = new Map(combinedNotifications.map(notif => [notif._id, notif]));
            const updatedNotifications = Array.from(uniqueNotificationsMap.values())
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            if (typeof set !== 'undefined') {
                await set(dbKey, updatedNotifications);
                console.log(`💾 [SalmartCache] Updated notification cache with ${updatedNotifications.length} total notifications.`);
                
                // Notify the UI about new notifications
                this._notifyNewNotifications(newNotifications);
            }
        } else {
            console.log(`✅ [SalmartCache] No new notifications found in background sync.`);
        }
    } catch (error) {
        console.warn('⚠️ [SalmartCache] Background notification sync failed:', error.message);
    }
}

/**
 * Adds a new notification to cache (for real-time notifications)
 * @param {string} userId - User ID
 * @param {object} newNotification - New notification to add
 */
async addNewNotificationToCache(userId, newNotification) {
    if (!userId || !newNotification) return;

    const dbKey = `notifications_${userId}`;
    
    try {
        if (typeof get !== 'undefined' && typeof set !== 'undefined') {
            let cachedNotifications = (await get(dbKey)) || [];
            
            // Check for duplicates
            const exists = cachedNotifications.some(notif => notif._id === newNotification._id);
            if (!exists) {
                cachedNotifications.unshift(newNotification);
                
                // Sort by date
                cachedNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                await set(dbKey, cachedNotifications);
                console.log(`💾 [SalmartCache] Added new notification to cache`);
                
                // Notify UI
                this._notifyNewNotifications([newNotification]);
            }
        }
    } catch (error) {
        console.error('❌ [SalmartCache] Error adding notification to cache:', error);
    }
}

/**
 * Updates a notification in cache (for marking as read, dismissing, etc.)
 * @param {string} userId - User ID
 * @param {string} notificationId - Notification ID to update
 * @param {object} updates - Updates to apply
 */
async updateNotificationInCache(userId, notificationId, updates) {
    if (!userId || !notificationId || !updates) return;

    const dbKey = `notifications_${userId}`;
    
    try {
        if (typeof get !== 'undefined' && typeof set !== 'undefined') {
            let cachedNotifications = (await get(dbKey)) || [];
            
            const notificationIndex = cachedNotifications.findIndex(notif => notif._id === notificationId);
            if (notificationIndex !== -1) {
                cachedNotifications[notificationIndex] = { ...cachedNotifications[notificationIndex], ...updates };
                await set(dbKey, cachedNotifications);
                console.log(`💾 [SalmartCache] Updated notification ${notificationId} in cache`);
            }
        }
    } catch (error) {
        console.error('❌ [SalmartCache] Error updating notification in cache:', error);
    }
}

/**
 * Removes a notification from cache (for dismissing)
 * @param {string} userId - User ID
 * @param {string} notificationId - Notification ID to remove
 */
async removeNotificationFromCache(userId, notificationId) {
    if (!userId || !notificationId) return;

    const dbKey = `notifications_${userId}`;
    
    try {
        if (typeof get !== 'undefined' && typeof set !== 'undefined') {
            let cachedNotifications = (await get(dbKey)) || [];
            
            const originalLength = cachedNotifications.length;
            cachedNotifications = cachedNotifications.filter(notif => notif._id !== notificationId);
            
            if (cachedNotifications.length !== originalLength) {
                await set(dbKey, cachedNotifications);
                console.log(`💾 [SalmartCache] Removed notification from cache`);
                
                // Notify UI
                this._notifyNotificationRemoved(notificationId);
            }
        }
    } catch (error) {
        console.error('❌ [SalmartCache] Error removing notification from cache:', error);
    }
}

/**
 * Marks all notifications as read in cache
 * @param {string} userId - User ID
 */
async markAllNotificationsAsReadInCache(userId) {
    if (!userId) return;

    const dbKey = `notifications_${userId}`;
    
    try {
        if (typeof get !== 'undefined' && typeof set !== 'undefined') {
            let cachedNotifications = (await get(dbKey)) || [];
            
            let hasChanges = false;
            const updatedNotifications = cachedNotifications.map(notif => {
                if (!notif.isRead) {
                    hasChanges = true;
                    return { ...notif, isRead: true };
                }
                return notif;
            });
            
            if (hasChanges) {
                await set(dbKey, updatedNotifications);
                console.log(`💾 [SalmartCache] Marked all notifications as read in cache`);
                
                // Notify UI
                this._notifyNotificationsMarkedAsRead();
            }
        }
    } catch (error) {
        console.error('❌ [SalmartCache] Error marking notifications as read in cache:', error);
    }
}

/**
 * Forces a refresh of notifications from server
 * @param {string} userId - User ID
 */
async refreshNotifications(userId) {
    if (!userId) return [];

    const dbKey = `notifications_${userId}`;
    
    try {
        console.log(`🔄 [SalmartCache] Force refreshing notifications from server`);
        
        const notificationsFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/notifications`, {
            headers: this._getAuthHeaders(),
        });
        
        if (typeof set !== 'undefined') {
            await set(dbKey, notificationsFromNetwork);
            console.log(`💾 [SalmartCache] Force updated notification cache with ${notificationsFromNetwork.length} notifications.`);
        }
        
        return notificationsFromNetwork;
    } catch (error) {
        console.error('❌ [SalmartCache] Error force refreshing notifications:', error);
        return [];
    }
}

/**
 * Clears notification cache for a user
 * @param {string} userId - User ID
 */
async clearNotificationCache(userId) {
    if (!userId) return;
    
    const dbKey = `notifications_${userId}`;
    try {
        if (typeof del !== 'undefined') {
            await del(dbKey);
            console.log(`🗑️ [SalmartCache] Cleared notification cache for user: ${userId}`);
        }
    } catch (error) {
        console.error('❌ [SalmartCache] Error clearing notification cache:', error);
    }
}

/**
 * Notifies UI about new notifications (can be overridden by implementing classes)
 * @param {Array} newNotifications - Array of new notifications
 */
_notifyNewNotifications(newNotifications) {
    // Dispatch custom event for UI to listen to
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('newNotificationsFromCache', {
            detail: { notifications: newNotifications }
        }));
    }
}

/**
 * Notifies UI about notification removal
 * @param {string} notificationId - ID of removed notification
 */
_notifyNotificationRemoved(notificationId) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notificationRemovedFromCache', {
            detail: { notificationId }
        }));
    }
}

/**
 * Notifies UI that all notifications have been marked as read
 */
_notifyNotificationsMarkedAsRead() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notificationsMarkedAsReadFromCache'));
    }
}

/**
 * Fetches messages with proper cache-to-server sync (similar to getPosts)
 * @param {string} userId - The current user's ID
 * @returns {Promise<Array>} - Array of messages
 */
async getMessages(userId) {
    if (!userId) return [];
    
    const dbKey = `messages_${userId}`;
    
    // Return cached data immediately, then update in background
    try {
        if (typeof get !== 'undefined') {
            const cachedMessages = (await get(dbKey)) || [];
            if (cachedMessages.length > 0) {
                console.log(`✅ [SalmartCache] Serving ${cachedMessages.length} messages from IndexedDB.`);
                
                // Background sync for new messages (similar to posts)
                this._backgroundSyncNewMessages(userId, cachedMessages)
                    .catch(e => console.warn('Background message sync failed:', e));
                
                return cachedMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }
        }
    } catch (e) {
        console.error('❌ [SalmartCache] Error reading messages from IndexedDB:', e);
    }
    
    // Network fetch if no cache
    try {
        console.log(`🔄 [SalmartCache] Initial fetch for messages.`);
        const messagesFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/api/messages?userId=${userId}`, {
            headers: this._getAuthHeaders(),
        });
        
        // Cache the fetched messages
        if (messagesFromNetwork.length > 0 && typeof set !== 'undefined') {
            await set(dbKey, messagesFromNetwork);
            console.log(`💾 [SalmartCache] Saved ${messagesFromNetwork.length} messages to cache.`);
        }
        
        return messagesFromNetwork;

    } catch (error) {
        console.error('❌ [SalmartCache] Failed to fetch messages from network.', error);
        return [];
    }
}

/**
 * Background sync for new messages (similar to _backgroundSyncNewPosts)
 * @param {string} userId - Current user ID
 * @param {Array} cachedMessages - Currently cached messages
 */
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
            
            // Combine and deduplicate
            const combinedMessages = [...newMessages, ...cachedMessages];
            const uniqueMessagesMap = new Map(combinedMessages.map(msg => [msg._id, msg]));
            const updatedMessages = Array.from(uniqueMessagesMap.values())
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            if (typeof set !== 'undefined') {
                await set(dbKey, updatedMessages);
                console.log(`💾 [SalmartCache] Updated message cache with ${updatedMessages.length} total messages.`);
                
                // Notify the UI about new messages
                this._notifyNewMessages(newMessages);
            }
        } else {
            console.log(`✅ [SalmartCache] No new messages found in background sync.`);
        }
    } catch (error) {
        console.warn('⚠️ [SalmartCache] Background message sync failed:', error.message);
    }
}

/**
 * Updates a message in cache
 * @param {string} userId - User ID
 * @param {string} messageId - Message ID to update
 * @param {object} updates - Updates to apply
 */
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

/**
 * Adds a new message to cache
 * @param {string} userId - User ID
 * @param {object} newMessage - New message to add
 */
async addNewMessageToCache(userId, newMessage) {
    if (!userId || !newMessage) return;

    const dbKey = `messages_${userId}`;
    
    try {
        if (typeof get !== 'undefined' && typeof set !== 'undefined') {
            let cachedMessages = (await get(dbKey)) || [];
            
            // Check for duplicates
            const exists = cachedMessages.some(msg => msg._id === newMessage._id);
            if (!exists) {
                cachedMessages.unshift(newMessage);
                
                // Sort by date
                cachedMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                await set(dbKey, cachedMessages);
                console.log(`💾 [SalmartCache] Added new message to cache`);
            }
        }
    } catch (error) {
        console.error('❌ [SalmartCache] Error adding message to cache:', error);
    }
}

/**
 * Forces a refresh of messages from server
 * @param {string} userId - User ID
 */
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

/**
 * Clears message cache for a user
 * @param {string} userId - User ID
 */
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

/**
 * Notifies UI about new messages (can be overridden by implementing classes)
 * @param {Array} newMessages - Array of new messages
 */
_notifyNewMessages(newMessages) {
    // Dispatch custom event for UI to listen to
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('newMessagesFromCache', {
            detail: { messages: newMessages }
        }));
    }
}





    /**
     * Fetches user suggestions for following, with caching.
     * @returns {Promise<object[]>} - A promise that resolves to an array of user objects.
     */
    async fetchUserSuggestions() {
        const userId = localStorage.getItem('userId');
        if (!userId) return [];

        const dbKey = this._getPersonalizedDBKey('user_suggestions');
        
        try {
            if (typeof get !== 'undefined') {
                const cachedSuggestions = await get(dbKey);
                if (cachedSuggestions) {
                    console.log("✅ [SalmartCache] Serving user suggestions from IndexedDB.");
                    this._fetchWithNetworkFallback(`${API_BASE_URL}/api/user-suggestions`, { headers: this._getAuthHeaders() })
                        .then(response => {
                            if (response.suggestions) {
                                set(dbKey, response.suggestions);
                            }
                        })
                        .catch(e => console.warn('Background user suggestions update failed:', e));
                    return cachedSuggestions;
                }
            }
            
            const response = await this._fetchWithNetworkFallback(`${API_BASE_URL}/api/user-suggestions`, {
                headers: this._getAuthHeaders()
            });

            if (response.suggestions) {
                if (typeof set !== 'undefined') {
                    await set(dbKey, response.suggestions);
                }
                return response.suggestions;
            } else {
                return [];
            }
        } catch (error) {
            console.error('Error fetching user suggestions:', error);
            throw error;
        }
    }
}

export const salmartCache = new SalmartCache();
