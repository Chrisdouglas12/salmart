// request-feed.js

// Import the new cache manager
import salmartCache from './salmartCache3.js';

const requestFeed = document.getElementById('request-feed');
let currentUserId = null;
let currentRequests = []; // Store the current state of requests
let currentComments = {}; // Store comments per request ID

// Helper function for formatting currency
function formatNaira(amount) {
  if (isNaN(amount) || amount === null) {
    return '';
  }
  return `₦${Number(amount).toLocaleString('en-US')}`;
}

// Helper function for escaping HTML
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
  if (interval >= 1) return interval + "y";
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + "mo";
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + "d";
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + "h";
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + "m";
  return Math.floor(seconds) + "s";
}


// --- Modal Elements and Setup ---

const overlay = document.createElement('div');
overlay.classList.add('modal-overlay');
document.body.appendChild(overlay);

function createGenericModal(title, bodyHtml, footerHtml) {
  const modal = document.createElement('div');
  modal.classList.add('generic-modal');
  modal.innerHTML = `
    <div class="generic-modal-content">
      <div class="generic-modal-header">
        <h3>${title}</h3>
        <button class="close-generic-modal">×</button>
      </div>
      <div class="generic-modal-body">${bodyHtml}</div>
      <div class="generic-modal-footer">${footerHtml}</div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

const errorModal = createGenericModal(
  'Error',
  '<p class="error-message-text"></p>',
  '<button class="modal-btn close-error-btn">OK</button>'
);

const confirmDeleteModal = createGenericModal(
  'Confirm Delete',
  '<p>Are you sure you want to delete this request?</p>',
  '<button class="modal-btn cancel-delete-btn">Cancel</button><button class="modal-btn confirm-delete-btn">Delete</button>'
);

const reportModal = createGenericModal(
  'Report Request',
  '<p>Please enter the reason for reporting this request:</p><textarea class="report-reason-input" placeholder="Enter reason..."></textarea>',
  '<button class="modal-btn cancel-report-btn">Cancel</button><button class="modal-btn submit-report-btn">Submit</button>'
);

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
document.body.appendChild(commentModal);

let currentRequestId = null;

function showModal(modal) {
  modal.classList.add('active');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  modal.querySelector('input, textarea, button')?.focus();
}

function closeModal(modal) {
  modal.classList.remove('active');
  const anyModalActive = document.querySelector('.generic-modal.active, .comment-modal.active');
  if (!anyModalActive) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
  if (modal === commentModal) currentRequestId = null;
}

function showErrorModal(message) {
  errorModal.querySelector('.error-message-text').textContent = message;
  showModal(errorModal);
}

function closeAllModals() {
    [commentModal, errorModal, confirmDeleteModal, reportModal].forEach(closeModal);
}

document.addEventListener('click', (e) => {
  if (e.target === overlay) {
    closeAllModals();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllModals();
  }
});

commentModal.querySelector('.close-comment-modal').addEventListener('click', () => closeModal(commentModal));
errorModal.querySelector('.close-generic-modal').addEventListener('click', () => closeModal(errorModal));
errorModal.querySelector('.close-error-btn').addEventListener('click', () => closeModal(errorModal));
confirmDeleteModal.querySelector('.close-generic-modal').addEventListener('click', () => closeModal(confirmDeleteModal));
confirmDeleteModal.querySelector('.cancel-delete-btn').addEventListener('click', () => closeModal(confirmDeleteModal));
reportModal.querySelector('.close-generic-modal').addEventListener('click', () => closeModal(reportModal));
reportModal.querySelector('.cancel-report-btn').addEventListener('click', () => closeModal(reportModal));

// --- Comment Logic ---

function updateCommentCountOnCard(requestId, count) {
    const commentCountElement = document.querySelector(`.request-card[data-id="${requestId}"] .comment-count`);
    if (commentCountElement) {
        commentCountElement.textContent = count;
    }
}

function openCommentModal(requestId) {
    currentRequestId = requestId;
    showModal(commentModal);
    fetchComments(requestId);
    
    const commentInputContainer = commentModal.querySelector('.comment-input-container');

    const oldPostCommentBtn = commentModal.querySelector('.post-comment-btn');
    const oldCommentInput = commentModal.querySelector('.comment-input');
    if (oldPostCommentBtn) oldPostCommentBtn.removeEventListener('click', postComment);
    if (oldCommentInput) oldCommentInput.removeEventListener('keypress', postComment);

    if (!currentUserId) {
      commentInputContainer.innerHTML = `
        <div style="text-align: center; padding: 15px; color: #666;">
          <p>Please log in to comment on this request.</p>
        </div>
      `;
    } else {
      commentInputContainer.innerHTML = `
        <input type="text" class="comment-input" placeholder="Write a comment...">
        <button class="post-comment-btn">Post</button>
      `;
      
      const newPostCommentBtn = commentInputContainer.querySelector('.post-comment-btn');
      const newCommentInput = commentInputContainer.querySelector('.comment-input');
      
      newPostCommentBtn.addEventListener('click', () => postComment(newCommentInput, newPostCommentBtn));
      newCommentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') postComment(newCommentInput, newPostCommentBtn);
      });
    }
}

async function postComment(commentInput, postCommentBtn) {
    const text = commentInput.value.trim();
    if (!text || !currentRequestId) return;
    
    if (!currentUserId) {
        showErrorModal('You must be logged in to comment.');
        return;
    }

    const tempCommentId = `temp-${Date.now()}`;
    const newComment = {
        _id: tempCommentId,
        text: text,
        user: { 
            _id: currentUserId,
            firstName: "You", // This should be replaced with the actual user's name
            lastName: "",
            profilePicture: "/default-avater.png"
        },
        createdAt: new Date().toISOString()
    };
    
    const commentsForRequest = currentComments[currentRequestId] || [];
    currentComments[currentRequestId] = [...commentsForRequest, newComment];
    renderComments(currentComments[currentRequestId]);
    updateCommentCountOnCard(currentRequestId, currentComments[currentRequestId].length);
    commentInput.value = '';
    
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
            await salmartCache.addCommentToCache(currentRequestId, data.comment);
        } else {
            throw new Error(data.message || 'Failed to post comment');
        }
    } catch (err) {
        console.error('Error posting comment:', err);
        showErrorModal('Failed to post comment. Please try again.');
        
        currentComments[currentRequestId] = currentComments[currentRequestId].filter(c => c._id !== tempCommentId);
        renderComments(currentComments[currentRequestId]);
        updateCommentCountOnCard(currentRequestId, currentComments[currentRequestId].length);
        commentInput.value = text;
    }
}

async function fetchComments(requestId) {
    const commentsContainer = commentModal.querySelector('.comments-container');
    commentsContainer.innerHTML = '<div class="spinner"></div>';
    
    const comments = await salmartCache.getComments(requestId);
    currentComments[requestId] = comments;
    renderComments(comments);
}

function renderComments(comments) {
    const commentsContainer = commentModal.querySelector('.comments-container');
    const commentCountDisplay = commentModal.querySelector('.comment-count-display');
    
    commentsContainer.innerHTML = '';
    commentCountDisplay.textContent = `Comments (${comments.length})`;

    if (comments.length === 0) {
        commentsContainer.innerHTML = '<p class="no-comments-message">No comments yet. Be the first!</p>';
    } else {
        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.classList.add('comment');
            commentElement.innerHTML = `
                <div class="comment-header">
                    <img src="${comment.user.profilePicture || '/default-avater.png'}"  class="comment-avatar" />
                    <span class="comment-user-name">${escapeHtml(comment.user.firstName)} ${escapeHtml(comment.user.lastName)}</span>
                    <span class="comment-timestamp">${timeAgo(new Date(comment.createdAt))}</span>
                </div>
                <p class="comment-text">${escapeHtml(comment.text)}</p>
            `;
            commentsContainer.appendChild(commentElement);
        });
    }
}

// --- Request Feed Logic ---

function setupDropdownMenu(cardElement, requestId, isOwner) {
  const ellipsisBtn = cardElement.querySelector('.ellipsis-btn');
  const dropdownMenu = cardElement.querySelector('.dropdown-menu');
  
  if (!ellipsisBtn || !dropdownMenu) return;

  ellipsisBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        if (menu !== dropdownMenu) menu.classList.remove('show');
    });
    dropdownMenu.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!dropdownMenu.contains(e.target) && e.target !== ellipsisBtn) {
      dropdownMenu.classList.remove('show');
    }
  });

  if (isOwner) {
    cardElement.querySelector('.edit-btn').addEventListener('click', () => {
      handleEditRequest(requestId);
      dropdownMenu.classList.remove('show');
    });
    cardElement.querySelector('.delete-btn').addEventListener('click', () => {
      showConfirmDeleteModal(requestId);
      dropdownMenu.classList.remove('show');
    });
  } else {
    cardElement.querySelector('.report-btn').addEventListener('click', () => {
      showReportModal(requestId);
      dropdownMenu.classList.remove('show');
    });
  }
}

window.addEventListener('requestsUpdated', (e) => {
    currentRequests = e.detail.requests;
    renderRequests(currentRequests);
});

window.addEventListener('commentsUpdated', (e) => {
    if (e.detail.requestId === currentRequestId) {
        currentComments[e.detail.requestId] = e.detail.comments;
        renderComments(e.detail.comments);
    }
    updateCommentCountOnCard(e.detail.requestId, e.detail.comments.length);
});

async function fetchRequests(category = '') {
    const requests = await salmartCache.getRequests(category);
    renderRequests(requests);
}

function renderRequests(requests) {
    requestFeed.innerHTML = '';

    if (!requests || requests.length === 0) {
        requestFeed.innerHTML = `<p class="no-requests">No requests found.</p>`;
        return;
    }

    requests.forEach(request => {
      const isLiked = currentUserId && request.likes.includes(currentUserId);
      const isOwner = String(currentUserId) === String(request.user._id);

      const requestCard = document.createElement('div');
      requestCard.classList.add('request-card');
      requestCard.setAttribute('data-id', request._id);

      requestCard.innerHTML = `
        <div class="request-header">
            <div class="user-info">
                <img src="${request.user.profilePicture || '/default-avater.png'}"  class="user-avatar" />
                <div class="user-details">
                    <span class="user-name">${escapeHtml(request.user.firstName)} ${escapeHtml(request.user.lastName)}</span>
                    <span class="timestamp">${timeAgo(new Date(request.createdAt))}</span>
                </div>
            </div>
            <div class="request-actions-container">
                <button class="ellipsis-btn"><i class="fas fa-ellipsis-h"></i></button>
                <ul class="dropdown-menu">
                    ${isOwner ? `
                        <li><button class="dropdown-item edit-btn"><i class="fas fa-edit"></i> Edit Request</button></li>
                        <li><button class="dropdown-item delete-btn"><i class="fas fa-trash-alt"></i> Delete Request</button></li>
                    ` : `
                        <li><button class="dropdown-item report-btn"><i class="fas fa-flag"></i> Report Request</button></li>
                    `}
                </ul>
            </div>
        </div>
        <div class="request-content">
            <div class="text">${escapeHtml(request.text)}</div>
        </div>
        <div class="request-meta">
            ${request.location ? `<span class="location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(request.location)}</span>` : ''}
            ${request.budget ? `<span class="budget"><i class="fas fa-naira-sign"></i> ${formatNaira(request.budget)}</span>` : ''}
        </div>
        ${isOwner ? '' : `
            <div class="contact-btn">
                <button class="contact-creator-btn" 
                        data-recipient-id="${request.user._id}" 
                        data-recipient-username="${escapeHtml(request.user.firstName)} ${escapeHtml(request.user.lastName || 'Request Creator')}" 
                        data-profile-picture="${request.user.profilePicture || 'default-avater.png'}"
                        data-original-request="${escapeHtml(request.text || request.description || 'Request details')}">
                    <i class="fas fa-paper-plane"></i> Send message
                </button>
            </div>
        `}
        <div class="engagement-actions">
            <button class="action-btn like-btn ${isLiked ? 'liked' : ''}">
                <i class="fa${isLiked ? 's' : 'r'} fa-heart"></i>
                <span class="like-count">${request.likes.length}</span>
            </button>
            <button class="action-btn comment-btn">
                <i class="far fa-comment-alt"></i>
                <span class="comment-count">${(request.comments || []).length}</span>
            </button>
        </div>
      `;
      requestFeed.appendChild(requestCard);
      setupDropdownMenu(requestCard, request._id, isOwner);
    });

    setupEngagementListeners();
    setupContactListeners();
}

function setupEngagementListeners() {
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = btn.closest('.request-card');
        const requestId = card.getAttribute('data-id');
        const isLiked = btn.classList.contains('liked');

        if (!currentUserId) {
             showErrorModal('You must be logged in to like a request.');
             return;
        }

        const updatedRequests = currentRequests.map(req => {
            if (req._id === requestId) {
                const newLikes = isLiked
                    ? req.likes.filter(id => id !== currentUserId)
                    : [...req.likes, currentUserId];
                return { ...req, likes: newLikes };
            }
            return req;
        });

        renderRequests(updatedRequests);
        currentRequests = updatedRequests;
        
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
          // The `requestsUpdated` event from the cache will handle the final update
        } catch (err) {
          console.error('Error liking request:', err);
          showErrorModal('Failed to like request. Please try again.');
          
          const rolledBackRequests = currentRequests.map(req => {
              if (req._id === requestId) {
                  const newLikes = isLiked
                      ? [...req.likes, currentUserId]
                      : req.likes.filter(id => id !== currentUserId);
                  return { ...req, likes: newLikes };
              }
              return req;
          });
          renderRequests(rolledBackRequests);
          currentRequests = rolledBackRequests;
        }
      });
    });

    document.querySelectorAll('.comment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.request-card');
        const requestId = card.getAttribute('data-id');
        openCommentModal(requestId);
      });
    });
}

function setupContactListeners() {
    document.querySelectorAll('.contact-creator-btn').forEach(btn => {
        const recipientId = btn.dataset.recipientId;
        if (currentUserId === recipientId) {
            btn.disabled = true;
            btn.textContent = 'You are the creator';
            btn.classList.add('disabled');
            return;
        }

        btn.addEventListener('click', () => {
            if (!currentUserId) {
                showErrorModal('Please log in to send a message.');
                return;
            }

            const recipientUsername = btn.dataset.recipientUsername || "Request Creator";
            const recipientProfilePictureUrl = btn.dataset.profilePicture || 'default-avatar.png';
            const originalRequest = btn.dataset.originalRequest || "Request details";

            const replyMessage = `┌─ ${recipientUsername}:\n│ ${originalRequest}\n└─\n\nDo you still need this item?`;
            const encodedMessage = encodeURIComponent(replyMessage);
            const encodedRecipientUsername = encodeURIComponent(recipientUsername);
            const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);

            window.location.href = `Chats.html?user_id=${currentUserId}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}`;
        });
    });
}

function showConfirmDeleteModal(requestId) {
  showModal(confirmDeleteModal);
  const confirmBtn = confirmDeleteModal.querySelector('.confirm-delete-btn');
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirmBtn);

  newConfirmBtn.addEventListener('click', async () => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE_URL}/requests/${requestId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        closeModal(confirmDeleteModal);
        await salmartCache.deleteRequestFromCache(requestId);
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

function handleEditRequest(requestId) {
    const requestCard = document.querySelector(`.request-card[data-id="${requestId}"]`);
    const requestContent = requestCard.querySelector('.request-content');
    const requestTextDiv = requestContent.querySelector('.text');
    const requestText = requestTextDiv.textContent;

    const editForm = document.createElement('div');
    editForm.innerHTML = `
      <textarea class="edit-textarea">${requestText}</textarea>
      <div class="edit-actions">
          <button type="button" class="cancel-edit-btn">Cancel</button>
          <button type="submit" class="save-edit-btn">Save</button>
      </div>
    `;
    requestContent.replaceWith(editForm);
    const newTextarea = editForm.querySelector('.edit-textarea');
    newTextarea.focus();

    editForm.querySelector('.save-edit-btn').addEventListener('click', async () => {
      const newText = newTextarea.value.trim();
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
            const data = await res.json();
            const newRequestContent = document.createElement('div');
            newRequestContent.classList.add('request-content');
            newRequestContent.innerHTML = `<div class="text">${escapeHtml(newText)}</div>`;
            editForm.replaceWith(newRequestContent);
            
            await salmartCache.updateRequestInCache(data.request);
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
      const newRequestContent = document.createElement('div');
      newRequestContent.classList.add('request-content');
      newRequestContent.innerHTML = `<div class="text">${escapeHtml(requestText)}</div>`;
      editForm.replaceWith(newRequestContent);
    });
}

function showReportModal(requestId) {
  showModal(reportModal);
  const reportInput = reportModal.querySelector('.report-reason-input');
  const submitBtn = reportModal.querySelector('.submit-report-btn');
  reportInput.value = '';

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
            'Authorization': `Bearer ${token}`
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


document.addEventListener('DOMContentLoaded', () => {
  currentUserId = localStorage.getItem('userId') || null;
  fetchRequests();
});
