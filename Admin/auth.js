// main.js
import { checkLoginStatus, checkFollowStatusOnLoad } from './auth.js';
import { fetchPosts } from 'posts.js';
import { API_BASE_URL } from 'constants.js';

document.addEventListener('DOMContentLoaded', async function () {
    const profilePictureContainer = document.getElementById('profile-picture1');
    const homeProfilePicture = document.getElementById('profile-picture3');
    const usernameContainer = document.getElementById('username1');
    let loggedInUser = null;

    // Initialize login status and fetch posts
    await checkLoginStatus(profilePictureContainer, homeProfilePicture, usernameContainer, (userId) => {
        loggedInUser = userId;
        fetchPosts(); // Initial fetch
    });

    // Check follow status
    await checkFollowStatusOnLoad();

    // Category filter event listeners
    document.querySelectorAll('.category-btn').forEach(button => {
        button.addEventListener('click', function () {
            const selectedCategory = this.getAttribute('data-category');
            fetchPosts(selectedCategory);
        });
    });
});