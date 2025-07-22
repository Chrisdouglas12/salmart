// main.js
import { salmartCache } from './salmartCache.js';


const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';

document.addEventListener('DOMContentLoaded', async function () {
    let currentLoggedInUser = localStorage.getItem('userId');
    let currentFollowingList = [];
    let isAuthReady = false;
    let currentPage = 1;
    let currentCategory = 'all';
    let isLoading = false;
    let suggestionCounter = 0;
    const promotedPostIdsInserted = new Set();

    // Initialize Socket.IO
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
        showToast('Failed to connect to real-time updates. Some features may be delayed.', '#dc3545');
    });

    // Listen for profile picture updates
    socket.on('profilePictureUpdate', ({ userId, profilePicture }) => {
        console.log(`Received profile picture update for user ${userId}`);
        updateProfilePictures(userId, profilePicture);
    });

    function showToast(message, bgColor = '#333') {
        const toast = document.querySelector('.toast-message') || document.createElement('div');
        if (!toast.parentNode) {
            toast.className = 'toast-message';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.backgroundColor = bgColor;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
    window.showToast = showToast; // Expose showToast globally

    async function fetchFollowingList() {
        if (!currentLoggedInUser) {
            console.log("No logged-in user to fetch following list for.");
            return [];
        }
        const token = localStorage.getItem('authToken');
        if (!token) return [];

        try {
            const response = await fetch(`${API_BASE_URL}/api/is-following-list`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const { following } = await response.json();
                return [...new Set(following.map(user => user._id.toString()))] || [];
            } else {
                console.warn('Could not fetch following list. Status:', response.status);
                showToast('Failed to fetch following list.', '#dc3545');
                return [];
            }
        } catch (error) {
            console.error('Error fetching following list:', error);
            showToast('Error fetching following list.', '#dc3545');
            return [];
        }
    }

    async function fetchUserSuggestions() {
        if (!currentLoggedInUser) {
            console.log("Cannot fetch user suggestions: User not logged in.");
            return [];
        }
        const token = localStorage.getItem('authToken');
        if (!token) return [];

        try {
            const response = await fetch(`${API_BASE_URL}/api/user-suggestions`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const { suggestions } = await response.json();
                return suggestions.filter(user => !currentFollowingList.includes(user._id.toString()));
            } else {
                console.warn('Could not fetch user suggestions. Status:', response.status);
                showToast('Failed to fetch user suggestions.', '#dc3545');
                return [];
            }
        } catch (error) {
            console.error('Error fetching user suggestions:', error);
            showToast('Error fetching user suggestions.', '#dc3545');
            return [];
        }
    }

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

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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

    // Function to update profile pictures in the UI
    function updateProfilePictures(userId, profilePicture) {
        const cacheBustedUrl = `${profilePicture}?v=${Date.now()}`;
        document.querySelectorAll(`img.post-avatar[data-user-id="${userId}"], img.promoted-avatar[data-user-id="${userId}"], img.user-suggestion-avatar[data-user-id="${userId}"]`).forEach(img => {
            img.src = cacheBustedUrl;
            img.onerror = () => { img.src = '/salmart-192x192.png'; };
        });
    }

    function renderUserSuggestion(user) {
        const suggestionElement = document.createElement('div');
        suggestionElement.classList.add('user-suggestion-card');
        const isFollowingUser = currentFollowingList.includes(user._id.toString());
        suggestionElement.innerHTML = `
            <a href="Profile.html?userId=${user._id}" class="user-info-link">
                <img src="${user.profilePicture || '/salmart-192x192.png'}?v=${Date.now()}" alt="${escapeHtml(user.name)}'s profile picture" class="user-suggestion-avatar" data-user-id="${user._id}" onerror="this.src='/salmart-192x192.png'">
                <h5 class="user-suggestion-name">${escapeHtml(user.name)}</h5>
            </a>
            <button class="follow-button user-suggestion-follow-btn" data-user-id="${user._id}" ${isFollowingUser ? 'disabled' : ''}>
                ${isFollowingUser ? '<i class="fas fa-user-check"></i> Following' : '<i class="fas fa-user-plus"></i> Follow'}
            </button>
        `;

        return suggestionElement;
    }

    function createUserSuggestionsContainer(users) {
        if (!users || users.length === 0) {
            return null;
        }

        const wrapperContainer = document.createElement('div');
        wrapperContainer.classList.add('user-suggestions-wrapper');
        wrapperContainer.style.cssText = `
            margin-bottom: 20px;
            padding: 15px;
            background-color: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        `;

        const headerElement = document.createElement('h3');
        headerElement.textContent = 'Suggested People to Follow';
        headerElement.style.cssText = `
            font-size: 1.1em;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
            text-align: center;
        `;
        wrapperContainer.appendChild(headerElement);

        const cardsPerRow = 8;

        for (let i = 0; i < users.length; i += cardsPerRow) {
            const rowContainer = document.createElement('div');
            rowContainer.classList.add('user-suggestions-row');
            rowContainer.style.cssText = `
                display: flex;
                overflow-x: auto;
                gap: 15px;
                padding-bottom: 10px;
                scroll-snap-type: x mandatory;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
                margin-bottom: ${i + cardsPerRow < users.length ? '10px' : '0'};
            `;
            rowContainer.style.setProperty('-webkit-scrollbar', 'none');
            rowContainer.style.setProperty('-ms-overflow-style', 'none');

            const currentRowUsers = users.slice(i, i + cardsPerRow);
            currentRowUsers.forEach(user => {
                const userCard = renderUserSuggestion(user);
                userCard.style.flex = '0 0 auto';
                userCard.style.width = '150px';
                userCard.style.textAlign = 'center';
                userCard.style.scrollSnapAlign = 'start';
                userCard.style.backgroundColor = '#f0f2f5';
                userCard.style.padding = '10px';
                userCard.style.borderRadius = '8px';
                userCard.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';

                userCard.querySelector('.user-suggestion-avatar').style.cssText = `
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    object-fit: cover;
                    margin-bottom: 8px;
                    border: 2px solid #ddd;
                `;
                userCard.querySelector('.user-suggestion-name').style.cssText = `
                    font-weight: bold;
                    margin-bottom: 5px;
                    color: #333;
                    font-size: 0.9em;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: block;
                `;
                userCard.querySelector('.user-info-link').style.cssText = `
                    text-decoration: none;
                    color: inherit;
                    display: block;
                `;
                userCard.querySelector('.user-suggestion-follow-btn').style.cssText = `
                    background-color: #28a745;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 0.85em;
                    width: 90%;
                    margin-top: 5px;
                    transition: background-color 0.2s ease;
                `;
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
        postElement.dataset.userId = post.createdBy ? post.createdBy.userId : ''; // For profile picture updates

        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

        let mediaContent = '';
        let productDetails = '';
        let buttonContent = '';

        const productImageForChat = post.photo || '/salmart-192x192.png';

        mediaContent = `
            <img src="${productImageForChat}?v=${Date.now()}" class="promoted-image" alt="Promoted Product" onerror="this.src='/salmart-192x192.png'">
        `;
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
                    <button class="promoted-cta-button buy-now-button" data-post-id="${post._id || ''}"
                        data-product-image="${productImageForChat}"
                        data-product-title="${escapeHtml(post.title || 'Untitled Product')}"
                        data-product-description="${escapeHtml(post.description || 'No description available.')}"
                        data-product-location="${escapeHtml(post.location || 'N/A')}"
                        data-product-condition="${escapeHtml(post.productCondition || 'N/A')}"
                        data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}"
                        data-seller-id="${post.createdBy ? post.createdBy.userId : ''}"
                        ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold' : 'Buy'}
                    </button>
                    <button class="promoted-cta-button send-message-btn"
                        data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                        data-product-image="${productImageForChat}"
                        data-product-description="${escapeHtml(post.title || '')}"
                        data-post-id="${post._id || ''}"
                        ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-paper-plane"></i> ${post.isSold ? 'Unavailable' : 'Message'}
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
                <img src="${post.createdBy?.profilePicture || '/salmart-192x192.png'}?v=${Date.now()}" class="promoted-avatar" data-user-id="${post.createdBy?.userId || ''}" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
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
        return postElement;
    }

    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';
        postElement.dataset.sellerId = post.createdBy ? post.createdBy.userId : '';
        postElement.dataset.userId = post.createdBy ? post.createdBy.userId : ''; // For profile picture updates

        const isFollowing = currentFollowingList.includes(post.createdBy?.userId?.toString());
        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

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
                <a href="${post.productLink || '#'}" class="checkout-product-btn" aria-label="Check out product ${post.description || 'product'}" ${!post.productLink ? 'disabled' : ''}>
                    <i class="fas fa-shopping-cart"></i> Check Out Product
                </a>
            `;
        } else {
            descriptionContent = `
                <h2 class="product-title">${escapeHtml(post.title || 'No description')}</h2>
                <div class="post-description-text" style="margin-bottom: 10px; padding: 0 15px;">
                    <p>${escapeHtml(post.description || '')}</p>
                </div>
            `;
            mediaContent = `
                <div class="product-image">
                    <div class="badge">${post.productCondition || 'New'}</div>
                    <img src="${productImageForChat}?v=${Date.now()}" class="post-image" onclick="window.openImage('${productImageForChat.replace(/'/g, "\\'")}')" alt="Product Image" onerror="this.src='/salmart-192x192.png'">
                </div>
            `;
            productDetails = `
                <div class="content">
                    <div class="details-grid">
                        <div class="detail-item">
                            <div class="detail-icon price-icon">₦</div>
                            <div class="detail-text">
                                <div class="detail-label">Price</div>
                                <div class="detail-value price-value">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</div>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-icon location-icon">📍</div>
                            <div class="detail-text">
                                <div class="detail-label">Location</div>
                                <div class="detail-value location-value">${escapeHtml(post.location || 'N/A')}</div>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-icon condition-icon">✨</div>
                            <div class="detail-text">
                                <div class="detail-label">Condition</div>
                                <div class="detail-value">${escapeHtml(post.productCondition || 'N/A')}</div>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-icon category-icon">📦</div>
                            <div class="detail-text">
                                <div class="detail-label">Category</div>
                                <div class="detail-value">${escapeHtml(post.category || 'N/A')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            if (currentLoggedInUser) {
                if (isPostCreator) {
                    buttonContent = !post.isPromoted ? `
                        <div class="actions">
                            <button 
                                class="btn btn-primary promote-button" 
                                data-post-id="${post._id || ''}" 
                                aria-label="Promote this post" 
                                ${post.isSold ? 'disabled title="Cannot promote sold out post"' : ''}
                            >
                                ${post.isSold ? 'Sold Out' : 'Promote Post'}
                            </button>
                        </div>
                    ` : '';
                } else {
                    buttonContent = `
                        <div class="actions">
                            <button class="btn btn-secondary send-message-btn"
                                data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                                data-product-image="${productImageForChat}"
                                data-product-description="${escapeHtml(post.title || '')}"
                                data-post-id="${post._id || ''}"
                                ${post.isSold ? 'disabled' : ''}> <i class="fas fa-paper-plane"></i>
                                ${post.isSold ? 'Unavailable' : 'Message'}
                            </button>
                            <button class="btn btn-primary buy-now-button"
                                    data-post-id="${post._id || ''}"
                                    data-product-image="${productImageForChat}"
                                    data-product-title="${escapeHtml(post.title || 'Untitled Product')}"
                                    data-product-description="${escapeHtml(post.description || 'No description available.')}"
                                    data-product-location="${escapeHtml(post.location || 'N/A')}"
                                    data-product-condition="${escapeHtml(post.productCondition || 'N/A')}"
                                    data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}"
                                    data-seller-id="${post.createdBy ? post.createdBy.userId : ''}"
                                    ${post.isSold ? 'disabled' : ''}> <i class="fas fa-shopping-cart"></i>
                                ${post.isSold ? 'Sold Out' : 'Buy Now'}
                            </button>
                        </div>
                    `;
                }
            } else {
                buttonContent = `
                    <div class="actions">
                        <button class="btn btn-secondary login-required" onclick="redirectToLogin()">
                            Message
                        </button>
                        <button class="btn btn-primary login-required" onclick="redirectToLogin()">
                            Buy Now
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
                    <i class="fas fa-share"></i>
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
                    <i class="fas fa-share"></i>
                </button>
            </div>
        `;

        postElement.innerHTML = `
            <div class="post-header">
                <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                    <img src="${post.createdBy?.profilePicture || '/salmart-192x192.png'}?v=${Date.now()}" class="post-avatar" data-user-id="${post.createdBy?.userId || ''}" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
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
                                <li><button class="delete-post-button" data-post-id="${post._id || ''}" type="button">Delete Post</button></li>
                                <li><button class="edit-post-button" data-post-id="${post._id || ''}" data-post-type="${post.postType || 'regular'}" type="button">Edit Post</button></li>
                            ` : ''}
                            <li><button class "report-post-button" data-post-id="${post._id || ''}" type="button">Report Post</button></li>
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

        return postElement;
    }

    function createPromotedPostFiller() {
        const fillerElement = document.createElement('div');
        fillerElement.classList.add('promoted-post-filler');
        fillerElement.style.cssText = `
            flex: 0 0 auto;
            width: calc((100% / 5) - 12px);
            min-width: 200px;
            background: #28a745;
            border-radius: 8px;
            padding: 20px;
            color: white;
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
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                margin-top: 10px;
                cursor: pointer;
                font-size: 0.8em;
                transition: all 0.3s ease;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'"
               onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                Browse All
            </button>
        `;

        return fillerElement;
    }

    function createPromotedPostsRow(posts) {
        const wrapperContainer = document.createElement('div');
        wrapperContainer.classList.add('promoted-posts-wrapper');
        wrapperContainer.style.cssText = `
            margin-bottom: 20px;
        `;

        const headerElement = document.createElement('div');
        headerElement.classList.add('promoted-posts-header');
        headerElement.innerHTML = '<h3>Suggested products for you</h3>';
        headerElement.style.cssText = `
            font-size: 16px;
            color: #333;
            margin-bottom: 0;
            background-color: #fff;
        `;

        const rowContainer = document.createElement('div');
        rowContainer.classList.add('promoted-posts-row-container');
        rowContainer.style.cssText = `
            display: flex;
            overflow-x: auto;
            gap: 15px;
            padding: 10px 0;
            background-color: #f9f9f9;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            position: relative;
            scrollbar-width: none;
        `;
        rowContainer.style.setProperty('-webkit-scrollbar', 'none');
        rowContainer.style.setProperty('-ms-overflow-style', 'none');

        const postsToRender = posts.filter(post => !promotedPostIdsInserted.has(post._id));

        postsToRender.forEach(post => {
            const postElement = renderPromotedPost(post);
            postElement.style.flex = '0 0 auto';
            postElement.style.width = `calc((100% / 5) - 12px)`;
            postElement.style.minWidth = '200px';
            postElement.style.scrollSnapAlign = 'start';
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

    async function fetchPostsByCategory(category = currentCategory, page = currentPage, clearExisting = false) {
        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            console.error('Posts container not found.');
            showToast('Error: Page layout issue. Please refresh.', '#dc3545');
            return;
        }

        if (isLoading && !clearExisting) {
            console.log('Posts are already loading. Skipping new request (unless clearing).');
            return;
        }
        isLoading = true;

        if (clearExisting) {
            if (window.videoObserver) {
                postsContainer.querySelectorAll('.post-video-container').forEach(container => {
                    window.videoObserver.unobserve(container);
                });
            }
            postsContainer.innerHTML = '';
            suggestionCounter = 0;
            promotedPostIdsInserted.clear();
        }

        try {
            const allPosts = await salmartCache.getPostsByCategory(category);

            if (!Array.isArray(allPosts) || allPosts.length === 0) {
                if (postsContainer.children.length === 0) {
                    postsContainer.innerHTML = `
                        <p style="text-align: center; padding: 20px; color: #666;">
                            No posts yet for "${category === 'all' ? 'this category' : category}".
                            Try a different category or create one!
                        </p>
                    `;
                }
                isLoading = false;
                return;
            }

            const sortedPosts = [...allPosts].sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            const availablePromotedPosts = sortedPosts.filter(post => post.isPromoted && post.postType !== 'video_ad');
            const nonPromotedPosts = sortedPosts.filter(post => !post.isPromoted || post.postType === 'video_ad');

            availablePromotedPosts.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            const postsBeforeSuggestion = 5;
            const usersPerSuggestionRow = 8;
            const promotedPostsPerInsert = 5;
            const normalPostsBeforePromotedRow = 2;

            const fragment = document.createDocumentFragment();

            let allUserSuggestions = [];
            if (currentLoggedInUser && clearExisting) {
                allUserSuggestions = await fetchUserSuggestions();
            }

            const initialPromotedPosts = availablePromotedPosts.filter(post => !promotedPostIdsInserted.has(post._id)).slice(0, promotedPostsPerInsert);

            if (initialPromotedPosts.length > 0) {
                const promotedRow = createPromotedPostsRow(initialPromotedPosts);
                fragment.appendChild(promotedRow);
            }

            let normalPostCount = 0;
            let promotedPostsInsertedIndex = initialPromotedPosts.length;
            const videoContainersToObserve = [];

            for (let i = 0; i < nonPromotedPosts.length; i++) {
                const post = nonPromotedPosts[i];
                const postElement = renderPost(post);
                fragment.appendChild(postElement);
                normalPostCount++;

                if (post.postType === 'video_ad') {
                    const videoContainer = postElement.querySelector('.post-video-container');
                    if (videoContainer) {
                        videoContainersToObserve.push(videoContainer);
                        if (window.initializeVideoControls) {
                            window.initializeVideoControls(postElement);
                        }
                    }
                }

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
                postsContainer.innerHTML = '<p style="text-align: center; margin: 2rem;">No posts available.</p>';
            }

            if (window.videoObserver) {
                videoContainersToObserve.forEach(container => {
                    window.videoObserver.observe(container);
                });
            }

            window.dispatchEvent(new Event('postsRendered'));

        } catch (error) {
            console.error('Error fetching posts:', error);
            if (!postsContainer.children.length) {
                postsContainer.innerHTML = `
                    <p style="text-align: center; color: red; padding: 20px;">
                        Error loading posts. Please check your internet connection or try again later.
                        <br>Error: ${error.message || 'Unknown error'}
                    </p>
                `;
            }
            showToast('Failed to load posts. Please try again.', '#dc3545');
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

    document.addEventListener('click', async (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        const authToken = localStorage.getItem('authToken');
        const loggedInUser = localStorage.getItem('userId');

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
            const recipientId = target.dataset.recipientId;
            const postElement = target.closest('.post') || target.closest('.promoted-post');

            if (!postElement) {
                console.error("Could not find parent post element for send message button.");
                showToast('Error: Post information not found.', '#dc3545');
                return;
            }

            const recipientUsername = postElement.querySelector('.post-user-name')?.textContent || postElement.querySelector('.promoted-user-name')?.textContent || 'Unknown';
            const recipientProfilePictureUrl = postElement.querySelector('.post-avatar')?.src || postElement.querySelector('.promoted-avatar')?.src || '/salmart-192x192.png';
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

            const chatUrl = `Chats.html?user_id=${loggedInUser}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}&product_id=${postId}&product_name=${encodedProductDescription}`;
            window.location.href = chatUrl;
            return;
        }

        if (target.classList.contains('buy-now-button')) {
            event.preventDefault();
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
            if (!authToken || !loggedInUser) {
                showToast('Please log in to follow users.', '#dc3545');
                return;
            }

            const isCurrentlyFollowing = target.textContent.includes('Following');
            window.updateFollowButtonsUI(userIdToFollow, !isCurrentlyFollowing);

            try {
                const endpoint = isCurrentlyFollowing ? `${API_BASE_URL}/unfollow/${userIdToFollow}` : `${API_BASE_URL}/follow/${userIdToFollow}`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`,
                    },
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to update follow status');
                }

                const data = await response.json();
                if (isCurrentlyFollowing) {
                    currentFollowingList = currentFollowingList.filter(id => id !== userIdToFollow);
                } else {
                    currentFollowingList.push(userIdToFollow);
                }
                window.updateFollowButtonsUI(userIdToFollow, !isCurrentlyFollowing);
                showToast(data.message || 'Follow status updated!', '#28a745');
            } catch (error) {
                console.error('Follow/Unfollow error:', error);
                showToast(error.message || 'Failed to update follow status.', '#dc3545');
                window.updateFollowButtonsUI(userIdToFollow, isCurrentlyFollowing);
            }
            return;
        }
    });

    async function initializeAppData() {
        if (isAuthReady) return;

        if (!currentLoggedInUser) {
            currentLoggedInUser = localStorage.getItem('userId');
        }

        if (currentLoggedInUser) {
            currentFollowingList = await fetchFollowingList();
            socket.emit('join', `user_${currentLoggedInUser}`);
        }
        isAuthReady = true;
        console.log('App initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
        await fetchPostsByCategory(currentCategory, currentPage, true);
    }

    window.fetchPosts = fetchPostsByCategory;

    document.addEventListener('authStatusReady', async (event) => {
        if (!isAuthReady || currentLoggedInUser !== event.detail.loggedInUser) {
            currentLoggedInUser = event.detail.loggedInUser;
            console.log('Auth status ready event received. Logged in user:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
            if (currentLoggedInUser) {
                socket.emit('join', `user_${currentLoggedInUser}`);
            }
            await initializeAppData();
        }
    });

    initializeAppData();

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (!isLoading) {
                currentPage++;
                fetchPostsByCategory(currentCategory, currentPage, false);
            }
        });
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        socket.disconnect();
    });
});