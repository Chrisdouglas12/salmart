document.addEventListener("DOMContentLoaded", function() {
  // Set API base URL
  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://salmart-production.up.railway.app';

  // Get user IDs - IMPORTANT: Get fresh URL params each time
  const getProfileOwnerId = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('userId');
  };
  
  const token = localStorage.getItem("authToken");
  let loggedInUserId = null;
  
  if (token) {
    try {
      const decoded = jwt_decode(token);
      loggedInUserId = decoded.userId;
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
      
      // Update star display
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
  const profileOwnerId = getProfileOwnerId();
  if (profileOwnerId && loggedInUserId && profileOwnerId !== loggedInUserId) {
    document.getElementById('review-form-container').style.display = 'block';
  }

  // Handle review submission
  const reviewForm = document.getElementById('review-form');
  if (reviewForm) {
    reviewForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      // Get fresh profileOwnerId on each submission
      const currentProfileOwnerId = getProfileOwnerId();
      
      // Debug: Log all values before submission
      console.log('Submitting review with:', {
        profileOwnerId: currentProfileOwnerId,
        rating: ratingInput.value,
        reviewText: document.getElementById('review-text').value.trim(),
        tokenExists: !!token
      });

      // Validate required fields
      const rating = parseInt(ratingInput.value);
      const reviewText = document.getElementById('review-text').value.trim();
      
      // Enhanced validation
      if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
        alert('Please select a valid rating between 1 and 5 stars');
        return;
      }
      
      if (!reviewText || reviewText.length < 10) {
        alert('Please write a meaningful review (at least 10 characters)');
        return;
      }
      
      if (!currentProfileOwnerId) {
        alert('Error: Cannot determine who you\'re reviewing');
        return;
      }
      
      if (!token) {
        alert('Please log in to submit a review');
        window.location.href = 'SignIn.html';
        return;
      }
      
      try {
        const response = await fetch(`${API_BASE_URL}/submit-review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            reviewedUserId: currentProfileOwnerId, // Use current ID
            rating: rating,
            review: reviewText
          })
        });
        
        // Check for HTTP errors
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          alert('Review submitted successfully!');
          reviewForm.reset();
          stars.forEach(star => star.classList.remove('active'));
          ratingInput.value = '';
          loadReviews(currentProfileOwnerId); // Pass the ID
          updateAverageRating(currentProfileOwnerId); // Pass the ID
        } else {
          throw new Error(data.message || 'Failed to submit review');
        }
      } catch (error) {
        console.error('Review submission error:', error);
        alert(`Submission failed: ${error.message}`);
      }
    });
  }

  // Load reviews for the profile
  async function loadReviews(userId) {
    try {
      const response = await fetch(`${API_BASE_URL}/user-reviews/${userId || getProfileOwnerId()}`);
      const data = await response.json();
      
      const reviewsList = document.getElementById('reviews-list');
      reviewsList.innerHTML = '';
      
      if (data.message === 'No reviews found for this user') {
        reviewsList.innerHTML = '<div class="no-reviews">No reviews yet. Be the first to review!</div>';
        return;
      }
      
      data.forEach(review => {
        const reviewCard = document.createElement('div');
        reviewCard.className = 'review-card';
        
        // Format date
        const reviewDate = new Date(review.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        // Create stars HTML
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
          starsHtml += `<i class="fas fa-star${i <= review.rating ? ' active' : ''}"></i>`;
        }
        
        reviewCard.innerHTML = `
          <div class="review-header">
            <img src="${review.reviewerId.profilePicture || 'default-avatar.png'}" 
                 alt="${review.reviewerId.name}" 
                 class="reviewer-avatar">
            <span class="reviewer-name">${review.reviewerId.name}</span>
            <span class="review-date">${reviewDate}</span>
            <div class="review-rating">${starsHtml}</div>
          </div>
          <div class="review-content">
            <p>${review.review}</p>
          </div>
        `;
        
        reviewsList.appendChild(reviewCard);
      });
    } catch (error) {
      console.error('Error loading reviews:', error);
      document.getElementById('reviews-list').innerHTML = 
        '<div class="no-reviews">Error loading reviews. Please try again later.</div>';
    }
  }

  // Update average rating display
  async function updateAverageRating(userId) {
    try {
      const response = await fetch(`${API_BASE_URL}/average-rating/${userId || getProfileOwnerId()}`);
      const data = await response.json();
      
      if (data.averageRating) {
        document.getElementById('average-rating').textContent = data.averageRating;
      }
    } catch (error) {
      console.error('Error fetching average rating:', error);
    }
  }

  // Initialize reviews and rating when page loads if on reviews tab
  const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
  if (activeTab === 'reviews') {
    loadReviews(getProfileOwnerId());
    updateAverageRating(getProfileOwnerId());
  }
});