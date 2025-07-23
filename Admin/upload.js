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

  // Cache DOM elements
  const modal = document.getElementById('profile-pic-modal');
  const closeModalBtn = document.querySelector('#profile-pic-modal .close-modal');
  const cancelBtn = document.getElementById('cancel-upload');
  const saveBtn = document.getElementById('save-profile-pic');
  const choosePhotoBtn = document.getElementById('choose-photo-btn');
  const takePhotoBtn = document.getElementById('take-photo-btn');
  const imagePreview = document.getElementById('image-preview');
  const fileInput = document.getElementById('profile-picture-upload');
  
  // State management
  let selectedFile = null;
  let isUploading = false;

  // Validate file function
  function validateFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', '#e74c3c');
      return false;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be less than 5MB', '#e74c3c');
      return false;
    }
    
    return true;
  }

  // Process selected file
  function processFile(file) {
    if (!validateFile(file)) {
      resetFileInput();
      return;
    }

    selectedFile = file;
    
    const reader = new FileReader();
    reader.onload = function(event) {
      imagePreview.src = event.target.result;
      enableEditButtons();
    };
    
    reader.onerror = function() {
      showToast('Failed to read image file', '#e74c3c');
      resetFileInput();
    };
    
    reader.readAsDataURL(file);
  }

  // Enable edit buttons
  function enableEditButtons() {
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.disabled = false;
    });
    saveBtn.disabled = false;
  }

  // Reset file input and state
  function resetFileInput() {
    fileInput.value = '';
    selectedFile = null;
    imagePreview.src = '';
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.disabled = true;
    });
    saveBtn.disabled = true;
  }

  // Close modal function
  function closeModal() {
    if (isUploading) return; // Prevent closing during upload
    
    modal.classList.remove('show');
    resetFileInput();
  }

  // Open modal when clicking the camera icon (only for owners)
  if (fileInputIcon && isOwnProfile) {
    fileInputIcon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      modal.classList.add('show');
    });
  }

  // Modal event listeners
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  // Click on overlay closes modal
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // Choose photo handler - Simplified and more reliable
  if (choosePhotoBtn && fileInput) {
    choosePhotoBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Reset input to ensure change event fires even for same file
      fileInput.value = '';
      fileInput.click();
    });
  }

  // File input change handler - Optimized
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      e.stopPropagation();
      
      const files = e.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    }, { passive: true });
  }

  // Take photo handler
  if (takePhotoBtn) {
    takePhotoBtn.addEventListener('click', function() {
      showToast('Camera functionality would be implemented here');
    });
  }

  // Save button handler - Optimized with better error handling
  if (saveBtn) {
    saveBtn.addEventListener('click', async function() {
      if (isUploading) return; // Prevent double uploads
      
      if (!isOwnProfile) {
        console.warn('Non-owner attempted to save profile picture');
        showToast('You can only update your own profile picture', '#e74c3c');
        return;
      }

      if (!selectedFile) {
        showToast('Please select a file first', '#e74c3c');
        return;
      }

      // Set uploading state
      isUploading = true;
      saveBtn.classList.add('uploading');
      saveBtn.disabled = true;

      try {
        // Create FormData to send the file
        const formData = new FormData();
        formData.append('profilePicture', selectedFile);

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

        // Update profile pictures in the DOM
        const profilePic = document.getElementById('profile-picture');
        const profilePic1 = document.getElementById('profile-picture1');
        
        if (profilePic) {
          profilePic.src = data.profilePicture;
          // Add timestamp to force browser to refresh cached image
          profilePic.src += '?t=' + Date.now();
        }
        if (profilePic1) {
          profilePic1.src = data.profilePicture;
          profilePic1.src += '?t=' + Date.now();
        }

        // Close modal
        closeModal();

        // Show success message
        showToast('Profile picture updated successfully!', '#2ecc71');

      } catch (error) {
        console.error('Upload error:', error);
        showToast(error.message || 'Failed to upload profile picture', '#e74c3c');
      } finally {
        // Reset uploading state
        isUploading = false;
        saveBtn.classList.remove('uploading');
        saveBtn.disabled = false;
      }
    });
  }

  // Toast notification function
  function showToast(message, bgColor = '#333') {
    // Remove existing toasts to prevent spam
    const existingToasts = document.querySelectorAll('.toast-message');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement("div");
    toast.className = "toast-message show";
    toast.style.backgroundColor = bgColor;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 5px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
      toast.style.transform = 'translateX(0)';
    }, 10);

    // Remove toast after 3 seconds
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }, 3000);
  }
});