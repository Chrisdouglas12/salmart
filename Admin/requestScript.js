const requestFeed = document.getElementById('request-feed');
let currentUserId = null; // Set when user logs in
// Create Comment Modal
const commentModal = document.createElement('div');
commentModal.classList.add('comment-modal');
commentModal.innerHTML = `
  <div class="comment-modal-content">
    <div class="comment-modal-header">
      <span class="comment-count-display">Comments</span>
      <button class="close-comment-modal">×</button>
    </div>
    <div class="comments-container"></div>
    <div class="comment-input-container">
      <input type="text" class="comment-input" placeholder="Write a comment...">
      <button class="post-comment-btn">Post</button>
    </div>
  </div>
`;
document.body.prepend(commentModal);

// Create Error Modal
const errorModal = document.createElement('div');
errorModal.classList.add('generic-modal');
errorModal.innerHTML = `
  <div class="generic-modal-content">
    <div class="generic-modal-header">
      <h3>Error</h3>
      <button class="close-generic-modal">×</button>
    </div>
    <div class="generic-modal-body">
      <p class="error-message-text"></p>
    </div>
    <div class="generic-modal-footer">
      <button class="modal-btn close-error-btn">OK</button>
    </div>
  </div>
`;
document.body.appendChild(errorModal);

// Create Confirm Delete Modal
const confirmDeleteModal = document.createElement('div');
confirmDeleteModal.classList.add('generic-modal');
confirmDeleteModal.innerHTML = `
  <div class="generic-modal-content">
    <div class="generic-modal-header">
      <h3>Confirm Delete</h3>
      <button class="close-generic-modal">×</button>
    </div>
    <div class="generic-modal-body">
      <p>Are you sure you want to delete this request?</p>
    </div>
    <div class="generic-modal-footer">
      <button class="modal-btn cancel-delete-btn">Cancel</button>
      <button class="modal-btn confirm-delete-btn">Delete</button>
    </div>
  </div>
`;
document.body.appendChild(confirmDeleteModal);

// Create Report Modal
const reportModal = document.createElement('div');
reportModal.classList.add('generic-modal');
reportModal.innerHTML = `
  <div class="generic-modal-content">
    <div class="generic-modal-header">
      <h3>Report Request</h3>
      <button class="close-generic-modal">×</button>
    </div>
    <div class="generic-modal-body">
      <p>Please enter the reason for reporting this request:</p>
      <textarea class="report-reason-input" placeholder="Enter reason..."></textarea>
    </div>
    <div class="generic-modal-footer">
      <button class="modal-btn cancel-report-btn">Cancel</button>
      <button class="modal-btn submit-report-btn">Submit</button>
    </div>
  </div>
`;
document.body.appendChild(reportModal);

