const requestFeed = document.getElementById('request-feed');
let currentUserId = null; // This should be set when user logs in
// After successful authentication:


const commentModal = document.createElement('div');
commentModal.classList.add('comment-modal');
commentModal.innerHTML = `
  <div class="comment-modal-content">
    <div class="comment-modal-header">
      <span class="comment-count-display">Comments</span>
      <button class="close-comment-modal">&times;</button>
    </div>
    <div class="comments-container"></div>
    <div class="comment-input-container">
      <input type="text" class="comment-input" placeholder="Write a comment...">
      <button class="post-comment-btn">Post</button>
    </div>
  </div>
`;
document.body.prepend(commentModal);

// CSS for the modal
const style = document.createElement('style');
style.textContent = `
  .comment-modal {
    position: fixed;
    bottom: -100%;
    left: 0;
    right: 0;
    height: 70vh;
    background: white;
    border-radius: 15px 15px 0 0;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
    transition: bottom 0.3s ease-out;
    z-index: 1000;
    display: flex;
    flex-direction: column;
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
  }

  .comment-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-right: 10px;
    object-fit: cover;
  }

  .comment-content {
    flex: 1;
  }

  .comment-user {
    font-weight: bold;
    margin-right: 5px;
  }

  .comment-text {
    margin-top: 5px;
    word-break: break-word;
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
    background: #4267B2;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }

  .post-comment-btn:disabled {
    background: #cccccc;
    cursor: not-allowed;
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

  /* Request card styles */
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
  .engagement-actions{
  display: flex;
  font-size: 15px;
  align-items: center;
  justify-content: center;
  width: 100%;
  }
  .request-details{
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 15px;
  }
`;
document.head.appendChild(style);

// Create overlay
const overlay = document.createElement('div');
overlay.classList.add('modal-overlay');
document.body.appendChild(overlay);

// Current request ID for comments
let currentRequestId = null;

// Function to open comment modal
function openCommentModal(requestId) {
  currentRequestId = requestId;
  commentModal.classList.add('active');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  fetchComments(requestId);
}

// Function to close comment modal
function closeCommentModal() {
  commentModal.classList.remove('active');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  currentRequestId = null;
}

// Event listeners for modal
commentModal.querySelector('.close-comment-modal').addEventListener('click', closeCommentModal);
overlay.addEventListener('click', closeCommentModal);

// Post comment functionality
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

    if (!res.ok) {
      throw new Error('Failed to post comment');
    }

    const data = await res.json();
    
    if (data.success) {
      commentInput.value = '';
      fetchComments(currentRequestId);
      updateCommentCount(currentRequestId);
    }
  } catch (err) {
    console.error('Error posting comment:', err);
    alert('Failed to post comment. Please try again.');
  } finally {
    postCommentBtn.disabled = false;
  }
});

// Allow posting comment with Enter key
commentInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    postCommentBtn.click();
  }
});

// Function to fetch and display comments
async function fetchComments(requestId) {
  try {
    const res = await fetch(`${API_BASE_URL}/requests/comments/${requestId}`);
    if (!res.ok) {
      throw new Error('Failed to fetch comments');
    }
    
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
    
    // Update comment count display
    commentModal.querySelector('.comment-count-display').textContent = `Comments (${comments.length})`;
    // Scroll to bottom
    commentsContainer.scrollTop = commentsContainer.scrollHeight;
  } catch (err) {
    console.error('Error fetching comments:', err);
    const commentsContainer = commentModal.querySelector('.comments-container');
    commentsContainer.innerHTML = '<p class="no-comments">Error loading comments. Please try again.</p>';
  }
}

// Function to update comment count on the request card
async function updateCommentCount(requestId) {
  try {
    const res = await fetch(`${API_BASE_URL}/requests/${requestId}/comments/count`);
    if (!res.ok) {
      throw new Error('Failed to fetch comment count');
    }
    
    const data = await res.json();
    
    if (data.success) {
      const commentBtn = document.querySelector(`.request-card[data-id="${requestId}"] .comment-btn .comment-count`);
      if (commentBtn) {
        commentBtn.textContent = data.count;
      }
    }
  } catch (err) {
    console.error('Error updating comment count:', err);
  }
}
function setupDropdownMenu(cardElement, requestId, isOwner) {
  const ellipsisBtn = cardElement.querySelector('.ellipsis-btn');
  const dropdownMenu = cardElement.querySelector('.dropdown-menu');

  // Toggle dropdown visibility
  ellipsisBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener('click', () => {
    dropdownMenu.classList.remove('show');
  });

  // Handle menu item clicks
  if (isOwner) {
    cardElement.querySelector('.edit-btn').addEventListener('click', () => {
      handleEditRequest(requestId);
    });
    
    cardElement.querySelector('.delete-btn').addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this request?')) {
        handleDeleteRequest(requestId);
      }
    });
  } else {
    cardElement.querySelector('.report-btn').addEventListener('click', () => {
      handleReportRequest(requestId);
    });
  }
}


