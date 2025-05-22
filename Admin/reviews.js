document.addEventListener("DOMContentLoaded", function() {
  // Set API base URL
  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://salmart.onrender.com';

  // Get user IDs
  const getProfileOwnerId = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('userId')?.trim() || null;
  };

  const token = localStorage.getItem("authToken");
  let loggedInUserId = null;

  if (token) {
    try {
      const decoded = jwt_decode(token);
      loggedInUserId = decoded.userId?.toString().trim() || null;
    } catch (error) {
      console.error("Error decoding token:", error);
    }
  }

  // Star rating functionality
  const stars = document.querySelectorAll('.stars i');
  const ratingInput = document.getElementById('rating-value');

  stars.forEach(star => {
    star.addEventListener('click', function() {
      const rating = parseInt(this.getAttribute('data-rating'));
      ratingInput.value = rating;

      stars.forEach((s, index) => {
        if (index < rating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });
  });

  // Show/hide review form based on whether it's another user's profile
  const profileOwnerId = getProfileOwnerId() || loggedInUserId;
  const reviewFormContainer = document.getElementById('review-form-container');
  if (reviewFormContainer) {
    if (profileOwnerId && loggedInUserId && profileOwnerId !== loggedInUserId) {
      reviewFormContainer.style.display = 'block';
    } else {
      reviewFormContainer.style.display = 'none';
    }
  }

  // Handle review submission and editing
  const reviewForm = document.getElementById('review-form');
  if (reviewForm) {
    reviewForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const currentProfileOwnerId = getProfileOwnerId() || loggedInUserId;
      const isEditMode = reviewForm.dataset.mode === 'edit';
      const url = isEditMode ? `${API_BASE_URL}/update-review` : `${API_BASE_URL}/submit-review`;

      // Debug: Log all values before submission
      console.log(`${isEditMode ? 'Updating' : 'Submitting'} review with:`, {
        profileOwnerId: currentProfileOwnerId,
        loggedInUserId: loggedInUserId,
        rating: ratingInput.value,
        reviewText: document.getElementById('review-text').value.trim(),
        token: token ? 'Token present' : 'No token',
        mode: isEditMode ? 'edit' : 'submit'
      });

      // Validate required fields
      const rating = parseInt(ratingInput.value);
      const reviewText = document.getElementById('review-text').value.trim();

      if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
        alert('Please select a valid rating between 1 and 5 stars');
        return;
      }

      if (!reviewText || reviewText.length < 10) {
        alert('Please write a review with at least 10 characters');
        return;
      }

      if (!currentProfileOwnerId) {
        alert('Error: Cannot determine who you are reviewing');
        return;
      }

      if (!token || !loggedInUserId) {
        alert('Please log in to submit a review');
        window.location.href = 'SignIn.html';
        return;
      }

      try {
        const response = await fetch(url, {
          method: isEditMode ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            reviewedUserId: currentProfileOwnerId,
            rating: rating,
            review: reviewText
          })
        });

        const data = await response.json();
        console.log(`Server response for ${isEditMode ? 'update' : 'submit'}-review:`, data);

        if (!response.ok) {
          throw new Error(data.message || `Server error: ${response.status}`);
        }

        if (data.success) {
          alert(`Review ${isEditMode ? 'updated' : 'submitted'} successfully!`);
          reviewForm.reset();
          reviewForm.dataset.mode = ''; // Reset mode
          stars.forEach(star => star.classList.remove('active'));
          ratingInput.value = '';
          await loadReviews(currentProfileOwnerId);
          await updateAverageRating(currentProfileOwnerId);
        } else {
          throw new Error(data.message || `Failed to ${isEditMode ? 'update' : 'submit'} review`);
        }
      } catch (error) {
        console.error(`Review ${isEditMode ? 'update' : 'submission'} error:`, error);
        alert(`${isEditMode ? 'Update' : 'Submission'} failed: ${error.message}`);
      }
    });
  }

  // Load reviews for the profile
  async function loadReviews(userId) {
    const targetUserId = userId || getProfileOwnerId() || loggedInUserId;
    if (!targetUserId) {
      console.error('No user ID provided for loading reviews');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/user-reviews/${targetUserId}`, {
        headers: {
          'Authorization': `Bearer ${token || ''}`
        }
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      console.log('Reviews data:', data);

      const reviewsList = document.getElementById('reviews-list');
      if (!reviewsList) {
        console.error('Reviews list element not found');
        return;
      }
      reviewsList.innerHTML = '';

      if (!data || data.length === 0 || data.message === 'No reviews found for this user') {
        reviewsList.innerHTML = '<div class="no-reviews">No reviews yet.</div>';
      } else {
        data.forEach(review => {
          const reviewCard = document.createElement('div');
          reviewCard.className = 'review-card';

          const reviewDate = new Date(review.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          let starsHtml = '';
          for (let i = 1; i <= 5; i++) {
            starsHtml += `<i class="fas fa-star${i <= review.rating ? ' active' : ''}"></i>`;
          }

          const reviewer = review.reviewerId;
          const reviewerName = typeof reviewer === 'object' && reviewer?.firstName || reviewer?.lastName
           ? `${reviewer.firstName} ${reviewer.lastName}`
            : (review.reviewerName || 'Anonymous');
          const reviewerPicture = typeof reviewer === 'object' && reviewer?.profilePicture 
            ? reviewer.profilePicture 
            : 'default-avatar.png';

          reviewCard.innerHTML = `
            <div class="review-header">
              <img src="${reviewerPicture}" 
                   alt="${reviewerName}" 
                   class="reviewer-avatar"
                   onerror="this.src='default-avatar.png'">
              <span class="reviewer-name">${reviewerName}</span>
              <span class="review-date">${reviewDate}</span>
              <div class="review-rating">${starsHtml}</div>
            </div>
            <div class="review-content">
              <p>${review.review}</p>
            </div>
          `;

          reviewsList.appendChild(reviewCard);
        });
      }

      // Check for existing review and show edit button
      const editReviewBtn = document.getElementById('edit-review-btn');
      if (loggedInUserId && profileOwnerId !== loggedInUserId && editReviewBtn) {
        const existingReview = data.find(review => review.reviewerId && review.reviewerId._id === loggedInUserId);
        if (existingReview) {
          editReviewBtn.style.display = 'block';
          editReviewBtn.addEventListener('click', () => {
            // Populate form with existing review
            ratingInput.value = existingReview.rating;
            document.getElementById('review-text').value = existingReview.review;
            stars.forEach((s, index) => {
              s.classList.toggle('active', index < existingReview.rating);
            });
            reviewForm.dataset.mode = 'edit';
            reviewFormContainer.scrollIntoView({ behavior: 'smooth' });
          }, { once: true }); // Prevent multiple listeners
        } else {
          editReviewBtn.style.display = 'none';
        }
      }

      // Update review count
      const reviewCountEl = document.getElementById('reviews-count');
      if (reviewCountEl) {
        console.log('Updating review count from loadReviews:', data.length || 0);
        reviewCountEl.textContent = data.length || 0;
      }
    } catch (error) {
      console.error('Error loading reviews:', error);
      const reviewsList = document.getElementById('reviews-list');
      if (reviewsList) {
        reviewsList.innerHTML = '<div class="no-reviews">Error loading reviews. Please try again later.</div>';
      }
    }
  }

  // Update average rating and review count
  async function updateAverageRating(userId) {
    const targetUserId = userId || getProfileOwnerId() || loggedInUserId;
    if (!targetUserId) {
      console.error('No user ID provided for updating average rating');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/average-rating/${targetUserId}`, {
        headers: {
          'Authorization': `Bearer ${token || ''}`
        }
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      console.log('Average rating data:', data);

      const averageRatingEl = document.getElementById('average-rating');
      if (averageRatingEl && data.averageRating !== undefined) {
        averageRatingEl.textContent = parseFloat(data.averageRating).toFixed(1);
      } else {
        if (averageRatingEl) averageRatingEl.textContent = '0.0';
      }

      // Update review count
      const reviewCountEl = document.getElementById('reviews-count');
      if (reviewCountEl && data.reviewCount !== undefined) {
        console.log('Updating review count from updateAverageRating:', data.reviewCount);
        reviewCountEl.textContent = data.reviewCount;
      } else {
        if (reviewCountEl) {
          console.log('No reviewCount in average rating data, setting to 0');
          reviewCountEl.textContent = '0';
        }
      }
    } catch (error) {
      console.error('Error fetching average rating:', error);
      const averageRatingEl = document.getElementById('average-rating');
      if (averageRatingEl) averageRatingEl.textContent = '0.0';
      const reviewCountEl = document.getElementById('reviews-count');
      if (reviewCountEl) {
        console.log('Error in updateAverageRating, setting review count to 0');
        reviewCountEl.textContent = '0';
      }
    }
  }

  // Initialize reviews and rating when Reviews tab is active
  const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab', 'data-tab active');
  if (activeTab === 'reviews', 'home') {
    const userId = getProfileOwnerId() || loggedInUserId;
    if (userId) {
      loadReviews(userId);
      updateAverageRating(userId);
    }
  }

  // Load reviews when Reviews tab is activated
  document.addEventListener('reviewsTabActivated', function() {
    const userId = getProfileOwnerId() || loggedInUserId;
    if (userId) {
      loadReviews(userId);
      updateAverageRating(userId);
    }
  });
});