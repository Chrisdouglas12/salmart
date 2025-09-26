
    const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB
    const MAX_VIDEO_DURATION = 60; // 60 seconds (1 minute)
    // Removed MAX_DESCRIPTION_LENGTH and MAX_TEXT_LENGTH as they are not universally applied or strictly enforced here
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
let isSubmitting = false
    // DOM references
    const normalForm = document.getElementById('normal-ad-form');
    const videoForm = document.getElementById('video-ad-form');
    const normalTab = document.getElementById('normal-tab');
    const videoTab = document.getElementById('video-tab');
    const publishButton = document.getElementById('publish-button');
    const priceDisplay = document.getElementById('price-display');
    const priceHidden = document.getElementById('price');
    const loadingModal = document.getElementById('loading-modal');
    const videoProcessingModal = document.getElementById('video-processing-modal');
    const videoInput = document.getElementById('video-input');
    const videoProcessingStatus = document.getElementById('video-processing-status');
    const formTitle = document.getElementById('form-title');
    const photoInput = document.getElementById('photo-input');
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    const existingPhotoUrlInput = document.getElementById('existing-photo-url'); // For regular ads
    const existingVideoUrlInput = document.getElementById('existing-video-url'); // New: For video ads
    const existingThumbnailUrlInput = document.getElementById('existing-thumbnail-url'); // New: For video ads



    // Track state
    let activeTab = 'normal';
    let processedVideoFile = null;
    // Video editor integration
