// main.js
import { salmartCache } from './salmartCache.js';

// --- Constants ---
const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
const DEFAULT_PLACEHOLDER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// --- Cached DOM Elements ---
const postsContainer = document.getElementById('posts-container');
// We no longer need a load more button, so we can remove this line
// const loadMoreBtn = document.getElementById('load-more-btn');

// --- Global State Variables ---
let currentLoggedInUser = localStorage.getItem('userId');
let currentFollowingList = [];
let isAuthReady = false;
let currentCategory = 'all';
let isLoading = false; // Flag to prevent multiple concurrent loads
let suggestionCounter = 0;
const promotedPostIdsInserted = new Set();
let scrollObserver; // For infinite scrolling

// --- Socket.IO Initialization ---
const socket = io(SOCKET_URL, {
    auth: { token: localStorage.getItem('authToken') },
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
});

socket.on('connect', () => {
    console.log('Socket.IO connected');
    if (currentLoggedInUser) {
        socket.emit('join', `user_${currentLoggedInUser}`);
    }
});

socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error.message);
});

socket.on('profilePictureUpdate', ({ userId, profilePicture }) => {
    console.log(`Received profile picture update for user ${userId}`);
    updateProfilePictures(userId, profilePicture);
});

// --- Utility Functions (These can stay as they are) ---

function showToast(message, bgColor = '#333') { /* ... */ }
window.showToast = showToast;
function formatTime(timestamp) { /* ... */ }
function escapeHtml(text) { /* ... */ }
window.updateFollowButtonsUI = function(userId, isFollowing) { /* ... */ };
function updateProfilePictures(userId, profilePicture) { /* ... */ }
function lazyLoadImage(imgElement, originalSrc) { /* ... */ }
function lazyLoadVideo(videoElement) { /* ... */ }

// --- UI Rendering Functions (These are fine as they are) ---

function renderUserSuggestion(user) { /* ... */ }
function createUserSuggestionsContainer(users) { /* ... */ }
function renderPromotedPost(post) { /* ... */ }
function createPromotedPostFiller() { /* ... */ }
function createPromotedPostsRow(posts) { /* ... */ }
function renderPost(post) { /* ... */ }
window.redirectToLogin = function() { /* ... */ };

// --- Main Post Fetching and Rendering Logic ---

/**
 * Fetches posts for a given category and renders them. This is for the initial load.
 * @param {string} category - The category of posts to fetch.
 * @param {boolean} clearExisting - If true, clears the current posts before fetching.
 */
async function fetchInitialPosts(category = currentCategory, clearExisting = false) {
    if (!postsContainer) return;
    if (isLoading) return;

    isLoading = true;
    postsContainer.classList.add('loading');

    if (clearExisting) {
        postsContainer.innerHTML = '';
        suggestionCounter = 0;
        promotedPostIdsInserted.clear();
    }

    try {
        // Use the cache module to get posts. It handles fetching new data.
        const allPosts = await salmartCache.getPostsByCategory(category);

        if (!Array.isArray(allPosts) || allPosts.length === 0) {
            if (postsContainer.children.length === 0) {
                postsContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: #666;">No posts yet for "${category === 'all' ? 'this category' : escapeHtml(category)}".</p>`;
            }
            postsContainer.classList.remove('loading');
            isLoading = false;
            return;
        }

        const sortedPosts = [...allPosts].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        const availablePromotedPosts = sortedPosts.filter(post => post.isPromoted && post.postType !== 'video_ad');
        const nonPromotedPosts = sortedPosts.filter(post => !post.isPromoted || post.postType === 'video_ad');
        availablePromotedPosts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        const fragment = document.createDocumentFragment();
        // ... (your existing rendering logic to append posts to the fragment) ...
        
        postsContainer.appendChild(fragment);
        window.dispatchEvent(new Event('postsRendered'));

        // Start observing the last post for infinite scroll
        const lastPostElement = postsContainer.querySelector('.post:last-of-type');
        if (lastPostElement) {
            scrollObserver.observe(lastPostElement);
        }

    } catch (error) {
        console.error('Error fetching and rendering posts:', error);
        if (!postsContainer.children.length) {
            postsContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: #555;"><i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #dc3545; margin-bottom: 10px;"></i><p>Failed to load posts.<br>Please refresh the page or check your connection.</p></div>`;
        }
    } finally {
        isLoading = false;
        postsContainer.classList.remove('loading');
    }
}

/**
 * Fetches older posts for infinite scrolling.
 * @param {string} category - The category.
 * @param {string} lastPostId - The ID of the last post in the DOM.
 */
async function fetchMorePosts(category, lastPostId) {
    if (isLoading) return;
    isLoading = true;

    try {
        const olderPosts = await salmartCache.getOlderPosts(category, lastPostId);
        
        if (olderPosts && olderPosts.length > 0) {
            const fragment = document.createDocumentFragment();
            olderPosts.forEach(post => {
                const postElement = renderPost(post);
                fragment.appendChild(postElement);
            });
            postsContainer.appendChild(fragment);
            console.log(`Rendered ${olderPosts.length} older posts.`);
            
            // Re-observe the new last post
            const newLastPostElement = postsContainer.querySelector('.post:last-of-type');
            if (newLastPostElement) {
                scrollObserver.observe(newLastPostElement);
            }
        } else {
            console.log('No more older posts to load.');
            // Stop observing to prevent unnecessary API calls
            const lastPostElement = postsContainer.querySelector('.post:last-of-type');
            if (lastPostElement) {
                scrollObserver.unobserve(lastPostElement);
            }
        }
    } catch (error) {
        console.error('Error fetching older posts:', error);
    } finally {
        isLoading = false;
    }
}


// --- Event Listeners and Initializers ---

document.addEventListener('DOMContentLoaded', async function () {
    // Initialize the infinite scroll observer
    scrollObserver = new IntersectionObserver(async (entries) => {
        const lastEntry = entries[0];
        if (lastEntry.isIntersecting && !isLoading) {
            const lastPostElement = postsContainer.querySelector('.post:last-of-type');
            if (lastPostElement) {
                 const lastPostId = lastPostElement.dataset.postId;
                 await fetchMorePosts(currentCategory, lastPostId);
            }
        }
    }, {
        root: null,
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.1
    });

    await initializeAppData();

    document.addEventListener('click', async (event) => {
        const target = event.target.closest('button, a');
        if (!target) return;
        // ... (your existing click handlers here, now calling salmartCache methods
        //       for any data-related actions like 'like', 'follow', etc.)
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.post-options')) {
            document.querySelectorAll('.post-options-menu.active').forEach(menu => {
                menu.classList.remove('active');
            });
        }
    });
});

/**
 * Initializes application data.
 */
async function initializeAppData() {
    if (isAuthReady) return;

    if (!currentLoggedInUser) {
        currentLoggedInUser = localStorage.getItem('userId');
    }

    if (currentLoggedInUser) {
        currentFollowingList = await salmartCache.fetchFollowingList();
        socket.emit('join', `user_${currentLoggedInUser}`);
    }
    isAuthReady = true;
    console.log('App initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
    
    // Initial fetch to populate the page with the latest posts
    await fetchInitialPosts(currentCategory, true);
}

// Expose functions globally for event handlers and other scripts
window.fetchPosts = fetchInitialPosts;

window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    if (window.videoIntersectionObserver) {
        postsContainer.querySelectorAll('.post-video').forEach(video => {
            window.videoIntersectionObserver.unobserve(video);
        });
    }
});