// CSS for Modals and Existing Components
const style = document.createElement('style');
style.textContent = `
  /* Comment Modal */
  .comment-modal {
    position: fixed;
    bottom: -100%;
    left: 0;
    right: 0;
    height: 100vh;
    background: white;
    border-radius: 15px 15px 0 0;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
    transition: bottom 0.3s ease-out;
    z-index: 100000;
    display: flex;
    flex-direction: column-reverse;
  }

  .comment-modal.active {
    bottom: 0;
  }

  .comment-modal-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 15px;
  }

  .comment-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
    margin-bottom: 10px;
  }

  .close-comment-modal {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
  }

  .comments-container {
    flex: 1;
    overflow-y: auto;
    padding: 10px 0;
    
  }

  .comment {
    display: flex;
    margin-bottom: 15px;
    padding: 20px;
    background: #fff;
    border: 1px #fff solid;
    box-shadow: 0 0 10px #ddd;
    border-radius: 8px;
  }
.comment-time{
font-size: 10px;
background: #f3f8f1;
  padding: 3px;
  border-radius: 8px;
}
  .comment-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-right: 10px;
    object-fit: cover;
    border: solid 2px #ddd;
  }

  .comment-content {
    flex: 1;
  }

  .comment-user {
    font-weight: bold;
    margin-right: 5px;
    font-size: 13px;
    background: #f3f8f1;
    padding: 3px;
    border-radius: 8px;
  }

.comment-text {
  margin-top: 3px;
  word-break: break-word;
  font-size: 13px;
  background: #f3f8f1;
  padding: 3px;
  border-radius: 8px;
  display: inline-block;
  font-weight: 500px;
}


  .comment-input-container {
    display: flex;
    padding-top: 10px;
    border-top: 1px solid #eee;
  }

  .comment-input {
    flex: 1;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 20px;
    margin-right: 10px;
    outline: none;
  }

  .post-comment-btn {
    padding: 10px 15px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }

  .post-comment-btn:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }

  /* Generic Modal (Error, Confirm, Report) */
  .generic-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    background: white;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    z-index: 1001;
    max-width: 400px;
    width: 90%;
    transition: transform 0.3s ease-out;
    display: none;
  }

  .generic-modal.active {
    transform: translate(-50%, -50%) scale(1);
    display: block;
  }

  .generic-modal-content {
    padding: 20px;
  }

  .generic-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
    margin-bottom: 15px;
  }

  .generic-modal-header h3 {
    margin: 0;
    font-size: 18px;
  }

  .close-generic-modal {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
  }

  .generic-modal-body {
    margin-bottom: 15px;
  }

  .generic-modal-body p {
    margin: 0 0 10px;
  }

  .report-reason-input {
    width: 100%;
    height: 80px;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 5px;
    resize: none;
    outline: none;
  }

  .generic-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .modal-btn {
    padding: 8px 15px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }

  .modal-btn.close-error-btn,
  .modal-btn.cancel-delete-btn,
  .modal-btn.cancel-report-btn {
    background: #f0f0f0;
    color: #333;
  }

  .modal-btn.confirm-delete-btn {
    background: #d33;
    color: white;
  }

  .modal-btn.submit-report-btn {
    background: #4267B2;
    color: white;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 999;
    display: none;
  }

  .modal-overlay.active {
    display: block;
  }

  .no-comments {
    text-align: center;
    color: #888;
    padding: 20px;
  }

  /* Request Card Styles */
  .request-card {
    background: white;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 15px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  }

  .user-info {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
  }

  .user-info img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-right: 10px;
    object-fit: cover;
  }

  .text {
    margin-bottom: 10px;
    word-break: break-word;
  }

  .request-actions-container {
    margin-left: auto;
    position: relative;
  }

  .ellipsis-btn {
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
  }

  .dropdown-menu {
    display: none;
    position: absolute;
    right: 0;
    background: white;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    z-index: 10;
  }

  .dropdown-menu.show {
    display: block;
  }

  .dropdown-item {
    display: block;
    padding: 10px 15px;
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
  }

  .dropdown-item:hover {
    background: #f0f0f0;
  }

  .request-actions {
    display: flex;
    padding-top: 10px;
  }

  .like-form, .comment-btn {
    margin-right: 15px;
    background: none;
    border: none;
    cursor: pointer;
  }

  .like-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px 10px;
    border-radius: 5px;
  }

  .like-btn.liked {
    color: #4267B2;
  }

  .like-count, .comment-count {
    margin-left: 5px;
  }

  .comment-btn {
    padding: 5px 10px;
    border-radius: 5px;
  }

  .no-requests, .error-message {
    text-align: center;
    padding: 20px;
    color: #888;
  }

  .engagement-actions {
    display: flex;
    font-size: 15px;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .request-details {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    margin-top: 15px;
  }

  .edit-textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 5px;
    margin-bottom: 10px;
    resize: vertical;
  }

  .save-edit-btn {
    background: #4267B2;
    color: white;
    padding: 8px 15px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    margin-right: 10px;
  }

  .cancel-edit-btn {
    background: #f0f0f0;
    color: #333;
    padding: 8px 15px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }
`;
document.head.appendChild(style);

// Create Overlay
const overlay = document.createElement('div');
overlay.classList.add('modal-overlay');
document.body.appendChild(overlay);

// Current request ID for comments
let currentRequestId = null;

