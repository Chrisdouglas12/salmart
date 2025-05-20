const API_BASE_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart-production.up.railway.app';
const socket = io(`${API_BASE_URL}`);
const userId = localStorage.getItem('userId');
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

function updateDealsBadge(count) {
  const badge = document.getElementById('deals-badge-nav');
  if (!badge) return;
  if (count > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = count > 9 ? '9+' : count;
  } else {
    badge.style.display = 'none';
  }
}

async function fetchTransactions() {
  const list = document.getElementById('transaction-list');
  const noTransactions = document.getElementById('no-transactions');

  showSkeletonLoaders(list);

  try {
    const res = await fetch(`${API_BASE_URL}/get-transactions/${userId}`);
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    const data = await res.json();

    const unReadCount = data.filter((d) => !d.viewed).length;
    updateDealsBadge(unReadCount);

    list.innerHTML = '';
    const filtered = data.filter(
      (t) => (t[currentTab === 'buying' ? 'buyerId' : 'sellerId']?._id) === userId
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

      const product = t.productId || {};
      const productImage = product.photo || 'Default.png';
      const productDescription = product.description || 'Product';
      const amount = t.amount || '0';

      const statusBadge = `<span class="badge ${t.status}">${t.status}</span>`;
      let confirmBtn = '';
      let refundBtn = '';

      if (currentTab === 'buying') {
        if (t.status === 'pending' && !t.refundRequested) {
          confirmBtn = `<button class="confirm-btn" onclick="handleConfirmDelivery('${t._id}')">Confirm Delivery</button>`;
        }
        if (t.status === 'pending' && !t.refundRequested) {
          refundBtn = `<button class="refund-btn" onclick="openRefundModal('${t._id}')">Request Refund</button>`;
        } else if (t.refundRequested) {
          refundBtn = `<span class="badge refund-requested">Refund Requested</span>`;
        }
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
      list.prepend(card);
    });
    await markDealsAsViewed();
  } catch (err) {
    console.error('Error fetching transactions:', err);
    list.innerHTML = '<p style="text-align: center; color: #777;">Failed to load transactions. Please try again.</p>';
    noTransactions.style.display = 'none';
  }
}

