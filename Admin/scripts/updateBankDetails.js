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
  openBtn.innerHTML = '<i class="fas fa-gear"></i> Account Settings';
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
      console.log('Hiding profile completion button for non-owner profile');
    }
  }

  // DOM elements for bottom sheet
  const overlay = document.getElementById("overlay");
  const bottomSheet = document.getElementById("bottom-sheet");
  const closeBtn = document.getElementById("close-sheet");
  
  // Bank details elements
  const bankNameInput = document.getElementById("bankName");
  const bankCodeInput = document.getElementById("bankCode");
  const accountNumberInput = document.getElementById("accountNumber");
  const accountNameInput = document.getElementById("accountName");
  const bankListSelect = document.getElementById("bankList");
  
  // Location elements
  const stateSelect = document.getElementById("state");
  const citySelect = document.getElementById("city");

  // Get the new password input field
  const passwordInput = document.getElementById("password");

  // Verify DOM elements exist
  if (!overlay || !bottomSheet || !closeBtn || !bankNameInput || !bankCodeInput || !accountNumberInput || !accountNameInput || !passwordInput) {
    console.error('One or more bottom sheet elements not found');
    return;
  }

  // Store all banks data
  let allBanks = [];

  // ------------------------
  // Fetch Bank List
  // ------------------------
  async function fetchBankList() {
    try {
      const res = await fetch(`${API_BASE_URL}/banks`);
      const data = await res.json();
      allBanks = data.banks;

      if (bankListSelect) {
        // Clear existing options
        bankListSelect.innerHTML = '<option value="">Choose your bank</option>';
        
        allBanks.forEach(bank => {
          const option = document.createElement('option');
          option.value = bank.code;
          option.textContent = bank.name;
          option.setAttribute('data-bank-name', bank.name);
          bankListSelect.appendChild(option);
        });
      }
    } catch (err) {
      console.error('Bank list fetch error:', err);
      showToast('Failed to load banks', '#e74c3c');
    }
  }

  // ------------------------
  // Fetch States & Cities
  // ------------------------
  async function fetchStatesAndCities() {
    try {
      const res = await fetch(`${API_BASE_URL}/states-lgas`);
      const statesData = await res.json();

      if (stateSelect) {
        // Clear existing options
        stateSelect.innerHTML = '<option value="">Select State</option>';
        
        statesData.forEach(state => {
          const option = document.createElement('option');
          option.value = state.state;
          option.textContent = state.state;
          stateSelect.appendChild(option);
        });

        // Handle state change
        stateSelect.addEventListener('change', () => {
          const selectedState = statesData.find(s => s.state === stateSelect.value);
          
          if (citySelect) {
            citySelect.innerHTML = '<option value="">Select City</option>';

            if (selectedState) {
              selectedState.lgas.forEach(lga => {
                const option = document.createElement('option');
                option.value = lga;
                option.textContent = lga;
                citySelect.appendChild(option);
              });
            }
          }
        });
      }
    } catch (err) {
      console.error('States & LGAs fetch error:', err);
      showToast('Failed to load states and cities', '#e74c3c');
    }
  }

  // ------------------------
  // Resolve Account Name
  // ------------------------
  async function resolveAccount() {
    const accNum = accountNumberInput.value.trim();
    const bankCode = bankListSelect ? bankListSelect.value : bankCodeInput.value;

    if (accNum.length < 10 || !bankCode) {
      accountNameInput.value = '';
      return;
    }

    // Show loading state
    accountNameInput.value = 'Verifying...';
    accountNameInput.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/resolve-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_number: accNum, bank_code: bankCode })
      });

      const data = await res.json();

      if (res.ok && data.account_name) {
        accountNameInput.value = data.account_name;
        bankCodeInput.value = bankCode;
        
        // Set bank name from selected option
        if (bankListSelect) {
          const selectedOption = bankListSelect.querySelector(`option[value="${bankCode}"]`);
          if (selectedOption) {
            bankNameInput.value = selectedOption.getAttribute('data-bank-name');
          }
        }
        
        showToast('Account verified successfully', '#28a745');
      } else {
        accountNameInput.value = '';
        bankCodeInput.value = '';
        showToast(data.message || 'Invalid account details', '#e74c3c');
      }
    } catch (err) {
      console.error('Resolve error:', err);
      accountNameInput.value = '';
      bankCodeInput.value = '';
      showToast('Account verification failed', '#e74c3c');
    } finally {
      accountNameInput.disabled = false;
    }
  }

  // Add event listeners for account resolution
  if (accountNumberInput) {
    accountNumberInput.addEventListener('blur', resolveAccount);
  }
  
  if (bankListSelect) {
    bankListSelect.addEventListener('change', resolveAccount);
  }

  // Show bottom sheet and autofill form
  openBtn.addEventListener("click", async () => {
    if (!isOwnProfile) {
      console.warn('Non-owner attempted to access profile completion form');
      return;
    }

    bottomSheet.style.bottom = "0";
    overlay.style.display = "block";

    const token = localStorage.getItem("authToken");
    if (!token) {
      showToast("You are not logged in. Please log in to complete your profile.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/get-profile-details`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Fill bank details
        if (data.bankDetails) {
          bankNameInput.value = data.bankDetails.bankName || "";
          accountNumberInput.value = data.bankDetails.accountNumber || "";
          bankCodeInput.value = data.bankDetails.bankCode || "";
          accountNameInput.value = data.bankDetails.accountName || "";
          
          if (bankListSelect && data.bankDetails.bankCode) {
            bankListSelect.value = data.bankDetails.bankCode;
          }
        }
        
        // Fill location details
        if (data.locationDetails) {
          if (stateSelect) stateSelect.value = data.locationDetails.state || "";
          if (citySelect) citySelect.value = data.locationDetails.city || "";
          
          // Trigger state change to populate cities if state is selected
          if (data.locationDetails.state && stateSelect) {
            stateSelect.dispatchEvent(new Event('change'));
            // Set city after a small delay to allow cities to populate
            setTimeout(() => {
              if (citySelect && data.locationDetails.city) {
                citySelect.value = data.locationDetails.city;
              }
            }, 100);
          }
        }
      } else {
        // Clear all fields if no data
        bankNameInput.value = "";
        accountNumberInput.value = "";
        bankCodeInput.value = "";
        accountNameInput.value = "";
        if (bankListSelect) bankListSelect.value = "";
        if (stateSelect) stateSelect.value = "";
        if (citySelect) citySelect.value = "";
      }
    } catch (err) {
      console.error("Error loading profile details:", err);
      showToast("Error loading profile details: " + err.message);
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
  document.getElementById("profile-completion-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!isOwnProfile) {
      console.warn('Non-owner attempted to submit profile completion form');
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      showToast("You are not logged in. Please log in to complete your profile.", '#e74c3c');
      return;
    }

    // Validate required fields
    const bankName = bankNameInput.value.trim();
    const accountNumber = accountNumberInput.value.trim();
    const accountName = accountNameInput.value.trim();
    const bankCode = bankCodeInput.value.trim();
    const state = stateSelect ? stateSelect.value : '';
    const city = citySelect ? citySelect.value : '';
    const password = passwordInput.value.trim(); // Get the password value

    if (!accountNumber || !accountName || !bankCode) {
      showToast("Please complete all bank details", '#e74c3c');
      return;
    }

    if (!state || !city) {
      showToast("Please select your state and city", '#e74c3c');
      return;
    }
    
    // Check if password is empty
    if (!password) {
      showToast("Please enter your password to confirm", '#e74c3c');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/complete-profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          bankName, 
          accountNumber, 
          accountName, 
          bankCode,
          state,
          city,
          password // Include the password in the body
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        showToast("Profile completed successfully!", '#28a745');
        closeSheet();
        
      } else {
        // Handle incorrect password specifically
        if (res.status === 401 && result.message.includes("Incorrect password")) {
          showToast(result.message, '#e74c3c');
          passwordInput.value = ''; // Clear password field
        } else {
          showToast("Failed to update: " + result.message, '#e74c3c');
        }
      }
    } catch (err) {
      console.error("Error completing profile:", err);
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

  // Initialize data fetching
  await fetchBankList();
  await fetchStatesAndCities();

  // Debug review count (for integration with reviews.js)
  const reviewsCountEl = document.getElementById("reviews-count");
  if (reviewsCountEl) {
    console.log('Initial reviews count element:', reviewsCountEl.textContent);
  }
});