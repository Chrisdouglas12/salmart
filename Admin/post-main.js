
    import {
        salmartCache
    } from './salmartCache.js';

    // --- Cached DOM Elements & Global State ---
    const postsContainer = document.getElementById('posts-container');
    let currentLoggedInUser = localStorage.getItem('userId');
    let currentFollowingList = [];
    let isAuthReady = false;
    let currentCategory = 'all';
    let isLoading = false;
    let suggestionCounter = 0;
    const promotedPostIdsInserted = new Set();
    let scrollObserver;

    // --- Socket.IO Initialization & Events ---
    const socket = io(SOCKET_URL, {
        auth: {
            token: localStorage.getItem('authToken')
        },
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
        console.log('Socket.IO connected');
        if (currentLoggedInUser) {
            socket.emit('join', `user_${currentLoggedInUser}`);
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error.message);
    });

    socket.on('profilePictureUpdate', ({
        userId,
        profilePicture
    }) => {
        console.log(`Received profile picture update for user ${userId}`);
        updateProfilePictures(userId, profilePicture);
    });

    socket.on('postLiked', async ({
        postId,
        likes,
        category
    }) => {
        await salmartCache.updatePostInCache(postId, {
            likes
        }, category || currentCategory);
        const currentUserId = localStorage.getItem('userId');
        if (currentUserId) {
            salmartCache._updateLikeUI(postId, likes, currentUserId);
        }
    });

    socket.on('postCommented', async ({
        postId,
        commentCount,
        category
    }) => {
        await salmartCache.updateCommentCount(postId, commentCount, category || currentCategory);
    });

    socket.on('postSoldStatusChanged', async ({
        postId,
        isSold,
        category
    }) => {
        await salmartCache.updatePostInCache(postId, {
            isSold
        }, category || currentCategory);
        updatePostSoldStatus(postId, isSold);
    });

    // --- Realtime UI Updates ---
    function updatePostSoldStatus(postId, isSold) {
        const postElements = document.querySelectorAll(`[data-post-id="${postId}"]`);
        postElements.forEach(element => {
            const buyButtons = element.querySelectorAll('.buy-now-button, .promoted-cta-button');
            buyButtons.forEach(button => {
                if (isSold) {
                    button.classList.add('sold-out');
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-times-circle"></i> Sold Out';
                } else {
                    button.classList.remove('sold-out');
                    button.disabled = false;
                    button.innerHTML = '<i class="fas fa-shopping-cart"></i> Buy Now';
                }
            });
            const messageButtons = element.querySelectorAll('.send-message-btn');
            messageButtons.forEach(button => {
                if (isSold) {
                    button.classList.add('unavailable');
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-ban"></i> Unavailable';
                } else {
                    button.classList.remove('unavailable');
                    button.disabled = false;
                    button.innerHTML = '<i class="fas fa-paper-plane"></i> Message';
                }
            });
        });
    }

    function updateFollowButtonsUI(userId, isFollowing) {
        document.querySelectorAll(`.follow-button[data-user-id="${userId}"]`).forEach(button => {
            if (isFollowing) {
                button.innerHTML = '<i class="fas fa-user-check"></i> Following';
                button.style.backgroundColor = '#fff';
                button.style.color = '#28a745';
                button.disabled = true;
            } else {
                button.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                button.style.backgroundColor = '';
                button.style.color = '';
                button.disabled = false;
            }
        });
    }
    window.updateFollowButtonsUI = updateFollowButtonsUI;

    function updateProfilePictures(userId, profilePicture) {
        const cleanedUrl = profilePicture.split('?')[0];
        document.querySelectorAll(`img.post-avatar[data-user-id="${userId}"], img.promoted-avatar[data-user-id="${userId}"], img.user-suggestion-avatar[data-user-id="${userId}"]`).forEach(img => {
            img.src = cleanedUrl;
            img.onerror = () => {
                img.src = '/salmart-192x192.png';
            };
        });
    }

    // --- UI Rendering Functions ---
    function renderUserSuggestion(user) {
        const suggestionElement = document.createElement('div');
        suggestionElement.classList.add('user-suggestion-card');
        const isFollowingUser = currentFollowingList.includes(user._id.toString());
        suggestionElement.innerHTML = `
            <a href="Profile.html?userId=${user._id}" class="user-info-link">
                <img class="user-suggestion-avatar" data-user-id="${user._id}" onerror="this.src='/default-avater.png'">
                <h5 class="user-suggestion-name">${escapeHtml(user.name)}</h5>
            </a>
            <button class="follow-button user-suggestion-follow-btn" data-user-id="${user._id}" ${isFollowingUser ? 'disabled' : ''}>
                ${isFollowingUser ? '<i class="fas fa-user-check"></i> Following' : '<i class="fas fa-user-plus"></i> Follow'}
            </button>
        `;
        const avatarImg = suggestionElement.querySelector('.user-suggestion-avatar');
        if (avatarImg) {
            lazyLoadImage(avatarImg, user.profilePicture || '/salmart-192x192.png');
        }
        return suggestionElement;
    }

    function createUserSuggestionsContainer(users) {
        if (!users || users.length === 0) return null;
        const wrapperContainer = document.createElement('div');
        wrapperContainer.classList.add('user-suggestions-wrapper');
        const headerElement = document.createElement('h3');
        headerElement.textContent = 'Suggested People to Follow';
        wrapperContainer.appendChild(headerElement);
        const cardsPerRow = 8;
        for (let i = 0; i < users.length; i += cardsPerRow) {
            const rowContainer = document.createElement('div');
            rowContainer.classList.add('user-suggestions-row');
            const currentRowUsers = users.slice(i, i + cardsPerRow);
            currentRowUsers.forEach(user => {
                const userCard = renderUserSuggestion(user);
                rowContainer.appendChild(userCard);
            });
            wrapperContainer.appendChild(rowContainer);
        }
        return wrapperContainer;
    }

    function renderPromotedPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('promoted-post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';
        postElement.dataset.sellerId = post.createdBy ? post.createdBy.userId : '';
        postElement.dataset.userId = post.createdBy ? post.createdBy.userId : '';
        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;
        const isSold = post.isSold;
        let mediaContent = `<img class="promoted-image" alt="Promoted Product" onerror="this.src='/salmart-192x192.png'">`;
        const productImageForChat = post.photo || '/salmart-192x192.png';

        let buttonContent = '';
        if (currentLoggedInUser && !isPostCreator) {
            buttonContent = `
                <div class="button-container">
                    <button class="promoted-cta-button buy-now-button ${isSold ? 'sold-out' : ''}" data-post-id="${post._id || ''}" data-product-image="${productImageForChat}" data-product-title="${escapeHtml(post.title || 'Untitled Product')}" data-product-description="${escapeHtml(post.description || 'No description available.')}" data-product-location="${escapeHtml(post.location || 'N/A')}" data-product-condition="${escapeHtml(post.productCondition || 'N/A')}" data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}" data-seller-id="${post.createdBy ? post.createdBy.userId : ''}" ${isSold ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> ${isSold ? 'Sold' : 'Buy'}
                    </button>
                    <button class="promoted-cta-button send-message-btn ${isSold ? 'unavailable' : ''}" data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}" data-product-image="${productImageForChat}" data-product-description="${escapeHtml(post.title || '')}" data-post-id="${post._id || ''}" ${isSold ? 'disabled' : ''}>
                        <i class="fas fa-paper-plane"></i> ${isSold ? 'Unavailable' : 'Message'}
                    </button>
                </div>`;
        } else if (!currentLoggedInUser) {
            buttonContent = `
                <div class="button-container">
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-shopping-cart"></i> Buy Now
                    </button>
                    <button class="promoted-cta-button login-required" onclick="redirectToLogin()">
                        <i class="fas fa-paper-plane"></i> Message Seller
                    </button>
                </div>`;
        } else {
            buttonContent = `
                <a href="javascript:void(0);" style="pointer-events: none; color: #28a745; font-size: 14px; font-weight: 400;">
                    <i class="fas fa-toggle-on"></i> Active
                </a>`;
        }

        postElement.innerHTML = `
            <div class="promoted-badge">
                <i class="fas fa-bullhorn"></i>
                <span>Promoted</span>
            </div>
            <div class="promoted-header">
                <img class="promoted-avatar" data-user-id="${post.createdBy?.userId || ''}" onerror="this.src='/salmart-192x192.png'" alt="User Avatar">
                <div class="promoted-user-info">
                    <h5 class="promoted-user-name">${escapeHtml(post.createdBy ? post.createdBy.name : 'Unknown')}</h5>
                    <span class="promoted-time">${formatTime(post.createdAt || new Date())}</span>
                </div>
            </div>
            <div class="promoted-media">${mediaContent}</div>
            <div class="promoted-product-info">
                <h4 class="promoted-title">${escapeHtml(post.title || 'No description')}</h4>
                <p class="promoted-price">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</p>
                <p class="promoted-location">${escapeHtml(post.location || 'N/A')}</p>
            </div>
            <div class="promoted-actions">${buttonContent}</div>
        `;

        lazyLoadImage(postElement.querySelector('.promoted-image'), productImageForChat);
        lazyLoadImage(postElement.querySelector('.promoted-avatar'), post.createdBy?.profilePicture || '/salmart-192x192.png');
        return postElement;
    }

    function createPromotedPostsRow(posts) {
        const wrapperContainer = document.createElement('div');
        wrapperContainer.classList.add('promoted-posts-wrapper');
        const headerElement = document.createElement('div');
        headerElement.classList.add('promoted-posts-header');
        headerElement.innerHTML = '<h3><i class="fas fa-fire"></i> Suggested products for you</h3>';
        const rowContainer = document.createElement('div');
        rowContainer.classList.add('promoted-posts-row-container');
        const postsToRender = posts.filter(post => !promotedPostIdsInserted.has(post._id));
        postsToRender.forEach(post => {
            const postElement = renderPromotedPost(post);
            rowContainer.appendChild(postElement);
            promotedPostIdsInserted.add(post._id);
        });
        const fillerCount = Math.max(0, 5 - postsToRender.length);
        for (let i = 0; i < fillerCount; i++) {
            const fillerElement = document.createElement('div');
            fillerElement.classList.add('promoted-post-filler');
            rowContainer.appendChild(fillerElement);
        }
        wrapperContainer.appendChild(headerElement);
        wrapperContainer.appendChild(rowContainer);
        return wrapperContainer;
    }

    function renderPost(post) {
        const postElement = document.createElement('div');
        postElement.classList.add('post');
        postElement.dataset.createdAt = post.createdAt || new Date().toISOString();
        postElement.dataset.postId = post._id || '';
        postElement.dataset.sellerId = post.createdBy ? post.createdBy.userId : '';
        postElement.dataset.userId = post.createdBy ? post.createdBy.userId : '';

        const isFollowing = currentFollowingList.includes(post.createdBy?.userId?.toString());
        const isPostCreator = post.createdBy && post.createdBy.userId === currentLoggedInUser;
        const isSold = post.isSold;

        let mediaContent = '';
        let productDetails = '';
        let descriptionContent = '';
        let buttonContent = '';
        const productImageForChat = post.postType === 'video_ad' ? (post.thumbnail || '') : (post.photo || '');

        if (post.postType === 'video_ad') {
            descriptionContent = `<h2 class="product-title">${escapeHtml(post.title || '')}</h2><div class="post-description-text" style="margin-bottom: 10px; margin-left: -10px"><p>${escapeHtml(post.description || '')}</p></div>`;
            mediaContent = `
                <div class="post-video-container">
                    <video class="post-video" preload="metadata" muted playsinline aria-label="Video ad for ${post.description || 'product'}" poster="${post.thumbnail || ''}">
                        <source data-src="${post.video || ''}" type="video/mp4" />
                        Your browser does not support the video tag.
                    </video>
                </div>`;
            buttonContent = `<div style="margin-top: -50px"><a href="${post.productLink || '#'}" class="checkout-product-btn ${isSold ? 'sold-out' : ''}" aria-label="Check out product ${post.description || 'product'}" ${!post.productLink || isSold ? 'disabled' : ''}><i class="fas fa-shopping-cart"></i> ${isSold ? 'Sold Out' : 'Check Out Product'}</a></div>`;
        } else {
            descriptionContent = `<h2 class="product-title">${escapeHtml(post.title || 'No description')}</h2><div class="post-description-text" style="margin-bottom: 10px; margin-left: -10px;"><p>${escapeHtml(post.description || '')}</p></div>`;
            mediaContent = `<div class="media-card"><div class="post-image-wrapper"><div class="badge">${post.productCondition || 'New'}</div><img class="post-image" onclick="window.openImage('${productImageForChat.replace(/'/g, "\\'")}')" onerror="this.src='/salmart-192x192.png'"></div></div>`;
            productDetails = `
                <div class="content">
                    <div class="details-grid">
                        <div class="detail-item"><div class="detail-icon price-icon"><i class="fas fa-money-bill-wave"></i></div><div class="detail-text"><div class="detail-label">Price</div><div class="detail-value price-value">${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}</div></div></div>
                        <div class="detail-item"><div class="detail-icon location-icon"><i class="fas fa-map-marker-alt"></i></div><div class="detail-text"><div class="detail-label">Location</div><div class="detail-value location-value">${escapeHtml(post.location || 'N/A')}</div></div></div>
                    </div>
                </div>`;
            if (currentLoggedInUser) {
                if (isPostCreator) {
                    buttonContent = !post.isPromoted ? `<div class="actions"><button class="btn btn-primary promote-button ${isSold ? 'sold-out' : ''}" data-post-id="${post._id || ''}" aria-label="Promote this post" ${isSold ? 'disabled title="Cannot promote sold out post"' : ''} ><i class="${isSold ? 'fas fa-times-circle' : 'fas fa-bullhorn'}"></i> ${isSold ? 'Sold Out' : 'Promote Post'}</button></div>` : '';
                } else {
                    buttonContent = `<div class="actions"><button class="btn btn-secondary send-message-btn ${isSold ? 'unavailable' : ''}" data-recipient-id="${post.createdBy ? post.createdBy.userId : ''}" data-product-image="${productImageForChat}" data-product-description="${escapeHtml(post.title || '')}" data-post-id="${post._id || ''}" ${isSold ? 'disabled' : ''}><i class="fas ${isSold ? 'fa-ban' : 'fa-paper-plane'}"></i> ${isSold ? 'Unavailable' : 'Message'}</button><button class="btn btn-primary buy-now-button ${isSold ? 'sold-out' : ''}" data-post-id="${post._id || ''}" data-product-image="${productImageForChat}" data-product-title="${escapeHtml(post.title || 'Untitled Product')}" data-product-description="${escapeHtml(post.description || 'No description available.')}" data-product-location="${escapeHtml(post.location || 'N/A')}" data-product-condition="${escapeHtml(post.productCondition || 'N/A')}" data-product-price="${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : '₦0.00'}" data-seller-id="${post.createdBy ? post.createdBy.userId : ''}" ${isSold ? 'disabled' : ''}><i class="fas ${isSold ? 'fa-times-circle' : 'fa-shopping-cart'}"></i> ${isSold ? 'Sold Out' : 'Buy Now'}</button></div>`;
                }
            } else {
                buttonContent = `<div class="actions"><button class="btn btn-secondary login-required" onclick="redirectToLogin()"><i class="fas fa-paper-plane"></i> Message</button><button class="btn btn-primary login-required" onclick="redirectToLogin()"><i class="fas fa-shopping-cart"></i> Buy Now</button></div>`;
            }
        }

        let followButtonHtml = '';
        if (post.createdBy?.userId) {
            if (currentLoggedInUser) {
                if (post.createdBy.userId !== currentLoggedInUser) {
                    followButtonHtml = isFollowing ? `<button class="follow-button" data-user-id="${post.createdBy.userId}" style="background-color: #fff; color: #28a745;" disabled><i class="fas fa-user-check"></i> Following</button>` : `<button class="follow-button" data-user-id="${post.createdBy.userId}"><i class="fas fa-user-plus"></i> Follow</button>`;
                }
            } else {
                followButtonHtml = `<button class="follow-button login-required" onclick="redirectToLogin()"><i class="fas fa-user-plus"></i> Follow</button>`;
            }
        }

        const postActionsHtml = currentLoggedInUser ? `<div class="post-actions"><button class="action-button like-button" data-post-id="${post._id || ''}"><i class="${post.likes && post.likes.includes(currentLoggedInUser) ? 'fas' : 'far'} fa-heart"></i><span class="like-count">${post.likes ? post.likes.length : 0}</span> <span>Likes</span></button><button class="action-button reply-button" data-post-id="${post._id || ''}"><i class="far fa-comment-alt"></i><span class="comment-count">${post.comments ? post.comments.length : 0}</span> <span>Comments</span></button><button class="action-button share-button" data-post-id="${post._id || ''}"><i class="fas fa-share"></i> Share</button></div>` : `<div class="post-actions"><button class="action-button login-required" onclick="redirectToLogin()"><i class="far fa-heart"></i><span class="like-count">${post.likes ? post.likes.length : 0}</span> <span>Likes</span></button><button class="action-button login-required" onclick="redirectToLogin()"><i class="far fa-comment-alt"></i><span class="comment-count">${post.comments ? post.comments.length : 0}</span> <span>Comments</span></button><button class="action-button share-button" data-post-id="${post._id || ''}"><i class="fas fa-share"></i> Share</button></div>`;

        postElement.innerHTML = `
            <div class="post-header">
                <a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}"><img class="post-avatar" data-user-id="${post.createdBy?.userId || ''}" onerror="this.src='/salmart-192x192.png'"></a>
                <div class="post-user-info"><a href="Profile.html?userId=${post.createdBy ? post.createdBy.userId : ''}"><h4 class="post-user-name">${escapeHtml(post.createdBy ? post.createdBy.name : 'Unknown')}</h4></a><p class="post-time">${formatTime(post.createdAt || new Date())}</p></div>
                ${followButtonHtml}
                <div class="post-options"><button class="post-options-button" type="button"><i class="fas fa-ellipsis-h"></i></button><div class="post-options-menu"><ul>${isPostCreator ? `<li><button class="delete-post-button" data-post-id="${post._id || ''}" type="button"><i class="fas fa-trash-alt"></i> Delete Post</button></li><li><button class="edit-post-button" data-post-id="${post._id || ''}" data-post-type="${post.postType || 'regular'}" type="button"><i class="fas fa-edit"></i> Edit Post</button></li>` : ''}<li><button class="report-post-button" data-post-id="${post._id || ''}" type="button"><i class="fas fa-flag"></i> Report Post</button></li></ul></div></div>
            </div>
            ${descriptionContent}
            <div class="product-container"><div class="media-card">${mediaContent}</div><div class="product-card">${productDetails}</div></div>
            <div class="buy" style="text-align: center">${buttonContent}</div>
            ${postActionsHtml}
        `;

        lazyLoadImage(postElement.querySelector('.post-avatar'), post.createdBy?.profilePicture || '/salmart-192x192.png');
        if (post.postType === 'video_ad') {
            const videoElement = postElement.querySelector('.post-video');
            if (videoElement) {
                lazyLoadVideo(videoElement);
            }
        } else {
            lazyLoadImage(postElement.querySelector('.post-image'), productImageForChat);
        }
        return postElement;
    }
