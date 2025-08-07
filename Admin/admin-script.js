// Admin script
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://salmart.onrender.com';


const authToken = localStorage.getItem('authToken');
const urlParams = new URLSearchParams(window.location.search);

if (urlParams.toString() && !authToken) {
  alert('Restricted route');
  window.location.href = 'adminRegister.html';
}
// Helper for showing alerts
function showAlert(message, type = 'success') {
    const alertBox = document.createElement('div');
    alertBox.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 10px;
        font-weight: 600;
        color: #fff;
        z-index: 1001;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        animation: slideIn 0.3s forwards;
        min-width: 250px;
        text-align: center;
    `;
    if (type === 'success') {
        alertBox.style.background = 'linear-gradient(45deg, #28a745, #20a13a)';
    } else if (type === 'error') {
        alertBox.style.background = 'linear-gradient(45deg, #dc3545, #c82333)';
    } else if (type === 'info') {
        alertBox.style.background = 'linear-gradient(45deg, #007bff, #0056b3)';
    }

    alertBox.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(alertBox);

    setTimeout(() => {
        alertBox.style.animation = 'slideOut 0.3s forwards';
        alertBox.addEventListener('animationend', () => alertBox.remove());
    }, 3000);

    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}


// Tab switching logic
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel, .wallet-panel');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');

    const targetPanelId = tab.dataset.panel;
    document.getElementById(targetPanelId).classList.add('active');

    // Re-fetch data for the newly active panel
    switch(targetPanelId) {
        case 'users':
            fetchRender('/api/reported-users', 'reported-users', userItem);
            break;
        case 'posts':
            fetchRender('/admin/reports/pending', 'reported-posts', postItem);
            break;
        case 'all-posts': // <-- NEW CASE FOR ALL POSTS
            fetchRender('/api/admin/posts', 'all-posts-list', postItemFormatter);
            break;
        case 'refunds':
            fetchRender('/api/admin/refunds', 'refund-requests', refundItem);
            break;
        case 'transactions':
            fetchRender('/api/admin/transactions', 'transactions-list', transactionItem);
            break;
        case 'pending-transactions':
            fetchRender('/admin/transactions/pending', 'pending-transactions-list', pendingTransactionItem);
            break;
        case 'all-users':
            fetchRender('/api/admin/users', 'all-users-list', allUsersItem);
            break;
        case 'banned-users':
            fetchRender('/api/admin/users/banned', 'banned-users-list', bannedUsersItem);
            break;
        case 'platform-wallet':
            switchWalletTab('commission');
            break;
    }
  });
});

// Wallet sub-tab switching logic
function switchWalletTab(type) {
    const walletTabs = document.querySelectorAll('.wallet-tabs .tab-btn');
    const walletPanels = document.querySelectorAll('.wallet-panel');

    walletTabs.forEach(tabBtn => {
        tabBtn.classList.remove('active');
    });

    walletPanels.forEach(panel => {
        panel.style.display = 'none';
    });

    document.getElementById(`${type}-wallet`).style.display = 'block';
    document.querySelector(`.wallet-tabs .tab-btn[onclick="switchWalletTab('${type}')"]`).classList.add('active');

    fetchPlatformWallet(type);
}


// Initial data fetch for the first active panel on page load
document.addEventListener('DOMContentLoaded', () => {
    const initialActiveTab = document.querySelector('.tab.active');
    if (initialActiveTab) {
        const initialPanelId = initialActiveTab.dataset.panel;
        switch(initialPanelId) {
            case 'users':
                fetchRender('/api/reported-users', 'reported-users', userItem);
                break;
            case 'posts':
                fetchRender('/admin/reports/pending', 'reported-posts', postItem);
                break;
            case 'all-posts':
                fetchRender('/api/admin/posts', 'all-posts-list', postItemFormatter);
                break;
            case 'platform-wallet':
                switchWalletTab('commission');
                break;
            default:
                if (initialPanelId === 'users') {
                   fetchRender('/api/reported-users', 'reported-users', userItem);
                }
                break;
        }
    } else {
        // Default to fetching reported users if no tab is active
        document.querySelector('.tab[data-panel="users"]').click();
    }
});



// Modal controls
function openModal(content) {
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('detail-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('detail-modal').style.display = 'none';
  document.getElementById('modal-body').innerHTML = ''; // Clear content on close
}

// Close modal when clicking outside
document.getElementById('detail-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('detail-modal')) {
    closeModal();
  }
});

// Get Admin Profile
async function fetchAdminProfile() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    console.warn('No admin token found. Admin profile cannot be fetched.');
    document.getElementById('admin-name').textContent = 'Guest Admin';
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/admin/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch admin profile');
    }
    const data = await response.json();
    if (data.success && data.admin) {
      document.getElementById('admin-name').textContent = `${data.admin.firstName} ${data.admin.lastName}`;
      const avatarDiv = document.getElementById('admin-avatar');
      if (data.admin.profilePicture) {
        avatarDiv.innerHTML = `<img src="${data.admin.profilePicture}" alt="Admin Avatar">`;
      } else {
        avatarDiv.textContent = data.admin.firstName.charAt(0).toUpperCase();
      }
    }
  } catch (error) {
    console.error('Error fetching admin profile:', error.message);
    document.getElementById('admin-name').textContent = 'Admin'; // Fallback
  }
}
fetchAdminProfile();


// Generic Fetch and Render Data Function
async function fetchRender(endpoint, elementId, formatter) {
  const container = document.getElementById(elementId);
  container.innerHTML = '<li class="no-data"><div class="loading"></div><span>Loading data...</span></li>';
  const token = localStorage.getItem('authToken');

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
    }
    let data = await response.json();

    if (data.success && (Array.isArray(data.reports) || Array.isArray(data.data) || Array.isArray(data.posts) || Array.isArray(data.users))) {
        data = data.reports || data.data || data.posts || data.users;
    } else if (!Array.isArray(data)) {
        throw new Error('Unexpected data format received from API');
    }

    if (!data || data.length === 0) {
        container.innerHTML = '<li class="no-data">No data found.</li>';
    } else {
        container.innerHTML = data.map(formatter).join('');
    }
  } catch (error) {
    console.error(`Fetch error for ${endpoint}:`, error);
    container.innerHTML = `<li class="no-data">Error loading data: ${error.message}. Please refresh the page.</li>`;
    showAlert(`Error: ${error.message}`, 'error');
  }
}

// Handle actions (resolve, approve, deny, ban, unban, approve-payment)
async function resolveAction(endpoint, btn, elementId, formatter, actionType = 'default', reportId = null, additionalData = {}) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<div class="loading"></div><span>Processing...</span>';
  const token = localStorage.getItem('adminToken');

  try {
    let options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(additionalData)
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.message || 'Action failed');
    }

    showAlert(data.message || 'Action successful!', 'success');

    let refreshEndpoint;
    switch (elementId) {
        case 'all-users-list': refreshEndpoint = '/api/admin/users'; break;
        case 'banned-users-list': refreshEndpoint = '/api/admin/users/banned'; break;
        case 'reported-users': refreshEndpoint = '/api/reported-users'; break;
        case 'reported-posts': refreshEndpoint = '/admin/reports/pending'; break;
        case 'refund-requests': refreshEndpoint = '/api/admin/refunds'; break;
        case 'transactions-list': refreshEndpoint = '/api/admin/transactions'; break;
        case 'pending-transactions-list': refreshEndpoint = '/admin/transactions/pending'; break;
        case 'platform-wallet': fetchPlatformWallet(); return;
        default: console.warn('No specific refresh endpoint for elementId:', elementId); return;
    }

    setTimeout(() => {
        fetchRender(refreshEndpoint, elementId, formatter);
        closeModal();
    }, 500);

  } catch (error) {
    console.error('Action error:', error);
    showAlert(`Action failed: ${error.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = `<span>${originalText}</span>`;
  }
}

