// auth.js - FIXED VERSION WITH NETWORK RESILIENCE
document.addEventListener('DOMContentLoaded', async function () {
    const profilePictureContainer = document.getElementById('profile-picture1');
    const homeProfilePicture = document.getElementById('profile-picture3');
    const usernameContainer = document.getElementById('username1');

    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
    window.API_BASE_URL = API_BASE_URL;

    if (!window.showToast) {
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

    function showLoginOption() {
        if (profilePictureContainer) {
            profilePictureContainer.src = 'default-avatar.png';
        }
        if (homeProfilePicture) {
            homeProfilePicture.src = 'default-avatar.png';
        }
        if (usernameContainer) {
            usernameContainer.textContent = 'Please log in';
        }
    }

    // NEW: Check if error is network-related
    function isNetworkError(error) {
        return (
            error.name === 'TypeError' || // Network errors in fetch
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('network') ||
            !navigator.onLine // Browser offline
        );
    }

    // NEW: Retry mechanism for network failures
    async function fetchWithRetry(url, options, maxRetries = 2) {
        for (let i = 0; i <= maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                return response;
            } catch (error) {
                if (i === maxRetries || !isNetworkError(error)) {
                    throw error;
                }
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
        }
    }

    // IMPROVED: Check login status with network resilience
    window.checkLoginStatus = async function () {
        const token = localStorage.getItem('authToken');
        const tokenExpiry = localStorage.getItem('tokenExpiry');

        // Check for missing token or expired token
        if (!token || !tokenExpiry || Date.now() > parseInt(tokenExpiry, 10)) {
            console.log('Token expired or missing. User is not logged in.');
            localStorage.removeItem('authToken');
            localStorage.removeItem('userId');
            showLoginOption();
            return null;
        }

        try {
            const response = await fetchWithRetry(`${API_BASE_URL}/verify-token`, {
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

                localStorage.setItem('userId', userData.userId);
                return userData.userId;
            } else if (response.status === 401) {
                // Only clear tokens on actual authentication failures (401)
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
                console.warn('Auth token invalid or expired. User logged out.');
                showLoginOption();
                return null;
            } else {
                // Server error (5xx) - don't log out user, just show error
                console.error('Server error during token verification:', response.status);
                if (window.showToast) {
                    window.showToast('Connection issue. Retrying...', '#ff9800');
                }
                // Return null but don't clear tokens - user stays "logged in"
                return localStorage.getItem('userId'); // Return cached userId
            }
        } catch (error) {
            console.error('Error verifying token:', error);
            
            if (isNetworkError(error)) {
                // Network error - don't log out user
                console.log('Network error detected. Keeping user logged in.');
                if (window.showToast) {
                    window.showToast('You appear to be offline. Some features may not work.', '#ff9800');
                }
                // Return cached userId - user stays logged in
                return localStorage.getItem('userId');
            } else {
                // Non-network error - actual auth problem
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
                showLoginOption();
                return null;
            }
        }
    };

    // IMPROVED: Handle initial auth check with better error handling
    let user;
    try {
        user = await window.checkLoginStatus();
    } catch (error) {
        console.error('Critical error during initial auth check:', error);
        user = localStorage.getItem('userId'); // Fallback to cached value
    }

    window.loggedInUser = user;

    // Dispatch auth ready event
    document.dispatchEvent(new CustomEvent('authStatusReady', { 
        detail: { loggedInUser: window.loggedInUser } 
    }));

    console.log("Auth status ready. Logged-in user:", window.loggedInUser);

    // NEW: Monitor online/offline status
    window.addEventListener('online', async () => {
        console.log('Back online - re-verifying auth status');
        if (window.showToast) {
            window.showToast('Back online!', '#4CAF50');
        }
        // Re-check auth when coming back online
        const user = await window.checkLoginStatus();
        if (user !== window.loggedInUser) {
            window.loggedInUser = user;
            document.dispatchEvent(new CustomEvent('authStatusChanged', { 
                detail: { loggedInUser: window.loggedInUser } 
            }));
        }
    });

    window.addEventListener('offline', () => {
        console.log('Gone offline');
        if (window.showToast) {
            window.showToast('You are offline. Some features may not work.', '#ff9800');
        }
    });
});

// IMPROVED Service Worker with better update handling
class SimpleServiceWorkerManager {
    constructor() {
        this.registration = null;
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        if ('serviceWorker' in navigator) {
            try {
                this.registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                    scope: '/',
                    updateViaCache: 'none'
                });
                
                console.log('✅ [SW Manager] Service Worker registered successfully');
                
                this.registration.addEventListener('updatefound', () => {
                    const newWorker = this.registration.installing;
                    console.log('🔄 [SW Manager] New service worker found, installing...');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('🆕 [SW Manager] New version installed');
                            this.showUpdateNotification();
                        }
                    });
                });

                navigator.serviceWorker.addEventListener('message', (event) => {
                    console.log('📨 [SW Manager] Message from Service Worker:', event.data);
                    
                    if (event.data.type === 'SW_VERSION_UPDATE') {
                        if (event.data.action === 'activated' && event.data.shouldReload) {
                            console.log('🔄 [SW Manager] Service Worker activated');
                            // Give user more control over when to reload
                            this.showReloadPrompt();
                        }
                    }
                });

                // Less aggressive update checking
                setInterval(() => {
                    if (!document.hidden && navigator.onLine) {
                        this.registration.update();
                    }
                }, 60000); // Check every minute instead of 30 seconds
                
            } catch (error) {
                console.error('❌ [SW Manager] Service Worker registration failed:', error);
            }
        }
    }

    showUpdateNotification() {
        if (window.showToast) {
            window.showToast('New version available!', '#4CAF50');
        }
    }

    showReloadPrompt() {
        // Give user choice instead of auto-reloading
        if (window.showToast) {
            window.showToast('App updated! Click here to refresh', '#4CAF50');
        }
        
        // Optional: Add a "Refresh" button instead of auto-reload
        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = 'Refresh App';
        refreshBtn.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            background: #4CAF50; color: white; border: none;
            padding: 10px 20px; border-radius: 5px; cursor: pointer;
        `;
        refreshBtn.onclick = () => window.location.reload();
        document.body.appendChild(refreshBtn);
        
        // Auto-remove button after 10 seconds
        setTimeout(() => refreshBtn.remove(), 10000);
    }
}

const swManager = new SimpleServiceWorkerManager();
window.swManager = swManager;