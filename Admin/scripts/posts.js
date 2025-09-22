
import {
    salmartCache
} from './salmartCache.js';

// --- Constants ---
const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
const DEFAULT_PLACEHOLDER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// --- Configuration Constants for Feed Insertion ---
const POSTS_BEFORE_SUGGESTION = 5;
const USERS_PER_SUGGESTION_ROW = 8;
const NORMAL_POSTS_BEFORE_PROMOTED_ROW = 2;
const PROMOTED_POSTS_PER_INSERT = 5;


// Throttle utility function
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// --- Optimized Image Loading (New) ---
class ImageLoader {
    constructor() {
        // Optimized rootMargin for better lazy loading: 300px above/below viewport
        this.observer = new IntersectionObserver(this.handleIntersections.bind(this), {
            rootMargin: '300px 0px 300px 0px',
            threshold: 0.01
        });
        this.cache = new Map();
        this.loader = new Image();
        this.batch = [];
    }

    observe(imgElement, originalSrc) {
        if (!originalSrc || this.cache.has(originalSrc)) {
            this.setSource(imgElement, originalSrc || '');
            return;
        }

        imgElement.dataset.originalSrc = originalSrc;
        imgElement.classList.add('lazy-loading');
        this.observer.observe(imgElement);
    }

    setSource(imgElement, src) {
        const parentPlaceholder = imgElement.closest('.image-placeholder, .video-thumbnail-wrapper');

        if (!src) {
            if (parentPlaceholder) {
                parentPlaceholder.classList.add('error');
                parentPlaceholder.innerHTML = `
                <div class="placeholder-content">
                    <div class="placeholder-icon">
                        <i class="fas fa-image"></i>
                    </div>
                    <div class="placeholder-text">No Media Available</div>
                    <div class="placeholder-subtext">Content photo not found</div>
                </div>
            `;
            }
            imgElement.style.display = 'none';
            imgElement.classList.remove('lazy-loading');
            console.error('Missing media source for element.');
            return;
        }

        // Show loading state
        if (parentPlaceholder) {
            parentPlaceholder.classList.add('loading');
            parentPlaceholder.classList.remove('error');
        }
        imgElement.classList.add('lazy-loading');

        // Check cache first
        if (this.cache.has(src)) {
            imgElement.src = this.cache.get(src);
            imgElement.style.opacity = '1';
            imgElement.classList.remove('lazy-loading');
            imgElement.classList.add('loaded');
            if (parentPlaceholder) {
                parentPlaceholder.classList.remove('loading');
                parentPlaceholder.classList.add('loaded');
                // Hide placeholder content when image loads
                const placeholderContent = parentPlaceholder.querySelector('.placeholder-content');
                if (placeholderContent) {
                    placeholderContent.style.display = 'none';
                }
                // For video thumbnails, ensure play button is visible
                const playOverlay = parentPlaceholder.querySelector('.video-play-overlay');
                if (playOverlay) playOverlay.style.display = 'flex';
            }
            return;
        }

        imgElement.src = src;

        imgElement.onload = () => {
            imgElement.style.opacity = '1';
            imgElement.classList.remove('lazy-loading');
            imgElement.classList.add('loaded');
            if (parentPlaceholder) {
                parentPlaceholder.classList.remove('loading');
                parentPlaceholder.classList.add('loaded');
                // Hide placeholder content when image loads successfully
                const placeholderContent = parentPlaceholder.querySelector('.placeholder-content');
                if (placeholderContent) {
                    placeholderContent.style.display = 'none';
                }
                // For video thumbnails, ensure play button is visible
                const playOverlay = parentPlaceholder.querySelector('.video-play-overlay');
                if (playOverlay) playOverlay.style.display = 'flex';
            }
            this.cache.set(src, src);
        };

        imgElement.onerror = () => {
            imgElement.src = '';
            imgElement.style.opacity = '0';
            imgElement.classList.remove('lazy-loading');
            if (parentPlaceholder) {
                parentPlaceholder.classList.remove('loading');
                parentPlaceholder.classList.add('error');
                // Show error placeholder content
                const placeholderContent = parentPlaceholder.querySelector('.placeholder-content');
                if (placeholderContent) {
                    placeholderContent.innerHTML = `
                    <div class="placeholder-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="placeholder-text">Failed to load media</div>
                    <div class="placeholder-subtext">Check your connection</div>
                `;
                    placeholderContent.style.display = 'flex';
                }
            }
            console.error(`Failed to load image: ${src}`);
        }
    }

    handleIntersections(entries, observer) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const imgElement = entry.target;
                const originalSrc = imgElement.dataset.originalSrc;
                if (originalSrc) {
                    this.batch.push({
                        imgElement,
                        originalSrc
                    });
                    observer.unobserve(imgElement);
                }
            }
        });
        if (this.batch.length > 0) {
            this.processBatch();
        }
    }

    processBatch() {
        this.batch.forEach(({
            imgElement,
            originalSrc
        }) => {
            this.setSource(imgElement, originalSrc);
        });
        this.batch = [];
    }

    disconnect() {
        this.observer.disconnect();
    }
}

const imageLoader = new ImageLoader();

function lazyLoadImage(imgElement, originalSrc) {
    if (!imgElement) return;
    imageLoader.observe(imgElement, originalSrc);
}

// --- Cached DOM Elements ---
const postsContainer = document.getElementById('posts-container');
// Note: `loadMoreBtn` is no longer used for infinite scroll.

// --- Global State Variables ---
let currentLoggedInUser = localStorage.getItem('userId');
let currentFollowingList = [];
let isAuthReady = false;
let currentCategory = 'all';
let isLoading = false; // Flag to prevent multiple concurrent loads
let suggestionCounter = 0;
// THIS IS THE IMPORTANT CHANGE
const promotedPostIdsInserted = new Set();
let scrollObserver; // The IntersectionObserver for infinite scrolling

