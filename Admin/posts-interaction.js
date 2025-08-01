// post-interactions.js
document.addEventListener('DOMContentLoaded', async function () {
    // --- Constants and Global Dependencies ---
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    // Ensure showToast is available, assumed from main.js or a utility file.
    const showToast = window.showToast; 

    // --- Helper Functions ---

    /**
     * Displays a custom confirmation modal for deleting a post.
     * @param {string} postId - The ID of the post to be deleted.
     * @param {string} authToken - The authentication token of the current user.
     * @param {HTMLElement} postElement - The DOM element of the post to be removed upon successful deletion.
     */
    function showDeleteConfirmationModal(postId, authToken, postElement) {
        const modal = document.createElement('div');
        modal.className = 'delete-confirmation-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Delete Product</h3>
                    <span class="close-delete-modal" aria-label="Close dialog">×</span>
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
        // Add a class to the body to prevent scrolling when modal is open
        document.body.classList.add('modal-open'); 

        const closeModal = () => {
            document.body.removeChild(modal);
            document.body.classList.remove('modal-open'); // Restore scrolling
        };

        // Close modal listeners
        modal.querySelector('.close-delete-modal').addEventListener('click', closeModal);
        modal.querySelector('.cancel-delete').addEventListener('click', closeModal);
        // Close if clicking outside the modal content
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Confirm delete action
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

    /**
     * Displays a custom modal for reporting a post.
     * @param {string} postId - The ID of the post being reported.
     * @param {string} authToken - The authentication token of the current user.
     * @param {HTMLElement} postElement - The DOM element of the post being reported.
     * @param {string} loggedInUser - The ID of the currently logged-in user.
     */
    function showReportModal(postId, authToken, postElement, loggedInUser) {
        const postOwnerId = postElement.dataset.userId; // Get the user ID of the post creator

        if (postOwnerId === loggedInUser) {
            showToast("You cannot report your own post.", '#ffc107');
            return;
        }

        const reportModal = document.createElement('div');
        reportModal.className = 'report-modal';
        reportModal.innerHTML = `
            <div class="report-modal-content">
                <div class="report-modal-header">
                    <h3>Report Post</h3>
                    <span class="close-modal" aria-label="Close dialog">×</span>
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
        document.body.classList.add('modal-open');

        const radioButtons = reportModal.querySelectorAll('input[type="radio"]');
        const otherReasonContainer = reportModal.querySelector('.other-reason');
        const submitButton = reportModal.querySelector('.submit-report');
        const otherReasonTextarea = reportModal.querySelector('#other-reason');

        radioButtons.forEach(radio => {
            radio.addEventListener('change', () => {
                submitButton.disabled = false;
                otherReasonContainer.style.display = radio.value === 'Other' ? 'block' : 'none';
                if (radio.value !== 'Other') {
                    otherReasonTextarea.value = ''; // Clear other reason if not 'Other'
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
            document.body.classList.remove('modal-open');
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
                    showToast("Please specify details for 'Other' reason.", '#dc3545');
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
                        postDescription: postElement.querySelector('.post-description-text p')?.textContent || postElement.querySelector('.product-title')?.textContent || '',
                    }),
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'Failed to report post');

                // Update UI to reflect report status
                const reportButton = postElement.querySelector(`.report-post-button[data-post-id="${postId}"]`);
                if (reportButton) {
                    reportButton.innerHTML = '<i class="fas fa-flag"></i> Reported';
                    reportButton.disabled = true;
                    reportButton.style.backgroundColor = '#cccccc'; // Grey out the button
                    reportButton.style.color = '#666666';
                }
                showToast(result.message || 'Post reported successfully!', '#28a745');
                closeModal();
            } catch (error) {
                console.error('Report error:', error);
                showToast(error.message || 'Error reporting post.', '#dc3545');
            }
        });
    }

    // --- Main Event Listener for Posts Container ---
    const postsContainer = document.getElementById('posts-container');

    // This event listener assumes `postsRendered` is dispatched from `main.js`
    window.addEventListener('postsRendered', () => {
        // Any post-render initialization that might be needed,
        // though lazyLoadVideo and initializeVideoControls are generally called
        // directly when rendering individual posts in main.js.
        // This block can be used for other global post-render tasks if needed.
    });

    if (postsContainer) {
        postsContainer.addEventListener('click', async (event) => {
            // Use closest to find the relevant button/link
            const target = event.target.closest('button, a'); 
            if (!target) return;

            // Find the closest parent post element for context
            const postElement = target.closest('.post');
            const promotedPostElement = target.closest('.promoted-post');
            
            const elementForContext = postElement || promotedPostElement;
            if (!elementForContext) return;

            const postId = elementForContext.dataset.postId;
            const authToken = localStorage.getItem('authToken');
            const loggedInUser = localStorage.getItem('userId');

            // --- Send Message Button ---
            if (target.classList.contains('send-message-btn')) {
                event.preventDefault(); // Prevent default link/button behavior

                // Redirect to login if not authenticated
                if (!loggedInUser) {
                    window.redirectToLogin(); // Assumed global function from main.js
                    return;
                }

                const recipientId = target.dataset.recipientId;
                const recipientUsername = elementForContext.querySelector('.post-user-name')?.textContent || elementForContext.querySelector('.promoted-user-name')?.textContent || 'Unknown';
                const recipientProfilePictureUrl = elementForContext.querySelector('.post-avatar')?.src || elementForContext.querySelector('.promoted-avatar')?.src || '/salmart-192x192.png';
                let productImage = target.dataset.productImage || '';
                const productDescription = target.dataset.productDescription || '';

                // Ensure product image URL is absolute
                if (productImage && !productImage.match(/^https?:\/\//)) {
                    productImage = productImage.startsWith('/') ? `${API_BASE_URL}${productImage}` : `${API_BASE_URL}/${productImage}`;
                }

                const message = `I'm interested in this item: ${productDescription}. Is it still available?`;
                
                const params = new URLSearchParams();
                params.append('user_id', loggedInUser);
                params.append('recipient_id', recipientId);
                params.append('recipient_username', recipientUsername);
                params.append('recipient_profile_picture_url', recipientProfilePictureUrl);
                params.append('message', message);
                params.append('product_image', productImage);
                params.append('product_id', postId);
                params.append('product_name', productDescription);

                window.location.href = `Chats.html?${params.toString()}`;

            }
            // --- Buy Now Button ---
            else if (target.classList.contains('buy-now-button')) {
                event.preventDefault();
                if (!loggedInUser) {
                    window.redirectToLogin();
                    return;
                }
                if (!postId) {
                    console.error("Post ID is missing");
                    showToast('Error: Post ID not found.', '#dc3545');
                    return;
                }

                const recipientUsername = elementForContext.querySelector('.post-user-name')?.textContent ||
                                         elementForContext.querySelector('.promoted-user-name')?.textContent || 'Unknown';
                const recipientProfilePictureUrl = elementForContext.querySelector('.post-avatar')?.src ||
                                                  elementForContext.querySelector('.promoted-avatar')?.src || '/salmart-192x192.png';

                const productData = {
                    postId: postId,
                    productImage: target.dataset.productImage || '',
                    productTitle: target.dataset.productTitle || '',
                    productDescription: target.dataset.productDescription || '',
                    productLocation: target.dataset.productLocation || '',
                    productCondition: target.dataset.productCondition || '',
                    productPrice: target.dataset.productPrice || '',
                    sellerId: target.dataset.sellerId || '',
                    recipient_username: encodeURIComponent(recipientUsername),
                    recipient_profile_picture_url: encodeURIComponent(recipientProfilePictureUrl)
                };

                const queryParams = new URLSearchParams(productData).toString();
                window.location.href = `checkout.html?${queryParams}`;
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
                const currentLikes = parseInt(likeCountElement.textContent, 10);

                // Optimistic UI Update: Disable button to prevent multiple clicks
                target.disabled = true; 
                likeCountElement.textContent = isCurrentlyLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
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
                    // Update UI with actual count from server
                    likeCountElement.textContent = data.likes.length;
                    // Ensure icon state matches server response for consistency
                    const userLikes = data.likes.includes(loggedInUser);
                    icon.classList.toggle('fas', userLikes);
                    icon.classList.toggle('far', !userLikes);

                } catch (error) {
                    console.error('Like error:', error);
                    // Revert UI on error
                    likeCountElement.textContent = currentLikes;
                    icon.classList.toggle('fas', isCurrentlyLiked);
                    icon.classList.toggle('far', !isCurrentlyLiked);
                    showToast(error.message || 'Failed to update like status.', '#dc3545');
                } finally {
                    target.disabled = false; // Re-enable button
                }

            }

            // --- Share Button ---
            else if (target.classList.contains('share-button')) {
                // Collect post data for sharing
                const postData = {
                    _id: postId,
                    description: postElement.querySelector('.post-description-text p')?.textContent || postElement.querySelector('.product-title')?.textContent || '',
                    price: parseFloat(postElement.querySelector('.price-value')?.textContent?.replace('₦', '').replace(/,/g, '')) || null,
                };
                // Ensure showShareModal is available globally or imported from a separate share utility file
                if (window.showShareModal) {
                    window.showShareModal(postData);
                } else {
                    console.warn('showShareModal not found. Make sure share-utilities.js is loaded.');
                    showToast('Share functionality not available.', '#ffc107');
                }
            }
            // --- Follow Button ---
            else if (target.classList.contains('follow-button')) {
                const userIdToFollow = target.dataset.userId;
                if (!authToken || !loggedInUser) {
                    window.redirectToLogin();
                    return;
                }

                // Prevent self-follow
                if (userIdToFollow === loggedInUser) {
                    showToast("You cannot follow yourself.", '#ffc107');
                    return;
                }

                const isCurrentlyFollowing = target.textContent.includes('Following');

                // Optimistic UI update for follow button
                if (window.updateFollowButtonsUI) {
                    window.updateFollowButtonsUI(userIdToFollow, !isCurrentlyFollowing);
                } else {
                    // Fallback if global function isn't loaded (less ideal)
                    target.textContent = isCurrentlyFollowing ? 'Follow' : 'Following';
                    target.classList.toggle('following', !isCurrentlyFollowing);
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
                    // Revert UI on error
                    if (window.updateFollowButtonsUI) {
                        window.updateFollowButtonsUI(userIdToFollow, isCurrentlyFollowing);
                    } else {
                        target.textContent = isCurrentlyFollowing ? 'Following' : 'Follow';
                        target.classList.toggle('following', isCurrentlyFollowing);
                    }
                }
            }
            // --- Promote Button ---
            else if (target.classList.contains('promote-button')) {
                const postId = target.dataset.postId;
                if (!postId) {
                    showToast('Invalid post ID for promotion', '#dc3545');
                    return;
                }
                window.location.href = `promote.html?postId=${postId}`;
                return;
            }
            // --- Reply Button ---
            else if (target.classList.contains('reply-button')) {
                window.location.href = `product.html?postId=${postId}`;
                return;
            }
            // --- Delete Post Button ---
            else if (target.classList.contains('delete-post-button')) {
                event.preventDefault(); // Crucial: Prevent any default browser behavior
                // Trigger our custom confirmation modal instead of browser alert
                showDeleteConfirmationModal(postId, authToken, postElement);
            }
            // --- Edit Post Button ---
            else if (target.classList.contains('edit-post-button')) {
                if (!loggedInUser) {
                    window.redirectToLogin();
                    return;
                }
                const postType = target.dataset.postType; // Get the post type from data-attribute
                window.location.href = `Ads.html?edit=true&postId=${postId}&postType=${postType}`; // Pass postType
            }
            // --- Report Post Button ---
            else if (target.classList.contains('report-post-button')) {
                if (!authToken) {
                    window.redirectToLogin();
                    return;
                }
                // Call the custom report modal function
                showReportModal(postId, authToken, postElement, loggedInUser);
            }
            // --- Post Options Menu Toggle ---
            else if (target.classList.contains('post-options-button')) {
                event.preventDefault(); // Prevent default button behavior
                const optionsMenu = target.nextElementSibling;

                // Close any other open menus
                document.querySelectorAll('.post-options-menu.active').forEach(menu => {
                    if (menu !== optionsMenu) {
                        menu.classList.remove('active');
                    }
                });
                // Toggle current menu
                optionsMenu.classList.toggle('active');
            }
        });

        // Close post options menu if clicked anywhere else on the document
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.post-options')) {
                document.querySelectorAll('.post-options-menu.active').forEach(menu => menu.classList.remove('active'));
            }
        });

        // --- Category Buttons (Delegated to post-renderer.js/main.js, ensure the call is correct) ---
        // This block ensures that if category buttons are within postsContainer, their clicks
        // are correctly handled by the `window.fetchPosts` function exposed by main.js.
        // It's a good practice to centralize category filtering logic in the main rendering script.
        document.querySelectorAll('.category-btn').forEach(button => {
            button.addEventListener('click', function () {
                const selectedCategory = this.getAttribute('data-category');
                // Ensure `fetchPosts` is available globally from `main.js`
                if (window.fetchPosts) {
                    window.fetchPosts(selectedCategory, 1, true); // Reset to page 1, clear existing
                } else {
                    console.error('fetchPosts function not available. Ensure main.js loads correctly.');
                    showToast('Category filtering not available.', '#dc3545');
                }
            });
        });
    }
});
