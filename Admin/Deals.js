const API_BASE_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com';
const socket = io(`${API_BASE_URL}`);
const userId = localStorage.getItem('userId');
const authToken = localStorage.getItem('authToken');

let currentTab = 'buying';

// Function to create skeleton loader
function createSkeletonLoader() {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-card';
  skeleton.innerHTML = `
    <div class="skeleton-content">
      <div class="skeleton-image"></div>
      <div class="skeleton-details">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line badge"></div>
        ${currentTab === 'buying' ? '<div class="skeleton-line button"></div>' : ''}
      </div>
    </div>
  `;
  return skeleton;
}

// Function to show skeleton loaders
function showSkeletonLoaders(container, count = 3) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    container.appendChild(createSkeletonLoader());
  }
}

// Function to update deals badge
function updateDealsBadge(count) {
  const badge = document.getElementById('deals-badge');
  if (!badge) return;
  if (count > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = count > 9 ? '9+' : count;
  } else {
    badge.style.display = 'none';
  }
}

// Function to fetch transactions
async function fetchTransactions() {
  const list = document.getElementById('transaction-list');
  const noTransactions = document.getElementById('no-transactions');

  if (!userId || !authToken) {
    console.error('Missing userId or authToken');
    list.innerHTML = '<p style="text-align: center; color: #777;">Please log in to view transactions.</p>';
    noTransactions.style.display = 'none';
    updateDealsBadge(0);
    return;
  }

  showSkeletonLoaders(list);

  try {
    const res = await fetch(`${API_BASE_URL}/get-transactions/${userId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!res.ok) {
      let errorMessage = 'Unknown error';
      try {
        const errorBody = await res.json();
        errorMessage = errorBody.message || JSON.stringify(errorBody);
      } catch (parseError) {
        errorMessage = await res.text();
      }
      throw new Error(`HTTP error! Status: ${res.status}. Error: ${errorMessage}`);
    }

    const data = await res.json();
    console.log('API Response:', data);

    if (!data.transactions || !Array.isArray(data.transactions)) {
      console.error('Expected data.transactions to be an array but received:', data);
      list.innerHTML = '<p style="text-align: center; color: #777;">No transactions available.</p>';
      noTransactions.style.display = 'block';
      updateDealsBadge(0);
      return;
    }

    const transactions = data.transactions;

    const unReadCount = transactions.filter((d) => !d.viewed).length;
    updateDealsBadge(unReadCount);

    list.innerHTML = '';
    const filtered = transactions.filter(
      (t) => (t[currentTab === 'buying' ? 'buyerId' : 'sellerId']?._id || '') === userId
    );

    if (filtered.length === 0) {
      list.innerHTML = '';
      noTransactions.style.display = 'block';
      return;
    } else {
      noTransactions.style.display = 'none';
    }

    filtered.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'transaction-card';

      const product = t.postId || {};
      const productImage = product.photo || 'Default.png';
      const productDescription = product.title || 'Product';
      const amount = t.amount || 0;

      // Note: `t.status` refers to the main transaction status (e.g., 'pending', 'completed')
      // `t.refundRequested` is the new flag for when a refund has been initiated for this transaction.
      const statusBadge = `<span class="badge ${t.status}">${t.status}</span>`;
      let confirmBtn = '';
      let refundBtn = '';

      if (currentTab === 'buying') {
        // **Confirm Delivery Button Logic**
        // The button should be shown only if the transaction is 'pending' AND no refund has been requested.
        // If a refund has been requested, the confirm button should be disabled or hidden.
        if (t.status === 'pending' && !t.refundRequested) {
          confirmBtn = `<button class="confirm-btn" onclick="openConfirmModal('${t._id}')">Confirm Delivery</button>`;
        } else if (t.refundRequested) {
          // Display a disabled button to inform the user
          confirmBtn = `<button class="confirm-btn disabled" disabled>Delivery Confirmation Locked</button>`;
        }

        // **Refund Button Logic**
        // If a refund has already been requested, show the "Refund Requested" badge.
        // Otherwise, if the transaction is still 'pending', allow a refund request.
        if (t.refundRequested) {
          refundBtn = `<span class="badge refund-requested">Refund Requested</span>`;
        } else if (t.status === 'pending') {
          // Only show 'Request Refund' if not already requested and status is pending
          refundBtn = `<button class="refund-btn" onclick="openRefundModal('${t._id}')">Request Refund</button>`;
        }
        // If the transaction is completed, refunded, or cancelled, the refund button should not appear.
      }

      const date = new Date(t.createdAt).toLocaleString();
      const dealUser = currentTab === 'buying' ? t.sellerId : t.buyerId;
      const dealUserPic = dealUser?.profilePicture || 'Default.png';
      const dealUserName = `${dealUser?.firstName || ''} ${dealUser?.lastName || ''}`;

      card.innerHTML = `
        <div class="transaction-content">
          <img src="${productImage}" alt="Product Image" />
          <div class="transaction-details">
            <h4>${productDescription}</h4>
            <p>₦${Number(amount).toLocaleString('en-Ng')}</p>
            <p>${date}</p>
            ${statusBadge}
            ${confirmBtn}
            ${refundBtn}
            <div class="deal-user-info">
              <span>${currentTab === 'buying' ? 'Buying from:' : 'Selling to:'}</span>
              <img src="${dealUserPic}" class="user-profile" style="width: 20px; height: 20px; border-radius: 50%;" />
              <strong>${dealUserName}</strong>
            </div>
          </div>
        </div>
      `;
      list.append(card);
    });
    await markDealsAsViewed();
  } catch (err) {
    console.error('Error fetching transactions:', err);
    list.innerHTML = '<p style="text-align: center; color: #777;">Failed to load transactions. Please try again.</p>';
    noTransactions.style.display = 'none';
    updateDealsBadge(0);
  }
}

// Function to mark deals as viewed
async function markDealsAsViewed() {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) throw new Error('No auth token available');
    const res = await fetch(`${API_BASE_URL}/deals/mark-as-viewed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw new Error('Failed to mark deals as viewed');
  } catch (err) {
    console.error('Error marking deals as viewed:', err);
  }
}

// Function to switch tabs
function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
  document.querySelectorAll('.tab')[tab === 'buying' ? 0 : 1].classList.add('active');
  fetchTransactions();
}

