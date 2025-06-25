     // public/posts.js
     
     // Import the salmartCache helper.
     // IMPORTANT: Adjust the path if salmartCache.js is not in the same directory.
     import { salmartCache } from './salmartCache.js';
     
     document.addEventListener('DOMContentLoaded', async function () {
         // API_BASE_URL and showToast are now expected to be managed by other modules
         // or globally accessible if defined before this script runs.
         // The salmartCache helper uses its own API_BASE_URL internally.
     
         let currentLoggedInUser = null;
         let currentFollowingList = [];
         let isAuthReady = false;
     
         // --- State variables for pagination/filtering ---
         let currentPage = 1;
         let currentCategory = 'all';
         let isLoading = false; // To prevent multiple simultaneous fetches
     
     
         // --- Helper Functions ---
     
         async function fetchFollowingList() {
             if (!currentLoggedInUser) {
                 console.log("No logged-in user to fetch following list for.");
                 return [];
             }
             const token = localStorage.getItem('authToken');
             if (!token) return [];
     
             try {
                 // Using direct fetch for following list. If you add a dedicated method
                 // to salmartCache for this, you can switch to it.
                 const response = await fetch(`${window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com')}/api/is-following-list`, {
                     method: 'GET',
                     headers: { 'Authorization': `Bearer ${token}` },
                 });
                 if (response.ok) {
                     const { following } = await response.json();
                     return following || [];
                 } else {
                     console.warn('Could not fetch following list. Status:', response.status);
                     return [];
                 }
             } catch (error) {
                 console.error('Error fetching following list:', error);
                 return [];
             }
         }
     
         function formatTime(timestamp) {
             const now = new Date();
             const postDate = new Date(timestamp);
             const diffInSeconds = Math.floor((now - postDate) / 1000);
     
             if (diffInSeconds < 60) return "Just now";
             if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
             if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hrs ago`;
             if (diffInSeconds < 172800) return "Yesterday";
     
             return postDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
         }
     
         function escapeHtml(text) {
             const div = document.createElement('div');
             div.textContent = text;
             return div.innerHTML;
         }
     
         // --- Render Functions ---
     
         function renderPromotedPost(post) {
             const postElement = document.createElement('div');
             postElement.classList.add('promoted-post');
             postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
             postElement.dataset.postId = post._id || '';
     
             const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;
     
             let mediaContent = '';
             let productDetails = '';
             let buttonContent = '';
     
             // Default image paths for consistency
             const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');
     
             if (post.postType === 'video_ad') {
                 mediaContent = `
                     <div class="promoted-video-container">
                         <video class="promoted-video" preload="metadata" muted aria-label="Promoted video ad for ${(post.description || 'product').replace(/"/g, '&quot;')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
                             <source src="${post.video || ''}" type="video/mp4" />
                             Your browser does not support the video tag.
                         </video>
                         <div class="promoted-video-overlay">
                             <button class="promoted-play-btn">
                                 <i class="fas fa-play"></i>
                             </button>
                         </div>
                     </div>
                 `;
                 productDetails = `
                     <div class="promoted-product-info">
                         <h4 class="promoted-title">${escapeHtml(post.description || 'No description')}</h4>
                     </div>
                 `;
                 buttonContent = `
                     <a href="${post.productLink || '#'}" class="promoted-cta-button" aria-label="Check out product ${escapeHtml(post.description || 'product')}" ${!post.productLink ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                         <i class="fas fa-shopping-cart"></i> Shop Now
                     </a>
                 `;
             } else {
                 mediaContent = `
                     <img src="${productImageForChat}" class="promoted-image" alt="Promoted Product" onerror="this.src='/salmart-192x192.png'">
                 `;
                 productDetails = `
                     <div class="promoted-product-info">
                         <h4 class="promoted-title">${escapeHtml(post.title || 'No description')}</h4>
                         <p class="promoted-price">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</p>
                         <p class="promoted-location">${escapeHtml(post.location || 'N/A')}</p>
                     </div>
                 `;
     
                 if (currentLoggedInUser && !isPostCreator) {
                     buttonContent = `
                         <button class="promoted-cta-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                             <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                         </button>
                     `;
                 } else if (!currentLoggedInUser) {
                     buttonContent = `
                         <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                             <i class="fas fa-shopping-cart"></i> Buy Now
                         </button>
                     `;
                 }
             }
     
             postElement.innerHTML = `
                 <div class="promoted-badge">
                     <i class="fas fa-bullhorn"></i>
                     <span>Promoted</span>
                 </div>
                 <div class="promoted-header">
                     <img src="${post.profilePicture || '/salmart-192x192.png'}" class="promoted-avatar" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
                     <div class="promoted-user-info">
                         <h5 class="promoted-user-name">${escapeHtml(post.createdBy ? post.createdBy.name : 'Unknown')}</h5>
                         <span class="promoted-time">${formatTime(post.createdAt || new Date())}</span>
                     </div>
                 </div>
                 <div class="promoted-media">
                     ${mediaContent}
                 </div>
                 ${productDetails}
                 <div class="promoted-actions">
                     ${buttonContent}
                 </div>
             `;
             return postElement;
         }
     
         function renderPost(post) {
             const postElement = document.createElement('div');
             postElement.classList.add('post');
             postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
             postElement.dataset.postId = post._id || '';
     
             const isFollowing = currentFollowingList.includes(post.createdBy?.userId);
             const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;
     
             let mediaContent = '';
             let productDetails = '';
             let buttonContent = '';
     
             // Default image paths for consistency
             const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '/salmart-192x192.png') : (post.photo || '/salmart-192x192.png');
     
             if (post.postType === 'video_ad') {
                 mediaContent = `
                     <div class="post-video-container">
                         <video class="post-video" preload="metadata" aria-label="Video ad for ${(post.description || 'product').replace(/"/g, '&quot;')}" poster="${post.thumbnail || '/salmart-192x192.png'}">
                             <source src="${post.video || ''}" type="video/mp4" />
                             <source src="${post.video ? post.video.replace('.mp4', '.webm') : ''}" type="video/webm" />
                             <source src="${post.video ? post.video.replace('.mp4', '.ogg') : ''}" type="video/ogg" />
                             Your browser does not support the video tag.
                         </video>
                         <canvas class="video-thumbnail" style="display: none;"></canvas>
                         <div class="loading-spinner" style="display: none;">
                             <i class="fas fa-spinner fa-spin"></i>
                         </div>
                         <div class="custom-controls">
                             <button class="control-button play-pause" aria-label="Play or pause video">
                                 <i class="fas fa-play"></i>
                             </button>
                             <div class="progress-container">
                                 <div class="buffered-bar"></div>
                                 <div class="progress-bar" role="slider" aria-label="Video progress" aria-valuemin="0" aria-valuemax="100"></div>
                                 <div class="seek-preview" style="display: none;">
                                     <canvas class="seek-preview-canvas"></canvas>
                                 </div>
                             </div>
                             <div class="time-display">
                                 <span class="current-time">0:00</span> / <span class="duration">0:00</span>
                             </div>
                             <button class="control-button mute-button" aria-label="Mute or unmute video">
                                 <i class="fas fa-volume-up"></i>
                             </button>
                             <div class="volume-control">
                                 <input type="range" class="volume-slider" min="0" max="100" value="100" aria-label="Volume control">
                             </div>
                             <select class="playback-speed" aria-label="Playback speed">
                                 <option value="0.5">0.5x</option>
                                 <option value="1" selected>1x</option>
                                 <option value="1.5">1.5x</option>
                                 <option value="2">2x</option>
                             </select>
                             <button class="control-button fullscreen-button" aria-label="Toggle fullscreen">
                                 <i class="fas fa-expand"></i>
                             </button>
                         </div>
                     </div>
                 `;
                 productDetails = `
                     <div class="product-info">
                         <span class="icon">📦</span>
                         <div>
                             <p class="value">${escapeHtml(post.description || 'No description')}</p>
                         </div>
                     </div>
                 `;
                 buttonContent = `
                     <a href="${post.productLink || '#'}" class="buy-now-button checkout-product-button" aria-label="Check out product ${escapeHtml(post.description || 'product')}" ${!post.productLink ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                         <i class="fas fa-shopping-cart"></i> Check Out Product
                     </a>
                 `;
             } else {
                 mediaContent = `
                     <img src="${productImageForChat}" class="post-image" onclick="window.openImage('${productImageForChat.replace(/'/g, "\\'")}')" alt="Product Image" onerror="this.src='/salmart-192x192.png'">
                 `;
                 productDetails = `
                     <div class="product-info">
                         <span class="icon">📦</span>
                         <div>
                             <p class="label">Product</p>
                             <p class="value">${escapeHtml(post.title || 'No description')}</p>
                         </div>
                     </div>
                     <div class="product-info">
                         <span class="icon">🔄</span>
                         <div>
                             <p class="label">Condition</p>
                             <p class="value">${escapeHtml(post.productCondition || 'N/A')}</p>
                         </div>
                     </div>
                     <div class="product-info-inline">
                         <div class="info-item">
                             <span class="icon">💵</span>
                             <div>
                                 <p class="label">Price</p>
                                 <p class="value price-value">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</p>
                             </div>
                         </div>
                         <div class="info-item">
                             <span class="icon">📍</span>
                             <div>
                                 <p class="label">Location</p>
                                 <p class="value location-value">${escapeHtml(post.location || 'N/A')}</p>
                             </div>
                         </div>
                     </div>
                 `;
     
                 if (currentLoggedInUser) {
                     if (isPostCreator) {
                         buttonContent = !post.isPromoted ? `
                             <button class="promote-button buy-now-button" data-post-id="${post._id || ''}" aria-label="Promote this post">
                                 <i class="fas fa-bullhorn"></i> Promote Post
                             </button>
                         ` : '';
                     } else {
                         buttonContent = `
                             <button class="buy-now-button" data-post-id="${post._id || ''}" ${post.isSold ? 'disabled' : ''}>
                                 <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}
                             </button>
                             <button class="buy-now-button send-message-btn"
                                 data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}"
                                 data-product-image="${productImageForChat}"
                                 data-product-description="${escapeHtml(post.title || '')}"
                                 data-post-id="${post._id || ''}"
                                 ${post.isSold ? 'disabled' : ''}>
                                 <i class="fas fa-circle-dot"></i> ${post.isSold ? 'Unavailable' : 'Check Availability'}
                             </button>
                         `;
                     }
                 } else {
                     buttonContent = `
                         <button class="buy-now-button login-required" onclick="redirectToLogin()">
                             <i class="fas fa-shopping-cart"></i> Buy Now
                         </button>
                         <button class="buy-now-button login-required" onclick="redirectToLogin()">
                             <i class="fas fa-circle-dot"></i> Check Availability
                         </button>
                     `;
                 }
             }
     
             let followButtonHtml = '';
             if (post.createdBy && post.createdBy.userId) {
                 if (currentLoggedInUser) {
                     if (post.createdBy.userId === currentLoggedInUser) {
                         followButtonHtml = '';
                     } else {
                         followButtonHtml = isFollowing ?
                             `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #28a745; color: #fff;" disabled>
                                 <i class="fas fa-user-check"></i> Following
                             </button>` :
                             `<button class="follow-button" data-user-id="${post.createdBy.userId}">
                                 <i class="fas fa-user-plus"></i> Follow
                             </button>`;
                     }
                 } else {
                     followButtonHtml = `
                         <button class="follow-button login-required" onclick="redirectToLogin()">
                             <i class="fas fa-user-plus"></i> Follow
                         </button>
                     `;
                 }
             }
     
             const postActionsHtml = currentLoggedInUser ? `
                 <div class="post-actions">
                     <button class="action-button like-button" data-post-id="${post._id || ''}">
                         <i class="${post.likes && post.likes.includes(currentLoggedInUser) ? 'fas' : 'far'} fa-heart"></i>
                         <span class="like-count">${post.likes ? post.likes.length : 0}</span> <span>Likes</span>
                     </button>
                     <button class="action-button reply-button" data-post-id="${post._id || ''}">
                         <i class="far fa-comment-alt"></i>
                         <span class="comment-count">${post.comments ? post.comments.length : 0}</span> <span>Comments</span>
                     </button>
                     <button class="action-button share-button" data-post-id="${post._id || ''}">
                         <i class="fas fa-share"></i>
                     </button>
                 </div>
             ` : `
                 <div class="post-actions">
                     <button class="action-button login-required" onclick="redirectToLogin()">
                         <i class="far fa-heart"></i>
                         <span class="like-count">${post.likes ? post.likes.length : 0}</span> <span>Likes</span>
                     </button>
                     <button class="action-button login-required" onclick="redirectToLogin()">
                         <i class="far fa-comment-alt"></i>
                         <span class="comment-count">${post.comments ? post.comments.length : 0}</span> <span>Comments</span>
                     </button>
                     <button class="action-button share-button" data-post-id="${post._id || ''}">
                         <i class="fas fa-share"></i>
                     </button>
                 </div>
             `;
     
             postElement.innerHTML = `
                 <div class="post-header">
                     <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                         <img src="${post.profilePicture || '/salmart-192x192.png'}" class="post-avatar" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
                     </a>
                     <div class="post-user-info">
                         <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}">
                             <h4 class="post-user-name">${escapeHtml(post.createdBy ? post.createdBy.name : 'Unknown')}</h4>
                         </a>
                         <p class="post-time">${formatTime(post.createdAt || new Date())}</p>
                     </div>
                     ${followButtonHtml}
                     <div class="post-options">
                         <button class="post-options-button" type="button"><i class="fas fa-ellipsis-h"></i></button>
                         <div class="post-options-menu">
                             <ul>
                                 ${isPostCreator ? `
                                     <li><button class="delete-post-button" data-post-id="${post._id || ''}" type="button">Delete Post</button></li>
                                     <li><button class="edit-post-button" data-post-id="${post._id || ''}" type="button">Edit Post</button></li>
                                 ` : ''}
                                 <li><button class="report-post-button" data-post-id="${post._id || ''}" type="button">Report Post</button></li>
                             </ul>
                         </div>
                     </div>
                 </div>
     
                 <div class="product-container">
                     <div class="product-card">
                         ${productDetails}
                     </div>
                     <div class="media-card">
                         ${mediaContent}
                     </div>
                 </div>
     
                 <div class="buy" style="text-align: center">
                     ${buttonContent}
                 </div>
     
                 ${postActionsHtml}
             `;
             return postElement;
         }
     
         function createPromotedPostsRow(posts) {
             const wrapperContainer = document.createElement('div');
             wrapperContainer.classList.add('promoted-posts-wrapper');
             wrapperContainer.style.cssText = `
                 margin-bottom: 20px;
             `;
     
             const headerElement = document.createElement('div');
             headerElement.classList.add('promoted-posts-header');
             headerElement.innerHTML = '<h3>Things you may like</h3>';
             headerElement.style.cssText = `
                 font-size: 1em;
                 font-weight: 600;
                 color: #333;
          
             `;
     
             const rowContainer = document.createElement('div');
             rowContainer.classList.add('promoted-posts-row-container');
             rowContainer.style.cssText = `
                 display: flex;
                 overflow-x: auto;
                 gap: 15px;
                 padding: 10px 0;
                 background-color: #f9f9f9;
                 border-radius: 8px;
                 box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                 scroll-snap-type: x mandatory;
                 -webkit-overflow-scrolling: touch;
                 position: relative;
                 -webkit-scrollbar: none;
                 -ms-overflow-style: none;
                 scrollbar-width: none;
             `;
     
             posts.forEach(post => {
                 const postElement = renderPromotedPost(post);
                 postElement.style.flex = '0 0 auto';
                 postElement.style.width = `calc((100% / 5) - 12px)`;
                 postElement.style.minWidth = '200px';
                 postElement.style.scrollSnapAlign = 'start';
                 rowContainer.appendChild(postElement);
             });
     
             wrapperContainer.appendChild(headerElement);
             wrapperContainer.appendChild(rowContainer);
     
             if (posts.length > 5) {
                 const prevArrow = document.createElement('button');
                 prevArrow.className = 'promoted-row-nav-arrow prev';
                 prevArrow.innerHTML = '<i class="fas fa-chevron-left"></i>';
                 prevArrow.setAttribute('aria-label', 'Previous promoted posts');
     
                 const nextArrow = document.createElement('button');
                 nextArrow.className = 'promoted-row-nav-arrow next';
                 nextArrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
                 nextArrow.setAttribute('aria-label', 'Next promoted posts');
     
                 const arrowStyles = `
                     position: absolute;
                     top: 50%;
                     transform: translateY(-50%);
                     background: rgba(0, 0, 0, 0.6);
                     color: white;
                     border: none;
                     border-radius: 50%;
                     width: 35px;
                     height: 35px;
                     cursor: pointer;
                     z-index: 1;
                     display: flex;
                     align-items: center;
                     justify-content: center;
                     font-size: 1.2em;
                     transition: background 0.3s ease;
                 `;
                 prevArrow.style.cssText = arrowStyles + 'left: 5px;';
                 nextArrow.style.cssText = arrowStyles + 'right: 5px;';
     
                 prevArrow.addEventListener('click', () => {
                     rowContainer.scrollBy({ left: -rowContainer.offsetWidth, behavior: 'smooth' });
                 });
                 nextArrow.addEventListener('click', () => {
                     rowContainer.scrollBy({ left: rowContainer.offsetWidth, behavior: 'smooth' });
                 });
     
                 rowContainer.style.position = 'relative';
                 rowContainer.appendChild(prevArrow);
                 rowContainer.appendChild(nextArrow);
             }
     
             return wrapperContainer;
         }
     
         // --- Main Post Loading Logic (Updated to use salmartCache) ---
     
         async function fetchAndRenderPosts(category = currentCategory, page = currentPage, clearExisting = false) {
             const postsContainer = document.getElementById('posts-container');
             if (!postsContainer) {
                 console.error('Posts container not found.');
                 return;
             }
     
             if (isLoading) {
                 console.log('Posts are already loading. Skipping new request.');
                 return;
             }
             isLoading = true;
     
             if (clearExisting) {
                 postsContainer.innerHTML = '<p style="text-align: center; margin-top: 20px;">Loading posts...</p>';
             }
     
             try {
                 const allPosts = await salmartCache.getPostsByCategory(category);
     
                 if (clearExisting) {
                     postsContainer.innerHTML = '';
                 }
     
                 if (!Array.isArray(allPosts) || allPosts.length === 0) {
                     postsContainer.innerHTML = `
                         <p style="text-align: center; padding: 20px; color: #666;">
                             No posts yet for "${category === 'all' ? 'this category' : category}".
                             Try a different category or create one!
                         </p>
                     `;
                     isLoading = false;
                     return;
                 }
     
                 const promotedPosts = allPosts.filter(post => post.isPromoted);
                 const nonPromotedPosts = allPosts.filter(post => !post.isPromoted);
     
                 const postsPerPromotedRow = 5;
     
                 let promotedPostsRenderedCount = 0;
     
                 if (promotedPosts.length > 0) {
                     const initialPromotedPosts = promotedPosts.slice(0, postsPerPromotedRow);
                     if (initialPromotedPosts.length > 0) {
                         const promotedRow = createPromotedPostsRow(initialPromotedPosts);
                         postsContainer.appendChild(promotedRow);
                         promotedPostsRenderedCount += initialPromotedPosts.length;
                     }
                 }
     
                 for (let i = 0; i < nonPromotedPosts.length; i++) {
                     const postElement = renderPost(nonPromotedPosts[i]);
                     postsContainer.prepend(postElement);
     
                     if ((i + 1) % 2 === 0 && promotedPostsRenderedCount < promotedPosts.length) {
                         const postsForThisPromotedRow = promotedPosts.slice(promotedPostsRenderedCount, promotedPostsRenderedCount + postsPerPromotedRow);
                         if (postsForThisPromotedRow.length > 0) {
                             const promotedRow = createPromotedPostsRow(postsForThisPromotedRow);
                             postsContainer.prepend(promotedRow);
                             promotedPostsRenderedCount += postsForThisPromotedRow.length;
                         }
                     }
                 }
     
                 while (promotedPostsRenderedCount < promotedPosts.length) {
                     const postsForThisPromotedRow = promotedPosts.slice(promotedPostsRenderedCount, promotedPostsRenderedCount + postsPerPromotedRow);
                     if (postsForThisPromotedRow.length > 0) {
                         const promotedRow = createPromotedPostsRow(postsForThisPromotedRow);
                         postsContainer.prepend(promotedRow);
                         promotedPostsRenderedCount += postsForThisPromotedRow.length;
                     } else {
                         break;
                     }
                 }
     
                 if (nonPromotedPosts.length === 0 && promotedPosts.length === 0) {
                     postsContainer.innerHTML = '<p style="text-align: center; margin: 2rem;">No posts available.</p>';
                 }
     
                 window.dispatchEvent(new Event('postsRendered'));
     
             } catch (error) {
                 console.error('Error fetching posts:', error);
                 postsContainer.innerHTML = `
                     <p style="text-align: center; color: red; padding: 20px;">
                         Error loading posts. Please check your internet connection or try again later.
                         <br>Error: ${error.message || 'Unknown error'}
                     </p>
                 `;
             } finally {
                 isLoading = false;
             }
         }
     
         // --- Global Utility Functions ---
     
         window.redirectToLogin = function() {
             if (window.showToast) {
                 window.showToast('Please log in to access this feature', 'error');
                 setTimeout(() => {
                     window.location.href = 'SignIn.html';
                 }, 1000);
             } else {
                 window.location.href = 'SignIn.html';
             }
         };
     
         window.openImage = function(imageUrl) {
             console.log("Opening image:", imageUrl);
             window.open(imageUrl, '_blank');
         };
     
         // --- Event Delegates for Interactive Elements ---
     
         document.addEventListener('click', async (event) => {
             const promoteButton = event.target.closest('.promote-button');
             if (promoteButton) {
                 const postId = promoteButton.dataset.postId;
                 if (!postId) {
                     if (window.showToast) {
                         window.showToast('Invalid post ID for promotion', 'error');
                     }
                     return;
                 }
                 window.location.href = `promote.html?postId=${postId}`;
             }
     
             const promotedPlayBtn = event.target.closest('.promoted-play-btn');
             if (promotedPlayBtn) {
                 const videoContainer = promotedPlayBtn.closest('.promoted-video-container');
                 const video = videoContainer.querySelector('.promoted-video');
                 const overlay = videoContainer.querySelector('.promoted-video-overlay');
     
                 if (video.paused) {
                     video.play();
                     overlay.style.display = 'none';
                 } else {
                     video.pause();
                     overlay.style.display = 'flex';
                 }
             }
     
             const optionsButton = event.target.closest('.post-options-button');
             if (optionsButton) {
                 const menu = optionsButton.nextElementSibling;
                 if (menu && menu.classList.contains('post-options-menu')) {
                     menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                 }
                 document.querySelectorAll('.post-options-menu').forEach(openMenu => {
                     if (openMenu !== menu) {
                         openMenu.style.display = 'none';
                     }
                 });
                 event.stopPropagation();
             } else {
                 document.querySelectorAll('.post-options-menu').forEach(menu => {
                     menu.style.display = 'none';
                 });
             }
     
             const deleteButton = event.target.closest('.delete-post-button');
             if (deleteButton) {
                 const postId = deleteButton.dataset.postId;
                 if (confirm('Are you sure you want to delete this post?')) {
                     const token = localStorage.getItem('authToken');
                     if (!token) {
                         window.showToast('You must be logged in to delete posts.', 'error');
                         return;
                     }
                     try {
                         await salmartCache.deletePost(postId, token);
                         if (window.showToast) window.showToast('Post deleted successfully!', 'success');
                         fetchAndRenderPosts(currentCategory, currentPage, true);
                     } catch (error) {
                         console.error('Error deleting post:', error);
                         if (window.showToast) window.showToast('Failed to delete post: ' + error.message, 'error');
                     }
                 }
             }
     
             const editButton = event.target.closest('.edit-post-button');
             if (editButton) {
                 const postId = editButton.dataset.postId;
                 window.location.href = `edit-post.html?postId=${postId}`;
             }
     
             const reportButton = event.target.closest('.report-post-button');
             if (reportButton) {
                 const postId = reportButton.dataset.postId;
                 if (window.showToast) window.showToast('Reporting post functionality coming soon!', 'info');
                 console.log('Report post ID:', postId);
             }
     
             const likeButton = event.target.closest('.like-button');
             if (likeButton && currentLoggedInUser) {
                 const postId = likeButton.dataset.postId;
                 const token = localStorage.getItem('authToken');
                 if (!token) {
                     window.showToast('Please log in to like posts.', 'error');
                     return;
                 }
                 try {
                     const result = await salmartCache.likePost(postId, token);
                     const isLiked = result.likes && result.likes.includes(currentLoggedInUser);
                     const likeCountSpan = likeButton.querySelector('.like-count');
                     const heartIcon = likeButton.querySelector('.fa-heart');
     
                     if (heartIcon) {
                         if (isLiked) {
                             heartIcon.classList.remove('far');
                             heartIcon.classList.add('fas');
                         } else {
                             heartIcon.classList.remove('fas');
                             heartIcon.classList.add('far');
                         }
                     }
                     if (likeCountSpan) {
                         likeCountSpan.textContent = result.likes ? result.likes.length : 0;
                     }
                 } catch (error) {
                     console.error('Error liking post:', error);
                     if (window.showToast) window.showToast('Failed to like post: ' + error.message, 'error');
                 }
             } else if (likeButton && !currentLoggedInUser) {
                 redirectToLogin();
             }
     
             const replyButton = event.target.closest('.reply-button');
             if (replyButton) {
                 const postId = replyButton.dataset.postId;
                 window.location.href = `product.html?postId=${postId}#comments`;
             }
     
             const shareButton = event.target.closest('.share-button');
             if (shareButton) {
                 const postId = shareButton.dataset.postId;
                 const shareUrl = `${window.location.origin}/product.html?postId=${postId}`;
                 if (navigator.share) {
                     try {
                         await navigator.share({
                             title: 'Check out this post on Salmart!',
                             text: 'Find great deals and connect with sellers.',
                             url: shareUrl,
                         });
                         console.log('Shared successfully');
                     } catch (error) {
                         console.error('Error sharing:', error);
                         if (window.showToast) window.showToast('Failed to share post.', 'error');
                     }
                 } else {
                     if (window.showToast) window.showToast('Share feature not supported in your browser.', 'info');
                     navigator.clipboard.writeText(shareUrl).then(() => {
                         if (window.showToast) window.showToast('Link copied to clipboard!', 'success');
                     }).catch(err => {
                         console.error('Failed to copy link:', err);
                     });
                 }
             }
     
             const buyNowButton = event.target.closest('.buy-now-button:not(.login-required):not(.promote-button)');
             if (buyNowButton && !buyNowButton.classList.contains('send-message-btn') && currentLoggedInUser) {
                 const postId = buyNowButton.dataset.postId;
                 if (postId) {
                     window.location.href = `product.html?postId=${postId}`;
                 }
             }
     
             const sendMessageBtn = event.target.closest('.send-message-btn');
             if (sendMessageBtn && currentLoggedInUser) {
                 const recipientId = sendMessageBtn.dataset.recipientId;
                 const productId = sendMessageBtn.dataset.postId;
                 const productImage = sendMessageBtn.dataset.productImage;
                 const productDescription = sendMessageBtn.dataset.productDescription;
     
                 if (recipientId && productId) {
                     window.location.href = `Messages.html?userId=${recipientId}&productId=${productId}&productImage=${encodeURIComponent(productImage)}&productDescription=${encodeURIComponent(productDescription)}`;
                 } else {
                     if (window.showToast) window.showToast('Could not initiate chat. Missing info.', 'error');
                 }
             }
     
             const followButton = event.target.closest('.follow-button:not([disabled]):not(.login-required)');
             if (followButton && currentLoggedInUser) {
                 const userIdToFollow = followButton.dataset.userId;
                 const token = localStorage.getItem('authToken');
                 if (!userIdToFollow || !token) return;
     
                 try {
                     const result = await salmartCache.toggleFollow(userIdToFollow, token);
                     const isNowFollowing = result.following;
                     window.updateFollowButtonsUI(userIdToFollow, isNowFollowing);
                     if (window.showToast) window.showToast(isNowFollowing ? 'Followed user!' : 'Unfollowed user!', 'success');
                 } catch (error) {
                     console.error('Error toggling follow:', error);
                     if (window.showToast) window.showToast('Failed to change follow status: ' + error.message, 'error');
                 }
             }
         });
     
         // --- Authentication and Initialization Logic ---
     
         async function initializeAuthStatusAndPosts() {
             try {
                 if (typeof window.loggedInUser !== 'undefined') {
                     currentLoggedInUser = window.loggedInUser;
                 } else {
                     console.warn('window.loggedInUser is not yet defined.');
                 }
     
                 if (currentLoggedInUser) {
                     currentFollowingList = await fetchFollowingList();
                 }
     
                 isAuthReady = true;
                 console.log('Auth initialization complete. User:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
     
                 // Initial fetch of posts after auth is ready
                 await fetchAndRenderPosts(currentCategory, currentPage, true);
     
             } catch (error) {
                 console.error('Error during initial auth or post fetch:', error);
                 isAuthReady = true;
                 await fetchAndRenderPosts(currentCategory, currentPage, true);
             }
         }
     
         // Expose fetchAndRenderPosts globally if needed by other parts of your app
         window.fetchPosts = fetchAndRenderPosts;
     
         // Update UI for all follow buttons on the page
         window.updateFollowButtonsUI = (userId, isFollowingStatus) => {
             if (isFollowingStatus) {
                 if (!currentFollowingList.includes(userId)) {
                     currentFollowingList.push(userId);
                 }
             } else {
                 currentFollowingList = currentFollowingList.filter(id => id !== userId);
             }
     
             document.querySelectorAll(`.follow-button[data-user-id="${userId}"]`).forEach(btn => {
                 if (isFollowingStatus) {
                     btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
                     btn.style.backgroundColor = '#28a745';
                     btn.style.color = '#fff';
                     btn.disabled = true;
                 } else {
                     btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                     btn.style.backgroundColor = '';
                     btn.style.color = '';
                     btn.disabled = false;
                 }
             });
         };
     
         // Listen for a custom event from your auth script indicating auth status is ready
         document.addEventListener('authStatusReady', async (event) => {
             currentLoggedInUser = event.detail.loggedInUser;
             console.log('Auth status ready event received. Logged in user:', currentLoggedInUser ? currentLoggedInUser : 'Not logged in');
             currentFollowingList = await fetchFollowingList();
             isAuthReady = true;
             // Re-render posts with correct user-specific data (likes, follow buttons)
             await fetchAndRenderPosts(currentCategory, currentPage, true);
         });
     
         // Fallback timers in case 'authStatusReady' event is missed or not fired quickly
         setTimeout(async () => {
             if (!isAuthReady) {
                 console.log('Auth status timeout (500ms) - proceeding with initialization.');
                 await initializeAuthStatusAndPosts();
             }
         }, 500);
     
         setTimeout(async () => {
             if (!isAuthReady) {
                 console.log('Auth status timeout (2000ms) - proceeding with initialization.');
                 await initializeAuthStatusAndPosts();
             }
         }, 2000);
     
         // Event listener for category filter changes - ensure it uses the outer-scoped variables
         const categoryFilter = document.getElementById('category-filter');
         if (categoryFilter) {
             categoryFilter.addEventListener('change', (event) => {
                 currentCategory = event.target.value;
                 currentPage = 1; // Reset page to 1 when category changes
                 fetchAndRenderPosts(currentCategory, currentPage, true); // Clear existing posts on category change
             });
         }
     
         // Event listener for the "Load More" button - ensure it uses the outer-scoped variables
         const loadMoreBtn = document.getElementById('load-more-btn');
         if (loadMoreBtn) {
             loadMoreBtn.addEventListener('click', () => {
                 if (!isLoading) {
                     currentPage++;
                     fetchAndRenderPosts(currentCategory, currentPage, false); // Don't clear existing, append
                 }
             });
         }
     });
     
     // Any other functions like video control initialization should be called
     // after posts are rendered, potentially via the 'postsRendered' event listener
     // or by being placed directly within the post rendering logic if they are simple.
     
     // For video controls, you would typically have a separate script like video-controls.js
     // that listens for 'postsRendered' and initializes controls for new video elements.
     // Example:
     /*
     document.addEventListener('postsRendered', () => {
         document.querySelectorAll('.post-video-container').forEach(container => {
             if (!container.dataset.initialized) { // Prevent re-initialization
                 initializeVideoControls(container); // Your existing function from video-controls.js
                 container.dataset.initialized = 'true';
             }
         });
     });
     */
