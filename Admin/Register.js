// ------------------------
// Toggle Password Visibility
// ------------------------
function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);

  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

document.getElementById('togglePassword').addEventListener('click', () => {
  togglePasswordVisibility('password', 'togglePassword');
});
document.getElementById('toggleCPassword').addEventListener('click', () => {
  togglePasswordVisibility('cpassword', 'toggleCPassword');
});

// ------------------------
// Show Status Message
// ------------------------
function showStatus(type, message) {
  const statusDiv = document.getElementById('accountStatus');
  const iconMap = {
    verified: 'fa-check-circle',
    error: 'fa-times-circle',
    loading: 'fa-spinner fa-spin'
  };

  statusDiv.innerHTML = `
    <div class="status-indicator ${type}">
      <i class="fas ${iconMap[type]}"></i>
      <span>${message}</span>
    </div>
  `;
}

// ------------------------
// Success Modal
// ------------------------
function showSuccessModal(userEmail) {
  // Create modal overlay
  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 20px;
    padding: 40px 30px;
    max-width: 450px;
    width: 90%;
    text-align: center;
    color: white;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    position: relative;
    animation: slideUp 0.4s ease-out;
    transform: translateY(0);
  `;

  modalContent.innerHTML = `
    <div style="margin-bottom: 25px;">
      <div style="
        width: 80px;
        height: 80px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
        backdrop-filter: blur(10px);
        border: 2px solid rgba(255, 255, 255, 0.3);
      ">
        <i class="fas fa-check" style="font-size: 35px; color: #4ade80;"></i>
      </div>
      <h2 style="
        margin: 0 0 15px;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.5px;
      ">Account Created Successfully!</h2>
      <p style="
        margin: 0 0 25px;
        font-size: 16px;
        opacity: 0.9;
        line-height: 1.5;
      ">
        Welcome to SalMart! Your account has been created successfully.<br>
        We've sent a verification code to <strong>${userEmail}</strong>
      </p>
    </div>
    
    <div style="
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      margin: 25px 0;
      border: 1px solid rgba(255, 255, 255, 0.2);
    ">
      <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 15px;">
        <i class="fas fa-envelope" style="font-size: 20px; color: #fbbf24;"></i>
        <span style="font-weight: 600; font-size: 16px;">Next Step</span>
      </div>
      <p style="margin: 0; font-size: 14px; opacity: 0.9; line-height: 1.4;">
        Check your email and enter the verification code to activate your account and start shopping!
      </p>
    </div>

    <button id="proceedBtn" style="
      background: linear-gradient(135deg, #4ade80, #22c55e);
      border: none;
      border-radius: 12px;
      padding: 15px 40px;
      color: white;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 8px 20px rgba(34, 197, 94, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin: 0 auto;
      min-width: 180px;
    " 
    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 25px rgba(34, 197, 94, 0.4)'"
    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 20px rgba(34, 197, 94, 0.3)'">
      <span>Proceed to Verification</span>
      <i class="fas fa-arrow-right"></i>
    </button>
  `;

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(30px) scale(0.95);
      }
      to { 
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;
  document.head.appendChild(style);

  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // Handle proceed button click
  document.getElementById('proceedBtn').addEventListener('click', () => {
    modalOverlay.style.animation = 'fadeOut 0.3s ease-out forwards';
    modalContent.style.animation = 'slideDown 0.3s ease-out forwards';
    
    // Add fadeOut animation
    const fadeOutStyle = document.createElement('style');
    fadeOutStyle.textContent = `
      @keyframes fadeOut {
        to { opacity: 0; }
      }
      @keyframes slideDown {
        to { 
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
      }
    `;
    document.head.appendChild(fadeOutStyle);
    
    setTimeout(() => {
      document.body.removeChild(modalOverlay);
      window.location.href = 'verify.html';
    }, 300);
  });

  // Prevent modal from closing when clicking on content
  modalContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// ------------------------
// Fetch Bank List
// ------------------------
let allBanks = [];

async function fetchBankList() {
  const API = getAPI();
  try {
    const res = await fetch(`${API}/banks`);
    const data = await res.json();
    allBanks = data.banks;

    const bankSelect = document.getElementById('bankList');
    allBanks.forEach(bank => {
      const option = document.createElement('option');
      option.value = bank.code;
      option.textContent = bank.name;
      bankSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Bank list fetch error:', err);
    showStatus('error', 'Failed to load banks');
  }
}

// ------------------------
// Resolve Account Name
// ------------------------
async function resolveAccount() {
  const accNum = document.getElementById('accountNumber').value.trim();
  const bankCode = document.getElementById('bankList').value;
  const accNameField = document.getElementById('accountName');
  const bankCodeField = document.getElementById('bankCode');

  if (accNum.length < 10 || !bankCode) {
    accNameField.value = '';
    bankCodeField.value = '';
    document.getElementById('accountStatus').innerHTML = '';
    return;
  }

  showStatus('loading', 'Verifying account...');

  try {
    const API = getAPI();
    const res = await fetch(`${API}/resolve-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_number: accNum, bank_code: bankCode })
    });

    const data = await res.json();

    if (res.ok && data.account_name) {
      accNameField.value = data.account_name;
      bankCodeField.value = bankCode;
      showStatus('verified', 'Account verified');
    } else {
      accNameField.value = '';
      bankCodeField.value = '';
      showStatus('error', data.message || 'Invalid account');
    }
  } catch (err) {
    console.error('Resolve error:', err);
    accNameField.value = '';
    bankCodeField.value = '';
    showStatus('error', 'Verification failed');
  }
}

