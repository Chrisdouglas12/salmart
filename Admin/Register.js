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
       if (data.userId) localStorage.setItem('pending_email', data.pendingEmail);
       
      window.location.href = 'verify.html';
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