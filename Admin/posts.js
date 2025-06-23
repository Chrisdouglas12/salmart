document.addEventListener('DOMContentLoaded', async function () {
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    const showToast = window.showToast;

    let currentLoggedInUser = null;
    let currentFollowingList = [];
    let isAuthReady = false;
    let promotedPostsRotationInterval = null;
    let allPromotedPosts = [];

    // Fetch the logged-in user's following list
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
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hrs ago`;
        if (diffInSeconds < 172800) return "Yesterday";

        return postDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    function renderPromotedPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('promoted-post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';

        const isFollowing = currentFollowingList.includes(post.createdBy?.userId);
        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

        let mediaContent = '';
        let productDetails = '';
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || 'default-video-poster.png') : (post.photo || 'default-image.png');

        if (post.postType === 'video_ad') {
            mediaContent = `
                <div class="promoted-video-container">
                    <video class="promoted-video" preload="metadata" muted aria-label="Promoted video ad for ${(post.description || 'product').replace(/"/g, '&quot;')}">
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
                <img src="${productImageForChat}" class="promoted-image" alt="Promoted Product" onerror="this.src='default-image.png'">
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
                <img src="${post.profilePicture || 'default-avatar.png'}" class="promoted-avatar" onerror="this.src='default-avatar.png'" alt="User Avatar">
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

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || 'default-video-poster.png') : (post.photo || 'default-image.png');

        if (post.postType === 'video_ad') {
            mediaContent = `
                <div class="post-video-container">
                    <video class="post-video" preload="metadata" aria-label="Video ad for ${(post.description || 'product').replace(/"/g, '&quot;')}">
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
                <img src="${productImageForChat}" class="post-image" onclick="openImage('${productImageForChat.replace(/'/g, "\\'")}')" alt="Product Image" onerror="this.src='default-image.png'">
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
                    // Show promote button for post creator
                    buttonContent = !post.isPromoted ? `
                        <button class="promote-button buy-now-button" data-post-id="${post._id || ''}" aria-label="Promote this post">
                            <i class="fas fa-bullhorn"></i> Promote Post
                        </button>
                    ` : '';
                } else {
                    // Show buy buttons for other users
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
                        `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #fff; color: #28a745" disabled>
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
                    <img src="${post.profilePicture || 'default-avatar.png'}" class="post-avatar" onerror="this.src='default-avatar.png'" alt="User Avatar">
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

    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

function renderPromotedSection(promotedPosts) {
    const promotedContainer = document.getElementById('promoted-posts-container');
    if (!promotedContainer || promotedPosts.length < 3) return; // Require at least 3 ads

    // Clear existing content
    promotedContainer.innerHTML = '';
    // Deduplicate posts by _id
    allPromotedPosts = [...new Map(promotedPosts.map(post => [post._id, post])).values()];
    
    let currentFirstIndex = 0;

    // Determine posts per row based on screen size (minimum 3 posts)
    const postsPerRow = Math.max(3, window.innerWidth <= 768 ? 5 : window.innerWidth <= 1200 ? 6 : 7);

    // Create carousel wrapper for smooth sliding
    const carouselWrapper = document.createElement('div');
    carouselWrapper.classList.add('promoted-carousel-wrapper');
    carouselWrapper.style.cssText = `
        overflow-x: auto;
        position: relative;
        width: 100%;
        
        
    `;

    const carouselTrack = document.createElement('div');
    carouselTrack.classList.add('promoted-carousel-track');
    carouselTrack.style.cssText = `
        display: flex;
        transition: transform 0.5s ease-in-out;
        width: 100%;
    `;

    // Create row with rotating positions
    function createRow(posts, firstIndex) {
        const row = document.createElement('div');
        row.classList.add('promoted-posts-row');
        

        // Calculate indices for rotation: [first, second, third, ...]
        const totalPosts = Math.min(posts.length, postsPerRow);
        const indices = [];
        for (let i = 0; i < totalPosts; i++) {
            indices.push((firstIndex + i) % posts.length);
        }

        // Render posts in rotated order
        indices.forEach(index => {
            const postElement = renderPromotedPost(posts[index]);
            postElement.style.flex = '1'; // Equal width for each post
            row.appendChild(postElement);
        });

        return row;
    }

    // Create initial row
    const initialRow = createRow(allPromotedPosts, currentFirstIndex);
    carouselTrack.appendChild(initialRow);
    carouselWrapper.appendChild(carouselTrack);
    promotedContainer.appendChild(carouselWrapper);

    // Auto-rotation function with smooth left-to-right transition
    function rotatePromotedPosts() {
        if (allPromotedPosts.length < 3) return;

        // Increment first index to rotate
        currentFirstIndex = (currentFirstIndex + 1) % allPromotedPosts.length;

        // Create new row for next content
        const newRow = createRow(allPromotedPosts, currentFirstIndex);
        carouselTrack.appendChild(newRow);

        // Slide to show new row (left-to-right transition)
        carouselTrack.style.transform = 'translateX(-100%)';

        // After transition completes, reset position and remove old row
        setTimeout(() => {
            const oldRow = carouselTrack.firstElementChild;
            if (oldRow) {
                carouselTrack.removeChild(oldRow);
            }
            carouselTrack.style.transition = 'none';
            carouselTrack.style.transform = 'translateX(0)';
            
            // Re-enable transition for next animation
            setTimeout(() => {
                carouselTrack.style.transition = 'transform 0.5s ease-in-out';
            }, 50);
        }, 500);
    }

    // Clear existing interval
    if (promotedPostsRotationInterval) {
        clearInterval(promotedPostsRotationInterval);
    }


    // Enable manual navigation
    addPromotedNavigationControls(promotedContainer, allPromotedPosts.length);

    // Pause auto-rotation on user interaction
    promotedContainer.addEventListener('mouseenter', () => clearInterval(promotedPostsRotationInterval));
    promotedContainer.addEventListener('mouseleave', () => {
        if (allPromotedPosts.length >= 3) {
            promotedPostsRotationInterval = setInterval(rotatePromotedPosts, 5000);
        }
    });
}

function addPromotedNavigationControls(container, totalPosts) {
    if (totalPosts < 3) return;

    const prevArrow = document.createElement('button');
    prevArrow.className = 'promoted-nav-arrow prev';
    prevArrow.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevArrow.setAttribute('aria-label', 'Previous promoted posts');
    prevArrow.style.cssText = `
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 10;
        background: rgba(0, 0, 0, 0.5);
        color: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        cursor: pointer;
        transition: background 0.3s ease;
    `;

    const nextArrow = document.createElement('button');
    nextArrow.className = 'promoted-nav-arrow next';
    nextArrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextArrow.setAttribute('aria-label', 'Next promoted posts');
    nextArrow.style.cssText = `
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 10;
        background: rgba(0, 0, 0, 0.5);
        color: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        cursor: pointer;
        transition: background 0.3s ease;
    `;

    container.style.position = 'relative'; // Ensure container can hold positioned arrows
    container.appendChild(prevArrow);
    container.appendChild(nextArrow);

    prevArrow.addEventListener('click', () => navigatePromoted('prev'));
    nextArrow.addEventListener('click', () => navigatePromoted('next'));

    // Hover effects
    [prevArrow, nextArrow].forEach(arrow => {
        arrow.addEventListener('mouseenter', () => {
            arrow.style.background = 'rgba(0, 0, 0, 0.8)';
        });
        arrow.addEventListener('mouseleave', () => {
            arrow.style.background = 'rgba(0, 0, 0, 0.5)';
        });
    });
}

function navigatePromoted(direction) {
    const promotedContainer = document.getElementById('promoted-posts-container');
    const carouselTrack = promotedContainer?.querySelector('.promoted-carousel-track');
    
    if (!promotedContainer || !carouselTrack || allPromotedPosts.length < 3) return;

    // Determine posts per row based on current screen size
    const postsPerRow = Math.max(3, window.innerWidth <= 768 ? 5 : window.innerWidth <= 1200 ? 6 : 7);

    // Create row function (same as in renderPromotedSection)
    function createRow(posts, firstIndex) {
        const row = document.createElement('div');
        row.classList.add('promoted-posts-row');
        

        const totalPosts = Math.min(posts.length, postsPerRow);
        const indices = [];
        for (let i = 0; i < totalPosts; i++) {
            indices.push((firstIndex + i) % posts.length);
        }

        indices.forEach(index => {
            const postElement = renderPromotedPost(posts[index]);
            postElement.style.flex = '1';
            row.appendChild(postElement);
        });

        return row;
    }

    // Update currentFirstIndex based on direction
    const totalPosts = allPromotedPosts.length;
    if (direction === 'next') {
        currentFirstIndex = (currentFirstIndex + 1) % totalPosts;
        
        // Create new row and append it
        const newRow = createRow(allPromotedPosts, currentFirstIndex);
        carouselTrack.appendChild(newRow);
        
        // Slide left to show new content
        carouselTrack.style.transform = 'translateX(-100%)';
        
        // Clean up after transition
        setTimeout(() => {
            const oldRow = carouselTrack.firstElementChild;
            if (oldRow) carouselTrack.removeChild(oldRow);
            carouselTrack.style.transition = 'none';
            carouselTrack.style.transform = 'translateX(0)';
            setTimeout(() => {
                carouselTrack.style.transition = 'transform 0.5s ease-in-out';
            }, 50);
        }, 500);
        
    } else { // prev
        currentFirstIndex = (currentFirstIndex - 1 + totalPosts) % totalPosts;
        
        // Create new row and prepend it
        const newRow = createRow(allPromotedPosts, currentFirstIndex);
        carouselTrack.style.transition = 'none';
        carouselTrack.style.transform = 'translateX(-100%)';
        carouselTrack.insertBefore(newRow, carouselTrack.firstChild);
        
        // Force reflow then slide right to show new content
        carouselTrack.offsetHeight;
        carouselTrack.style.transition = 'transform 0.5s ease-in-out';
        carouselTrack.style.transform = 'translateX(0)';
        
        // Clean up after transition
        setTimeout(() => {
            const lastRow = carouselTrack.lastElementChild;
            if (lastRow && carouselTrack.children.length > 1) {
                carouselTrack.removeChild(lastRow);
            }
        }, 500);
    }

    // Restart auto-rotation
    if (promotedPostsRotationInterval) {
        clearInterval(promotedPostsRotationInterval);
        if (allPromotedPosts.length >= 3) {
            promotedPostsRotationInterval = setInterval(() => navigatePromoted('next'), 5000);
        }
    }
}

// Update resize handler
window.addEventListener('resize', () => {
    const promotedContainer = document.getElementById('promoted-posts-container');
    if (promotedContainer && allPromotedPosts.length >= 3) {
        clearTimeout(window.promotedResizeTimeout);
        window.promotedResizeTimeout = setTimeout(() => {
            renderPromotedSection(allPromotedPosts);
        }, 250);
    }
});
    async function fetchAndRenderPosts(category = '') {
        const postsContainer = document.getElementById('posts-container');
        const promotedContainer = document.getElementById('promoted-posts-container');
        
        if (!postsContainer) {
            console.error('Posts container not found.');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/post?category=${encodeURIComponent(category)}`);
            if (!response.ok) throw new Error('Failed to fetch posts');

            const posts = await response.json();
            postsContainer.innerHTML = ''; // Clear existing posts

            if (!Array.isArray(posts) || posts.length === 0) {
                postsContainer.innerHTML = '<p style="text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">No posts yet. Try again or create one!</p>';
                if (promotedContainer) promotedContainer.innerHTML = '';
                return;
            }

            // Separate promoted and non-promoted posts
            const promotedPosts = posts.filter(post => post.isPromoted);
            const nonPromotedPosts = posts.filter(post => !post.isPromoted);

            // Render promoted posts section
            if (promotedPosts.length > 0 && promotedContainer) {
                renderPromotedSection(promotedPosts);
            } else if (promotedContainer) {
                promotedContainer.innerHTML = '';
            }

            // Render regular posts
            nonPromotedPosts.forEach(post => {
                const postElement = renderPost(post);
                postsContainer.prepend(postElement);
            });

            if (nonPromotedPosts.length === 0) {
                postsContainer.innerHTML = '<p style="text-align: center; margin: 2rem;">No regular posts available.</p>';
            }

            window.dispatchEvent(new Event('postsRendered'));

        } catch (error) {
            console.error('Error fetching posts:', error);
            postsContainer.innerHTML = '<p style="text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">Error loading posts. Please try again later.</p>';
            if (promotedContainer) promotedContainer.innerHTML = '';
        }
    }

    window.redirectToLogin = function() {
        if (window.showToast) {
            window.showToast('Please log in to access this feature', 'error');
            setTimeout(() => {
                window.location.href = 'SignIn.html';
            }, 1000);
        } else {
            window.location.href = 'SignIn.html';
        }
    }

    // Handle Promote button
    document.addEventListener('click', async (event) => {
        if (event.target.closest('.promote-button')) {
            const button = event.target.closest('.promote-button');
            const postId = button.dataset.postId;
            if (!postId) {
                if (showToast) {
                    showToast('Invalid post ID', 'error');
                }
                return;
            }
            window.location.href = `promote.html?postId=${postId}`;
        }

        // Handle promoted video play button
        if (event.target.closest('.promoted-play-btn')) {
            const button = event.target.closest('.promoted-play-btn');
            const videoContainer = button.closest('.promoted-video-container');
            const video = videoContainer.querySelector('.promoted-video');
            const overlay = videoContainer.querySelector('.promoted-video-overlay');
            
            if (video.paused) {
                video.play();
                overlay.style.display = 'none';
            }
        }
    });

    // Initialize auth status
    async function initializeAuthStatus() {
        try {
            if (window.loggedInUser !== undefined) {
                currentLoggedInUser = window.loggedInUser;
            }

            if (currentLoggedInUser) {
                currentFollowingList = await fetchFollowingList();
            }

            isAuthReady = true;
            console.log('Auth initialization complete. User:', currentLoggedInUser);

            await fetchAndRenderPosts();
        } catch (error) {
            console.error('Error initializing auth status:', error);
            isAuthReady = true;
            await fetchAndRenderPosts();
        }
    }

    // Global functions
    window.fetchPosts = fetchAndRenderPosts;

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
                btn.disabled = true;
            } else {
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                btn.style.backgroundColor = '';
                btn.disabled = false;
            }
        });
    };

    // Event listeners
    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser;
        currentFollowingList = await fetchFollowingList();
        console.log('Auth status ready event received. Logged in user:', currentLoggedInUser);

        await fetchAndRenderPosts();
    });

    // Cleanup interval on page unload
    window.addEventListener('beforeunload', () => {
        if (promotedPostsRotationInterval) {
            clearInterval(promotedPostsRotationInterval);
        }
    });

    // Fallback timeouts
    setTimeout(async () => {
        if (!isAuthReady) {
            console.log('Initializing without waiting for auth status...');
            await initializeAuthStatus();
        }
    }, 500);

    setTimeout(async () => {
        if (!isAuthReady) {
            console.log('Auth timeout - proceeding with post fetch...');
            await initializeAuthStatus();
        }
    }, 2000);
});