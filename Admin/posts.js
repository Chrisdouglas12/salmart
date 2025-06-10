// post-renderer.js
document.addEventListener('DOMContentLoaded', async function () {
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    const showToast = window.showToast;

    // Use a variable that will be populated *after* auth status is ready
    let currentLoggedInUser = null;
    let currentFollowingList = [];

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
                        <p class="label">Product</p>
                        <p class="value">${post.description || 'No descript'}</p>
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
        }

        // CONDITIONAL LOGIC FOR FOLLOW BUTTON
        let followButtonHtml = '';
        if (post.createdBy && post.createdBy.userId && currentLoggedInUser) {
            if (post.createdBy.userId === currentLoggedInUser) {
                // If logged-in user is the post creator, hide the follow button
                followButtonHtml = ''; // No button
            } else {
                // Show follow/following button
                followButtonHtml = isFollowing ?
                    `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #fff; color:  #28a745" disabled>
                        <i class="fas fa-user-check"></i> Following
                    </button>` :
                    `<button class="follow-button" data-user-id="${post.createdBy.userId}">
                        <i class="fas fa-user-plus"></i> Follow
                    </button>`;
            }
        }
        // If currentLoggedInUser is null (not logged in), followButtonHtml will remain ''

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
            // Ensure logged-in user and following list are updated before fetching posts
            currentLoggedInUser = window.loggedInUser; // Get the latest from auth.js
            currentFollowingList = await fetchFollowingList(); // Fetch fresh list

            const response = await fetch(`${API_BASE_URL}/post?category=${encodeURIComponent(category)}`);
            if (!response.ok) throw new Error('Failed to fetch posts');

            const posts = await response.json();
            postsContainer.innerHTML = ''; // Clear existing posts

            posts.forEach(post => {
                const postElement = renderPost(post); // renderPost now uses currentFollowingList and currentLoggedInUser
                postsContainer.prepend(postElement);
            });

            window.dispatchEvent(new Event('postsRendered'));

        } catch (error) {
            console.error('Error fetching posts:', error);
            postsContainer.innerHTML = '<p style="text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">No posts yet. Try again or create one!</p>';
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

    // Wait for auth status to be ready before fetching posts
    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser;
        console.log('Auth status ready. Logged in user:', currentLoggedInUser);
        await fetchAndRenderPosts(); // Initial fetch after auth
    });
});
