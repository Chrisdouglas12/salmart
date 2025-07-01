import { salmartCache } from './salmartCache.js';

document.addEventListener('DOMContentLoaded', async function () {
    let currentLoggedInUser = null;
    let currentFollowingList = [];
    let isAuthReady = false; // Flag to ensure auth status is resolved before initial fetch

    // --- State variables for pagination/filtering ---
    // let userIdToFollow; // This variable seems unused, consider removing if not needed.
    let currentPage = 1;
    let currentCategory = 'all';
    let isLoading = false; // To prevent multiple simultaneous fetches
    let postCounter = 0; // Counter for normal posts to inject suggestions

    // Derive API_BASE_URL once at the start of DOMContentLoaded
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');

    // --- Helper Functions ---

    /**
     * Fetches the list of users that the currentLoggedInUser is following.
     * @returns {Array<string>} An array of user IDs (as strings) that the current user follows.
     */
    async function fetchFollowingList() {
        if (!currentLoggedInUser) {
            console.log("No logged-in user to fetch following list for.");
            return [];
        }
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log("No auth token found for fetching following list.");
            return [];
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/is-following-list`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const { following } = await response.json();
                // Ensure unique IDs and convert to string for consistent comparison
                return [...new Set(following.map(id => id.toString()))] || [];
            } else {
                console.warn(`Could not fetch following list. Status: ${response.status}`, await response.text());
                return [];
            }
        } catch (error) {
            console.error('Error fetching following list:', error);
            return [];
        }
    }

    /**
     * Fetches suggestions for users to follow.
     * @returns {Array<Object>} An array of user suggestion objects.
     */
    async function fetchUserSuggestions() {
        if (!currentLoggedInUser) {
            console.log("Cannot fetch user suggestions: User not logged in.");
            return [];
        }
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log("No auth token found for fetching user suggestions.");
            return [];
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/user-suggestions`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const { suggestions } = await response.json();
                // Filter out users already in currentFollowingList (ids are strings)
                return suggestions.filter(user => !currentFollowingList.includes(user._id.toString()));
            } else {
                console.warn(`Could not fetch user suggestions. Status: ${response.status}`, await response.text());
                return [];
            }
        } catch (error) {
            console.error('Error fetching user suggestions:', error);
            return [];
        }
    }

    /**
     * Formats a timestamp into a human-readable string (e.g., "5m", "2d", "Jan 1").
     * @param {string|Date} timestamp - The timestamp to format.
     * @returns {string} The formatted time string.
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
     * @returns {string} The HTML-escaped string.
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Updates the UI for all follow buttons on the page for a given user ID.
     * This function is exposed globally for use from other scripts if needed.
     * @param {string} userId - The ID of the user whose follow buttons need to be updated.
     * @param {boolean} isFollowing - True if the user is now followed, false if unfollowed.
     */
    window.updateFollowButtonsUI = function(userId, isFollowing) {
        document.querySelectorAll(`.follow-button[data-user-id="${userId}"]`).forEach(button => {
            if (isFollowing) {
                button.innerHTML = '<i class="fas fa-user-check"></i> Following';
                button.style.backgroundColor = '#fff';
                button.style.color = '#28a745';
                button.disabled = true; // Disable if already following
            } else {
                button.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                button.style.backgroundColor = ''; // Reset to default/CSS
                button.style.color = ''; // Reset to default/CSS
                button.disabled = false;
            }
        });
    };

    // --- Render Functions ---

    /**
     * Renders a single user suggestion card.
     * @param {Object} user - The user object to render.
     * @returns {HTMLElement} The created DOM element for the user suggestion.
     */
    function renderUserSuggestion(user) {
        const suggestionElement = document.createElement('div');
        suggestionElement.classList.add('user-suggestion-card');
        const isFollowingUser = currentFollowingList.includes(user._id.toString());
        suggestionElement.innerHTML = `
            <a href="Profile.html?userId=${user._id}" class="user-info-link">
                <img src="${user.profilePicture || '/salmart-192x192.png'}" alt="${escapeHtml(user.name)}'s profile picture" class="user-suggestion-avatar" onerror="this.src='/salmart-192x192.png'">
                <h5 class="user-suggestion-name">${escapeHtml(user.name)}</h5>
            </a>
            <button class="follow-button user-suggestion-follow-btn" data-user-id="${user._id}" ${isFollowingUser ? 'disabled' : ''}>
                ${isFollowingUser ? '<i class="fas fa-user-check"></i> Following' : '<i class="fas fa-user-plus"></i> Follow'}
            </button>
        `;

        return suggestionElement;
    }

    /**
     * Creates a container for user suggestions, arranged in rows.
     * @param {Array<Object>} users - An array of user objects to suggest.
     * @returns {HTMLElement|null} The created container element, or null if no users.
     */
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
                -webkit-scrollbar: none; /* Hide scrollbar for WebKit */
                -ms-overflow-style: none; /* Hide scrollbar for IE/Edge */
                scrollbar-width: none; /* Hide scrollbar for Firefox */
                margin-bottom: ${i + cardsPerRow < users.length ? '10px' : '0'};
            `;

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

    /**
     * Renders a single promoted post element.
     * @param {Object} post - The post object to render.
     * @returns {HTMLElement} The created DOM element for the promoted post.
     */
    function renderPromotedPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('promoted-post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';

        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

        let mediaContent = '';
        let productDetails = '';
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
            mediaContent = `
                <div class="promoted-video-container">
                    <video class="promoted-video" preload="metadata" muted aria-label="Promoted video ad for ${(post.description || 'product').replace(/"/g, '&quot;')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
                        <source src="${post.video || ''}" type="video/mp4" />
                        Your browser does not support the video tag.
                    </video>
                    <div class="promoted-video-overlay">
                        <button class="promoted-play-btn">
                            <i class="fas fa-play"></i>
                        </button>
                    </div>
                </div>
            `;
            productDetails = `
                <div class="promoted-product-info">
                    <h4 class="promoted-title">${escapeHtml(post.description || 'No description')}</h4>
                </div>
            `;
            if (currentLoggedInUser && !isPostCreator) {
                buttonContent = `
                    <button class="promoted-cta-button buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                    </button>
                     <button class="promoted-cta-button send-message-btn"
                        data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                        data-product-image="${productImageForChat}"
                        data-product-description="${escapeHtml(post.description || '')}"
                        data-post-id="${post._id || ''}"
                        ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-paper-plane"></i> ${post.isSold ? 'Unavailable' : 'Message Seller'}
                    </button>
                `;
            } else if (!currentLoggedInUser) {
                buttonContent = `
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-shopping-cart"></i> Buy Now
                    </button>
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-circle-dot"></i> Message Seller
                    </button>
                `;
            } else { // Current user is the creator
                buttonContent = `
                    <a href="${post.productLink || '#'}" class="promoted-cta-button" aria-label="Check out product ${escapeHtml(post.description || 'product')}" ${!post.productLink ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                        <i class="fas fa-shopping-cart"></i> Check Out Product
                    </a>
                `;
            }
        } else {
            mediaContent = `
                <img src="${productImageForChat}" class="promoted-image" alt="Promoted Product" onerror="this.src='/salmart-192x192.png'">
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
                    <button class="promoted-cta-button buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                    </button>
                    <button class="promoted-cta-button send-message-btn"
                        data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                        data-product-image="${productImageForChat}"
                        data-product-description="${escapeHtml(post.title || '')}"
                        data-post-id="${post._id || ''}"
                        ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-circle-dot"></i> ${post.isSold ? 'Unavailable' : 'Message Seller'}
                    </button>
                `;
            } else if (!currentLoggedInUser) {
                buttonContent = `
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-shopping-cart"></i> Buy Now
                    </button>
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-paper-plane"></i> Message Seller
                    </button>
                `;
            }
        }

        postElement.innerHTML = `
            <div class="promoted-badge">
                <i class="fas fa-bullhorn"></i>
                <span>Promoted</span>
            </div>
            <div class="promoted-header">
                <img src="${post.profilePicture || '/salmart-192x192.png'}" class="promoted-avatar" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
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

    /**
     * Renders a single normal (non-promoted) post element.
     * @param {Object} post - The post object to render.
     * @returns {HTMLElement} The created DOM element for the post.
     */
    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';

        const isFollowing = currentFollowingList.includes(post.createdBy?.userId?.toString());
        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

        let mediaContent = '';
        let productDetails = '';
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
            mediaContent = `
                <div class="product-image">
                    <div class="badge">New</div>
                    <video class="post-video" preload="metadata" aria-label="Video ad for ${(post.description || 'product').replace(/"/g, '&quot;')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
                        <source src="${post.video || ''}" type="video/mp4" />
                        <source src="${post.video ? post.video.replace('.mp4', '.webm') : ''}" type="video/webm" />
                        <source src="${post.video ? post.video.replace('.mp4', '.ogg') : ''}" type="video/ogg" />
                        Your browser does not support the video tag.
                    </video>
                </div>
            `;
            productDetails = `
                <div class="content">
                    <h2 class="product-title">${escapeHtml(post.description || 'No description')}</h2>
                </div>
            `;
            buttonContent = `
                <div class="actions">
                    <button class="btn btn-primary checkout-product-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                        ${post.isSold ? 'Sold Out' : 'Check Out Product'}
                    </button>
                </div>
            `;
        } else {
            mediaContent = `
                <div class="product-image">
                    <div class="badge">${post.productCondition || 'New'}</div>
                    <img src="${productImageForChat}" class="post-image" onclick="window.openImage('${productImageForChat.replace(/'/g, "\\'")}')" alt="Product Image" onerror="this.src='/salmart-192x192.png'">
                </div>
            `;
            productDetails = `
                <div class="content">
                    <h2 class="product-title">${escapeHtml(post.title || 'No description')}</h2>

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
                            <button class="btn btn-primary promote-button" data-post-id="${post._id || ''}" aria-label="Promote this post">
                                Promote Post
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
                                ${post.isSold ? 'disabled' : ''}>
                                ${post.isSold ? 'Unavailable' : 'Message'}
                            </button>
                            <button class="btn btn-primary buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
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
                    followButtonHtml = ''; // Don't show follow button for self
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
                    <img src="${post.profilePicture || '/salmart-192x192.png'}" class="post-avatar" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
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
                                <li><button class="edit-post-button" data-post-id="${post._id || ''}" type="button">Edit Post</button></li>
                            ` : ''}
                            <li><button class="report-post-button" data-post-id="${post._id || ''}" type="button">Report Post</button></li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="product-container">
                <div class="product-card">
                    ${productDetails}
                </div>
                <div class="media-card">
                    ${mediaContent}
                </div>
            </div>

            <div class="buy" style="text-align: center">
                ${buttonContent}
            </div>

            ${postActionsHtml}
        `;
        return postElement;
    }

    /**
     * Creates a placeholder filler element for promoted posts rows.
     * @returns {HTMLElement} The created filler DOM element.
     */
    function createPromotedPostFiller() {
        const fillerElement = document.createElement('div');
        fillerElement.classList.add('promoted-post-filler');
        fillerElement.style.cssText = `
            flex: 0 0 auto;
            width: calc((100% / 5) - 12px);
            min-width: 200px;
            background: linear-gradient(135deg, #28a745, #218838, #1e7e34);
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

    /**
     * Creates a row container for promoted posts.
     * @param {Array<Object>} posts - An array of promoted post objects.
     * @returns {HTMLElement} The created container element for promoted posts.
     */
    function createPromotedPostsRow(posts) {
        const wrapperContainer = document.createElement('div');
        wrapperContainer.classList.add('promoted-posts-wrapper');
        wrapperContainer.style.cssText = `
            margin-bottom: 20px;
        `;

        const headerElement = document.createElement('div');
        headerElement.classList.add('promoted-posts-header');
        headerElement.innerHTML = '<h3>Things you may like</h3>';
        headerElement.style.cssText = `
            font-size: 1.1em;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
            padding: 15px;
            background-color: #fff;
            border-radius: 8px 8px 0 0;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
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
            -webkit-scrollbar: none; /* Hide scrollbar for WebKit */
            -ms-overflow-style: none; /* Hide scrollbar for IE/Edge */
            scrollbar-width: none; /* Hide scrollbar for Firefox */
        `;

        posts.forEach(post => {
            const postElement = renderPromotedPost(post);
            postElement.style.flex = '0 0 auto';
            postElement.style.width = `calc((100% / 5) - 12px)`; // Adjusted for 5 items per row with gap
            postElement.style.minWidth = '200px';
            postElement.style.scrollSnapAlign = 'start';
            rowContainer.appendChild(postElement);
        });

        // Add filler elements if there are fewer than 5 promoted posts
        const fillerCount = Math.max(0, 5 - posts.length);
        for (let i = 0; i < fillerCount; i++) {
            const fillerElement = createPromotedPostFiller();
            rowContainer.appendChild(fillerElement);
        }

        wrapperContainer.appendChild(headerElement);
        wrapperContainer.appendChild(rowContainer);

        // This line is redundant as rowContainer already has 'position: relative' in its style
        // rowContainer.style.position = 'relative';

        return wrapperContainer;
    }

    // --- Main Post Loading Logic ---

    /**
     * Fetches posts by category and renders them to the UI.
     * This is the function that was likely intended to be called `fetchPostsByCategory`.
     * @param {string} category - The category to fetch posts for.
     * @param {number} page - The page number to fetch (currently not used for pagination in cache).
     * @param {boolean} clearExisting - Whether to clear existing posts before rendering new ones.
     */
    async function fetchAndRenderPosts(category = currentCategory, page = currentPage, clearExisting = false) {
        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            console.error('Posts container not found. Cannot render posts.');
            return;
        }

        if (isLoading && !clearExisting) {
            console.log('Posts are already loading. Skipping new request (unless clearing existing).');
            return;
        }
        isLoading = true;

        if (clearExisting) {
            postsContainer.innerHTML = '';
            postCounter = 0; // Reset post counter when clearing
        }

        try {
            // This is the call to your salmartCache
            const allPosts = await salmartCache.getPostsByCategory(category);

            if (!Array.isArray(allPosts) || allPosts.length === 0) {
                // Only show "No posts yet" if the container is currently empty
                if (postsContainer.children.length === 0) {
                    postsContainer.innerHTML = `
                        <p style="text-align: center; padding: 20px; color: #666;">
                            No posts yet for "${category === 'all' ? 'this category' : escapeHtml(category)}".
                            Try a different category or create one!
                        </p>
                    `;
                }
                isLoading = false;
                return;
            }

            // Sort posts by creation date, newest first
            const sortedPosts = [...allPosts].sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            const promotedPosts = sortedPosts.filter(post => post.isPromoted);
            const nonPromotedPosts = sortedPosts.filter(post => !post.isPromoted);

            // Sort promoted posts as well (they might not have been sorted if filtered first)
            promotedPosts.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            const postsBeforeSuggestion = 5; // Inject user suggestions every 5 posts
            const usersPerSuggestionRow = 8; // Number of users in one suggestion row

            const fragment = document.createDocumentFragment();

            let allUserSuggestions = [];
            // Only fetch user suggestions once on initial load/clear
            if (currentLoggedInUser && clearExisting) {
                allUserSuggestions = await fetchUserSuggestions();
            }

            // Prepend promoted posts row if available
            if (promotedPosts.length > 0) {
                const promotedRow = createPromotedPostsRow(promotedPosts);
                fragment.prepend(promotedRow);
            }

            let suggestionRowIndex = 0; // Tracks which suggestion row to pick users from
            let suggestionCounter = 0; // Tracks how many non-promoted posts have been rendered

            for (let i = 0; i < nonPromotedPosts.length; i++) {
                const post = nonPromotedPosts[i];
                const postElement = renderPost(post);
                fragment.appendChild(postElement);
                postCounter++; // Global counter (if needed for other logic)
                suggestionCounter++; // Counter for current fetch operation

                // Inject user suggestions if criteria met
                if (suggestionCounter % postsBeforeSuggestion === 0 &&
                    currentLoggedInUser &&
                    allUserSuggestions.length > 0 &&
                    suggestionRowIndex * usersPerSuggestionRow < allUserSuggestions.length) {

                    const startIndex = suggestionRowIndex * usersPerSuggestionRow;
                    const endIndex = Math.min(startIndex + usersPerSuggestionRow, allUserSuggestions.length);
                    const usersForThisRow = allUserSuggestions.slice(startIndex, endIndex);

                    if (usersForThisRow.length > 0) {
                        const userSuggestionsContainer = createUserSuggestionsContainer(usersForThisRow);
                        if (userSuggestionsContainer) {
                            fragment.appendChild(userSuggestionsContainer);
                            suggestionRowIndex++;
                        }
                    }
                }
            }

            // Clear and append or just append based on 'clearExisting'
            if (clearExisting) {
                postsContainer.innerHTML = ''; // Ensure it's truly empty before appending
                postsContainer.appendChild(fragment);
            } else {
                postsContainer.appendChild(fragment);
            }

            // Fallback for no posts if after all processing, container is empty
            if (postsContainer.children.length === 0) {
                postsContainer.innerHTML = '<p style="text-align: center; margin: 2rem; color: #666;">No posts available.</p>';
            }

            // Dispatch an event after posts are rendered, useful for other modules
            window.dispatchEvent(new Event('postsRendered'));

        } catch (error) {
            console.error('Error fetching or rendering posts:', error);
            // Display a user-friendly error message if no posts are currently displayed
            if (!postsContainer.children.length) {
                let errorMessage = 'Unknown error occurred.';
                if (error instanceof Error) {
                    errorMessage = error.message;
                } else if (typeof error === 'string') {
                    errorMessage = error;
                }

                postsContainer.innerHTML = `
                    <p style="text-align: center; color: red; padding: 20px;">
                        Error loading posts. Please check your internet connection or try again later.
                        <br>Error: ${escapeHtml(errorMessage)}
                    </p>
                `;
            }
        } finally {
            isLoading = false; // Allow new fetches
        }
    }

    // --- Global Utility Functions ---

    /**
     * Redirects the user to the login page, optionally showing a toast message.
     */
    window.redirectToLogin = function() {
        if (window.showToast) {
            window.showToast('Please log in to access this feature', 'error');
            setTimeout(() => {
                window.location.href = 'SignIn.html';
            }, 1000);
        } else {
            // Fallback if showToast is not defined
            window.location.href = 'SignIn.html';
        }
    };

    /**
     * Placeholder for opening image in a lightbox or new tab.
     * Make sure this function is defined elsewhere if `onclick="window.openImage(...)"` is used.
     */
    if (typeof window.openImage === 'undefined') {
        window.openImage = function(imageUrl) {
            console.warn('window.openImage is not defined. Opening image in new tab.');
            window.open(imageUrl, '_blank');
        };
    }

    // --- Event Delegates for Interactive Elements ---

    document.addEventListener('click', async (event) => {
        const target = event.target.closest('button, a'); // Capture clicks on buttons or links
        if (!target) return;

        const showToast = window.showToast; // Assuming showToast is globally available

        // Handle Promote Button (which is an anchor <a> or button leading to promote page)
        // Check for 'a' tag with specific class if it links directly, otherwise it's a button.
        const promoteButton = target.closest('.promote-button');
        if (promoteButton && promoteButton.dataset.postId) {
            const postId = promoteButton.dataset.postId;
            window.location.href = `promote.html?postId=${postId}`;
            return; // Exit to prevent further processing
        }

        // Handle Buy Now Button (for both normal and promoted posts)
        if (target.classList.contains('buy-now-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
            const email = localStorage.getItem('email');
            const buyerId = localStorage.getItem('userId');

            if (!email || !buyerId || !postId) {
                showToast("Please log in to make a purchase or complete your profile.", '#dc3545');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/pay`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, postId, buyerId, currency: 'NGN' }),
                });

                const result = await response.json();

                if (response.ok && result.success && result.url) {
                    window.location.href = result.url;
                } else {
                    // Check if result.message exists, otherwise provide generic error
                    const msg = result.message || 'Please try again.';
                    showToast(`Payment failed: ${msg}`, '#dc3545');
                }
            } catch (error) {
                console.error('Payment error:', error);
                showToast('Failed to process payment. Please try again.', '#dc3545');
            }
            return; // Exit to prevent further processing
        }

        // Handle Send Message Button (for both normal and promoted posts)
        if (target.classList.contains('send-message-btn')) {
            event.preventDefault(); // Prevent default button behavior
            const recipientId = target.dataset.recipientId;
            const postId = target.dataset.postId; // Get post ID directly from dataset
            const productDescription = target.dataset.productDescription || '';
            let productImage = target.dataset.productImage || ''; // Get product image from dataset

            const loggedInUser = localStorage.getItem('userId'); // Ensure loggedInUser is fresh

            if (!loggedInUser) {
                redirectToLogin(); // Prompt login if not authenticated
                return;
            }
            
            const postElement = target.closest('.post') || target.closest('.promoted-post');
            if (!postElement) {
                console.error("Could not find parent post element for send message button.");
                showToast('Error: Post information not found.', '#dc3545');
                return;
            }
            
            // Derive recipient username and profile picture from the post element
            const recipientUsername = postElement.querySelector('.post-user-name')?.textContent || postElement.querySelector('.promoted-user-name')?.textContent || 'Unknown';
            const recipientProfilePictureUrl = postElement.querySelector('.post-avatar')?.src || postElement.querySelector('.promoted-avatar')?.src || '/salmart-192x192.png';

            // Ensure image URL is absolute if it's relative
            if (productImage && !productImage.match(/^https?:\/\//)) {
                productImage = productImage.startsWith('/') ? `${API_BASE_URL}${productImage}` : `${API_BASE_URL}/${productImage}`;
            }

            const message = `Is this item still available?\n\nProduct: ${productDescription}`;
            const encodedMessage = encodeURIComponent(message);
            const encodedProductImage = encodeURIComponent(productImage);
            const encodedRecipientUsername = encodeURIComponent(recipientUsername);
            const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);
            const encodedProductDescription = encodeURIComponent(productDescription); // Using for product_name in chat

            const chatUrl = `Chats.html?user_id=${loggedInUser}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}&product_id=${postId}&product_name=${encodedProductDescription}`;
            window.location.href = chatUrl;
            return; // Exit to prevent further processing
        }

        // Handle Follow Button
        if (target.classList.contains('follow-button') && target.dataset.userId) {
            const userIdToFollow = target.dataset.userId;
            const authToken = localStorage.getItem('authToken');
            const loggedInUser = localStorage.getItem('userId'); // Get fresh logged in user ID

            if (!authToken || !loggedInUser) {
                showToast('Please log in to follow users.', '#dc3545');
                return;
            }

            const isCurrentlyFollowing = target.textContent.includes('Following'); // Check current UI state

            // Optimistic UI update
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
                    const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
                    throw new Error(errorData.message || 'Failed to update follow status');
                }

                const data = await response.json();

                // Update currentFollowingList based on successful action
                if (isCurrentlyFollowing) {
                    currentFollowingList = currentFollowingList.filter(id => id !== userIdToFollow);
                } else {
                    currentFollowingList.push(userIdToFollow);
                }

                // Re-apply UI update for consistency with actual state (should be same as optimistic if successful)
                window.updateFollowButtonsUI(userIdToFollow, !isCurrentlyFollowing);
                showToast(data.message || 'Follow status updated!', '#28a745');

            } catch (error) {
                console.error('Follow/Unfollow error:', error);
                showToast(error.message || 'Failed to update follow status.', '#dc3545');
                // Revert UI on error
                window.updateFollowButtonsUI(userIdToFollow, isCurrentlyFollowing);
            }
            return; // Exit to prevent further processing
        }

        // Handle post options menu visibility (ellipsis button)
        if (target.classList.contains('post-options-button')) {
            const menu = target.nextElementSibling; // The menu div
            if (menu && menu.classList.contains('post-options-menu')) {
                menu.classList.toggle('active'); // Toggle visibility
            }
            return;
        }

        // Close post options menu if clicking outside
        if (!target.closest('.post-options')) {
            document.querySelectorAll('.post-options-menu.active').forEach(menu => {
                menu.classList.remove('active');
            });
        }

        // Handle delete post button
        if (target.classList.contains('delete-post-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
            if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
                return;
            }
            const authToken = localStorage.getItem('authToken');
            if (!authToken) {
                showToast('You must be logged in to delete posts.', 'error');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/posts/${postId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${authToken}` },
                });

                const result = await response.json();
                if (response.ok) {
                    showToast(result.message || 'Post deleted successfully!', 'success');
                    // Remove the post from the DOM
                    const postElement = target.closest('.post');
                    if (postElement) {
                        postElement.remove();
                    }
                    // Optionally re-fetch to fill the gap or just rely on next load
                    // fetchAndRenderPosts(currentCategory, currentPage, true); // This might be too aggressive
                } else {
                    showToast(result.message || 'Failed to delete post.', 'error');
                }
            } catch (error) {
                console.error('Error deleting post:', error);
                showToast('Network error or server issue during deletion.', 'error');
            }
            return;
        }

        // Handle edit post button
        if (target.classList.contains('edit-post-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
            window.location.href = `edit-post.html?postId=${postId}`; // Redirect to edit page
            return;
        }

        // Handle report post button
        if (target.classList.contains('report-post-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
            if (!currentLoggedInUser) {
                redirectToLogin();
                return;
            }
            // Implement reporting logic (e.g., open a modal, send API request)
            if (window.showToast) {
                window.showToast(`Reporting post ${postId}. (Feature to be fully implemented)`, 'info');
            }
            console.log(`Reporting post: ${postId}`);
            return;
        }

        // Handle like button
        if (target.classList.contains('like-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
            if (!currentLoggedInUser) {
                redirectToLogin();
                return;
            }
            const icon = target.querySelector('i');
            const likeCountSpan = target.querySelector('.like-count');
            let currentLikes = parseInt(likeCountSpan.textContent, 10);

            const isLiked = icon.classList.contains('fas'); // Check current state

            // Optimistic UI update
            icon.classList.toggle('fas', !isLiked);
            icon.classList.toggle('far', isLiked);
            likeCountSpan.textContent = isLiked ? currentLikes - 1 : currentLikes + 1;

            try {
                const response = await fetch(`${API_BASE_URL}/api/posts/${postId}/like`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    },
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: 'Failed to parse error' }));
                    throw new Error(errorData.message || 'Failed to update like status');
                }
                // No need to revert UI if successful, optimistic was correct
            } catch (error) {
                console.error('Error liking/unliking post:', error);
                showToast(error.message || 'Failed to update like status.', 'error');
                // Revert UI on error
                icon.classList.toggle('fas', isLiked);
                icon.classList.toggle('far', !isLiked);
                likeCountSpan.textContent = isLiked ? currentLikes : currentLikes;
            }
            return;
        }

        // Handle reply button (comments)
        if (target.classList.contains('reply-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
            if (!currentLoggedInUser) {
                redirectToLogin();
                return;
            }
            // This needs a separate function to open a comment modal/section
            // For now, a simple toast:
            if (window.showToast) {
                window.showToast(`Showing comments for post ${postId}. (Feature to be implemented)`, 'info');
            }
            console.log(`Opening comments for post: ${postId}`);
            return;
        }

        // Handle share button
        if (target.classList.contains('share-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
            const postUrl = `${window.location.origin}/post.html?postId=${postId}`; // Example share URL
            try {
                if (navigator.share) {
                    await navigator.share({
                        title: document.title,
                        url: postUrl,
                    });
                    if (window.showToast) {
                        window.showToast('Post shared!', 'success');
                    }
                } else {
                    // Fallback for browsers that don't support Web Share API
                    navigator.clipboard.writeText(postUrl).then(() => {
                        if (window.showToast) {
                            window.showToast('Post link copied to clipboard!', 'success');
                        }
                    }).catch(err => {
                        console.error('Failed to copy text: ', err);
                        if (window.showToast) {
                            window.showToast('Failed to copy link.', 'error');
                        }
                    });
                }
            } catch (error) {
                console.error('Error sharing post:', error);
                if (window.showToast) {
                    window.showToast('Could not share post.', 'error');
                }
            }
            return;
        }

        // Handle video play/pause in promoted posts
        if (target.classList.contains('promoted-play-btn')) {
            const videoContainer = target.closest('.promoted-video-container');
            const video = videoContainer?.querySelector('.promoted-video');
            if (video) {
                if (video.paused) {
                    video.play();
                    target.innerHTML = '<i class="fas fa-pause"></i>';
                } else {
                    video.pause();
                    target.innerHTML = '<i class="fas fa-play"></i>';
                }
            }
            return;
        }
    });

    // Event listener for video elements in promoted posts to update play button
    document.addEventListener('play', (event) => {
        if (event.target.classList.contains('promoted-video')) {
            const videoContainer = event.target.closest('.promoted-video-container');
            const playButton = videoContainer?.querySelector('.promoted-play-btn');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-pause"></i>';
            }
        }
    }, true); // Use capture phase to catch play events

    document.addEventListener('pause', (event) => {
        if (event.target.classList.contains('promoted-video')) {
            const videoContainer = event.target.closest('.promoted-video-container');
            const playButton = videoContainer?.querySelector('.promoted-play-btn');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-play"></i>';
            }
        }
    }, true); // Use capture phase to catch pause events


    // --- Authentication and Initialization Logic ---

    /**
     * Initializes the authentication status and then fetches and renders posts.
     * This function is called if the 'authStatusReady' event is not received within a timeout.
     */
    async function initializeAuthStatusAndPosts() {
        try {
            // Check if window.loggedInUser is set by a prior script (e.g., an auth script)
            if (typeof window.loggedInUser !== 'undefined' && window.loggedInUser !== null) {
                currentLoggedInUser = window.loggedInUser;
                console.log('window.loggedInUser found:', currentLoggedInUser);
            } else {
                // If window.loggedInUser isn't explicitly set, try localStorage as a fallback
                const userIdFromStorage = localStorage.getItem('userId');
                if (userIdFromStorage) {
                    currentLoggedInUser = userIdFromStorage;
                    console.log('userId found in localStorage:', currentLoggedInUser);
                } else {
                    console.log('No loggedInUser found from window.loggedInUser or localStorage.');
                }
            }

            if (currentLoggedInUser) {
                currentFollowingList = await fetchFollowingList();
            }

            isAuthReady = true;
            console.log('Auth initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');

            // Initial fetch and render of posts after auth is determined
            await fetchAndRenderPosts(currentCategory, currentPage, true);

        } catch (error) {
            console.error('Error during initial auth or post fetch:', error);
            isAuthReady = true; // Still mark as ready to prevent further timeouts
            // Even if auth fails, try to fetch posts (they might be public)
            await fetchAndRenderPosts(currentCategory, currentPage, true);
        }
    }

    // Expose `fetchAndRenderPosts` globally under `window.fetchPosts`
    // This allows other scripts or inline HTML to trigger a post refresh.
    window.fetchPosts = fetchAndRenderPosts;

    // Listen for a custom 'authStatusReady' event, which might be dispatched by an authentication script
    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser; // Get user ID from the event detail
        console.log('Auth status ready event received. Logged in user:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
        currentFollowingList = await fetchFollowingList(); // Re-fetch following list on auth status ready
        isAuthReady = true;
        await fetchAndRenderPosts(currentCategory, currentPage, true); // Clear and re-render with new auth status
    });

    // Implement timeouts to ensure posts are loaded even if 'authStatusReady' event is delayed or never fired.
    // This is a common pattern for applications with separate auth loading.
    setTimeout(async () => {
        if (!isAuthReady) {
            console.warn('Auth status timeout (500ms) - `authStatusReady` not received. Proceeding with initialization.');
            await initializeAuthStatusAndPosts();
        }
    }, 500); // Give 500ms for a dedicated auth script to set `window.loggedInUser` or dispatch event.

    setTimeout(async () => {
        if (!isAuthReady) {
            console.warn('Auth status timeout (2000ms) - `authStatusReady` still not received. Forcing initialization.');
            await initializeAuthStatusAndPosts();
        }
    }, 2000); // A longer fallback timeout.

    // --- Pagination (Load More Button) ---

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (!isLoading) {
                // currentPage++; // Uncomment if your salmartCache.getPostsByCategory actually uses 'page' for pagination
                fetchAndRenderPosts(currentCategory, currentPage, false); // Fetch more, don't clear
            }
        });
    }

    // --- Category Filtering (Example) ---
    // If you have category filter buttons/dropdowns on your page:
    document.querySelectorAll('.category-filter-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const newCategory = event.target.dataset.category || 'all'; // Get category from data-category attribute
            if (newCategory !== currentCategory) {
                currentCategory = newCategory;
                currentPage = 1; // Reset page when changing category
                fetchAndRenderPosts(currentCategory, currentPage, true); // Clear and fetch for new category
            }
        });
    });

    // Initial fetch when DOM is fully loaded, but before any auth events are guaranteed
    // This provides a quick initial load, then it will be updated by `initializeAuthStatusAndPosts`
    // or `authStatusReady` event handling.
    // No, actually, the timeouts are designed to handle this initial fetch after waiting for auth.
    // Removing a direct call here prevents potential duplicate initial fetches.
});

// Any functions that need to be globally accessible (e.g., called from inline HTML like redirectToLogin)
// should be defined as properties of the window object, or within the DOMContentLoaded listener
// and then assigned to window as done above.
