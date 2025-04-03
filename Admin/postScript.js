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
    : 'https://salmart-production.up.railway.app';

  // Prefill form if editing
  if (isEdit && postId) {
    try {
      const response = await fetch(`${API_BASE_URL}/post/${postId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load post');

      const post = data.post;
      document.getElementById('description').value = post.description || '';
      document.getElementById('productCondition').value = post.productCondition || '';
      
      // Format price with ₦ and commas when displaying
      document.getElementById('price').value = post.price 
        ? `₦${parseFloat(post.price).toLocaleString('en-NG')}` 
        : '';
      
      document.getElementById('location').value = post.location || '';

      if (post.photoUrl) {
        preview.src = post.photoUrl;
        preview.style.display = 'block';
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

  // Ensure ₦ is present when focused
  priceInput.addEventListener('focus', (event) => {
    if (!event.target.value.startsWith('₦') && event.target.value) {
      event.target.value = `₦${event.target.value}`;
    }
  });

  // Handle form submission
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const description = document.getElementById('description').value.trim();
    const productCondition = document.getElementById('productCondition').value.trim();
    const formattedPrice = document.getElementById('price').value.trim();
    const location = document.getElementById('location').value.trim();
    const file = fileInput.files[0];

    // Clean the price (remove ₦ and commas)
    const cleanPrice = formattedPrice.replace(/[₦,]/g, '');
    
    // Validation
    if (!description || !cleanPrice || !location) {
      showToast('Please fill all required fields', '#dc3545');
      return;
    }

    if (!isEdit && !file) {
      showToast('Please upload an image', '#dc3545');
      return;
    }

    submitBtn.disabled = true;

    const formData = new FormData();
    formData.append('description', description);
    formData.append('productCondition', productCondition);
    formData.append('price', cleanPrice); // Send cleaned price (e.g., "5000.50")
    formData.append('location', location);
    if (file) formData.append('photo', file);

    try {
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
      if (!response.ok) throw new Error(result.message || 'Request failed');

      showToast(isEdit ? 'Post updated!' : 'Post created!');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 1500);
    } catch (error) {
      console.error('API Error:', error);
      showToast(error.message || 'Something went wrong', '#dc3545');
    } finally {
      submitBtn.disabled = false;
    }
  });
});