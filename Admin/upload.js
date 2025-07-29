document.addEventListener("DOMContentLoaded", function () {
  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com';

  // Helper: Decode JWT token
  function getLoggedInUserInfo() {
    const token = localStorage.getItem("authToken");
    if (!token) return null;
    try {
      return jwt_decode(token);
    } catch (error) {
      console.error("Error decoding token:", error);
      return null;
    }
  }

  // Cache elements
  const modal = document.getElementById('profile-pic-modal');
  const fileInputIcon = document.querySelector('.file-input-icon');
  const closeModalBtn = document.querySelector('#profile-pic-modal .close-modal');
  const cancelBtn = document.getElementById('cancel-upload');
  const saveBtn = document.getElementById('save-profile-pic');
  const choosePhotoBtn = document.getElementById('choose-photo-btn');
  const takePhotoBtn = document.getElementById('take-photo-btn');
  const imagePreview = document.getElementById('image-preview');
  const fileInput = document.getElementById('profile-picture-upload');
  const profilePic = document.getElementById('profile-picture');
  const profilePic1 = document.getElementById('profile-picture1');

  // State
  let selectedFile = null;
  let isUploading = false;

  // Validate image
  function validateFile(file) {
    if (!file.type.startsWith('image/')) {
      window.showToast('Please select an image file', '#e74c3c');
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      window.showToast('File size must be less than 5MB', '#e74c3c');
      return false;
    }
    return true;
  }

  // Load existing profile picture for preview
  async function loadExistingProfilePicture() {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) throw new Error('Token missing');
      const response = await fetch(`${API_BASE_URL}/profile-picture`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      imagePreview.src = data.profilePicture || 'default-avatar.png';
    } catch (error) {
      console.error('Preview load error:', error);
      imagePreview.src = 'default-avatar.png';
    }
  }

  // Process selected file
  function processFile(file) {
    if (!validateFile(file)) return resetFileInput();
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = e => {
      imagePreview.src = e.target.result;
      saveBtn.disabled = false;
    };
    reader.onerror = () => {
      window.showToast('Failed to read image file', '#e74c3c');
      resetFileInput();
    };
    reader.readAsDataURL(file);
  }

  // Reset state
  function resetFileInput() {
    fileInput.value = '';
    selectedFile = null;
    imagePreview.src = 'default-avatar.png';
    saveBtn.disabled = true;
  }

  // Close modal
  function closeModal() {
    if (isUploading) return;
    modal.classList.remove('show');
    resetFileInput();
  }

  // Open modal + load preview
  const userInfo = getLoggedInUserInfo();
  const urlParams = new URLSearchParams(window.location.search);
  let profileOwnerId = urlParams.get('userId');
  const isOwnProfile = !profileOwnerId || (userInfo && profileOwnerId === userInfo.userId);

  if (fileInputIcon && isOwnProfile) {
    fileInputIcon.addEventListener('click', async (e) => {
      e.preventDefault();
      modal.classList.add('show');
      resetFileInput();
      await loadExistingProfilePicture();
    });
  }

  // Modal behavior
  closeModalBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  choosePhotoBtn?.addEventListener('click', e => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput?.addEventListener('change', e => {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
  }, { passive: true });

  takePhotoBtn?.addEventListener('click', () => {
    window.showToast('Camera functionality would be implemented here', '#2196F3');
  });

  // Upload handler
  saveBtn?.addEventListener('click', async () => {
    if (isUploading || !isOwnProfile || !selectedFile) {
      return window.showToast('Please select a valid image to upload', '#e74c3c');
    }

    isUploading = true;
    saveBtn.classList.add('uploading');
    saveBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('profilePicture', selectedFile);
      const token = localStorage.getItem('authToken');
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${API_BASE_URL}/upload-profile-picture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Upload failed');

      const cacheBuster = `?t=${Date.now()}`;
      if (profilePic) profilePic.src = `${data.profilePicture}${cacheBuster}`;
      if (profilePic1) profilePic1.src = `${data.profilePicture}${cacheBuster}`;

      window.showToast('Profile picture updated successfully!', '#2ecc71');

      setTimeout(() => closeModal(), 500); // Smooth exit

    } catch (error) {
      console.error('Upload error:', error);
      window.showToast(error.message || 'Upload failed', '#e74c3c');
    } finally {
      isUploading = false;
      saveBtn.classList.remove('uploading');
      saveBtn.disabled = false;
    }
  });
});