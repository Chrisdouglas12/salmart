document.addEventListener("DOMContentLoaded", async function () {
  // Set API base URL
  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://salmart.onrender.com';

  // Function to decode JWT token and get user info
  function getLoggedInUserInfo() {
    const token = localStorage.getItem("authToken");
    if (!token) {
      console.log("No auth token found");
      return null;
    }
    try {
      const decoded = jwt_decode(token);
      console.log("Decoded token:", decoded);
      return decoded;
    } catch (error) {
      console.error("Error decoding token:", error);
      return null;
    }
  }

  // Get profile owner ID from URL or logged-in user
  const urlParams = new URLSearchParams(window.location.search);
  let profileOwnerId = urlParams.get('userId');
  const userInfo = getLoggedInUserInfo();
  const isOwnProfile = !profileOwnerId || (userInfo && profileOwnerId === userInfo.userId);

  // If no profileOwnerId in URL, use logged-in user's ID
  if (!profileOwnerId && userInfo) {
    profileOwnerId = userInfo.userId;
  }

const openBtn = document.createElement("button");
openBtn.innerHTML = '<i class="fas fa-university"></i> Update Bank Details';
openBtn.className = "bank-button";
openBtn.style.marginTop = "10px";
openBtn.type = "button"; // Prevent form submit reload

  // Only append and show button for profile owner
  const uploadForm = document.getElementById("upload-form");
  if (uploadForm && isOwnProfile) {
    uploadForm.appendChild(openBtn);
  } else {
    if (!uploadForm) {
      console.warn('Upload form (#upload-form) not found in DOM');
    }
    if (!isOwnProfile) {
      console.log('Hiding bank details button for non-owner profile');
    }
  }

  // DOM elements for bottom sheet
  const overlay = document.getElementById("overlay");
  const bottomSheet = document.getElementById("bottom-sheet");
  const closeBtn = document.getElementById("close-sheet");
  const bankNameInput = document.getElementById("bankName");
  const bankCodeInput = document.getElementById("bankCode");
  const accountNumberInput = document.getElementById("accountNumber");
  const accountNameInput = document.getElementById("accountName");

  // Verify DOM elements exist
  if (!overlay || !bottomSheet || !closeBtn || !bankNameInput || !bankCodeInput || !accountNumberInput || !accountNameInput) {
    console.error('One or more bottom sheet elements not found');
    return;
  }

  // Show bottom sheet and autofill form
  openBtn.addEventListener("click", async () => {
    if (!isOwnProfile) {
      console.warn('Non-owner attempted to access bank details form');
      return;
    }

    bottomSheet.style.bottom = "0";
    overlay.style.display = "block";

    const token = localStorage.getItem("authToken");
    if (!token) {
      showToast("You are not logged in. Please log in to update bank details.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/get-bank-details`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (res.ok && data.success && data.bankDetails) {
        bankNameInput.value = data.bankDetails.bankName || "";
        accountNumberInput.value = data.bankDetails.accountNumber || "";
        bankCodeInput.value = data.bankDetails.bankCode || "";
        accountNameInput.value = data.bankDetails.accountName || "";
      } else {
        bankNameInput.value = "";
        accountNumberInput.value = "";
        bankCodeInput.value = "";
        accountNameInput.value = "";
      }
    } catch (err) {
      console.error("Error loading bank details:", err);
      showToast("Error loading bank details: " + err.message);
    }
  });

  // Close bottom sheet
  const closeSheet = () => {
    bottomSheet.style.bottom = "-100%";
    overlay.style.display = "none";
  };

  closeBtn.addEventListener("click", closeSheet);
  overlay.addEventListener("click", closeSheet);

  // Handle form submit
  document.getElementById("bank-details-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!isOwnProfile) {
      console.warn('Non-owner attempted to submit bank details form');
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      showToast("You are not logged in. Please log in to update bank details.");
      return;
    }

    const bankName = bankNameInput.value.trim();
    const accountNumber = accountNumberInput.value.trim();
    const accountName = accountNameInput.value.trim();
    const bankCode = bankCodeInput.value.trim();

    try {
      const res = await fetch(`${API_BASE_URL}/update-bank-details`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ bankName, accountNumber, accountName, bankCode }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        showToast("Bank details updated successfully!", '#2ecc71');
        closeSheet();
      } else {
        showToast("Failed to update: " + result.message, '#e74c3c');
      }
    } catch (err) {
      console.error("Error updating bank details:", err);
      showToast("Something went wrong: " + err.message, '#e74c3c');
    }
  });

  // Toast notification function (aligned with other scripts)
  function showToast(message, bgColor = '#333') {
    let toast = document.createElement("div");
    toast.className = "toast-message show";
    toast.style.backgroundColor = bgColor;
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // Debug review count (for integration with reviews.js)
  const reviewsCountEl = document.getElementById("reviews-count");
  if (reviewsCountEl) {
    console.log('Initial reviews count element:', reviewsCountEl.textContent);
  }
});