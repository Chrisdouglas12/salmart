document.addEventListener('DOMContentLoaded', async function () {
    

    // Function to format time (e.g., "2 hrs ago")
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

    // Function to check login status
    async function checkLoginStatus() {
        const token = localStorage.getItem('authToken');
        const tokenExpiry = localStorage.getItem('tokenExpiry');

        if (!token || Date.now() > tokenExpiry) {
            console.log('Token expired or missing. Redirecting to login...');
            showLoginOption();
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/verify-token', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

             
                
    // Function to fetch and display posts for the profile owner
    async function fetchPosts() {
        const postsContainer = document.getElementById('posts-container');
        try {
            // Extract userId from the URL (e.g., Profile.html?userId=123)
            const urlParams = new URLSearchParams(window.location.search);
            const profileOwnerId = urlParams.get('userId');

            if (!profileOwnerId) {
                console.error('Profile owner ID not found in URL');
                return;
            }

            // Fetch posts for the profile owner
            const response = await fetch(`http://localhost:3000/post?userId=${profileOwnerId}`);
            if (!response.ok) throw new Error('Failed to fetch posts');

            const posts = await response.json();
            postsContainer.innerHTML = ""; // Clear existing posts

            posts.forEach(post => {
                const postElement = document.createElement('div');
                postElement.classList.add('post');
                postElement.innerHTML = `
                    <div class="post-header">
                        <a href="Profile.html?userId=${post.createdBy.userId}">
                            <img src="${post.profilePicture || 'default-avatar.png'}" class="post-avatar">
                        </a>
                        <div class="post-user-info">
                            <a href="Profile.html?userId=${post.createdBy.userId}">
                                <h4 class="post-user-name">${post.createdBy.name}</h4>
                            </a>
                            <p class="post-time">${formatTime(post.createdAt)}</p>
                        </div>
                        <div class="post-options">
                            <button class="post-options-button"><i class="fas fa-ellipsis-h"></i></button>
                            <div class="post-options-menu">
                                <ul>
                                    ${post.createdBy.userId === loggedInUser ? `
                                        <li><button class="delete-post-button" data-post-id="${post._id}">Delete Post</button></li>
                                        <li><button class="edit-post-button" data-post-id="${post._id}">Edit Post</button></li>
                                    ` : ''}
                                    <li><button class="report-post-button" data-post-id="${post._id}">Report Post</button></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <p class="post-description"><b>Product:</b> ${post.description}</p>
                    <p class="post-description"><b>Condition:</b> ${post.productCondition}</p>
                    <p class="post-description"><b>Price:</b> ${post.price}</p>
                    <p class="post-description"><b>Location:</b> ${post.location}</p>
                    <img src="${post.photo || 'default-image.png'}" class="post-image" onclick="openImage('${post.photo || 'default-image.png'}')">
                    <div class="buy" style="text-align: center">
                        <button class="buy-now-button" data-post-id="${post._id}" ${post.isSold ? 'disabled' : ''}>${post.isSold ? 'Sold Out' : 'Buy Now'}</button>
                        <a href="Chats.html" id="send-message-link">
                            <button class="buy-now-button" id="send-message-btn" data-recipient-id="${post.createdBy.userId}">Check Availability</button>
                        </a>
                    </div>
                    <div class="post-actions">
                        <button class="like-button">
                            <i class="${post.likes.includes(loggedInUser) ? 'fas' : 'far'} fa-heart"></i>
                            <span class="like-count">${post.likes.length}</span>
                        </button>
                        <button class="reply-button"><i class="far fa-comment"></i> <span class="comment-count">${post.comments ? post.comments.length : 0}</span></button>
                        <button class="share-button"><i class="fas fa-share"></i></button>
                    </div>
                    <div class="comment-section" style="display: none;">
                        <div class="comments-list">
                            ${post.comments.map(comment => `
                                <div class="comment">
                                    <img src="${comment.profilePicture || 'default-avatar.png'}" class="comment-avatar">
                                    <div class="comment-info">
                                        <strong>${comment.name}</strong>
                                        <p>${comment.text}</p>
                                        <span class="comment-time">${formatTime(comment.createdAt)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="comment-input">
                            <input type="text" placeholder="Write a comment..." class="comment-text">
                            <button class="comment-submit" data-post-id="${post._id}">Post</button>
                        </div>
                    </div>
                `;
                postsContainer.prepend(postElement);

                // Toggle post options menu
                const optionsButton = postElement.querySelector('.post-options-button');
                const optionsMenu = postElement.querySelector('.post-options-menu');

                optionsButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent bubbling
                    document.querySelectorAll('.post-options-menu.show').forEach(menu => {
                        if (menu !== optionsMenu) menu.classList.remove('show');
                    });
                    optionsMenu.classList.toggle('show');
                });

                // Like functionality
                const likeButton = postElement.querySelector('.like-button');
                likeButton.addEventListener('click', async () => {
                    const likeCountElement = likeButton.querySelector('.like-count');
                    const icon = likeButton.querySelector('i');
                    const postId = post._id;

                    let currentLikes = parseInt(likeCountElement.textContent, 10);
                    let isLiked = icon.classList.contains('fas');

                    // Optimistic UI update
                    icon.classList.toggle('fas', !isLiked);
                    icon.classList.toggle('far', isLiked);
                    likeCountElement.textContent = isLiked ? currentLikes - 1 : currentLikes + 1;

                    try {
                        const response = await fetch(`http://localhost:3000/post/like/${postId}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                        });

                        if (!response.ok) throw new Error('Failed to like/unlike post');

                        const data = await response.json();
                        likeCountElement.textContent = data.likes.length;
                        if (data.likes.includes(loggedInUser)) {
                            icon.classList.add('fas');
                            icon.classList.remove('far');
                        } else {
                            icon.classList.add('far');
                            icon.classList.remove('fas');
                        }

                        if (!isLiked) {
                            socket.emit('likePost', { postId, userId: loggedInUser });
                        }
                    } catch (error) {
                        console.error('Error liking/unliking post:', error);
                        icon.classList.toggle('fas', isLiked);
                        icon.classList.toggle('far', !isLiked);
                        likeCountElement.textContent = currentLikes;
                    }
                });

                // Send message functionality
                const sendMessageBtn = postElement.querySelector("#send-message-btn");
                const sendMessageLink = postElement.querySelector("#send-message-link");

                sendMessageBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const recipientId = sendMessageBtn.dataset.recipientId;
                    const recipientUsername = post.createdBy.name;
                    const recipientProfilePictureUrl = post.profilePicture || 'default-avatar.png';

                    sendMessageLink.href = `Chats.html?user_id=${userId}&recipient_id=${recipientId}&recipient_username=${recipientUsername}&recipient_profile_picture_url=${recipientProfilePictureUrl}`;
                    window.location.href = sendMessageLink.href;
                });

                // Buy now functionality
                const buyNowButton = postElement.querySelector('.buy-now-button');
                buyNowButton.addEventListener('click', async () => {
                    const postId = buyNowButton.getAttribute('data-post-id').trim();
                    const email = localStorage.getItem('email');
                    const buyerId = localStorage.getItem('userId');

                    if (!email || !buyerId) {
                        alert("No email or user ID found in localStorage. Please log in.");
                        return;
                    }

                    try {
                        const response = await fetch('http://localhost:3000/pay', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, postId, buyerId }),
                        });

                        const result = await response.json();
                        if (result.success) {
                            window.location.href = result.url;
                        } else {
                            alert("Payment failed!");
                        }
                    } catch (error) {
                        console.error("Error processing payment:", error);
                        alert("Payment error!");
                    }
                });

                // Toggle comment section
                const commentToggleButton = postElement.querySelector('.reply-button');
                const commentSection = postElement.querySelector('.comment-section');
                commentToggleButton.addEventListener('click', () => {
                    commentSection.style.display = commentSection.style.display === "none" ? "block" : "none";
                });

                // Add comment functionality
                const commentButton = postElement.querySelector('.comment-submit');
                const commentInput = postElement.querySelector('.comment-text');
                commentButton.addEventListener('click', async () => {
                    const commentText = commentInput.value.trim();
                    if (!commentText) return;

                    try {
                        const response = await fetch(`http://localhost:3000/post/comment/${post._id}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                            },
                            body: JSON.stringify({ text: commentText }),
                        });

                        if (!response.ok) throw new Error('Failed to post comment');

                        const result = await response.json();
                        const newComment = result.comment;

                        const commentList = postElement.querySelector('.comments-list');
                        const newCommentHTML = `
                            <div class="comment">
                                <img src="${newComment.profilePicture || 'default-avatar.png'}" class="comment-avatar">
                                <div class="comment-info">
                                    <strong>${newComment.name}</strong>
                                    <p>${newComment.text}</p>
                                    <span class="comment-time">${formatTime(newComment.createdAt)}</span>
                                </div>
                            </div>
                        `;
                        commentList.insertAdjacentHTML('afterbegin', newCommentHTML);
                        commentInput.value = "";

                        const commentCountElement = postElement.querySelector('.comment-count');
                        commentCountElement.textContent = parseInt(commentCountElement.textContent) + 1;

                        showToast("Your comment has been submitted!");
                    } catch (error) {
                        console.error('Error posting comment:', error);
                    }
                });

                // Delete post functionality
                const deleteButton = postElement.querySelector('.delete-post-button');
                if (deleteButton) {
                    deleteButton.addEventListener('click', async () => {
                        const postId = deleteButton.getAttribute('data-post-id');
                        const authToken = localStorage.getItem('authToken');

                        const confirmDelete = confirm("Are you sure you want to delete this post?");
                        if (!confirmDelete) return;

                        try {
                            const response = await fetch(`http://localhost:3000/post/delete/${postId}`, {
                                method: 'DELETE',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${authToken}`,
                                },
                            });

                            if (!response.ok) throw new Error('Failed to delete post');

                            postElement.remove();
                            showToast('Post deleted successfully!');
                        } catch (error) {
                            console.error('Error deleting post:', error);
                            showToast('Error deleting post. Please try again.');
                        }
                    });
                }

                // Edit post functionality
                const editButton = postElement.querySelector('.edit-post-button');
                if (editButton) {
                    editButton.addEventListener('click', () => {
                        const postId = editButton.getAttribute('data-post-id');
                        window.location.href = `Ads.html?edit=true&postId=${postId}`;
                    });
                }
            });

            // Close menu if user clicks outside
            document.addEventListener('click', () => {
                document.querySelectorAll('.post-options-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            });

            // Socket.IO connection
            const socket = io('http://localhost:3000');
            const userId = localStorage.getItem('userId');
            if (userId) {
                socket.emit('join', userId);
            }
        } catch (error) {
            console.error('Error fetching posts:', error);
            postsContainer.innerHTML = '<p>Failed to fetch posts. Please try again later.</p>';
        }
    }

    // Function to show toast notifications
    function showToast(message) {
        const toast = document.createElement('div');
        toast.classList.add('toast-message');
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                toast.remove();
            }, 500);
        }, 3000);
    }

    // Check login status when the page loads
    checkLoginStatus();
});