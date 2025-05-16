
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
      const reader = new FileReader();

      reader.onload = function(event) {
        imagePreview.src = event.target.result;
        // Enable editing buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
          btn.disabled = false;
        });
        saveBtn.disabled = false;
      };

      reader.readAsDataURL(e.target.files[0]);
    }
  });

  // Take photo handler (would need more implementation for actual camera access)
  takePhotoBtn.addEventListener('click', function() {
    showToast('Camera functionality would be implemented here');
  });

  // Save button handler
  saveBtn.addEventListener('click', function() {
    if (!isOwnProfile) {
      console.warn('Non-owner attempted to save profile picture');
      return;
    }

    // Show loading state
    saveBtn.classList.add('uploading');

    // Simulate upload (replace with actual upload logic)
    setTimeout(function() {
      // Hide loading state
      saveBtn.classList.remove('uploading');

      // Update profile picture
      const profilePic = document.getElementById('profile-picture');
      const profilePic1 = document.getElementById('profile-picture1');
      if (profilePic) profilePic.src = imagePreview.src;
      if (profilePic1) profilePic1.src = imagePreview.src;

      // Close modal
      closeModal();

      // Show success message
      showToast('Profile picture updated successfully!', '#2ecc71');
    }, 1500);
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
