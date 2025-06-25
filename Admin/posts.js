document.addEventListener('DOMContentLoaded', async function () {
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    const showToast = window.showToast;

    let currentLoggedInUser = null;
    let currentFollowingList = [];
    let isAuthReady = false;
    let allPromotedPosts = [];

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
                <img src="${post.profilePicture || 'default-avater.png'}" class="promoted-avatar" onerror="this.src='default-avater.png'" alt="User Avatar">
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
                    <img src="${post.profilePicture || 'default-avater.png'}" class="post-avatar" onerror="this.src='default-avater.png'" alt="User Avatar">
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

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function createPromotedPostsRow(posts) {
        // Create wrapper container with header
        const wrapperContainer = document.createElement('div');
        wrapperContainer.classList.add('promoted-posts-wrapper');
        wrapperContainer.style.cssText = `
            margin-bottom: 20px;
        `;

        // Create header
        const headerElement = document.createElement('div');
        headerElement.classList.add('promoted-posts-header');
        headerElement.innerHTML = '<h3>Things you may like</h3>';
        headerElement.style.cssText = `
            font-size: 1em;
            font-weight: 600;
            color: #333;
     
        `;

        // Create scrollable container
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
            /* Hide webkit scrollbar */
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

        // Add header and container to wrapper
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

            // Position relative container for arrows
            rowContainer.style.position = 'relative';
            rowContainer.appendChild(prevArrow);
            rowContainer.appendChild(nextArrow);
        }

        return wrapperContainer;
    }

    async function fetchAndRenderPosts(category = '') {
        const postsContainer = document.getElementById('posts-container');

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
                return;
            }

            const promotedPosts = posts.filter(post => post.isPromoted);
            const nonPromotedPosts = posts.filter(post => !post.isPromoted);

            const postsPerPromotedRow = 5;

            // --- Step 1: Render initial set of promoted posts at the very top ---
            // Render up to 5 promoted posts first if available
            if (promotedPosts.length > 0) {
                const initialPromotedPosts = promotedPosts.slice(0, postsPerPromotedRow);
                const promotedRow = createPromotedPostsRow(initialPromotedPosts);
                postsContainer.prepend(promotedRow);
            }

            let promotedPostIndex = postsPerPromotedRow; // Start index for next promoted posts

            // --- Step 2: Intertwine promoted posts with normal posts ---
            for (let i = 0; i < nonPromotedPosts.length; i++) {
                const postElement = renderPost(nonPromotedPosts[i]);
                postsContainer.prepend(postElement);

                // Insert a promoted post row after every 2 normal posts, if available
                if ((i + 1) % 2 === 0 && promotedPostIndex < promotedPosts.length) {
                    const postsForThisPromotedRow = promotedPosts.slice(promotedPostIndex, promotedPostIndex + postsPerPromotedRow);
                    if (postsForThisPromotedRow.length > 0) {
                        const promotedRow = createPromotedPostsRow(postsForThisPromotedRow);
                        postsContainer.prepend(promotedRow);
                        promotedPostIndex += postsPerPromotedRow;
                    }
                }
            }

            // --- Step 3: Append any remaining promoted posts at the end ---
            while (promotedPostIndex < promotedPosts.length) {
                const postsForThisPromotedRow = promotedPosts.slice(promotedPostIndex, promotedPostIndex + postsPerPromotedRow);
                if (postsForThisPromotedRow.length > 0) {
                    const promotedRow = createPromotedPostsRow(postsForThisPromotedRow);
                    postsContainer.prepend(promotedRow);
                    promotedPostIndex += postsPerPromotedRow;
                } else {
                    break;
                }
            }

            if (nonPromotedPosts.length === 0 && promotedPosts.length === 0) {
                postsContainer.innerHTML = '<p style="text-align: center; margin: 2rem;">No posts available.</p>';
            }

            window.dispatchEvent(new Event('postsRendered'));

        } catch (error) {
            console.error('Error fetching posts:', error);
            postsContainer.innerHTML = '<p style="text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">Error loading posts. Please try again later.</p>';
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

    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser;
        currentFollowingList = await fetchFollowingList();
        console.log('Auth status ready event received. Logged in user:', currentLoggedInUser);

        await fetchAndRenderPosts();
    });

    window.addEventListener('beforeunload', () => {
        // No specific interval to clear for promoted posts anymore in this setup.
        // If other intervals are added, they would be cleared here.
    });

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
    }, 2000)
    
})