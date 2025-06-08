// auth.js
document.addEventListener('DOMContentLoaded', async function () {
    const profilePictureContainer = document.getElementById('profile-picture1');
    const homeProfilePicture = document.getElementById('profile-picture3');
    const usernameContainer = document.getElementById('username1');
    let loggedInUser = null;
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';

    // Global utility functions (can be moved to a shared-utils.js if many)
    function showToast(message, bgColor = '#333') {
        const toast = document.createElement("div");
        toast.className = "toast-message show";
        toast.style.backgroundColor = bgColor;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // Function to show login option when not logged in or token is invalid
    function showLoginOption() {
        profilePictureContainer.src = 'default-avatar.png';
        homeProfilePicture.src = 'default-avatar.png';
        usernameContainer.textContent = 'Please log in';
    }

    // Check login status
    async function checkLoginStatus() {
        const token = localStorage.getItem('authToken');
        const tokenExpiry = localStorage.getItem('tokenExpiry');

        if (!token || Date.now() > tokenExpiry) {
            console.log('Token expired or missing. Redirecting to login...');
            showLoginOption();
            return false; // Indicate that user is not logged in
        }

        try {
            const response = await fetch(`${API_BASE_URL}/verify-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const userData = await response.json();
                profilePictureContainer.src = userData.profilePicture || 'default-avatar.png';
                homeProfilePicture.src = userData.profilePicture || 'default-avatar.png';
                usernameContainer.textContent = `Welcome, ${userData.firstName || 'User'}`;
                loggedInUser = userData.userId;
                return true; // Indicate that user is logged in
            } else {
                throw new Error('Token validation failed');
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            showLoginOption();
            return false; // Indicate that user is not logged in
        }
    }

    // Expose necessary variables and functions to the global scope (or use modules if supported)
    window.API_BASE_URL = API_BASE_URL;
    window.loggedInUser = loggedInUser;
    window.showToast = showToast;
    window.checkLoginStatus = checkLoginStatus;

    // Run on DOMContentLoaded
    await checkLoginStatus();
});
