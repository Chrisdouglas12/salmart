// post-interactions.js
document.addEventListener('DOMContentLoaded', async function () {
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    const showToast = window.showToast; // Assumed to be globally available from auth.js

    // Function to show delete confirmation modal (remains here as it's a direct post action)
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

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to delete post');
                }

                postElement.remove(); // Remove the post from the DOM
                showToast('Post deleted successfully!', '#28a745');
                closeModal();
            } catch (error) {
                console.error('Error deleting post:', error);
                showToast(error.message || 'Error deleting post. Please try again.', '#dc3545');
                closeModal();
            }
        });
    }
  // --- Main Event Listener for Posts Container ---
    const postsContainer = document.getElementById('posts-container');

    // Listen for custom event indicating posts have been rendered by post-renderer.js
    // This is where video controls will be initialized
    window.addEventListener('postsRendered', () => {
        document.querySelectorAll('.post').forEach(postElement => {
            // Ensure initializeVideoControls is available globally or imported
            if (window.initializeVideoControls) {
                window.initializeVideoControls(postElement);
            } else {
                console.warn('initializeVideoControls not found. Make sure video-controls.js is loaded.');
            }
        });
    });

    if (postsContainer) {
        postsContainer.addEventListener('click', async (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            const postElement = target.closest('.post');
            if (!postElement) return;

            const postId = postElement.dataset.postId;
            const authToken = localStorage.getItem('authToken');
            const loggedInUser = localStorage.getItem('userId');

            // --- Send Message Button ---
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
                const encodedMessage = encodeURIComponent(message);
                const encodedProductImage = encodeURIComponent(productImage);
                const encodedRecipientUsername = encodeURIComponent(recipientUsername);
                const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);
                const encodedProductDescription = encodeURIComponent(productDescription);

                const chatUrl = `Chats.html?user_id=${loggedInUser}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}&product_id=${postId}&product_name=${encodedProductDescription}`;
                window.location.href = chatUrl;

            }
            // --- Buy Now Button ---
            else if (target.classList.contains('buy-now-button') && target.dataset.postId) {
                const email = localStorage.getItem('email');
                const buyerId = localStorage.getItem('userId');

                if (!email || !buyerId || !postId) {
                    showToast("Please log in to make a purchase or complete your profile.", '#dc3545');
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
                    console.error('Payment error:', error);
                    showToast('Failed to process payment. Please try again.', '#dc3545');
                }

            }
            // --- Like Button ---
            else if (target.classList.contains('like-button')) {
                if (!authToken || !loggedInUser) {
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

                } catch (error) {
                    console.error('Like error:', error);
                    likeCountElement.textContent = currentLikes;
                    icon.classList.toggle('fas', isCurrentlyLiked);
                    icon.classList.toggle('far', !isCurrentlyLiked);
                    showToast(error.message || 'Failed to update like status.', '#dc3545');
                } finally {
                    target.disabled = false;
                }

            }
            // --- Reply Button (navigate to product details) ---
            else if (target.classList.contains('reply-button')) {
                window.location.href = `product.html?postId=${postId}`;

            }
            // --- Share Button ---
            else if (target.classList.contains('share-button')) {
                // Collect post data for sharing
                const postData = {
                    _id: postId,
                    description: postElement.querySelector('.product-info .value')?.textContent || '',
                    price: parseFloat(postElement.querySelector('.price-value')?.textContent?.replace('₦', '').replace(/,/g, '')) || null,
                };
                // Ensure showShareModal is available globally or imported
                if (window.showShareModal) {
                    window.showShareModal(postData);
                } else {
                    console.warn('showShareModal not found. Make sure share-utilities.js is loaded.');
                }

            }
            // --- Follow Button ---
            else if (target.classList.contains('follow-button')) {
                const userIdToFollow = target.dataset.userId;
                if (!authToken) {
                    showToast('Please log in to follow users.', '#dc3545');
                    return;
                }

                const isCurrentlyFollowing = target.textContent.includes('Following');

                if (window.updateFollowButtonsUI) {
                    window.updateFollowButtonsUI(userIdToFollow, !isCurrentlyFollowing);
                }

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
                    showToast(data.message || 'Follow status updated!', '#28a745');

                } catch (error) {
                    console.error('Follow/Unfollow error:', error);
                    showToast(error.message || 'Failed to update follow status.', '#dc3545');
                    if (window.updateFollowButtonsUI) {
                        window.updateFollowButtonsUI(userIdToFollow, isCurrentlyFollowing);
                    }
                }
            }
            // --- Delete Post Button ---
            else if (target.classList.contains('delete-post-button')) {
                showDeleteConfirmationModal(postId, authToken, postElement);

            }
            // --- Edit Post Button ---
            else if (target.classList.contains('edit-post-button')) {
                window.location.href = `Ads.html?edit=true&postId=${postId}`;

            }
            // --- Report Post Button ---
            else if (target.classList.contains('report-post-button')) {
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
                const otherReasonTextarea = reportModal.querySelector('#other-reason');

                radioButtons.forEach(radio => {
                    radio.addEventListener('change', () => {
                        submitButton.disabled = false;
                        otherReasonContainer.style.display = radio.value === 'Other' ? 'block' : 'none';
                        if (radio.value !== 'Other') {
                            otherReasonTextarea.value = '';
                        }
                    });
                });

                otherReasonTextarea.addEventListener('input', () => {
                    const selectedRadio = reportModal.querySelector('input[name="report-reason"]:checked');
                    if (selectedRadio && selectedRadio.value === 'Other') {
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
                    const selectedReason = reportModal.querySelector('input[name="report-reason"]:checked')?.value;
                    if (!selectedReason) {
                        showToast("Please select a reason.", '#dc3545');
                        return;
                    }

                    let reportDetails = selectedReason;
                    if (selectedReason === 'Other') {
                        const otherDetails = otherReasonTextarea.value.trim();
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

            }
            // --- Post Options Menu Toggle ---
            else if (target.classList.contains('post-options-button')) {
                event.preventDefault();
                const optionsMenu = target.nextElementSibling;

                document.querySelectorAll('.post-options-menu.show').forEach(menu => {
                    if (menu !== optionsMenu) {
                        menu.classList.remove('show');
                    }
                });
                optionsMenu.classList.toggle('show');
            }
        });

        // Close post options menu if clicked outside
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.post-options-button') && !event.target.closest('.post-options-menu')) {
                document.querySelectorAll('.post-options-menu.show').forEach(menu => menu.classList.remove('show'));
            }
        });

        // --- Category Buttons (Delegated to post-renderer.js) ---
        document.querySelectorAll('.category-btn').forEach(button => {
            button.addEventListener('click', function () {
                const selectedCategory = this.getAttribute('data-category');
                if (window.fetchPosts) {
                    window.fetchPosts(selectedCategory);
                } else {
                    console.error('fetchPosts function not available from post-renderer.js. Ensure auth.js and post-renderer.js load correctly.');
                }
            });
        });
    }
});
