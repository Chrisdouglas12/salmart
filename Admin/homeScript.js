document.addEventListener('DOMContentLoaded', async function () {
    const profilePictureContainer = document.getElementById('profile-picture1');
    const homeProfilePicture = document.getElementById('profile-picture3');
    const usernameContainer = document.getElementById('username1');
    let loggedInUser = null;
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';

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

    let followingList = [];
    try {
        followingList = JSON.parse(localStorage.getItem('followingList')) || [];
    } catch (e) {
        console.error("Error parsing followingList:", e);
        followingList = [];
    }

    async function checkLoginStatus() {
        const token = localStorage.getItem('authToken');
        const tokenExpiry = localStorage.getItem('tokenExpiry');

        if (!token || Date.now() > tokenExpiry) {
            console.log('Token expired or missing. Redirecting to login...');
            showLoginOption();
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/verify-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const userData = await response.json();
                profilePictureContainer.src = userData.profilePicture || 'default-avater.png';
                homeProfilePicture.src = userData.profilePicture || 'default-avater.png';
                usernameContainer.textContent = `Welcome, ${userData.firstName || 'User'}`;
                loggedInUser = userData.userId;
                fetchPosts();

                document.querySelectorAll('.category-btn').forEach(button => {
                    button.addEventListener('click', function () {
                        const selectedCategory = this.getAttribute('data-category');
                        fetchPosts(selectedCategory);
                    });
                });
            } else {
                throw new Error('Token validation failed');
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            showLoginOption();
        }
    }

    function showLoginOption() {
        profilePictureContainer.src = 'default-avater.png';
        homeProfilePicture.src = 'default-avater.png';
        usernameContainer.textContent = 'Please log in';
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

    function showToast(message, bgColor = '#333') {
        const toast = document.createElement("div");
        toast.className = "toast-message show";
        toast.style.backgroundColor = bgColor;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 500);
        }, 3000);
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
        const shareText = `Check out this product: ${post.description || 'No description'} - ${post.photo} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}`;

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

    async function fetchPosts(category = '') {
        const postsContainer = document.getElementById('posts-container');
        try {
            const response = await fetch(`${API_BASE_URL}/post?category=${encodeURIComponent(category)}`);
            if (!response.ok) throw new Error('Failed to fetch posts');

            const posts = await response.json();
            postsContainer.innerHTML = '';

            posts.forEach(post => {
                const postElement = document.createElement('div');
                postElement.classList.add('post');
                postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
                postElement.dataset.postId = post._id || '';

                const isFollowing = post.isFollowing || (post.createdBy && followingList.includes(post.createdBy.userId));

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

                postElement.innerHTML = `
                    <div class="post-header">
                        <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                            <img src="${post.profilePicture || 'default-avatar.png'}" class="post-avatar">
                        </a>
                        <div class="post-user-info">
                            <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                                <h4 class="post-user-name">${post.createdBy ? post.createdBy.name : 'Unknown'}</h4>
                            </a>
                            <p class="post-time">${formatTime(post.createdAt || new Date())}</p>
                        </div>
                        ${post.createdBy && post.createdBy.userId !== loggedInUser ?
                            (isFollowing ?
                                `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #28a745;">
                                    <i class="fas fa-user-check"></i> Following
                                </button>` :
                                `<button class="follow-button" data-user-id="${post.createdBy.userId}">
                                    <i class="fas fa-user-plus"></i> Follow
                                </button>`)
                            : ''}
                        <div class="post-options">
                            <button class="post-options-button"><i class="fas fa-ellipsis-h"></i></button>
                            <div class="post-options-menu">
                                <ul>
                                    ${post.createdBy && post.createdBy.userId === loggedInUser ? `
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
                        ${post.createdBy && post.createdBy.userId !== loggedInUser ? buttonContent : ''}
                    </div>

                    <div class="post-actions">
                        <button class="action-button like-button">
                            <i class="${post.likes && post.likes.includes(loggedInUser) ? 'fas' : 'far'} fa-heart"></i>
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

                postsContainer.prepend(postElement);
                initializeVideoControls(postElement);
            });

            // Event delegation for all button clicks
            postsContainer.addEventListener('click', async (event) => {
                const target = event.target.closest('button');
                if (!target) return;

                const postElement = target.closest('.post');
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

                    target.disabled = true;
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
                        const userLikes = data.likes.includes(loggedInUser);
                        icon.classList.toggle('fas', userLikes);
                        icon.classList.toggle('far', !userLikes);

                        if (userLikes && !isCurrentlyLiked) {
                            socket.emit('like', { postId, userId: loggedInUser });
                        }
                    } catch (error) {
                        console.error('Like error:', error);
                        likeCountElement.textContent = currentLikes;
                        icon.classList.toggle('fas', isCurrentlyLiked);
                        icon.classList.toggle('far', !isCurrentlyLiked);
                        showToast(error.message || 'Failed to like/unlike post.', '#dc3545');
                    } finally {
                        target.disabled = false;
                    }

                } else if (target.classList.contains('reply-button')) {
                    window.location.href = `posts-details.html?postId=${postId}`;

                } else if (target.classList.contains('share-button')) {
                    const postData = {
                        _id: postId,
                        description: postElement.querySelector('.product-info .value')?.textContent || '',
                        price: parseFloat(postElement.querySelector('.price-value')?.textContent?.replace('₦', '').replace(/,/g, '')) || null,
                    };
                    showShareModal(postData);

                } else if (target.classList.contains('follow-button')) {
                    const userId = target.dataset.userId;
                    if (!authToken) {
                        showToast('Please log in to follow users.', '#dc3545');
                        return;
                    }

                    try {
                        const response = await fetch(`${API_BASE_URL}/follow/${userId}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${authToken}`,
                            },
                        });

                        if (!response.ok) throw new Error('Failed to follow user');

                        if (!followingList.includes(userId)) {
                            followingList.push(userId);
                            localStorage.setItem('followingList', JSON.stringify(followingList));
                        }

                        document.querySelectorAll(`.follow-button[data-user-id="${userId}"]`).forEach(btn => {
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

            // Follow button handler (global)
            postsContainer.addEventListener('click', async (event) => {
                const target = event.target.closest('.follow-button');
                if (!target) return;

                const userId = target.dataset.userId;
                const authToken = localStorage.getItem('authToken');
                if (!authToken) {
                    showToast('Please log in to follow users.', '#dc3545');
                    return;
                }

                try {
                    const response = await fetch(`${API_BASE_URL}/follow/${userId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`,
                        },
                    });

                    if (!response.ok) throw new Error('Failed to follow user');

                    if (!followingList.includes(userId)) {
                        followingList.push(userId);
                        localStorage.setItem('followingList', JSON.stringify(followingList));
                    }

                    document.querySelectorAll(`.follow-button[data-user-id="${userId}"]`).forEach(btn => {
                        btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
                        btn.style.backgroundColor = '#28a745';
                    });

                    showToast('You are now following this user!', '#28a745');
                } catch (error) {
                    console.error('Follow error:', error);
                    showToast(error.message || 'Failed to follow user.', '#dc3545');
                }
            });

        } catch (error) {
            console.error('Error fetching posts:', error);
            postsContainer.innerHTML = '<p style="text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">No posts yet. Try again or create one!</p>';
        }
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

    checkLoginStatus();
    checkFollowStatusOnLoad();
});