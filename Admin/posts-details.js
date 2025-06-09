document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
    const postDetailsContainer = document.querySelector('.post-details-container');
    const commentInput = document.getElementById('comment-input');
    const commentSubmit = document.getElementById('comment-submit');
    const userAvatar = document.getElementById('user-avatar');
    const loggedInUser = localStorage.getItem('userId');
    let postId;

    // Function to format time
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

    // Show toast notification
    function showToast(message, bgColor = '#333') {
        const toast = document.querySelector('.toast-message') || document.createElement('div');
        if (!toast.parentNode) {
            toast.className = 'toast-message';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.backgroundColor = bgColor;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // Get post ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    postId = urlParams.get('postId');

    if (!postId) {
        postDetailsContainer.innerHTML = '<p>Post not found.</p>';
        return;
    }

    // Fetch user profile for avatar
    async function fetchUserProfile() {
        try {
            const response = await fetch(`${API_BASE_URL}/verify-token`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
            });
            if (response.ok) {
                const userData = await response.json();
                userAvatar.src = userData.profilePicture || 'default-avatar.png';
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
        }
    }

    // Initialize video controls
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

    // Fetch post details
    async function fetchPost() {
        try {
            const response = await fetch(`${API_BASE_URL}/post/${postId}`);
            if (!response.ok) throw new Error('Failed to fetch post');
            const post = await response.json();

            // Update header
            const headerTitle = document.getElementById('post-creator-name');
            if (headerTitle) {
                headerTitle.textContent = post.createdBy && post.createdBy.name ? `Ads by ${post.createdBy.name}` : 'Unknown Creator';
            } else {
                console.error('Header element not found');
            }

            // Check follow status
            let followingList = [];
            try {
                followingList = JSON.parse(localStorage.getItem('followingList')) || [];
            } catch (e) {
                console.error("Error parsing followingList:", e);
            }

            // Ensure comments array exists and sort by createdAt (newest first)
            const comments = Array.isArray(post.comments) ? post.comments : [];
            comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Determine media content and button based on post type
            let mediaContent = '';
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
                buttonContent = `
                    <a href="${post.productLink || '#'}" class="buy-now-button checkout-product-button" aria-label="Check out product ${post.description || 'product'}" ${!post.productLink ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> Check Out Product
                    </a>
                `;
            } else {
                mediaContent = `
                    <img src="${productImageForChat}" class="post-image" onclick="openImage('${productImageForChat}')" alt="Product Image">
                `;
                buttonContent = `
                    <button class="buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i>  ${post.isSold ? ' Sold Out' : ' Buy Now'}
                    </button>
                `;
            }

            // Render post details
            postDetailsContainer.innerHTML = `
                <div class="post-header">
                    <a href="Profile.html?userId=${post.createdBy?.userId || ''}">
                        <img src="${post.profilePicture || 'default-avatar.png'}" class="post-avatar">
                    </a>
                    <div class="post-user-info">
                        <a href="Profile.html?userId=${post.createdBy?.userId || ''}" class="post-user-name">${post.createdBy?.name || 'Unknown'}</a>
                        <p class="post-time">${formatTime(post.createdAt)}</p>
                    </div>
                    ${
                        post.createdBy?.userId && post.createdBy.userId !== loggedInUser ?
                        followingList.includes(post.createdBy.userId) ?
                        `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #28a745;">
                            <i class="fas fa-user-check"></i> Following
                        </button>` :
                        `<button class="follow-button" data-user-id="${post.createdBy.userId}">
                            <i class="fas fa-user-plus"></i> Follow
                        </button>` : ''
                    }
                </div>
                <div class="product-container">
                    <div class="product-card">
                        <p class="post-description"><b>Product:</b> ${post.description || 'No description'}</p>
                        ${post.postType !== 'video_ad' ? `
                            <p class="post-description"><b>Condition:</b> ${post.productCondition || 'N/A'}</p>
                            <p class="post-description"><b>Price:</b> ${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}</p>
                            <p class="post-description"><b>Location:</b> ${post.location || 'N/A'}</p>
                        ` : ''}
                    </div>
                    <div class="media-card">
                        ${mediaContent}
                    </div>
                </div>
                <div class="buy" style="text-align: center">
                   ${post.createdBy?.userId !== loggedInUser ? buttonContent : ''}
                </div>
                <div class="post-actions">
                    <button class="like-button">
                        <i class="${post.likes?.includes(loggedInUser) ? 'fas' : 'far'} fa-heart"></i>
                        <span class="like-count">${post.likes?.length || 0}</span>
                    </button>
                    <button class="share-button"><i class="fas fa-share"></i></button>
                </div>
                <div class="comments-list">
                    ${comments.length > 0 ? comments.map(comment => `
                        <div class="comment" data-comment-id="${comment._id}">
                            <img src="${comment.profilePicture || 'default-avatar.png'}" class="comment-avatar">
                            <div class="comment-info">
                                <strong>${comment.name || 'Unknown'}</strong>
                                <p>${comment.text || ''}</p>
                                <div class="comment-meta">
                                    <span class="comment-time">${formatTime(comment.createdAt)}</span>
                                    <button class="reply-button" data-comment-id="${comment._id}">
                                        Reply (${comment.replies ? comment.replies.length : 0})
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('') : '<p>No comments yet.</p>'}
                </div>
            `;
            // Initialize video controls if applicable
            initializeVideoControls(postDetailsContainer);

            // Like functionality
            const likeButton = postDetailsContainer.querySelector('.like-button');
            likeButton.addEventListener('click', async () => {
                if (!localStorage.getItem('authToken')) {
                    showToast('Please log in to like posts.', '#dc3545');
                    return;
                }
                const likeCountElement = likeButton.querySelector('.like-count');
                const icon = likeButton.querySelector('i');
                const isCurrentlyLiked = icon.classList.contains('fas');
                let currentLikes = parseInt(likeCountElement.textContent, 10);

                likeButton.disabled = true;
                likeCountElement.textContent = isCurrentlyLiked ? currentLikes - 1 : currentLikes + 1;
                icon.classList.toggle('fas', !isCurrentlyLiked);
                icon.classList.toggle('far', isCurrentlyLiked);

                try {
                    const response = await fetch(`${API_BASE_URL}/post/like/${postId}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ action: isCurrentlyLiked ? 'unlike' : 'like' }),
                    });

                    if (!response.ok) throw new Error('Failed to like/unlike post');
                    const data = await response.json();
                    likeCountElement.textContent = data.likes.length;
                    const userStillLikes = data.likes.includes(loggedInUser);
                    icon.classList.toggle('fas', userStillLikes);
                    icon.classList.toggle('far', !userStillLikes);
                } catch (error) {
                    console.error('Error:', error);
                    likeCountElement.textContent = currentLikes;
                    icon.classList.toggle('fas', isCurrentlyLiked);
                    icon.classList.toggle('far', !isCurrentlyLiked);
                    showToast(error.message || 'Action failed. Please try again.', '#dc3545');
                } finally {
                    likeButton.disabled = false;
                }
            });

            // Buy now functionality
            const buyButton = postDetailsContainer.querySelector('.buy-now-button');
            if (buyButton && !buyButton.classList.contains('checkout-product-button')) {
                buyButton.addEventListener('click', async () => {
                    const email = localStorage.getItem('email');
                    const buyerId = localStorage.getItem('userId');

                    if (!email || !buyerId || !postId) {
                        showToast('Please log in to make a purchase.', '#dc3545');
                        return;
                    }

                    try {
                        const response = await fetch(`${API_BASE_URL}/pay`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                            },
                            body: JSON.stringify({
                                email,
                                postId,
                                buyerId,
                                currency: 'NGN',
                            }),
                        });

                        const result = await response.json();
                        if (response.ok && result.success && result.url) {
                            window.location.href = result.url;
                        } else {
                            showToast(`Payment failed: ${result.message || 'Please try again.'}`, '#dc3545');
                        }
                    } catch (error) {
                        console.error('Payment error:', error);
                        showToast('Failed to process payment. Please try again.', '#dc3545');
                    }
                });
            }

            // Follow functionality
            const followButton = postDetailsContainer.querySelector('.follow-button');
            if (followButton) {
                followButton.addEventListener('click', async () => {
                    const userIdToFollow = followButton.getAttribute('data-user-id');
                    if (!localStorage.getItem('authToken')) {
                        showToast('Please log in to follow users.', '#dc3545');
                        return;
                    }
                    try {
                        const response = await fetch(`${API_BASE_URL}/follow/${userIdToFollow}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                            },
                        });

                        if (!response.ok) throw new Error('Failed to follow user');
                        let followingList = JSON.parse(localStorage.getItem('followingList')) || [];
                        if (!followingList.includes(userIdToFollow)) {
                            followingList.push(userIdToFollow);
                            localStorage.setItem('followingList', JSON.stringify(followingList));
                        }

                        followButton.innerHTML = `<i class="fas fa-user-check"></i> Following`;
                        followButton.style.backgroundColor = '#28a745';
                        showToast('You are now following this user!', '#28a745');
                    } catch (error) {
                        console.error('Error following user:', error);
                        showToast(error.message || 'Failed to follow user.', '#dc3545');
                    }
                });
            }

            // Share functionality
            const shareButton = postDetailsContainer.querySelector('.share-button');
            shareButton.addEventListener('click', () => {
                showShareModal(post);
            });
        } catch (error) {
            console.error('Error fetching post:', error);
            postDetailsContainer.innerHTML = '<p>Error loading post. Please try again.</p>';
        }
    }

    // Event delegation for reply buttons
    postDetailsContainer.addEventListener('click', (event) => {
        const replyButton = event.target.closest('.reply-button');
        if (replyButton) {
            const commentId = replyButton.getAttribute('data-comment-id');
            fetch(`${API_BASE_URL}/post/${postId}`).then(response => response.json()).then(post => {
                const commentExists = post.comments.some(comment => comment._id === commentId);
                if (commentExists) {
                    window.location.href = `reply.html?postId=${postId}&commentId=${commentId}`;
                } else {
                    showToast('Comment not found. Please try again.', '#dc3545');
                }
            }).catch(error => {
                console.error('Error verifying comment:', error);
                showToast('Failed to verify comment. Please try again.', '#dc3545');
            });
        }
    });

    // Add comment functionality
    commentSubmit.addEventListener('click', async () => {
        const commentText = commentInput.value.trim();
        if (!commentText) {
            showToast('Please enter a comment.', '#dc3545');
            return;
        }

        commentSubmit.disabled = true;
        try {
            const response = await fetch(`${API_BASE_URL}/post/comment/${postId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({ text: commentText }),
            });

            if (!response.ok) throw new Error('Failed to post comment');
            const result = await response.json();
            const newComment = result.comment;

            const commentTimestamp = newComment.createdAt || new Date().toISOString();
            const displayText = newComment.text || commentText;

            const commentsList = postDetailsContainer.querySelector('.comments-list');
            const newCommentHTML = `
                <div class="comment" data-comment-id="${newComment._id}">
                    <img src="${newComment.profilePicture || 'default-avatar.png'}" class="comment-avatar">
                    <div class="comment-info">
                        <strong>${newComment.name || 'Unknown'}</strong>
                        <p>${displayText}</p>
                        <div class="comment-meta">
                            <span class="comment-time">${formatTime(commentTimestamp)}</span>
                            <button class="reply-button" data-comment-id="${newComment._id}">
                                Reply (${newComment.replies ? newComment.replies.length : 0})
                            </button>
                        </div>
                    </div>
                </div>
            `;
            commentsList.insertAdjacentHTML('afterbegin', newCommentHTML);
            commentInput.value = '';
            showToast('Your comment has been posted!', '#28a745');

            const noCommentsMessage = commentsList.querySelector('p');
            if (noCommentsMessage) {
                noCommentsMessage.remove();
            }

            await fetchPost();
        } catch (error) {
            console.error('Error posting comment:', error);
            showToast(error.message || 'Failed to post comment.', '#dc3545');
        } finally {
            commentSubmit.disabled = false;
        }
    });

    // Handle Enter key for comment submission
    commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !commentSubmit.disabled) {
            commentSubmit.click();
        }
    });

    // Share modal and related functions
    function showShareModal(post) {
        const shareModal = document.createElement('div');
        shareModal.className = 'share-modal';
        const postLink = `${window.location.origin}/post-details.html?postId=${post._id}`;
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
            showToast(success ? 'Link copied to clipboard!' : 'Failed to copy link', success ? '#28a745' : '#dc3545');
        });
    }

    function sharePost(post, postLink, platform) {
        const shareText = `Check out this product: ${post.description || 'No description'} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}`;
        switch (platform) {
            case 'copy':
                copyToClipboard(postLink);
                showToast('Link copied to clipboard!', '#28a745');
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

    function openAppOrWeb(appUrl, webUrl) {
        window.location.href = appUrl;
        setTimeout(() => {
            if (!document.hidden) {
                window.open(webUrl, '_blank');
            }
        }, 500);
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
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            return false;
        }
    }

    // Initialize page
    await fetchUserProfile();
    await fetchPost();
    window.addEventListener('popstate', fetchPost); // Ensure content loads on navigation
});