// Function to confirm delivery
async function confirmDelivery(transactionId) {
  if (!transactionId) {
    console.error('[CONFIRM DELIVERY ERROR] Transaction ID is missing');
    throw new Error('Transaction ID is missing');
  }
  const token = localStorage.getItem('authToken');
  if (!token) {
    console.error('[CONFIRM DELIVERY ERROR] Authentication token is missing');
    throw new Error('Authentication token is missing');
  }
  try {
    console.log('[CONFIRM DELIVERY] Sending request for transaction:', transactionId);
    const res = await fetch(`${API_BASE_URL}/confirm-delivery/${transactionId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    if (res.ok) {
      console.log('[CONFIRM DELIVERY SUCCESS]', data);
      return data;
    } else {
      console.error('[CONFIRM DELIVERY FAILED]', data);
      throw new Error(data.error || data.message || 'Failed to confirm delivery');
    }
  } catch (err) {
    console.error('[CONFIRM DELIVERY ERROR]', err);
    throw err;
  }
}

// Function to open confirmation modal
function openConfirmModal(transactionId) {
  if (!transactionId) {
    console.error('[OPEN CONFIRM MODAL ERROR] Transaction ID is undefined');
    showToast('Error: Invalid transaction ID.');
    return;
  }
  console.log('[OPEN CONFIRM MODAL] Transaction:', transactionId);
  localStorage.setItem('transactionId', transactionId);
  const confirmModal = document.getElementById('confirmModal');
  if (!confirmModal) {
    console.error('[OPEN CONFIRM MODAL ERROR] #confirmModal not found in DOM');
    showToast('Error: Confirmation modal not found.');
    return;
  }
  confirmModal.style.display = 'flex';
}

// Function to close confirmation modal
function closeConfirmModal() {
  const confirmModal = document.getElementById('confirmModal');
  if (confirmModal) {
    confirmModal.style.display = 'none';
    localStorage.removeItem('transactionId');
    console.log('[CLOSE CONFIRM MODAL]');
  }
}

// Function to open loader modal
function openLoaderModal() {
  const loaderModal = document.getElementById('loaderModal');
  if (!loaderModal) {
    console.error('[OPEN LOADER MODAL ERROR] #loaderModal not found in DOM');
    showToast('Error: Loader modal not found.');
    return;
  }
  loaderModal.style.display = 'flex';
}

// Function to close loader modal
function closeLoaderModal() {
  const loaderModal = document.getElementById('loaderModal');
  if (loaderModal) {
    loaderModal.style.display = 'none';
    console.log('[CLOSE LOADER MODAL]');
  }
}

// Function to open response modal
function openResponseModal(success, message) {
  const responseModal = document.getElementById('responseModal');
  const responseIcon = document.getElementById('responseIcon');
  const responseTitle = document.getElementById('responseTitle');
  const responseMessage = document.getElementById('responseMessage');
  const responseButton = document.getElementById('responseButton');

  if (!responseModal || !responseIcon || !responseTitle || !responseMessage || !responseButton) {
    console.error('[OPEN RESPONSE MODAL ERROR] Response modal elements not found in DOM');
    showToast('Error: Response modal not found.');
    return;
  }

  if (success) {
    responseIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
    responseTitle.textContent = 'Action Successful!';
    responseMessage.textContent = message || 'Your request has been processed successfully.';
    responseButton.className = 'success-btn';
  } else {
    responseIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
    responseTitle.textContent = 'Action Failed';
    responseMessage.textContent = message || 'Failed to complete the action. Please try again.';
    responseButton.className = 'error-btn';
  }

  responseModal.style.display = 'flex';
}

// Function to close response modal
function closeResponseModal() {
  const responseModal = document.getElementById('responseModal');
  if (responseModal) {
    responseModal.style.display = 'none';
    localStorage.removeItem('transactionId');
    console.log('[CLOSE RESPONSE MODAL]');
  }
}

async function handleConfirmDelivery() {
  const transactionId = localStorage.getItem('transactionId');
  if (!transactionId) {
    showToast('No transaction selected.');
    closeConfirmModal();
    return;
  }

  const confirmButton = document.querySelector(`button[onclick="openConfirmModal('${transactionId}')"]`);
  if (confirmButton) {
    confirmButton.textContent = 'Processing';
    confirmButton.classList.add('processing-btn');
    confirmButton.disabled = true;
  }

  try {
    console.log('[CONFIRM DELIVERY INITIATED] Transaction ID:', transactionId);
    closeConfirmModal();
    openLoaderModal();

    const response = await confirmDelivery(transactionId);
    closeLoaderModal();

    if (response.queued) {
      openResponseModal(true, 'Delivery confirmed! Payment is queued and will be released once available. You will be notified.');
    } else if (response.balanceCheckFailed) {
      openResponseModal(true, 'Delivery confirmed. Payout is temporarily delayed as we could not verify our payment balance. It will be processed soon.');
    } else {
      openResponseModal(true, response.message || 'Delivery confirmed. Payment released successfully.');
    }

    fetchTransactions(); // Re-fetch to update transaction status instantly
  } catch (err) {
    console.error('[CONFIRM DELIVERY SERVER ERROR]', err.message);
    closeLoaderModal();
    openResponseModal(false, err.message || 'Failed to confirm delivery. Please try again.');
    if (confirmButton) {
      confirmButton.textContent = 'Confirm Delivery';
      confirmButton.classList.remove('processing-btn');
      confirmButton.disabled = false;
    }
  }
}

// Function to show toast
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show';
  setTimeout(() => {
    toast.className = 'toast';
  }, 5000);
}

// Function to show snackbar
function showSnackbar(message) {
  const snackbar = document.getElementById('snackbar');
  snackbar.textContent = message;
  snackbar.classList.add('show');
  setTimeout(() => {
    snackbar.classList.remove('show');
  }, 3000);
}

// Function to open refund modal
function openRefundModal(transactionId) {
  localStorage.setItem('refundTransactionId', transactionId);
  document.getElementById('refundModal').style.display = 'flex';
}

// Function to close refund modal
function closeRefundModal() {
  const refundModal = document.getElementById('refundModal');
  if (refundModal) {
    refundModal.style.display = 'none';
    document.getElementById('reason').value = '';
    document.getElementById('refundNote').value = '';
    const refundEvidenceInput = document.getElementById('refundEvidence');
    if (refundEvidenceInput) {
        refundEvidenceInput.value = ''; // Clears selected file
    }
    localStorage.removeItem('refundTransactionId');
  }
}

// Function to submit refund
async function submitRefund() {
  const reason = document.getElementById('reason').value;
  const note = document.getElementById('refundNote').value;
  const file = document.getElementById('refundEvidence').files[0];
  const transactionId = localStorage.getItem('refundTransactionId');
  const token = localStorage.getItem('authToken');

  if (!reason || !transactionId) {
    showToast('Please select a refund reason and ensure a valid transaction.');
    return;
  }

  openLoaderModal();

  const formData = new FormData();
  formData.append('reason', reason);
  if (note) formData.append('note', note);
  if (file) formData.append('evidence', file);

  try {
    const res = await fetch(`${API_BASE_URL}/request-refund/${transactionId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    closeLoaderModal();

    if (!res.ok) {
      let errorMessage = 'Error requesting refund.';
      try {
        const errorBody = await res.json();
        errorMessage = errorBody.message || errorBody.error || `HTTP error! status: ${res.status}`;
      } catch (parseError) {
        errorMessage = `HTTP error! status: ${res.status}`;
      }
      throw new Error(errorMessage);
    }

    const data = await res.json();
    showToast(data.message || 'Refund requested successfully.');
    closeRefundModal();
    // Re-fetch transactions to update the UI with the new refund status
    fetchTransactions();
  } catch (err) {
    console.error('Refund request error:', err);
    closeLoaderModal();
    showToast(err.message || 'Error requesting refund. Please try again.');
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', fetchTransactions);