// Fetch and display all requests
async function fetchRequests(category = '') {
  try {
    const res = await fetch(`${API_BASE_URL}/requests?category=${encodeURIComponent(category)}&sort=-createdAt`);
    if (!res.ok) {
      throw new Error('Failed to fetch requests');
    }
    
    const requests = await res.json();
    if (!Array.isArray(requests)) {
      throw new Error('Expected an array of requests');
    }
    
    // Sort requests by createdAt in descending order (newest first)
    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    requestFeed.innerHTML = '';
    
    if (requests.length === 0) {
      requestFeed.innerHTML = '<p class="no-requests">No requests found.</p>';
      return;
    }
    
    // Initialize requestsForMixing
    window.requestsForMixing = [];
    
    // Debug: Log the order of requests
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
            
                <button >
                 #Request
                </button>

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
              <span class="like-count">${request.likes.length} Likes</span>
            </button>
          </form>
          <button class="comment-btn">
            <i class="far fa-comment-alt"></i>
            <span class="comment-count">${request.comments.length} Comments</span>
          </button>
        </div>
      `;
      
      setupDropdownMenu(requestCard, request._id, isOwner);
      requestFeed.appendChild(requestCard);
      console.log(`Prepended request ${request._id} created at ${request.createdAt}`);
    }
  
// Message sending functionality for multiple request creator buttons
const sendMessageButtons = document.querySelectorAll("#contact-creator-link");

sendMessageButtons.forEach((sendMessageBtn) => {
    // Disable button if the recipient is the current user
    const userId = localStorage.getItem("userId");
    const recipientId = sendMessageBtn.dataset.recipientId;
    if (userId === recipientId) {
        sendMessageBtn.disabled = true;
        sendMessageBtn.title = "You cannot message yourself";
    }

    sendMessageBtn.addEventListener('click', (e) => {
        e.preventDefault();

        // Validate userId
        if (!userId) {
            alert("Please log in to send a message");
            return;
        }

        // Get recipient details from button dataset
        const recipientId = sendMessageBtn.dataset.recipientId;
        const recipientUsername = sendMessageBtn.dataset.recipientUsername || "Request Creator";
        const recipientProfilePictureUrl = sendMessageBtn.dataset.profilePicture || 'default-avatar.png';

        // Predefined message
        const message = `Do you still need this item`;

        // Encode parameters for URL
        const encodedMessage = encodeURIComponent(message);
        const encodedRecipientUsername = encodeURIComponent(recipientUsername);
        const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);

        // Redirect to chat page
        window.location.href = `Chats.html?user_id=${userId}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}`;
    });
});


    // Add event listeners for like buttons
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
        // Update the local state
        const requestIndex = requests.findIndex(r => r._id === requestId);
        if (requestIndex !== -1) {
          if (data.liked) {
            requests[requestIndex].likes.push(currentUserId);
          } else {
            requests[requestIndex].likes = requests[requestIndex].likes.filter(
              id => id !== currentUserId
            );
          }
        }
        
        // Update UI
        likeBtn.classList.toggle('liked', data.liked);
        icon.classList.toggle('fas', data.liked);
        icon.classList.toggle('far', !data.liked);
        count.textContent = data.totalLikes;
        
        // Animation
        icon.style.transform = 'scale(1.3)';
        setTimeout(() => {
          icon.style.transform = 'scale(1)';
        }, 300);
      }
    } catch (err) {
      console.error('Error liking request:', err);
    } finally {
      likeBtn.disabled = false;
    }
  });
});
    // Add event listeners for comment buttons
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
async function handleDeleteRequest(requestId) {
  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch(`${API_BASE_URL}/requests/${requestId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (res.ok) {
      // Remove the card from DOM
      const cardToRemove = document.querySelector(`.request-card[data-id="${requestId}"]`);
      if (cardToRemove) {
        cardToRemove.remove();
      }
      // Or refresh the whole list:
      // fetchRequests();
    }
  } catch (err) {
    console.error('Error deleting request:', err);
    alert('Failed to delete request');
  }
}

function handleEditRequest(requestId) {
  // Find the request card
  const requestCard = document.querySelector(`.request-card[data-id="${requestId}"]`);
  const requestText = requestCard.querySelector('.text').textContent;
  
  // Create edit form
  const editForm = document.createElement('form');
  editForm.innerHTML = `
    <textarea class="edit-textarea">${requestText}</textarea>
    <button type="submit" class="save-edit-btn">Save</button>
    <button type="button" class="cancel-edit-btn">Cancel</button>
  `;
  
  // Replace content with edit form
  requestCard.querySelector('.text').replaceWith(editForm);
  
  // Handle form submission
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
          // Return to normal view
          const textDiv = document.createElement('div');
          textDiv.classList.add('text');
          textDiv.textContent = newText;
          editForm.replaceWith(textDiv);
        }
      } catch (err) {
        console.error('Error updating request:', err);
      }
    }
  });
  
  // Handle cancel
  editForm.querySelector('.cancel-edit-btn').addEventListener('click', () => {
    const textDiv = document.createElement('div');
    textDiv.classList.add('text');
    textDiv.textContent = requestText;
    editForm.replaceWith(textDiv);
  });
}

function handleReportRequest(requestId) {
  const reason = prompt('Please enter the reason for reporting this request:');
  if (reason) {
    console.log(`Reported request ${requestId} for: ${reason}`);
    // Add your API call to report here
    alert('Thank you for your report. We will review this request.');
  }
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper function to display time ago
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

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Get user ID from wherever you store it (localStorage, session, etc.)
  currentUserId = localStorage.getItem('userId') || null;
  document.querySelectorAll('.category-btn').forEach(button => {
    button.addEventListener('click', function () {
        const selectedCategory = this.getAttribute('data-category');
        fetchRequests(selectedCategory); // Corrected to fetchRequests
    });
});
  
  // Only fetch requests if we have a user ID
  if (currentUserId) {
    fetchRequests();
    
  } else {
    // Redirect to login or show appropriate message
    requestFeed.innerHTML = '<p class="error-message">Please log in to view requests</p>';
  }
});