async function markDealsAsViewed() {
  try {
    const token = localStorage.getItem('authToken');
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

function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
  document.querySelectorAll('.tab')[tab === 'buying' ? 0 : 1].classList.add('active');
  fetchTransactions();
}

async function confirmDelivery(transactionId) {
  const token = localStorage.getItem('authToken');
  try {
    const res = await fetch(`${API_BASE_URL}/confirm-delivery/${transactionId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    if (res.ok) {
      return data;
    } else {
      throw new Error(data.error || 'Failed to confirm delivery');
    }
  } catch (err) {
    console.error('Confirm Delivery Error:', err);
    throw err;
  }
}

async function handleConfirmDelivery(transactionId) {
  console.log('[CONFIRM DELIVERY] Clicked for transaction:', transactionId);
  // Find the button and update its state
  const confirmButton = document.querySelector(`button[onclick="handleConfirmDelivery('${transactionId}')"]`);
  if (confirmButton) {
    confirmButton.textContent = 'Processing';
    confirmButton.classList.add('processing-btn');
    confirmButton.disabled = true;
  }

  try {
    const response = await confirmDelivery(transactionId);
    console.log('[CONFIRM DELIVERY RESPONSE]', response);
    openOtpModal(transactionId, response.transferReference );
  } catch (err) {
    showToast(err.message || 'Failed to initiate delivery confirmation.');
    // Revert button state on error
    if (confirmButton) {
      confirmButton.textContent = 'Confirm Delivery';
      confirmButton.classList.remove('processing-btn');
      confirmButton.disabled = false;
    }
  }
}

async function submitOtp() {
  const otp = document.getElementById('otpInput').value;
  const transactionId = localStorage.getItem('transactionId');
  const transferReference = localStorage.getItem('transferReference') || 'TRF_taeq33dk47dzzu75';
  const submitButton = document.querySelector('#otpModal button[onclick="submitOtp()"]');

  if (!otp || !transactionId) {
    showToast('Please enter the OTP and ensure a valid transaction.');
    return;
  }

  // Update button to processing state
  if (submitButton) {
    submitButton.textContent = 'Processing';
    submitButton.classList.add('processing-btn');
    submitButton.disabled = true;
  }

  try {
    // Submit OTP to /confirm-otp
    console.log('[SUBMIT OTP] Sending to /confirm-otp:', { transactionId, otp, transferReference });
    const otpRes = await fetch(`${API_BASE_URL}/confirm-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('authToken')}`,
      },
      body: JSON.stringify({ transactionId, otp, transferReference }),
    });

    const otpData = await otpRes.json();
    console.log('[CONFIRM OTP RESPONSE]', otpData);
    if (!otpRes.ok) {
      throw new Error(otpData.error || `OTP validation failed with status ${otpRes.status}`);
    }
function openSuccessModal() {
  const successModal = document.getElementById('successModal');
  if (!successModal) {
    console.error('[OPEN SUCCESS MODAL ERROR] #successModal not found in DOM');
    showToast('Error: Success modal not found.');
    return;
  }
  successModal.style.display = 'flex';
  successModal.style.opacity = '1';
  successModal.style.visibility = 'visible';
  successModal.style.zIndex = '10000';
  console.log('[SUCCESS MODAL STYLES]', {
    display: successModal.style.display,
    opacity: successModal.style.opacity,
    visibility: successModal.style.visibility,
    zIndex: successModal.style.zIndex
  });
  // Force reflow to ensure rendering
  successModal.offsetHeight;
}

function closeSuccessModal() {
  const successModal = document.getElementById('successModal');
  if (successModal) {
    successModal.style.display = 'none';
    successModal.style.opacity = '0';
    successModal.style.visibility = 'hidden';
    console.log('[CLOSE SUCCESS MODAL]');
  }
}
    // Show success modal instead of toast
    closeOtpModal();
    openSuccessModal();
    fetchTransactions(); // Refresh transaction list
  } catch (err) {
    console.error('[OTP CONFIRMATION ERROR]', err.message);
    showToast(err.message || 'Error confirming delivery. Please try again.');
    // Revert button state on error
    if (submitButton) {
      submitButton.textContent = 'Submit OTP';
      submitButton.classList.remove('processing-btn');
      submitButton.disabled = false;
    }
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show';
  setTimeout(() => {
    toast.className = 'toast';
  }, 5000);
}

function showSnackbar(message) {
  const snackbar = document.getElementById('snackbar');
  snackbar.textContent = message;
  snackbar.classList.add('show');
  setTimeout(() => {
    snackbar.classList.remove('show');
  }, 3000);
}

function openRefundModal(transactionId) {
  localStorage.setItem('refundTransactionId', transactionId);
  document.getElementById('refundModal').style.display = 'flex';
}

function closeRefundModal() {
  document.getElementById('refundModal').style.display = 'none';
  document.getElementById('reason').value = '';
  document.getElementById('refundNote').value = '';
  document.getElementById('refundEvidence').value = '';
  localStorage.removeItem('refundTransactionId');
}

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

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    showToast(data.message || 'Refund requested successfully.');
    closeRefundModal();
    fetchTransactions();
  } catch (err) {
    console.error('Refund request error:', err);
    showToast(err.message || 'Error requesting refund. Please try again.');
  }
}

function openOtpModal(transactionId, transferReference) {
  console.log('[OPEN OTP MODAL] Transaction:', transactionId, 'Transfer Reference:', transferReference);
  localStorage.setItem('transactionId', transactionId);
  localStorage.setItem('transferReference', transferReference);
  const otpModal = document.getElementById('otpModal');
  if (!otpModal) {
    console.error('[OPEN OTP MODAL ERROR] #otpModal not found in DOM');
    showToast('Error: OTP modal not found.');
    return;
  }
  otpModal.style.display = 'flex';
  otpModal.style.opacity = '1';
  otpModal.style.visibility = 'visible';
  otpModal.style.zIndex = '10000';
  console.log('[OTP MODAL STYLES]', {
    display: otpModal.style.display,
    opacity: otpModal.style.opacity,
    visibility: otpModal.style.visibility,
    zIndex: otpModal.style.zIndex
  });
  // Force reflow to ensure rendering
  otpModal.offsetHeight;
}

function closeOtpModal() {
  const otpModal = document.getElementById('otpModal');
  if (otpModal) {
    otpModal.style.display = 'none';
    otpModal.style.opacity = '0';
    otpModal.style.visibility = 'hidden';
    document.getElementById('otpInput').value = '';
    localStorage.removeItem('transactionId');
    localStorage.removeItem('transferReference');
    console.log('[CLOSE OTP MODAL]');
  }
}

document.addEventListener('DOMContentLoaded', fetchTransactions);