document.addEventListener("DOMContentLoaded", function() {
  // --- Profile Picture Modal Script ---
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

  const urlParams = new URLSearchParams(window.location.search);
  let profileOwnerId = urlParams.get('userId');
  const userInfo = getLoggedInUserInfo();
  const isOwnProfile = !profileOwnerId || (userInfo && profileOwnerId === userInfo.userId);

  const fileInputIcon = document.querySelector('.file-input-icon');
  if (fileInputIcon && isOwnProfile) {
    fileInputIcon.classList.add('show');
    console.log('Showing profile picture upload icon for owner profile');
  } else if (!fileInputIcon) {
    console.warn('File input icon (.file-input-icon) not found in DOM');
  }

  const modal = document.getElementById('profile-pic-modal');
  const closeModalBtn = document.querySelector('#profile-pic-modal .close-modal');
  const cancelBtn = document.getElementById('cancel-upload');
  const saveBtn = document.getElementById('save-profile-pic');
  const choosePhotoBtn = document.getElementById('choose-photo-btn');
  const takePhotoBtn = document.getElementById('take-photo-btn');
  const imagePreview = document.getElementById('image-preview');
  const fileInput = document.getElementById('profile-picture-upload');

  if (fileInputIcon && isOwnProfile) {
    fileInputIcon.addEventListener('click', function(e) {
      e.preventDefault();
      modal.classList.add('show');
    });
  }

  function closeModal() {
    modal.classList.remove('show');
  }

  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeModal();
    }
  });

  choosePhotoBtn.addEventListener('click', function() {
    fileInput.click();
  });

  fileInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = function(event) {
        imagePreview.src = event.target.result;
        document.querySelectorAll('.edit-btn').forEach(btn => {
          btn.disabled = false;
        });
        saveBtn.disabled = false;
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  });

  takePhotoBtn.addEventListener('click', function() {
    showToast('Camera functionality would be implemented here');
  });

  saveBtn.addEventListener('click', function() {
    if (!isOwnProfile) {
      console.warn('Non-owner attempted to save profile picture');
      return;
    }
    saveBtn.classList.add('uploading');
    setTimeout(function() {
      saveBtn.classList.remove('uploading');
      const profilePic = document.getElementById('profile-picture');
      const profilePic1 = document.getElementById('profile-picture1');
      if (profilePic) profilePic.src = imagePreview.src;
      if (profilePic1) profilePic1.src = imagePreview.src;
      closeModal();
      showToast('Profile picture updated successfully!', '#2ecc71');
    }, 1500);
  });

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

  // --- Follow Button Script ---
  const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
  const socket = io(`${API_BASE_URL}`, {
    path: '/socket.io',
    transports: ['websocket', 'polling']
  });
  socket.on('connect', () => {
    console.log('Connected to server');
  });

  const followButton = document.getElementById("follow-button");
  if (followButton) { // Check if followButton exists before adding listener
      function getProfileOwnerId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get("userId") ? urlParams.get("userId").trim() : null;
      }
      function getLoggedInUserId() {
        const token = localStorage.getItem("authToken");
        if (!token) return null;
        try {
          const decodedToken = jwt_decode(token);
          return decodedToken.userId ? decodedToken.userId.toString().trim() : null;
        } catch (error) {
          console.error("Error decoding token:", error);
          return null;
        }
      }
      const profileOwnerId = getProfileOwnerId();
      const loggedInUserId = getLoggedInUserId();
      if (profileOwnerId && loggedInUserId && profileOwnerId === loggedInUserId) {
        followButton.style.display = "none";
        // return; // Don't return, allow other scripts to run
      }
      async function updateFollowButton() {
        try {
          const response = await fetch(`${API_BASE_URL}/follow-status?followerId=${loggedInUserId}&followingId=${profileOwnerId}`);
          const data = await response.json();
          if (data.following) {
            followButton.classList.add("following");
            followButton.textContent = "Following";
          } else {
            followButton.classList.remove("following");
            followButton.textContent = "Follow";
          }
        } catch (error) {
          console.error("Error fetching follow status:", error);
        }
      }
      followButton.addEventListener("click", async function () {
        try {
          const response = await fetch(`${API_BASE_URL}/api/follow`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              followerId: loggedInUserId,
              followingId: profileOwnerId
            })
          });
          const data = await response.json();
          if (data.success) {
            if (followButton.classList.contains("following")) {
              followButton.classList.remove("following");
              followButton.textContent = "Follow";
            } else {
              followButton.classList.add("following");
              followButton.textContent = "Following";
            }
          }
        } catch (error) {
          console.error("Error following/unfollowing user:", error);
        }
      });
      updateFollowButton();
  } else {
      console.error("Follow button not found!");
  }

  // --- Profile Data Fetching Script ---
  if (typeof eruda !== 'undefined') {
    eruda.init();
  }

  // API_BASE_URL is already defined above

  // getLoggedInUserInfo is already defined above

  // urlParams, profileOwnerId, userInfo, isOwnProfile are already defined above

  if (!userInfo && isOwnProfile) {
    window.location.href = "SignIn.html";
    return;
  }

  if (!profileOwnerId && userInfo) {
    profileOwnerId = userInfo.userId;
  }

  const followersCountEl = document.getElementById("followers");
  const productsCountEl = document.getElementById("products-count");
  const usernameEls = [
    document.getElementById("username"),
    document.getElementById("username1"),
    document.getElementById("profileHeaderUsr")
  ];
  const profilePicEls = [
    document.getElementById("profile-picture"),
    document.getElementById("profile-picture1")
  ];

  if (isOwnProfile && userInfo) {
    const displayName = userInfo.name || userInfo.username || "User";
    usernameEls.forEach(el => {
      if (el) el.textContent = displayName;
    });
  }

  try {
    console.log(`Fetching profile for ID: ${profileOwnerId}`);
    const response = await fetch(`${API_BASE_URL}/profile/${profileOwnerId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Profile data received:", data);

    if (followersCountEl) followersCountEl.textContent = data.followersCount || "0";
    if (productsCountEl) productsCountEl.textContent = data.productsCount || "0";

    if (data.name) {
      usernameEls.forEach(el => {
        if (el) {
          el.textContent = data.name;
          el.style.display = 'block';
        }
      });
    } else {
      const fallbackName = data.username || (isOwnProfile ? (userInfo.name || userInfo.username) : "User");
      usernameEls.forEach(el => {
        if (el) {
          el.textContent = fallbackName;
          el.style.display = 'block';
        }
      });
    }

    if (data.profilePicture) {
      profilePicEls.forEach(el => {
        if (el) {
          el.onerror = function() {
            this.src = "default-avatar.png";
          };
          el.src = data.profilePicture;
          el.style.display = 'block';
        }
      });
    }

    document.querySelectorAll('.skeleton-profile-pic').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.skeleton-username').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.skeleton-stats-text').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.skeleton-stats-number').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.stats-item p, .stats-item h3').forEach(el => el.style.display = 'block');

  } catch (err) {
    console.error("Error fetching profile data:", err);

    if (isOwnProfile && userInfo) {
      const fallbackName = userInfo.name || userInfo.username || "User";
      usernameEls.forEach(el => {
        if (el) {
          el.textContent = fallbackName;
          el.style.display = 'block';
        }
      });
    } else {
      usernameEls.forEach(el => {
        if (el) {
          el.textContent = "User";
          el.style.display = 'block';
        }
      });
    }

    document.querySelectorAll('.skeleton-profile-pic').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.skeleton-username').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.skeleton-stats-text').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.skeleton-stats-number').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.stats-item p, .stats-item h3').forEach(el => el.style.display = 'block');
  }

  if (followersCountEl) {
    followersCountEl.style.display = 'none';
    followersCountEl.offsetHeight; // Trigger reflow for display property
    followersCountEl.style.display = 'block';
  }

  // --- Tab Switching ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(`${tabId}-tab`).classList.add('active');
      if (tabId === 'reviews') {
        document.dispatchEvent(new CustomEvent('reviewsTabActivated'));
      }
    });
  });

  // --- Sidebar Toggle ---
  const menuIcon = document.querySelector('.menu-icon');
  const sideBar = document.querySelector('.side-bar');
  const body = document.body;
  menuIcon.addEventListener('click', () => {
    sideBar.style.display = sideBar.style.display === 'block' ? 'none' : 'block';
    body.classList.toggle('no-scroll');
  });
  document.body.addEventListener('click', (e) => {
    if (sideBar.style.display === 'block' && !sideBar.contains(e.target) && !menuIcon.contains(e.target)) {
      sideBar.style.display = 'none';
      body.classList.remove('no-scroll');
    }
  });

});
