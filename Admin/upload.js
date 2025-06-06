document.addEventListener("DOMContentLoaded", function() {
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

  // Show file-input-icon for owners
  const fileInputIcon = document.querySelector('.file-input-icon');
  if (fileInputIcon && isOwnProfile) {
    fileInputIcon.classList.add('show');
    console.log('Showing profile picture upload icon for owner profile');
  } else if (!fileInputIcon) {
    console.warn('File input icon (.file-input-icon) not found in DOM');
  } else {
    console.log('Profile picture upload icon remains hidden for non-owner profile');
  }

  const modal = document.getElementById('profile-pic-modal');
  const closeModalBtn = document.querySelector('#profile-pic-modal .close-modal');
  const cancelBtn = document.getElementById('cancel-upload');
  const saveBtn = document.getElementById('save-profile-pic');
  const choosePhotoBtn = document.getElementById('choose-photo-btn');
  const takePhotoBtn = document.getElementById('take-photo-btn');
  const imagePreview = document.getElementById('image-preview');
  const fileInput = document.getElementById('profile-picture-upload');

  // Open modal when clicking the camera icon (only for owners)
  if (fileInputIcon && isOwnProfile) {
    fileInputIcon.addEventListener('click', function(e) {
      e.preventDefault();
      modal.classList.add('show');
    });
  }

  // Close modal handlers
  function closeModal() {
    modal.classList.remove('show');
    // Reset the form when closing
    fileInput.value = '';
    imagePreview.src = '';
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.disabled = true;
    });
    saveBtn.disabled = true;
  }

  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Click on overlay closes modal
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Choose photo handler
  choosePhotoBtn.addEventListener('click', function() {
    fileInput.click();
  });

  // File input change handler
  fileInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', '#e74c3c');
        return;
      }
      
      // Validate file size (e.g., max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showToast('File size must be less than 5MB', '#e74c3c');
        return;
      }

      const reader = new FileReader();

      reader.onload = function(event) {
        imagePreview.src = event.target.result;
        // Enable editing buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
          btn.disabled = false;
        });
        saveBtn.disabled = false;
      };

      reader.readAsDataURL(file);
    }
  });

  // Take photo handler (would need more implementation for actual camera access)
  takePhotoBtn.addEventListener('click', function() {
    showToast('Camera functionality would be implemented here');
  });

  // Save button handler - NOW WITH ACTUAL BACKEND UPLOAD
  saveBtn.addEventListener('click', async function() {
    if (!isOwnProfile) {
      console.warn('Non-owner attempted to save profile picture');
      showToast('You can only update your own profile picture', '#e74c3c');
      return;
    }

    const file = fileInput.files[0];
    
    if (!file) {
      showToast('Please select a file first', '#e74c3c');
      return;
    }

    // Show loading state
    saveBtn.classList.add('uploading');
    saveBtn.disabled = true;

    try {
      // Create FormData to send the file
      const formData = new FormData();
      formData.append('profilePicture', file);

      // Get auth token for the request
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }

      console.log('Uploading profile picture...');
      
      const response = await fetch(`${API_BASE_URL}/upload-profile-picture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      console.log('Profile picture uploaded successfully:', data.profilePicture);

      // Update profile picture with the URL returned from backend
      const profilePic = document.getElementById('profile-picture');
      const profilePic1 = document.getElementById('profile-picture1');
      if (profilePic) profilePic.src = data.profilePicture;
      if (profilePic1) profilePic1.src = data.profilePicture;

      // Close modal
      closeModal();

      // Show success message
      showToast('Profile picture updated successfully!', '#2ecc71');

    } catch (error) {
      console.error('Upload error:', error);
      showToast(error.message || 'Failed to upload profile picture', '#e74c3c');
    } finally {
      // Hide loading state
      saveBtn.classList.remove('uploading');
      saveBtn.disabled = false;
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
});