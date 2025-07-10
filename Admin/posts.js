// This file assumes post-video-controls.js is linked separately and correctly
import { salmartCache } from './salmartCache.js';

// Define API_BASE_URL globally or ensure it's window.API_BASE_URL if set in HTML
// If not set in HTML, this provides a fallback based on hostname
const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');

document.addEventListener('DOMContentLoaded', async function () {
    let currentLoggedInUser = localStorage.getItem('userId'); // Get user ID from localStorage immediately
    let currentFollowingList = [];
    let isAuthReady = false; // Flag to ensure initial setup runs only once

    // --- State variables for pagination/filtering ---
    let currentPage = 1;
    let currentCategory = 'all';
    let isLoading = false; // To prevent multiple simultaneous fetches
    let suggestionCounter = 0; // Renamed from postCounter to reflect its actual use for suggestions

    // --- Intersection Observer for Videos ---
    let videoObserver;

    const handleVideoIntersection = (entries) => {
        entries.forEach(entry => {
            const videoContainer = entry.target;
            const video = videoContainer.querySelector('.post-video');
            const playPauseBtn = videoContainer.querySelector('.play-pause');
            const loadingSpinner = videoContainer.querySelector('.loading-spinner');
            const muteBtn = videoContainer.querySelector('.mute-button'); // Get mute button here

            if (!video) return;

            if (entry.isIntersecting) {
                // Video is in view
                if (!video.dataset.srcLoaded) { // Only load if src hasn't been set
                    // Set src for all source elements within the video tag
                    video.querySelectorAll('source[data-src]').forEach(sourceElem => {
                        sourceElem.src = sourceElem.dataset.src;
                    });
                    video.load(); // Load the video metadata and initial data
                    video.dataset.srcLoaded = 'true';
                }

                // Autoplay when in view, but muted by default
                // Only attempt play if video is paused and ready enough (readyState 3 = HAVE_FUTURE_DATA)
                if (video.paused && video.readyState >= 3) {
                    video.muted = true; // Ensure muted on autoplay
                    if (muteBtn) muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>'; // Update mute button icon

                    video.play().then(() => {
                        loadingSpinner.style.display = 'none';
                        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                    }).catch(e => {
                        loadingSpinner.style.display = 'none';
                        // Autoplay prevented. User might need to interact.
                        // if (window.showToast) window.showToast('Video autoplay prevented.', '#ffc107');
                        console.log("Video autoplay prevented:", e);
                    });
                }
            } else {
                // Video is out of view - Aggressive Unload
                if (!video.paused) {
                    video.pause();
                    video.currentTime = 0; // Reset to beginning
                    if (playPauseBtn) {
                        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                    }
                }

                // Aggressively remove src to free up memory
                video.removeAttribute('src'); // Remove src from the video tag itself if it was set directly
                video.querySelectorAll('source').forEach(sourceElem => {
                    sourceElem.removeAttribute('src');
                });
                video.load(); // This is crucial to unload the current video data
                video.dataset.srcLoaded = ''; // Reset flag so it reloads on re-entry
                video.dataset.thumbnailGenerated = ''; // Allow re-generation if needed (though poster should stick)
            }
        });
    };

    // Initialize the Intersection Observer
    if ('IntersectionObserver' in window) {
        videoObserver = new IntersectionObserver(handleVideoIntersection, {
            root: null, // relative to the viewport
            rootMargin: '0px',
            threshold: 0.5 // Trigger when 50% of the video is visible
        });
    } else {
        console.warn("Intersection Observer not supported. Video lazy loading and auto-pause will not work.");
    }

    // Initialize video controls
    function initializeVideoControls(postElement) {
        const container = postElement.querySelector('.post-video-container');
        if (!container) return;

        const video = container.querySelector('.post-video');
        // Prevent re-initialization if controls are already set up
        if (video.dataset.controlsInitialized === 'true') {
            return;
        }

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
        video.muted = true; // Default to muted on load

        // Video metadata loaded: set initial time to generate thumbnail
        video.addEventListener('loadedmetadata', () => {
            if (!video.dataset.thumbnailGenerated) {
                video.currentTime = 2; // Set time to generate thumbnail for poster
            }
            durationDisplay.textContent = formatVideoTime(video.duration);
            loadingSpinner.style.display = 'none'; // Hide spinner once metadata is loaded
        });

        // Seeked event: generate thumbnail after seeking to 2 seconds
        video.addEventListener('seeked', () => {
            if (video.currentTime === 2 && !video.dataset.thumbnailGenerated && thumbnailCanvas) {
                const ctx = thumbnailCanvas.getContext('2d');
                thumbnailCanvas.width = video.videoWidth;
                thumbnailCanvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
                video.poster = thumbnailCanvas.toDataURL('image/jpeg'); // Set poster for future loads
                video.dataset.thumbnailGenerated = 'true';
                video.currentTime = 0; // Reset to 0 after generating thumbnail
                loadingSpinner.style.display = 'none'; // Ensure spinner is hidden after thumbnail generation
            }
        });

        function formatVideoTime(seconds) {
            if (isNaN(seconds) || seconds < 0) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }

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
                    if (window.showToast) window.showToast('Error playing video. User interaction may be required.', '#dc3545');
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
        let lastSeekTime = 0; // To debounce seek preview drawing

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

            // Hide seek preview during active drag to avoid performance issues
            if (isDragging) {
                if (seekPreview) seekPreview.style.display = 'none';
            }
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
            if (seekPreview) seekPreview.style.display = 'none';
        });

        progressContainer.addEventListener('mousemove', (e) => {
            if (!isDragging && seekPreview && seekPreviewCanvas && video.duration > 0) {
                const rect = progressContainer.getBoundingClientRect();
                const posX = e.clientX - rect.left;
                const width = rect.width;
                let progress = posX / width;
                progress = Math.max(0, Math.min(1, progress));
                const seekTime = progress * video.duration;

                // Debounce the seek preview drawing
                if (Date.now() - lastSeekTime > 100) { // Only update preview every 100ms
                    seekPreview.style.display = 'block';
                    seekPreview.style.left = `${posX}px`;
                    seekPreviewCanvas.width = 120;
                    seekPreviewCanvas.height = 68;

                    // Temporarily set currentTime to draw frame for preview
                    const originalCurrentTime = video.currentTime;
                    video.currentTime = seekTime; // This can be expensive; consider pre-generated thumbnails or a dedicated hidden video for previews.
                    video.requestVideoFrameCallback(() => { // Use requestVideoFrameCallback for better sync
                        const ctx = seekPreviewCanvas.getContext('2d');
                        ctx.drawImage(video, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
                        video.currentTime = originalCurrentTime; // Restore original time immediately after drawing
                    });
                    lastSeekTime = Date.now();
                }
            }
        });

        progressContainer.addEventListener('mouseleave', () => {
            if (!isDragging && seekPreview) seekPreview.style.display = 'none';
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
            if (seekPreview) seekPreview.style.display = 'none';
        });

        postElement.addEventListener('keydown', (e) => {
            // Check if the event target is within the video controls or the video itself
            const activeElement = document.activeElement;
            const isInsideVideoControls = container.contains(activeElement);

            if (e.target === video || isInsideVideoControls) {
                switch (e.key) {
                    case ' ':
                        e.preventDefault(); // Prevent page scrolling
                        playPauseBtn.click();
                        break;
                    case 'm':
                        muteBtn.click();
                        break;
                    case 'f':
                        fullscreenBtn.click();
                        break;
                    case 'ArrowRight':
                        video.currentTime += 5; // Seek forward 5 seconds
                        break;
                    case 'ArrowLeft':
                        video.currentTime -= 5; // Seek backward 5 seconds
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
            video.currentTime = 0;
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        });

        // Mark controls as initialized AFTER all listeners are added
        video.dataset.controlsInitialized = 'true';
    }

    // --- Helper Functions ---

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
            const response = await fetch(`${API_BASE_URL}/api/user-suggestions`, {
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
            wrapperContainer.appendChild(rowContainer); // This is correct, appends each row
        }
        return wrapperContainer;
    }

    function renderPromotedPost(post) {
        // This function now only handles non-video promoted posts.
        // Promoted video posts are filtered out before this function is called.
        const postElement = document.createElement('div');
        postElement.classList.add('promoted-post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';

        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;

        let mediaContent = '';
        let productDetails = '';
        let buttonContent = '';

        const productImageForChat = post.photo || '/salmart-192x192.png';

        // This block will ONLY handle non-video ads (e.g., image ads) now.
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
                <button class="promoted-cta-button buy-now-button" data-post-id="${post._id || ''}"
                    data-product-image="${productImageForChat}"
                    data-product-title="${escapeHtml(post.title || 'Untitled Product')}"
                    data-product-description="${escapeHtml(post.description || 'No description available.')}"
                    data-product-location="${escapeHtml(post.location || 'N/A')}"
                    data-product-condition="${escapeHtml(post.productCondition || 'N/A')}"
                    data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}"
                    ${post.isSold ? 'disabled' : ''}>
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
            </div>
            `;
        } else if (!currentLoggedInUser) {
            buttonContent = `
                <div class="button-container">
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-shopping-cart"></i> Buy Now
                    </button>
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-paper-plane"></i> Message Seller
                    </button>
                </div>
            `;
        } else { // Current user is the creator
            buttonContent = `
                <a href=" class="promoted-cta-button" aria-label="Check out product " ${!post.productLink ? 'style="pointer-events: none; color: #28a745; font-size: 14px; font-weight: 400; "' : ''}>
                    <i class="fas fa-toggle-on"></i> Active
                </a>
            `;
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
        let descriptionContent = '';
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
            descriptionContent = `
                <h2 class="product-title">${escapeHtml(post.title || '')}</h2>
                <div class="post-description-text" style="margin-bottom: 10px; padding: 0 15px;">
                    <p>${escapeHtml(post.description || '')}</p>
                </div>
            `;
            // Optimized video element: data-src for lazy loading, preload="none"
            mediaContent = `
                <div class="post-video-container">
                    <video class="post-video" preload="none" aria-label="Video ad for ${post.description || 'product'}" poster="${post.thumbnail || ''}">
                        <source data-src="${post.video || ''}" type="video/mp4" />
                        <source data-src="${post.video ? post.video.replace('.mp4', '.webm') : ''}" type="video/webm" />
                        <source data-src="${post.video ? post.video.replace('.mp4', '.ogg') : ''}" type="video/ogg" />
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
                            <i class="fas fa-volume-mute"></i>
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
                    <button class="checkout-product-btn buy-now-button"
                            data-post-id="${post._id || ''}"
                            data-product-image="${post.thumbnail || '/salmart-192x192.png'}"
                            data-product-title="${escapeHtml(post.title || 'Untitled Product')}"
                            data-product-description="${escapeHtml(post.description || 'No description available.')}"
                            data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}"
                            data-product-location="${escapeHtml(post.location || 'N/A')}"
                            data-product-condition="${escapeHtml(post.productCondition || 'N/A')}"
                            ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i>  ${post.isSold ? 'Sold Out' : 'Check Out Product'}
                    </button>
                `;
        } else { // Regular image-based posts
            descriptionContent = `
                <h2 class="product-title">${escapeHtml(post.title || 'No description')}</h2>
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
                            <button class="btn btn-primary buy-now-button"
                                    data-post-id="${post._id || ''}"
                                    data-product-image="${productImageForChat}"
                                    data-product-title="${escapeHtml(post.title || 'Untitled Product')}"
                                    data-product-description="${escapeHtml(post.description || 'No description available.')}"
                                    data-product-location="${escapeHtml(post.location || 'N/A')}"
                                    data-product-condition="${escapeHtml(post.productCondition || 'N/A')}"
                                    data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}"
                                    ${post.isSold ? 'disabled' : ''}>
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

        // DO NOT initialize video controls here directly. Intersection Observer will handle it.
        return postElement; // Return the created post element
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
        // This function now only receives and renders non-video promoted posts.
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
            // Disconnect old observers before clearing content
            if (videoObserver) {
                postsContainer.querySelectorAll('.post-video-container').forEach(container => {
                    videoObserver.unobserve(container);
                });
            }
            postsContainer.innerHTML = '';
            suggestionCounter = 0; // Reset suggestion counter when clearing posts
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

            // Filter out promoted video posts (they are regular posts, not 'promoted' visually this way)
            const promotedPosts = sortedPosts.filter(post => post.isPromoted && post.postType !== 'video_ad');
            const nonPromotedPosts = sortedPosts.filter(post => !post.isPromoted || post.postType === 'video_ad'); // Regular posts (can be video or image)

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
            const videoContainersToObserve = []; // Collect video containers for observation

            for (let i = 0; i < nonPromotedPosts.length; i++) {
                const post = nonPromotedPosts[i];
                const postElement = renderPost(post);
                fragment.appendChild(postElement);
                suggestionCounter++;

                // If it's a video post, add its container to the list for observation
                if (post.postType === 'video_ad') {
                    const videoContainer = postElement.querySelector('.post-video-container');
                    if (videoContainer) {
                        videoContainersToObserve.push(videoContainer);
                        // Initialize video controls for newly rendered video posts
                        initializeVideoControls(postElement);
                    }
                }

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

            // Observe all newly added video containers
            if (videoObserver) {
                videoContainersToObserve.forEach(container => {
                    videoObserver.observe(container);
                });
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

        const showToast = window.showToast;
        const authToken = localStorage.getItem('authToken');
        const loggedInUser = localStorage.getItem('userId');

        // Handle Promote Button
        const promoteButton = target.closest('.promote-button');
        if (promoteButton) {
            const postId = promoteButton.dataset.postId;
            if (!postId) {
                if (showToast) showToast('Invalid post ID for promotion', 'error');
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
                if (showToast) showToast('Error: Post information not found.', '#dc3545');
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

        // Buy Now Button Handler
        if (target.classList.contains('buy-now-button')) {
          event.preventDefault();

          const postId = target.dataset.postId;
          if (!postId) {
            console.error("Post ID is missing");
            if (showToast) showToast('Error: Post ID not found for purchase.', '#dc3545');
            return;
          }

          // Store product info for use in modal actions
          const productData = {
            postId: target.dataset.postId || '',
            productImage: target.dataset.productImage || '',
            productTitle: target.dataset.productTitle || '',
            productDescription: target.dataset.productDescription || '',
            productLocation: target.dataset.productLocation || '',
            productCondition: target.dataset.productCondition || '',
            productPrice: target.dataset.productPrice || ''
          };

          // Save to a temporary object for modal actions
          window.__selectedProduct = productData;

          // Show modal
          const paymentChoiceModal = document.getElementById('paymentChoiceModal');
          if (paymentChoiceModal) {
            paymentChoiceModal.classList.remove('hidden');
          } else {
            console.error("Payment choice modal not found.");
            if (showToast) showToast('Payment modal not available.', '#dc3545');
          }
          return; // Exit to prevent further processing
        }

        // Handle Follow Button
        if (target.classList.contains('follow-button') && target.dataset.userId) {
            const userIdToFollow = target.dataset.userId;
            if (!authToken || !loggedInUser) {
                if (showToast) showToast('Please log in to follow users.', '#dc3545');
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
                if (showToast) showToast(data.message || 'Follow status updated!', '#28a745');

            } catch (error) {
                console.error('Follow/Unfollow error:', error);
                if (showToast) showToast(error.message || 'Failed to update follow status.', '#dc3545');
                // Revert UI on error
                window.updateFollowButtonsUI(userIdToFollow, isCurrentlyFollowing);
            }
            return; // Exit to prevent further processing
        }
    });

    // --- Authentication and Initialization Logic ---

    async function initializeAppData() {
        if (isAuthReady) return; // Prevent double execution

        // Ensure currentLoggedInUser is based on localStorage at this point
        if (!currentLoggedInUser) {
            currentLoggedInUser = localStorage.getItem('userId');
        }

        if (currentLoggedInUser) {
            currentFollowingList = await fetchFollowingList();
        }
        isAuthReady = true;
        console.log('App initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
        await fetchPostsByCategory(currentCategory, currentPage, true);
    }

    window.fetchPosts = fetchPostsByCategory; // Make it globally accessible if needed elsewhere

    document.addEventListener('authStatusReady', async (event) => {
        // Only proceed if app initialization hasn't happened yet or user status significantly changed
        // (e.g., user just logged in/out from another part of the app)
        if (!isAuthReady || currentLoggedInUser !== event.detail.loggedInUser) {
            currentLoggedInUser = event.detail.loggedInUser; // Update loggedInUser from the event
            console.log('Auth status ready event received. Logged in user:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
            await initializeAppData(); // Trigger full app initialization
        }
    });

    // Execute initial load on DOMContentLoaded.
    // The `isAuthReady` flag within `initializeAppData` prevents re-fetching
    // if `authStatusReady` fires very quickly.
    initializeAppData();

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

function closeModal() {
  const paymentChoiceModal = document.getElementById('paymentChoiceModal');
  if (paymentChoiceModal) {
    paymentChoiceModal.classList.add('hidden');
  }
}

function choosePT() {
  const product = window.__selectedProduct; // Get the selected product data
  if (!product || !product.postId) {
      if (window.showToast) window.showToast('Product data missing for in-app payment.', 'error');
      console.error('Product data is missing for PT payment.');
      return;
  }
  // Construct query parameters from the product object
  const query = new URLSearchParams(product).toString();
  window.location.href = `checkout.html?${query}`;
}

function choosePaystack() {
  const product = window.__selectedProduct;
  const userId = localStorage.getItem('userId');
  const email = localStorage.getItem('email');

  if (!userId || !email) {
    if (window.showToast) window.showToast("Missing user information. Please log in.", 'error');
    console.error("Missing user information for Paystack payment.");
    return;
  }

  if (!product || !product.postId || !product.productPrice) {
      if (window.showToast) window.showToast('Product data missing for Paystack payment.', 'error');
      console.error('Product data is missing for Paystack payment.');
      return;
  }

  // Parse the price, remove '₦' and commas, then convert to kobo (for Paystack)
  const rawPrice = product.productPrice.replace('₦', '').replace(/,/g, '');
  const amountInKobo = Math.round(parseFloat(rawPrice) * 100); // Ensure it's a number and convert to kobo

  if (isNaN(amountInKobo) || amountInKobo <= 0) {
      if (window.showToast) window.showToast('Invalid product price for payment.', 'error');
      console.error('Invalid amount for Paystack:', product.productPrice);
      return;
  }

  fetch(`${API_BASE_URL}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postId: product.postId,
      buyerId: userId,
      email,
      amount: amountInKobo // Send amount in kobo
    })
  })
  .then(res => {
    if (!res.ok) {
        return res.json().then(errorData => {
            throw new Error(errorData.message || 'Failed to initiate Paystack payment on server.');
        });
    }
    return res.json();
  })
  .then(data => {
    if (!data.success) {
      if (window.showToast) window.showToast(data.message || "Payment setup failed.", 'error');
      return;
    }

    const redirectParams = new URLSearchParams({
      ref: data.reference,
      productTitle: product.productTitle,
      amount: data.amount // This amount should also be in kobo from backend
    });

    // Store product details in session storage for the paystack.html page
    sessionStorage.setItem('paystackProductDetails', JSON.stringify(product));

    window.location.href = `paystack.html?${redirectParams.toString()}`;
  })
  .catch(err => {
    console.error('Error starting Paystack payment:', err);
    if (window.showToast) window.showToast(err.message || 'Something went wrong with payment initiation.', 'error');
  });
}
