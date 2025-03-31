document.addEventListener('DOMContentLoaded', async function () {
    const profilePictureContainer = document.getElementById('profile-picture1');
    const homeProfilePicture = document.getElementById('profile-picture3');
    const usernameContainer = document.getElementById('username1');
    let loggedInUser = null; // Define loggedInUser variable
    const API_BASE_URL =
      window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      :
'https://salmart-production.up.railway.app'

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
          
            const response = await fetch(`${API_BASE_URL}/verify-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const userData = await response.json();
                profilePictureContainer.src = userData.profilePicture || 'default-avatar.png';
                homeProfilePicture.src = userData.profilePicture || 'default-avatar.png';
                usernameContainer.textContent = `Welcome, ${userData.firstName}`;
                loggedInUser = userData.userId; // Set loggedInUser to the current user's ID
                fetchPosts(); // Fetch posts after successful login
            } else {
                throw new Error('Token validation failed');
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            showLoginOption();
        }
    }

    // Function to show login option if user is not logged in
    function showLoginOption() {
        profilePictureContainer.src = 'default-avatar.png';
        homeProfilePicture.src = 'default-avatar.png';
        usernameContainer.textContent = 'Please log in';
    }

    // Function to fetch and display posts
    async function fetchPosts() {
        const postsContainer = document.getElementById('posts-container');
        try {
            const response = await fetch(`${API_BASE_URL}/post`);
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
                        ${post.createdBy.userId !== loggedInUser ?
                            `<button class="follow-button" data-user-id="${post.createdBy.userId}" data-is-following="${post.isFollowing}"><i class="fas fa-user-plus"></i> Follow</button>` : ''}
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
<a id="send-message-link">
  <button class="buy-now-button" id="send-message-btn"
    data-recipient-id="${post.createdBy.userId}"
    data-product-image="${post.photo || 'default-image.png'}"
    data-product-description="${post.description}">
    ${post.isSold ? 'Unavailable': 'Check availabilty'}
  </button>
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
                        const response = await fetch(`${API_BASE_URL}/post/like/${postId}`, {
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
if(post.isSold) {
  sendMessageBtn.disabled = true
}
const sendMessageLink = postElement.querySelector("#send-message-link");

sendMessageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const recipientId = sendMessageBtn.dataset.recipientId;
    const recipientUsername = post.createdBy.name;
    const recipientProfilePictureUrl = post.profilePicture || 'default-avatar.png';
    const productImage = sendMessageBtn.dataset.productImage;
    const productDescription = sendMessageBtn.dataset.productDescription;

    // Construct the message with product details
    const message = `Is this item still available?\n\nProduct: ${productDescription}\nImage: ${productImage}`;

    // Redirect to the chat page with the pre-filled message
    sendMessageLink.href = `Chats.html?user_id=${userId}&recipient_id=${recipientId}&recipient_username=${recipientUsername}&recipient_profile_picture_url=${recipientProfilePictureUrl}&message=${encodeURIComponent(message)}`;
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
                        const response = await fetch(`${API_BASE_URL}/pay`, {
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
                        const response = await fetch(`${API_BASE_URL}/post/comment/${post._id}`, {
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
                            const response = await fetch(`${API_BASE_URL}/post/delete/${postId}`, {
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

                // Follow button functionality
                // Function to check follow status on page load and hide buttons if already following
async function checkFollowStatusOnLoad() {
    const token = localStorage.getItem('authToken');
    const loggedInUserId = localStorage.getItem('userId');

    if (!token || !loggedInUserId) {
        console.log('User not logged in. Skipping follow status check.');
        return;
    }

    const allFollowButtons = document.querySelectorAll('.follow-button');

    allFollowButtons.forEach(async button => {
        const userIdToFollow = button.getAttribute('data-user-id');

        try {
            const response = await fetch(`${API_BASE_URL}/api/is-following/${userIdToFollow}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch follow status');
            }

            const result = await response.json();

            if (result.isFollowing) {
                // Hide the follow button if the user is already following
                button.setAttribute('data-is-following', 'true');
                button.innerHTML = `<i class="fas fa-user-check"></i> Following`;
                button.disabled = true;
                button.style.display = 'none';
            }
        } catch (error) {
            console.error('Error fetching follow status:', error);
        }
    });
}


// Call the function to check follow status on page load
document.addEventListener('DOMContentLoaded', checkFollowStatusOnLoad);
// Add event listeners to all follow buttons
document.querySelectorAll('.follow-button').forEach(followButton => {
    followButton.addEventListener('click', async () => {
        const userIdToFollow = followButton.getAttribute('data-user-id');
        const token = localStorage.getItem('authToken');

        if (!token) {
            console.warn('No token found');
            alert('Please log in to follow users.');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/follow/${userIdToFollow}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to follow user');
            }

            const result = await response.json();

            if (result.success) {
                // Update the UI immediately
                followButton.setAttribute('data-is-following', 'true');
                followButton.innerHTML = `<i class="fas fa-user-check"></i> Following`;
                followButton.disabled = true;
                followButton.style.display = 'none';

                // Hide all other follow buttons for the same user across other posts
                const allFollowButtons = document.querySelectorAll('.follow-button');
                allFollowButtons.forEach(button => {
                    if (button.getAttribute('data-user-id') === userIdToFollow) {
                        button.setAttribute('data-is-following', 'true');
                        button.innerHTML = `<i class="fas fa-user-check"></i> Following`;
                        button.disabled = true;
                        button.style.display = 'none';
                    }
                });

                // Show a success message
                showToast(`You are now following this user!`);
            } else {
                console.error('Follow failed:', result.message || result.error);
                showToast('Failed to follow user.');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            showToast('Failed to follow user. Please try again.');
        }
    });
});

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
            const socket = io(`${API_BASE_URL}`);
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

