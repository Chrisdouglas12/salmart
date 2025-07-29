document.addEventListener("DOMContentLoaded", function () {
  const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';

  // Function to decode JWT token and get user info
  function getLoggedInUserInfo() {
    const token = localStorage.getItem("authToken");
    if (!token) {
      console.log("No auth token found");
      return null;
    }
    try {
      // Ensure jwt_decode is accessible (it is if you load the CDN in HTML)
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

  // Cache DOM elements
  const modal = document.getElementById('profile-pic-modal');
  const closeModalBtn = document.querySelector('#profile-pic-modal .close-modal');
  const cancelBtn = document.getElementById('cancel-upload');
  const saveBtn = document.getElementById('save-profile-pic');
  const choosePhotoBtn = document.getElementById('choose-photo-btn');
  const takePhotoBtn = document.getElementById('take-photo-btn');
  const imagePreview = document.getElementById('image-preview');
  const fileInput = document.getElementById('profile-picture-upload'); // This is your ONE source of file input

  // State management
  let selectedFile = null;
  let isUploading = false;

  // Validate file function
  function validateFile(file) {
    if (!file.type.startsWith('image/')) {
      window.showToast('Please select an image file', '#e74c3c');
      return false;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      window.showToast('File size must be less than 5MB', '#e74c3c');
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
    reader.onload = function (event) {
      imagePreview.src = event.target.result;
      saveBtn.disabled = false; // Enable save button only after a valid image is selected
    };

    reader.onerror = function () {
      window.showToast('Failed to read image file', '#e74c3c');
      resetFileInput();
    };

    reader.readAsDataURL(file);
  }

  // Reset file input and state
  function resetFileInput() {
    if (fileInput) fileInput.value = ''; // Clear the selected file
    selectedFile = null;
    if (imagePreview) imagePreview.src = 'default-avatar.png'; // Reset preview
    if (saveBtn) saveBtn.disabled = true; // Disable save button
    // Ensure any other relevant buttons or states are reset if needed
  }

  // Close modal function
  function closeModal() {
    if (isUploading) return; // Prevent closing if an upload is in progress
    if (modal) modal.classList.remove('show');
    resetFileInput(); // Always reset when closing
  }

  // Open modal when clicking the camera icon
  const fileInputIcon = document.querySelector('.file-input-icon');
  if (fileInputIcon && isOwnProfile) {
    fileInputIcon.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (modal) modal.classList.add('show');
      resetFileInput(); // Reset when opening the modal
    });
  }

  // Modal event listeners
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // Choose photo handler: This now correctly triggers the ONE file input
  if (choosePhotoBtn && fileInput) {
    choosePhotoBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click(); // Opens the file picker
    });
  }

  // File input change handler: Processes the selected file
  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      e.stopPropagation();
      const files = e.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    }, { passive: true }); // Use passive listener for performance if not preventing default
  }

  // Take photo button (stub)
  if (takePhotoBtn) {
    takePhotoBtn.addEventListener('click', function () {
      window.showToast('Camera functionality would be implemented here', '#2196F3'); // Use global toast
    });
  }

  // Save button handler
  if (saveBtn) {
    saveBtn.addEventListener('click', async function () {
      if (isUploading) return;
      if (!isOwnProfile) {
        console.warn('Non-owner attempted to save profile picture');
        window.showToast('You can only update your own profile picture', '#e74c3c');
        return;
      }
      if (!selectedFile) {
        window.showToast('Please select a file first', '#e74c3c');
        return;
      }

      isUploading = true;
      saveBtn.classList.add('uploading');
      saveBtn.disabled = true;

      try {
        const formData = new FormData();
        formData.append('profilePicture', selectedFile);

        const token = localStorage.getItem('authToken');
        if (!token) throw new Error('Authentication token not found. Please log in again.');

        const response = await fetch(`${API_BASE_URL}/upload-profile-picture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Upload failed');

        const profilePic = document.getElementById('profile-picture');
        const profilePic1 = document.getElementById('profile-picture1');

        // Update the image sources, add a cache-busting parameter
        if (profilePic) profilePic.src = `${data.profilePicture}?t=${Date.now()}`;
        if (profilePic1) profilePic1.src = `${data.profilePicture}?t=${Date.now()}`;

        closeModal();
        window.showToast('Profile picture updated successfully!', '#2ecc71');

      } catch (error) {
        console.error('Upload error:', error);
        window.showToast(error.message || 'Failed to upload profile picture', '#e74c3c');
      } finally {
        isUploading = false;
        saveBtn.classList.remove('uploading');
        saveBtn.disabled = false;
      }
    });
  }
});
