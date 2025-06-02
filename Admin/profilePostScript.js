document.addEventListener('DOMContentLoaded', async function () {
    let loggedInUser = null; // Define loggedInUser variable
    const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://salmart.onrender.com';

    // Initialize Socket.IO (if available)
    let socket = null;
    if (typeof io !== 'undefined') {
        socket = io(API_BASE_URL, {
            auth: { token: localStorage.getItem('authToken') }
        });
        socket.on('connect', () => {
            console.log('Connected to WebSocket');
        });
        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
        });
    } else {
        console.warn('Socket.IO not available; real-time updates disabled');
    }

    // Function to format time (e.g., "2 hrs ago")
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

    // Check following list
    let followingList = [];
    try {
        followingList = JSON.parse(localStorage.getItem('followingList')) || [];
    } catch (e) {
        console.error("Error parsing followingList:", e);
        followingList = [];
    }

    // Function to check login status
    async function checkLoginStatus() {
        const token = localStorage.getItem('authToken');
        const tokenExpiry = localStorage.getItem('tokenExpiry');

        if (!token || Date.now() > tokenExpiry) {
            console.log('Token expired or missing. Redirecting to login...');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/verify-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const userData = await response.json();
                loggedInUser = userData.userId; // Set loggedInUser to the current user's ID
                fetchPosts(); // Fetch posts after successful login
            } else {
                throw new Error('Token validation failed');
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            fetchPosts(); // Still attempt to fetch posts (for public profiles)
        }
    }

    // Function to show toast notifications
    function showToast(message, bgColor = '#333') {
        let toast = document.createElement("div");
        toast.className = "toast-message show";
        toast.style.backgroundColor = bgColor;
        toast.innerText = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // Function to copy to clipboard
    async function copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            }
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    }

    // Function to open app or web URL
    function openAppOrWeb(appUrl, webUrl) {
        window.location.href = appUrl;
        setTimeout(() => {
            if (!document.hidden) {
                window.open(webUrl, '_blank');
            }
        }, 500);
    }

    // Function to share post
    function sharePost(post, postLink, platform) {
        const shareText = `Check out this product: ${post.description} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}`;
        
        switch(platform) {
            case 'copy':
                copyToClipboard(postLink);
                showToast('Link copied to clipboard!');
                break;
            case 'whatsapp':
                const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareText + '\n' + postLink)}`;
                const whatsappWebUrl = `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + postLink)}`;
                openAppOrWeb(whatsappUrl, whatsappWebUrl);
                break;
            case 'facebook':
                const facebookUrl = `fb://sharer.php?u=${encodeURIComponent(postLink)}`;
                const facebookWebUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postLink)}`;
                openAppOrWeb(facebookUrl, facebookWebUrl);
                break;
            case 'twitter':
                const twitterUrl = `twitter://post?message=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postLink)}`;
                const twitterWebUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postLink)}`;
                openAppOrWeb(twitterUrl, twitterWebUrl);
                break;
            case 'telegram':
                const telegramUrl = `tg://msg_url?url=${encodeURIComponent(postLink)}&text=${encodeURIComponent(shareText)}`;
                const telegramWebUrl = `https://t.me/share/url?url=${encodeURIComponent(postLink)}&text=${encodeURIComponent(shareText)}`;
                openAppOrWeb(telegramUrl, telegramWebUrl);
                break;
            case 'instagram':
                const instagramUrl = `instagram://library?AssetPath=${encodeURIComponent(postLink)}`;
                openAppOrWeb(instagramUrl, `https://www.instagram.com/`);
                break;
        }
    }

    // Function to show share modal
    function showShareModal(post) {
        const shareModal = document.createElement('div');
        shareModal.className = 'share-modal';
        const postLink = `${window.location.origin}/product.html?postId=${post._id}`;
        
        shareModal.innerHTML = `
            <div class="share-modal-content">
                <div class="share-modal-header">
                    <h3>Share this post</h3>
                    <span class="close-share-modal">×</span>
                </div>
                <div class="share-modal-body">
                    <div class="share-options">
                        <button class="share-option" data-platform="copy">
                            <i class="fas fa-copy"></i>
                            <span>Copy Link</span>
                        </button>
                        <button class="share-option" data-platform="whatsapp">
                            <i class="fab fa-whatsapp"></i>
                            <span>WhatsApp</span>
                        </button>
                        <button class="share-option" data-platform="facebook">
                            <i class="fab fa-facebook"></i>
                            <span>Facebook</span>
                        </button>
                        <button class="share-option" data-platform="twitter">
                            <i class="fab fa-twitter"></i>
                            <span>Twitter</span>
                        </button>
                        <button class="share-option" data-platform="telegram">
                            <i class="fab fa-telegram"></i>
                            <span>Telegram</span>
                        </button>
                        <button class="share-option" data-platform="instagram">
                            <i class="fab fa-instagram"></i>
                            <span>Instagram</span>
                        </button>
                    </div>
                    <div class="share-link-container">
                        <input type="text" value="${postLink}" readonly class="share-link-input">
                        <button class="copy-link-button">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(shareModal);
        document.body.style.overflow = 'hidden';

        const closeModal = () => {
            document.body.removeChild(shareModal);
            document.body.style.overflow = '';
        };

        shareModal.querySelector('.close-share-modal').addEventListener('click', closeModal);
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) closeModal();
        });

        const shareOptions = shareModal.querySelectorAll('.share-option');
        shareOptions.forEach(option => {
            option.addEventListener('click', () => {
                const platform = option.getAttribute('data-platform');
                sharePost(post, postLink, platform);
                closeModal();
            });
        });

        shareModal.querySelector('.copy-link-button').addEventListener('click', async () => {
            const success = await copyToClipboard(postLink);
            showToast(success ? 'Link copied to clipboard!' : 'Failed to copy link');
        });
    }

    // Function to initialize video controls
    function initializeVideoControls(postElement) {
        const container = postElement.querySelector('.post-video-container');
        if (!container) return;

        const video = container.querySelector('.post-video');
        const thumbnailCanvas = container.querySelector('.video-thumbnail');
        const loadingSpinner = container.querySelector('.loading-spinner');
        const playPauseBtn = container.querySelector('.play-pause');
        const muteBtn = container.querySelector('.mute-button');
        const fullscreenBtn = container.querySelector('.fullscreen-button');
        const progressBar = container.querySelector('.progress-bar');
        const bufferedBar = container.querySelector('.buffered-bar');
        const progressContainer = container.querySelector('.progress-container');
        const seekPreview = container.querySelector('.seek-preview');
        const seekPreviewCanvas = container.querySelector('.seek-preview-canvas');
        const volumeSlider = container.querySelector('.volume-slider');
        const playbackSpeed = container.querySelector('.playback-speed');
        const currentTimeDisplay = container.querySelector('.current-time');
        const durationDisplay = container.querySelector('.duration');

        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('crossorigin', 'anonymous');

        video.addEventListener('loadedmetadata', () => {
            video.currentTime = 2;
        });

        video.addEventListener('seeked', () => {
            if (video.currentTime === 2 && !video.dataset.thumbnailGenerated) {
                const ctx = thumbnailCanvas.getContext('2d');
                thumbnailCanvas.width = video.videoWidth;
                thumbnailCanvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
                video.poster = thumbnailCanvas.toDataURL('image/jpeg');
                video.dataset.thumbnailGenerated = 'true';
                video.currentTime = 0;
            }
        });

        function formatVideoTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }

        video.addEventListener('loadedmetadata', () => {
            durationDisplay.textContent = formatVideoTime(video.duration);
        });

        video.addEventListener('timeupdate', () => {
            const progress = (video.currentTime / video.duration) * 100;
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            currentTimeDisplay.textContent = formatVideoTime(video.currentTime);

            if (video.buffered.length > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const bufferedPercent = (bufferedEnd / video.duration) * 100;
                bufferedBar.style.width = `${bufferedPercent}%`;
            }
        });

        playPauseBtn.addEventListener('click', () => {
            if (video.paused) {
                loadingSpinner.style.display = 'block';
                video.play().then(() => {
                    loadingSpinner.style.display = 'none';
                    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                }).catch(e => {
                    loadingSpinner.style.display = 'none';
                    showToast('Error playing video.', '#dc3545');
                    console.error('Play error:', e);
                });
            } else {
                video.pause();
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        });

        video.addEventListener('canplay', () => {
            loadingSpinner.style.display = 'none';
        });

        muteBtn.addEventListener('click', () => {
            video.muted = !video.muted;
            muteBtn.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
            volumeSlider.value = video.muted ? 0 : video.volume * 100;
        });

        volumeSlider.addEventListener('input', () => {
            video.volume = volumeSlider.value / 100;
            video.muted = volumeSlider.value == 0;
            muteBtn.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        });

        playbackSpeed.addEventListener('change', () => {
            video.playbackRate = parseFloat(playbackSpeed.value);
        });

        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                const elem = container;
                if (elem.requestFullscreen) {
                    elem.requestFullscreen().catch(e => console.error('Fullscreen error:', e));
                } else if (elem.webkitRequestFullscreen) {
                    elem.webkitRequestFullscreen();
                }
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(e => console.error('Exit fullscreen error:', e));
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            }
        });

        document.addEventListener('webkitfullscreenchange', () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            }
        });

        let isDragging = false;

        const updateProgress = (e, isTouch = false) => {
            const rect = progressContainer.getBoundingClientRect();
            const posX = isTouch ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
            const width = rect.width;
            let progress = posX / width;
            progress = Math.max(0, Math.min(1, progress));
            const seekTime = progress * video.duration;
            video.currentTime = seekTime;
            progressBar.style.width = `${progress * 100}%`;
            progressBar.setAttribute('aria-valuenow', progress * 100);

            seekPreview.style.left = `${posX}px`;
            seekPreviewCanvas.width = 120;
            seekPreviewCanvas.height = 68;
            video.currentTime = seekTime;
            setTimeout(() => {
                const ctx = seekPreviewCanvas.getContext('2d');
                ctx.drawImage(video, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
                video.currentTime = seekTime;
            }, 100);
        };

        progressContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            updateProgress(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) updateProgress(e);
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            seekPreview.style.display = 'none';
        });

        progressContainer.addEventListener('mousemove', (e) => {
            if (!isDragging) {
                const rect = progressContainer.getBoundingClientRect();
                const posX = e.clientX - rect.left;
                const width = rect.width;
                let progress = posX / width;
                progress = Math.max(0, Math.min(1, progress));
                const seekTime = progress * video.duration;
                seekPreview.style.display = 'block';
                seekPreview.style.left = `${posX}px`;
                seekPreviewCanvas.width = 120;
                seekPreviewCanvas.height = 68;
                video.currentTime = seekTime;
                setTimeout(() => {
                    const ctx = seekPreviewCanvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
                    video.currentTime = video.currentTime;
                }, 100);
            }
        });

        progressContainer.addEventListener('mouseleave', () => {
            if (!isDragging) seekPreview.style.display = 'none';
        });

        progressContainer.addEventListener('click', (e) => {
            updateProgress(e);
        });

        progressContainer.addEventListener('touchstart', (e) => {
            isDragging = true;
            updateProgress(e, true);
        });

        document.addEventListener('touchmove', (e) => {
            if (isDragging) updateProgress(e, true);
        });

        document.addEventListener('touchend', () => {
            isDragging = false;
            seekPreview.style.display = 'none';
        });

        postElement.addEventListener('keydown', (e) => {
            if (e.target === video || e.target === container) {
                switch (e.key) {
                    case ' ':
                        e.preventDefault();
                        playPauseBtn.click();
                        break;
                    case 'm':
                        muteBtn.click();
                        break;
                    case 'f':
                        fullscreenBtn.click();
                        break;
                }
            }
        });

        video.addEventListener('error', () => {
            showToast('Failed to load video.', '#dc3545');
            loadingSpinner.style.display = 'none';
        });

        video.addEventListener('ended', () => {
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            video.currentTime = 0;
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        });
    }

    // Function to fetch and display posts for the profile owner
    async function fetchPosts() {
        const urlParams = new URLSearchParams(window.location.search);
        let profileOwnerId = urlParams.get('userId'); // Get userId from URL query parameter

        // If no userId in URL, fall back to logged-in user's ID
        if (!profileOwnerId) {
            profileOwnerId = loggedInUser || localStorage.getItem('userId');
        }

        // If still no profileOwnerId, log error and exit
        if (!profileOwnerId) {
            console.log('No userId found in URL or localStorage');
            return;
        }

        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            console.error('Posts container not found.');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/post?userId=${profileOwnerId}`);
            if (!response.ok) throw new Error('Failed to fetch posts');

            const posts = await response.json();
            postsContainer.innerHTML = ''; // Clear existing posts

            posts.forEach(post => {
                if (post.createdBy.userId === profileOwnerId) { // Only display posts by the profile owner
                    const isFollowing = post.isFollowing === true || post.isFollowing === 'true';
                    console.log(`Post by ${post.createdBy.userId}, loggedInUser: ${loggedInUser}, isFollowing: ${isFollowing}`);

                    const postElement = document.createElement('div');
                    postElement.classList.add('post');
                    postElement.dataset.postId = post._id || '';

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
                            <img src="${post.photo || 'default-image.png'}" class="post-image" onclick="openImage('${post.photo || 'default-image.png'}')" alt="Product Image">
                        `;
                        productDetails = `
                            <div class="product-info">
                                <span class="icon">📦</span>
                                <div>
                                    <p class="label">Product</p>
                                    <p class="value">${post.description}</p>
                                </div>
                            </div>
                            <div class="product-info">
                                <span class="icon">🔄</span>
                                <div>
                                    <p class="label">Condition</p>
                                    <p class="value">${post.productCondition}</p>
                                </div>
                            </div>
                            <div class="product-info-inline">
                                <div class="info-item">
                                    <span class="icon">💵</span>
                                    <div>
                                        <p class="label">Price</p>
                                        <p class="value price-value">₦${Number(post.price).toLocaleString('en-Ng')}</p>
                                    </div>
                                </div>
                                <div class="info-item">
                                    <span class="icon">📍</span>
                                    <div>
                                        <p class="label">Location</p>
                                        <p class="value location-value">${post.location}</p>
                                    </div>
                                </div>
                            </div>
                        `;
                        buttonContent = `
                            <button class="buy-now-button" data-post-id="${post._id}" ${post.isSold ? 'disabled' : ''}>
                                <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                            </button>
                            <a id="send-message-link">
                                <button class="buy-now-button send-message-btn" id="send-message-btn"
                                    data-recipient-id="${post.createdBy.userId}"
                                    data-product-image="${productImageForChat}"
                                    data-product-description="${post.description}"
                                    ${post.isSold ? 'disabled' : ''}>
                                    <i class="fas fa-circle-dot"></i> ${post.isSold ? 'Unavailable' : 'Check Availability'}
                                </button>
                            </a>
                        `;
                    }

                    postElement.innerHTML = `
                        <div class="post-header">
                            <a href="Profile.html?userId=${post.createdBy.userId}">
                                <img src="${post.profilePicture || 'default-avatar.png'}" class="post-avatar">
                            </a>
                            <div class="post-user-info">
                                <a href="Profile.html?userId=${post.createdBy.userId}">
                                    <h4 class="post-user-name">${post.createdBy.name}</h4>
                                </a>
                                <p class="post-time">${formatTime(post.createdAt)}</p>
                            </div>
                            ${post.createdBy.userId !== loggedInUser ?
                                followingList.includes(post.createdBy.userId) ?
                                    `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #28a745;">
                                        <i class="fas fa-user-check"></i> Following
                                    </button>` :
                                    `<button class="follow-button" data-user-id="${post.createdBy.userId}">
                                        <i class="fas fa-user-plus"></i> Follow
                                    </button>`
                                : ''}
                            <div class="post-options">
                                <button class="post-options-button"><i class="fas fa-ellipsis-h"></i></button>
                                <div class="post-options-menu">
                                    <ul>
                                        ${post.createdBy.userId === loggedInUser ? `
                                            <li><button class="delete-post-button" data-post-id="${post._id}">Delete Post</button></li>
                                            <li><button class="edit-post-button" data-post-id="${post._id}">Edit Post</button></li>
                                        ` : ''}
                                        <li><button class="report-post-button" data-post-id="${post._id}">Report Post</button></li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div class="product-container">
                            <div class="product-card">
                                ${productDetails}
                            </div>
                            <div class="image-card">
                                ${mediaContent}
                            </div>
                        </div>
                        <div class="buy" style="text-align: center">
                            ${post.createdBy.userId !== loggedInUser ? buttonContent : ''}
                        </div>
                        <div class="post-actions">
                            <button class="action-button like-button">
                                <i class="${post.likes.includes(loggedInUser) ? 'fas' : 'far'} fa-heart"></i>
                                <span class="like-count">${post.likes.length}</span> <p>Likes</p>
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
                    postsContainer.prepend(postElement);
                    initializeVideoControls(postElement);

                    // Like functionality
                    const likeButton = postElement.querySelector('.like-button');
                    likeButton.addEventListener('click', async () => {
                        const likeCountElement = likeButton.querySelector('.like-count');
                        const icon = likeButton.querySelector('i');
                        const postId = post._id;

                        let currentLikes = parseInt(likeCountElement.textContent, 10);
                        let isLiked = icon.classList.contains('fas');

                        icon.classList.toggle('fas', !isLiked);
                        icon.classList.toggle('far', isLiked);
                        likeCountElement.textContent = isLiked ? currentLikes - 1 : currentLikes + 1;

                        try {
                            const response = await fetch(`${API_BASE_URL}/post/like/${postId}`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                            });

                            if (!response.ok) throw new Error('Failed to like/unlike post');

                            const data = await response.json();
                            likeCountElement.textContent = data.likes.length;
                            if (data.likes.includes(loggedInUser)) {
                                icon.classList.add('fas');
                                icon.classList.remove('far');
                            } else {
                                icon.classList.add('far');
                                icon.classList.remove('fas');
                            }

                            if (!isLiked) {
                                socket.emit('likePost', { postId, userId: loggedInUser });
                            }
                        } catch (error) {
                            console.error('Error liking/unliking post:', error);
                            icon.classList.toggle('fas', isLiked);
                            icon.classList.toggle('far', !isLiked);
                            likeCountElement.textContent = currentLikes;
                        }
                    });

                    // Comment toggle
                    const commentToggleButton = postElement.querySelector('.reply-button');
                    commentToggleButton.addEventListener('click', () => {
                        window.location.href = `product.html?postId=${post._id}`;
                    });

                    // Buy now functionality
                    const buyNowButton = postElement.querySelector('.buy-now-button[data-post-id]');
                    if (buyNowButton) {
                        buyNowButton.addEventListener('click', async () => {
                            const postId = buyNowButton.getAttribute('data-post-id').trim();
                            const email = localStorage.getItem('email');
                            const buyerId = localStorage.getItem('userId');

                            if (!email || !buyerId) {
                                showToast("Please log in to make a purchase.", '#dc3545');
                                return;
                            }

                            try {
                                const response = await fetch(`${API_BASE_URL}/pay`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ email, postId, buyerId }),
                                });

                                const result = await response.json();
                                if (result.success) {
                                    window.location.href = result.url;
                                } else {
                                    showToast("Payment failed!", '#dc3545');
                                }
                            } catch (error) {
                                console.error("Error processing payment:", error);
                                showToast("Payment error!", '#dc3545');
                            }
                        });
                    }

                    // Check availability functionality
                    const sendMessageBtn = postElement.querySelector("#send-message-btn");
                    if (sendMessageBtn) {
                        if (post.isSold) {
                            sendMessageBtn.disabled = true;
                        }
                        const sendMessageLink = postElement.querySelector("#send-message-link");
                        sendMessageBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            const recipientId = sendMessageBtn.dataset.recipientId;
                            const recipientUsername = post.createdBy.name;
                            const recipientProfilePictureUrl = post.profilePicture || 'default-avatar.png';
                            const productImage = sendMessageBtn.dataset.productImage;
                            const productDescription = sendMessageBtn.dataset.productDescription;

                            const message = `Is this item still available?\n\nProduct: ${productDescription}\nImage: ${productImage}`;
                            const userId = localStorage.getItem("userId");

                            sendMessageLink.href = `Chats.html?user_id=${userId}&recipient_id=${recipientId}&recipient_username=${recipientUsername}&recipient_profile_picture_url=${recipientProfilePictureUrl}&message=${encodeURIComponent(message)}`;
                            window.location.href = sendMessageLink.href;
                        });
                    }

                    if (post.createdBy.userId === loggedInUser) {
                        const buyDiv = postElement.querySelector('.buy');
                        if (buyDiv) {
                            buyDiv.remove();
                        }
                    }

                    // Post menu functionality
                    const optionsButton = postElement.querySelector('.post-options-button');
                    const optionsMenu = postElement.querySelector('.post-options-menu');
                    optionsButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        document.querySelectorAll('.post-options-menu.show').forEach(menu => {
                            if (menu !== optionsMenu) menu.classList.remove('show');
                        });
                        optionsMenu.classList.toggle('show');
                    });

                    // Share functionality
                    const shareButton = postElement.querySelector('.share-button');
                    shareButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showShareModal(post);
                    });

                    // Report post functionality
                    const reportButton = postElement.querySelector('.report-post-button');
                    reportButton.addEventListener('click', async () => {
                        const postId = reportButton.getAttribute('data-post-id');
                        const authToken = localStorage.getItem('authToken');

                        if (!authToken) {
                            showToast("Please log in to report posts", '#dc3545');
                            return;
                        }

                        const reportModal = document.createElement('div');
                        reportModal.className = 'report-modal';
                        reportModal.innerHTML = `
                            <div class="report-modal-content">
                                <div class="report-modal-header">
                                    <h3>Report Ad</h3>
                                    <span class="close-modal">×</span>
                                </div>
                                <div class="report-modal-body">
                                    <p>Please select the reason for reporting this ad:</p>
                                    <div class="report-reasons">
                                        <label class="report-reason">
                                            <input type="radio" name="report-reason" value="Spam">
                                            <span>Spam or misleading content</span>
                                        </label>
                                        <label class="report-reason">
                                            <input type="radio" name="report-reason" value="Inappropriate">
                                            <span>Inappropriate content</span>
                                        </label>
                                        <label class="report-reason">
                                            <input type="radio" name="report-reason" value="Harassment">
                                            <span>Harassment or bullying</span>
                                        </label>
                                        <label class="report-reason">
                                            <input type="radio" name="report-reason" value="Scam">
                                            <span>Scam or fraud</span>
                                        </label>
                                        <label class="report-reason">
                                            <input type="radio" name="report-reason" value="Other">
                                            <span>Other (please specify)</span>
                                        </label>
                                    </div>
                                    <div class="other-reason-container" style="display: none;">
                                        <textarea id="other-reason" placeholder="Please provide details..." rows="3"></textarea>
                                    </div>
                                </div>
                                <div class="report-modal-footer">
                                    <button class="cancel-report">Cancel</button>
                                    <button class="submit-report" disabled>Submit Report</button>
                                </div>
                            </div>
                        `;

                        document.body.appendChild(reportModal);
                        document.body.style.overflow = 'hidden';

                        const radioButtons = reportModal.querySelectorAll('input[type="radio"]');
                        const otherReasonContainer = reportModal.querySelector('.other-reason-container');
                        const submitButton = reportModal.querySelector('.submit-report');

                        radioButtons.forEach(radio => {
                            radio.addEventListener('change', () => {
                                submitButton.disabled = false;
                                if (radio.value === 'Other') {
                                    otherReasonContainer.style.display = 'block';
                                } else {
                                    otherReasonContainer.style.display = 'none';
                                }
                            });
                        });

                        const closeModal = () => {
                            document.body.removeChild(reportModal);
                            document.body.style.overflow = '';
                        };

                        reportModal.querySelector('.close-modal').addEventListener('click', closeModal);
                        reportModal.querySelector('.cancel-report').addEventListener('click', closeModal);
                        reportModal.addEventListener('click', (e) => {
                            if (e.target === reportModal) closeModal();
                        });

                        submitButton.addEventListener('click', async () => {
                            const selectedReason = reportModal.querySelector('input[name="report-reason"]:checked').value;
                            let reportDetails = selectedReason;

                            if (selectedReason === 'Other') {
                                const otherDetails = reportModal.querySelector('#other-reason').value.trim();
                                if (!otherDetails) {
                                    showToast("Please provide details for your report", '#dc3545');
                                    return;
                                }
                                reportDetails += `: ${otherDetails}`;
                            }

                            try {
                                const response = await fetch(`${API_BASE_URL}/post/report/${postId}`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${authToken}`,
                                    },
                                    body: JSON.stringify({ 
                                        reason: reportDetails,
                                        postDescription: post.description 
                                    }),
                                });

                                const result = await response.json();

                                if (!response.ok) {
                                    throw new Error(result.message || 'Failed to report post');
                                }

                                reportButton.innerHTML = '<i class="fas fa-flag"></i> Reported';
                                reportButton.disabled = true;
                                reportButton.style.color = '#ff0000';
                                showToast(result.message || 'Post reported successfully! Admin will review it shortly.', '#28a745');
                                closeModal();
                            } catch (error) {
                                console.error('Error reporting post:', error);
                                showToast(error.message || 'Error reporting post. Please try again.', '#dc3545');
                            }
                        });
                    });

                    // Delete post functionality
                    const deleteButton = postElement.querySelector('.delete-post-button');
                    if (deleteButton) {
                        deleteButton.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const postId = deleteButton.getAttribute('data-post-id');
                            const authToken = localStorage.getItem('authToken');

                            const modal = document.createElement('div');
                            modal.className = 'delete-confirmation-modal';
                            modal.innerHTML = `
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h3>Delete Product</h3>
                                        <span class="close-delete-modal">×</span>
                                    </div>
                                    <div class="modal-body">
                                        <p>Are you sure you want to delete this product? This action cannot be undone.</p>
                                    </div>
                                    <div class="modal-footer">
                                        <button class="cancel-delete">Cancel</button>
                                        <button class="confirm-delete">Delete</button>
                                    </div>
                                </div>
                            `;

                            document.body.appendChild(modal);
                            document.body.style.overflow = 'hidden';

                            const closeModal = () => {
                                document.body.removeChild(modal);
                                document.body.style.overflow = '';
                            };

                            modal.querySelector('.close-delete-modal').addEventListener('click', closeModal);
                            modal.querySelector('.cancel-delete').addEventListener('click', closeModal);
                            modal.addEventListener('click', (e) => {
                                if (e.target === modal) closeModal();
                            });

                            modal.querySelector('.confirm-delete').addEventListener('click', async () => {
                                try {
                                    const response = await fetch(`${API_BASE_URL}/post/delete/${postId}`, {
                                        method: 'DELETE',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${authToken}`,
                                        },
                                    });

                                    if (!response.ok) {
                                        const errorData = await response.json();
                                        throw new Error(errorData.message || 'Failed to delete post');
                                    }

                                    postElement.style.transition = 'opacity 0.3s, transform 0.3s';
                                    postElement.style.opacity = '0';
                                    postElement.style.transform = 'translateX(-20px)';
                                    setTimeout(() => {
                                        postElement.remove();
                                        showToast('Post deleted successfully!', '#28a745');
                                    }, 300);
                                    closeModal();
                                } catch (error) {
                                    console.error('Error deleting post:', error);
                                    showToast(error.message || 'Error deleting post. Please try again.', '#dc3545');
                                    closeModal();
                                }
                            });
                        });
                    }

                    // Edit post functionality
                    const editButton = postElement.querySelector('.edit-post-button');
                    if (editButton) {
                        editButton.addEventListener('click', () => {
                            const postId = editButton.getAttribute('data-post-id');
                            window.location.href = `Ads.html?edit=true&postId=${postId}`;
                        });
                    }

                    // Close menu on outside click
                    document.addEventListener('click', () => {
                        document.querySelectorAll('.post-options-menu.show').forEach(menu => {
                            menu.classList.remove('show');
                        });
                    });
                }
            });
        } catch (error) {
            console.error('Error fetching posts:', error);
        }
    }

    // Follow button handler
    document.querySelectorAll('.follow-button').forEach(followButton => {
        followButton.addEventListener('click', async () => {
            const userIdToFollow = followButton.getAttribute('data-user-id');
            const token = localStorage.getItem('authToken');

            if (!token) {
                showToast('Please log in to follow users', '#dc3545');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/follow/${userIdToFollow}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const text = await response.text();
                const result = text ? JSON.parse(text) : {};

                let followingList = JSON.parse(localStorage.getItem('followingList')) || [];
                if (!followingList.includes(userIdToFollow)) {
                    followingList.push(userIdToFollow);
                    localStorage.setItem('followingList', JSON.stringify(followingList));
                }

                document.querySelectorAll(`.follow-button[data-user-id="${userIdToFollow}"]`).forEach(button => {
                    button.innerHTML = `<i class="fas fa-user-check"></i> Following`;
                    button.style.backgroundColor = '#28a745';
                });

                showToast(`You are now following this user!`, '#28a745');
            } catch (error) {
                console.error('Error following user:', error);
                showToast(error.message || 'Failed to follow user. Please try again.', '#dc3545');
            }
        });
    });

    // Initialize by checking login status
    checkLoginStatus();
});