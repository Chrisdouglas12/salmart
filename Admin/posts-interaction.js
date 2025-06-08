// post-interactions.js
document.addEventListener('DOMContentLoaded', async function () {
    // Ensure these are available from auth.js (loaded first)
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    let loggedInUser = window.loggedInUser; // Will be updated by auth.js
    const showToast = window.showToast; // Utility from auth.js

    // Important: Re-check or ensure loggedInUser is populated if auth.js
    // is asynchronous and posts.js loads before it fully resolves.
    // A robust way would be to listen for an event from auth.js or pass a promise.
    // For now, let's assume auth.js runs first and sets it.
    // If not, you might need:
    // if (!loggedInUser) {
    //     await window.checkLoginStatus(); // Re-run check if auth.js didn't finish
    //     loggedInUser = localStorage.getItem('userId');
    // }

    let followingList = [];
    try {
        followingList = JSON.parse(localStorage.getItem('followingList')) || [];
    } catch (e) {
        console.error("Error parsing followingList:", e);
        followingList = [];
    }

    async function checkFollowStatusOnLoad() {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/following`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const { following } = await response.json();
                localStorage.setItem('followingList', JSON.stringify(following));
                followingList = following;
            }
        } catch (error) {
            console.error('Error checking follow status:', error);
        }
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
            if (!document.hidden) {
                window.open(webUrl, '_blank');
            }
        }, 500);
    }

    function sharePost(post, postLink, platform) {
        const shareText = `Check out this product: ${post.description || 'No description'} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}`;

        switch (platform) {
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
                        <input type="text" value="${postLink}" readonly class="share-link">
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

    function showDeleteConfirmationModal(postId, authToken, postElement) {
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

                if (!response.ok) throw new Error('Failed to delete post');

                postElement.remove();
                showToast('Post deleted successfully!', '#28a745');
                closeModal();
            } catch (error) {
                console.error('Error deleting post:', error);
                showToast('Error deleting post. Please try again.', '#dc3545');
                closeModal();
            }
        });
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

        video.addEventListener('loadedmetadata', () => {
            video.currentTime = 2; // Set initial time for thumbnail generation
        });

        video.addEventListener('seeked', () => {
            if (video.currentTime === 2 && !video.dataset.thumbnailGenerated) {
                const ctx = thumbnailCanvas.getContext('2d');
                thumbnailCanvas.width = video.videoWidth;
                thumbnailCanvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
                video.poster = thumbnailCanvas.toDataURL('image/jpeg');
                video.dataset.thumbnailGenerated = 'true';
                video.currentTime = 0; // Reset to beginning after thumbnail
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

            // Removed direct seek preview logic here as it's primarily for mousemove
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
                // Temporarily set video currentTime to get thumbnail for preview
                const originalTime = video.currentTime;
                video.currentTime = seekTime;
                setTimeout(() => {
                    const ctx = seekPreviewCanvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
                    video.currentTime = originalTime; // Restore original time
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
            seekPreview.style.display = 'block'; // Show preview on touch start
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

    // --- Event Listeners for Post Interactions ---
    const postsContainer = document.getElementById('posts-container');

    // This event listener ensures video controls are initialized after posts are rendered
    window.addEventListener('postsRendered', () => {
        document.querySelectorAll('.post').forEach(postElement => {
            initializeVideoControls(postElement);
        });
    });

    // Event delegation for all button clicks within posts
    if (postsContainer) {
        postsContainer.addEventListener('click', async (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            const postElement = target.closest('.post');
            if (!postElement) return; // Ensure click is within a post
            const postId = postElement.dataset.postId;
            const authToken = localStorage.getItem('authToken');

            if (target.classList.contains('send-message-btn')) {
                event.preventDefault();
                const recipientId = target.dataset.recipientId;
                const recipientUsername = postElement.querySelector('.post-user-name')?.textContent || 'Unknown';
                const recipientProfilePictureUrl = postElement.querySelector('.post-avatar')?.src || 'default-avatar.png';
                let productImage = target.dataset.productImage || '';
                const productDescription = target.dataset.productDescription || '';

                if (productImage && !productImage.match(/^https?:\/\//)) {
                    productImage = productImage.startsWith('/') ? `${API_BASE_URL}${productImage}` : `${API_BASE_URL}/${productImage}`;
                }

                const message = `Is this item still available?\n\nProduct: ${productDescription}`;
                const userId = localStorage.getItem("userId");

                const encodedMessage = encodeURIComponent(message);
                const encodedProductImage = encodeURIComponent(productImage);
                const encodedRecipientUsername = encodeURIComponent(recipientUsername);
                const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);
                const encodedProductDescription = encodeURIComponent(productDescription);

                const chatUrl = `Chats.html?user_id=${userId}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}&product_id=${postId}&product_name=${encodedProductDescription}`;
                window.location.href = chatUrl;

            } else if (target.classList.contains('buy-now-button') && target.dataset.postId) {
                const email = localStorage.getItem('email');
                const buyerId = localStorage.getItem('userId');

                if (!email || !buyerId || !postId) {
                    showToast("Please log in to make a purchase.", '#dc3545');
                    return;
                }

                try {
                    const response = await fetch(`${API_BASE_URL}/pay`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
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

            } else if (target.classList.contains('like-button')) {
                if (!authToken) {
                    showToast('Please log in to like posts.', '#dc3545');
                    return;
                }

                const likeCountElement = target.querySelector('.like-count');
                const icon = target.querySelector('i');
                const isCurrentlyLiked = icon.classList.contains('fas');
                let currentLikes = parseInt(likeCountElement.textContent, 10);

                target.disabled = true; // Disable button to prevent multiple rapid clicks
                likeCountElement.textContent = isCurrentlyLiked ? currentLikes - 1 : currentLikes + 1;
                icon.classList.toggle('fas', !isCurrentlyLiked);
                icon.classList.toggle('far', isCurrentlyLiked);

                try {
                    const response = await fetch(`${API_BASE_URL}/post/like/${postId}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ action: isCurrentlyLiked ? 'unlike' : 'like' }),
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Failed to like/unlike post');
                    }

                    const data = await response.json();
                    likeCountElement.textContent = data.likes.length;
                    const userLikes = data.likes.includes(loggedInUser); // Update based on server response
                    icon.classList.toggle('fas', userLikes);
                    icon.classList.toggle('far', !userLikes);

                    // if (window.socket) window.socket.emit('like', { postId, userId: loggedInUser }); // If you have a socket.io connection
                } catch (error) {
                    console.error('Like error:', error);
                    // Revert UI if API call fails
                    likeCountElement.textContent = currentLikes;
                    icon.classList.toggle('fas', isCurrentlyLiked);
                    icon.classList.toggle('far', !isCurrentlyLiked);
                    showToast(error.message || 'Failed to like/unlike post.', '#dc3545');
                } finally {
                    target.disabled = false; // Re-enable button
                }

            } else if (target.classList.contains('reply-button')) {
                window.location.href = `product.html?postId=${postId}`;

            } else if (target.classList.contains('share-button')) {
                const postData = {
                    _id: postId,
                    description: postElement.querySelector('.product-info .value')?.textContent || '',
                    price: parseFloat(postElement.querySelector('.price-value')?.textContent?.replace('₦', '').replace(/,/g, '')) || null,
                };
                showShareModal(postData);

            } else if (target.classList.contains('follow-button')) {
                const userIdToFollow = target.dataset.userId;
                if (!authToken) {
                    showToast('Please log in to follow users.', '#dc3545');
                    return;
                }

                try {
                    const response = await fetch(`${API_BASE_URL}/follow/${userIdToFollow}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`,
                        },
                    });

                    if (!response.ok) throw new Error('Failed to follow user');

                    // Update followingList in local storage and memory
                    if (!followingList.includes(userIdToFollow)) {
                        followingList.push(userIdToFollow);
                        localStorage.setItem('followingList', JSON.stringify(followingList));
                    }

                    // Update all follow buttons for this user
                    document.querySelectorAll(`.follow-button[data-user-id="${userIdToFollow}"]`).forEach(btn => {
                        btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
                        btn.style.backgroundColor = '#28a745';
                    });

                    showToast('You are now following this user!', '#28a745');
                } catch (error) {
                    console.error('Follow error:', error);
                    showToast(error.message || 'Failed to follow user.', '#dc3545');
                }

            } else if (target.classList.contains('delete-post-button')) {
                showDeleteConfirmationModal(postId, authToken, postElement);

            } else if (target.classList.contains('edit-post-button')) {
                window.location.href = `Ads.html?edit=true&postId=${postId}`;

            } else if (target.classList.contains('report-post-button')) {
                if (!authToken) {
                    showToast('Please log in to report posts.', '#dc3545');
                    return;
                }

                const reportModal = document.createElement('div');
                reportModal.className = 'report-modal';
                reportModal.innerHTML = `
                    <div class="report-modal-content">
                        <div class="report-modal-header">
                            <h3>Report Post</h3>
                            <span class="close-modal">×</span>
                        </div>
                        <div class="report-modal-body">
                            <p>Please select the reason for reporting this post:</p>
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
                            <div class="other-reason" style="display: none;">
                                <textarea id="other-reason" placeholder="Please provide details..." rows="3"></textarea>
                            </div>
                        </div>
                        <div class="report-modal-footer">
                            <button class="cancel-report">Cancel</button>
                            <button class="submit-report" disabled>Submit</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(reportModal);
                document.body.style.overflow = 'hidden';

                const radioButtons = reportModal.querySelectorAll('input[type="radio"]');
                const otherReasonContainer = reportModal.querySelector('.other-reason');
                const submitButton = reportModal.querySelector('.submit-report');

                radioButtons.forEach(radio => {
                    radio.addEventListener('change', () => {
                        submitButton.disabled = false;
                        otherReasonContainer.style.display = radio.value === 'Other' ? 'block' : 'none';
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
                    const selectedReason = reportModal.querySelector('input[name="report-reason"]:checked')?.value;
                    if (!selectedReason) {
                        showToast("Please select a reason.", '#dc3545');
                        return;
                    }

                    let reportDetails = selectedReason;
                    if (selectedReason === 'Other') {
                        const otherDetails = reportModal.querySelector('#other-reason').value.trim();
                        if (!otherDetails) {
                            showToast("Please specify details.", '#dc3545');
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
                                postDescription: postElement.querySelector('.product-info .value')?.textContent || '',
                            }),
                        });

                        const result = await response.json();
                        if (!response.ok) throw new Error(result.message || 'Failed to report post');

                        target.innerHTML = '<i class="fas fa-flag"></i> Reported';
                        target.disabled = true;
                        target.style.backgroundColor = '#ff0000';
                        showToast(result.message || 'Post reported successfully!', '#28a745');
                        closeModal();
                    } catch (error) {
                        console.error('Report error:', error);
                        showToast(error.message || 'Error reporting post.', '#dc3545');
                    }
                });

            } else if (target.classList.contains('post-options-button')) {
                event.preventDefault();
                const optionsMenu = target.nextElementSibling;
                document.querySelectorAll('.post-options-menu.show').forEach(menu => {
                    if (menu !== optionsMenu) menu.classList.remove('show');
                });
                optionsMenu.classList.toggle('show');
            }
        });

        // Close post-options menu on outside click
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.post-options-button') && !event.target.closest('.post-options-menu')) {
                document.querySelectorAll('.post-options-menu.show').forEach(menu => menu.classList.remove('show'));
            }
        });

        // Category button event listeners (now calls fetchPosts from post-renderer.js)
        document.querySelectorAll('.category-btn').forEach(button => {
            button.addEventListener('click', function () {
                const selectedCategory = this.getAttribute('data-category');
                if (window.fetchPosts) { // Ensure fetchPosts is exposed by post-renderer.js
                    window.fetchPosts(selectedCategory);
                } else {
                    console.error('fetchPosts function not available from post-renderer.js');
                }
            });
        });
    }

    // Initial check for follow status
    await checkFollowStatusOnLoad();
});
