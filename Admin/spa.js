// Base URL for API
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart-production.up.railway.app';

// Initialize Socket.IO once and make it globally available
const socket = io(`${API_BASE_URL}`, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
});
window.socket = socket;

// Routes configuration
const routes = {
  'market': { content: 'market.html', title: 'Market | Salmart', script: 'homeScript.js' },
  'requests': { content: 'requests.html', title: 'Requests | Salmart' },
  'alerts': { content: 'alerts.html', title: 'Alerts | Salmart', script: 'alert-spa.js' },
  'messages': { content: 'messages.html', title: 'Messages | Salmart' },
  'deals': { content: 'deals.html', title: 'Deals | Salmart' },
  'profile': { content: 'profile.html', title: 'Profile | Salmart', script: 'profilePostScript.js' },
  'hire-skills': { content: 'hire-skills.html', title: 'Hire Skills | Salmart' },
  'generate-receipts': { content: 'generate-receipts.html', title: 'Generate Receipts | Salmart' },
  'privacy-policy': { content: 'privacy-policy.html', title: 'Privacy Policy | Salmart' },
  'community-standards': { content: 'community-standards.html', title: 'Community Standards | Salmart' },
  'logout': { action: handleLogout }
};

// Cache object to store route content, timestamps, and dynamic state
const routeCache = {
  market: { content: '', timestamp: null, isLoaded: false },
  alerts: { content: '', timestamp: null, isLoaded: false },
  messages: { content: '', timestamp: null, isLoaded: false },
  deals: { content: '', timestamp: null, isLoaded: false },
  profile: { content: '', timestamp: null, isLoaded: false },
};

// Array to store re-initialization functions for each route
window.reinitializeScripts = window.reinitializeScripts || {};

// Load Navbar and Sidebar
async function loadComponents() {
  try {
    const navbarResponse = await fetch('navbar.html');
    if (!navbarResponse.ok) throw new Error(`Failed to fetch navbar.html: ${navbarResponse.status}`);
    const navbarHtml = await navbarResponse.text();
    const navbarContainer = document.getElementById('navbar-container');
    if (!navbarContainer) throw new Error('Navbar container not found');
    navbarContainer.innerHTML = navbarHtml;

    const sidebarResponse = await fetch('sidebar.html');
    if (!sidebarResponse.ok) throw new Error(`Failed to fetch sidebar.html: ${sidebarResponse.status}`);
    const sidebarHtml = await sidebarResponse.text();
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) throw new Error('Sidebar container not found');
    sidebarContainer.innerHTML = sidebarHtml;

    initializeNavbar();
    initializeSidebar();

    if (typeof checkLoginStatus === 'function') {
      console.log('Initializing checkLoginStatus');
      checkLoginStatus();
    } else {
      console.warn('checkLoginStatus function not found');
    }
  } catch (error) {
    console.error('Error loading components:', error);
    showToast('Failed to load navigation components');
  }
}

// Initialize Navbar Event Listeners
function initializeNavbar() {
  const navLinks = document.querySelectorAll('#navbar a[data-route]');
  if (!navLinks.length) console.warn('No navbar links found');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = link.dataset.route;
      navigateTo(route);
    });
  });
}

// Initialize Sidebar Event Listeners
function initializeSidebar() {
  const menuIcon = document.querySelector('.menu-icon');
  const sideBar = document.querySelector('.side-bar');
  const body = document.body;

  if (!menuIcon || !sideBar) {
    console.error('Menu icon or sidebar not found');
    return;
  }

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

  const sidebarLinks = document.querySelectorAll('.side-bar a[data-route]');
  if (!sidebarLinks.length) console.warn('No sidebar links found');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = link.dataset.route;
      navigateTo(route);
    });
  });

  const logoutLink = document.getElementById('logout-link');
  const logoutText = document.getElementById('logout-text');
  if (!logoutLink || !logoutText) {
    console.error('Logout link or text element not found');
    return;
  }
  const isLoggedIn = localStorage.getItem('userId');
  if (isLoggedIn) {
    logoutText.innerText = 'Log out';
    logoutLink.dataset.route = 'logout';
  } else {
    logoutText.innerText = 'Log in';
    logoutLink.href = 'SignIn.html';
  }
}

