import { salmartCache } from './salmartCache.js';

document.addEventListener('DOMContentLoaded', async function () {
    let currentLoggedInUser = null;
    let currentFollowingList = [];
    let isAuthReady = false;

    // --- State variables for pagination/filtering ---
    let userIdToFollow;
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

    // --- Render Functions ---

    function renderUserSuggestion(user) {
        const suggestionElement = document.createElement('div');
        suggestionElement.classList.add('user-suggestion-card');
        suggestionElement.innerHTML = `
            <a href="Profile.html?userId=${user._id}" class="user-info-link">
                <img src="${user.profilePicture || '/salmart-192x192.png'}" alt="${escapeHtml(user.name)}'s profile picture" class="user-suggestion-avatar" onerror="this.src='/salmart-192x192.png'">
                <h5 class="user-suggestion-name">${escapeHtml(user.name)}</h5>
            </a>
            <button class="follow-button user-suggestion-follow-btn" data-user-id="${user._id}">
                <i class="fas fa-user-plus"></i> Follow
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
            buttonContent = `
                <a href="${post.productLink || '#'}" class="promoted-cta-button" aria-label="Check out product ${escapeHtml(post.description || 'product')}" ${!post.productLink ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                    <i class="fas fa-shopping-cart"></i> Shop Now
                </a>
            `;
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
                    <button class="promoted-cta-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                    </button>
                `;
            } else if (!currentLoggedInUser) {
                buttonContent = `
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-shopping-cart"></i> Buy Now
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
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
            mediaContent = `
                <div class="post-video-container">
                    <video class="post-video" preload="metadata" aria-label="Video ad for ${(post.description || 'product').replace(/"/g, '"')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
                        <source src="${post.video || ''}" type="video/mp4" />
                        <source src="${post.video ? post.video.replace('.mp4', '.webm') : ''}" type="video/webm" />
                        <source src="${post.video ? post.video.replace('.mp4', '.ogg') : ''}" type="video/ogg" />
                        Your browser does not support the video tag.
                    </video>
                </div>
            `;
            productDetails = `
                <div class="product-info">
                    <span class="icon">📦</span>
                    <div>
                        <p class="value">${escapeHtml(post.description || 'No description')}</p>
                    </div>
                </div>
            `;
            buttonContent = `
                <a href="${post.productLink || '#'}" class="buy-now-button checkout-product-button" aria-label="Check out product ${escapeHtml(post.description || 'product')}" ${!post.productLink ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                    <i class="fas fa-shopping-cart"></i> Check Out Product
                </a>
            `;
        } else {
            mediaContent = `
                <img src="${productImageForChat}" class="post-image" onclick="window.openImage('${productImageForChat.replace(/'/g, "\\'")}')" alt="Product Image" onerror="this.src='/salmart-192x192.png'">
            `;
            productDetails = `
                <div class="product-info">
                    <span class="icon">📦</span>
                    <div>
                        <p class="label">Product</p>
                        <p class="value">${escapeHtml(post.title || 'No description')}</p>
                    </div>
                </div>
                <div class="product-info">
                    <span class="icon">🔄</span>
                    <div>
                        <p class="label">Condition</p>
                        <p class="value">${escapeHtml(post.productCondition || 'N/A')}</p>
                    </div>
                </div>
                <div class="product-info-inline">
                    <div class="info-item">
                        <span class="icon">💵</span>
                        <div>
                            <p class="label">Price</p>
                            <p class="value price-value">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</p>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="icon">📍</span>
                        <div>
                            <p class="label">Location</p>
                            <p class="value location-value">${escapeHtml(post.location || 'N/A')}</p>
                        </div>
                    </div>
                </div>
            `;

            if (currentLoggedInUser) {
                if (isPostCreator) {
                    buttonContent = !post.isPromoted ? `
                        <button class="promote-button buy-now-button" data-post-id="${post._id || ''}" aria-label="Promote this post">
                            <i class="fas fa-bullhorn"></i> Promote Post
                        </button>
                    ` : '';
                } else {
                    buttonContent = `
                        <button class="buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                            <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                        </button>
                        <button class="buy-now-button send-message-btn"
                            data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                            data-product-image="${productImageForChat}"
                            data-product-description="${escapeHtml(post.title || '')}"
                            data-post-id="${post._id || ''}"
                            ${post.isSold ? 'disabled' : ''}>
                            <i class="fas fa-circle-dot"></i> ${post.isSold ? 'Unavailable' : 'Check Availability'}
                        </button>
                    `;
                }
            } else {
                buttonContent = `
                    <button class="buy-now-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-shopping-cart"></i> Buy Now
                    </button>
                    <button class="buy-now-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-circle-dot"></i> Check Availability
                    </button>
                `;
            }
        }

        let followButtonHtml = '';
        if (post.createdBy && post.createdBy.userId) {
            if (currentLoggedInUser) {
                if (post.createdBy.userId === currentLoggedInUser) {
                    followButtonHtml = '';
                } else {
                    followButtonHtml = currentFollowingList.includes(post.createdBy.userId.toString()) ?
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
            font-size: 1em;
            font-weight: 600;
            color: #333;
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

        wrapperContainer.appendChild(headerElement);
        wrapperContainer.appendChild(rowContainer);

            

            rowContainer.style.position = 'relative';
    

        return wrapperContainer;
    }

    // --- Main Post Loading Logic ---

    async function fetchAndRenderPosts(category = currentCategory, page = currentPage, clearExisting = false) {
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
        postCounter = 0; // Reset post counter on clear or category change
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

        // Sort posts by creation date (newest first)
        const sortedPosts = [...allPosts].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA; // Newest first
        });

        // Separate promoted and non-promoted posts
        const promotedPosts = sortedPosts.filter(post => post.isPromoted);
        const nonPromotedPosts = sortedPosts.filter(post => !post.isPromoted);

        // Sort promoted posts by creation date too (newest promoted first)
        promotedPosts.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });

        const postsPerPromotedRow = 5;
        const postsBeforeSuggestion = 5;
        const usersPerSuggestionRow = 8;

        const fragment = document.createDocumentFragment();

        // Get all user suggestions once at the beginning
        let allUserSuggestions = [];
        if (currentLoggedInUser && clearExisting) {
            allUserSuggestions = await fetchUserSuggestions();
        }

        // First, add promoted posts row at the very top (if we have promoted posts)
        if (promotedPosts.length > 0) {
            const promotedRow = createPromotedPostsRow(promotedPosts);
            fragment.prepend(promotedRow);
        }

        // Track which suggestions we've already shown
        let suggestionRowIndex = 0;
        let suggestionCounter = 0;

        // Then add non-promoted posts (newest first) with user suggestions interspersed
        for (let i = 0; i < nonPromotedPosts.length; i++) {
            const post = nonPromotedPosts[i];
            const postElement = renderPost(post);
            fragment.appendChild(postElement);
            postCounter++;
            suggestionCounter++;

            // Inject user suggestions after every 5 posts, but only if we have suggestions left
            if (suggestionCounter % postsBeforeSuggestion === 0 && 
                currentLoggedInUser && 
                allUserSuggestions.length > 0 && 
                suggestionRowIndex * usersPerSuggestionRow < allUserSuggestions.length) {
                
                // Get the next batch of users for suggestion row
                const startIndex = suggestionRowIndex * usersPerSuggestionRow;
                const endIndex = Math.min(startIndex + usersPerSuggestionRow, allUserSuggestions.length);
                const usersForThisRow = allUserSuggestions.slice(startIndex, endIndex);
                
                if (usersForThisRow.length > 0) {
                    const userSuggestionsContainer = createUserSuggestionsContainer(usersForThisRow);
                    if (userSuggestionsContainer) {
                        fragment.appendChild(userSuggestionsContainer);
                        suggestionRowIndex++; // Move to next batch for future rows
                    }
                }
            }
        }

        if (clearExisting) {
            postsContainer.innerHTML = '';
            postsContainer.appendChild(fragment);
        } else {
            // For non-clearing loads, append new content
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
        const promoteButton = event.target.closest('.promote-button');
        if (promoteButton) {
            const postId = promoteButton.dataset.postId;
            if (!postId) {
                if (window.showToast) {
                    window.showToast('Invalid post ID for promotion', 'error');
                }
                return;
            }
            window.location.href = `promote.html?postId=${postId}`;
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

            await fetchAndRenderPosts(currentCategory, currentPage, true);

        } catch (error) {
            console.error('Error during initial auth or post fetch:', error);
            isAuthReady = true;
            await fetchAndRenderPosts(currentCategory, currentPage, true);
        }
    }

    window.fetchPosts = fetchAndRenderPosts;

    
       
    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser;
        console.log('Auth status ready event received. Logged in user:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
        currentFollowingList = await fetchFollowingList();
        isAuthReady = true;
        await fetchAndRenderPosts(currentCategory, currentPage, true);
    });

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
                fetchAndRenderPosts(currentCategory, currentPage, false);
            }
        });
    }
});

