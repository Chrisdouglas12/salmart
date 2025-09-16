//This script serves posts.js for dynamic caching
import { get, set, del } from './idb-keyval-iife.js';

const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

// Cache expiry time (5 minutes)
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

class SalmartCache {
    constructor() {
        this.pendingUpdates = new Map(); // Track pending updates
        console.log('SalmartCache initialized with IndexedDB support, real-time sync, and cache expiry.');
    }

    // --- Generic Cache Methods ---

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
                // Store with a timestamp for expiry
                await set(key, { data: value, cachedAt: Date.now() });
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

    // --- Cache Stale Management ---

    async markCacheAsStale(category = 'all') {
        const dbKey = this._getPersonalizedDBKey(`cache_stale_${category}`);
        try {
            if (typeof set !== 'undefined') {
                await set(dbKey, true);
                console.log(`💾 [SalmartCache] Marked cache as stale for category: ${category}`);
            }
        } catch (error) {
            console.error(`❌ [SalmartCache] Error marking cache as stale for category ${category}:`, error);
        }
    }

    async isCacheStale(category = 'all') {
        const staleKey = this._getPersonalizedDBKey(`cache_stale_${category}`);
        const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
        try {
            const isStale = (await get(staleKey)) || false;
            const cachedData = await get(dbKey);
            if (cachedData && cachedData.cachedAt) {
                const isExpired = Date.now() - cachedData.cachedAt > CACHE_EXPIRY_MS;
                return isStale || isExpired;
            }
            return isStale;
        } catch (error) {
            console.error(`❌ [SalmartCache] Error checking stale status for category ${category}:`, error);
            return true; // Assume stale on error
        }
    }

    // --- Utility Methods ---

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

    // --- Post-related Methods ---

    async updatePostInCache(postId, updates, category = 'all') {
        if (!postId || !updates) return;
        
// Ensure quantity is properly handled in updates
    if (updates.quantity !== undefined) {
        updates.isSold = updates.quantity < 1;
    }
        const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);

        try {
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedData = (await get(dbKey)) || { data: [], cachedAt: Date.now() };
                let cachedPosts = cachedData.data || [];

                const postIndex = cachedPosts.findIndex(post => post._id === postId);
                if (postIndex !== -1) {
                    cachedPosts[postIndex] = { ...cachedPosts[postIndex], ...updates };
                    await set(dbKey, { data: cachedPosts, cachedAt: cachedData.cachedAt });
                    console.log(`💾 [SalmartCache] Updated post ${postId} in cache for category ${category}`);

                    // Update other categories
                    await this._updatePostInAllCategories(postId, updates);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error updating post in cache:', error);
        }
    }

