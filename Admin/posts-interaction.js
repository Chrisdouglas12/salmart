// post-interactions.js
document.addEventListener('DOMContentLoaded', async function () {
    // Ensure these are available from auth.js (loaded first)
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    let loggedInUser = window.loggedInUser; // Will be updated by auth.js
    const showToast = window.showToast; // Utility from auth.js

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

    // --- Event Listeners for Post Interactions ---
    const postsContainer = document.getElementById('posts-container');

    // This event listener ensures video controls are initialized after posts are rendered
    // It will now dispatch to post-video-controls.js
    window.addEventListener('postsRendered', () => {
        // Trigger event in post-video-controls.js
        window.dispatchEvent(new Event('initVideoControls'));
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
                window.location.href = `product.html?postId=${postId}`;

            } else if (target.classList.contains('share-button')) {
                // Call the share function from post-sharing.js
                const postData = {
                    _id: postId,
                    description: postElement.querySelector('.product-info .value')?.textContent || '',
                    price: parseFloat(postElement.querySelector('.price-value')?.textContent?.replace('₦', '').replace(/,/g, '')) || null,
                };
                if (window.showShareModal) {
                    window.showShareModal(postData);
                } else {
                    console.error('showShareModal function not available from post-sharing.js');
                }

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
