// salmartCache3.js

// Import idb-keyval functions
import { get, set, del, clear, keys, values, entries } from './idb-keyval-iife.js';

/**
 * SalmartCache3 - Caching and real-time synchronization for the Salmart Request Feed.
 * This class provides an offline-first approach, serving cached data immediately
 * and updating it in the background with network requests.
 */
class SalmartCache3 {
    constructor(apiBaseUrl = 'https://salmart.onrender.com') {
        this.API_BASE_URL = apiBaseUrl;
        this.requestFeedKey = 'requests_feed';
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
     * Fetches requests from cache first, then updates from network in the background.
     * @param {string} category - The request category (e.g., 'electronics').
     * @returns {Promise<Array>} - Array of request objects.
     */
    async getRequests(category = '') {
        const dbKey = `${this.requestFeedKey}_${category}`;
        let cachedRequests = [];

        try {
            cachedRequests = (await get(dbKey)) || [];
            if (cachedRequests.length > 0) {
                console.log(`✅ [SalmartCache] Serving ${cachedRequests.length} requests from IndexedDB.`);
                this._backgroundSyncRequests(dbKey, category).catch(e => console.warn('Background request sync failed:', e));
                return cachedRequests;
            }
        } catch (e) {
            console.error('❌ [SalmartCache] Error reading requests from IndexedDB:', e);
        }

        try {
            console.log('🔄 [SalmartCache] Initial fetch for requests.');
            const requestsFromNetwork = await this._fetchRequestsFromNetwork(category);
            if (requestsFromNetwork.length > 0) {
                await set(dbKey, requestsFromNetwork);
                console.log(`💾 [SalmartCache] Saved ${requestsFromNetwork.length} requests to cache.`);
            }
            return requestsFromNetwork;
        } catch (error) {
            console.error('❌ [SalmartCache] Failed to fetch requests from network.', error);
            return cachedRequests;
        }
    }

    /**
     * Internal function to fetch requests from the network.
     * @param {string} category - The request category.
     * @returns {Promise<Array>} - The array of requests.
     */
    async _fetchRequestsFromNetwork(category) {
        const res = await fetch(`${this.API_BASE_URL}/requests?category=${encodeURIComponent(category)}&sort=-createdAt`);
        if (!res.ok) throw new Error('Failed to fetch requests from network');
        const requests = await res.json();
        if (!Array.isArray(requests)) throw new Error('Expected an array of requests');
        return requests;
    }
    
    /**
     * Background sync for new requests and updates.
     * @param {string} dbKey - The IndexedDB key for the requests.
     * @param {string} category - The request category.
     */
    async _backgroundSyncRequests(dbKey, category) {
        try {
            const cachedRequests = (await get(dbKey)) || [];
            const mostRecentTimestamp = cachedRequests.length > 0 
                ? Math.max(...cachedRequests.map(r => new Date(r.createdAt).getTime()))
                : 0;

            const url = new URL(`${this.API_BASE_URL}/requests`);
            url.searchParams.set('category', category);
            url.searchParams.set('since', new Date(mostRecentTimestamp).toISOString());
            
            const res = await fetch(url.toString(), {
                priority: 'low',
                headers: this._getAuthHeaders(),
            });

            if (!res.ok) throw new Error('Failed to sync requests');

            const newRequests = await res.json();
            if (newRequests.length > 0) {
                console.log(`🔄 [SalmartCache] Fetched ${newRequests.length} new requests in background.`);
                
                // Merge and deduplicate
                const combinedRequests = [...cachedRequests, ...newRequests];
                const uniqueRequestsMap = new Map(combinedRequests.map(req => [req._id, req]));
                
                // Add comments to the new requests and update the cache
                for (const newRequest of newRequests) {
                    const comments = await this.getComments(newRequest._id);
                    newRequest.comments = comments.map(c => c._id);
                }

                // Update the combined list with the new requests and comments
                newRequests.forEach(newReq => uniqueRequestsMap.set(newReq._id, newReq));
                
                const updatedRequests = Array.from(uniqueRequestsMap.values())
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                await set(dbKey, updatedRequests);
                console.log(`💾 [SalmartCache] Updated request cache with ${updatedRequests.length} total items.`);
                this._notifyRequestsUpdate(updatedRequests);
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Background request sync failed:', error.message);
        }
    }

    /**
     * Gets comments for a specific request from cache, then syncs with network.
     * @param {string} requestId - The ID of the request.
     * @returns {Promise<Array>} - Array of comment objects.
     */
    async getComments(requestId) {
        if (!requestId) return [];
        const dbKey = `request_comments_${requestId}`;
        
        try {
            const cachedComments = (await get(dbKey)) || [];
            if (cachedComments.length > 0) {
                this._backgroundSyncComments(dbKey, requestId, cachedComments)
                    .catch(e => console.warn('Background comment sync failed:', e));
                return cachedComments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            }
        } catch (e) {
            console.error('❌ [SalmartCache] Error reading comments from IndexedDB:', e);
        }

        try {
            const res = await fetch(`${this.API_BASE_URL}/requests/${requestId}/comments`);
            if (!res.ok) throw new Error('Failed to fetch comments');
            const data = await res.json();
            if (data.success && data.comments) {
                if (data.comments.length > 0) {
                    await set(dbKey, data.comments);
                }
                return data.comments;
            }
        } catch (error) {
            console.error('❌ [SalmartCache] Failed to fetch comments from network.', error);
        }
        return (await get(dbKey)) || [];
    }
    
    /**
     * Background sync for new comments.
     * @param {string} dbKey - The IndexedDB key for comments.
     * @param {string} requestId - The request ID.
     * @param {Array} cachedComments - Currently cached comments.
     */
    async _backgroundSyncComments(dbKey, requestId, cachedComments) {
        try {
            const mostRecentTimestamp = cachedComments.length > 0 
                ? Math.max(...cachedComments.map(c => new Date(c.createdAt).getTime()))
                : 0;

            const url = new URL(`${this.API_BASE_URL}/requests/${requestId}/comments`);
            url.searchParams.set('since', new Date(mostRecentTimestamp).toISOString());
            
            const res = await fetch(url.toString(), {
                priority: 'low',
                headers: this._getAuthHeaders(),
            });

            if (!res.ok) throw new Error('Failed to sync comments');

            const data = await res.json();
            if (data.success && data.comments.length > 0) {
                console.log(`🔄 [SalmartCache] Fetched ${data.comments.length} new comments in background.`);
                const combinedComments = [...cachedComments, ...data.comments];
                const uniqueCommentsMap = new Map(combinedComments.map(comment => [comment._id, comment]));
                const updatedComments = Array.from(uniqueCommentsMap.values())
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                
                await set(dbKey, updatedComments);
                console.log(`💾 [SalmartCache] Updated comment cache for request ${requestId}.`);
                this._notifyCommentsUpdate(requestId, updatedComments);
            }
        } catch (error) {
            console.warn('⚠️ [SalmartCache] Background comment sync failed:', error.message);
        }
    }

    /**
     * Caches a new or updated request after a successful network call.
     * @param {object} updatedRequest - The new or updated request object.
     */
    async updateRequestInCache(updatedRequest) {
        const dbKey = this.requestFeedKey + '_'; // Assuming default category
        try {
            const cachedRequests = (await get(dbKey)) || [];
            const index = cachedRequests.findIndex(r => r._id === updatedRequest._id);

            if (index > -1) {
                cachedRequests[index] = updatedRequest;
            } else {
                cachedRequests.unshift(updatedRequest);
            }
            
            await set(dbKey, cachedRequests);
            this._notifyRequestsUpdate(cachedRequests);
        } catch (error) {
            console.error('❌ [SalmartCache] Error updating request in cache:', error);
        }
    }

    /**
     * Deletes a request from the cache.
     * @param {string} requestId - The ID of the request to delete.
     */
    async deleteRequestFromCache(requestId) {
        const dbKey = this.requestFeedKey + '_';
        try {
            let cachedRequests = (await get(dbKey)) || [];
            cachedRequests = cachedRequests.filter(r => r._id !== requestId);
            await set(dbKey, cachedRequests);
            this._notifyRequestsUpdate(cachedRequests);
            console.log(`🗑️ [SalmartCache] Deleted request ${requestId} from cache.`);
        } catch (error) {
            console.error('❌ [SalmartCache] Error deleting request from cache:', error);
        }
    }

    /**
     * Caches a new comment for a request.
     * @param {string} requestId - The request ID.
     * @param {object} newComment - The new comment object.
     */
    async addCommentToCache(requestId, newComment) {
        const dbKey = `request_comments_${requestId}`;
        try {
            const cachedComments = (await get(dbKey)) || [];
            cachedComments.push(newComment);
            await set(dbKey, cachedComments);
            this._notifyCommentsUpdate(requestId, cachedComments);
        } catch (error) {
            console.error('❌ [SalmartCache] Error adding comment to cache:', error);
        }
    }

    /**
     * Dispatches a custom event to notify the UI of new requests.
     * @param {Array} updatedRequests - The full list of requests.
     */
    _notifyRequestsUpdate(updatedRequests) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('requestsUpdated', {
                detail: { requests: updatedRequests }
            }));
        }
    }
    
    /**
     * Dispatches a custom event to notify the UI of new comments.
     * @param {string} requestId - The ID of the request with new comments.
     * @param {Array} updatedComments - The full list of comments for that request.
     */
    _notifyCommentsUpdate(requestId, updatedComments) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('commentsUpdated', {
                detail: { requestId, comments: updatedComments }
            }));
        }
    }
    
    /**
     * Sets up network status monitoring.
     * @param {function} onOnline - Callback for when network comes back online.
     */
    setupNetworkMonitoring(onOnline) {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('🌐 [SalmartCache] Network came back online');
                if (typeof onOnline === 'function') {
                    onOnline();
                }
            });
            window.addEventListener('offline', () => {
                console.log('🌐 [SalmartCache] Network went offline');
            });
        }
    }

    /**
     * Clears all caches managed by this class.
     */
    async clearAllCaches() {
        try {
            await clear();
            console.log('🗑️ [SalmartCache] All caches cleared.');
        } catch (error) {
            console.error('❌ [SalmartCache] Error clearing all caches:', error);
        }
    }
}

// Export a singleton instance
const salmartCache = new SalmartCache3();
export default salmartCache;
