// salmartCache.js

// IMPORTANT: This file relies on 'idb-keyval' for IndexedDB operations.
// The library must be loaded for this code to work.

const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

class SalmartCache {
    constructor() {
        console.log('SalmartCache initialized with IndexedDB support.');
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
     * The core function for fetching and managing posts with a delta-sync strategy.
     * This method first returns cached posts and then fetches new ones in the background.
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
                    mostRecentPostTimestamp = allPosts.reduce((latest, post) => {
                        const postDate = new Date(post.createdAt);
                        return postDate > latest ? postDate : latest;
                    }, new Date(0));
                }
                console.log(`✅ [SalmartCache] Serving ${allPosts.length} posts for category '${category}' from IndexedDB.`);
            }
        } catch (e) {
            console.error('❌ [SalmartCache] Error reading posts from IndexedDB:', e);
            allPosts = [];
        }

        // 2. Fetch new posts from the network.
        try {
            const url = new URL(`${API_BASE_URL}/post`);
            url.searchParams.set('category', category);
            if (mostRecentPostTimestamp) {
                url.searchParams.set('since', mostRecentPostTimestamp.toISOString());
            }

            const newPosts = await this._fetchWithNetworkFallback(url.toString(), {
                priority: 'high',
                headers: this._getAuthHeaders(),
            });

            if (newPosts.length > 0) {
                console.log(`🔄 [SalmartCache] Fetched ${newPosts.length} new posts from network.`);
                
                const combinedPosts = [...allPosts, ...newPosts];
                const uniquePostsMap = new Map(combinedPosts.map(post => [post._id, post]));
                allPosts = Array.from(uniquePostsMap.values());
                
                if (typeof set !== 'undefined') {
                    await set(dbKey, allPosts);
                    console.log(`💾 [SalmartCache] Updated cache with ${allPosts.length} total posts.`);
                }
            } else if (allPosts.length === 0) {
                console.log(`⚠️ [SalmartCache] No posts found, even from the network.`);
            }
        } catch (error) {
            console.warn(`⚠️ [SalmartCache] Network update failed. Serving only cached data.`, error.message);
        }

        // 3. Sort the final list and return it.
        return allPosts.sort((a, b) => {
            const dateA = new Date(a.createdAt);
            const dateB = new Date(b.createdAt);
            return dateB.getTime() - dateA.getTime();
        });
    }

    /**
     * Fetches older posts for infinite scrolling.
     * @param {string} category - The category of posts.
     * @param {string} lastPostId - The ID of the last post currently displayed.
     * @returns {Promise<Array<object>>} - An array of older posts.
     */
    async getOlderPosts(category = 'all', lastPostId) {
        if (!lastPostId) {
            console.warn('No lastPostId provided. Cannot fetch older posts.');
            return [];
        }

        try {
            const url = new URL(`${API_BASE_URL}/post`);
            url.searchParams.set('category', category);
            url.searchParams.set('before', lastPostId); 

            const olderPosts = await this._fetchWithNetworkFallback(url.toString(), {
                priority: 'low',
                headers: this._getAuthHeaders(),
            });
            return olderPosts;
        } catch (error) {
            console.error('Error fetching older posts:', error);
            return null;
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
                    // Background fetch to refresh cache
                    this._fetchWithNetworkFallback(`${API_BASE_URL}/api/is-following-list`, { headers: this._getAuthHeaders() })
                        .then(response => set(dbKey, response.following.map(u => u._id.toString())))
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
            throw error; // Re-throw to allow main.js to handle the error
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
            throw error; // Re-throw so the UI can handle it
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
            // Check cache first
            if (typeof get !== 'undefined') {
                const cachedSuggestions = await get(dbKey);
                if (cachedSuggestions) {
                    console.log("✅ [SalmartCache] Serving user suggestions from IndexedDB.");
                    
                    // Background refresh
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
            
            // If not in cache, fetch from network
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
            throw error; // Re-throw to allow main.js to handle
        }
    }

    // --- You can add other data-related methods here as well ---
    // For example:
    // async likePost(postId) {
    //     // ... API call to like post ...
    //     // ... optimistic cache update ...
    // }
}

export const salmartCache = new SalmartCache();
