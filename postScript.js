
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('dataForm');
  const fileInput = document.getElementById('file-input');
  const preview = document.getElementById('preview');
  const token = localStorage.getItem('authToken');
  const urlParams = new URLSearchParams(window.location.search);
  const isEdit = urlParams.get('edit') === 'true';
  const postId = urlParams.get('postId');

  // Prefill form if editing
  if (isEdit && postId) {
    fetch(`http://localhost:3000/post/${postId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const post = data.post;
          document.getElementById('description').value = post.description || '';
          document.getElementById('productCondition').value = post.productCondition || '';
          document.getElementById('price').value = post.price || '';
          document.getElementById('location').value = post.location || '';

          // Show image preview
          if (post.photoUrl) {
            preview.src = post.photoUrl;
            preview.style.display = 'block';
          }
        } else {
          alert('Failed to load post for editing');
        }
      })
      .catch((err) => {
        console.error('Error loading post:', err);
        alert('Error loading post for editing.');
      });
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

  // Handle form submission
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const description = document.getElementById('description').value;
    const productCondition = document.getElementById('productCondition').value;
    const price = document.getElementById('price').value;
    const location = document.getElementById('location').value;
    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append('description', description);
    formData.append('productCondition', productCondition);
    formData.append('price', price);
    formData.append('location', location);

    // If a new image is selected
    if (file) {
      formData.append('photo', file);
    }

    try {
      let response;
      if (isEdit && postId) {
        // EDIT mode (PUT request)
        response = await fetch(`http://localhost:3000/post/edit/${postId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
      } else {
        // CREATE mode (POST request)
        if (!file) {
          showToast('Please upload an image.');
          return;
        }
        response = await fetch('http://localhost:3000/post', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
      }

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Request failed');

      showToast(isEdit ? 'Post updated successfully!' : 'Post created successfully!');
      window.location.href = '/index.html'; // Redirect to homepage
    } catch (error) {
      console.error(isEdit ? 'Error updating post:' : 'Error creating post:', error);
      showToast("something went wrong", "#dc3545"); // red for error
    }
  });
});