// --- Socket.IO Initialization ---
const socket = io(SOCKET_URL, {
    auth: {
        token: localStorage.getItem('authToken')
    },
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

socket.on('profilePictureUpdate', ({
    userId,
    profilePicture
}) => {
    console.log(`Received profile picture update for user ${userId}`);
    updateProfilePictures(userId, profilePicture);
});

socket.on('postLiked', async ({
    postId,
    likes,
    category
}) => {
    await salmartCache.updatePostInCache(postId, {
        likes
    }, category || currentCategory);
    const currentUserId = localStorage.getItem('userId');
    if (currentUserId) {
        salmartCache._updateLikeUI(postId, likes, currentUserId);
    }
});

socket.on('postCommented', async ({
    postId,
    commentCount,
    category
}) => {
    await salmartCache.updateCommentCount(postId, commentCount, category || currentCategory);
});

// Socket event handlers
socket.on('postPromoted', async ({
    postId,
    category,
    post
}) => {
    console.log(`📢 Real-time: Post ${postId} was promoted!`);
    await salmartCache.updatePostPromotionStatus(postId, true, category);
    promotedPostIdsInserted.clear();
    if (!category || category === currentCategory || currentCategory === 'all') {
        console.log('🔄 Refreshing promoted posts display...');
        await fetchInitialPosts(currentCategory, true);
    }
});

socket.on('postUnpromoted', async ({
    postId,
    category
}) => {
    console.log(`📢 Real-time: Post ${postId} was unpromoted!`);
    promotedPostIdsInserted.delete(postId);
    await salmartCache.updatePostPromotionStatus(postId, false, category);
    if (!category || category === currentCategory || currentCategory === 'all') {
        console.log('🔄 Refreshing promoted posts display...');
        await fetchInitialPosts(currentCategory, true);
    }
});

socket.on('newPost', async ({
    post,
    category
}) => {
    console.log(`📢 Real-time: New post ${post._id} created in category ${category}!`);
    await salmartCache.addNewPostToCache(post, category);
    promotedPostIdsInserted.clear();
    if (!category || category === currentCategory || currentCategory === 'all') {
        console.log('🔄 Refreshing posts display...');
        await fetchInitialPosts(currentCategory, true);
    }
});

socket.on('postSoldStatusChanged', async ({ postId, isSold, quantity, category }) => {
    await salmartCache.updatePostInCache(postId, { isSold, quantity }, category || currentCategory);
    updatePostSoldStatus(postId, isSold, quantity);
});

// Listen for post updates from server
if (socket && socket.connected) {
    socket.on('postUpdated', async (data) => {
        const { postId, updatedPost, userId } = data;
        
        // Only update if it's not the current user (they already see their changes)
        const currentUserId = localStorage.getItem('userId');
        if (userId === currentUserId) return;
        
        try {
            // Update cache with new data
            await salmartCache.updatePostInCache(postId, updatedPost, 'all');
            
            // Update UI immediately
            updatePostUIElements(postId, updatedPost);
            
            console.log(`Post ${postId} updated via socket`);
        } catch (error) {
            console.error('Socket post update error:', error);
        }
    });
}

// Function to update UI elements
function updatePostUIElements(postId, updatedPost) {
    const postElements = document.querySelectorAll(`[data-post-id="${postId}"]`);
    
    postElements.forEach(postElement => {
        // Update price
        if (updatedPost.price) {
            const priceElements = postElement.querySelectorAll('.price-value, .price, .product-price');
            priceElements.forEach(el => {
                el.textContent = `₦${Number(updatedPost.price).toLocaleString('en-NG')}`;
            })
        }
        
        // Update description/title
        if (updatedPost.description) {
            const titleElements = postElement.querySelectorAll('.product-title, .title, .post-description-text p');
            titleElements.forEach(el => {
                el.textContent = updatedPost.description;
            })
        }
        
        // Update condition
        if (updatedPost.condition) {
            const conditionElements = postElement.querySelectorAll('.condition-badge, .condition, .product-condition');
            conditionElements.forEach(el => {
                el.textContent = updatedPost.condition;
            })
        }
        
        // Update sold status
        if (updatedPost.hasOwnProperty('isSold') || updatedPost.quantity !== undefined) {
            const isSold = updatedPost.isSold || (updatedPost.quantity !== undefined && updatedPost.quantity < 1);
            if (isSold) {
                postElement.classList.add('sold-post');
            } else {
                postElement.classList.remove('sold-post');
            }
        }
    });
}
// --- Utility Functions (Correctly kept here) ---

/**
 * Displays a toast message.
 * @param {string} message - The message to display.
 * @param {string} [bgColor='#333'] - Background color of the toast.
 */
function showToast(message, bgColor = '#333') {
    let toast = document.querySelector('.toast-message');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast-message';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.backgroundColor = bgColor;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500); // Give time for transition before removing
    }, 3000);
}
window.showToast = showToast; // Expose globally

