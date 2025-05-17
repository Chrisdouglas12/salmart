// market.js
let currentCategory = 'all';
let allPostsCache = [];

function initCategoryFilter() {
  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      categoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      await fetchPostsByCategory();
    });
  });
}

async function fetchPostsByCategory() {
  const postsContainer = document.getElementById('posts-container');
  postsContainer.innerHTML = `
    <div class="skeleton skeleton-post"></div>
    <div class="skeleton skeleton-post"></div>
    <div class="skeleton skeleton-post"></div>
  `;
  try {
    const response = await fetch(`${window.API_BASE_URL}/posts?category=${currentCategory}`);
    const posts = await response.json();
    allPostsCache = posts;
    postsContainer.innerHTML = posts.map(post => `
      <div class="post">
        <img src="${post.image || 'default-post.png'}" alt="${post.title}">
        <h3>${post.title}</h3>
        <p>${post.description}</p>
        <button onclick="window.likePost('${post._id}', localStorage.getItem('userId'))">Like</button>
        <button onclick="window.commentPost('${post._id}', localStorage.getItem('userId'), prompt('Enter comment'))">Comment</button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error fetching posts:', error);
    postsContainer.innerHTML = '<p>Error loading posts</p>';
  }
}

function openImage(imageUrl) {
  const modal = document.getElementById('imageModal');
  const fullImage = document.getElementById('fullImage');
  fullImage.src = imageUrl;
  modal.style.display = 'flex';
  modal.onclick = (event) => {
    if (event.target === modal || event.target.classList.contains('close')) {
      modal.style.display = 'none';
    }
  };
}

window.initCategoryFilter = initCategoryFilter;
window.fetchPostsByCategory = fetchPostsByCategory;
window.openImage = openImage;