const originalVideoInputHandler = true; // Mark that we're integrating with video editor
    let isEditMode = false;
    let currentPostId = null; // Renamed from currentProductId to currentPostId for consistency
    let currentPostType = null; // New state variable

    // --- Edit Mode Logic ---
    function getUrlParams() {
      const params = new URLSearchParams(window.location.search);
      return {
        isEdit: params.get('edit') === 'true', // Check for 'true' string
        postId: params.get('postId'),
        postType: params.get('postType') // Get postType from URL
      };
    }

    async function initializeEditMode() {
      const { isEdit, postId, postType } = getUrlParams(); // Destructure all params
      
      if (isEdit && postId && postType) {
        isEditMode = true;
        currentPostId = postId;
        currentPostType = postType; // Store the post type

        formTitle.textContent = 'Edit Ad';
        publishButton.textContent = 'Update Ad';
        
        // Disable tab switching if in edit mode (will be handled by fetched data)
        normalTab.disabled = true;
        videoTab.disabled = true;

        showLoadingModal();
        try {
          const token = localStorage.getItem('authToken');
          if (!token) {
            showToast('Please log in to edit an ad.', '#dc3545');
            hideLoadingModal();
            return;
          }

          const response = await fetch(`${API_BASE_URL}/post/${postId}`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          const postData = await response.json();

          if (response.ok) {
            populateFormForEdit(postData);
          } else {
            showToast(postData.message || 'Failed to load ad for editing.', '#dc3545');
            console.error('Error fetching ad for edit:', postData);
          }
        } catch (error) {
          console.error('Network error fetching ad for edit:', error);
          showToast('Network error loading ad. Please try again.', '#dc3545');
        } finally {
          hideLoadingModal();
        }
      }
    }

    function populateFormForEdit(post) {
      // Set the active tab based on the fetched post type
      if (post.postType === 'video_ad') {
        switchTab('video');
        // Populate video ad form
        document.getElementById('video-description').value = post.description || '';
        document.getElementById('video-category').value = post.category || '';
        document.getElementById('product-link').value = post.productLink || '';

        // Display existing video/thumbnail
        const videoPreviewContainer = document.getElementById('video-preview-container');
        videoPreviewContainer.innerHTML = '';
        if (post.video) {
          const videoElement = document.createElement('video');
          videoElement.src = post.video;
          videoElement.controls = true;
          videoElement.muted = true;
          videoElement.style.maxWidth = '100%';
          videoElement.style.maxHeight = '200px';
          videoPreviewContainer.appendChild(videoElement);
          existingVideoUrlInput.value = post.video; // Store existing video URL
          if (post.thumbnail) {
            existingThumbnailUrlInput.value = post.thumbnail; // Store existing thumbnail URL
          }
        }
      } else { // Defaults to 'regular' if not video_ad
        switchTab('normal');
        // Populate normal ad form
        document.getElementById('title').value = post.title || '';
        document.getElementById('description').value = post.description || '';
        document.getElementById('productCondition').value = post.productCondition || ''; // Use productCondition
        
        const price = post.price || 0;
        document.getElementById('price-display').value = formatPriceInput(price.toString());
        document.getElementById('price').value = price.toFixed(2);

        document.getElementById('location').value = post.location || '';
        document.getElementById('category').value = post.category || '';
        document.getElementById('quantity').value = post.quantity || 1;

        // Handle existing photo
        const photoPreviewContainer = document.getElementById('photo-preview-container');
        photoPreviewContainer.innerHTML = '';
        if (post.photo) { // Check for 'photo' property for regular ads
          const img = document.createElement('img');
          img.src = post.photo;
          img.alt = 'Existing Product Image';
          img.style.maxWidth = '100%';
          img.style.maxHeight = '200px';
          img.style.marginTop = '10px';
          photoPreviewContainer.appendChild(img);
          existingPhotoUrlInput.value = post.photo; // Store existing URL
        }
      }
      // Ensure currentPostType is set from the fetched post for subsequent submitAd calls
      currentPostType = post.postType || 'regular'; 
    }
    // --- End Edit Mode Logic ---

    // Video processing functions
    function showVideoProcessingModal(text = 'Processing your video...') {
      const modal = document.getElementById('video-processing-modal');
      const textEl = document.getElementById('processing-text');
      if (modal && textEl) {
        textEl.textContent = text;
        modal.style.display = 'flex';
      }
    }

    function hideVideoProcessingModal() {
      const modal = document.getElementById('video-processing-modal');
      if (modal) modal.style.display = 'none';
    }

    function updateProcessingProgress(message) {
      const progressEl = document.getElementById('processing-progress');
      if (progressEl) progressEl.textContent = message;
    }

    function showProcessingStatus(message, isError = false) {
      videoProcessingStatus.textContent = message;
      videoProcessingStatus.style.display = 'block';
      videoProcessingStatus.style.color = isError ? '#dc3545' : '#28a745';
    }

    function hideProcessingStatus() {
      videoProcessingStatus.style.display = 'none';
    }

    // Get video duration without playing
    function getVideoDuration(file) {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true; // Ensure it's muted
        
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(video.src);
          resolve(video.duration);
        };
        
        video.onerror = (e) => {
          console.error('Video metadata load error:', e);
          reject(new Error('Failed to load video metadata.'));
        };
        video.src = URL.createObjectURL(file);
      });
    }

    // Process video (fixed version)
    async function processVideo(file) {
      try {
        showVideoProcessingModal('Analyzing video...');
        updateProcessingProgress('Checking video properties...');
        
        const duration = await getVideoDuration(file);
        let needsProcessing = false;
        let statusMessages = [];
        
        if (duration > MAX_VIDEO_DURATION) {
          needsProcessing = true;
          statusMessages.push(`Video will be trimmed from ${Math.round(duration)}s to ${MAX_VIDEO_DURATION}s`);
        }
        
        if (file.size > MAX_FILE_SIZE) {
          needsProcessing = true;
          statusMessages.push(`Video will be compressed from ${(file.size / (1024 * 1024)).toFixed(1)}MB`);
        }
        
        // Even if no processing is needed locally, we'll still send it to the server
        // and let the server decide if it needs further processing.
        // The client-side "processing" here is mainly for user feedback and basic validation.
        hideVideoProcessingModal();
        if (needsProcessing) {
             showProcessingStatus('Video will be processed by server if needed: ' + statusMessages.join(' • '));
        } else {
             showProcessingStatus('Video is ready to upload (no client-side processing needed).');
        }
        
        return file; // Return the original file for upload; server handles actual processing
        
      } catch (error) {
        hideVideoProcessingModal();
        console.error('Video processing error:', error);
        showProcessingStatus('Video analysis complete. Server will handle any needed processing.', false);
        return file; // Always return the file, even on client-side analysis error, to attempt upload
      }
    }

    // Show toast
    function showToast(message, color = '#28a745') {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = message;
        toast.style.backgroundColor = color;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
      }
    }

    // Show/hide loading modal
    function showLoadingModal() {
      if (loadingModal) loadingModal.style.display = 'flex';
    }
    function hideLoadingModal() {
      if (loadingModal) loadingModal.style.display = 'none';
    }

    // Reset buttons
    function resetButtons() {
      if (publishButton) {
        publishButton.disabled = false;
        publishButton.textContent = isEditMode ? 'Update Ad' : 'Publish ad';
      }
      // Re-enable tabs if not in edit mode
      if (!isEditMode) {
          if (normalTab) normalTab.disabled = false;
          if (videoTab) videoTab.disabled = false;
      }
      hideLoadingModal();
    }

    // Format price input
    function formatPriceInput(value) {
      let cleanValue = value.replace(/[^\d.]/g, '');
      const parts = cleanValue.split('.');
      let integerPart = parts[0];
      let decimalPart = parts[1] || '';
      if (decimalPart.length > 2) decimalPart = decimalPart.substring(0, 2);
      integerPart = integerPart.replace(/^0+(?=\d)/, '');
      integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return decimalPart.length > 0 ? `${integerPart}.${decimalPart}` : integerPart;
    }

    // Parse price
    function parsePrice(value) {
      if (!value) return NaN;
      const numStr = value.replace(/,/g, '');
      return parseFloat(numStr);
    }

    // Price input event
    if (priceDisplay) {
      priceDisplay.addEventListener('input', (e) => {
        const cursorPosition = e.target.selectionStart;
        const oldLength = e.target.value.length;
        let formatted = formatPriceInput(e.target.value);
        e.target.value = formatted;
        const newLength = formatted.length;
        const diff = newLength - oldLength;
        e.target.selectionEnd = cursorPosition + diff;
        const numericValue = parsePrice(formatted);
        if (!isNaN(numericValue)) {
          priceHidden.value = numericValue.toFixed(2);
        } else {
          priceHidden.value = '';
        }
      });
    }
    
    

    // Photo preview and validation
    if (photoInput) {
      photoInput.addEventListener('change', function (e) {
        const photoError = document.getElementById('normal-photo-error');
        photoPreviewContainer.innerHTML = ''; // Clear previous preview
        photoError.style.display = 'none';
        const file = e.target.files[0];
        if (file) {
          if (!['image/jpeg', 'image/png'].includes(file.type)) {
            photoError.textContent = 'Only JPEG or PNG images are allowed';
            photoError.style.display = 'block';
            this.value = '';
            return;
          }
          if (file.size > MAX_FILE_SIZE) {
            photoError.textContent = 'Image size cannot exceed 6MB';
            photoError.style.display = 'block';
            this.value = '';
            return;
          }
          const img = document.createElement('img');
          img.src = URL.createObjectURL(file);
          img.alt = 'Image Preview';
          photoPreviewContainer.appendChild(img);
          existingPhotoUrlInput.value = ''; // Clear existing photo URL if new photo is uploaded
        } else if (isEditMode && existingPhotoUrlInput.value) {
          // If no new file selected but there was an existing one, re-display it
          const img = document.createElement('img');
          img.src = existingPhotoUrlInput.value;
          img.alt = 'Existing Product Image';
          img.style.maxWidth = '100%';
          img.style.maxHeight = '200px';
          img.style.marginTop = '10px';
          photoPreviewContainer.appendChild(img);
        }
      });
    }