//realtime events
function updatePostSoldStatus(postId, isSold, quantity) {
    const postElements = document.querySelectorAll(`[data-post-id="${postId}"]`);

    postElements.forEach(element => {
        // Update quantity display
        const quantityElements = element.querySelectorAll('.quantity-value, .promoted-quantity');
        quantityElements.forEach(qtyElement => {
            if (quantity !== undefined) {
                qtyElement.textContent = `${quantity} Remaining`;
                qtyElement.setAttribute('data-quantity', quantity); // Update data attribute
            }
        });

        // Update buttons based on quantity < 1, not just isSold
        const shouldDisable = isSold || (quantity !== undefined && quantity < 1);
        
        const buyButtons = element.querySelectorAll('.buy-now-button, .promoted-cta-button');
        buyButtons.forEach(button => {
            if (shouldDisable) {
                button.classList.add('sold-out');
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-times-circle"></i> Sold Out';
            } else {
                button.classList.remove('sold-out');
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-shopping-cart"></i> Buy Now';
            }
        });

        const messageButtons = element.querySelectorAll('.send-message-btn');
        messageButtons.forEach(button => {
            if (shouldDisable) {
                button.classList.add('unavailable');
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-ban"></i> Unavailable';
            } else {
                button.classList.remove('unavailable');
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-paper-plane"></i> Message';
            }
        });
        
        // Update post container class
        if (shouldDisable) {
            element.classList.add('sold-post');
        } else {
            element.classList.remove('sold-post');
        }
    });
}
/**
 * Formats a timestamp into a human-readable relative time string.
 * @param {string} timestamp - The ISO timestamp string.
 * @returns {string} - Formatted time string (e.g., "5m", "3h", "Jul 23").
 */
