document.addEventListener("DOMContentLoaded", function() {
  // Configuration and state management
  const CONFIG = {
    API_BASE_URL: window.location.hostname === 'localhost' 
      ? 'http://localhost:3000' 
      : 'https://salmart.onrender.com',
    MIN_REVIEW_LENGTH: 10,
    RATING_RANGE: { MIN: 1, MAX: 5 }
  };

  // State management
  const state = {
    token: localStorage.getItem("authToken"),
    loggedInUserId: null,
    profileOwnerId: null,
    isEditMode: false,
    currentReview: null,
    eventListenersAdded: new Set()
  };

  // Initialize user data
  function initializeUserData() {
    // Get profile owner ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    state.profileOwnerId = urlParams.get('userId')?.trim() || null;

    // Decode logged-in user info
    if (state.token) {
      try {
        const decoded = jwt_decode(state.token);
        state.loggedInUserId = decoded.userId?.toString().trim() || null;
      } catch (error) {
        console.error("Error decoding token:", error);
        state.token = null; // Clear invalid token
      }
    }

    // Set default profile owner to logged-in user if not specified
    if (!state.profileOwnerId) {
      state.profileOwnerId = state.loggedInUserId;
    }
  }

  // DOM element cache
  const elements = {
    get stars() { return document.querySelectorAll('.stars i'); },
    get ratingInput() { return document.getElementById('rating-value'); },
    get reviewForm() { return document.getElementById('review-form'); },
    get reviewFormContainer() { return document.getElementById('review-form-container'); },
    get reviewText() { return document.getElementById('review-text'); },
    get reviewsList() { return document.getElementById('reviews-list'); },
    get editReviewBtn() { return document.getElementById('edit-review-btn'); },
    get averageRatingEl() { return document.getElementById('average-rating'); },
    get reviewCountEl() { return document.getElementById('reviews-count'); }
  };

  // Validation functions
  const validators = {
    rating: (rating) => {
      const num = parseInt(rating);
      return !isNaN(num) && num >= CONFIG.RATING_RANGE.MIN && num <= CONFIG.RATING_RANGE.MAX;
    },
    
    reviewText: (text) => {
      return text && text.trim().length >= CONFIG.MIN_REVIEW_LENGTH;
    },
    
    userAuth: () => {
      return state.token && state.loggedInUserId;
    },
    
    profileOwner: () => {
      return state.profileOwnerId && state.profileOwnerId !== state.loggedInUserId;
    }
  };

  // Utility functions
  const utils = {
    showError: (message) => {
      console.error(message);
      alert(message); // Consider replacing with a toast notification
    },
    
    showSuccess: (message) => {
      alert(message); // Consider replacing with a toast notification
    },
    
    formatDate: (dateString) => {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    },
    
    generateStarsHTML: (rating) => {
      return Array.from({ length: 5 }, (_, i) => 
        `<i class="fas fa-star${i < rating ? ' active' : ''}"></i>`
      ).join('');
    },
    
    updateStarsDisplay: (rating) => {
      elements.stars.forEach((star, index) => {
        star.classList.toggle('active', index < rating);
      });
    },
    
    resetForm: () => {
      if (elements.reviewForm) {
        elements.reviewForm.reset();
        elements.reviewForm.dataset.mode = '';
      }
      if (elements.ratingInput) elements.ratingInput.value = '';
      utils.updateStarsDisplay(0);
      state.isEditMode = false;
      state.currentReview = null;
    }
  };

  // API functions
  const api = {
    async makeRequest(url, options = {}) {
      const defaultOptions = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token || ''}`
        }
      };
      
      const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: { ...defaultOptions.headers, ...options.headers }
      };

      const response = await fetch(url, mergedOptions);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `Server error: ${response.status}`);
      }
      
      return data;
    },

    async submitReview(reviewData) {
      const url = state.isEditMode 
        ? `${CONFIG.API_BASE_URL}/update-review`
        : `${CONFIG.API_BASE_URL}/submit-review`;
      
      const method = state.isEditMode ? 'PATCH' : 'POST';
      
      return await this.makeRequest(url, {
        method,
        body: JSON.stringify({
          reviewedUserId: state.profileOwnerId,
          rating: reviewData.rating,
          review: reviewData.reviewText
        })
      });
    },

    async loadReviews(userId) {
      return await this.makeRequest(`${CONFIG.API_BASE_URL}/user-reviews/${userId}`);
    },

    async getAverageRating(userId) {
      return await this.makeRequest(`${CONFIG.API_BASE_URL}/average-rating/${userId}`);
    }
  };

  // UI Management functions
  const ui = {
    initializeStarRating() {
      if (state.eventListenersAdded.has('stars')) return;
      
      elements.stars.forEach(star => {
        star.addEventListener('click', function() {
          const rating = parseInt(this.getAttribute('data-rating'));
          if (elements.ratingInput) {
            elements.ratingInput.value = rating;
          }
          utils.updateStarsDisplay(rating);
        });
      });
      
      state.eventListenersAdded.add('stars');
    },

    toggleReviewForm() {
      if (!elements.reviewFormContainer) return;
      
      const shouldShow = validators.profileOwner();
      elements.reviewFormContainer.style.display = shouldShow ? 'block' : 'none';
    },

    async handleReviewSubmission(e) {
      e.preventDefault();

      // Validation
      const rating = parseInt(elements.ratingInput?.value);
      const reviewText = elements.reviewText?.value.trim();

      if (!validators.rating(rating)) {
        utils.showError('Please select a valid rating between 1 and 5 stars');
        return;
      }

      if (!validators.reviewText(reviewText)) {
        utils.showError(`Please write a review with at least ${CONFIG.MIN_REVIEW_LENGTH} characters`);
        return;
      }

      if (!validators.userAuth()) {
        utils.showError('Please log in to submit a review');
        window.location.href = 'SignIn.html';
        return;
      }

      if (!state.profileOwnerId) {
        utils.showError('Error: Cannot determine who you are reviewing');
        return;
      }

      try {
        const data = await api.submitReview({ rating, reviewText });
        
        if (data.success) {
          const action = state.isEditMode ? 'updated' : 'submitted';
          utils.showSuccess(`Review ${action} successfully!`);
          utils.resetForm();
          await Promise.all([
            ui.loadReviews(state.profileOwnerId),
            ui.updateAverageRating(state.profileOwnerId)
          ]);
        } else {
          throw new Error(data.message || 'Failed to process review');
        }
      } catch (error) {
        console.error('Review submission error:', error);
        utils.showError(`Submission failed: ${error.message}`);
      }
    },

    async loadReviews(userId = state.profileOwnerId) {
      if (!userId) {
        console.error('No user ID provided for loading reviews');
        return;
      }

      try {
        const data = await api.loadReviews(userId);
        this.renderReviews(data);
        this.handleEditButton(data);
        this.updateReviewCount(data.length || 0);
      } catch (error) {
        console.error('Error loading reviews:', error);
        this.renderReviewsError();
      }
    },

    renderReviews(reviews) {
      if (!elements.reviewsList) {
        console.error('Reviews list element not found');
        return;
      }

      if (!reviews || reviews.length === 0 || reviews.message === 'No reviews found for this user') {
        elements.reviewsList.innerHTML = '<div class="no-reviews">No reviews yet.</div>';
        return;
      }

      elements.reviewsList.innerHTML = reviews.map(review => {
        const reviewer = review.reviewerId;
        const reviewerName = (typeof reviewer === 'object' && reviewer?.firstName) 
          ? `${reviewer.firstName} ${reviewer.lastName || ''}`.trim()
          : (review.reviewerName || 'Anonymous');
        
        const reviewerPicture = (typeof reviewer === 'object' && reviewer?.profilePicture)
          ? reviewer.profilePicture 
          : 'default-avatar.png';

        return `
          <div class="review-card">
            <div class="review-header">
              <img src="${reviewerPicture}" 
                   alt="${reviewerName}" 
                   class="reviewer-avatar"
                   onerror="this.src='default-avatar.png'">
              <span class="reviewer-name">${reviewerName}</span>
              <span class="review-date">${utils.formatDate(review.createdAt)}</span>
              <div class="review-rating">${utils.generateStarsHTML(review.rating)}</div>
            </div>
            <div class="review-content">
              <p>${review.review}</p>
            </div>
          </div>
        `;
      }).join('');
    },

    renderReviewsError() {
      if (elements.reviewsList) {
        elements.reviewsList.innerHTML = '<div class="no-reviews">Error loading reviews. Please try again later.</div>';
      }
    },

    handleEditButton(reviews) {
      if (!state.loggedInUserId || !validators.profileOwner() || !elements.editReviewBtn) {
        return;
      }

      const existingReview = reviews.find(review => 
        review.reviewerId && review.reviewerId._id === state.loggedInUserId
      );

      if (existingReview) {
        elements.editReviewBtn.style.display = 'block';
        
        // Remove existing listener if any
        if (!state.eventListenersAdded.has('editReview')) {
          elements.editReviewBtn.addEventListener('click', () => {
            this.populateEditForm(existingReview);
          });
          state.eventListenersAdded.add('editReview');
        }
        
        state.currentReview = existingReview;
      } else {
        elements.editReviewBtn.style.display = 'none';
        state.currentReview = null;
      }
    },

    populateEditForm(review) {
      if (elements.ratingInput) elements.ratingInput.value = review.rating;
      if (elements.reviewText) elements.reviewText.value = review.review;
      
      utils.updateStarsDisplay(review.rating);
      
      if (elements.reviewForm) {
        elements.reviewForm.dataset.mode = 'edit';
      }
      
      state.isEditMode = true;
      elements.reviewFormContainer?.scrollIntoView({ behavior: 'smooth' });
    },

    async updateAverageRating(userId = state.profileOwnerId) {
      if (!userId) {
        console.error('No user ID provided for updating average rating');
        return;
      }

      try {
        const data = await api.getAverageRating(userId);
        
        if (elements.averageRatingEl) {
          const rating = data.averageRating !== undefined 
            ? parseFloat(data.averageRating).toFixed(1) 
            : '0.0';
          elements.averageRatingEl.textContent = rating;
        }

        if (data.reviewCount !== undefined) {
          this.updateReviewCount(data.reviewCount);
        }
      } catch (error) {
        console.error('Error fetching average rating:', error);
        if (elements.averageRatingEl) elements.averageRatingEl.textContent = '0.0';
        this.updateReviewCount(0);
      }
    },

    updateReviewCount(count) {
      if (elements.reviewCountEl) {
        console.log('Updating review count:', count);
        elements.reviewCountEl.textContent = count.toString();
      }
    }
  };

  // Event listeners setup
  function setupEventListeners() {
    // Review form submission
    if (elements.reviewForm && !state.eventListenersAdded.has('reviewForm')) {
      elements.reviewForm.addEventListener('submit', ui.handleReviewSubmission.bind(ui));
      state.eventListenersAdded.add('reviewForm');
    }

    // Custom event for tab activation
    if (!state.eventListenersAdded.has('reviewsTab')) {
      document.addEventListener('reviewsTabActivated', async function() {
        if (state.profileOwnerId) {
          await Promise.all([
            ui.loadReviews(state.profileOwnerId),
            ui.updateAverageRating(state.profileOwnerId)
          ]);
        }
      });
      state.eventListenersAdded.add('reviewsTab');
    }
  }

  // Initialize everything
  async function initialize() {
    try {
      initializeUserData();
      ui.initializeStarRating();
      ui.toggleReviewForm();
      setupEventListeners();

      // Load initial data if on reviews tab or home tab
      const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
      if (['reviews', 'home'].includes(activeTab) && state.profileOwnerId) {
        await Promise.all([
          ui.loadReviews(state.profileOwnerId),
          ui.updateAverageRating(state.profileOwnerId)
        ]);
      }
    } catch (error) {
      console.error('Initialization error:', error);
    }
  }

  // Start initialization
  initialize();
});