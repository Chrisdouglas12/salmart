// post-renderer.js
import { salmartCache } from './salmartCache.js';

document.addEventListener('DOMContentLoaded', async function () {
    let currentLoggedInUser = localStorage.getItem('userId');
    let isAuthReady = false;

    // --- State variables for pagination ---
    let currentPage = 1;
    let isLoading = false;

    // Define API_BASE_URL and SOCKET_URL once
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';

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
        if (window.showToast) window.showToast('Failed to connect to real-time updates. Some features may be delayed.', '#dc3545');
    });

    // Listen for profile picture updates
    socket.on('profilePictureUpdate', ({ userId, profilePicture }) => {
        console.log(`Received profile picture update for user ${userId}`);
        updateProfilePictures(userId, profilePicture);
    });

    // Function to update profile pictures in the UI
    function updateProfilePictures(userId, profilePicture) {
        const cacheBustedUrl = `${profilePicture}?v=${Date.now()}`;
        document.querySelectorAll(`img.post-avatar[data-user-id="${userId}"]`).forEach(img => {
            img.src = cacheBustedUrl;
            img.onerror = () => { img.src = '/salmart-192x192.png'; };
        });
    }

/**
 * Formats a timestamp into a human-readable relative time string.
 * @param {string} timestamp - The ISO timestamp string.
 * @returns {string} - Formatted time string (e.g., "5m", "3h", "Jul 23").
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
 * @returns {string} - The escaped HTML string.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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

    function openAppOrWeb(appUrl, webUrl) {
        window.location.href = appUrl;
        setTimeout(() => {
            // Check if the app opened (by checking if the document is hidden)
            // If not, open the web URL as a fallback.
            if (document.visibilityState === 'visible') { // Means app didn't take over
                window.open(webUrl, '_blank');
            }
        }, 500); // Give the app a moment to launch
    }

    function sharePost(post, postLink, platform) {
        // Use a more generic description if title is not available for video ads
        const shareText = `Check out this product: ${post.title || post.description} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}`;

        switch(platform) {
            case 'copy':
                copyToClipboard(postLink);
                if (window.showToast) window.showToast('Link copied to clipboard!', '#28a745');
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
                // Instagram sharing is complex for direct content. Often requires image/video to be on device.
                // For web, it usually means directing to their site. The app link below is often for deep-linking profiles or specific posts if you have their ID.
                // For simplicity, for an actual product, this might redirect to their general app or web.
                const instagramWebUrl = `https://www.instagram.com/explore/tags/product/`; // A generic tag search or just instagram.com
                // Note: direct sharing of external content to Instagram feed is usually not supported via URL schemes.
                // The following line for appUrl is likely not what's expected for sharing
                const instagramAppUrl = `instagram://app`; // This might just open the app.
                openAppOrWeb(instagramAppUrl, instagramWebUrl);
                break;
        }
    }

    function showShareModal(post) {
        const shareModal = document.createElement('div');
        shareModal.className = 'share-modal';
        // Construct the post link dynamically based on postType
        const postLink = post.postType === 'video_ad' ?
            `${window.location.origin}/video-ad.html?postId=${post._id}` : // Assuming a dedicated page for video ads
            `${window.location.origin}/product.html?postId=${post._id}`;

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

        shareModal.querySelectorAll('.share-option').forEach(option => {
            option.addEventListener('click', () => {
                const platform = option.getAttribute('data-platform');
                sharePost(post, postLink, platform);
                closeModal();
            });
        });

        shareModal.querySelector('.copy-link-button').addEventListener('click', async () => {
            const success = await copyToClipboard(postLink);
            if (window.showToast) window.showToast(success ? 'Link copied to clipboard!' : 'Failed to copy link', success ? '#28a745' : '#dc3545');
        });
    }

    // --- Placeholder and Lazy Loading Utility ---

    const DEFAULT_PLACEHOLDER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    function lazyLoadImage(imgElement, originalSrc) {
        imgElement.src = DEFAULT_PLACEHOLDER_IMAGE;
        imgElement.classList.add('lazy-loading');

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const lazyImage = entry.target;
                    lazyImage.src = originalSrc;
                    lazyImage.onload = () => {
                        lazyImage.classList.remove('lazy-loading');
                        lazyImage.classList.add('loaded');
                        observer.unobserve(lazyImage);
                    };
                    lazyImage.onerror = () => {
                        lazyImage.src = '/salmart-192x192.png';
                        lazyImage.classList.remove('lazy-loading');
                        console.error(`Failed to load image: ${originalSrc}`);
                        observer.unobserve(lazyImage);
                    };
                }
            });
        }, {
            rootMargin: '0px 0px 200px 0px',
            threshold: 0.01
        });

        observer.observe(imgElement);
    }

    function lazyLoadVideo(videoElement) {
        const sourceElements = videoElement.querySelectorAll('source[data-src]');
        // Only load if video has sources or an original src set
        if (sourceElements.length === 0 && !videoElement.dataset.originalSrc) return;

        if (!window.videoIntersectionObserver) {
            window.videoIntersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const video = entry.target;
                    if (entry.isIntersecting) {
                        // Ensure sources are set if they have data-src
                        sourceElements.forEach(source => {
                            if (source.dataset.src && !source.src) { // Only set src if not already set
                                source.src = source.dataset.src;
                            }
                        });
                        // Set video src if not already set and originalSrc exists
                        if (video.dataset.originalSrc && !video.src) {
                            video.src = video.dataset.originalSrc;
                        }

                        // Only load if there's actually a src or source to load
                        if (video.src || sourceElements.length > 0) {
                            video.load();
                        }
                        video.classList.remove('lazy-loading');
                        video.classList.add('loaded');
                        if (video.paused && video.readyState >= 3) { // Check if video is ready to play
                            video.play().catch(e => console.warn("Video auto-play blocked or error:", e));
                        }
                    } else {
                        if (!video.paused && !video.ended) {
                            video.pause();
                        }
                    }
                });
            }, {
                rootMargin: '0px 0px 300px 0px',
                threshold: 0.5
            });
        }

        videoElement.classList.add('lazy-loading');
        window.videoIntersectionObserver.observe(videoElement);
    }


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

        function formatVideoTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }

        // Event listener for when video metadata is loaded
        video.addEventListener('loadedmetadata', () => {
            // Generate thumbnail if not already generated and video has duration
            if (!video.dataset.thumbnailGenerated && video.duration > 0) {
                video.currentTime = Math.min(2, video.duration / 2); // Seek to 2 seconds or half duration
            }
            durationDisplay.textContent = formatVideoTime(video.duration);
        });

        // Event listener for when video seeking is complete
        video.addEventListener('seeked', () => {
            // Only draw thumbnail if currentTime is valid and thumbnail not generated
            if (video.currentTime > 0 && !video.dataset.thumbnailGenerated) {
                const ctx = thumbnailCanvas.getContext('2d');
                // Set canvas dimensions to match video to avoid distortion
                thumbnailCanvas.width = video.videoWidth;
                thumbnailCanvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
                video.dataset.thumbnailGenerated = 'true'; // Mark thumbnail as generated
                video.currentTime = 0; // Reset video to start
            }
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
                    if (e.name === 'NotAllowedError') {
                        if (window.showToast) window.showToast('Video auto-play blocked by browser. Please tap video to play.', '#dc3545');
                    } else {
                        if (window.showToast) window.showToast('Error playing video.', '#dc3545');
                    }
                    console.error('Play error:', e);
                });
            } else {
                video.pause();
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        });


        video.addEventListener('waiting', () => {
            loadingSpinner.style.display = 'block';
        });

        video.addEventListener('playing', () => {
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
                const elem = container; // Fullscreen the container, not just the video
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

            if (isTouch) seekPreview.style.display = 'none'; // Hide preview on touch
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
            seekPreview.style.display = 'none'; // Hide preview when drag ends
        });

        // Show seek preview on hover
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
                seekPreviewCanvas.width = 120; // Set a fixed width for the preview canvas
                seekPreviewCanvas.height = 68; // Set a fixed height for the preview canvas

                // Draw frame preview
                if (video.readyState >= 1) { // Check if video has enough data
                    const originalTime = video.currentTime;
                    video.currentTime = seekTime; // Temporarily jump to seek time
                    // Use a small timeout to allow the video to render the frame
                    setTimeout(() => {
                        const ctx = seekPreviewCanvas.getContext('2d');
                        ctx.drawImage(video, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
                        video.currentTime = originalTime; // Revert to original time
                    }, 50); // Short delay
                }
            }
        });

        progressContainer.addEventListener('mouseleave', () => {
            if (!isDragging) seekPreview.style.display = 'none';
        });

        progressContainer.addEventListener('click', (e) => {
            updateProgress(e);
        });

        // Touch events for mobile
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

        // Keyboard controls
        postElement.addEventListener('keydown', (e) => {
            if (e.target === video || e.target === container) { // Ensure keydown is for video or its container
                switch (e.key) {
                    case ' ':
                        e.preventDefault(); // Prevent scrolling with spacebar
                        playPauseBtn.click();
                        break;
                    case 'm':
                        muteBtn.click();
                        break;
                    case 'f':
                        fullscreenBtn.click();
                        break;
                    case 'ArrowRight':
                        video.currentTime += 5; // Skip forward 5 seconds
                        break;
                    case 'ArrowLeft':
                        video.currentTime -= 5; // Skip backward 5 seconds
                        break;
                }
            }
        });

        video.addEventListener('error', () => {
            if (window.showToast) window.showToast('Failed to load video.', '#dc3545');
            loadingSpinner.style.display = 'none';
        });

        video.addEventListener('ended', () => {
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            video.currentTime = 0; // Reset video to start
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        });
    }

    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';
        // Ensure createdBy.userId is properly accessed
        postElement.dataset.userId = post.createdBy && post.createdBy.userId ? post.createdBy.userId._id || post.createdBy.userId : '';

        const isPostCreator = post.createdBy &&
                             (post.createdBy.userId === currentLoggedInUser ||
                              (post.createdBy.userId && post.createdBy.userId._id && post.createdBy.userId._id.toString() === currentLoggedInUser)); // Handle populated userId object
        let productDetails = '';
        let mediaContent = '';
        let descriptionContent = '';
        let buttonContent = '';

        // Determine the correct image for chat, prioritizing photo for regular posts and thumbnail for video ads
        const productImageForChat = post.postType === 'video_ad' ?
                                    (post.thumbnail || '/salmart-192x192.png') :
                                    (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
            descriptionContent = `
                <h2 class="product-title">${escapeHtml(post.title || '')}</h2>
                <div class="post-description-text" style="margin-bottom: 10px; padding: 0 15px;">
                    <p>${escapeHtml(post.description || '')}</p>
                </div>
            `;
            mediaContent = `
                <div class="post-video-container">
                    <video class="post-video" preload="none" aria-label="Video ad for ${escapeHtml(post.description || 'product')}" poster="${post.thumbnail || '/salmart-192x192.png'}" data-original-src="${post.video || ''}">
                        <source data-src="${post.video || ''}" type="video/mp4" />
                        <source data-src="${post.video ? post.video.replace(/\.mp4$/, '.webm') : ''}" type="video/webm" />
                        <source data-src="${post.video ? post.video.replace(/\.mp4$/, '.ogg') : ''}" type="video/ogg" />
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

            buttonContent = `
                <div class="actions">
                    <a href="${post.productLink || '#'}" class="checkout-product-btn" aria-label="Check out product ${escapeHtml(post.description || 'product')}" ${!post.productLink ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                        <i class="fas fa-shopping-cart"></i> Check Out Product
                    </a>
                </div>
            `;
        } else { // Regular post
            descriptionContent = `
                <h2 class="product-title">${escapeHtml(post.title || 'No title')}</h2>
                <div class="post-description-text" style="margin-bottom: 10px;">
                    <p>${escapeHtml(post.description || '')}</p>
                </div>
            `;
            mediaContent = `
                <div class="product-image">
                    <div class="badge">${post.productCondition || 'New'}</div>
                    <img class="post-image" onclick="window.openImage('${productImageForChat.replace(/'/g, "\\'")}')" alt="Product Image" onerror="this.src='/salmart-192x192.png'">
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
                                ${post.isSold ? 'disabled title="Cannot promote a sold out post"' : ''}
                            >
                                ${post.isSold ? 'Sold Out' : 'Promote Post'}
                            </button>
                        </div>
                    ` : `
                        <a href="javascript:void(0);" style="pointer-events: none; color: #28a745; font-size: 14px; font-weight: 400; display: inline-block; padding: 8px 15px; border-radius: 5px; background-color: #e6ffe6;">
                            <i class="fas fa-toggle-on"></i> Active Promotion
                        </a>
                    `;
                } else {
                    buttonContent = `
                        <div class="actions">
                            <button class="btn btn-secondary send-message-btn"
                                data-recipient-id="${post.createdBy && post.createdBy.userId ? post.createdBy.userId._id || post.createdBy.userId : ''}"
                                data-product-image="${productImageForChat}"
                                data-product-description="${escapeHtml(post.title || '')}"
                                data-post-id="${post._id || ''}"
                                ${post.isSold ? 'disabled' : ''}>
                                <i class="fas fa-paper-plane"></i> ${post.isSold ? 'Unavailable' : 'Message'}
                            </button>
                            <button class="btn btn-primary buy-now-button"
                                    data-post-id="${post._id || ''}"
                                    data-product-image="${productImageForChat}"
                                    data-product-title="${escapeHtml(post.title || 'Untitled Product')}"
                                    data-product-description="${escapeHtml(post.description || 'No description available.')}"
                                    data-product-location="${escapeHtml(post.location || 'N/A')}"
                                    data-product-condition="${escapeHtml(post.productCondition || 'N/A')}"
                                    data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}"
                                    data-seller-id="${post.createdBy && post.createdBy.userId ? post.createdBy.userId._id || post.createdBy.userId : ''}"
                                    ${post.isSold ? 'disabled' : ''}>
                                <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                            </button>
                        </div>
                    `;
                }
            } else { // Not logged in
                buttonContent = `
                    <div class="actions">
                        <button class="btn btn-secondary login-required" onclick="window.redirectToLogin()">
                            <i class="fas fa-paper-plane"></i> Message
                        </button>
                        <button class="btn btn-primary login-required" onclick="window.redirectToLogin()">
                            <i class="fas fa-shopping-cart"></i> Buy Now
                        </button>
                    </div>
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
                <button class="action-button login-required" onclick="window.redirectToLogin()">
                    <i class="far fa-heart"></i>
                    <span class="like-count">${post.likes ? post.likes.length : 0}</span> <span>Likes</span>
                </button>
                <button class="action-button login-required" onclick="window.redirectToLogin()">
                    <i class="far fa-comment-alt"></i>
                    <span class="comment-count">${post.comments ? post.comments.length : 0}</span> <span>Comments</span>
                </button>
               <button class="action-button share-button" data-post-id="${post._id || ''}">
  <i class="fas fa-share"></i> Share
</button>
            </div>
        `;
        // Determine the user ID for the profile link
        const profileLinkUserId = post.createdBy && post.createdBy.userId ? (post.createdBy.userId._id || post.createdBy.userId) : '';

        postElement.innerHTML = `
            <div class="post-header">
                <a href="Profile.html?userId=${profileLinkUserId}">
                    <img class="post-avatar" data-user-id="${profileLinkUserId}" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
                </a>
                <div class="post-user-info">
                    <a href="Profile.html?userId=${profileLinkUserId}">
                        <h4 class="post-user-name">${escapeHtml(post.createdBy ? post.createdBy.name : 'Unknown')}</h4>
                    </a>
                    <p class="post-time">${formatTime(post.createdAt || new Date())}</p>
                </div>
                <div class="post-options">
                    <button class="post-options-button" type="button"><i class="fas fa-ellipsis-h"></i></button>
                    <div class="post-options-menu">
                        <ul>
                            ${isPostCreator ? `
                                <li><button class="delete-post-button" data-post-id="${post._id || ''}" type="button">Delete Post</button></li>
                                <li><button class="edit-post-button" data-post-id="${post._id || ''}" data-post-type="${post.postType || 'regular'}" type="button">Edit Post</button></li>
                            ` : ''}
                            <li><button class="report-post-button" data-post-id="${post._id || ''}" type="button">Report Post</button></li>
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

        const postAvatarElement = postElement.querySelector('.post-avatar');
        if (postAvatarElement) {
            lazyLoadImage(postAvatarElement, `${post.createdBy?.profilePicture || '/salmart-192x192.png'}?v=${Date.now()}`);
        }

        if (post.postType === 'video_ad') {
            const videoElement = postElement.querySelector('.post-video');
            if (videoElement) {
                lazyLoadVideo(videoElement);
                initializeVideoControls(postElement);
            }
        } else {
            const postImgElement = postElement.querySelector('.post-image');
            if (postImgElement) {
                lazyLoadImage(postImgElement, `${productImageForChat}?v=${Date.now()}`);
            }
        }

        return postElement;
    }

    async function fetchPosts(page = currentPage, clearExisting = false) {
        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            console.error('Posts container not found.');
            if (window.showToast) window.showToast('Error: Page layout issue. Please refresh.', '#dc3545');
            return;
        }

        if (isLoading && !clearExisting) {
            console.log('Posts are already loading. Skipping new request.');
            return;
        }
        isLoading = true;

        if (clearExisting) {
            if (window.videoIntersectionObserver) {
                postsContainer.querySelectorAll('.post-video').forEach(video => {
                    window.videoIntersectionObserver.unobserve(video);
                });
            }
            postsContainer.innerHTML = '';
        }

        const urlParams = new URLSearchParams(window.location.search);
        const profileOwnerId = urlParams.get('userId'); // This will be the user ID from the URL if on a profile page

        // Determine the actual user ID whose posts we want to fetch
        const targetUserId = profileOwnerId || currentLoggedInUser;

        const authToken = localStorage.getItem('authToken');
        let apiUrl = '';
        let noPostsMessage = '';

        if (!targetUserId) {
             // This scenario implies neither a profile ID nor a logged-in user,
             // which might mean they should be on the general feed or log in.
             // For a personal profile page, this should ideally not happen if login is enforced.
            postsContainer.innerHTML = `
                                <div style="text-align: center; padding: 40px; color: #555; font-family: 'Poppins', sans-serif;">
                    <i class="fas fa-folder-open" style="font-size: 40px; color: #ccc; margin-bottom: 10px;"></i>
                    <p style="font-size: 16px; margin-top: 10px;">
                        Nothing to see yet.<br>Please refresh the page or check your connection or create a new post.
                    </p>
                </div>
            `;
            isLoading = false;
            return;
        }

        // Use the /user-posts/:Id endpoint for fetching posts for a specific user.
        // The backend handles distinguishing between regular posts and video_ads from this endpoint.
        apiUrl = `${API_BASE_URL}/user-posts/${targetUserId}?page=${page}&limit=10`;
        noPostsMessage = targetUserId === currentLoggedInUser
            ? 'You have not created any posts yet.'
            : 'This user has not created any posts yet.';


        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken && { 'Authorization': `Bearer ${authToken}` })
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch posts');
            }

            const posts = await response.json();

            if (!Array.isArray(posts) || posts.length === 0) {
                if (postsContainer.children.length === 0) {
                    postsContainer.innerHTML = `
                        <p style="text-align: center; padding: 20px; color: #666;">
                            ${noPostsMessage}
                        </p>
                    `;
                }
                if (loadMoreBtn && posts.length === 0 && !clearExisting) {
                    loadMoreBtn.style.display = 'none';
                }
                isLoading = false;
                return;
            }

            // The backend already sorts by createdAt, so simply render them.
            // If additional client-side sorting is needed, it would go here.
            const fragment = document.createDocumentFragment();
            posts.forEach(post => { // Use 'posts' directly as they are already sorted by the backend
                const postElement = renderPost(post);
                fragment.appendChild(postElement);
            });

            postsContainer.appendChild(fragment);

            if (loadMoreBtn) {
                if (posts.length < 10) { // Assuming 10 is the limit set in the backend query
                    loadMoreBtn.style.display = 'none';
                } else {
                    loadMoreBtn.style.display = 'block';
                }
            }

            window.dispatchEvent(new Event('postsRendered'));

        } catch (error) {
            console.error('Error fetching posts:', error);
            if (!postsContainer.children.length) {
                postsContainer.innerHTML = `
                                   <div class="no-content"style="text-align: center; padding: 40px; color: #555; font-family: 'Poppins', sans-serif;">
                    <i class="fas fa-folder-open" style="font-size: 40px; color: #ccc; margin-bottom: 10px;"></i>
                    <p style="font-size: 16px; margin-top: 10px;">
                        Nothing to see yet.<br>Please refresh the page, check your connection or create a new post.
                    </p>
                </div>
            `;
            }
            
        } finally {
            isLoading = false;
        }
    }

    window.redirectToLogin = function() {
        if (window.showToast) {
            window.showToast('Please log in to access this feature', '#dc3545');
            setTimeout(() => {
                window.location.href = 'SignIn.html';
            }, 1000);
        } else {
            window.location.href = 'SignIn.html';
        }
    };

    window.openImage = function(url) {
        window.open(url, '_blank');
    };
    
    // Exposing the share modal function to the global scope
    window.showShareModal = showShareModal;

    async function initializeAuthStatusAndPosts() {
        if (isAuthReady) return;

        if (!currentLoggedInUser) {
            currentLoggedInUser = localStorage.getItem('userId');
        }

        if (currentLoggedInUser) {
            socket.emit('join', `user_${currentLoggedInUser}`);
        }

        isAuthReady = true;
        console.log('Auth initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
        await fetchPosts(currentPage, true);
    }

    // Expose fetchPosts globally if needed elsewhere, though direct call from this script is often sufficient.
    window.fetchPosts = fetchPosts;

    // Initial call to fetch posts when the DOM is ready
    initializeAuthStatusAndPosts();

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (!isLoading) {
                currentPage++;
                fetchPosts(currentPage, false);
            }
        });
    }

    window.addEventListener('beforeunload', () => {
        if (socket) {
            socket.disconnect();
        }
        if (window.videoIntersectionObserver) {
            const postsContainer = document.getElementById('posts-container');
            if (postsContainer) {
                postsContainer.querySelectorAll('.post-video').forEach(video => {
                    window.videoIntersectionObserver.unobserve(video);
                });
            }
        }
    });
});
