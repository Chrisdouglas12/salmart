import { get, set, del } from './idb-keyval-iife.js';

const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com');

class SalmartNotificationCache {
    constructor() {
        console.log('SalmartNotificationCache initialized.');
    }

    // Utility methods to be defined in the class or imported from a shared file
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
            console.error(`❌ [SalmartNotificationCache] Network fetch failed for ${url}:`, error);
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

    /**
     * Fetches notifications with proper cache-to-server sync.
     * @param {string} userId - The current user's ID
     * @returns {Promise<Array>} - Array of notifications
     */
    async getNotifications(userId) {
        if (!userId) return [];
        const dbKey = `notifications_${userId}`;

        try {
            if (typeof get !== 'undefined') {
                const cachedNotifications = (await get(dbKey)) || [];
                if (cachedNotifications.length > 0) {
                    console.log(`✅ [SalmartNotificationCache] Serving ${cachedNotifications.length} notifications from IndexedDB.`);
                    this._backgroundSyncNotifications(userId, cachedNotifications)
                        .catch(e => console.warn('Background notification sync failed:', e));
                    return cachedNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                }
            }
        } catch (e) {
            console.error('❌ [SalmartNotificationCache] Error reading notifications from IndexedDB:', e);
        }

        try {
            console.log(`🔄 [SalmartNotificationCache] Initial fetch for notifications.`);
            const notificationsFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/notifications`, {
                headers: this._getAuthHeaders(),
            });

            if (notificationsFromNetwork.length > 0 && typeof set !== 'undefined') {
                await set(dbKey, notificationsFromNetwork);
                console.log(`💾 [SalmartNotificationCache] Saved ${notificationsFromNetwork.length} notifications to cache.`);
            }
            return notificationsFromNetwork;
        } catch (error) {
            console.error('❌ [SalmartNotificationCache] Failed to fetch notifications from network.', error);
            return (await get(dbKey)) || [];
        }
    }

    /**
     * Background sync for new notifications.
     * @param {string} userId - Current user ID
     * @param {Array} cachedNotifications - Currently cached notifications
     */
    async _backgroundSyncNotifications(userId, cachedNotifications) {
        const dbKey = `notifications_${userId}`;
        const mostRecentNotificationTimestamp = cachedNotifications.length > 0 ? cachedNotifications[0].createdAt : null;

        try {
            const url = new URL(`${API_BASE_URL}/notifications`);
            if (mostRecentNotificationTimestamp) {
                url.searchParams.set('since', mostRecentNotificationTimestamp);
            }

            const newNotifications = await this._fetchWithNetworkFallback(url.toString(), {
                priority: 'low',
                headers: this._getAuthHeaders(),
            });

            if (newNotifications.length > 0) {
                const combinedNotifications = [...newNotifications, ...cachedNotifications];
                const uniqueNotificationsMap = new Map(combinedNotifications.map(notif => [notif._id, notif]));
                const updatedNotifications = Array.from(uniqueNotificationsMap.values())
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                if (typeof set !== 'undefined') {
                    await set(dbKey, updatedNotifications);
                    console.log(`💾 [SalmartNotificationCache] Updated notification cache.`);
                    this._notifyNewNotifications(newNotifications);
                }
            }
        } catch (error) {
            console.warn('⚠️ [SalmartNotificationCache] Background notification sync failed:', error.message);
        }
    }

    /**
     * Adds a new notification to cache (for real-time notifications).
     * @param {string} userId - User ID
     * @param {object} newNotification - New notification to add
     */
    async addNewNotificationToCache(userId, newNotification) {
        if (!userId || !newNotification) return;
        const dbKey = `notifications_${userId}`;

        try {
            if (typeof get !== 'undefined' && typeof set !== 'undefined') {
                let cachedNotifications = (await get(dbKey)) || [];
                const exists = cachedNotifications.some(notif => notif._id === newNotification._id);
                if (!exists) {
                    cachedNotifications.unshift(newNotification);
                    cachedNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    await set(dbKey, cachedNotifications);
                    console.log(`💾 [SalmartNotificationCache] Added new notification to cache`);
                    this._notifyNewNotifications([newNotification]);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartNotificationCache] Error adding notification to cache:', error);
        }
    }

    /**
     * Updates a notification in cache.
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
                    console.log(`💾 [SalmartNotificationCache] Updated notification ${notificationId} in cache`);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartNotificationCache] Error updating notification in cache:', error);
        }
    }

    /**
     * Removes a notification from cache.
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
                    console.log(`💾 [SalmartNotificationCache] Removed notification from cache`);
                    this._notifyNotificationRemoved(notificationId);
                }
            }
        } catch (error) {
            console.error('❌ [SalmartNotificationCache] Error removing notification from cache:', error);
        }
    }

    /**
     * Marks all notifications as read in cache.
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
                    console.log(`💾 [SalmartNotificationCache] Marked all notifications as read in cache`);
                    this._notifyNotificationsMarkedAsRead();
                }
            }
        } catch (error) {
            console.error('❌ [SalmartNotificationCache] Error marking notifications as read in cache:', error);
        }
    }

    /**
     * Forces a refresh of notifications from server.
     * @param {string} userId - User ID
     */
    async refreshNotifications(userId) {
        if (!userId) return [];
        const dbKey = `notifications_${userId}`;
        try {
            const notificationsFromNetwork = await this._fetchWithNetworkFallback(`${API_BASE_URL}/notifications`, {
                headers: this._getAuthHeaders(),
            });
            if (typeof set !== 'undefined') {
                await set(dbKey, notificationsFromNetwork);
                console.log(`💾 [SalmartNotificationCache] Force updated notification cache.`);
            }
            return notificationsFromNetwork;
        } catch (error) {
            console.error('❌ [SalmartNotificationCache] Error force refreshing notifications:', error);
            return [];
        }
    }

    /**
     * Clears notification cache for a user.
     * @param {string} userId - User ID
     */
    async clearNotificationCache(userId) {
        if (!userId) return;
        const dbKey = `notifications_${userId}`;
        try {
            if (typeof del !== 'undefined') {
                await del(dbKey);
                console.log(`🗑️ [SalmartNotificationCache] Cleared notification cache for user: ${userId}`);
            }
        } catch (error) {
            console.error('❌ [SalmartNotificationCache] Error clearing notification cache:', error);
        }
    }

    _notifyNewNotifications(newNotifications) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('newNotificationsFromCache', {
                detail: { notifications: newNotifications }
            }));
        }
    }

    _notifyNotificationRemoved(notificationId) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('notificationRemovedFromCache', {
                detail: { notificationId }
            }));
        }
    }

    _notifyNotificationsMarkedAsRead() {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('notificationsMarkedAsReadFromCache'));
        }
    }
}

export const salmartNotificationCache = new SalmartNotificationCache();
