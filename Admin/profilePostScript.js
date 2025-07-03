// post-renderer.js
import { salmartCache } from './salmartCache.js';

document.addEventListener('DOMContentLoaded', async function () {
    let currentLoggedInUser = null;
    let isAuthReady = false;

    // --- State variables for pagination ---
    let currentPage = 1;
    let isLoading = false;

    // --- Helper Functions ---

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
        const shareText = `Check out this product: ${post.description} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}`;
        
        switch(platform) {
            case 'copy':
                copyToClipboard(postLink);
                window.showToast('Link copied to clipboard!', '#28a745');
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
                openAppOrWeb(instagramUrl, `https://www.instagram.com/explore/tags/product/`);
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
            window.showToast(success ? 'Link copied to clipboard!' : 'Failed to copy link', success ? '#28a745' : '#dc3545');
        });
    }

    function initializeVideoControls(postElement) {
        const container = postElement.querySelector('.product-image');
        if (!container) return;

        const video = container.querySelector('.post-video');
        if (!video) return;

        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('crossorigin', 'anonymous');

        video.addEventListener('error', () => {
            window.showToast('Failed to load video.', '#dc3545');
        });
    }

    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';

        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;
        let productDetails = '';
        let mediaContent = '';
        let descriptionContent = '';
        let buttonContent = '';

        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');

        if (post.postType === 'video_ad') {
            descriptionContent = `
                <div class="post-description-text" style="margin-bottom: 10px; padding: 0 15px;">
                    <p>${escapeHtml(post.description || '')}</p>
                </div>
            `;
            mediaContent = `
                <div class="product-image">
                    <div class="badge">New</div>
                    <video class="post-video" preload="metadata" aria-label="Video ad for ${(post.description || 'product').replace(/"/g, '"')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
                        <source src="${post.video || ''}" type="video/mp4" />
                        <source src="${post.video ? post.video.replace('.mp4', '.webm') : ''}" type="video/webm" />
                        <source src="${post.video ? post.video.replace('.mp4', '.ogg') : ''}" type="video/ogg" />
                        Your browser does not support the video tag.
                    </video>
                </div>
            `;
            productDetails = `
                <div class="content">
                    <h2 class="product-title">${escapeHtml(post.description || 'No description')}</h2>
                </div>
            `;
            buttonContent = `
                <div class="actions">
                    <a href="${post.productLink || '#'}" class="btn btn-primary checkout-product-button" aria-label="Check out product ${escapeHtml(post.description || 'product')}" ${!post.productLink ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                        Check Out Product
                    </a>
                </div>
            `;
        } else {
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
            buttonContent = currentLoggedInUser && !isPostCreator ? `
                <div class="actions">
                    <button class="btn btn-secondary send-message-btn"
                        data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                        data-product-image="${productImageForChat}"
                        data-product-description="${escapeHtml(post.description || '')}"
                        data-post-id="${post._id || ''}"
                        ${post.isSold ? 'disabled' : ''}>
                        ${post.isSold ? 'Unavailable' : 'Message'}
                    </button>
                    <button class="btn btn-primary buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                        ${post.isSold ? 'Sold Out' : 'Buy Now'}
                    </button>
                </div>
            ` : currentLoggedInUser ? '' : `
                <div class="actions">
                    <button class="btn btn-secondary login-required" onclick="window.redirectToLogin()">
                        Message
                    </button>
                    <button class="btn btn-primary login-required" onclick="window.redirectToLogin()">
                        Buy Now
                    </button>
                </div>
            `;
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

        return postElement;
    }

    async function fetchPosts(page = currentPage, clearExisting = false) {
        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            console.error('Posts container not found.');
            return;
        }

        if (isLoading && !clearExisting) {
            console.log('Posts are already loading. Skipping new request.');
            return;
        }
        isLoading = true;

        if (clearExisting) {
            postsContainer.innerHTML = '';
        }

        const urlParams = new URLSearchParams(window.location.search);
        let profileOwnerId = urlParams.get('userId') || currentLoggedInUser;

        if (!profileOwnerId) {
            console.log('No userId found in URL or loggedInUser. Cannot fetch posts.');
            postsContainer.innerHTML = `
                <p style="text-align: center; padding: 20px; color: #666;">
                    Unable to load posts. Please try again later.
                </p>
            `;
            isLoading = false;
            return;
        }

        try {
            const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
            const response = await fetch(`${API_BASE_URL}/post?userId=${profileOwnerId}`);
            if (!response.ok) throw new Error('Failed to fetch posts');

            const posts = await response.json();
            if (!Array.isArray(posts) || posts.length === 0) {
                if (postsContainer.children.length === 0) {
                    postsContainer.innerHTML = `
                        <p style="text-align: center; padding: 20px; color: #666;">
                            No posts yet for this user.
                        </p>
                    `;
                }
                isLoading = false;
                return;
            }

            const sortedPosts = [...posts].sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB - dateA;
            });

            const fragment = document.createDocumentFragment();
            sortedPosts.forEach(post => {
                if (post.createdBy.userId === profileOwnerId) {
                    const postElement = renderPost(post);
                    fragment.appendChild(postElement);
                    initializeVideoControls(postElement);
                }
            });

            if (clearExisting) {
                postsContainer.innerHTML = '';
                postsContainer.appendChild(fragment);
            } else {
                postsContainer.appendChild(fragment);
            }

            if (postsContainer.children.length === 0) {
                postsContainer.innerHTML = `
                    <p style="text-align: center; padding: 20px; color: #666;">
                        No posts available.
                    </p>
                `;
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

    // --- Event Delegates for Interactive Elements ---

    document.addEventListener('click', async (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
        const authToken = localStorage.getItem('authToken');
        const showToast = window.showToast;

        // Handle Like Button
        if (target.classList.contains('like-button') && target.dataset.postId) {
            if (!authToken || !currentLoggedInUser) {
                showToast('Please log in to like posts.', '#dc3545');
                return;
            }

            const postId = target.dataset.postId;
            const likeCountElement = target.querySelector('.like-count');
            const icon = target.querySelector('i');
            const isCurrentlyLiked = icon.classList.contains('fas');

            // Optimistic UI update
            target.disabled = true;
            likeCountElement.textContent = parseInt(likeCountElement.textContent, 10) + (isCurrentlyLiked ? -1 : 1);
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
                icon.classList.toggle('fas', data.likes.includes(currentLoggedInUser));
                icon.classList.toggle('far', !data.likes.includes(currentLoggedInUser));

            } catch (error) {
                console.error('Error liking/unliking post:', error);
                likeCountElement.textContent = parseInt(likeCountElement.textContent, 10) + (isCurrentlyLiked ? 1 : -1);
                icon.classList.toggle('fas', isCurrentlyLiked);
                icon.classList.toggle('far', !isCurrentlyLiked);
                showToast(error.message || 'Failed to update like status.', '#dc3545');
            } finally {
                target.disabled = false;
            }
            return;
        }

        // Handle Reply Button
        if (target.classList.contains('reply-button') && target.dataset.postId) {
            window.location.href = `product.html?postId=${target.dataset.postId}`;
            return;
        }

        // Handle Share Button
        if (target.classList.contains('share-button') && target.dataset.postId) {
            const postElement = target.closest('.post');
            if (!postElement) return;
            const postId = target.dataset.postId;
            const post = {
                _id: postId,
                description: postElement.querySelector('.product-title')?.textContent || '',
                price: postElement.querySelector('.price-value')?.textContent.replace('₦', '').replace(/,/g, '') || null
            };
            showShareModal(post);
            return;
        }

        // Handle Buy Now Button
        if (target.classList.contains('buy-now-button') && target.dataset.postId) {
            const postId = target.dataset.postId.trim();
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
                    body: JSON.stringify({ email, postId, buyerId, currency: 'NGN' }),
                });

                const result = await response.json();
                if (response.ok && result.success && result.url) {
                    window.location.href = result.url;
                } else {
                    showToast(`Payment failed: ${result.message || 'Please try again.'}`, '#dc3545');
                }
            } catch (error) {
                console.error("Error processing payment:", error);
                showToast("Failed to process payment. Please try again.", '#dc3545');
            }
            return;
        }

        // Handle Send Message Button
        if (target.classList.contains('send-message-btn')) {
            event.preventDefault();
            const recipientId = target.dataset.recipientId;
            const postElement = target.closest('.post');
            if (!postElement) {
                console.error("Could not find parent post element.");
                showToast('Error: Post information not found.', '#dc3545');
                return;
            }

            const recipientUsername = postElement.querySelector('.post-user-name')?.textContent || 'Unknown';
            const recipientProfilePictureUrl = postElement.querySelector('.post-avatar')?.src || '/salmart-192x192.png';
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

            const chatUrl = `Chats.html?user_id=${currentLoggedInUser}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}&product_id=${postId}&product_name=${encodedProductDescription}`;
            window.location.href = chatUrl;
            return;
        }

        // Handle Report Post Button
        if (target.classList.contains('report-post-button') && target.dataset.postId) {
            if (!authToken) {
                showToast("Please log in to report posts", '#dc3545');
                return;
            }

            const postId = target.dataset.postId;
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
            const otherReasonTextarea = reportModal.querySelector('#other-reason');

            radioButtons.forEach(radio => {
                radio.addEventListener('change', () => {
                    submitButton.disabled = false;
                    if (radio.value === 'Other') {
                        otherReasonContainer.style.display = 'block';
                        submitButton.disabled = otherReasonTextarea.value.trim() === '';
                    } else {
                        otherReasonContainer.style.display = 'none';
                    }
                });
            });

            otherReasonTextarea.addEventListener('input', () => {
                if (reportModal.querySelector('input[name="report-reason"]:checked')?.value === 'Other') {
                    submitButton.disabled = otherReasonTextarea.value.trim() === '';
                }
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
                const selectedRadio = reportModal.querySelector('input[name="report-reason"]:checked');
                if (!selectedRadio) {
                    showToast("Please select a reason.", '#dc3545');
                    return;
                }

                let reportDetails = selectedRadio.value;
                if (selectedRadio.value === 'Other') {
                    const otherDetails = otherReasonTextarea.value.trim();
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
                            postDescription: postElement.querySelector('.product-title')?.textContent || ''
                        }),
                    });

                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.message || 'Failed to report post');
                    }

                    target.innerHTML = '<i class="fas fa-flag"></i> Reported';
                    target.disabled = true;
                    target.style.color = '#ff0000';
                    showToast(result.message || 'Post reported successfully! Admin will review it shortly.', '#28a745');
                    closeModal();
                } catch (error) {
                    console.error('Error reporting post:', error);
                    showToast(error.message || 'Error reporting post. Please try again.', '#dc3545');
                }
            });
            return;
        }

        // Handle Delete Post Button
        if (target.classList.contains('delete-post-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
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

                    const postElement = target.closest('.post');
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
            return;
        }

        // Handle Edit Post Button
        if (target.classList.contains('edit-post-button') && target.dataset.postId) {
            const postId = target.dataset.postId;
            window.location.href = `Ads.html?edit=true&postId=${postId}`;
            return;
        }

        // Handle Post Options Button
        if (target.classList.contains('post-options-button')) {
            event.stopPropagation();
            const optionsMenu = target.nextElementSibling;
            document.querySelectorAll('.post-options-menu.show').forEach(menu => {
                if (menu !== optionsMenu) menu.classList.remove('show');
            });
            optionsMenu.classList.toggle('show');
            return;
        }
    });

    // Close post options menu if clicked outside
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.post-options-button') && !event.target.closest('.post-options-menu')) {
            document.querySelectorAll('.post-options-menu.show').forEach(menu => menu.classList.remove('show'));
        }
    });

    // --- Authentication and Initialization Logic ---

    async function initializeAuthStatusAndPosts() {
        try {
            if (typeof window.loggedInUser !== 'undefined') {
                currentLoggedInUser = window.loggedInUser;
            } else {
                console.warn('window.loggedInUser is not yet defined.');
            }

            isAuthReady = true;
            console.log('Auth initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
            await fetchPosts(currentPage, true);

        } catch (error) {
            console.error('Error during initial auth or post fetch:', error);
            isAuthReady = true;
            await fetchPosts(currentPage, true);
        }
    }

    window.fetchPosts = fetchPosts;

    document.addEventListener('authStatusReady', async (event) => {
        currentLoggedInUser = event.detail.loggedInUser;
        console.log('Auth status ready event received. Logged in user:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
        isAuthReady = true;
        await fetchPosts(currentPage, true);
    });

    // Fallback if 'authStatusReady' event is not fired
    setTimeout(async () => {
        if (!isAuthReady) {
            console.log('Auth status timeout (500ms) - proceeding with initialization.');
            await initializeAuthStatusAndPosts();
        }
    }, 500);

    setTimeout(async () => {
        if (!isAuthReady) {
            console.log('Auth status timeout (2000ms) - proceeding with initialization.');
            await initializeAuthStatusAndPosts();
        }
    }, 2000);

    // Load More Button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (!isLoading) {
                currentPage++;
                fetchPosts(currentPage, false);
            }
        });
    }
});