// Modal Management Functions
function showModal(modal) {
  modal.classList.add('active');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  modal.querySelector('input, textarea, button')?.focus();
}

function closeModal(modal) {
  modal.classList.remove('active');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  if (modal === commentModal) currentRequestId = null;
}

function showErrorModal(message) {
  errorModal.querySelector('.error-message-text').textContent = message;
  showModal(errorModal);
}

// Comment Modal Functions
function openCommentModal(requestId) {
  currentRequestId = requestId;
  showModal(commentModal);
  fetchComments(requestId);
}

function closeCommentModal() {
  closeModal(commentModal);
}

// Event Listeners for Modals
commentModal.querySelector('.close-comment-modal').addEventListener('click', closeCommentModal);
errorModal.querySelector('.close-generic-modal').addEventListener('click', () => closeModal(errorModal));
errorModal.querySelector('.close-error-btn').addEventListener('click', () => closeModal(errorModal));
confirmDeleteModal.querySelector('.close-generic-modal').addEventListener('click', () => closeModal(confirmDeleteModal));
confirmDeleteModal.querySelector('.cancel-delete-btn').addEventListener('click', () => closeModal(confirmDeleteModal));
reportModal.querySelector('.close-generic-modal').addEventListener('click', () => closeModal(reportModal));
reportModal.querySelector('.cancel-report-btn').addEventListener('click', () => closeModal(reportModal));
overlay.addEventListener('click', () => {
  closeModal(commentModal);
  closeModal(errorModal);
  closeModal(confirmDeleteModal);
  closeModal(reportModal);
});

// Keyboard Accessibility
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal(commentModal);
    closeModal(errorModal);
    closeModal(confirmDeleteModal);
    closeModal(reportModal);
  }
});

// Post Comment Functionality
const postCommentBtn = commentModal.querySelector('.post-comment-btn');
const commentInput = commentModal.querySelector('.comment-input');

