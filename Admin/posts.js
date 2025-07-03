import { salmartCache } from './salmartCache.js';

document.addEventListener('DOMContentLoaded', async function () {
    let currentLoggedInUser = null;
    let currentFollowingList = [];
    let isAuthReady = false;

    // --- State variables for pagination/filtering ---
    let userIdToFollow; // This variable seems unused in the original context, consider removing if not needed.
    let currentPage = 1;
    let currentCategory = 'all';
    let isLoading = false; // To prevent multiple simultaneous fetches
    let postCounter = 0; // Counter for normal posts to inject suggestions

    // --- Helper Functions ---

    async function fetchFollowingList() {
        if (!currentLoggedInUser) {
            console.log("No logged-in user to fetch following list for.");
            return [];
        }
        const token = localStorage.getItem('authToken');
        if (!token) return [];

        try {
            const response = await fetch(`${window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com')}/api/is-following-list`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const { following } = await response.json();
                // Ensure unique IDs and convert to string for consistent comparison
                return [...new Set(following.map(id => id.toString()))] || [];
            } else {
                console.warn('Could not fetch following list. Status:', response.status);
                return [];
            }
        } catch (error) {
            console.error('Error fetching following list:', error);
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
            const response = await fetch(`${window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com')}/api/user-suggestions`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const { suggestions } = await response.json();
                // Filter out users already in currentFollowingList (ids are strings)
                return suggestions.filter(user => !currentFollowingList.includes(user._id.toString()));
            } else {
                console.warn('Could not fetch user suggestions. Status:', response.status);
                return [];
            }
        } catch (error) {
            console.error('Error fetching user suggestions:', error);
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

    /**
     * Updates the UI for all follow buttons on the page for a given user ID.
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
                -webkit-scrollbar: none;
                -ms-overflow-style: none;
                scrollbar-width: none;
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
                    <video class="promoted-video" preload="metadata" muted aria-label="Promoted video ad for ${(post.description || 'product').replace(/"/g, '"')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
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
                <div class='button-container'>
                    <button class="promoted-cta-button buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold' : 'Buy'}
                    </button>
                     <button class="promoted-cta-button send-message-btn"
                        data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                        data-product-image="${productImageForChat}"
                        data-product-description="${escapeHtml(post.description || '')}"
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
                        <i class="fas fa-shopping-cart"></i> Buy
                    </button>
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-paper-plane"></i> Message </button>
                        </div>
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
                <div class="button-container">
                    <button class="promoted-cta-button buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
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

    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';

        const isFollowing = currentFollowingList.includes(post.createdBy?.userId?.toString());
        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

        let mediaContent = '';
        let productDetails = '';
        let descriptionContent = ''; // New variable for the description
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
            descriptionContent = `
                <div class="post-description-text" style="margin-bottom: 10px;">
                    <p>${escapeHtml(post.description || '')}</p>
                </div>
            `;
            mediaContent = `
                <div class="product-image">
                    <div class="badge">New</div>
                    <video class="post-video" preload="metadata" aria-label="Video ad for ${(post.description || 'product').replace(/"/g, '"')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
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
             // Added description content to appear before the image
             descriptionContent = `
                <div class="post-description-text" style="margin-bottom: 10px; padding: 0 15px;">
                    <p>${escapeHtml(post.description || '')}</p>
                </div>
            `;
               
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
                                <div class="detail-value">Electronics</div>
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

            ${descriptionContent} <div class="product-container">
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
            -webkit-scrollbar: none;
            -ms-overflow-style: none;
            scrollbar-width: none;
        `;

        posts.forEach(post => {
            const postElement = renderPromotedPost(post);
            postElement.style.flex = '0 0 auto';
            postElement.style.width = `calc((100% / 5) - 12px)`;
            postElement.style.minWidth = '200px';
            postElement.style.scrollSnapAlign = 'start';
            rowContainer.appendChild(postElement);
        });

        const fillerCount = Math.max(0, 5 - posts.length);
        for (let i = 0; i < fillerCount; i++) {
            const fillerElement = createPromotedPostFiller();
            rowContainer.appendChild(fillerElement);
        }

        wrapperContainer.appendChild(headerElement);
        wrapperContainer.appendChild(rowContainer);

        rowContainer.style.position = 'relative';

        return wrapperContainer;
    }

    // --- Main Post Loading Logic ---

    async function fetchPostsByCategory(category = currentCategory, page = currentPage, clearExisting = false) {
        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            console.error('Posts container not found.');
            return;
        }

        if (isLoading && !clearExisting) {
            console.log('Posts are already loading. Skipping new request (unless clearing).');
            return;
        }
        isLoading = true;

        if (clearExisting) {
            postsContainer.innerHTML = '';
            postCounter = 0; 
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

            const promotedPosts = sortedPosts.filter(post => post.isPromoted);
            const nonPromotedPosts = sortedPosts.filter(post => !post.isPromoted);

            promotedPosts.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            const postsBeforeSuggestion = 5; 
            const usersPerSuggestionRow = 8;

            const fragment = document.createDocumentFragment();

            let allUserSuggestions = [];
            if (currentLoggedInUser && clearExisting) {
                allUserSuggestions = await fetchUserSuggestions();
            }

            if (promotedPosts.length > 0) {
                const promotedRow = createPromotedPostsRow(promotedPosts);
                fragment.prepend(promotedRow);
            }

            let suggestionRowIndex = 0;
            let suggestionCounter = 0;

            for (let i = 0; i < nonPromotedPosts.length; i++) {
                const post = nonPromotedPosts[i];
                const postElement = renderPost(post);
                fragment.appendChild(postElement);
                postCounter++;
                suggestionCounter++;

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

            if (clearExisting) {
                postsContainer.innerHTML = '';
                postsContainer.appendChild(fragment);
            } else {
                postsContainer.appendChild(fragment);
            }

            if (postsContainer.children.length === 0) {
                postsContainer.innerHTML = '<p style="text-align: center; margin: 2rem;">No posts available.</p>';
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
        } finally {
            isLoading = false;
        }
    }

    // --- Global Utility Functions ---

    window.redirectToLogin = function() {
        if (window.showToast) {
            window.showToast('Please log in to access this feature', 'error');
            setTimeout(() => {
                window.location.href = 'SignIn.html';
            }, 1000);
        } else {
            window.location.href = 'SignIn.html';
        }
    };


    // --- Event Delegates for Interactive Elements ---

    document.addEventListener('click', async (event) => {
        const target = event.target.closest('button'); // Capture clicks on buttons
        if (!target) return;

        const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
        const showToast = window.showToast;
        const authToken = localStorage.getItem('authToken');
        const loggedInUser = localStorage.getItem('userId');

        // Handle Promote Button
        const promoteButton = target.closest('.promote-button');
        if (promoteButton) {
            const postId = promoteButton.dataset.postId;
            if (!postId) {
                if (window.showToast) {
                    window.showToast('Invalid post ID for promotion', 'error');
                }
                return;
            }
            window.location.href = `promote.html?postId=${postId}`;
            return; // Exit to prevent further processing
        }


        // Handle Send Message Button (for both normal and promoted posts)
        if (target.classList.contains('send-message-btn')) {
            event.preventDefault(); // Prevent default button behavior
            const recipientId = target.dataset.recipientId;
            const postElement = target.closest('.post') || target.closest('.promoted-post');
            
            if (!postElement) {
                console.error("Could not find parent post element for send message button.");
                showToast('Error: Post information not found.', '#dc3545');
                return;
            }

            const recipientUsername = postElement.querySelector('.post-user-name')?.textContent || postElement.querySelector('.promoted-user-name')?.textContent || 'Unknown';
            const recipientProfilePictureUrl = postElement.querySelector('.post-avatar')?.src || postElement.querySelector('.promoted-avatar')?.src || 'default-avatar.png';
            let productImage = target.dataset.productImage || '';
            const productDescription = target.dataset.productDescription || '';
            const postId = target.dataset.postId;

            if (productImage && !productImage.match(/^https?:\/\//)) {
                productImage = productImage.startsWith('/') ? `${API_BASE_URL}${productImage}` : `${API_BASE_URL}/${productImage}`;
            }

            const message = `Is this item still available?\n\nProduct: ${productDescription}`;
            const encodedMessage = encodeURIComponent(message);
            const encodedProductImage = encodeURIComponent(productImage);
            const encodedRecipientUsername = encodeURIComponent(recipientUsername);
            const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);
            const encodedProductDescription = encodeURIComponent(productDescription);

            const chatUrl = `Chats.html?user_id=${loggedInUser}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}&product_id=${postId}&product_name=${encodedProductDescription}`;
            window.location.href = chatUrl;
            return; // Exit to prevent further processing
        }

        // Handle Follow Button
        if (target.classList.contains('follow-button') && target.dataset.userId) {
            const userIdToFollow = target.dataset.userId;
            if (!authToken || !loggedInUser) {
                showToast('Please log in to follow users.', '#dc3545');
                return;
            }

            const isCurrentlyFollowing = target.textContent.includes('Following');

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
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to update follow status');
                }

                const data = await response.json();
                
                // Update currentFollowingList based on successful action
                if (isCurrentlyFollowing) {
                    currentFollowingList = currentFollowingList.filter(id => id !== userIdToFollow);
                } else {
                    currentFollowingList.push(userIdToFollow);
                }
                
                // Re-apply UI update for consistency with actual state
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
    });

    // --- Authentication and Initialization Logic ---

    async function initializeAuthStatusAndPosts() {
        try {
            if (typeof window.loggedInUser !== 'undefined') {
                currentLoggedInUser = window.loggedInUser;
            } else {
                console.warn('window.loggedInUser is not yet defined. This may be set by another script.');
            }

            if (currentLoggedInUser) {
                currentFollowingList = await fetchFollowingList();
            }

            isAuthReady = true;
            console.log('Auth initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');

            await fetchPostsByCategory(currentCategory, currentPage, true);

        } catch (error) {
            console.error('Error during initial auth or post fetch:', error);
            isAuthReady = true;
            await fetchPostsByCategory(currentCategory, currentPage, true); // Still try to fetch posts even if auth has issues
        }
    }

    window.fetchPosts = fetchPostsByCategory; // Make it globally accessible if needed elsewhere

    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser;
        console.log('Auth status ready event received. Logged in user:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
        currentFollowingList = await fetchFollowingList(); // Re-fetch following list on auth status ready
        isAuthReady = true;
        await fetchPostsByCategory(currentCategory, currentPage, true);
    });

    // Fallback if 'authStatusReady' event is not fired or takes too long
    setTimeout(async () => {
        if (!isAuthReady) {
            console.log('Auth status timeout (500ms) - proceeding with initialization.');
            await initializeAuthStatusAndPosts();
        }
    }, 500);

    setTimeout(async () => {
        if (!isAuthReady) {
            console.log('Auth status timeout (2000ms) - proceeding with initialization.');
            await initializeAuthStatusAndPosts();
        }
    }, 2000);


    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (!isLoading) {
                currentPage++;
                fetchPostsByCategory(currentCategory, currentPage, false); // Don't clear existing posts
            }
        });
    }
});