// Formatters for each panel
function userItem(report) {
  const user = report.reportedUser;
  const reportedBy = report.reportedBy;
  const details = `
    <h3 style="color: #1a73e8; margin-bottom: 20px;">User Report Details</h3>
    <div style="line-height: 1.8; font-size: 0.95rem;">
      <p><strong>Report ID:</strong> ${report._id}</p>
      <p><strong>Reported User:</strong> ${user.firstName} ${user.lastName} (${user.email}) <span class="status-badge status-${user.isBanned ? 'banned' : 'active'}">${user.isBanned ? 'Banned' : 'Active'}</span></p>
      <p><strong>Reported By:</strong> ${reportedBy.firstName} ${reportedBy.lastName} (${reportedBy.email})</p>
      <p><strong>Reason:</strong> ${report.reason}</p>
      <p><strong>Reported At:</strong> ${new Date(report.createdAt).toLocaleString()}</p>
      ${report.evidence && report.evidence.length ? `<h4>Evidence:</h4> ${report.evidence.map(img => `<img src="${img}" class="evidence-img" alt="Evidence">`).join('')}` : ''}
      ${user.profilePicture ? `<h4 style="margin-top: 20px;">Reported User's Profile Picture:</h4> <img src="${user.profilePicture}" class="evidence-img" alt="Profile Picture">` : ''}
    </div>
    <hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;">
    <h3 style="color: #1a73e8; margin-bottom: 15px;">Admin Action</h3>
    <textarea id="admin-notes-${report._id}" rows="4" placeholder="Add optional admin notes here..." style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 15px; font-family: inherit; font-size: 0.9rem;"></textarea>
    <div class="list-item-actions" style="margin-top: 0;">
        <button class="danger" onclick="confirmReportAction('${report._id}', 'ban', 'reported-users', userItem)"><span>Ban User</span></button>
        <button class="success" onclick="confirmReportAction('${report._id}', 'warn', 'reported-users', userItem)"><span>Warn User</span></button>
        <button class="primary" onclick="confirmReportAction('${report._id}', 'resolve', 'reported-users', userItem)"><span>Mark as Resolved (No Action)</span></button>
    </div>
  `;
  return `
    <li>
      <div class="user-list-item-content">
        <div class="avatar">
            ${user.profilePicture ? `<img src="${user.profilePicture}" alt="Avatar">` : user.firstName.charAt(0).toUpperCase()}
        </div>
        <div class="user-details">
            <strong style="color: #1a73e8;">${user.firstName} ${user.lastName}</strong> (${user.email})<br>
            <strong>Reason:</strong> ${report.reason}<br>
            <small style="color: #666;">Reported: ${new Date(report.createdAt).toLocaleString()}</small>
            <span class="status-badge status-pending">Pending Review</span>
        </div>
        <div class="list-item-actions">
          <button class="primary" onclick="openModal(\`${details.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><span>View & Resolve</span></button>
        </div>
      </div>
    </li>
  `;
}

function postItem(report) {
  const post = report.relatedPost;
  const reportedBy = report.reportedBy;
  const details = `
    <h3 style="color: #1a73e8; margin-bottom: 20px;">Post Report Details</h3>
    <div style="line-height: 1.8; font-size: 0.95rem;">
      <p><strong>Report ID:</strong> ${report._id}</p>
      <p><strong>Post ID:</strong> ${post?._id || 'N/A'}</p>
      <p><strong>Post Title:</strong> ${post?.title || 'N/A'}</p>
      <p><strong>Post Description:</strong> ${post?.description || 'No description'}</p>
      <p><strong>Reported By:</strong> ${reportedBy?.firstName} ${reportedBy?.lastName} (${reportedBy?.email})</p>
      <p><strong>Reason:</strong> ${report.reason}</p>
      <p><strong>Reported At:</strong> ${new Date(report.createdAt).toLocaleString()}</p>
      ${report.evidence && report.evidence.length ? `<h4>Evidence:</h4> ${report.evidence.map(img => `<img src="${img}" class="evidence-img" alt="Evidence">`).join('')}` : ''}
      ${post?.images && post.images.length ? `<h4>Post Images:</h4> ${post.images.map(img => `<img src="${img}" class="evidence-img" alt="Post Image">`).join('')}` : 'No post images provided'}
    </div>
    <hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;">
    <h3 style="color: #1a73e8; margin-bottom: 15px;">Admin Action</h3>
    <textarea id="admin-notes-${report._id}" rows="4" placeholder="Add optional admin notes here..." style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 15px; font-family: inherit; font-size: 0.9rem;"></textarea>
    <div class="list-item-actions" style="margin-top: 0;">
        <button class="danger" onclick="confirmReportAction('${report._id}', 'post_removed', 'reported-posts', postItem)"><span>Remove Post</span></button>
        <button class="success" onclick="confirmReportAction('${report._id}', 'warn', 'reported-posts', postItem)"><span>Warn Poster</span></button>
        <button class="primary" onclick="confirmReportAction('${report._id}', 'resolve', 'reported-posts', postItem)"><span>Mark as Resolved (Keep Post)</span></button>
    </div>
  `;
  return `
    <li>
      <div class="list-item-header">
        <div class="list-item-details">
          <strong style="color: #1a73e8;">Report ID:</strong> ${report._id}<br>
          <strong>Reason:</strong> ${report.reason}<br>
          <small style="color: #666;">Reported: ${new Date(report.createdAt).toLocaleString()}</small>
          <span class="status-badge status-pending">Pending Review</span>
        </div>
        <div class="list-item-actions">
          <button class="primary" onclick="openModal(\`${details.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><span>View & Resolve</span></button>
        </div>
      </div>
    </li>
  `;
}

// Formatter for all posts
function postItemFormatter(post) {
    const isVideoAd = post.postType === 'video_ad';
    const postDetails = isVideoAd ?
        `<strong>Video URL:</strong> <a href="${post.video}" target="_blank">View Video</a><br>
         <strong>Product Link:</strong> <a href="${post.productLink}" target="_blank">View Product</a><br>
         <strong>Promotion:</strong> ${post.isPromoted ? `Yes (Ends: ${new Date(post.promotionDetails.endDate).toLocaleDateString()})` : 'No'}` :
        `<strong>Price:</strong> ₦${post.price?.toLocaleString('en-NG')}<br>
         <strong>Location:</strong> ${post.location}<br>
         <strong>Condition:</strong> ${post.productCondition}<br>
         <strong>Status:</strong> ${post.isSold ? 'Sold' : 'Available'}`;

    const details = `
        <h3 style="color: #1a73e8; margin-bottom: 20px;">Post Details</h3>
        <div style="line-height: 1.8; font-size: 0.95rem;">
          <p><strong>Post ID:</strong> ${post._id}</p>
          <p><strong>Title:</strong> ${post.title || 'N/A'}</p>
          <p><strong>Type:</strong> ${post.postType}</p>
          <p><strong>Description:</strong> ${post.description || 'No description'}</p>
          <p><strong>Category:</strong> ${post.category}</p>
          <p><strong>Created By:</strong> ${post.createdBy.name} (${post.createdBy.userId?.email || 'N/A'})</p>
          <p><strong>Post Status:</strong> <span class="status-badge status-${post.status.toLowerCase()}">${post.status}</span></p>
          <p><strong>Created At:</strong> ${new Date(post.createdAt).toLocaleString()}</p>
          <p><strong>Last Updated:</strong> ${new Date(post.updatedAt).toLocaleString()}</p>
          <hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;">
          ${postDetails}
        </div>
        ${post.photo ? `<h4 style="margin-top: 20px;">Main Image:</h4> <img src="${post.photo}" class="evidence-img" alt="Post Image">` : ''}
        <hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;">
        <h3 style="color: #1a73e8; margin-bottom: 15px;">Admin Actions</h3>
        <div class="list-item-actions" style="margin-top: 0;">
            <button class="danger" onclick="handlePostAction('${post._id}', 'delete')"><span>Delete Post</span></button>
            <button class="promote-btn" onclick="openPromoteModal('${post._id}')"><span>Promote Post</span></button>
        </div>
    `;
    return `
        <li>
          <div class="list-item-header">
            <div class="list-item-details">
              <strong style="color: #1a73e8;">Title:</strong> ${post.title || 'Video Ad'}<br>
              <strong>Category:</strong> ${post.category}<br>
              <small style="color: #666;">By: ${post.createdBy.name}</small>
              <span class="status-badge status-${post.status.toLowerCase()}">${post.status}</span>
            </div>
            <div class="list-item-actions">
              <button class="primary" onclick="openModal(\`${details.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><span>View Details</span></button>
            </div>
          </div>
        </li>
    `;
}

// New function to handle post actions (promote & delete)
async function handlePostAction(postId, action, durationDays = null) {
  const isDelete = action === 'delete';
  const confirmMessage = isDelete
    ? 'Are you sure you want to permanently delete this post? This action cannot be undone.'
    : `Are you sure you want to promote this post for ${durationDays} days?`;

  if (confirm(confirmMessage)) {
    const endpoint = isDelete
      ? `/admin/delete-posts/${postId}`
      : `/admin/promote-post`;
    const method = isDelete ? 'DELETE' : 'POST';
    const body = isDelete ? null : JSON.stringify({ postId, durationDays });
    const btn = event.target;
    const originalText = btn.textContent;
    const token = localStorage.getItem('authToken');

    try {
      btn.disabled = true;
      btn.innerHTML = '<div class="loading"></div><span>Processing...</span>';
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: body
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Action failed');
      }

      showAlert(data.message || 'Action successful!', 'success');
      
      setTimeout(() => {
        fetchRender('/api/admin/posts', 'all-posts-list', postItemFormatter);
        closeModal();
      }, 500);

    } catch (error) {
      console.error('Post action error:', error);
      showAlert(`Action failed: ${error.message}`, 'error');
      btn.disabled = false;
      btn.innerHTML = `<span>${originalText}</span>`;
    }
  }
}

// New function for promoting posts
function openPromoteModal(postId) {
    const content = `
        <h3 style="color: #ffc107; margin-bottom: 20px;">Promote Post</h3>
        <p>Enter the number of days you want to promote this post.</p>
        <input type="number" id="promotion-duration" class="modal-input" placeholder="Enter duration in days (e.g., 7)" min="1">
        <div class="list-item-actions" style="margin-top: 20px;">
            <button class="promote-btn" onclick="handlePromotionSubmit('${postId}')"><span>Promote Post</span></button>
            <button class="primary" onclick="closeModal()"><span>Cancel</span></button>
        </div>
    `;
    openModal(content);
}

// Function to handle the promotion modal submission
function handlePromotionSubmit(postId) {
    const durationInput = document.getElementById('promotion-duration');
    const durationDays = parseInt(durationInput.value, 10);

    if (isNaN(durationDays) || durationDays < 1) {
        showAlert('Please enter a valid number of days (1 or more).', 'error');
        return;
    }

    handlePostAction(postId, 'promote', durationDays);
}


async function confirmReportAction(reportId, action, elementId, formatter) {
    const adminNotes = document.getElementById(`admin-notes-${reportId}`).value;
    const confirmMessage = `Are you sure you want to ${action.replace('_', ' ')} this report?`;
    if (confirm(confirmMessage)) {
        const endpoint = '/admin/resolve-report';
        const btn = event.target; // Get the button that was clicked
        const additionalData = { reportId, action, adminNotes };
        await resolveAction(endpoint, btn, elementId, formatter, action, reportId, additionalData);
    }
}


function refundItem(refund) {
  const images = refund.evidence?.length
    ? refund.evidence.map(url => `<img src="${url}" class="evidence-img" alt="Evidence">`).join('')
    : '<p>No evidence provided.</p>';
  const details = `
    <h3 style="color: #1a73e8; margin-bottom: 20px;">Refund Request Details</h3>
    <div style="line-height: 1.8; font-size: 0.95rem;">
      <p><strong>Refund ID:</strong> ${refund._id}</p>
      <p><strong>Transaction ID:</strong> ${refund.transactionId?._id || 'N/A'}</p>
      <p><strong>Buyer:</strong> ${refund.buyerId?.firstName} ${refund.buyerId?.lastName || 'N/A'} (${refund.buyerId?.email || 'N/A'})</p>
      <p><strong>Seller:</strong> ${refund.sellerId?.firstName} ${refund.sellerId?.lastName || 'N/A'} (${refund.sellerId?.email || 'N/A'})</p>
      <p><strong>Product:</strong> ${refund.transactionId?.postId?.title || 'N/A'}</p>
      <p><strong>Amount:</strong> ₦${refund.transactionId?.amount?.toLocaleString('en-NG') || 'N/A'}</p>
      <p><strong>Reason:</strong> ${refund.reason}</p>
      <p><strong>Status:</strong> <span class="status-badge status-${refund.status.toLowerCase().replace(/ /g, '_')}">${refund.status}</span></p>
      <p><strong>Admin Comment:</strong> ${refund.adminComment || 'None'}</p>
      <p><strong>Transaction Date:</strong> ${new Date(refund.transactionId?.createdAt || refund.createdAt).toLocaleString()}</p>
      <p><strong>Request Date:</strong> ${new Date(refund.createdAt).toLocaleString()}</p>
      <h4 style="margin-top: 20px;">Evidence:</h4>${images}
    </div>
  `;
  return `
    <li>
      <div class="list-item-header">
        <div class="list-item-details">
          <strong style="color: #1a73e8;">Transaction ID:</strong> ${refund.transactionId?._id || 'N/A'}<br>
          <strong>Buyer:</strong> ${refund.buyerId?.firstName} → <strong>Seller:</strong> ${refund.sellerId?.firstName}<br>
          <strong>Amount:</strong> ₦${refund.transactionId?.amount?.toLocaleString('en-NG') || 'N/A'}<br>
          <strong>Reason:</strong> ${refund.reason}<br>
          <span class="status-badge status-${refund.status.toLowerCase().replace(/ /g, '_')}">${refund.status}</span>
        </div>
        <div class="list-item-actions">
          <button class="primary" onclick="openModal(\`${details.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><span>View Details</span></button>
          ${refund.status === 'Refund Requested' ? `
            <button class="success" onclick="resolveAction('/api/admin/refunds/${refund.transactionId._id}/approve', this, 'refund-requests', refundItem)"><span>Approve Refund</span></button>
            <button class="danger" onclick="resolveAction('/api/admin/refunds/${refund.transactionId._id}/deny', this, 'refund-requests', refundItem)"><span>Deny Refund</span></button>
          ` : ''}
        </div>
      </div>
    </li>
  `;
}

function transactionItem(tx) {
  const details = `
    <h3 style="color: #1a73e8; margin-bottom: 20px;">Transaction Details</h3>
    <div style="line-height: 1.8; font-size: 0.95rem;">
      <p><strong>Transaction ID:</strong> ${tx._id}</p>
      <p><strong>Buyer:</strong> ${tx.buyerId?.firstName} ${tx.buyerId?.lastName} (${tx.buyerId?.email})</p>
      <p><strong>Seller:</strong> ${tx.sellerId?.firstName} ${tx.sellerId?.lastName} (${tx.sellerId?.email})</p>
      <p><strong>Product:</strong> ${tx.postId?.title || 'N/A'}</p>
      <p><strong>Amount:</strong> ₦${tx.amount?.toLocaleString('en-NG')}</p>
      <p><strong>Commission:</strong> ₦${tx.commissionAmount?.toLocaleString('en-NG') || '0.00'}</p>
      <p><strong>Amount Due Seller:</strong> ₦${tx.amountDue?.toLocaleString('en-NG') || 'N/A'}</p>
      <p><strong>Status:</strong> <span class="status-badge status-${tx.status.toLowerCase().replace(/ /g, '_')}">${tx.status}</span></p>
      <p><strong>Payment Reference:</strong> ${tx.paymentReference}</p>
      <p><strong>Transfer Reference:</strong> ${tx.transferReference || 'N/A'}</p>
      <p><strong>Refund Requested:</strong> ${tx.refundRequested ? 'Yes' : 'No'}</p>
      ${tx.refundRequested ? `<p><strong>Refund Reason:</strong> ${tx.refundReason || 'N/A'}</p>` : ''}
      <p><strong>Created At:</strong> ${new Date(tx.createdAt).toLocaleString()}</p>
      <p><strong>Approved by Admin:</strong> ${tx.approvedByAdmin ? 'Yes' : 'No'}</p>
    </div>
  `;
  return `
    <li>
      <div class="list-item-header">
        <div class="list-item-details">
          <strong style="color: #1a73e8;">Transaction ID:</strong> ${tx._id}<br>
          <strong>Buyer:</strong> ${tx.buyerId?.firstName} → <strong>Seller:</strong> ${tx.sellerId?.firstName}<br>
          <strong>Product:</strong> ${tx.postId?.title || 'N/A'}<br>
          <strong>Amount:</strong> ₦${tx.amount?.toLocaleString('en-NG')}<br>
          <span class="status-badge status-${tx.status.toLowerCase().replace(/ /g, '_')}">${tx.status}</span>
        </div>
        <div class="list-item-actions">
          <button class="primary" onclick="openModal(\`${details.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><span>View Details</span></button>
        </div>
      </div>
    </li>
  `;
}

function pendingTransactionItem(txn) {
  const details = `
    <h3 style="color: #1a73e8; margin-bottom: 20px;">Pending Transaction Details</h3>
    <div style="line-height: 1.8; font-size: 0.95rem;">
      <p><strong>Transaction ID:</strong> ${txn._id}</p>
      <p><strong>Buyer:</strong> ${txn.buyerId?.firstName} ${txn.buyerId?.lastName} (${txn.buyerId?.email})</p>
      <p><strong>Seller:</strong> ${txn.sellerId?.firstName} ${txn.sellerId?.lastName} (${txn.sellerId?.email})</p>
      <p><strong>Product:</strong> ${txn.postId?.title || 'N/A'}</p>
      <p><strong>Amount:</strong> ₦${txn.amount?.toLocaleString('en-NG')}</p>
      <p><strong>Commission:</strong> ₦${txn.commissionAmount?.toLocaleString('en-NG') || '0.00'}</p>
      <p><strong>Amount Due Seller:</strong> ₦${txn.amountDue?.toLocaleString('en-NG') || 'N/A'}</p>
      <p><strong>Status:</strong> <span class="status-badge status-${txn.status.toLowerCase().replace(/ /g, '_')}">${txn.status}</span></p>
      <p><strong>Payment Reference:</strong> ${txn.paymentReference}</p>
      <p><strong>Created At:</strong> ${new Date(txn.createdAt).toLocaleString()}</p>
      <h4 style="margin-top: 20px;">Seller Bank Details:</h4>
      <p><strong>Account Name:</strong> ${txn.sellerId?.bankDetails?.accountName || 'N/A'}</p>
      <p><strong>Account Number:</strong> ${txn.sellerId?.bankDetails?.accountNumber || 'N/A'}</p>
      <p><strong>Bank Code:</strong> ${txn.sellerId?.bankDetails?.bankCode || 'N/A'}</p>
    </div>
  `;
  return `
    <li>
      <div class="list-item-header">
        <div class="list-item-details">
          <strong style="color: #1a73e8;">Transaction ID:</strong> ${txn._id}<br>
          <strong>Buyer:</strong> ${txn.buyerId?.firstName} → <strong>Seller:</strong> ${txn.sellerId?.firstName}<br>
          <strong>Product:</strong> ${txn.postId?.title || 'N/A'}<br>
          <strong>Amount:</strong> ₦${txn.amount?.toLocaleString('en-NG')}<br>
          <span class="status-badge status-${txn.status.toLowerCase().replace(/ /g, '_')}">${txn.status}</span>
        </div>
        <div class="list-item-actions">
          <button class="primary" onclick="openModal(\`${details.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><span>View Details</span></button>
          <button class="success" onclick="resolveAction('/admin/approve-payment', this, 'pending-transactions-list', pendingTransactionItem, 'approve-payment', null, { reference: '${txn.paymentReference}' })"><span>Approve Payout</span></button>
        </div>
      </div>
    </li>
  `;
}

function allUsersItem(user) {
  const details = `
    <h3 style="color: #1a73e8; margin-bottom: 20px;">User Details</h3>
    <div style="line-height: 1.8; font-size: 0.95rem;">
      <p><strong>User ID:</strong> ${user._id}</p>
      <p><strong>Name:</strong> ${user.firstName} ${user.lastName}</p>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Phone Number:</strong> ${user.phoneNumber || 'N/A'}</p>
      <p><strong>Status:</strong> <span class="status-badge status-${user.isBanned ? 'banned' : 'active'}">${user.isBanned ? 'Banned' : 'Active'}</span></p>
      <p><strong>Location:</strong> ${user.city || 'N/A'}, ${user.state || 'N/A'}</p>
      <p><strong>Account Verified:</strong> ${user.isVerified ? 'Yes' : 'No'}</p>
      <p><strong>Created At:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
      <p><strong>Last Updated:</strong> ${new Date(user.updatedAt).toLocaleString()}</p>
      <p><strong>Total Followers:</strong> ${user.followers?.length || 0}</p>
      <p><strong>Total Following:</strong> ${user.following?.length || 0}</p>
      <p><strong>Report Count:</strong> ${user.reportCount || 0}</p>
      ${user.profilePicture ? `<h4 style="margin-top: 20px;">Profile Picture:</h4> <img src="${user.profilePicture}" class="evidence-img" alt="Profile Picture">` : ''}
      <h4 style="margin-top: 20px;">Bank Details:</h4>
      <p><strong>Account Name:</strong> ${user.bankDetails?.accountName || 'N/A'}</p>
      <p><strong>Account Number:</strong> ${user.bankDetails?.accountNumber || 'N/A'}</p>
      <p><strong>Bank Code:</strong> ${user.bankDetails?.bankCode || 'N/A'}</p>
      <h4 style="margin-top: 20px;">Paystack Details:</h4>
      <p><strong>Customer ID:</strong> ${user.paystack?.customerId || 'N/A'}</p>
      <p><strong>Dedicated Account:</strong> ${user.paystack?.dedicatedAccount?.accountNumber || 'N/A'} (${user.paystack?.dedicatedAccount?.bankName || 'N/A'})</p>
    </div>
  `;
  return `
    <li>
      <div class="user-list-item-content">
        <div class="avatar">
            ${user.profilePicture ? `<img src="${user.profilePicture}" alt="Avatar">` : user.firstName.charAt(0).toUpperCase()}
        </div>
        <div class="user-details">
            <strong style="color: #1a73e8;">${user.firstName} ${user.lastName}</strong><br>
            <strong>Email:</strong> ${user.email}<br>
            <span class="status-badge status-${user.isBanned ? 'banned' : 'active'}">${user.isBanned ? 'Banned' : 'Active'}</span>
        </div>
        <div class="list-item-actions">
          <button class="primary" onclick="openModal(\`${details.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><span>View Details</span></button>
          ${user.isBanned
            ? `<button class="success" onclick="resolveAction('/api/admin/users/${user._id}/unban', this, 'all-users-list', allUsersItem)"><span>Unban</span></button>`
            : `<button class="danger" onclick="resolveAction('/api/admin/users/${user._id}/ban', this, 'all-users-list', allUsersItem)"><span>Ban</span></button>`
          }
        </div>
      </div>
    </li>
  `;
}

function bannedUsersItem(user) {
  const details = `
    <h3 style="color: #1a73e8; margin-bottom: 20px;">Banned User Details</h3>
    <div style="line-height: 1.8; font-size: 0.95rem;">
      <p><strong>User ID:</strong> ${user._id}</p>
      <p><strong>Name:</strong> ${user.firstName} ${user.lastName}</p>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Status:</strong> Banned</p>
      <p><strong>Created At:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
      ${user.profilePicture ? `<h4 style="margin-top: 20px;">Profile Picture:</h4> <img src="${user.profilePicture}" class="evidence-img" alt="Profile Picture">` : ''}
    </div>
  `;
  return `
    <li>
      <div class="user-list-item-content">
        <div class="avatar">
            ${user.profilePicture ? `<img src="${user.profilePicture}" alt="Avatar">` : user.firstName.charAt(0).toUpperCase()}
        </div>
        <div class="user-details">
            <strong style="color: #1a73e8;">${user.firstName} ${user.lastName}</strong><br>
            <strong>Email:</strong> ${user.email}<br>
            <span class="status-badge status-banned">Banned</span>
        </div>
        <div class="list-item-actions">
          <button class="primary" onclick="openModal(\`${details.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><span>View Details</span></button>
          <button class="success" onclick="resolveAction('/api/admin/users/${user._id}/unban', this, 'banned-users-list', bannedUsersItem)"><span>Unban</span></button>
        </div>
      </div>
    </li>
  `;
}

async function fetchPlatformWallet(type) {
  const balanceEl = document.getElementById(`${type}-balance`);
  const lastUpdatedEl = document.getElementById(`${type}-last-updated`);

  balanceEl.innerHTML = '<div class="loading"></div>';
  lastUpdatedEl.textContent = 'Loading...';

  const token = localStorage.getItem('adminToken');

  try {
    const response = await fetch(`${API_BASE_URL}/admin/platform-wallet?type=${type}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    const balanceInKobo = data.wallet.balance || 0;
    const balanceInNaira = balanceInKobo / 100;
    const formattedBalance = isNaN(balanceInNaira) ? '0.00' : balanceInNaira.toFixed(2);
    balanceEl.textContent = `₦${parseFloat(formattedBalance).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    lastUpdatedEl.textContent = data.wallet.lastUpdated
      ? new Date(data.wallet.lastUpdated).toLocaleString()
      : 'N/A';

  } catch (error) {
    console.error(`Error fetching ${type} wallet:`, error.message);
    balanceEl.textContent = 'Error';
    lastUpdatedEl.textContent = 'Failed to load';
    showAlert(`Error fetching ${type} wallet: ${error.message}`, 'error');
  }
}

async function withdrawWallet(buttonElement, type) {
    const amountInputId = `${type}-withdrawal-amount`;
    const amountInput = document.getElementById(amountInputId);
    let amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount <= 0) {
        showAlert('Please enter a valid amount to withdraw.', 'error');
        return;
    }

    const amountInKobo = Math.round(amount * 100);

    const originalButtonText = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<div class="loading"></div><span>Withdrawing...</span>';

    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE_URL}/admin/platform-wallet/withdraw`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ type, amount: amountInKobo })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to initiate ${type} withdrawal`);
        }

        showAlert(data.message || `${type} withdrawal successful`, 'success');
        amountInput.value = '';
        fetchPlatformWallet(type);

    } catch (error) {
        console.error(`Error during ${type} withdrawal:`, error);
        showAlert(`Withdrawal failed: ${error.message}`, 'error');
    } finally {
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalButtonText;
    }
}
// Initial data fetch for the first active panel
fetchRender('/api/reported-users', 'reported-users', userItem);