postCommentBtn.addEventListener('click', async () => {
  const text = commentInput.value.trim();
  if (!text || !currentRequestId) return;

  postCommentBtn.disabled = true;

  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch(`${API_BASE_URL}/requests/comment/${currentRequestId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    });

    if (!res.ok) throw new Error('Failed to post comment');

    const data = await res.json();
    if (data.success) {
      commentInput.value = '';
      fetchComments(currentRequestId);
      updateCommentCount(currentRequestId);
    }
  } catch (err) {
    console.error('Error posting comment:', err);
    showErrorModal('Failed to post comment. Please try again.');
  } finally {
    postCommentBtn.disabled = false;
  }
});

commentInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') postCommentBtn.click();
});

// Fetch and Display Comments
async function fetchComments(requestId) {
  try {
    const res = await fetch(`${API_BASE_URL}/requests/comments/${requestId}`);
    if (!res.ok) throw new Error('Failed to fetch comments');

    const comments = await res.json();
    const commentsContainer = commentModal.querySelector('.comments-container');
    commentsContainer.innerHTML = '';

    if (comments.length === 0) {
      commentsContainer.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
      return;
    }

    comments.forEach(comment => {
      const commentElement = document.createElement('div');
      commentElement.classList.add('comment');
      commentElement.innerHTML = `
        <img src="${comment.user.profilePicture || '/default-avatar.png'}" class="comment-avatar" alt="${comment.user.firstName}">
        <div class="comment-content">
          <div>
            <span class="comment-user">${comment.user.firstName} ${comment.user.lastName}</span>
            <span class="comment-time">${timeAgo(new Date(comment.createdAt))}</span>
          </div>
          <div class="comment-text">${escapeHtml(comment.text)}</div>
        </div>
      `;
      commentsContainer.appendChild(commentElement);
    });

    commentModal.querySelector('.comment-count-display').textContent = `Comments (${comments.length})`;
    commentsContainer.scrollTop = commentsContainer.scrollHeight;
  } catch (err) {
    console.error('Error fetching comments:', err);
    const commentsContainer = commentModal.querySelector('.comments-container');
    commentsContainer.innerHTML = '<p class="no-comments">Error loading comments. Please try again.</p>';
  }
}

// Update Comment Count
async function updateCommentCount(requestId) {
  try {
    const res = await fetch(`${API_BASE_URL}/requests/${requestId}/comments/count`);
    if (!res.ok) throw new Error('Failed to fetch comment count');

    const data = await res.json();
    if (data.success) {
      const commentBtn = document.querySelector(`.request-card[data-id="${requestId}"] .comment-btn .comment-count`);
      if (commentBtn) commentBtn.textContent = data.count;
    }
  } catch (err) {
    console.error('Error updating comment count:', err);
  }
}

// Dropdown Menu Setup
function setupDropdownMenu(cardElement, requestId, isOwner) {
  const ellipsisBtn = cardElement.querySelector('.ellipsis-btn');
  const dropdownMenu = cardElement.querySelector('.dropdown-menu');

  ellipsisBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    dropdownMenu.classList.remove('show');
  });

  if (isOwner) {
    cardElement.querySelector('.edit-btn').addEventListener('click', () => {
      handleEditRequest(requestId);
    });
    cardElement.querySelector('.delete-btn').addEventListener('click', () => {
      showConfirmDeleteModal(requestId);
    });
  } else {
    cardElement.querySelector('.report-btn').addEventListener('click', () => {
      showReportModal(requestId);
    });
  }
}

// Fetch and Display Requests
async function fetchRequests(category = '') {
  try {
    const res = await fetch(`${API_BASE_URL}/requests?category=${encodeURIComponent(category)}&sort=-createdAt`);
    if (!res.ok) throw new Error('Failed to fetch requests');

    const requests = await res.json();
    if (!Array.isArray(requests)) throw new Error('Expected an array of requests');

    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    requestFeed.innerHTML = '';

    if (requests.length === 0) {
      requestFeed.innerHTML = '<p class="no-requests">No requests found.</p>';
      return;
    }

    window.requestsForMixing = [];
    console.log('Rendering requests:', requests.map(r => ({ id: r._id, createdAt: r.createdAt })));

    for (const request of requests) {
      const requestCard = document.createElement('div');
      requestCard.classList.add('request-card');
      requestCard.setAttribute('data-id', request._id);
      requestCard.dataset.createdAt = request.createdAt;

      const isLiked = currentUserId && request.likes.includes(currentUserId);
      const isOwner = String(currentUserId) === String(request.user._id);

      requestCard.innerHTML = `
        <div class="user-info">
          <img src="${request.user.profilePicture || '/default-avatar.png'}" alt="${request.user.firstName}" />
          <span>${request.user.firstName} ${request.user.lastName}</span>
          <div class="request-actions-container">
            <button class="ellipsis-btn"><i class="fas fa-ellipsis-h"></i></button>
            <div class="dropdown-menu">
              ${isOwner ? `
                <button class="dropdown-item edit-btn">Edit</button>
                <button class="dropdown-item delete-btn">Delete</button>
              ` : `
                <button class="dropdown-item report-btn">Report</button>
              `}
            </div>
          </div>
        </div>
        <div class="timestamp">${timeAgo(new Date(request.createdAt))}</div>
        <div class="request-tab">
          <button>#Request</button>
        </div>
        <div class="request-bg">
          <div class="text">${escapeHtml(request.text)}</div>
        </div>
        <div class="request-details">
          ${request.location ? `<div class="location">Location: ${escapeHtml(request.location)}</div>` : ''}
          ${request.budget ? `<div class="budget">Budget: ₦${escapeHtml(request.budget.toString())}</div>` : ''}
        </div>
     ${isOwner ? '' : `
  <div class="contact-btn">
    <a id="contact-link">
      <button 
        data-recipient-id="${request.user._id}" 
        data-recipient-username="${request.user.firstName} ${request.user.lastName || 'Request Creator'}" 
        data-profile-picture="${request.user.profilePicture || 'default-avatar.png'}"
        data-original-request="${request.text || request.description || 'Request details'}"
        id="contact-creator-link"
      >
        <i class="fas fa-paper-plane"></i> Send message
      </button>
    </a>
  </div>
`}
        <div class="engagement-actions">
          <form class="like-form">
            <button type="submit" class="like-btn ${isLiked ? 'liked' : ''}">
              <i class="fa${isLiked ? 's' : 'r'} fa-heart"></i>
              <span class="like-count">${request.likes.length} </span>
                    </button>
          </form>
          <button class="comment-btn">
            <i class="far fa-comment-alt"></i>
            <span class="comment-count">${request.comments.length}</span>
         </button>
        </div>
      `;

      setupDropdownMenu(requestCard, request._id, isOwner);
      requestFeed.appendChild(requestCard);
      console.log(`Prepended request ${request._id} created at ${request.createdAt}`);
    }

    // Message Sending Functionality
    // Message Sending Functionality
const sendMessageButtons = document.querySelectorAll("#contact-creator-link");
const userId = localStorage.getItem("userId");

sendMessageButtons.forEach((sendMessageBtn) => {
  const recipientId = sendMessageBtn.dataset.recipientId;
  
  // Check if user is trying to message themselves
  if (userId === recipientId) {
    sendMessageBtn.disabled = true;
    sendMessageBtn.title = "You cannot message yourself";
    sendMessageBtn.classList.add('disabled'); // Add visual styling
    return; // Skip adding event listener for disabled buttons
  }

  sendMessageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Check if user is logged in
    if (!userId) {
      showErrorModal("Please log in to send a message");
      return;
    }

    // Get recipient data
    const recipientUsername = sendMessageBtn.dataset.recipientUsername || "Request Creator";
    const recipientProfilePictureUrl = sendMessageBtn.dataset.profilePicture || 'default-avatar.png';
    
    // Get original request content for WhatsApp-style reply
    const originalRequest = sendMessageBtn.dataset.originalRequest || "Request details";
    
    // Create WhatsApp-style reply format
    const replyMessage = `┌─ ${recipientUsername}:\n│ ${originalRequest}\n└─\n\nDo you still need this item?`;
    
    // Encode parameters
    const encodedMessage = encodeURIComponent(replyMessage);
    const encodedRecipientUsername = encodeURIComponent(recipientUsername);
    const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);

    // Navigate to chat
    window.location.href = `Chats.html?user_id=${userId}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}`;
  });
});

       

    // Like Button Event Listeners
    document.querySelectorAll('.like-form').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const card = form.closest('.request-card');
        const requestId = card.getAttribute('data-id');
        const likeBtn = form.querySelector('.like-btn');
        const icon = likeBtn.querySelector('i');
        const count = likeBtn.querySelector('.like-count');

        likeBtn.disabled = true;

        try {
          const token = localStorage.getItem('authToken');
          const res = await fetch(`${API_BASE_URL}/requests/like/${requestId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!res.ok) throw new Error('Failed to like request');

          const data = await res.json();
          if (data.success) {
            const requestIndex = requests.findIndex(r => r._id === requestId);
            if (requestIndex !== -1) {
              if (data.liked) {
                requests[requestIndex].likes.push(currentUserId);
              } else {
                requests[requestIndex].likes = requests[requestIndex].likes.filter(id => id !== currentUserId);
              }
            }

            likeBtn.classList.toggle('liked', data.liked);
            icon.classList.toggle('fas', data.liked);
            icon.classList.toggle('far', !data.liked);
            count.textContent = data.totalLikes;

            icon.style.transform = 'scale(1.3)';
            setTimeout(() => {
              icon.style.transform = 'scale(1)';
            }, 300);
          }
        } catch (err) {
          console.error('Error liking request:', err);
          showErrorModal('Failed to like request. Please try again.');
        } finally {
          likeBtn.disabled = false;
        }
      });
    });

    // Comment Button Event Listeners
    document.querySelectorAll('.comment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.request-card');
        const requestId = card.getAttribute('data-id');
        openCommentModal(requestId);
      });
    });

  } catch (err) {
    console.error('Error fetching requests:', err);
    requestFeed.innerHTML = '<p class="error-message">Error loading requests. Please try again later.</p>';
  }
}

