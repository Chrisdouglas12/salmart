// salmartCache.js

import { get, set, del } from './idb-keyval-iife.js';

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
     * Fetches posts for a given category, handling both initial load and infinite scrolling.
     * It combines network and cache data and ensures no duplicates.
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
                        
                        // Background update for delta-sync
                        this._backgroundSyncNewPosts(category, sortedCachedPosts).catch(e => console.warn('Background sync failed:', e));
                        
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
