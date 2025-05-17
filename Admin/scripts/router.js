// router.js
const routes = {
  '/': {
    template: `
      <div class="create-post-container">
        <div>
          <a href="/ads" data-link><button class="post-input" style="background-color:#007bff; color: white; font-family: 'Poppins'; font-size: 12px"><i class="fas fa-bullhorn"></i>Create an ad</button></a>
          <a href="/request" data-link><button class="post-input" style="background-color: #28a745; color: white; font-family: 'Poppins'; font-size: 12px">Create a request <i class="fas fa-circle-plus"></i></button></a>
        </div>
        <div class="category-filter">
          <div class="category-scroll-wrapper">
            <div class="category-scroll">
              <button class="category-btn active" data-category="all"><i class="fas fa-layer-group"></i>All</button>
              <button class="category-btn" data-category="electronics"><i class="fas fa-tv"></i>Electronics</button>
              <button class="category-btn" data-category="fashion"><i class="fas fa-tshirt"></i>Fashion</button>
              <button class="category-btn" data-category="home"><i class="fas fa-tree"></i>Home & Garden</button>
              <button class="category-btn" data-category="vehicles"><i class="fas fa-car"></i>Vehicles</button>
              <button class="category-btn" data-category="music"><i class="fas fa-guitar"></i>Music Gear</button>
              <button class="category-btn" data-category="others"><i class="fas fa-box-open"></i>Other</button>
            </div>
          </div>
        </div>
      </div>
      <div id="posts-container">
        <div class="skeleton skeleton-post"></div>
        <div class="skeleton skeleton-post"></div>
        <div class="skeleton skeleton-post"></div>
      </div>
      <div class="request-feed-container">
        <div id="request-feed" class="request-feed"></div>
      </div>
    `,
    script: async () => {
      await window.fetchPostsByCategory();
      window.initCategoryFilter();
    }
  },
  '/requests': {
    template: `<div id="request-list"><div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div></div>`,
    script: async () => {
      const list = document.getElementById('request-list');
      list.innerHTML = '<div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div>';
      const response = await fetch(`${window.API_BASE_URL}/requests`);
      const requests = await response.json();
      list.innerHTML = requests.map(r => `<div class="request"><h3>${r.title}</h3><p>${r.description}</p></div>`).join('');
    }
  },
  '/alerts': {
    template: `
      <h3>Alerts</h3>
      <div id="notifications-wrapper">
        <div id="notifications">
          <div class="skeleton skeleton-notification"></div>
          <div class="skeleton skeleton-notification"></div>
        </div>
        <p id="no-alerts" style="display: none;">No alerts for now, check later!</p>
      </div>
    `,
    script: async () => {
      async function fetchNotifications() {
        const notificationsContainer = document.getElementById('notifications');
        const noAlertsMessage = document.getElementById('no-alerts');
        notificationsContainer.innerHTML = `
          <div class="skeleton skeleton-notification"></div>
          <div class="skeleton skeleton-notification"></div>
        `;
        try {
          const response = await fetch(`${window.API_BASE_URL}/notifications`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
          });
          if (!response.ok) throw new Error('Failed to fetch notifications');
          const notifications = await response.json();
          notificationsContainer.innerHTML = '';
          if (notifications.length === 0) {
            noAlertsMessage.style.display = 'block';
            return;
          }
          noAlertsMessage.style.display = 'none';
          notifications.forEach(notification => {
            const notificationElement = document.createElement('div');
            notificationElement.classList.add('notification');
            let notificationText = '';
            if (notification.type === 'like') {
              notificationText = `<p style="margin-top: 0; margin-bottom: 0; margin-left: 70%; color: #17a2b8; font-weight: 600;">Reactions</p>${notification.senderId.firstName} ${notification.senderId.lastName} liked your post.`;
            } else if (notification.type === 'comment') {
              notificationText = `${notification.senderId.firstName} ${notification.senderId.lastName} commented on your ad`;
            } else if (notification.type === 'payment') {
              notificationText = `<p style="color: #28a745; margin-left: -100%; margin-bottom: 10px; font-weight: 600;">Payment</p><strong>${notification.senderId.firstName} ${notification.senderId.lastName}</strong> payed for <strong>"${notification.payment}" kindly release delivery address"</strong>`;
            } else if (notification.type === 'delivery') {
              notificationText = `<p style="color: #28a745; margin-left: -100%; margin-bottom: 10px; font-weight: 600;">Funds Transfer</p><strong>${notification.senderId.firstName} ${notification.senderId.lastName}</strong> has confirmed your delivery of <strong>"${notification.payment}".</strong> Your funds have been released to your bank account.`;
            } else if (notification.type === 'warning') {
              notificationText = `<p style="color: #28a745; margin-left: -100%; margin-bottom: 10px; font-weight: 600;">Bank Details</p>Please add your bank details to receive payment from <strong>${notification.senderId.firstName} ${notification.senderId.lastName}.</strong>`;
            }
            notificationElement.innerHTML = `
              <img src="${notification.senderId.profilePicture || 'default-avatar.png'}" class="notification-avatar">
              <div class="notification-content">
                <p><a href="/post-details?postId=${notification.postId}" data-link style="text-decoration: none; color: inherit">${notificationText}</a></p>
                <span class="notification-time">${window.formatTime(notification.createdAt)}</span>
              </div>
            `;
            notificationsContainer.appendChild(notificationElement);
          });
          await window.markNotificationsAsRead();
        } catch (error) {
          console.error('Error fetching notifications:', error);
          notificationsContainer.innerHTML = '<p>Error loading notifications</p>';
        }
      }
      fetchNotifications();
    }
  },
  '/messages': {
    template: `<div id="messages-list"><div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div></div>`,
    script: async () => {
      const list = document.getElementById('messages-list');
      list.innerHTML = '<div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div>';
      const userId = localStorage.getItem('userId');
      const response = await fetch(`${window.API_BASE_URL}/messages?userId=${userId}`);
      const messages = await response.json();
      list.innerHTML = messages.map(m => `<div class="message"><p>${m.text} from ${m.senderId}</p></div>`).join('');
      window.clearBadge('messages');
    }
  },
  '/deals': {
    template: `<div id="deals-list"><div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div></div>`,
    script: async () => {
      const list = document.getElementById('deals-list');
      list.innerHTML = '<div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div>';
      const userId = localStorage.getItem('userId');
      const response = await fetch(`${window.API_BASE_URL}/deals?userId=${userId}`);
      const deals = await response.json();
      list.innerHTML = deals.map(d => `<div class="deal"><h3>${d.title}</h3><p>${d.description}</p></div>`).join('');
      window.clearBadge('deals');
    }
  },
  '/profile': {
    template: `
      <div id="profile-container">
        <div class="skeleton skeleton-profile-pic"></div>
        <div class="skeleton skeleton-username"></div>
        <div class="skeleton skeleton-button"></div>
        <div class="stats">
          <div class="stats-item"><div class="skeleton skeleton-stats-text"></div><div class="skeleton skeleton-stats-number"></div></div>
          <div class="stats-item"><div class="skeleton skeleton-stats-text"></div><div class="skeleton skeleton-stats-number"></div></div>
          <div class="stats-item"><div class="skeleton skeleton-stats-text"></div><div class="skeleton skeleton-stats-number"></div></div>
          <div class="stats-item"><div class="skeleton skeleton-stats-text"></div><div class="skeleton skeleton-stats-number"></div></div>
        </div>
        <div id="posts-container">
          <div class="skeleton skeleton-post"></div>
          <div class="skeleton skeleton-post"></div>
        </div>
      </div>
    `,
    script: async () => {
      const userId = localStorage.getItem('userId');
      const profileOwnerId = new URLSearchParams(window.location.search).get('userId') || userId;
      const response = await fetch(`${window.API_BASE_URL}/profile/${profileOwnerId}`);
      const data = await response.json();
      const isOwnProfile = userId === profileOwnerId;
      const container = document.getElementById('profile-container');
      container.innerHTML = `
        <img src="${data.profilePicture || 'default-avatar.png'}" id="profile-picture" class="profile-picture">
        <h1 id="username">${data.name || 'User'}</h1>
        ${!isOwnProfile ? `<button id="follow-button" class="follow-button">${data.isFollowing ? 'Following' : 'Follow'}</button>` : ''}
        <div class="stats">
          <div class="stats-item"><p>Followers</p><h3 id="followers">${data.followersCount || 0}</h3></div>
          <div class="stats-item"><p>Products</p><h3 id="products-count">${data.productsCount || 0}</h3></div>
          <div class="stats-item"><p>Rating</p><h3 id="average-rating">${data.averageRating || 0.0}</h3></div>
          <div class="stats-item"><p>Reviews</p><h3 id="reviews-count">${data.reviewsCount || 0}</h3></div>
        </div>
        <div id="posts-container"></div>
      `;
      if (!isOwnProfile) {
        const followButton = document.getElementById('follow-button');
        followButton.addEventListener('click', async () => {
          const action = followButton.textContent === 'Follow' ? 'follow' : 'unfollow';
          await fetch(`${window.API_BASE_URL}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
            body: JSON.stringify({ followerId: userId, followingId: profileOwnerId })
          });
          followButton.textContent = action === 'follow' ? 'Following' : 'Follow';
        });
      }
      const postsResponse = await fetch(`${window.API_BASE_URL}/posts?userId=${profileOwnerId}`);
      const posts = await postsResponse.json();
      const postsContainer = document.getElementById('posts-container');
      postsContainer.innerHTML = posts.map(p => `
        <div class="post">
          <h3>${p.title}</h3>
          <p>${p.description}</p>
          <img src="${p.image}" alt="${p.title}">
        </div>
      `).join('');
    }
  },
  '/ads': {
    template: `
      <div id="ads-form">
        <h2>Create an Ad</h2>
        <form id="create-ad-form">
          <input type="text" id="ad-title" placeholder="Ad Title" required>
          <textarea id="ad-description" placeholder="Ad Description" required></textarea>
          <input type="file" id="ad-image" accept="image/*">
          <button type="submit">Submit Ad</button>
        </form>
      </div>
    `,
    script: () => {
      const form = document.getElementById('create-ad-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('title', document.getElementById('ad-title').value);
        formData.append('description', document.getElementById('ad-description').value);
        formData.append('image', document.getElementById('ad-image').files[0]);
        formData.append('userId', localStorage.getItem('userId'));
        await fetch(`${window.API_BASE_URL}/ads`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
          body: formData
        });
        window.showToast('Ad created successfully!', '#28a745');
        window.navigateTo('/');
      });
    }
  },
  '/request': {
    template: `
      <div id="request-form">
        <h2>Create a Request</h2>
        <form id="create-request-form">
          <input type="text" id="request-title" placeholder="Request Title" required>
          <textarea id="request-description" placeholder="Request Description" required></textarea>
          <button type="submit">Submit Request</button>
        </form>
      </div>
    `,
    script: () => {
      const form = document.getElementById('create-request-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
          title: document.getElementById('request-title').value,
          description: document.getElementById('request-description').value,
          userId: localStorage.getItem('userId')
        };
        await fetch(`${window.API_BASE_URL}/requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          },
          body: JSON.stringify(data)
        });
        window.showToast('Request created successfully!', '#28a745');
        window.navigateTo('/requests');
      });
    }
  },
  '/search': {
    template: `
      <div id="search-container">
        <input type="text" id="search-input" placeholder="Search for items...">
        <div id="search-results">
          <div class="skeleton skeleton-post"></div>
          <div class="skeleton skeleton-post"></div>
        </div>
      </div>
    `,
    script: async () => {
      const input = document.getElementById('search-input');
      input.addEventListener('input', async () => {
        const query = input.value;
        const results = document.getElementById('search-results');
        results.innerHTML = '<div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div>';
        const response = await fetch(`${window.API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
        const items = await response.json();
        results.innerHTML = items.map(item => `
          <div class="post">
            <h3>${item.title}</h3>
            <p>${item.description}</p>
            <img src="${item.image}" alt="${item.title}">
          </div>
        `).join('');
      });
    }
  },
  '/privacy': {
    template: `
      <div id="privacy-policy">
        <h2>Privacy Policy</h2>
        <p>This is the privacy policy for Salmart...</p>
      </div>
    `,
    script: () => {}
  },
  '/community-standards': {
    template: `
      <div id="community-standards">
        <h2>Community Standards</h2>
        <p>These are the community standards for Salmart...</p>
      </div>
    `,
    script: () => {}
  },
  '/hire-skills': {
    template: `
      <div id="hire-skills">
        <h2>Hire Skills</h2>
        <div id="skills-list">
          <div class="skeleton skeleton-post"></div>
          <div class="skeleton skeleton-post"></div>
        </div>
      </div>
    `,
    script: async () => {
      const list = document.getElementById('skills-list');
      list.innerHTML = '<div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div>';
      const response = await fetch(`${window.API_BASE_URL}/skills`);
      const skills = await response.json();
      list.innerHTML = skills.map(s => `<div class="skill"><h3>${s.title}</h3><p>${s.description}</p></div>`).join('');
    }
  },
  '/receipts': {
    template: `
      <div id="receipts">
        <h2>Generate Receipts</h2>
        <form id="receipt-form">
          <input type="text" id="receipt-title" placeholder="Receipt Title" required>
          <textarea id="receipt-details" placeholder="Receipt Details" required></textarea>
          <button type="submit">Generate Receipt</button>
        </form>
        <div id="receipts-list">
          <div class="skeleton skeleton-post"></div>
          <div class="skeleton skeleton-post"></div>
        </div>
      </div>
    `,
    script: async begun () => {
      const form = document.getElementById('receipt-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
          title: document.getElementById('receipt-title').value,
          details: document.getElementById('receipt-details').value,
          userId: localStorage.getItem('userId')
        };
        await fetch(`${window.API_BASE_URL}/receipts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          },
          body: JSON.stringify(data)
        });
        window.showToast('Receipt generated successfully!', '#28a745');
      });
      const list = document.getElementById('receipts-list');
      list.innerHTML = '<div class="skeleton skeleton-post"></div><div class="skeleton skeleton-post"></div>';
      const userId = localStorage.getItem('userId');
      const response = await fetch(`${window.API_BASE_URL}/receipts?userId=${userId}`);
      const receipts = await response.json();
      list.innerHTML = receipts.map(r => `<div class="receipt"><h3>${r.title}</h3><p>${r.details}</p></div>`).join('');
    }
  },
  '/signin': {
    template: `
      <div id="signin-form">
        <h2>Sign In</h2>
        <form id="login-form">
          <input type="text" id="username" placeholder="Username" required>
          <input type="password" id="password" placeholder="Password" required>
          <button type="submit">Login</button>
        </form>
      </div>
    `,
    script: () => {
      const form = document.getElementById('login-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        };
        const response = await fetch(`${window.API_BASE_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
          localStorage.setItem('userId', result.userId);
          localStorage.setItem('authToken', result.token);
          window.socket.emit('joinRoom', result.userId);
          window.showToast('Logged in successfully!', '#28a745');
          window.navigateTo('/');
        } else {
          window.showToast('Login failed!', '#e74c3c');
        }
      });
    }
  },
  '/post-details': {
    template: `
      <div id="post-details">
        <h2>Post Details</h2>
        <div id="post-content">
          <div class="skeleton skeleton-post"></div>
        </div>
      </div>
    `,
    script: async () => {
      const postId = new URLSearchParams(window.location.search).get('postId');
      const content = document.getElementById('post-content');
      content.innerHTML = '<div class="skeleton skeleton-post"></div>';
      try {
        const response = await fetch(`${window.API_BASE_URL}/posts/${postId}`);
        const post = await response.json();
        content.innerHTML = `
          <div class="post">
            <h3>${post.title}</h3>
            <p>${post.description}</p>
            <img src="${post.image || 'default-post.png'}" alt="${post.title}">
          </div>
        `;
      } catch (error) {
        console.error('Error fetching post details:', error);
        content.innerHTML = '<p>Error loading post</p>';
      }
    }
  }
};

const cache = new Map();

function navigateTo(path, query = '') {
  const fullPath = query ? `${path}${query}` : path;
  const route = routes[path.split('?')[0]] || routes['/'];
  const app = document.getElementById('app');

  if (window.location.pathname !== path) {
    cache.set(window.location.pathname, app.innerHTML);
  }

  if (cache.has(fullPath)) {
    app.innerHTML = cache.get(fullPath);
  } else {
    app.innerHTML = route.template;
  }

  document.querySelectorAll('#navbar li').forEach(li => li.classList.remove('active'));
  const navLink = document.querySelector(`#navbar a[href="${path.split('?')[0]}"]`);
  if (navLink) navLink.parentElement.classList.add('active');

  document.querySelectorAll('.side-bar li').forEach(li => li.classList.remove('active'));
  const sidebarLink = document.querySelector(`.side-bar a[href="${path.split('?')[0]}"]`);
  if (sidebarLink) sidebarLink.parentElement.classList.add('active');

  history.pushState({ path: fullPath }, '', fullPath);

  if (route.script) route.script();

  document.title = path === '/' ? 'Home | Salmart' : `${path.split('?')[0].replace('/', '').replace('-', ' ').replace(/(^\w|\s\w)/g, c => c.toUpperCase())} | Salmart`;
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-link]');
  if (link) {
    e.preventDefault();
    const href = link.getAttribute('href');
    const [path, query] = href.split('?');
    navigateTo(path, query ? `?${query}` : '');
  }
});

window.addEventListener('popstate', (e) => {
  navigateTo(e.state ? e.state.path : window.location.pathname);
});

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

window.onload = function() {
  const isLoggedIn = localStorage.getItem('userId');
  const logoutText = document.getElementById('logout-text');
  const logoutLink = document.getElementById('logout-link');
  if (isLoggedIn) {
    logoutText.innerText = 'Log out';
    logoutLink.addEventListener('click', (event) => {
      event.preventDefault();
      localStorage.removeItem('userId');
      localStorage.removeItem('authToken');
      window.socket.emit('leaveRoom', localStorage.getItem('userId'));
      window.showToast('Logged out successfully!', '#28a745');
      window.navigateTo('/signin');
    });
  } else {
    logoutText.innerText = 'Log in';
  }
  window.navigateTo(window.location.pathname, window.location.search);
};