// Delete Request Handler
function showConfirmDeleteModal(requestId) {
  showModal(confirmDeleteModal);
  const confirmBtn = confirmDeleteModal.querySelector('.confirm-delete-btn');
  const newConfirmBtn = confirmBtn.cloneNode(true); // Clone to avoid duplicate event listeners
  confirmBtn.replaceWith(newConfirmBtn);

  newConfirmBtn.addEventListener('click', async () => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE_URL}/requests/${requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const cardToRemove = document.querySelector(`.request-card[data-id="${requestId}"]`);
        if (cardToRemove) cardToRemove.remove();
        closeModal(confirmDeleteModal);
      } else {
        throw new Error('Failed to delete request');
      }
    } catch (err) {
      console.error('Error deleting request:', err);
      closeModal(confirmDeleteModal);
      showErrorModal('Failed to delete request. Please try again.');
    }
  });
}

// Edit Request Handler
function handleEditRequest(requestId) {
  const requestCard = document.querySelector(`.request-card[data-id="${requestId}"]`);
  const requestText = requestCard.querySelector('.text').textContent;

  const editForm = document.createElement('form');
  editForm.innerHTML = `
    <textarea class="edit-textarea">${requestText}</textarea>
    <button type="submit" class="save-edit-btn">Save</button>
    <button type="button" class="cancel-edit-btn">Cancel</button>
  `;

  requestCard.querySelector('.text').replaceWith(editForm);

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newText = editForm.querySelector('.edit-textarea').value.trim();
    if (newText) {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_BASE_URL}/requests/${requestId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ text: newText })
        });

        if (res.ok) {
          const textDiv = document.createElement('div');
          textDiv.classList.add('text');
          textDiv.textContent = newText;
          editForm.replaceWith(textDiv);
        } else {
          throw new Error('Failed to update request');
        }
      } catch (err) {
        console.error('Error updating request:', err);
        showErrorModal('Failed to update request. Please try again.');
      }
    }
  });

  editForm.querySelector('.cancel-edit-btn').addEventListener('click', () => {
    const textDiv = document.createElement('div');
    textDiv.classList.add('text');
    textDiv.textContent = requestText;
    editForm.replaceWith(textDiv);
  });
}