    async _updatePostInAllCategories(postId, updates) {
        const categories = ['all', 'electronics', 'fashion', 'food_items', 'others', 'books', 'music'];
        
        if (updates.quantity !== undefined) {
        updates.isSold = updates.quantity < 1;
    }
        const userId = localStorage.getItem('userId') || 'anonymous';

        for (const category of categories) {
            try {
                const dbKey = `posts_category_${category}_${userId}`;
                if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                    let cachedData = (await get(dbKey)) || { data: [], cachedAt: Date.now() };
                    let cachedPosts = cachedData.data || [];
                    const postIndex = cachedPosts.findIndex(post => post._id === postId);

                    if (postIndex !== -1) {
                        cachedPosts[postIndex] = { ...cachedPosts[postIndex], ...updates };
                        await set(dbKey, { data: cachedPosts, cachedAt: cachedData.cachedAt });
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [SalmartCache] Could not update post in category ${category}:`, error);
            }
        }
    }

    async optimisticLikeUpdate(postId, isLiked, userId, category = 'all') {
        if (!postId || !userId) return;

        this.pendingUpdates.set(`like_${postId}`, { isLiked, timestamp: Date.now() });

        try {
            const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
            let cachedData = (await get(dbKey)) || { data: [], cachedAt: Date.now() };
            let cachedPosts = cachedData.data || [];

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

                await this.updatePostInCache(postId, { likes: updatedLikes }, category);
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

            if (response.likes) {
                await this.updatePostInCache(postId, { likes: response.likes }, category);
                this._updateLikeUI(postId, response.likes, userId);
            }

            this.pendingUpdates.delete(`like_${postId}`);
        } catch (error) {
            console.error('❌ [SalmartCache] Error in optimistic like update:', error);
            this.pendingUpdates.delete(`like_${postId}`);
            await this._refreshPostData(postId, category);
        }
    }

    async addNewPostToCache(newPost, category = 'all') {
        try {
            const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedData = (await get(dbKey)) || { data: [], cachedAt: Date.now() };
                let cachedPosts = cachedData.data || [];

                const updatedPosts = [newPost, ...cachedPosts];
                const uniquePosts = updatedPosts.filter((post, index, arr) => 
                    arr.findIndex(p => p._id === post._id) === index
                );

                await set(dbKey, { data: uniquePosts, cachedAt: Date.now() });
                console.log(`💾 [SalmartCache] Added new post to cache for category: ${category}`);

                // Mark cache as stale
                await this.markCacheAsStale(category);
                if (category !== 'all') {
                    await this.markCacheAsStale('all');
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error adding new post to cache:', error);
            await this.markCacheAsStale(category);
            if (category !== 'all') {
                await this.markCacheAsStale('all');
            }
        }
    }

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

    async updateCommentCount(postId, commentCount, category = 'all') {
        await this.updatePostInCache(postId, { 
            comments: Array(commentCount).fill(null)
        }, category);

        const commentButtons = document.querySelectorAll(`.reply-button[data-post-id="${postId}"]`);
        commentButtons.forEach(button => {
            const countSpan = button.querySelector('.comment-count');
            if (countSpan) {
                countSpan.textContent = commentCount;
            }
        });
    }

    async _refreshPostData(postId, category = 'all') {
        try {
            const response = await this._fetchWithNetworkFallback(`${API_BASE_URL}/post/${postId}`, {
                headers: this._getAuthHeaders(),
            });

            if (response) {
                await this.updatePostInCache(postId, response, category);
                const currentUserId = localStorage.getItem('userId');
                if (response.likes && currentUserId) {
                    this._updateLikeUI(postId, response.likes, currentUserId);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error refreshing post data:', error);
        }
    }

    async getPosts(category = 'all', lastPostId = null) {
        const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
        const staleKey = this._getPersonalizedDBKey(`cache_stale_${category}`);

        // Check if cache is stale or expired
        const isCacheStale = await this.isCacheStale(category);

        if (!lastPostId && !isCacheStale) {
            try {
                if (typeof get !== 'undefined') {
                    const cachedData = await get(dbKey);
                    const cachedPosts = cachedData?.data || [];
                    if (cachedPosts.length > 0) {
                        console.log(`✅ [SalmartCache] Serving ${cachedPosts.length} posts for category '${category}' from IndexedDB.`);
                        const sortedCachedPosts = cachedPosts.sort((a, b) => {
                            if (a.isPromoted && b.isPromoted) {
                                return new Date(b.promotedAt || b.createdAt) - new Date(a.promotedAt || a.createdAt);
                            }
                            return b.isPromoted ? 1 : a.isPromoted ? -1 : new Date(b.createdAt) - new Date(a.createdAt);
                        });

                        this._backgroundSyncNewPosts(category, sortedCachedPosts).catch(e => console.warn('Background sync failed:', e));
                        this._syncInteractionsData(sortedCachedPosts, category).catch(e => console.warn('Interactions sync failed:', e));

                        return sortedCachedPosts;
                    }
                }
            } catch (e) {
                console.error('❌ [SalmartCache] Error reading posts from IndexedDB:', e);
            }
        }

        try {
            const url = new URL(`${API_BASE_URL}/post`);
            url.searchParams.set('category', category);
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

            if (!lastPostId) {
                if (postsFromNetwork.length > 0 && typeof set !== 'undefined') {
                    await set(dbKey, { data: postsFromNetwork, cachedAt: Date.now() });
                    await del(staleKey);
                    console.log(`💾 [SalmartCache] Saved ${postsFromNetwork.length} posts to cache and cleared stale flag.`);
                }
            }

            return postsFromNetwork;

        } catch (error) {
            console.error('❌ [SalmartCache] Failed to fetch posts from network.', error);
            const cachedData = await get(dbKey);
            return cachedData?.data || [];
        }
    }

    async _syncInteractionsData(cachedPosts, category) {
        if (!cachedPosts.length) return;

        try {
            const postIds = cachedPosts.map(post => post._id).filter(Boolean);
            if (postIds.length === 0) return;

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
                let cachedData = (await get(dbKey)) || { data: [], cachedAt: Date.now() };
                let cachedPosts = cachedData.data || [];
                let hasUpdates = false;

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
                        await set(dbKey, { data: updatedPosts, cachedAt: cachedData.cachedAt });
                        console.log(`🔄 [SalmartCache] Updated interaction data for ${category} posts`);
                    }
                    this._updateInteractionUI(response.interactions);
                }
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Failed to sync interactions data:', error);
        }
    }

    _updateInteractionUI(interactions) {
        const currentUserId = localStorage.getItem('userId');
        if (!currentUserId) return;

        interactions.forEach(({ postId, likes, comments }) => {
            if (likes) {
                this._updateLikeUI(postId, likes, currentUserId);
            }
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

    async _backgroundSyncNewPosts(category, cachedPosts) {
        if (cachedPosts.length === 0) return;

        const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
        const mostRecentPostTimestamp = cachedPosts[0].createdAt;

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
                let cachedData = (await get(dbKey)) || { data: [], cachedAt: Date.now() };
                let cachedPosts = cachedData.data || [];

                const combinedPosts = [...newPosts, ...cachedPosts];
                const uniquePostsMap = new Map(combinedPosts.map(post => [post._id, post]));
                const updatedPosts = Array.from(uniquePostsMap.values()).sort((a, b) => {
                    if (a.isPromoted && b.isPromoted) {
                        return new Date(b.promotedAt || b.createdAt) - new Date(a.promotedAt || a.createdAt);
                    }
                    return b.isPromoted ? 1 : a.isPromoted ? -1 : new Date(b.createdAt) - new Date(a.createdAt);
                });

                if (typeof set !== 'undefined') {
                    await set(dbKey, { data: updatedPosts, cachedAt: Date.now() });
                    console.log(`💾 [SalmartCache] Updated cache with ${updatedPosts.length} total posts.`);
                }
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Background sync failed:', error.message);
        }
    }

    async updatePostPromotionStatus(postId, isPromoted, category = 'all') {
        if (!postId) return;

        try {
            const categoriesToUpdate = new Set([category, 'all']);
            for (const cat of categoriesToUpdate) {
                const dbKey = this._getPersonalizedDBKey(`posts_category_${cat}`);
                if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                    let cachedData = (await get(dbKey)) || { data: [], cachedAt: Date.now() };
                    let cachedPosts = cachedData.data || [];

                    const postIndex = cachedPosts.findIndex(post => post._id === postId);
                    if (postIndex !== -1) {
                        cachedPosts[postIndex].isPromoted = isPromoted;
                        if (isPromoted) {
                            cachedPosts[postIndex].promotedAt = new Date().toISOString();
                        } else {
                            delete cachedPosts[postIndex].promotedAt;
                        }

                        cachedPosts.sort((a, b) => {
                            if (a.isPromoted && b.isPromoted) {
                                return new Date(b.promotedAt || b.createdAt) - new Date(a.promotedAt || a.createdAt);
                            }
                            return b.isPromoted ? 1 : a.isPromoted ? -1 : new Date(b.createdAt) - new Date(a.createdAt);
                        });

                        await set(dbKey, { data: cachedPosts, cachedAt: Date.now() });
                        console.log(`💾 [SalmartCache] Updated promotion status for post ${postId} in cache for category ${cat}`);
                    }
                }
            }

            // Mark cache as stale
            await this.markCacheAsStale(category);
            await this.markCacheAsStale('all');

        } catch (error) {
            console.error('❌ [SalmartCache] Error updating post promotion status in cache:', error);
        }
    }

    async clearCache(category = null) {
        try {
            if (category) {
                const dbKey = this._getPersonalizedDBKey(`posts_category_${category}`);
                const staleKey = this._getPersonalizedDBKey(`cache_stale_${category}`);
                if (typeof del !== 'undefined') {
                    await del(dbKey);
                    await del(staleKey);
                    console.log(`🗑️ [SalmartCache] Cleared cache for category: ${category}`);
                }
            } else {
                const categories = ['all', 'electronics', 'fashion', 'home', 'sports', 'books', 'automotive'];
                const userId = localStorage.getItem('userId') || 'anonymous';

                for (const cat of categories) {
                    const dbKey = `posts_category_${cat}_${userId}`;
                    const staleKey = `cache_stale_${cat}_${userId}`;
                    if (typeof del !== 'undefined') {
                        await del(dbKey);
                        await del(staleKey);
                    }
                }
                console.log('🗑️ [SalmartCache] Cleared all post caches');
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Error clearing cache:', error);
        }
    }

    // --- Following-related Methods ---

    async fetchFollowingList() {
        const userId = localStorage.getItem('userId');
        if (!userId) return [];

        const dbKey = this._getPersonalizedDBKey('following_list');

        try {
            if (typeof get !== 'undefined') {
                const cachedData = await get(dbKey);
                const cachedList = cachedData?.data || [];
                if (cachedList.length > 0) {
                    console.log("✅ [SalmartCache] Serving following list from IndexedDB.");
                    this._fetchWithNetworkFallback(`${API_BASE_URL}/api/is-following-list`, { headers: this._getAuthHeaders() })
                        .then(response => {
                            if (response && Array.isArray(response.following)) {
                                const following = response.following.filter(u => u && u._id).map(u => u._id.toString());
                                set(dbKey, { data: [...new Set(following)], cachedAt: Date.now() });
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
                await set(dbKey, { data: following, cachedAt: Date.now() });
            }
            return following;
        } catch (error) {
            console.error('Error fetching following list:', error);
            throw error;
        }
    }

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

            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedData = (await get(dbKey)) || { data: [], cachedAt: Date.now() };
                let cachedList = cachedData.data || [];
                if (isCurrentlyFollowing) {
                    cachedList = cachedList.filter(id => id !== userIdToFollow);
                } else {
                    cachedList.push(userIdToFollow);
                }
                await set(dbKey, { data: [...new Set(cachedList)], cachedAt: Date.now() });
            }

            return response;
        } catch (error) {
            console.error('Error toggling follow status:', error);
            throw error;
        }
    }

    // --- User Suggestions-related Methods ---

    async fetchUserSuggestions() {
        const userId = localStorage.getItem('userId');
        if (!userId) return [];

        const dbKey = this._getPersonalizedDBKey('user_suggestions');

        try {
            if (typeof get !== 'undefined') {
                const cachedData = await get(dbKey);
                const cachedSuggestions = cachedData?.data || [];
                if (cachedSuggestions.length > 0) {
                    console.log("✅ [SalmartCache] Serving user suggestions from IndexedDB.");
                    this._fetchWithNetworkFallback(`${API_BASE_URL}/api/user-suggestions`, { headers: this._getAuthHeaders() })
                        .then(response => {
                            if (response.suggestions) {
                                set(dbKey, { data: response.suggestions, cachedAt: Date.now() });
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
                    await set(dbKey, { data: response.suggestions, cachedAt: Date.now() });
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