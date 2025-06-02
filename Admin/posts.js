// posts.js
import { showToast, copyToClipboard } from 'utils.js';
import { showShareModal, showDeleteConfirmationModal, showReportModal } from 'modals.js';
import { initializeVideoControls } from 'video-controls.js';
import { API_BASE_URL } from 'constants.js';

let followingList = JSON.parse(localStorage.getItem('followingList')) || [];

export async function fetchPosts(category = '') {
    const postsContainer = document.getElementById('posts-container');
    try {
        const response = await fetch(`${API_BASE_URL}/post?category=${encodeURIComponent(category)}`);
        if (!response.ok) throw new Error('Failed to fetch posts');

        const posts = await response.json();
        postsContainer.innerHTML = '';

        posts.forEach(post => {
            const postElement = createPostElement(post);
            postsContainer.prepend(postElement);
            initializeVideoControls(postElement);
        });

        setupPostEventListeners(postsContainer);
    } catch (error) {
        console.error('Error fetching posts:', error);
        postsContainer.innerHTML = '<p style="text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">No posts yet. Try again or create one!</p>';
    }
}

function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.classList.add('post');
    postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
    postElement.dataset.postId = post._id || '';
    const loggedInUser = localStorage.getItem('userId');
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
    return postElement;
}

function setupPostEventListeners(postsContainer) {
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
                const userLikes = data.likes.includes(localStorage.getItem('userId'));
                icon.classList.toggle('fas', userLikes);
                icon.classList.toggle('far', !userLikes);

                if (userLikes && !isCurrentlyLiked) {
                    socket.emit('like', { postId, userId: localStorage.getItem('userId') });
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
            showReportModal(postId, postElement, authToken);

        } else if (target.classList.contains('post-options-button')) {
            event.preventDefault();
            const optionsMenu = target.nextElementSibling;
            document.querySelectorAll('.post-options-menu.show').forEach(menu => {
                if (menu !== optionsMenu) menu.classList.remove('show');
            });
            optionsMenu.classList.toggle('show');
        }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.post-options-button') && !event.target.closest('.post-options-menu')) {
            document.querySelectorAll('.post-options-menu.show').forEach(menu => menu.classList.remove('show'));
        }
    });
}