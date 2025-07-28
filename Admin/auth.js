// auth.js
document.addEventListener('DOMContentLoaded', async function () {
    const profilePictureContainer = document.getElementById('profile-picture1');
    const homeProfilePicture = document.getElementById('profile-picture3');
    const usernameContainer = document.getElementById('username1');

    // Define API_BASE_URL early
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
    window.API_BASE_URL = API_BASE_URL; // Expose globally immediately

    // Global utility functions (now defined once and exposed)
    if (!window.showToast) { // Prevent re-defining if it's already defined elsewhere
        window.showToast = function (message, bgColor = '#333') {
            const toast = document.createElement("div");
            toast.className = "toast-message show";
            toast.style.backgroundColor = bgColor;
            toast.textContent = message;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.classList.remove("show");
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        };
    }

    // Function to show login option when not logged in or token is invalid
    function showLoginOption() {
        if (profilePictureContainer) { // Check if elements exist before manipulating
            profilePictureContainer.src = 'default-avatar.png';
        }
        if (homeProfilePicture) {
            homeProfilePicture.src = 'default-avatar.png';
        }
        if (usernameContainer) {
            usernameContainer.textContent = 'Please log in';
        }
    }

    // Check login status and return the userId if logged in, otherwise null
    window.checkLoginStatus = async function () {
        const token = localStorage.getItem('authToken');
        const tokenExpiry = localStorage.getItem('tokenExpiry');

        // Check for missing token or expired token
        if (!token || !tokenExpiry || Date.now() > parseInt(tokenExpiry, 10)) {
            console.log('Token expired or missing. User is not logged in.');
            localStorage.removeItem('authToken'); // Clean up expired/invalid token
            localStorage.removeItem('userId'); // Ensure userId is also cleared
            showLoginOption();
            return null; // Explicitly return null if not logged in
        }

        try {
            const response = await fetch(`${API_BASE_URL}/verify-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const userData = await response.json();
                // Update UI elements if they exist
                if (profilePictureContainer) {
                    profilePictureContainer.src = userData.profilePicture || 'default-avatar.png';
                }
                if (homeProfilePicture) {
                    homeProfilePicture.src = userData.profilePicture || 'default-avatar.png';
                }
                if (usernameContainer) {
                    usernameContainer.textContent = `Welcome, ${userData.firstName || 'User'}`;
                }

                // Store userId in localStorage for broader access
                localStorage.setItem('userId', userData.userId);
                return userData.userId; // Return the logged-in user ID
            } else {
                // Token invalid on backend side
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
                console.warn('Auth token invalid or expired. User logged out.');
                showLoginOption();
                return null;
            }
        } catch (error) {
            console.error('Error verifying token:', error);
            localStorage.removeItem('authToken');
            localStorage.removeItem('userId');
            showLoginOption();
            return null; // Return null on network/server error
        }
    };

    // --- IMPORTANT CHANGE HERE ---
    // Instead of directly setting window.loggedInUser, we now await checkLoginStatus
    // and then set window.loggedInUser *after* it's definitively known.
    // We also dispatch an event so other scripts can reliably react.
    const user = await window.checkLoginStatus(); // Get the actual logged-in user ID
    window.loggedInUser = user; // Set the global variable based on the check result

    // Dispatch a custom event once login status is definitively known
    // This is what post-renderer.js will listen for.
    document.dispatchEvent(new CustomEvent('authStatusReady', { detail: { loggedInUser: window.loggedInUser } }));

    console.log("Auth status ready. Logged-in user:", window.loggedInUser);
});

// ===== Service Worker Update Management =====
// Enhanced Service Worker Update Manager for seamless updates

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

// Add debug mode features (only if debug mode is enabled)
if (localStorage.getItem('debug-mode') === 'true') {
    console.log('🐛 [SW Manager] Debug mode enabled');
    
    // Add manual update button
    setTimeout(() => {
        const debugButton = document.createElement('button');
        debugButton.textContent = '🔄 Force Update';
        debugButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 9999;
            background: #ff4444;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(255,68,68,0.3);
        `;
        debugButton.onclick = () => swUpdateManager.forceUpdate();
        document.body.appendChild(debugButton);
    }, 1000);
    
    // Add version display
    setTimeout(async () => {
        const version = await swUpdateManager.getSWVersion();
        if (version) {
            const versionDisplay = document.createElement('div');
            versionDisplay.textContent = `SW: ${version}`;
            versionDisplay.style.cssText = `
                position: fixed;
                bottom: 60px;
                left: 20px;
                z-index: 9999;
                background: rgba(0,0,0,0.7);
                color: white;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 10px;
                font-family: monospace;
            `;
            document.body.appendChild(versionDisplay);
        }
    }, 2000);
}

console.log('✅ [SW Manager] Service Worker Update Manager initialized');