// Video preview and validation with processing (Updated for video editor)
if (videoInput) {
  videoInput.addEventListener('change', async function (e) {
    const videoError = document.getElementById('video-error');
    const previewContainer = document.getElementById('video-preview-container');
    const editBtn = document.getElementById('edit-video-btn');
    
    previewContainer.innerHTML = '';
    videoError.style.display = 'none';
    hideProcessingStatus();
    processedVideoFile = null;
    
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'video/mp4') {
        videoError.textContent = 'Only MP4 videos are allowed';
        videoError.style.display = 'block';
        this.value = '';
        editBtn.style.display = 'none';
        return;
      }
      
      try {
        // Process the video (basic analysis)
        processedVideoFile = await processVideo(file);
        
        // Show preview
        const video = document.createElement('video');
        video.src = URL.createObjectURL(processedVideoFile);
        video.controls = true;
        video.muted = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '200px';
        previewContainer.appendChild(video);
        
        // Show edit button
        editBtn.style.display = 'inline-block';
        
        // Clear existing URLs
        existingVideoUrlInput.value = '';
        existingThumbnailUrlInput.value = '';
        
      } catch (error) {
        console.error('Video processing error:', error);
        videoError.textContent = 'Error processing video. Please try again.';
        videoError.style.display = 'block';
        this.value = '';
        editBtn.style.display = 'none';
      }
    } else {
      editBtn.style.display = 'none';
      if (isEditMode && existingVideoUrlInput.value) {
        const videoElement = document.createElement('video');
        videoElement.src = existingVideoUrlInput.value;
        videoElement.controls = true;
        videoElement.muted = true;
        videoElement.style.maxWidth = '100%';
        videoElement.style.maxHeight = '200px';
        previewContainer.appendChild(videoElement);
      }
    }
  });
}

    function isValidSalmartLink(link) {
  const VALID_BASE_DOMAINS = ['salmartonline.com.ng', 'salmart.onrender.com'];
  const VALID_LOCALHOST_DOMAIN = 'localhost'; // Allow localhost in dev

  try {
    const url = new URL(link);
    const hostname = url.hostname;

    // Check if hostname is localhost
    const isLocalhost = hostname === VALID_LOCALHOST_DOMAIN;

    // Check if hostname matches any Salmart domain (with or without www.)
    const isSalmartDomain = VALID_BASE_DOMAINS.some(domain =>
      hostname === domain || hostname === `www.${domain}`
    );

    // Enforce HTTPS in production, allow HTTP for localhost
    const isSecure = url.protocol === 'https:' || (isLocalhost && url.protocol === 'http:');

    if (!(isLocalhost || isSalmartDomain)) {
      return { valid: false, error: 'Link must be from Salmart (e.g., https://salmartonline.com.ng/)' };
    }

    if (!isSecure) {
      return { valid: false, error: 'Link must use HTTPS (or HTTP for localhost)' };
    }

    // Allow product paths: /product, /product.html, /product/ID, or /share
    const pathname = url.pathname;
    const isValidProductPath =
      pathname.startsWith('/product') ||
      pathname === '/product.html' ||
      pathname.startsWith('/share');

    if (!isValidProductPath) {
      return { valid: false, error: 'Link must lead to a product or share page on Salmart' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
    // Switch tabs
    function switchTab(type) {
      // Allow tab switching only if not in edit mode
      if (isEditMode && type !== currentPostType) {
          // In edit mode, we don't allow switching to a different ad type.
          // The form should already be populated for the correct type.
          return;
      }

      activeTab = type;
      if (type === 'normal') {
        normalForm.style.display = 'block';
        videoForm.style.display = 'none';
        normalTab.classList.add('active');
        videoTab.classList.remove('active');
      } else { // type === 'video'
        normalForm.style.display = 'none';
        videoForm.style.display = 'block';
        normalTab.classList.remove('active');
        videoTab.classList.add('active');
      }
      document.querySelectorAll('.error').forEach(err => err.style.display = 'none');
      
      // Clear previews and reset file inputs when switching tabs in non-edit mode
      if (!isEditMode) {
          document.getElementById('photo-preview-container').innerHTML = '';
          photoInput.value = ''; // Clear file input
          document.getElementById('video-preview-container').innerHTML = '';
          videoInput.value = ''; // Clear file input
          hideProcessingStatus();
          processedVideoFile = null;
          existingPhotoUrlInput.value = ''; // Clear existing URLs
          existingVideoUrlInput.value = '';
          existingThumbnailUrlInput.value = '';
      }
    }

    // Client-side validation function (simplified for brevity)
    function validateForm(form) {
      let isValid = true;
      const errorDivs = form.querySelectorAll('.error');
      errorDivs.forEach(div => div.style.display = 'none'); // Clear previous errors

      if (form.id === 'normal-ad-form') {
          const title = document.getElementById('title').value.trim();
          const description = document.getElementById('description').value.trim();
          const condition = document.getElementById('productCondition').value.trim();
          const price = parsePrice(document.getElementById('price-display').value);
          const location = document.getElementById('location').value.trim();
          const category = document.getElementById('category').value;
          const quantity = parseInt(document.getElementById('quantity').value) || 1;
if (isNaN(quantity) || quantity < 0) { 
    showFieldError('quantity-error', 'Quantity must be 0 or greater.'); 
    isValid = false; 
}
if (quantity > 10000) { 
    showFieldError('quantity-error', 'Quantity cannot exceed 10,000.'); 
    isValid = false; 
}
          const photoFile = photoInput.files[0];
          const existingPhoto = existingPhotoUrlInput.value;

          if (!title) { showFieldError('normal-title-error', 'Product title is required.'); isValid = false; }
          if (!description) { showFieldError('normal-description-error', 'Product description is required.'); isValid = false; }
          if (!condition) { showFieldError('normal-condition-error', 'Product condition is required.'); isValid = false; }
          if (isNaN(price) || price <= 0) { showFieldError('normal-price-error', 'Valid price is required.'); isValid = false; }
          if (!location) { showFieldError('normal-location-error', 'Location is required.'); isValid = false; }
          if (!category) { showFieldError('normal-category-error', 'Category is required.'); isValid = false; }
          
          if (!photoFile && !existingPhoto && !isEditMode) { // For new ads, photo is required
              showFieldError('normal-photo-error', 'Product image is required.'); isValid = false;
          } else if (photoFile && photoFile.size > MAX_FILE_SIZE) { // Check size for new upload
              showFieldError('normal-photo-error', 'Image size cannot exceed 6MB.'); isValid = false;
          } else if (photoFile && !['image/jpeg', 'image/png'].includes(photoFile.type)) {
              showFieldError('normal-photo-error', 'Only JPEG or PNG images are allowed.'); isValid = false;
          }

      } else if (form.id === 'video-ad-form') {
          const videoDescription = document.getElementById('video-description').value.trim();
          const videoCategory = document.getElementById('video-category').value;
          const productLink = document.getElementById('product-link').value.trim();
          const videoFile = videoInput.files[0];
          const existingVideo = existingVideoUrlInput.value;

          if (!videoDescription) { showFieldError('video-description-error', 'Video description is required.'); isValid = false; }
          if (!videoCategory) { showFieldError('video-category-error', 'Category is required.'); isValid = false; }
          
          const linkValidation = isValidSalmartLink(productLink);
          if (!linkValidation.valid) { showFieldError('product-link-error', linkValidation.error); isValid = false; }

          if (!videoFile && !existingVideo && !isEditMode) { // For new video ads, video is required
              showFieldError('video-error', 'Video file is required.'); isValid = false;
          } else if (videoFile && videoFile.size > MAX_FILE_SIZE) {
              showFieldError('video-error', 'Video size cannot exceed 6MB.'); isValid = false;
          } else if (videoFile && videoFile.type !== 'video/mp4') {
              showFieldError('video-error', 'Only MP4 videos are allowed.'); isValid = false;
          }
      }
      return isValid;
    }

    function showFieldError(id, message) {
      const el = document.getElementById(id);
      el.textContent = message;
      el.style.display = 'block';
    }

    // Enhanced response handling function
async function handleResponse(response) {
  const contentType = response.headers.get('content-type');
  
  // Check if response is JSON
  if (contentType && contentType.includes('application/json')) {
    try {
      const result = await response.json();
      return { success: response.ok, data: result };
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      return { 
        success: false, 
        data: { message: 'Invalid server response format' } 
      };
    }
  } else {
    // Handle non-JSON responses
    const textResponse = await response.text();
    console.warn('Non-JSON response:', textResponse);
    return { 
      success: response.ok, 
      data: { message: response.ok ? 'Success' : `Server error: ${response.status}` } 
    };
  }
}

// Updated submitAd function with better response handling
async function submitAd() {
  if (isSubmitting) {
    console.warn('Submission already in progress');
    return;
  }

  const isNormalTab = activeTab === 'normal';
  const form = isNormalTab ? normalForm : videoForm;

  if (!validateForm(form)) {
    showToast('Please correct the errors in the form.', '#dc3545');
    return;
  }

  const token = localStorage.getItem('authToken');
  if (!token) {
    showToast('Please log in to create/update an ad', '#dc3545');
    resetButtons();
    return;
  }

  isSubmitting = true;
  showLoadingModal();
  publishButton.disabled = true;
  publishButton.textContent = isEditMode ? 'Updating...' : 'Processing...';
  normalTab.disabled = true;
  videoTab.disabled = true;

  try {
    const formData = new FormData(form);

    if (isEditMode) {
      if (isNormalTab && !photoInput.files[0] && existingPhotoUrlInput.value) {
        formData.append('existingPhotoUrl', existingPhotoUrlInput.value);
      } else if (!isNormalTab && !videoInput.files[0] && existingVideoUrlInput.value) {
        formData.append('existingVideoUrl', existingVideoUrlInput.value);
        if (existingThumbnailUrlInput.value) {
          formData.append('existingThumbnailUrl', existingThumbnailUrlInput.value);
        }
      }
    }
    
    formData.set('postType', activeTab === 'normal' ? 'regular' : 'video_ad');

    let url;
    let method;

    if (isEditMode) {
      url = `${API_BASE_URL}/post/edit/${currentPostId}`;
      method = 'PUT';
    } else {
      url = `${API_BASE_URL}/post`;
      method = 'POST';
    }

    console.log('Submitting to:', url, 'Method:', method);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(url, {
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('Response status:', response.status, response.statusText);

    const { success, data } = await handleResponse(response);

    if (success) {
  showToast(isEditMode ? 'Ad updated successfully!' : 'Ad created successfully!', '#28a745');
  
  // Signal that a post was just created
  if (!isEditMode) {
    sessionStorage.setItem('justCreatedPost', 'true');
  }

  form.reset();
  if (document.getElementById('quantity')) {
    document.getElementById('quantity').value = 1; 
}
  document.getElementById('photo-preview-container').innerHTML = '';
  document.getElementById('video-preview-container').innerHTML = '';
  hideProcessingStatus();
  processedVideoFile = null;
  existingPhotoUrlInput.value = '';
  existingVideoUrlInput.value = '';
  existingThumbnailUrlInput.value = '';

  if (!isEditMode) {
    switchTab('normal');
  }
  
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1000);
} else {
      const errorMessage = data.message || `Server error: ${response.status} ${response.statusText}`;
      console.error('Server error:', errorMessage);
      showToast(errorMessage, '#dc3545');
    }

  } catch (error) {
    console.error('Submission error:', error);
    
    if (error.name === 'AbortError') {
      showToast('Request timed out. Please check your connection and try again.', '#dc3545');
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      showToast('Something went wrong. Please try again.', '#dc3545');
    } else {
      showToast('An unexpected error occurred. Please try again.', '#dc3545');
    }
  } finally {
    isSubmitting = false;
    resetButtons();
  }
}

    // Event listeners
    if (normalTab) normalTab.addEventListener('click', () => switchTab('normal'));
    if (videoTab) videoTab.addEventListener('click', () => switchTab('video'));
    if (publishButton) publishButton.addEventListener('click', submitAd);

    // Improved global error handler
    window.addEventListener('unhandledrejection', event => {
      console.error('[UNHANDLED PROMISE REJECTION]', event.reason);
      if (event.reason && event.reason.name === 'NotAllowedError' && 
          event.reason.message && event.reason.message.includes('play()')) {
        console.warn('Autoplay blocked by browser - this is expected and handled gracefully.');
        event.preventDefault(); 
        return;
      }
      showToast('An unexpected error occurred. Please try again.', '#dc3545');
    });

    // Initial check for userId
    const userId = localStorage.getItem('userId');
    if (!userId) {
      console.warn('[AUTH] No userId found in localStorage. User might not be logged in.');
      showToast('Please log in to create or edit ads.', '#ffc107');
    }

    // --- Initialize edit mode on page load ---
    document.addEventListener('DOMContentLoaded', initializeEditMode);
  