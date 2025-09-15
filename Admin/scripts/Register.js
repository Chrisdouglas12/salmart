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
    background-color: #fff;
    border-radius: 20px;
    padding: 40px 30px;
    max-width: 450px;
    width: 90%;
    text-align: center;
    color: #28a745;
    box-shadow: 0 0 10px #ddd;
    position: relative;
    animation: slideUp 0.4s ease-out;
    transform: translateY(0);
  `;

  modalContent.innerHTML = `
    <div style="margin-bottom: 25px;">
      <div style="
        width: 80px;
        height: 80px;
        background: #fff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
        backdrop-filter: blur(10px);
        border: 2px solid #28a745;
      ">
        <i class="fas fa-check" style="font-size: 35px; color: #28a745;"></i>
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
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      margin: 25px 0;
      border: 1px solid #28a745;
    ">
      <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 15px;">
        <i class="fas fa-envelope" style="font-size: 20px; color: #28a745;"></i>
        <span style="font-weight: 600; font-size: 16px;">Next Step</span>
      </div>
      <p style="margin: 0; font-size: 14px; opacity: 0.9; line-height: 1.4;">
        Check your email and enter the verification code to activate your account and start shopping!
      </p>
    </div>

    <button id="proceedBtn" style="
      background: #28a745;
      border: none;
      border-radius: 12px;
      padding: 15px 40px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 8px 20px rgba(40, 167, 69, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin: 0 auto;
      min-width: 180px;
    " 
    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 25px rgba(40, 167, 69, 0.4)'"
    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 20px rgba(40, 167, 69, 0.3)'">
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
// Form Validation (Simplified)
// ------------------------
function validateForm() {
  const password = document.getElementById('password').value;
  const accept = document.getElementById('acceptTerms').checked;
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const email = document.getElementById('email').value.trim();
  const phoneNumber = document.getElementById('phoneNumber').value.trim();

  if (!firstName || !lastName) {
    alert('Please enter your first and last name');
    return false;
  }

  if (!email || !email.includes('@')) {
    alert('Please enter a valid email address');
    return false;
  }

  if (!phoneNumber || phoneNumber.length < 10) {
    alert('Please enter a valid phone number');
    return false;
  }

  if (!password || password.length < 6) {
    alert('Password must be at least 6 characters long');
    return false;
  }

  if (!accept) {
    alert('You must accept the Terms & Conditions');
    return false;
  }

  return true;
}

// ------------------------
// Handle Form Submit
// ------------------------
document.getElementById('quickRegistrationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const btn = document.getElementById('submitBtn');
  const text = document.getElementById('btnText');
  const spinner = document.getElementById('btnSpinner');

  text.textContent = 'Creating Account...';
  spinner.style.display = 'block';
  btn.disabled = true;

  // Simplified user object for quick registration
  const user = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phoneNumber: document.getElementById('phoneNumber').value.trim(),
    password: document.getElementById('password').value,
    // Optional fields - can be null/undefined for quick registration
    state: null,
    city: null,
    accountNumber: null,
    bankCode: null,
    accountName: null
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
    text.textContent = 'Create Account & Start Trading';
    spinner.style.display = 'none';
    btn.disabled = false;
  }
});
 
// ------------------------
// Phone Number Formatting
// ------------------------
function formatPhoneNumber() {
  const phoneInput = document.getElementById('phoneNumber');
  phoneInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) {
      value = value.slice(0, 11);
    }
    e.target.value = value;
  });
}

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
  // Initialize phone number formatting
  formatPhoneNumber();

  // Add focus/blur effects to input fields
  document.querySelectorAll('.input-field').forEach(input => {
    input.addEventListener('focus', () => {
      if (input.parentElement) {
        input.parentElement.classList.add('focused');
      }
    });
    
    input.addEventListener('blur', () => {
      if (input.parentElement) {
        input.parentElement.classList.remove('focused');
      }
    });
  });
});

// Prevent Enter key from submitting (except on submit button)
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
  }
});