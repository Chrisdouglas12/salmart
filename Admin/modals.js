// modals.js
import { showToast, copyToClipboard } from 'utils.js';
import { sharePost } from 'share.js';
import { API_BASE_URL } from 'constants.js';

export function showShareModal(post) {
    const shareModal = document.createElement('div');
    shareModal.className = 'share-modal';
    const postLink = `${window.location.origin}/product.html?id=${post._id}`;

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

export function showDeleteConfirmationModal(postId, authToken, postElement) {
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

export function showReportModal(postId, postElement, authToken) {
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

            postElement.querySelector('.report-post-button').innerHTML = '<i class="fas fa-flag"></i> Reported';
            postElement.querySelector('.report-post-button').disabled = true;
            postElement.querySelector('.report-post-button').style.backgroundColor = '#ff0000';
            showToast(result.message || 'Post reported successfully!', '#28a745');
            closeModal();
        } catch (error) {
            console.error('Report error:', error);
            showToast(error.message || 'Error reporting post.', '#dc3545');
        }
    });
}