// Report Request Handler
function showReportModal(requestId) {
  showModal(reportModal);
  const reportInput = reportModal.querySelector('.report-reason-input');
  const submitBtn = reportModal.querySelector('.submit-report-btn');
  reportInput.value = '';

  // Prevent multiple event listeners on cloned button
  const newSubmitBtn = submitBtn.cloneNode(true);
  submitBtn.replaceWith(newSubmitBtn);

  newSubmitBtn.addEventListener('click', async () => {
    const reason = reportInput.value.trim();
    const token = localStorage.getItem('authToken');
    if (reason) {
      try {
        const res = await fetch(`${API_BASE_URL}/requests/report/${requestId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ reason })
        });

        const data = await res.json();

        if (res.ok) {
          console.log(`Reported request ${requestId} successfully:`, data);
          closeModal(reportModal);
          showErrorModal('Thank you for your report. We will review this request.');
        } else {
          console.error('Failed to report request:', data.message);
          showErrorModal(data.message || 'Failed to report the request.');
        }
      } catch (error) {
        console.error('Error reporting request:', error.message);
        showErrorModal('An error occurred while reporting the request.');
      }
    } else {
      showErrorModal('Please provide a reason for the report.');
    }
  });
}

// Helper Functions
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + " year" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + " month" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + " day" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + " hour" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + " minute" + (interval === 1 ? "" : "s") + " ago";
  return Math.floor(seconds) + " second" + (seconds === 1 ? "" : "s") + " ago";
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  currentUserId = localStorage.getItem('userId') || null;
  document.querySelectorAll('.category-btn').forEach(button => {
    button.addEventListener('click', function () {
      const selectedCategory = this.getAttribute('data-category');
      fetchRequests(selectedCategory);
    });
  });

  if (currentUserId) {
    fetchRequests();
  } else {
    requestFeed.innerHTML = '<p class="error-message">Please log in to view requests</p>';
  }
});