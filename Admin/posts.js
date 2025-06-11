// post-renderer.js
document.addEventListener('DOMContentLoaded', async function () {
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    const showToast = window.showToast;

    // Use a variable that will be populated *after* auth status is ready
    let currentLoggedInUser = null;
    let currentFollowingList = [];
    let isAuthReady = false;

    // Function to fetch the logged-in user's following list
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
                return following || [];
            } else {
                console.warn('Could not fetch following list from backend. Status:', response.status);
                // If token is invalid/expired, this should be handled by verify-token,
                // but this catch ensures we don't block.
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
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hrs ago`;
        if (diffInSeconds < 172800) return "Yesterday";

        return postDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';

        // Determine if the post creator is in the currentFollowingList
        const isFollowing = currentFollowingList.includes(post.createdBy.userId);
        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

        let mediaContent = '';
        let productDetails = '';
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || 'default-video-poster.png') : (post.photo || 'default-image.png');

        if (post.postType === 'video_ad') {
            mediaContent = `
                <div class="post-video-container">
                    <video class="post-video" preload="metadata" aria-label="Video ad for ${post.description || 'product'}">
                        <source src="${post.video || ''}" type="video/mp4" />
                        <source src="${post.video ? post.video.replace('.mp4', '.webm') : ''}" type="video/webm" />
                        <source src="${post.video ? post.video.replace('.mp4', '.ogg') : ''}" type="video/ogg" />
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
                            <i class="fas fa-volume-up"></i>
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
            productDetails = `
                <div class="product-info">
                    <span class="icon">📦</span>
                    <div>
                        <p class="value">${post.description || 'No description'}</p>
                    </div>
                </div>
            `;
            buttonContent = `
                <a href="${post.productLink || '#'}" class="buy-now-button checkout-product-button" aria-label="Check out product ${post.description || 'product'}" ${!post.productLink ? 'disabled' : ''}>
                    <i class="fas fa-shopping-cart"></i> Check Out Product
                </a>
            `;
        } else {
            mediaContent = `
                <img src="${productImageForChat}" class="post-image" onclick="openImage('${productImageForChat}')" alt="Product Image">
            `;
            productDetails = `
                <div class="product-info">
                    <span class="icon">📦</span>
                    <div>
                        <p class="label">Product</p>
                        <p class="value">${post.title || 'No description'}</p>
                    </div>
                </div>
                <div class="product-info">
                    <span class="icon">🔄</span>
                    <div>
                        <p class="label">Condition</p>
                        <p class="value">${post.productCondition || 'N/A'}</p>
                    </div>
                </div>
                <div class="product-info-inline">
                    <div class="info-item">
                        <span class="icon">💵</span>
                        <div>
                            <p class="label">Price</p>
                            <p class="value price-value">${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}</p>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="icon">📍</span>
                        <div>
                            <p class="label">Location</p>
                            <p class="value location-value">${post.location || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            `;

            // Modified button content to handle non-logged in users
            if (currentLoggedInUser) {
                // User is logged in - show normal buttons
                buttonContent = `
                    <button class="buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                    </button>
                    <button class="buy-now-button send-message-btn" id="send-message-btn"
                        data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                        data-product-image="${productImageForChat}"
                        data-product-description="${post.title || ''}"
                        data-post-id="${post._id || ''}"
                        ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-circle-dot"></i> ${post.isSold ? 'Unavailable' : 'Check Availability'}
                    </button>
                `;
            } else {
                // User is not logged in - show login prompt buttons
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

        // CONDITIONAL LOGIC FOR FOLLOW BUTTON
        let followButtonHtml = '';
        if (post.createdBy && post.createdBy.userId) {
            if (currentLoggedInUser) {
                // User is logged in
                if (post.createdBy.userId === currentLoggedInUser) {
                    // If logged-in user is the post creator, hide the follow button
                    followButtonHtml = ''; // No button
                } else {
                    // Show follow/following button
                    followButtonHtml = isFollowing ?
                        `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #fff; color: #28a745" disabled>
                            <i class="fas fa-user-check"></i> Following
                        </button>` :
                        `<button class="follow-button" data-user-id="${post.createdBy.userId}">
                            <i class="fas fa-user-plus"></i> Follow
                        </button>`;
                }
            } else {
                // User is not logged in - show login required follow button
                followButtonHtml = `
                    <button class="follow-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-user-plus"></i> Follow
                    </button>
                `;
            }
        }

        // Modified post actions for non-logged in users
        const postActionsHtml = currentLoggedInUser ? `
            <div class="post-actions">
                <button class="action-button like-button">
                    <i class="${post.likes && post.likes.includes(currentLoggedInUser) ? 'fas' : 'far'} fa-heart"></i>
                    <span class="like-count">${post.likes ? post.likes.length : 0}</span> <p>Likes</p>
                </button>
                <button class="action-button reply-button">
                    <i class="far fa-comment-alt"></i>
                    <span class="comment-count">${post.comments ? post.comments.length : 0}</span> <p>Comments</p>
                </button>
                <button class="action-button share-button">
                    <i class="fas fa-share"></i>
                </button>
            </div>
        ` : `
            <div class="post-actions">
                <button class="action-button login-required" onclick="redirectToLogin()">
                    <i class="far fa-heart"></i>
                    <span class="like-count">${post.likes ? post.likes.length : 0}</span> <p>Likes</p>
                </button>
                <button class="action-button login-required" onclick="redirectToLogin()">
                    <i class="far fa-comment-alt"></i>
                    <span class="comment-count">${post.comments ? post.comments.length : 0}</span> <p>Comments</p>
                </button>
                <button class="action-button share-button">
                    <i class="fas fa-share"></i>
                </button>
            </div>
        `;

        postElement.innerHTML = `
            <div class="post-header">
                <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                    <img src="${post.profilePicture || 'default-avater.png'}" class="post-avatar">
                </a>
                <div class="post-user-info">
                    <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                        <h4 class="post-user-name">${post.createdBy ? post.createdBy.name : 'Unknown'}</h4>
                    </a>
                    <p class="post-time">${formatTime(post.createdAt || new Date())}</p>
                </div>
                ${followButtonHtml}
                <div class="post-options">
                    <button class="post-options-button"><i class="fas fa-ellipsis-h"></i></button>
                    <div class="post-options-menu">
                        <ul>
                            ${isPostCreator ? `
                                <li><button class="delete-post-button" data-post-id="${post._id || ''}">Delete Post</button></li>
                                <li><button class="edit-post-button" data-post-id="${post._id || ''}">Edit Post</button></li>
                            ` : ''}
                            <li><button class="report-post-button" data-post-id="${post._id || ''}">Report Post</button></li>
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
                ${isPostCreator ? '' : buttonContent}
            </div>

            ${postActionsHtml}
        `;
        return postElement;
    }

    async function fetchAndRenderPosts(category = '') {
        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            console.error('Posts container not found.');
            return;
        }

        try {
            // Always fetch posts, regardless of login status
            const response = await fetch(`${API_BASE_URL}/post?category=${encodeURIComponent(category)}`);
            if (!response.ok) throw new Error('Failed to fetch posts');

            const posts = await response.json();
            postsContainer.innerHTML = ''; // Clear existing posts

            posts.forEach(post => {
                const postElement = renderPost(post); // renderPost now handles both logged-in and non-logged-in users
                postsContainer.prepend(postElement);
            });

            window.dispatchEvent(new Event('postsRendered'));

        } catch (error) {
            console.error('Error fetching posts:', error);
            postsContainer.innerHTML = '<p style="text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">No posts yet. Try again or create one!</p>';
        }
    }

    // Function to redirect to login page
    window.redirectToLogin = function() {
        if (window.showToast) {
            window.showToast('Please login to access this feature', 'info');
        }
        setTimeout(() => {
            window.location.href = 'SignIn.html';
        }, 1000);
    };

    // Function to initialize auth status
    async function initializeAuthStatus() {
        try {
            // Try to get current user from auth.js if available
            if (window.loggedInUser !== undefined) {
                currentLoggedInUser = window.loggedInUser;
            }

            // If user is logged in, fetch their following list
            if (currentLoggedInUser) {
                currentFollowingList = await fetchFollowingList();
            }

            isAuthReady = true;
            console.log('Auth initialization complete. User:', currentLoggedInUser);
            
            // Fetch posts after auth status is determined
            await fetchAndRenderPosts();
        } catch (error) {
            console.error('Error initializing auth status:', error);
            // Even if auth fails, we should still fetch posts for non-logged-in view
            isAuthReady = true;
            await fetchAndRenderPosts();
        }
    }

    // Expose fetchAndRenderPosts globally for category buttons
    window.fetchPosts = fetchAndRenderPosts;

    // Expose a utility to update follow buttons across the page
    window.updateFollowButtonsUI = (userId, isFollowingStatus) => {
        // Update the in-memory list first
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
                btn.disabled = true;
            } else {
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                btn.style.backgroundColor = ''; // Reset to default/CSS
                btn.disabled = false;
            }
        });
    };

    // Listen for auth status ready event (if it exists)
    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser;
        currentFollowingList = await fetchFollowingList();
        console.log('Auth status ready event received. Logged in user:', currentLoggedInUser);
        
        // Re-render posts with updated auth status
        await fetchAndRenderPosts();
    });

    // Initialize immediately - don't wait for auth status
    // This ensures posts are fetched even if user is not logged in
    setTimeout(async () => {
        if (!isAuthReady) {
            console.log('Initializing without waiting for auth status...');
            await initializeAuthStatus();
        }
    }, 500); // Small delay to allow auth.js to set window.loggedInUser if present

    // Fallback: If no auth status event is received within 2 seconds, proceed anyway
    setTimeout(async () => {
        if (!isAuthReady) {
            console.log('Auth timeout - proceeding with post fetch...');
            await initializeAuthStatus();
        }
    }, 2000);
});