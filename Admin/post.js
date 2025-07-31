// main.js
import { salmartCache } from './salmartCache.js';

// --- Constants ---
const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
const DEFAULT_PLACEHOLDER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
const promotedPostIdsInserted = new Set();
let scrollObserver; // The IntersectionObserver for infinite scrolling

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
    const cacheBustedUrl = `${profilePicture}?v=${Date.now()}`;
    document.querySelectorAll(`img.post-avatar[data-user-id="${userId}"], img.promoted-avatar[data-user-id="${userId}"], img.user-suggestion-avatar[data-user-id="${userId}"]`).forEach(img => {
        img.src = cacheBustedUrl;
        img.onerror = () => { img.src = '/salmart-192x192.png'; };
    });
}

/**
 * Applies lazy loading to an image element using Intersection Observer.
 * It initially sets a placeholder and loads the high-res image when it enters the viewport.
 * @param {HTMLImageElement} imgElement - The image DOM element to lazy load.
 * @param {string} originalSrc - The URL of the high-resolution image.
 */
function lazyLoadImage(imgElement, originalSrc) {
    imgElement.src = DEFAULT_PLACEHOLDER_IMAGE;
    imgElement.classList.add('lazy-loading');

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const lazyImage = entry.target;
                lazyImage.src = originalSrc;
                lazyImage.onload = () => {
                    lazyImage.classList.remove('lazy-loading');
                    lazyImage.classList.add('loaded');
                    observer.unobserve(lazyImage);
                };
                lazyImage.onerror = () => {
                    lazyImage.src = '/salmart-192x192.png';
                    lazyImage.classList.remove('lazy-loading');
                    console.error(`Failed to load image: ${originalSrc}`);
                    observer.unobserve(lazyImage);
                };
            }
        });
    }, {
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.01
    });

    observer.observe(imgElement);
}

/**
 * Initializes lazy loading for a video element.
 * It initially loads only the poster and metadata, then loads the full video when in view.
 * @param {HTMLVideoElement} videoElement - The video DOM element to lazy load.
 */
function lazyLoadVideo(videoElement) {
    const sourceElements = videoElement.querySelectorAll('source[data-src]');
    if (sourceElements.length === 0) return;

    if (!window.videoIntersectionObserver) {
        window.videoIntersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    video.querySelectorAll('source[data-src]').forEach(source => {
                        source.src = source.dataset.src;
                    });
                    video.load();
                    video.classList.remove('lazy-loading');
                    if (video.paused) {
                        video.play().catch(e => console.warn("Video auto-play blocked:", e));
                    }
                } else {
                    if (!video.paused) {
                        video.pause();
                    }
                }
            });
        }, {
            rootMargin: '0px 0px 300px 0px',
            threshold: 0.5
        });
    }

    videoElement.classList.add('lazy-loading');
    window.videoIntersectionObserver.observe(videoElement);
}

// --- UI Rendering Functions (From your provided code) ---

function renderUserSuggestion(user) {
    const suggestionElement = document.createElement('div');
    suggestionElement.classList.add('user-suggestion-card');
    const isFollowingUser = currentFollowingList.includes(user._id.toString());
    suggestionElement.innerHTML = `
        <a href="Profile.html?userId=${user._id}" class="user-info-link">
            <img class="user-suggestion-avatar" data-user-id="${user._id}" alt="${escapeHtml(user.name)}'s profile picture" onerror="this.src='/salmart-192x192.png'">
            <h5 class="user-suggestion-name">${escapeHtml(user.name)}</h5>
        </a>
        <button class="follow-button user-suggestion-follow-btn" data-user-id="${user._id}" ${isFollowingUser ? 'disabled' : ''}>
            ${isFollowingUser ? '<i class="fas fa-user-check"></i> Following' : '<i class="fas fa-user-plus"></i> Follow'}
        </button>
    `;
    const avatarImg = suggestionElement.querySelector('.user-suggestion-avatar');
    if (avatarImg) {
        lazyLoadImage(avatarImg, `${user.profilePicture || '/salmart-192x192.png'}?v=${Date.now()}`);
    }
    return suggestionElement;
}

