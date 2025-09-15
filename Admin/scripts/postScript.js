document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('dataForm');
  const fileInput = document.getElementById('file-input');
  const preview = document.getElementById('preview');
  const submitBtn = form.querySelector('button[type="submit"]');
  const token = localStorage.getItem('authToken');

  // Check authentication
  if (!token) {
    showToast('Please log in first', '#dc3545');
    window.location.href = '/SignIn.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isEdit = urlParams.get('edit') === 'true';
  const postId = urlParams.get('postId');

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://salmart.onrender.com';

  // Prefill form if editing
  if (isEdit && postId) {
    try {
      const response = await fetch(`${API_BASE_URL}/post/${postId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load post');
      }

      const data = await response.json();
      const post = data.post || data; // Handle different response structures

      document.getElementById('description').value = post.description || '';
      document.getElementById('productCondition').value = post.productCondition || '';
      document.getElementById('category').value = post.category || '';
      
      // Format price with ₦ and commas when displaying
      if (post.price) {
        const priceValue = typeof post.price === 'string' 
          ? parseFloat(post.price.replace(/[^0-9.]/g, '')) 
          : post.price;
        document.getElementById('price').value = `₦${priceValue.toLocaleString('en-NG')}`;
      }
      
      document.getElementById('location').value = post.location || '';

      if (post.photoUrl) {
        preview.src = post.photoUrl;
        preview.style.display = 'block';
        fileInput.required = false; // Make image not required when editing
      }
    } catch (err) {
      console.error('Error loading post:', err);
      showToast(err.message || 'Error loading post', '#dc3545');
    }
  }

  // Preview selected image
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        showToast('Please upload a valid image (JPEG, PNG, JPG)', '#dc3545');
        fileInput.value = ''; // Clear the input
        return;
      }

      // Validate file size (e.g., 5MB max)
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image size should be less than 5MB', '#dc3545');
        fileInput.value = ''; // Clear the input
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  const priceInput = document.getElementById('price');

  // Format price input with ₦ and commas
  priceInput.addEventListener('input', (event) => {
    let value = event.target.value.replace(/[^0-9.]/g, ''); // Allow only numbers and decimal
    
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Format integer part with commas
    let [integer, decimal] = value.split('.');
    integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Limit decimal places to 2
    if (decimal) {
      decimal = decimal.substring(0, 2);
      value = `${integer}.${decimal}`;
    } else {
      value = integer;
    }
    
    event.target.value = value ? `₦${value}` : ''; // Add ₦ only if there's a value
  });

  // Ensure cursor position isn't affected by ₦
  priceInput.addEventListener('keydown', (event) => {
    if (event.target.selectionStart === 1 && event.key === 'Backspace') {
      event.preventDefault();
      event.target.value = '';
    }
  });

  // Handle form submission
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const description = document.getElementById('description').value.trim();
    const productCondition = document.getElementById('productCondition').value.trim();
    const formattedPrice = document.getElementById('price').value.trim();
    const location = document.getElementById('location').value.trim();
    const category = document.getElementById('category').value.trim(); // Fixed this line
    const file = fileInput.files[0];

    // Clean the price (remove ₦ and commas)
    const cleanPrice = formattedPrice.replace(/[₦,]/g, '');
    
    // Validation
    if (!description || description.length < 10) {
      showToast('Description must be at least 10 characters', '#dc3545');
      return;
    }

    if (!cleanPrice || isNaN(cleanPrice)) {
      showToast('Please enter a valid price', '#dc3545');
      return;
    }

    if (!location) {
      showToast('Please enter a location', '#dc3545');
      return;
    }

    if (!category) {
      showToast('Please select a category', '#dc3545');
      return;
    }

    if (!isEdit && !file) {
      showToast('Please upload an image', '#dc3545');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';

    try {
      const formData = new FormData();
      formData.append('description', description);
      formData.append('productCondition', productCondition);
      formData.append('category', category);
      formData.append('price', cleanPrice);
      formData.append('location', location);
      if (file) formData.append('photo', file);

      const endpoint = isEdit && postId 
        ? `${API_BASE_URL}/post/edit/${postId}`
        : `${API_BASE_URL}/post`;

      const method = isEdit && postId ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 
          result.error || 
          (result.errors ? result.errors.join(', ') : 'Request failed')
        );
      }

      showToast(
        isEdit ? 'Post updated successfully!' : 'Post created successfully!', 
        '#28a745'
      );
      
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 1500);
    } catch (error) {
      console.error('API Error:', error);
      showToast(
        error.message || 'Something went wrong. Please try again.', 
        '#dc3545'
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = isEdit ? 'Update Post' : 'Create Post';
    }
  });
});

// Toast function (in case it's not defined elsewhere)
function showToast(message, backgroundColor = '#28a745') {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.padding = '10px 20px';
  toast.style.backgroundColor = backgroundColor;
  toast.style.color = 'white';
  toast.style.borderRadius = '5px';
  toast.style.zIndex = '1000';
  toast.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.5s';
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 500);
  }, 3000);
}