// Handle Logout
function handleLogout() {
  localStorage.removeItem('userId');
  window.location.href = 'SignIn.html';
}

// Navigate to a Route
async function navigateTo(route) {
  const routeConfig = routes[route];
  if (!routeConfig) {
    console.error('Route not found:', route);
    showToast('Page not found');
    return;
  }

  if (routeConfig.action) {
    routeConfig.action();
    return;
  }

  updateActiveNav(route);
  window.history.pushState({ route }, '', `#${route}`);

  try {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) throw new Error('Main content container not found');

    // Check cache
    if (routeCache[route] && routeCache[route].content && routeCache[route].isLoaded && !needsReload(route)) {
      mainContent.innerHTML = routeCache[route].content;
      document.title = routeConfig.title;
      console.log(`Loaded ${route} from cache`);
      window.skipFetch = true;
      // Reinitialize event listeners for this route
      if (window.reinitializeScripts[route]) {
        window.reinitializeScripts[route]();
        console.log(`Reinitialized event listeners for ${route}`);
      }
    } else {
      const response = await fetch(routeConfig.content);
      if (!response.ok) throw new Error(`Failed to fetch ${routeConfig.content}: ${response.status}`);
      const content = await response.text();
      mainContent.innerHTML = content;
      routeCache[route] = { content, timestamp: new Date().getTime(), isLoaded: false };
      document.title = routeConfig.title;
      console.log(`Loaded ${route} from server`);
      window.skipFetch = false;
    }

    // Load route-specific script if specified
    if (routeConfig.script) {
      const existingScript = document.querySelector(`script[src="${routeConfig.script}"]`);
      if (existingScript) existingScript.remove();
      const script = document.createElement('script');
      script.src = routeConfig.script;
      script.async = true;
      script.onload = () => {
        console.log(`${routeConfig.script} loaded successfully`);
        if (!window.skipFetch) {
          routeCache[route].content = mainContent.innerHTML;
          routeCache[route].isLoaded = true;
        }
      };
      script.onerror = () => console.error(`Failed to load ${routeConfig.script}`);
      document.body.appendChild(script);
    }

    initializeContentScripts();
  } catch (error) {
    console.error('Error loading content:', error);
    showToast('Failed to load content');
  }
}

// Update Active Navigation State
function updateActiveNav(route) {
  const navLinks = document.querySelectorAll('#navbar a[data-route]');
  navLinks.forEach(link => {
    link.parentElement.classList.toggle('active', link.dataset.route === route);
  });

  const sidebarLinks = document.querySelectorAll('.side-bar a[data-route]');
  sidebarLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.route === route);
  });
}

// Initialize Content Scripts
function initializeContentScripts() {
  const categoryBtns = document.querySelectorAll('.category-btn');
  if (categoryBtns.length) {
    categoryBtns.forEach(btn => {
      btn.addEventListener('click', async function() {
        categoryBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        window.currentCategory = this.dataset.category;
        await fetchPostsByCategory();
      });
    });
  }

  const categoryFilter = document.querySelector('.category-filter');
  if (categoryFilter) {
    const header = document.querySelector('.head');
    if (header) {
      const headerHeight = header.offsetHeight;
      const stickyPosition = 60;
      const spacer = document.createElement('div');
      spacer.style.height = categoryFilter.offsetHeight + 'px';
      spacer.style.display = 'none';
      categoryFilter.parentNode.insertBefore(spacer, categoryFilter.nextSibling);
      const initialTop = categoryFilter.getBoundingClientRect().top + window.scrollY;

      window.addEventListener('scroll', function() {
        const scrollY = window.scrollY || window.pageYOffset;
        if (scrollY >= initialTop - stickyPosition) {
          categoryFilter.style.position = 'fixed';
          categoryFilter.style.top = stickyPosition + 'px';
          categoryFilter.style.left = '0';
          categoryFilter.style.right = '0';
          categoryFilter.style.zIndex = '100';
          spacer.style.display = 'block';
        } else {
          categoryFilter.style.position = 'static';
          spacer.style.display = 'none';
        }
      });
      window.dispatchEvent(new Event('scroll'));
    }
  }

  checkForNewContent();
}

