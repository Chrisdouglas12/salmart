document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart-production.up.railway.app';
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
    function showToast(message) {
        const toast = document.querySelector('.toast-message');
        if (toast) {
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        } else {
            console.warn('Toast element not found');
        }
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

    // Fetch post details
    async function fetchPost() {
        try {
            const response = await fetch(`${API_BASE_URL}/post/${postId}`);
            if (!response.ok) throw new Error('Failed to fetch post');
            const post = await response.json();
            console.log('Post data:', post); // Debug: Log post data to check comments

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
            comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort newest to oldest
            console.log('Sorted comments:', comments); // Debug: Log sorted comments

            // Render post details
            postDetailsContainer.innerHTML = `
                <div class="post-header">
                    <a href="Profile.html?userId=${post.createdBy.userId}">
                        <img src="${post.profilePicture || 'default-avatar.png'}" class="post-avatar">
                    </a>
                    <div class="post-user-info">
                        <a href="Profile.html?userId=${post.createdBy.userId}" class="post-user-name">${post.createdBy.name}</a>
                        <p class="post-time">${formatTime(post.createdAt)}</p>
                    </div>
                    ${
                        post.createdBy.userId !== loggedInUser ?
                        followingList.includes(post.createdBy.userId) ?
                        `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #28a745;">
                            <i class="fas fa-user-check"></i> Following
                        </button>` :
                        `<button class="follow-button" data-user-id="${post.createdBy.userId}">
                            <i class="fas fa-user-plus"></i> Follow
                        </button>` : ''
                    }
                </div>
                <p class="post-description"><b>Product:</b> ${post.description}</p>
                <p class="post-description"><b>Condition:</b> ${post.productCondition}</p>
                <p class="post-description"><b>Price:</b> ₦${Number(post.price).toLocaleString('en-Ng')}</p>
                <p class="post-description"><b>Location:</b> ${post.location}</p>
                <img src="${post.photo || 'default-image.png'}" class="post-image" onclick="openImage('${post.photo || 'default-image.png'}')">
                <div class="post-actions">
                    <button class="like-button">
                        <i class="${post.likes.includes(loggedInUser) ? 'fas' : 'far'} fa-heart"></i>
                        <span class="like-count">${post.likes.length}</span>
                    </button>
                    <button class="share-button"><i class="fas fa-share"></i></button>
                </div>
                <button class="buy" data-post-id="${post._id}" ${post.isSold ? 'disabled' : ''}>${post.isSold ? 'Sold Out' : 'Buy Now'}</button>
                <a id="send-message-link">
                    <button class="buy" id="send-message-btn"
                        data-recipient-id="${post.createdBy.userId}"
                        data-product-image="${post.photo || 'default-image.png'}"
                        data-product-description="${post.description}">
                        ${post.isSold ? 'Unavailable' : 'Check availability'}
                    </button>
                </a>
                <div class="comments-list">
                    ${comments.length > 0 ? comments.map(comment => `
                        <div class="comment" data-comment-id="${comment._id}">
                            <img src="${comment.profilePicture || 'default-avatar.png'}" class="comment-avatar">
                            <div class="comment-info">
                                <strong>${comment.name}</strong>
                                <p>${comment.text}</p>
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

            // Like functionality
            const likeButton = postDetailsContainer.querySelector('.like-button');
            likeButton.addEventListener('click', async () => {
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
                    showToast(error.message || 'Action failed. Please try again.');
                } finally {
                    likeButton.disabled = false;
                }
            });

            // Follow functionality
            const followButton = postDetailsContainer.querySelector('.follow-button');
            if (followButton) {
                followButton.addEventListener('click', async () => {
                    const userIdToFollow = followButton.getAttribute('data-user-id');
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
                        showToast('You are now following this user!');
                    } catch (error) {
                        console.error('Error following user:', error);
                        showToast(error.message || 'Failed to follow user.');
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
            // Verify the comment exists in the backend before navigating
            fetch(`${API_BASE_URL}/post/${postId}`).then(response => response.json()).then(post => {
                const commentExists = post.comments.some(comment => comment._id === commentId);
                if (commentExists) {
                    window.location.href = `reply.html?postId=${postId}&commentId=${commentId}`;
                } else {
                    showToast('Comment not found. Please try again.');
                }
            }).catch(error => {
                console.error('Error verifying comment:', error);
                showToast('Failed to verify comment. Please try again.');
            });
        }
    });

    // Add comment functionality
    commentSubmit.addEventListener('click', async () => {
        const commentText = commentInput.value.trim();
        if (!commentText) {
            showToast('Please enter a comment.');
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
            console.log('New comment:', newComment); // Debug: Log new comment

            // Fallback for createdAt if not provided by API
            const commentTimestamp = newComment.createdAt || new Date().toISOString();
            // Fallback for text if not provided by API
            const displayText = newComment.text || commentText;

            const commentsList = postDetailsContainer.querySelector('.comments-list');
            const newCommentHTML = `
                <div class="comment" data-comment-id="${newComment._id}">
                    <img src="${newComment.profilePicture || 'default-avatar.png'}" class="comment-avatar">
                    <div class="comment-info">
                        <strong>${newComment.name}</strong>
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
            commentsList.insertAdjacentHTML('afterbegin', newCommentHTML); // Add new comment at the top
            commentInput.value = '';
            showToast('Your comment has been posted!');

            // Remove "No comments yet" message if present
            const noCommentsMessage = commentsList.querySelector('p');
            if (noCommentsMessage) {
                noCommentsMessage.remove();
            }

            // Refetch post to ensure comment is persisted before allowing replies
            await fetchPost();
        } catch (error) {
            console.error('Error posting comment:', error);
            showToast(error.message || 'Failed to post comment.');
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

    function sharePost(post, postLink, platform) {
        const shareText = `Check out this product: ${post.description} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}`;
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
            }
            return false;
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            return false;
        }
    }

    // Initialize page
    await fetchUserProfile();
    await fetchPost();
});