function formatTime(timestamp) {
    const now = new Date();
    const postDate = new Date(timestamp);
    const diffInSeconds = Math.floor((now - postDate) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w`;

    const currentYear = now.getFullYear();
    const postYear = postDate.getFullYear();

    if (postYear === currentYear) {
        return postDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric"
        });
    } else {
        return postDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    }
}

/**
 * Escapes HTML characters in a string to prevent XSS.
 * @param {string} text - The text to escape.
 * @returns {string} - The escaped HTML string.
 */
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Updates the UI for all follow buttons associated with a specific user.
 * @param {string} userId - The ID of the user whose buttons to update.
 * @param {boolean} isFollowing - True if the user is now followed, false otherwise.
 */
window.updateFollowButtonsUI = function(userId, isFollowing) {
    document.querySelectorAll(`.follow-button[data-user-id="${userId}"]`).forEach(button => {
        if (isFollowing) {
            button.innerHTML = '<i class="fas fa-user-check"></i> Following';
            button.style.backgroundColor = '#fff';
            button.style.color = '#28a745';
            button.disabled = true;
        } else {
            button.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
            button.style.backgroundColor = '';
            button.style.color = '';
            button.disabled = false;
        }
    });
};

/**
 * Updates all instances of a user's profile picture in the UI.
 * @param {string} userId - The ID of the user.
 * @param {string} profilePicture - The new URL of the profile picture.
 */
function updateProfilePictures(userId, profilePicture) {
    const cleanedUrl = profilePicture ? profilePicture.split('?')[0] : '/default-avater.png';
    document.querySelectorAll(`img.post-avatar[data-user-id="${userId}"], img.promoted-avatar[data-user-id="${userId}"], img.user-suggestion-avatar[data-user-id="${userId}"]`).forEach(img => {
        // Update the src directly, as ImageLoader handles the cache/lazy aspect
        img.src = cleanedUrl; 
        img.onerror = () => {
            img.src = '/default-avater.png';
        };
    });
}


// --- UI Rendering Functions (From your provided code) ---

function renderUserSuggestion(user) {
    const suggestionElement = document.createElement('div');
    suggestionElement.classList.add('user-suggestion-card');
    const isFollowingUser = currentFollowingList.includes(user._id.toString());
    
    // NOTE: Inline CSS is kept here as it was in your original code, but external CSS is recommended.
    suggestionElement.style.cssText = `
        flex: 0 0 auto;
        width: 100%;
        max-width: 120px; 
        padding: 10px;
        text-align: center;
        border-radius: 8px;
        background-color: #f8f8f8;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        scroll-snap-align: start; /* Added for scroll-snap */
    `;

    suggestionElement.innerHTML = `
        <a href="Profile.html?userId=${user._id}" class="user-info-link" style="text-decoration: none; color: inherit;">
            <img class="user-suggestion-avatar" data-user-id="${user._id}" onerror="this.src='/default-avater.png'" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 5px;">
            <h5 class="user-suggestion-name" style="margin: 0; font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(user.name)}</h5>
        </a>
        <button class="follow-button user-suggestion-follow-btn" data-user-id="${user._id}" ${isFollowingUser ? 'disabled' : ''} style="color: #28a746; margin-top: 5px; background: none; border: 1px solid #28a746; padding: 5px 10px; border-radius: 15px; font-size: 0.75em; cursor: pointer; transition: background 0.2s;">
            ${isFollowingUser ? '<i class="fas fa-user-check"></i> Following' : '<i class="fas fa-user-plus"></i> Follow'}
        </button>
    `;
    const avatarImg = suggestionElement.querySelector('.user-suggestion-avatar');
    if (avatarImg) {
        lazyLoadImage(avatarImg, user.profilePicture || '/default-avater.png');
    }
    return suggestionElement;
}

function createUserSuggestionsContainer(users) {
    if (!users || users.length === 0) {
        return null;
    }
    const wrapperContainer = document.createElement('div');
    wrapperContainer.classList.add('user-suggestions-wrapper');
    // NOTE: Inline CSS is kept here as it was in your original code, but external CSS is recommended.
    wrapperContainer.style.cssText = `margin: 20px 0; padding: 15px; background-color: #fff; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);`; 
    const headerElement = document.createElement('h3');
    headerElement.textContent = 'Suggested People to Follow';
    headerElement.style.cssText = `margin-top: 0; margin-bottom: 15px; font-size: 1.1em; color: #333;`; 
    wrapperContainer.appendChild(headerElement);
    
    const rowContainer = document.createElement('div');
    rowContainer.classList.add('user-suggestions-row');
    rowContainer.style.cssText = `display: flex; overflow-x: auto; gap: 15px; padding-bottom: 5px; scroll-snap-type: x mandatory;`; 
    
    users.forEach(user => {
        const userCard = renderUserSuggestion(user);
        rowContainer.appendChild(userCard);
    });
    wrapperContainer.appendChild(rowContainer);
    return wrapperContainer;
}

function renderPromotedPost(post) {
    const postElement = document.createElement('div');
    postElement.classList.add('promoted-post');
    postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
    postElement.dataset.postId = post._id || '';
    postElement.dataset.sellerId = post.createdBy ? post.createdBy.userId : '';
    postElement.dataset.userId = post.createdBy ? post.createdBy.userId : '';

    const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;
    const isSold = post.isSold || (post.quantity !== undefined && post.quantity < 1);

    let mediaContent = '';
    let productDetails = '';
    let buttonContent = '';
    const productImageForChat = post.photo || DEFAULT_PLACEHOLDER_IMAGE; // Use a default image if none

    mediaContent = `<img class="promoted-image" onerror="this.src='/salmart-192x192.png'">`;
    productDetails = `
        <div class="promoted-product-info">
            <h4 class="promoted-title">${escapeHtml(post.title || 'No description')}</h4>
            <p class="promoted-price">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</p>
            <p class="promoted-location">${escapeHtml(post.location || 'N/A')}</p>
            <p class="promoted-quantity" data-quantity="${post.quantity || 1}">🔥 ${post.quantity || 1} Remaining</p>
        </div>
    `;
    
    if (currentLoggedInUser && !isPostCreator) {
        buttonContent = `
            <div class="button-container">
                <button class="promoted-cta-button buy-now-button ${isSold ? 'sold-out' : ''}" data-post-id="${post._id || ''}"
                    data-product-image="${productImageForChat}"
                    data-product-title="${escapeHtml(post.title || 'Untitled Product')}"
                    data-product-description="${escapeHtml(post.description || 'No description available.')}"
                    data-product-location="${escapeHtml(post.location || 'N/A')}"
                    data-product-condition="${escapeHtml(post.productCondition || 'N/A')}"
                    data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}"
                    data-seller-id="${post.createdBy ? post.createdBy.userId : ''}"
                    data-product-quantity="${post.quantity || 1}"
                    ${isSold ? 'disabled' : ''}>
                    <i class="fas fa-shopping-cart"></i> ${isSold ? 'Sold Out' : 'Buy Now'}
                </button>
                <button class="promoted-cta-button send-message-btn ${isSold ? 'unavailable' : ''}"
                    data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                    data-product-image="${productImageForChat}"
                    data-product-description="${escapeHtml(post.title || '')}"
                    data-post-id="${post._id || ''}"
                    ${isSold ? 'disabled' : ''}
                    >
                    <i class="fas fa-paper-plane"></i> ${isSold ? 'Unavailable' : 'Message'}
                </button>
            </div>
        `;
    } else if (!currentLoggedInUser) {
        buttonContent = `
            <div class="button-container">
                <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                    <i class="fas fa-shopping-cart"></i> Buy Now
                </button>
                <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                    <i class="fas fa-paper-plane"></i> Message Seller
                </button>
            </div>
        `;
    } else {
        buttonContent = `
            <a href="javascript:void(0);" style="pointer-events: none; color: #28a745; font-size: 14px; font-weight: 400;">
                <i class="fas fa-toggle-on"></i> Active (Your Post)
            </a>
        `;
    }

    postElement.innerHTML = `
        <div class="promoted-badge">
            <i class="fas fa-bullhorn"></i>
            <span>Promoted</span>
        </div>
        <div class="promoted-header">
            <a href="Profile.html?userId=${post.createdBy?.userId || ''}" style="display: flex; align-items: center; text-decoration: none; color: inherit;">
                <img class="promoted-avatar" data-user-id="${post.createdBy?.userId || ''}" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
                <div class="promoted-user-info">
                    <h5 class="promoted-user-name">${escapeHtml(post.createdBy ? post.createdBy.name : 'Unknown')}</h5>
                    <span class="promoted-time">${formatTime(post.createdAt || new Date())}</span>
                </div>
            </a>
        </div>
        <div class="promoted-media">
            ${mediaContent}
        </div>
        ${productDetails}
        <div class="promoted-actions">
            ${buttonContent}
        </div>
    `;

    const promotedImgElement = postElement.querySelector('.promoted-image');
    if (promotedImgElement) {
        lazyLoadImage(promotedImgElement, productImageForChat);
    }
    const promotedAvatarElement = postElement.querySelector('.promoted-avatar');
    if (promotedAvatarElement) {
        lazyLoadImage(promotedAvatarElement, post.createdBy?.profilePicture || '/salmart-192x192.png');
    }
    
    // Add the post ID to the set to prevent immediate re-insertion
    promotedPostIdsInserted.add(post._id);

    return postElement;
}

function createPromotedPostFiller() {
    const fillerElement = document.createElement('div');
    fillerElement.classList.add('promoted-post-filler');
    // NOTE: Inline CSS is kept here as it was in your original code, but external CSS is recommended.
    fillerElement.style.cssText = `
        flex: 0 0 auto;
        width: calc((100% / 5) - 12px);
        min-width: 200px;
        background: #fff;
        border-radius: 8px;
        padding: 20px;
        color: #28a745;
        border: solid 1px #fff;
        box-shadow: 0 0 10px #ddd;
        text-align: center;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        scroll-snap-align: start;
    `;
    fillerElement.innerHTML = `
        <div style="font-size: 2em; margin-bottom: 10px;">
            <i class="fas fa-star"></i>
        </div>
        <h4 style="margin: 0 0 8px 0; font-size: 1em;">Discover More</h4>
        <p style="margin: 0; font-size: 0.85em; opacity: 0.9;">
            Explore trending products and find amazing deals
        </p>
        <button style="
            background: #28a746;
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            margin-top: 10px;
            cursor: pointer;
            font-size: 0.8em;
            transition: all 0.3s ease;
        " onclick="window.location.href='/browse.html'">
            Browse All
        </button>
    `;
    return fillerElement;
}

function createPromotedPostsRow(posts) {
    const wrapperContainer = document.createElement('div');
    wrapperContainer.classList.add('promoted-posts-wrapper');
    // NOTE: Inline CSS is kept here as it was in your original code, but external CSS is recommended.
    wrapperContainer.style.cssText = `margin-bottom: 20px;`;
    const rowContainer = document.createElement('div');
    rowContainer.classList.add('promoted-posts-row-container');
    // NOTE: Inline CSS is kept here as it was in your original code, but external CSS is recommended.
    rowContainer.style.cssText = `
        display: flex;
        overflow-x: auto;
        gap: 15px;
        padding: 10px 0;
        background-color: #fff;
        border-radius: 8px;
        box-shadow: 0 0 10px #ddd;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        position: relative;
        -webkit-scrollbar: none;
        -ms-overflow-style: none;
        scrollbar-width: none;
    `;

    posts.forEach(post => {
        // IMPORTANT: The renderPromotedPost function is now responsible for adding the ID to the Set
        const postElement = renderPromotedPost(post); 
        postElement.style.cssText = `
            flex: 0 0 auto;
            width: calc((100% / 5) - 12px);
            min-width: 200px;
            scroll-snap-align: start;
        `;
        rowContainer.appendChild(postElement);
    });

    const fillerCount = Math.max(0, PROMOTED_POSTS_PER_INSERT - posts.length);
    for (let i = 0; i < fillerCount; i++) {
        const fillerElement = createPromotedPostFiller();
        rowContainer.appendChild(fillerElement);
    }
    
    // Header remains empty as per your original code's intention
    const headerElement = document.createElement('h3');
    headerElement.textContent = ''; 
    wrapperContainer.appendChild(headerElement);
    wrapperContainer.appendChild(rowContainer);
    rowContainer.style.position = 'relative';
    return wrapperContainer;
}


function renderPost(post) {
    const postElement = document.createElement('div');
    postElement.classList.add('post');
    postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
    postElement.dataset.postId = post._id || '';
    postElement.dataset.sellerId = post.createdBy ? post.createdBy.userId : '';
    postElement.dataset.userId = post.createdBy ? post.createdBy.userId : '';

    const isFollowing = currentFollowingList.includes(post.createdBy?.userId?.toString());
    const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;
    const isSold = post.isSold || (post.quantity !== undefined && post.quantity < 1);
    
    if (isSold) {
        postElement.classList.add('sold-post');
    }

    let mediaContent = '';
    let productDetails = '';
    let descriptionContent = '';
    let buttonContent = '';

    const productImageForChat = post.postType === 'video_ad' ? (post.videoThumbnail || DEFAULT_PLACEHOLDER_IMAGE) : (post.photo || DEFAULT_PLACEHOLDER_IMAGE);


    if (post.postType === 'video_ad') {
        descriptionContent = `
            <p class="product-title">${escapeHtml(post.description)}</p>
            <div class="post-description-text" style="margin-bottom: 10px; margin-left: -10px;">
                
            </div>
        `;

        mediaContent = `
            <div class="post-video-container">
                
                <video class="post-video" 
                       playsinline 
                       webkit-playsinline 
                       crossorigin="anonymous" 
                       muted
                       poster="${post.videoThumbnail || ''}"
                       preload="metadata"
                       style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;">
                    
                    <source src="${post.video || ''}" type="video/mp4">
                </video>
                
                <div class="video-play-overlay">
                    <button class="video-play-button" aria-label="Play video">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
                
                <div class="video-duration-badge" style="display: block;">
                    <span class="video-duration-text">--:--</span>
                </div>
                
            </div>
            `;
        buttonContent = `
            <div style="margin-top: -50px">
                <a href="${post.productLink || '#'}" class="checkout-product-btn ${isSold ? 'sold-out' : ''}" aria-label="Check out product ${post.description || 'product'}" ${!post.productLink || isSold ? 'disabled' : ''}>
                    <i class="fas fa-shopping-cart"></i> ${isSold ? 'Sold Out' : 'Check Out Product'}
                </a>
                </div>
            `;
    } else {
        descriptionContent = `
            <h2 class="product-title">${escapeHtml(post.title || 'No description')}</h2>
            <div class="post-description-text" style="margin-bottom: 10px; margin-left: -10px;">
                <p>${escapeHtml(post.description || '')}</p>
            </div>
        `;
        mediaContent = `
    <div class="product-image">
        <div class="badge">${post.productCondition || 'New'}</div>
        <div class="image-placeholder">
            <div class="placeholder-content">
                <div class="loading-spinner"></div>
                <div class="placeholder-text">Loading image...</div>
            </div>
            <img class="post-image" 
                 onclick="window.openImage('${productImageForChat.replace(/'/g, "\\'")}')" 
                 alt="Product Image">
        </div>
    </div>
`;

        productDetails = `
            <div class="content">
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-text">
                            <div class="detail-label">                        <i class="fas fa-money-bill-wave" class="detail-icon" price-icon></i> Price</div>
                            <div class="detail-value price-value">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</div>
                        </div>
                    </div>
                    <div class="detail-item">
                        
                        <div class="detail-text">
                            <div class="detail-label"><i class="fas fa-map-marker-alt" class="detail-icon location-icon"></i> Location</div>
                            <div class="detail-value location-value">${escapeHtml(post.location || 'N/A')}</div>
                        </div>

                    </div>
                </div>
                ${post.quantity !== undefined ? `
                    <div class="detail-item" style="display: none;">
                        <div class="detail-text">
                            <div class="detail-label"><i class="fas fa-archive" class="detail-icon quantity-icon"></i> Quantity</div>
                            <div class="detail-value quantity-value" data-quantity="${post.quantity || 1}">${post.quantity || 1} Remaining</div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        if (currentLoggedInUser) {
            if (isPostCreator) {
                buttonContent = !post.isPromoted ? `
          <div class="actions">
            <button class="btn btn-primary promote-button ${isSold ? 'sold-out' : ''}" data-post-id="${post._id || ''}" aria-label="Promote this post" ${isSold ? 'disabled title="Cannot promote sold out post"' : ''} >
              <i class="${isSold ? 'fas fa-times-circle' : 'fas fa-bullhorn'}"></i> 
              ${isSold ? 'Sold Out' : 'Promote'}
            </button>
          </div>
        ` : '';

            } else {
                buttonContent = `
          <div class="actions">
            <button class="btn btn-secondary send-message-btn ${isSold ? 'unavailable' : ''}" data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}" data-product-image="${productImageForChat}" data-product-description="${escapeHtml(post.title || '')}" data-post-id="${post._id || ''}" ${isSold ? 'disabled' : ''}>
              <i class="fas ${isSold ? 'fa-ban' : 'fa-paper-plane'}"></i> 
              ${isSold ? 'Unavailable' : 'Message'}
            </button>
            <button class="btn btn-primary buy-now-button ${isSold ? 'sold-out' : ''}" data-post-id="${post._id || ''}" data-product-image="${productImageForChat}" data-product-title="${escapeHtml(post.title || 'Untitled Product')}" data-product-description="${escapeHtml(post.description || 'No description available.')}" data-product-location="${escapeHtml(post.location || 'N/A')}" data-product-condition="${escapeHtml(post.productCondition || 'N/A')}" data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}" data-seller-id="${post.createdBy ? post.createdBy.userId : ''}" ${isSold ? 'disabled' : ''}
            data-product-quantity="${post.quantity || 1}">
              <i class="fas ${isSold ? 'fa-times-circle' : 'fa-shopping-cart'}"></i> 
              ${isSold ? 'Sold Out' : 'Buy Now'}
            </button>
          </div>
        `;
            }
        } else {
            buttonContent = `
                <div class="actions">
                    <button class="btn btn-secondary login-required" onclick="redirectToLogin()">
                        <i class="fas fa-paper-plane"></i> Message
                    </button>
                    <button class="btn btn-primary login-required" onclick="redirectToLogin()">
                        <i class="fas fa-shopping-cart"></i> Buy Now
                    </button>
                </div>
            `;
        }
    }
    

    let followButtonHtml = '';
    if (post.createdBy && post.createdBy.userId) {
        if (currentLoggedInUser) {
            if (post.createdBy.userId === currentLoggedInUser) {
                followButtonHtml = '';
            } else {
                followButtonHtml = isFollowing ?
                    `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #fff; color: #28a745;" disabled>
                        <i class="fas fa-user-check"></i> Following
                    </button>` :
                    `<button class="follow-button" data-user-id="${post.createdBy.userId}">
                        <i class="fas fa-user-plus"></i> Follow
                    </button>`;
            }
        } else {
            followButtonHtml = `
                <button class="follow-button login-required" onclick="redirectToLogin()">
                    <i class="fas fa-user-plus"></i> Follow
                </button>
            `;
        }
    }

    const postActionsHtml = currentLoggedInUser ? `
        <div class="post-actions">
            <button class="action-button like-button" data-post-id="${post._id || ''}">
                <i class="${post.likes && post.likes.includes(currentLoggedInUser) ? 'fas' : 'far'} fa-heart"></i>
                <span class="like-count">${post.likes ? post.likes.length : 0}</span> <span>Likes</span>
            </button>
            <button class="action-button reply-button" data-post-id="${post._id || ''}">
                <i class="far fa-comment-alt"></i>
                <span class="comment-count">${post.comments ? post.comments.length : 0}</span> <span>Comments</span>
            </button>
            <button class="action-button share-button" data-post-id="${post._id || ''}">
                <i class="fas fa-share"></i> Share
            </button>
        </div>
    ` : `
        <div class="post-actions">
            <button class="action-button login-required" onclick="redirectToLogin()">
                <i class="far fa-heart"></i>
                <span class="like-count">${post.likes ? post.likes.length : 0}</span> <span>Likes</span>
            </button>
            <button class="action-button login-required" onclick="redirectToLogin()">
                <i class="far fa-comment-alt"></i>
                <span class="comment-count">${post.comments ? post.comments.length : 0}</span> <span>Comments</span>
            </button>
            <button class="action-button share-button" data-post-id="${post._id || ''}">
                <i class="fas fa-share"></i> Share
            </button>
        </div>
    `;

    postElement.innerHTML = `
        <div class="post-header">
            <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                <img class="post-avatar" data-user-id="${post.createdBy?.userId || ''}" onerror="this.src='/salmart-192x192.png'">
            </a>
            <div class="post-user-info">
                <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                    <h4 class="post-user-name">${escapeHtml(post.createdBy ? post.createdBy.name : 'Unknown')}</h4>
                </a>
                <p class="post-time">${formatTime(post.createdAt || new Date())}</p>
            </div>
            ${followButtonHtml}
            <div class="post-options">
                <button class="post-options-button" type="button"><i class="fas fa-ellipsis-h"></i></button>
                <div class="post-options-menu">
                    <ul>
                        ${isPostCreator ? `
                            <li><button class="delete-post-button" data-post-id="${post._id || ''}" type="button"><i class="fas fa-trash-alt"></i> Delete Post</button></li>
                            <li><button class="edit-post-button" data-post-id="${post._id || ''}" data-post-type="${post.postType || 'regular'}" type="button"><i class="fas fa-edit"></i> Edit Post</button></li>
                        ` : ''}
                        <li><button class="report-post-button" data-post-id="${post._id || ''}" type="button"><i class="fas fa-flag"></i> Report Post</button></li>
                    </ul>
                </div>
            </div>
        </div>
        ${descriptionContent}
        <div class="product-container">
            <div class="media-card">
                ${mediaContent}
            </div>
            <div class="product-card">
                ${productDetails}
            </div>
        </div>
        <div class="buy" style="text-align: center">
            ${buttonContent}
        </div>
        ${postActionsHtml}
    `;

    const postAvatarElement = postElement.querySelector('.post-avatar');
    if (postAvatarElement) {
        lazyLoadImage(postAvatarElement, post.createdBy?.profilePicture || '/salmart-192x192.png');
    }

    if (post.postType === 'video_ad') {
        // We rely on window.initializeVideoControls to be defined in an external script
        const videoElement = postElement.querySelector('.post-video');
        if (videoElement && window.initializeVideoControls) {
            window.initializeVideoControls(postElement);
        }
        
    } else {
        const postImgElement = postElement.querySelector('.post-image');
        if (postImgElement) {
            lazyLoadImage(postImgElement, productImageForChat);
        }
    }

    return postElement;
}

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
        // The fix is here: clear the Set when the page is re-rendered
        promotedPostIdsInserted.clear();
        if (scrollObserver) {
            scrollObserver.disconnect(); // Stop observing on clear
            // Re-initialize the observer after clearing it
            scrollObserver = new IntersectionObserver(async(entries) => {
                const lastEntry = entries[0];
                if (lastEntry.isIntersecting && !isLoading) {
                    const lastPostElement = lastEntry.target;
                    const lastPostId = lastPostElement.dataset.postId;
                    if (lastPostId) {
                        // Unobserve before fetching more to prevent immediate re-trigger
                        scrollObserver.unobserve(lastPostElement);
                        await fetchMorePosts(currentCategory, lastPostId);
                    }
                }
            }, {
                root: null,
                rootMargin: '0px 0px 200px 0px',
                threshold: 0.1
            });
        }
    }


    try {
        const allPosts = await salmartCache.getPosts(category);

        if (!Array.isArray(allPosts) || allPosts.length === 0) {
            if (postsContainer.children.length === 0) {
                postsContainer.innerHTML = `
                    <p style="text-align: center; padding: 20px; color: #666;">
                        <i class="fas fa-box-open" style="font-size: 1.5em; display: block; margin-bottom: 10px;"></i>
                        No posts yet for "${category === 'all' ? 'this category' : escapeHtml(category)}".
                        Try a different category or create one!
                    </p>
                `;
            }
            postsContainer.classList.remove('loading');
            isLoading = false;
            return;
        }

        const sortedPosts = [...allPosts].sort((a, b) => {
            // Sort promoted posts first, then by date
            if (a.isPromoted && !b.isPromoted) return -1;
            if (!a.isPromoted && b.isPromoted) return 1;
            
            // For both promoted or both non-promoted, sort by date. promotedAt should be the true time for promoted.
            const dateA = new Date(a.promotedAt || a.createdAt);
            const dateB = new Date(b.promotedAt || b.createdAt);
            return dateB - dateA;
        });


        const availablePromotedPosts = sortedPosts.filter(post => post.isPromoted === true && post.postType !== 'video_ad');

        const nonPromotedPosts = sortedPosts.filter(post => !post.isPromoted || post.postType === 'video_ad');
        
        const fragment = document.createDocumentFragment();

        let allUserSuggestions = [];
        if (currentLoggedInUser && clearExisting) {
            allUserSuggestions = await salmartCache.fetchUserSuggestions();
        }

        // --- Initial Insertion (Promoted Posts and First Set of Normal Posts) ---
        
        // 1. Insert the first promoted row if available
        const initialPromotedPosts = availablePromotedPosts.filter(post => !promotedPostIdsInserted.has(post._id)).slice(0, PROMOTED_POSTS_PER_INSERT);
        if (initialPromotedPosts.length > 0) {
            const promotedRow = createPromotedPostsRow(initialPromotedPosts);
            fragment.appendChild(promotedRow);
        }

        let normalPostCount = 0;
        
        // --- Main Post Loop for remaining normal posts and interspersing promoted/suggestions ---
        for (let i = 0; i < nonPromotedPosts.length; i++) {
            const post = nonPromotedPosts[i];
            const postElement = renderPost(post);
            fragment.appendChild(postElement);
            normalPostCount++;

            // 1. Insert User Suggestions
            if (normalPostCount % POSTS_BEFORE_SUGGESTION === 0 &&
                currentLoggedInUser &&
                allUserSuggestions.length > 0 &&
                suggestionCounter * USERS_PER_SUGGESTION_ROW < allUserSuggestions.length) {

                const startIndex = suggestionCounter * USERS_PER_SUGGESTION_ROW;
                const endIndex = Math.min(startIndex + USERS_PER_SUGGESTION_ROW, allUserSuggestions.length);
                const usersForThisRow = allUserSuggestions.slice(startIndex, endIndex);

                if (usersForThisRow.length > 0) {
                    const userSuggestionsContainer = createUserSuggestionsContainer(usersForThisRow);
                    if (userSuggestionsContainer) {
                        fragment.appendChild(userSuggestionsContainer);
                        suggestionCounter++;
                    }
                }
            }

            // 2. Insert Promoted Row
            if (normalPostCount % NORMAL_POSTS_BEFORE_PROMOTED_ROW === 0) {
                // Find the next batch of promoted posts that haven't been inserted yet
                const nextPromotedPosts = availablePromotedPosts
                    .filter(post => !promotedPostIdsInserted.has(post._id))
                    .slice(0, PROMOTED_POSTS_PER_INSERT);

                if (nextPromotedPosts.length > 0) {
                    const promotedRow = createPromotedPostsRow(nextPromotedPosts);
                    fragment.appendChild(promotedRow);
                }
            }
        }

        postsContainer.appendChild(fragment);

        if (postsContainer.children.length === 0) {
            postsContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: #666;">No posts available.</p>`;
        }

        const visiblePostIds = sortedPosts.map(post => post._id).filter(Boolean);
        if (visiblePostIds.length > 0) {
            socket.emit('watchPosts', {
                postIds: visiblePostIds
            });
        }

        window.dispatchEvent(new Event('postsRendered'));

        // Start observing the last post for infinite scroll
        const lastPostElement = postsContainer.querySelector('.post:last-of-type');
        if (lastPostElement && scrollObserver) {
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
 * @param {string} lastPostId - The ID of the last post currently displayed.
 */
async function fetchMorePosts(category, lastPostId) {
    if (isLoading) return;
    isLoading = true;

    try {
        const olderPosts = await salmartCache.getPosts(category, lastPostId);


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

            if (newLastPostElement && scrollObserver) {
                // We've already unobserved the previous last element in the IntersectionObserver callback
                scrollObserver.observe(newLastPostElement);
            }
        } else {
            console.log('No more older posts to load.');
            // Stop observing the current last post
            const lastPostElement = document.querySelector(`[data-post-id="${lastPostId}"]`);
            if (lastPostElement && scrollObserver) {
                scrollObserver.unobserve(lastPostElement);
            }
            // Optional: Add a "You're all caught up" message
            if (!postsContainer.querySelector('.end-of-feed-message')) {
                const endMessage = document.createElement('div');
                endMessage.classList.add('end-of-feed-message');
                endMessage.style.cssText = `text-align: center; padding: 20px; color: #6c757d; font-style: italic;`;
                endMessage.innerHTML = '<i class="fas fa-check-circle"></i> You\'re all caught up!';
                postsContainer.appendChild(endMessage);
            }
        }
    } catch (error) {
        console.error('Error fetching older posts:', error);
    } finally {
        isLoading = false;
    }
}

window.redirectToLogin = function() {
    showToast('Please log in to access this feature', '#dc3545');
    setTimeout(() => {
        window.location.href = 'SignIn.html';
    }, 1000);
};

// --- Initializers ---

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize IntersectionObserver for infinite scroll
    scrollObserver = new IntersectionObserver(async(entries) => {
        const lastEntry = entries[0];
        if (lastEntry.isIntersecting && !isLoading) {
            const lastPostElement = lastEntry.target;
            const lastPostId = lastPostElement.dataset.postId;
            if (lastPostId) {
                // Stop observing the current last element to avoid re-triggering while loading
                scrollObserver.unobserve(lastPostElement); 
                await fetchMorePosts(currentCategory, lastPostId);
            }
        }
    }, {
        root: null,
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.1
    });

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.style.display = 'none';
    }

    await initializeAppData();

});