// Handle Popstate
window.addEventListener('popstate', (event) => {
  const route = event.state?.route || 'market';
  navigateTo(route);
});

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadComponents();
    const currentRoute = window.location.hash.replace('#', '') || 'market';
    navigateTo(currentRoute);

    window.socket.on('connect', () => {
      console.log('Connected to server');
      const userId = localStorage.getItem('userId');
      if (userId) {
        window.socket.emit('joinRoom', userId);
      } else {
        console.warn('No userId found in localStorage');
      }
    });

    window.socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
    });

    window.socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });

    window.socket.on('new-like', (data) => {
      console.log('New like:', data);
      showToast(`User ${data.userId} liked post ${data.postId}`);
      invalidateCache('market');
    });

    window.socket.on('new-comment', (data) => {
      console.log('New comment:', data);
      showToast(`User ${data.userId} commented on post ${data.postId}: "${data.comment}"`);
      invalidateCache('market');
    });

    window.socket.on('notification', (data) => {
      console.log('Received notification:', data);
      showToast(`${data.sender.firstName} ${data.sender.lastName} ${data.type === 'like' ? 'liked' : 'commented on'} your post`);
      if (data.type === 'like' || data.type === 'comment') invalidateCache('market');
    });

    window.socket.on('receiveMessage', (message) => {
      console.log('New message:', message);
      showToast(`New message from ${message.senderId}`);
    });

    window.socket.on('badge-update', (data) => {
      const userId = localStorage.getItem('userId');
      if (data.userId === userId) {
        console.log('Badge update:', data);
        updateBadge(`${data.type}-badge`, data.count);
        if (data.type === 'posts' || data.type === 'alerts') invalidateCache(data.type === 'posts' ? 'market' : 'alerts');
      }
    });
  } catch (error) {
    console.error('Error during initialization:', error);
    showToast('Failed to initialize application');
  }
});

// Toast Notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-message show';
  toast.innerText = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// Badge Updates
function updateBadge(badgeId, count) {
  const badge = document.getElementById(badgeId);
  if (!badge) {
    console.warn(`Badge element not found: ${badgeId}`);
    return;
  }
  if (count > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = count > 9 ? '9+' : count;
  } else {
    badge.style.display = 'none';
    badge.textContent = '0';
  }
}

// Check for New Content
async function checkForNewContent() {
  try {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('authToken');
    if (!userId || !token) return;
    const response = await fetch(`${API_BASE_URL}/notification-counts?userId=${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch notifications: ${response.status}`);
    const data = await response.json();
    updateBadge('alerts-badge', data.alertsCount || 0);
    updateBadge('messages-badge', data.messagesCount || 0);
    updateBadge('deals-badge', data.dealsCount || 0);
    if (data.postsCount > 0) invalidateCache('market');
    if (data.alertsCount > 0) invalidateCache('alerts');
  } catch (error) {
    console.error('Error fetching notification counts:', error);
  }
}

// Clear Badge
async function clearBadge(type) {
  const badgeId = `${type}-badge`;
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('authToken');
  if (!userId || !token) {
    console.warn('User not logged in or no token found');
    return;
  }
  updateBadge(badgeId, 0);
  try {
    const response = await fetch(`${API_BASE_URL}/${type}/mark-as-viewed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error(`Failed to mark ${type} as viewed: ${response.status}`);
    console.log(`${type} marked as viewed`);
  } catch (error) {
    console.error(`Error clearing ${type} badge:`, error);
    checkForNewContent();
  }
}

// Fetch Posts by Category
async function fetchPostsByCategory() {
  console.log('Fetching posts for category:', window.currentCategory);
  if (typeof fetchPosts === 'function') {
    await fetchPosts(window.currentCategory || '');
  } else {
    console.warn('fetchPosts function not found. Ensure homeScript.js is loaded.');
  }
}

// Helper function to invalidate cache
function invalidateCache(route) {
  if (routeCache[route]) {
    routeCache[route] = { content: '', timestamp: null, isLoaded: false };
    console.log(`Cache invalidated for ${route}`);
  }
}

// Function to determine if reload is needed
function needsReload(route) {
  const lastLoad = routeCache[route]?.timestamp || 0;
  const now = new Date().getTime();
  const timeDiff = (now - lastLoad) / 1000; // In seconds
  if (timeDiff > 300) return true; // Reload after 5 minutes
  return false;
}