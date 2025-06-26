// public/posts.js

// Import the salmartCache helper.
// IMPORTANT: Adjust the path if salmartCache.js is not in the same directory.
import { salmartCache } from './salmartCache.js';

document.addEventListener('DOMContentLoaded', async function () {
    let currentLoggedInUser = null;
    let currentFollowingList = [];
    let isAuthReady = false;

    // --- State variables for pagination/filtering ---
    let currentPage = 1;
    let currentCategory = 'all';
    let isLoading = false; // To prevent multiple simultaneous fetches


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
                return following || [];
            } else {
                console.warn('Could not fetch following list. Status:', response.status);
                return [];
            }
        } catch (error) {
            console.error('Error fetching following list:', error);
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

    // For older posts, show the actual date
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

        const isFollowing = currentFollowingList.includes(post.createdBy?.userId);
        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

        let mediaContent = '';
        let productDetails = '';
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
            mediaContent = `
                <div class="post-video-container">
                    <video class="post-video" preload="metadata" aria-label="Video ad for ${(post.description || 'product').replace(/"/g, '&quot;')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
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
                    followButtonHtml = isFollowing ?
                        `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #28a745; color: #fff;" disabled>
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

        if (posts.length > 5) {
            const prevArrow = document.createElement('button');
            prevArrow.className = 'promoted-row-nav-arrow prev';
            prevArrow.innerHTML = '<i class="fas fa-chevron-left"></i>';
            prevArrow.setAttribute('aria-label', 'Previous promoted posts');

            const nextArrow = document.createElement('button');
            nextArrow.className = 'promoted-row-nav-arrow next';
            nextArrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
            nextArrow.setAttribute('aria-label', 'Next promoted posts');

            const arrowStyles = `
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(0, 0, 0, 0.6);
                color: white;
                border: none;
                border-radius: 50%;
                width: 35px;
                height: 35px;
                cursor: pointer;
                z-index: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.2em;
                transition: background 0.3s ease;
            `;
            prevArrow.style.cssText = arrowStyles + 'left: 5px;';
            nextArrow.style.cssText = arrowStyles + 'right: 5px;';

            prevArrow.addEventListener('click', () => {
                rowContainer.scrollBy({ left: -rowContainer.offsetWidth, behavior: 'smooth' });
            });
            nextArrow.addEventListener('click', () => {
                rowContainer.scrollBy({ left: rowContainer.offsetWidth, behavior: 'smooth' });
            });

            rowContainer.style.position = 'relative';
            rowContainer.appendChild(prevArrow);
            rowContainer.appendChild(nextArrow);
        }

        return wrapperContainer;
    }

    // --- Main Post Loading Logic (Updated for Cache-First Display) ---

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

        // Do NOT clear existing content if skeleton loaders are already displayed.
        // The goal is to replace the loaders or existing content seamlessly.
        // We only clear if `clearExisting` is true (e.g., category change),
        // but even then, we expect skeleton loaders to handle the initial empty state.
        if (clearExisting) {
            postsContainer.innerHTML = '';
        }

        try {
            const allPosts = await salmartCache.getPostsByCategory(category);

            if (!Array.isArray(allPosts) || allPosts.length === 0) {
                // Only show "No posts yet" if the container is currently empty
                // (meaning no skeleton loaders or previous posts are visible).
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

            // Reverse the order of posts so new items appear at the top
            const postsToRender = [...allPosts].reverse();

            const promotedPosts = postsToRender.filter(post => post.isPromoted);
            const nonPromotedPosts = postsToRender.filter(post => !post.isPromoted);

            const postsPerPromotedRow = 5;

            let promotedPostsRenderedCount = 0;

            const fragment = document.createDocumentFragment();

            // Handle promoted posts
            if (promotedPosts.length > 0 && clearExisting) { // Only add initial promoted row on clear
                const initialPromotedPosts = promotedPosts.slice(0, postsPerPromotedRow);
                if (initialPromotedPosts.length > 0) {
                    const promotedRow = createPromotedPostsRow(initialPromotedPosts);
                    fragment.prepend(promotedRow); // Prepend promoted row
                    promotedPostsRenderedCount += initialPromotedPosts.length;
                }
            }
            
            // Prepend non-promoted posts
            nonPromotedPosts.forEach(post => {
                const postElement = renderPost(post);
                fragment.prepend(postElement); // Prepend to show new items at the top
            });

            // Interleave remaining promoted posts if any
            for (let i = promotedPostsRenderedCount; i < promotedPosts.length; i += postsPerPromotedRow) {
                const postsForThisPromotedRow = promotedPosts.slice(i, i + postsPerPromotedRow);
                if (postsForThisPromotedRow.length > 0) {
                    const promotedRow = createPromotedPostsRow(postsForThisPromotedRow);
                    fragment.prepend(promotedRow); // Prepend promoted rows
                }
            }


            if (clearExisting) {
                postsContainer.innerHTML = ''; // Clear existing content before prepending new content
                postsContainer.appendChild(fragment); // Then append the fragment (which is now reversed)
            } else {
                // If not clearing, prepend the new posts
                postsContainer.prepend(fragment);
            }

            // After rendering, if still no children and we attempted to fetch, show message
            if (postsContainer.children.length === 0) {
                postsContainer.innerHTML = '<p style="text-align: center; margin: 2rem;">No posts available.</p>';
            }

            window.dispatchEvent(new Event('postsRendered'));

        } catch (error) {
            console.error('Error fetching posts:', error);
            // Only display an error message if the container is currently empty,
            // otherwise, existing content (including skeleton loaders) remains visible.
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

    window.openImage = function(imageUrl) {
        console.log("Opening image:", imageUrl);
        window.open(imageUrl, '_blank');
    };

    // --- Event Delegates for Interactive Elements ---

    document.addEventListener('click', async (event) => {
        // Only keep the promote post button delegation
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

            // Initial fetch of posts after auth is ready
            await fetchAndRenderPosts(currentCategory, currentPage, true);

        } catch (error) {
            console.error('Error during initial auth or post fetch:', error);
            isAuthReady = true;
            // Attempt to fetch posts even if auth status is uncertain, for public content
            await fetchAndRenderPosts(currentCategory, currentPage, true);
        }
    }

    // Expose fetchAndRenderPosts globally if needed by other parts of your app
    window.fetchPosts = fetchAndRenderPosts;

    // Update UI for all follow buttons on the page
    window.updateFollowButtonsUI = (userId, isFollowingStatus) => {
        if (isFollowingStatus) {
            if (!currentFollowingList.includes(userId)) {
                currentFollowingList.push(userId);
            }
        } else {
            currentFollowingList = currentFollowingList.filter(id => id !== userId);
        }

        document.querySelectorAll(`.follow-button[data-user-id="${userId}"]`).forEach(btn => {
            if (isFollowingStatus) {
                btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
                btn.style.backgroundColor = '#28a745';
                btn.style.color = '#fff';
                btn.disabled = true;
            } else {
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                btn.style.backgroundColor = ''; // Reset to default
                btn.style.color = ''; // Reset to default
                btn.disabled = false;
            }
        });
    };

    // Listen for a custom event from your auth script indicating auth status is ready
    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser;
        console.log('Auth status ready event received. Logged in user:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
        currentFollowingList = await fetchFollowingList();
        isAuthReady = true;
        // Re-render posts with correct user-specific data (likes, follow buttons)
        await fetchAndRenderPosts(currentCategory, currentPage, true);
    });

    // Fallback timers in case 'authStatusReady' event is missed or not fired quickly
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

    // Event listener for category filter changes - ensure it uses the outer-scoped variables
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (event) => {
            currentCategory = event.target.value;
            currentPage = 1; // Reset page to 1 when category changes
            fetchAndRenderPosts(currentCategory, currentPage, true); // Clear existing posts on category change
        });
    }

    // Event listener for the "Load More" button - ensure it uses the outer-scoped variables
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (!isLoading) {
                currentPage++;
                fetchAndRenderPosts(currentCategory, currentPage, false); // Don't clear existing, prepend
            }
        });
    }
});