function createUserSuggestionsContainer(users) {
    if (!users || users.length === 0) {
        return null;
    }
    const wrapperContainer = document.createElement('div');
    wrapperContainer.classList.add('user-suggestions-wrapper');
    wrapperContainer.style.cssText = `...`; // your styles
    const headerElement = document.createElement('h3');
    headerElement.textContent = 'Suggested People to Follow';
    headerElement.style.cssText = `...`; // your styles
    wrapperContainer.appendChild(headerElement);
    const cardsPerRow = 8;
    for (let i = 0; i < users.length; i += cardsPerRow) {
        const rowContainer = document.createElement('div');
        rowContainer.classList.add('user-suggestions-row');
        rowContainer.style.cssText = `...`; // your styles
        const currentRowUsers = users.slice(i, i + cardsPerRow);
        currentRowUsers.forEach(user => {
            const userCard = renderUserSuggestion(user);
            userCard.style.cssText = `...`; // your styles
            rowContainer.appendChild(userCard);
        });
        wrapperContainer.appendChild(rowContainer);
    }
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
    const isSold = post.isSold;

    let mediaContent = '';
    let productDetails = '';
    let buttonContent = '';
    const productImageForChat = post.photo || '/salmart-192x192.png';

    mediaContent = `<img class="promoted-image" alt="Promoted Product" onerror="this.src='/salmart-192x192.png'">`;
    productDetails = `
        <div class="promoted-product-info">
            <h4 class="promoted-title">${escapeHtml(post.title || 'No description')}</h4>
            <p class="promoted-price">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</p>
            <p class="promoted-location">${escapeHtml(post.location || 'N/A')}</p>
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
                    ${isSold ? 'disabled' : ''}>
                    <i class="fas fa-shopping-cart"></i> ${isSold ? 'Sold' : 'Buy'}
                </button>
                <button class="promoted-cta-button send-message-btn ${isSold ? 'unavailable' : ''}"
                    data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                    data-product-image="${productImageForChat}"
                    data-product-description="${escapeHtml(post.title || '')}"
                    data-post-id="${post._id || ''}"
                    ${isSold ? 'disabled' : ''}>
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
                <i class="fas fa-toggle-on"></i> Active
            </a>
        `;
    }

    postElement.innerHTML = `
        <div class="promoted-badge">
            <i class="fas fa-bullhorn"></i>
            <span>Promoted</span>
        </div>
        <div class="promoted-header">
            <img class="promoted-avatar" data-user-id="${post.createdBy?.userId || ''}" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
            <div class="promoted-user-info">
                <h5 class="promoted-user-name">${escapeHtml(post.createdBy ? post.createdBy.name : 'Unknown')}</h5>
                <span class="promoted-time">${formatTime(post.createdAt || new Date())}</span>
            </div>
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
        lazyLoadImage(promotedImgElement, `${productImageForChat}?v=${Date.now()}`);
    }
    const promotedAvatarElement = postElement.querySelector('.promoted-avatar');
    if (promotedAvatarElement) {
        lazyLoadImage(promotedAvatarElement, `${post.createdBy?.profilePicture || '/salmart-192x192.png'}?v=${Date.now()}`);
    }

    return postElement;
}

function createPromotedPostFiller() {
    const fillerElement = document.createElement('div');
    fillerElement.classList.add('promoted-post-filler');
    fillerElement.style.cssText = `...`; // your styles
    fillerElement.innerHTML = `...`; // your HTML
    return fillerElement;
}

function createPromotedPostsRow(posts) {
    const wrapperContainer = document.createElement('div');
    wrapperContainer.classList.add('promoted-posts-wrapper');
    wrapperContainer.style.cssText = `...`; // your styles
    const headerElement = document.createElement('div');
    headerElement.classList.add('promoted-posts-header');
    headerElement.innerHTML = '<h3><i class="fas fa-fire"></i> Suggested products for you</h3>';
    headerElement.style.cssText = `...`; // your styles
    const rowContainer = document.createElement('div');
    rowContainer.classList.add('promoted-posts-row-container');
    rowContainer.style.cssText = `...`; // your styles
    rowContainer.style.setProperty('-webkit-scrollbar', 'none');
    rowContainer.style.setProperty('-ms-overflow-style', 'none');

    const postsToRender = posts.filter(post => !promotedPostIdsInserted.has(post._id));
    postsToRender.forEach(post => {
        const postElement = renderPromotedPost(post);
        postElement.style.cssText = `...`; // your styles
        rowContainer.appendChild(postElement);
        promotedPostIdsInserted.add(post._id);
    });

    const fillerCount = Math.max(0, 5 - postsToRender.length);
    for (let i = 0; i < fillerCount; i++) {
        const fillerElement = createPromotedPostFiller();
        rowContainer.appendChild(fillerElement);
    }
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
    const isSold = post.isSold;

    let mediaContent = '';
    let productDetails = '';
    let descriptionContent = '';
    let buttonContent = '';

    const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
        descriptionContent = `
            <h2 class="product-title">${escapeHtml(post.title || '')}</h2>
            <div class="post-description-text" style="margin-bottom: 10px; padding: 0 15px;">
                <p>${escapeHtml(post.description || '')}</p>
            </div>
        `;
        mediaContent = `
            <div class="post-video-container">
                <video class="post-video" preload="none" aria-label="Video ad for ${post.description || 'product'}" poster="${post.thumbnail || ''}">
                    <source data-src="${post.video || ''}" type="video/mp4" />
                    <source data-src="${post.video ? post.video.replace('.mp4', '.webm') : ''}" type="video/webm" />
                    <source data-src="${post.video ? post.video.replace('.mp4', '.ogg') : ''}" type="video/ogg" />
                    Your browser does not support the video tag.
                </video>
                <canvas class="video-thumbnail" style="display: none;"></canvas>
                <div class="loading-spinner" style="display: none;">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <div class="custom-controls">
                    <button class="control-button play-pause" aria-label="Play or pause video">
                        <i class="fas fa-play"></i>
                    </button>
                    <div class="progress-container">
                        <div class="buffered-bar"></div>
                        <div class="progress-bar" role="slider" aria-label="Video progress" aria-valuemin="0" aria-valuemax="100"></div>
                        <div class="seek-preview" style="display: none;">
                            <canvas class="seek-preview-canvas"></canvas>
                        </div>
                    </div>
                    <div class="time-display">
                        <span class="current-time">0:00</span> / <span class="duration">0:00</span>
                    </div>
                    <button class="control-button mute-button" aria-label="Mute or unmute video">
                        <i class="fas fa-volume-mute"></i>
                    </button>
                    <div class="volume-control">
                        <input type="range" class="volume-slider" min="0" max="100" value="100" aria-label="Volume control">
                    </div>
                    <select class="playback-speed" aria-label="Playback speed">
                        <option value="0.5">0.5x</option>
                        <option value="1" selected>1x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2">2x</option>
                    </select>
                    <button class="control-button fullscreen-button" aria-label="Toggle fullscreen">
                        <i class="fas fa-expand"></i>
                    </button>
                </div>
            </div>
        `;
        buttonContent = `
            <a href="${post.productLink || '#'}" class="checkout-product-btn ${isSold ? 'sold-out' : ''}" aria-label="Check out product ${post.description || 'product'}" ${!post.productLink || isSold ? 'disabled' : ''}>
                <i class="fas fa-shopping-cart"></i> ${isSold ? 'Sold Out' : 'Check Out Product'}
            </a>
        `;
    } else {
        descriptionContent = `
            <h2 class="product-title">${escapeHtml(post.title || 'No description')}</h2>
            <div class="post-description-text" style="margin-bottom: 10px;">
                <p>${escapeHtml(post.description || '')}</p>
            </div>
        `;
        mediaContent = `
            <div class="product-image">
                <div class="badge">${post.productCondition || 'New'}</div>
                <img class="post-image" onclick="window.openImage('${productImageForChat.replace(/'/g, "\\'")}')" alt="Product Image" onerror="this.src='/salmart-192x192.png'">
                
            </div>
        `;
        productDetails = `
            <div class="content">
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-icon price-icon"><i class="fas fa-money-bill-wave"></i></div>
                        <div class="detail-text">
                            <div class="detail-label">Price</div>
                            <div class="detail-value price-value">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</div>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-icon location-icon"><i class="fas fa-map-marker-alt"></i></div>
                        <div class="detail-text">
                            <div class="detail-label">Location</div>
                            <div class="detail-value location-value">${escapeHtml(post.location || 'N/A')}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (currentLoggedInUser) {
  if (isPostCreator) {
    buttonContent = !post.isPromoted ? `
      <div class="actions">
        <button class="btn btn-primary promote-button ${isSold ? 'sold-out' : ''}" data-post-id="${post._id || ''}" aria-label="Promote this post" ${isSold ? 'disabled title="Cannot promote sold out post"' : ''} >
          <i class="${isSold ? 'fas fa-times-circle' : 'fas fa-bullhorn'}"></i> 
          ${isSold ? 'Sold Out' : 'Promote Post'}
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
    <button class="btn btn-primary buy-now-button ${isSold ? 'sold-out' : ''}" data-post-id="${post._id || ''}" data-product-image="${productImageForChat}" data-product-title="${escapeHtml(post.title || 'Untitled Product')}" data-product-description="${escapeHtml(post.description || 'No description available.')}" data-product-location="${escapeHtml(post.location || 'N/A')}" data-product-condition="${escapeHtml(post.productCondition || 'N/A')}" data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}" data-seller-id="${post.createdBy ? post.createdBy.userId : ''}" ${isSold ? 'disabled' : ''}>
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
                <img class="post-avatar" data-user-id="${post.createdBy?.userId || ''}" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
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
        lazyLoadImage(postAvatarElement, `${post.createdBy?.profilePicture || '/salmart-192x192.png'}?v=${Date.now()}`);
    }

    if (post.postType === 'video_ad') {
        const videoElement = postElement.querySelector('.post-video');
        if (videoElement) {
            lazyLoadVideo(videoElement);
            if (window.initializeVideoControls) {
                window.initializeVideoControls(postElement);
            }
        }
    } else {
        const postImgElement = postElement.querySelector('.post-image');
        if (postImgElement) {
            lazyLoadImage(postImgElement, `${productImageForChat}?v=${Date.now()}`);
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
        if (window.videoIntersectionObserver) {
            postsContainer.querySelectorAll('.post-video').forEach(video => {
                window.videoIntersectionObserver.unobserve(video);
            });
        }
        postsContainer.innerHTML = '';
        suggestionCounter = 0;
        promotedPostIdsInserted.clear();
        if (scrollObserver) {
            scrollObserver.disconnect(); // Stop observing on clear
        }
    }

    try {
        const allPosts = await salmartCache.getPostsByCategory(category);

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

        const sortedPosts = [...allPosts].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        const availablePromotedPosts = sortedPosts.filter(post => post.isPromoted && post.postType !== 'video_ad');
        const nonPromotedPosts = sortedPosts.filter(post => !post.isPromoted || post.postType === 'video_ad');
        availablePromotedPosts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        const fragment = document.createDocumentFragment();

        let allUserSuggestions = [];
        if (currentLoggedInUser && clearExisting) {
            allUserSuggestions = await salmartCache.fetchUserSuggestions();
        }

        const initialPromotedPosts = availablePromotedPosts.filter(post => !promotedPostIdsInserted.has(post._id)).slice(0, 5);
        if (initialPromotedPosts.length > 0) {
            const promotedRow = createPromotedPostsRow(initialPromotedPosts);
            fragment.appendChild(promotedRow);
        }

        let normalPostCount = 0;
        let promotedPostsInsertedIndex = initialPromotedPosts.length;
        const postsBeforeSuggestion = 5;
        const usersPerSuggestionRow = 8;
        const promotedPostsPerInsert = 5;
        const normalPostsBeforePromotedRow = 2;


        for (let i = 0; i < nonPromotedPosts.length; i++) {
            const post = nonPromotedPosts[i];
            const postElement = renderPost(post);
            fragment.appendChild(postElement);
            normalPostCount++;

            if (normalPostCount % postsBeforeSuggestion === 0 &&
                currentLoggedInUser &&
                allUserSuggestions.length > 0 &&
                suggestionCounter * usersPerSuggestionRow < allUserSuggestions.length) {

                const startIndex = suggestionCounter * usersPerSuggestionRow;
                const endIndex = Math.min(startIndex + usersPerSuggestionRow, allUserSuggestions.length);
                const usersForThisRow = allUserSuggestions.slice(startIndex, endIndex);

                if (usersForThisRow.length > 0) {
                    const userSuggestionsContainer = createUserSuggestionsContainer(usersForThisRow);
                    if (userSuggestionsContainer) {
                        fragment.appendChild(userSuggestionsContainer);
                        suggestionCounter++;
                    }
                }
            }

            if (normalPostCount % normalPostsBeforePromotedRow === 0) {
                const nextPromotedPosts = availablePromotedPosts
                    .slice(promotedPostsInsertedIndex)
                    .filter(post => !promotedPostIdsInserted.has(post._id))
                    .slice(0, promotedPostsPerInsert);

                if (nextPromotedPosts.length > 0) {
                    const promotedRow = createPromotedPostsRow(nextPromotedPosts);
                    fragment.appendChild(promotedRow);
                    promotedPostsInsertedIndex += nextPromotedPosts.length;
                }
            }
        }
        
        postsContainer.appendChild(fragment);

        if (postsContainer.children.length === 0) {
            postsContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: #666;">No posts available.</p>`;
        }
        
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
 * @param {string} lastPostId - The ID of the last post currently displayed.
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
                scrollObserver.unobserve(lastPostElement);
                scrollObserver.observe(newLastPostElement);
            }
        } else {
            console.log('No more older posts to load.');
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

window.redirectToLogin = function() {
    showToast('Please log in to access this feature', '#dc3545');
    setTimeout(() => {
        window.location.href = 'SignIn.html';
    }, 1000);
};

// --- Event Listeners and Initializers ---

document.addEventListener('DOMContentLoaded', async function () {
    scrollObserver = new IntersectionObserver(async (entries) => {
        const lastEntry = entries[0];
        if (lastEntry.isIntersecting && !isLoading) {
            const lastPostElement = postsContainer.querySelector('.post:last-of-type');
            if (lastPostElement) {
                 const lastPostId = lastPostElement.dataset.postId;
                 if (lastPostId) {
                     await fetchMorePosts(currentCategory, lastPostId);
                 }
            }
        }
    }, {
        root: null,
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.1
    });

    // Remove the old load more button listener since we're using infinite scroll
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.style.display = 'none';
    }

    await initializeAppData();

    document.addEventListener('click', async (event) => {
        const target = event.target.closest('button, a');
        if (!target) return;

        const authToken = localStorage.getItem('authToken');

        if (target.classList.contains('promote-button')) {
            const postId = target.dataset.postId;
            if (!postId) {
                showToast('Invalid post ID for promotion', '#dc3545');
                return;
            }
            window.location.href = `promote.html?postId=${postId}`;
            return;
        }

        if (target.classList.contains('send-message-btn')) {
            event.preventDefault();
            if (!currentLoggedInUser) {
                redirectToLogin();
                return;
            }

            const recipientId = target.dataset.recipientId;
            const postElement = target.closest('.post') || target.closest('.promoted-post');

            if (!postElement) {
                console.error("Could not find parent post element for send message button.");
                showToast('Error: Post information not found.', '#dc3545');
                return;
            }

            const recipientUsername = postElement.querySelector('.post-user-name')?.textContent || postElement.querySelector('.promoted-user-name')?.textContent || 'Unknown';
            const recipientProfilePictureUrl = postElement.querySelector('.post-avatar')?.src || postElement.querySelector('.promoted-avatar')?.src;
            let productImage = target.dataset.productImage || '';
            const productDescription = target.dataset.productDescription || '';
            const postId = target.dataset.postId;

            if (productImage && !productImage.match(/^https?:\/\//)) {
                productImage = productImage.startsWith('/') ? `${API_BASE_URL}${productImage}` : `${API_BASE_URL}/${productImage}`;
            }

            const message = `I'm ready to pay for this now, is it still available?\n\nProduct: ${productDescription}`;
            const encodedMessage = encodeURIComponent(message);
            const encodedProductImage = encodeURIComponent(productImage);
            const encodedRecipientUsername = encodeURIComponent(recipientUsername);
            const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);
            const encodedProductDescription = encodeURIComponent(productDescription);

            const chatUrl = `Chats.html?user_id=${currentLoggedInUser}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}&product_id=${postId}&product_name=${encodedProductDescription}`;
            window.location.href = chatUrl;
            return;
        }

        if (target.classList.contains('buy-now-button')) {
            event.preventDefault();
            if (!currentLoggedInUser) {
                redirectToLogin();
                return;
            }
            const postId = target.dataset.postId;
            if (!postId) {
                console.error("Post ID is missing");
                showToast('Error: Post ID not found.', '#dc3545');
                return;
            }

            const postElement = target.closest('.post') || target.closest('.promoted-post');
            const recipientUsername = postElement.querySelector('.post-user-name')?.textContent ||
                                     postElement.querySelector('.promoted-user-name')?.textContent || 'Unknown';
            const recipientProfilePictureUrl = postElement.querySelector('.post-avatar')?.src ||
                                              postElement.querySelector('.promoted-avatar')?.src || '/salmart-192x192.png';

            const productData = {
                postId: postId,
                productImage: target.dataset.productImage || '',
                productTitle: target.dataset.productTitle || '',
                productDescription: target.dataset.productDescription || '',
                productLocation: target.dataset.productLocation || '',
                productCondition: target.dataset.productCondition || '',
                productPrice: target.dataset.productPrice || '',
                sellerId: target.dataset.sellerId || '',
                recipient_username: encodeURIComponent(recipientUsername),
                recipient_profile_picture_url: encodeURIComponent(recipientProfilePictureUrl)
            };

            const queryParams = new URLSearchParams(productData).toString();
            window.location.href = `checkout.html?${queryParams}`;
            return;
        }

        if (target.classList.contains('follow-button') && target.dataset.userId) {
            const userIdToFollow = target.dataset.userId;
            if (!authToken || !currentLoggedInUser) {
                redirectToLogin();
                return;
            }

            const isCurrentlyFollowing = currentFollowingList.includes(userIdToFollow);
            window.updateFollowButtonsUI(userIdToFollow, !isCurrentlyFollowing);

            try {
                await salmartCache.toggleFollow(userIdToFollow, isCurrentlyFollowing);

                if (isCurrentlyFollowing) {
                    currentFollowingList = currentFollowingList.filter(id => id !== userIdToFollow);
                } else {
                    currentFollowingList.push(userIdToFollow);
                }
                showToast('Follow status updated!', '#28a745');
            } catch (error) {
                console.error('Follow/Unfollow error:', error);
                showToast(error.message || 'Failed to update follow status.', '#dc3545');
                window.updateFollowButtonsUI(userIdToFollow, isCurrentlyFollowing); // Revert UI on error
            }
            return;
        }

        // Post Options Menu Toggle
        if (target.classList.contains('post-options-button')) {
            const menu = target.nextElementSibling;
            if (menu && menu.classList.contains('post-options-menu')) {
                menu.classList.toggle('active');
                event.stopPropagation();
            }
            return;
        }

        if (target.classList.contains('delete-post-button')) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (target.classList.contains('reply-button') && target.dataset.postId) {
            window.location.href = `product.html?postId=${target.dataset.postId}`;
            return;
        }

        if (target.classList.contains('edit-post-button')) {
            if (!currentLoggedInUser) {
                redirectToLogin();
                return;
            }
            const postId = target.dataset.postId;
            const postType = target.dataset.postType;
            window.location.href = `Ads.html?edit=true&postId=${postId}&postType=${postType}`;
            return;
        }
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
    isAuthReady = true;
    console.log('App initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
    await fetchInitialPosts(currentCategory, true);
}

window.fetchPosts = fetchInitialPosts;

window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
    if (window.videoIntersectionObserver) {
        postsContainer.querySelectorAll('.post-video').forEach(video => {
            window.videoIntersectionObserver.unobserve(video);
        });
    }
});
