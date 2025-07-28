// sw-update-manager.js
// Standalone Service Worker Update Manager for pages without auth.js

class ServiceWorkerUpdateManager {
    constructor() {
        this.currentVersion = null;
        this.registration = null;
        this.updateAvailable = false;
        
        // Initialize after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        if ('serviceWorker' in navigator) {
            try {
                // Register service worker
                this.registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                console.log('✅ [SW Manager] Service Worker registered');
                
                // Set up update listeners
                this.setupUpdateListeners();
                
                // Check for updates immediately
                await this.checkForUpdates();
                
                // Check for updates periodically
                this.setupPeriodicUpdates();
                
                // Listen for messages from service worker
                this.setupMessageListener();
                
            } catch (error) {
                console.error('❌ [SW Manager] Service Worker registration failed:', error);
            }
        }
    }

    setupUpdateListeners() {
        // Listen for new service worker installing
        this.registration.addEventListener('updatefound', () => {
            const newWorker = this.registration.installing;
            console.log('🔄 [SW Manager] New service worker found');
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                        // New version available
                        console.log('🆕 [SW Manager] New version available');
                        this.updateAvailable = true;
                        this.showUpdateNotification();
                    } else {
                        // First time install
                        console.log('✅ [SW Manager] Service Worker installed for first time');
                    }
                }
            });
        });

        // Listen for service worker controlling the page
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('🔄 [SW Manager] Service Worker controller changed');
            if (this.updateAvailable) {
                this.handleUpdate();
            }
        });
    }

    setupMessageListener() {
        navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('📨 [SW Manager] Message from Service Worker:', event.data);
            
            if (event.data.type === 'SW_VERSION_UPDATE') {
                if (event.data.action === 'activated' && event.data.shouldReload) {
                    console.log('🔄 [SW Manager] Service Worker activated, handling update');
                    this.handleUpdate();
                }
            }
        });
    }

    async checkForUpdates() {
        if (this.registration) {
            try {
                console.log('🔍 [SW Manager] Checking for updates...');
                await this.registration.update();
                
                // Get current SW version
                const version = await this.getSWVersion();
                if (version && version !== this.currentVersion) {
                    console.log(`🆕 [SW Manager] Version changed: ${this.currentVersion} → ${version}`);
                    this.currentVersion = version;
                }
            } catch (error) {
                console.warn('⚠️ [SW Manager] Update check failed:', error);
            }
        }
    }

    async getSWVersion() {
        try {
            if (navigator.serviceWorker.controller) {
                return new Promise((resolve) => {
                    const messageChannel = new MessageChannel();
                    messageChannel.port1.onmessage = (event) => {
                        resolve(event.data.version?.version);
                    };
                    navigator.serviceWorker.controller.postMessage(
                        { type: 'GET_VERSION' }, 
                        [messageChannel.port2]
                    );
                    
                    // Timeout after 5 seconds
                    setTimeout(() => resolve(null), 5000);
                });
            }
        } catch (error) {
            console.warn('⚠️ [SW Manager] Failed to get SW version:', error);
        }
        return null;
    }

    setupPeriodicUpdates() {
        // Check for updates when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('👁️ [SW Manager] Page visible, checking for updates');
                this.checkForUpdates();
            }
        });

        // Check for updates every 30 seconds when page is active
        setInterval(() => {
            if (!document.hidden) {
                this.checkForUpdates();
            }
        }, 30000);
    }

    showUpdateNotification() {
        // Remove any existing notification
        this.dismissUpdate();
        
        // Create a subtle update notification
        const notification = document.createElement('div');
        notification.id = 'sw-update-notification';
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #4CAF50, #45a049);
                color: white;
                padding: 16px 20px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(76, 175, 80, 0.3);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                max-width: 320px;
                animation: slideIn 0.3s ease-out;
            ">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <div style="
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        background: rgba(255,255,255,0.2);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                    ">🔄</div>
                    <div>
                        <div style="font-weight: 600; font-size: 15px;">Update Available</div>
                        <div style="font-size: 12px; opacity: 0.9;">New version of Salmart is ready</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="swUpdateManager.applyUpdate()" style="
                        background: white;
                        color: #4CAF50;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: 600;
                        flex: 1;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">
                        Update Now
                    </button>
                    <button onclick="swUpdateManager.dismissUpdate()" style="
                        background: transparent;
                        color: white;
                        border: 1px solid rgba(255,255,255,0.3);
                        padding: 8px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
                        Later
                    </button>
                </div>
            </div>
            <style>
                @keyframes slideIn {
                    from { 
                        transform: translateX(100%); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateX(0); 
                        opacity: 1; 
                    }
                }
            </style>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            this.dismissUpdate();
        }, 15000);
    }

    applyUpdate() {
        console.log('🔄 [SW Manager] Applying update...');
        
        // Skip waiting and reload
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        }
        
        // Show loading message
        this.showUpdateProgress();
        
        // Clear user cache and reload
        setTimeout(() => {
            this.clearUserCache();
            window.location.reload();
        }, 1500);
    }

    dismissUpdate() {
        const notification = document.getElementById('sw-update-notification');
        if (notification) {
            notification.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }

    showUpdateProgress() {
        this.dismissUpdate();
        
        const progress = document.createElement('div');
        progress.id = 'sw-update-progress';
        progress.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <div style="
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    text-align: center;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 320px;
                ">
                    <div style="
                        width: 60px;
                        height: 60px;
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #4CAF50;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 20px;
                    "></div>
                    <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #333;">
                        Updating Salmart
                    </div>
                    <div style="font-size: 14px; color: #666;">
                        Please wait while we apply the latest updates...
                    </div>
                </div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes slideOut {
                    from { 
                        transform: translateX(0); 
                        opacity: 1; 
                    }
                    to { 
                        transform: translateX(100%); 
                        opacity: 0; 
                    }
                }
            </style>
        `;
        
        document.body.appendChild(progress);
    }

    handleUpdate() {
        console.log('🔄 [SW Manager] Handling update...');
        
        // Clear cached user data
        this.clearUserCache();
        
        // Force reload to get fresh content
        window.location.reload();
    }

    clearUserCache() {
        try {
            // Clear localStorage items that might be stale
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (
                    key.includes('user') || 
                    key.includes('auth') || 
                    key.includes('token') ||
                    key.includes('profile') ||
                    key.includes('cache') ||
                    key.includes('posts') ||
                    key.includes('feed')
                )) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => {
                console.log(`🧹 [SW Manager] Clearing localStorage: ${key}`);
                localStorage.removeItem(key);
            });
            
            // Clear sessionStorage
            sessionStorage.clear();
            console.log('🧹 [SW Manager] Cleared sessionStorage');
            
        } catch (error) {
            console.warn('⚠️ [SW Manager] Failed to clear user cache:', error);
        }
    }

    // Method to manually trigger cache clear and reload
    async forceUpdate() {
        console.log('🔄 [SW Manager] Force updating...');
        
        // Show progress
        this.showUpdateProgress();
        
        // Clear all caches
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
        }
        
        // Clear user cache
        this.clearUserCache();
        
        // Wait for cache clearing
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

// Initialize the update manager
const swUpdateManager = new ServiceWorkerUpdateManager();

// Expose globally for debugging and manual control
window.swUpdateManager = swUpdateManager;

console.log('✅ [SW Manager] Standalone Service Worker Update Manager initialized');