// auth.js - FIXED VERSION
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

// ===== SIMPLIFIED Service Worker Registration =====
// Register service worker ONCE and let it handle everything
class SimpleServiceWorkerManager {
    constructor() {
        this.registration = null;
        
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
                // Register service worker ONCE
                this.registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                    scope: '/',
                    updateViaCache: 'none' // Always check for updates
                });
                
                console.log('✅ [SW Manager] Service Worker registered successfully');
                console.log('📍 [SW Manager] Registration scope:', this.registration.scope);
                
                // Listen for updates
                this.registration.addEventListener('updatefound', () => {
                    const newWorker = this.registration.installing;
                    console.log('🔄 [SW Manager] New service worker found, installing...');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('🆕 [SW Manager] New version installed, will activate on reload');
                            this.showUpdateNotification();
                        }
                    });
                });

                // Listen for messages from service worker
                navigator.serviceWorker.addEventListener('message', (event) => {
                    console.log('📨 [SW Manager] Message from Service Worker:', event.data);
                    
                    if (event.data.type === 'SW_VERSION_UPDATE') {
                        if (event.data.action === 'activated' && event.data.shouldReload) {
                            console.log('🔄 [SW Manager] Service Worker activated, reloading...');
                            setTimeout(() => window.location.reload(), 1000);
                        }
                    }
                });

                // Check for updates periodically
                setInterval(() => {
                    if (!document.hidden) {
                        this.registration.update();
                    }
                }, 30000);
                
            } catch (error) {
                console.error('❌ [SW Manager] Service Worker registration failed:', error);
                
                // More detailed error logging
                if (error.message.includes('403')) {
                    console.error('🔍 [SW Manager] 403 Error - Check file permissions and server configuration');
                } else if (error.message.includes('404')) {
                    console.error('🔍 [SW Manager] 404 Error - firebase-messaging-sw.js not found in root directory');
                } else {
                    console.error('🔍 [SW Manager] Registration error details:', error);
                }
            }
        } else {
            console.warn('⚠️ [SW Manager] Service Workers not supported in this browser');
        }
    }

    showUpdateNotification() {
        // Simple update notification
        if (window.showToast) {
            window.showToast('New version available! Refresh to update.', '#4CAF50');
        }
        
        // Auto-refresh after 3 seconds
        setTimeout(() => {
            window.location.reload();
        }, 3000);
    }
}

// Initialize the SIMPLIFIED service worker manager
const swManager = new SimpleServiceWorkerManager();

// Expose globally for debugging
window.swManager = swManager;

console.log('✅ [SW Manager] Simplified Service Worker Manager initialized');