/**
 * Initializes application data, including user authentication status and initial posts.
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
    const justCreatedPost = sessionStorage.getItem('justCreatedPost');
    if (justCreatedPost) {
        sessionStorage.removeItem('justCreatedPost');
        console.log('🔄 Detected return from post creation, marking cache as stale...');
        // Mark *both* the current category and 'all' as stale
        await salmartCache.markCacheAsStale(currentCategory); 
        await salmartCache.markCacheAsStale('all');
    }
    isAuthReady = true;
    console.log('App initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
    await fetchInitialPosts(currentCategory, true);
}

window.fetchPosts = fetchInitialPosts;
window.salmartCache = salmartCache;

// Listen for page visibility changes to refresh posts when returning from other pages
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && isAuthReady) {
        // Check if we just returned from creating a post
        const justCreatedPost = sessionStorage.getItem('justCreatedPost');
        if (justCreatedPost) {
            sessionStorage.removeItem('justCreatedPost');
            console.log('🔄 Detected return from post creation, clearing cache...');
            // In a visibility change, a full cache clear might be too aggressive, 
            // but for a new post scenario, clearing/staling the necessary caches and re-fetching is standard.
            await salmartCache.markCacheAsStale(currentCategory); 
            await salmartCache.markCacheAsStale('all');
            await fetchInitialPosts(currentCategory, true);
        }
    }
});

// Scroll performance optimization
let isScrolling = false;
let scrollTimeout;

function optimizeVideoControlsDuringScroll() {
    // Only apply/remove the 'scrolling' class if it's used for something critical in CSS.
    // If not, this function can be safely removed entirely.
    const videoContainers = document.querySelectorAll('.post-video-container');

    videoContainers.forEach(container => {
        if (isScrolling) { 
            container.classList.add('scrolling');
        } else {
            container.classList.remove('scrolling');
        }
    });
}

// Throttled scroll handler
const throttledScrollHandler = throttle(() => {
    if (!isScrolling) {
        isScrolling = true;
        optimizeVideoControlsDuringScroll();
    }

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        isScrolling = false;
        optimizeVideoControlsDuringScroll();
    }, 150);
}, 16); // ~60fps

// Add scroll listener
window.addEventListener('scroll', throttledScrollHandler, {
    passive: true
});


// Also listen for focus events as a backup
window.addEventListener('focus', async() => {
    if (isAuthReady) {
        const justCreatedPost = sessionStorage.getItem('justCreatedPost');
        if (justCreatedPost) {
            sessionStorage.removeItem('justCreatedPost');
            console.log('🔄 Detected return from post creation via focus, clearing cache...');
            await salmartCache.markCacheAsStale(currentCategory); 
            await salmartCache.markCacheAsStale('all');
            await fetchInitialPosts(currentCategory, true);
        }
    }
});


window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    imageLoader.disconnect();
});