document.getElementById('accountNumber').addEventListener('blur', resolveAccount);
document.getElementById('bankList').addEventListener('change', resolveAccount);

// ------------------------
// Fetch States & Cities
// ------------------------
async function fetchStatesAndCities() {
  try {
    const API = getAPI();
    const res = await fetch(`${API}/states-lgas`);
    const statesData = await res.json();

    const stateSelect = document.getElementById('state');
    const citySelect = document.getElementById('city');

    statesData.forEach(state => {
      const option = document.createElement('option');
      option.value = state.state;
      option.textContent = state.state;
      stateSelect.appendChild(option);
    });

    stateSelect.addEventListener('change', () => {
      const selectedState = statesData.find(s => s.state === stateSelect.value);
      citySelect.innerHTML = '<option value="">Select City</option>';

      selectedState?.lgas.forEach(lga => {
        const option = document.createElement('option');
        option.value = lga;
        option.textContent = lga;
        citySelect.appendChild(option);
      });
    });
  } catch (err) {
    console.error('States & LGAs fetch error:', err);
    alert('Failed to load states and cities');
  }
}

// ------------------------
// Form Validation
// ------------------------
function validateForm() {
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('cpassword').value;
  const accept = document.getElementById('acceptTerms').checked;
  const verified = document.getElementById('accountStatus').querySelector('.status-indicator.verified');

  if (password !== confirm) return alert('Passwords do not match');
  if (!accept) return alert('You must accept the Terms & Conditions');
  if (!verified) return alert('Please verify your bank account');

  return true;
}

// ------------------------
// Handle Form Submit
// ------------------------
document.getElementById('registrationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const btn = document.getElementById('submitBtn');
  const text = document.getElementById('btnText');
  const spinner = document.getElementById('btnSpinner');

  text.textContent = 'Creating Account...';
  spinner.style.display = 'block';
  btn.disabled = true;

  const user = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phoneNumber: document.getElementById('phoneNumber').value.trim(),
    password: document.getElementById('password').value,
    state: document.getElementById('state').value,
    city: document.getElementById('city').value,
    accountNumber: document.getElementById('accountNumber').value.trim(),
    bankCode: document.getElementById('bankList').value,
    accountName: document.getElementById('accountName').value
  };

  try {
    const API = getAPI();
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });

    const data = await res.json();

    if (res.ok) {
      if (data.token) localStorage.setItem('authToken', data.token);
      if (data.userId) localStorage.setItem('userId', data.userId);
      
      // Store the email for resend functionality
      localStorage.setItem('pending_email', user.email);
      
      // Show success modal instead of direct redirect
      showSuccessModal(user.email);
      
    } else {
      alert(data.message || 'Registration failed');
    }
  } catch (err) {
    console.error('Register error:', err);
    alert('Something went wrong. Try again.');
  } finally {
    text.textContent = 'Create Account';
    spinner.style.display = 'none';
    btn.disabled = false;
  }
});
 
// ------------------------
// Helpers
// ------------------------
function getAPI() {
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com';
}

// ------------------------
// On Page Load
// ------------------------
document.addEventListener('DOMContentLoaded', () => {
  fetchBankList();
  fetchStatesAndCities();

  document.querySelectorAll('.input-field').forEach(input => {
    input.addEventListener('focus', () => input.parentElement.classList.add('focused'));
    input.addEventListener('blur', () => input.parentElement.classList.remove('focused'));
  });
});

// Prevent Enter key from submitting
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
  }
});