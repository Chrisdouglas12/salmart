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
    
let followingList = [];
   try {
       followingList = JSON.parse(localStorage.getItem('followingList')) || [];
   } catch (e) {
       console.error("Error parsing followingList:", e);
       followingList = [];
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
                fetchPosts(); // Load all posts initially

// Add event listeners for category buttons
document.querySelectorAll('.category-btn').forEach(button => {
    button.addEventListener('click', function () {
        const selectedCategory = this.getAttribute('data-category');
        fetchPosts(selectedCategory);
    });
});
                // Fetch posts after successful login
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
    async function fetchPosts(category = '') {
    const postsContainer = document.getElementById('posts-container');
    try {
        
        const response = await fetch(`${API_BASE_URL}/post?category=${encodeURIComponent(category)}`);
            if (!response.ok) throw new Error('Failed to fetch posts');

            const posts = await response.json();
            postsContainer.innerHTML = ""; // Clear existing posts

            // First, update the post creation code to properly handle follow status
posts.forEach(post => {
    const postElement = document.createElement('div');
    postElement.classList.add('post');
    postElement.dataset.createdAt = post.createdAt;
    // Check if the current user is already following this post's author
    const isFollowing = post.isFollowing || false;
    
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
    followingList.includes(post.createdBy.userId) ?
        `<button class="follow-button" data-user-id="${post.createdBy.userId}" 
            style="display:none">
            <i class="fas fa-user-check"></i> Following
        </button>` :
        `<button class="follow-button" data-user-id="${post.createdBy.userId}">
            <i class="fas fa-user-plus"></i> Follow
        </button>`
    : ''}
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
                    <p class="post-description"><b>Price:</b> &#8358;${Number(post.price).toLocaleString('en-Ng')}</p>
                    <p class="post-description"><b>Location:</b> ${post.location}</p>
                    <img src="${post.photo || 'default-image.png'}" class="post-image" onclick="openImage('${post.photo || 'default-image.png'}')">
                        <div class="buy" style="text-align: center">
          <button class="buy-now-button" data-post-id="${post._id}" ${post.isSold ? 'disabled' : ''}> <i class="fas fa-shopping-cart"></i> ${post.isSold ? 'Sold Out' : 'Buy Now'}</button>
<a id="send-message-link">
  <button class="buy-now-button" id="send-message-btn"
    data-recipient-id="${post.createdBy.userId}"
    data-product-image="${post.photo || 'default-image.png'}"
    data-product-description="${post.description}">
    <i class="fas fa-circle-dot"></i>   ${post.isSold ? 'Unavailable': 'Check availabilty'}
  </button>
</a>
                    </div>
                    <div class="post-actions">
                        <button class="like-button">
                            <i class="${post.likes.includes(loggedInUser) ? 'fas' : 'far'} fa-heart"></i>
                            <span class="like-count">${post.likes.length} </span><p>Likes</p>
                        </button>
                        <button class="reply-button"><i class="far fa-comment-alt"></i><span class="comment-count">${post.comments ? post.comments.length : 0}</span><p> Comments</p> </button>
                        <button class="share-button"><i class="fas fa-share"></i></button>
                    </div>
                  
                `;
                postsContainer.prepend(postElement);
                
               
          
// Check availability functionality
const sendMessageBtn = postElement.querySelector("#send-message-btn");
if (post.isSold) {
    sendMessageBtn.disabled = true;
}
const sendMessageLink = postElement.querySelector("#send-message-link");
sendMessageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const recipientId = sendMessageBtn.dataset.recipientId;
    const recipientUsername = post.createdBy.name;
    const recipientProfilePictureUrl = post.profilePicture || 'default-avatar.png';
    const productImage = sendMessageBtn.dataset.productImage;
    const productDescription = sendMessageBtn.dataset.productDescription;

    // Construct the predefined message
    const message = `Is this item still available?\n\nProduct: ${productDescription}`;
    const userId = localStorage.getItem("userId");

    // Encode parameters for the URL
    const encodedMessage = encodeURIComponent(message);
    const encodedProductImage = encodeURIComponent(productImage);
    const encodedRecipientUsername = encodeURIComponent(recipientUsername);
    const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);

    // Redirect to the chat page with all necessary parameters
    sendMessageLink.href = `Chats.html?user_id=${userId}&recipient_id=${recipientId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}`;
    window.location.href = sendMessageLink.href;
});
  
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
    
    // Get current state from DOM
    const isCurrentlyLiked = icon.classList.contains('fas');
    let currentLikes = parseInt(likeCountElement.textContent, 10);

    // Immediately disable button to prevent double clicks
    likeButton.disabled = true;

    // Optimistic UI update
    likeCountElement.textContent = isCurrentlyLiked ? currentLikes - 1 : currentLikes + 1 ;
    icon.classList.toggle('fas', !isCurrentlyLiked);
    icon.classList.toggle('far', isCurrentlyLiked);

    try {
        const response = await fetch(`${API_BASE_URL}/post/like/${postId}`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: isCurrentlyLiked ? 'unlike' : 'like' })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to like/unlike post');
        }

        const data = await response.json();
        
        // Always use server response as the source of truth
        likeCountElement.textContent = data.likes.length;
        
        // Determine if current user still likes the post
        const userStillLikes = data.likes.includes(loggedInUser);
        icon.classList.toggle('fas', userStillLikes);
        icon.classList.toggle('far', !userStillLikes);

        // Only emit socket event if the action was successful
        if (userStillLikes && !isCurrentlyLiked) {
            socket.emit('likePost', { postId, userId: loggedInUser });
        }
    } catch (error) {
        console.error('Error:', error);
        // Revert to original state on error
        likeCountElement.textContent = currentLikes;
        icon.classList.toggle('fas', isCurrentlyLiked);
        icon.classList.toggle('far', !isCurrentlyLiked);
        showToast(error.message || 'Action failed. Please try again.', '#dc3545');
    } finally {
        likeButton.disabled = false;
    }
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
if (post.createdBy.userId === loggedInUser) {
    const buyDiv = postElement.querySelector('.buy');
    if (buyDiv) {
        buyDiv.remove(); // Remove the buy div entirely
    }
}
                // Toggle comment section
const commentToggleButton = postElement.querySelector('.reply-button');
commentToggleButton.addEventListener('click', () => {
    window.location.href = `posts-details.html?postId=${post._id}`;
});
                
  //share ad functionality
const shareButton = postElement.querySelector('.share-button');
shareButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showShareModal(post);
});
// share ads function
function sharePost(post, postLink, platform) {
    const shareText = `Check out this product: ${post.description} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}`;
    
    switch(platform) {
        case 'copy':
            copyToClipboard(postLink);
            showToast('Link copied to clipboard!');
            break;
            
        case 'whatsapp':
            // Try WhatsApp app first, then fall back to web
            const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareText + '\n' + postLink)}`;
            const whatsappWebUrl = `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + postLink)}`;
            openAppOrWeb(whatsappUrl, whatsappWebUrl);
            break;
            
        case 'facebook':
            // Facebook app deep link
            const facebookUrl = `fb://sharer.php?u=${encodeURIComponent(postLink)}`;
            const facebookWebUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postLink)}`;
            openAppOrWeb(facebookUrl, facebookWebUrl);
            break;
            
        case 'twitter':
            // Twitter app deep link
            const twitterUrl = `twitter://post?message=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postLink)}`;
            const twitterWebUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postLink)}`;
            openAppOrWeb(twitterUrl, twitterWebUrl);
            break;
            
        case 'telegram':
            // Telegram app deep link
            const telegramUrl = `tg://msg_url?url=${encodeURIComponent(postLink)}&text=${encodeURIComponent(shareText)}`;
            const telegramWebUrl = `https://t.me/share/url?url=${encodeURIComponent(postLink)}&text=${encodeURIComponent(shareText)}`;
            openAppOrWeb(telegramUrl, telegramWebUrl);
            break;
            
        case 'instagram':
            // Instagram doesn't support direct sharing, but we can open the app
            const instagramUrl = `instagram://library?AssetPath=${encodeURIComponent(postLink)}`;
            openAppOrWeb(instagramUrl, `https://www.instagram.com/`);
            break;
    }
}

// Add this new helper function to try opening apps first:
function openAppOrWeb(appUrl, webUrl) {
    // Try to open the app
    window.location.href = appUrl;
    
    // If the app doesn't open, fall back to web after a delay
    setTimeout(() => {
        if (!document.hidden) {
            window.open(webUrl, '_blank');
        }
    }, 500);
}

// Update the showShareModal function to include Instagram:
function showShareModal(post) {
    // Create modal element
    const shareModal = document.createElement('div');
    shareModal.className = 'share-modal';
    
    // Generate the post link
    const postLink = `${window.location.origin}/index.html?id=${post._id}`;
    
    // Modal content with Instagram option
    shareModal.innerHTML = `
        <div class="share-modal-content">
            <div class="share-modal-header">
                <h3>Share this post</h3>
                <span class="close-share-modal">&times;</span>
            </div>
            <div class="share-modal-body">
                <div class="share-options">
                    <button class="share-option" data-platform="copy">
                        <i class="fas fa-copy"></i>
                        <span>Copy Link</span>
                    </button>
                    <button class="share-option" data-platform="whatsapp">
                        <i class="fab fa-whatsapp"></i>
                        <span>WhatsApp</span>
                    </button>
                    <button class="share-option" data-platform="facebook">
                        <i class="fab fa-facebook"></i>
                        <span>Facebook</span>
                    </button>
                    <button class="share-option" data-platform="twitter">
                        <i class="fab fa-twitter"></i>
                        <span>Twitter</span>
                    </button>
                    <button class="share-option" data-platform="telegram">
                        <i class="fab fa-telegram"></i>
                        <span>Telegram</span>
                    </button>
                    <button class="share-option" data-platform="instagram">
                        <i class="fab fa-instagram"></i>
                        <span>Instagram</span>
                    </button>
                </div>
                <div class="share-link-container">
                    <input type="text" value="${postLink}" readonly class="share-link-input">
                    <button class="copy-link-button">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(shareModal);
    document.body.style.overflow = 'hidden';

    // Close modal handlers
    const closeModal = () => {
        document.body.removeChild(shareModal);
        document.body.style.overflow = '';
    };

    shareModal.querySelector('.close-share-modal').addEventListener('click', closeModal);

    // Click outside to close
    shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) {
            closeModal();
        }
    });

    // Handle share options
    const shareOptions = shareModal.querySelectorAll('.share-option');
    shareOptions.forEach(option => {
        option.addEventListener('click', () => {
            const platform = option.getAttribute('data-platform');
            sharePost(post, postLink, platform);
            closeModal();
        });
    });

    // Enhanced clipboard copy
    shareModal.querySelector('.copy-link-button').addEventListener('click', async () => {
        const success = await copyToClipboard(postLink);
        showToast(success ? 'Link copied to clipboard!' : 'Failed to copy link');
    });
}

// Update the copyToClipboard function to use modern API:
async function copyToClipboard(text) {
    try {
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        return false;
    }
}
      
// Report post functionality - Modern UI Modal Version
const reportButton = postElement.querySelector('.report-post-button');
reportButton.addEventListener('click', async () => {
    const postId = reportButton.getAttribute('data-post-id');
    const authToken = localStorage.getItem('authToken');
    
    if (!authToken) {
        showToast("Please log in to report posts");
        return;
    }

    // Create a modal for reporting
    const reportModal = document.createElement('div');
    reportModal.className = 'report-modal';
    reportModal.innerHTML = `
        <div class="report-modal-content">
            <div class="report-modal-header">
                <h3>Report Post</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="report-modal-body">
                <p>Please select the reason for reporting this post:</p>
                <div class="report-reasons">
                    <label class="report-reason">
                        <input type="radio" name="report-reason" value="Spam">
                        <span>Spam or misleading content</span>
                    </label>
                    <label class="report-reason">
                        <input type="radio" name="report-reason" value="Inappropriate">
                        <span>Inappropriate content</span>
                    </label>
                    <label class="report-reason">
                        <input type="radio" name="report-reason" value="Harassment">
                        <span>Harassment or bullying</span>
                    </label>
                    <label class="report-reason">
                        <input type="radio" name="report-reason" value="Scam">
                        <span>Scam or fraud</span>
                    </label>
                    <label class="report-reason">
                        <input type="radio" name="report-reason" value="Other">
                        <span>Other (please specify)</span>
                    </label>
                </div>
                <div class="other-reason-container" style="display: none;">
                    <textarea id="other-reason" placeholder="Please provide details..." rows="3"></textarea>
                </div>
            </div>
            <div class="report-modal-footer">
                <button class="cancel-report">Cancel</button>
                <button class="submit-report" disabled>Submit Report</button>
            </div>
        </div>
    `;

    document.body.appendChild(reportModal);
    document.body.style.overflow = 'hidden'; // Prevent scrolling

    // Handle radio button changes
    const radioButtons = reportModal.querySelectorAll('input[type="radio"]');
    const otherReasonContainer = reportModal.querySelector('.other-reason-container');
    const submitButton = reportModal.querySelector('.submit-report');
    
    radioButtons.forEach(radio => {
        radio.addEventListener('change', () => {
            submitButton.disabled = false;
            if (radio.value === 'Other') {
                otherReasonContainer.style.display = 'block';
            } else {
                otherReasonContainer.style.display = 'none';
            }
        });
    });

    // Close modal handlers
    const closeModal = () => {
        document.body.removeChild(reportModal);
        document.body.style.overflow = '';
    };

    reportModal.querySelector('.close-modal').addEventListener('click', closeModal);
    reportModal.querySelector('.cancel-report').addEventListener('click', closeModal);

    // Click outside to close
    reportModal.addEventListener('click', (e) => {
        if (e.target === reportModal) {
            closeModal();
        }
    });

    // Submit report handler
    submitButton.addEventListener('click', async () => {
        const selectedReason = reportModal.querySelector('input[name="report-reason"]:checked').value;
        let reportDetails = selectedReason;
        
        if (selectedReason === 'Other') {
            const otherDetails = reportModal.querySelector('#other-reason').value.trim();
            if (!otherDetails) {
                showToast("Please provide details for your report");
                return;
            }
            reportDetails += `: ${otherDetails}`;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/post/report/${postId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ 
                    reason: reportDetails,
                    postDescription: post.description 
                }),
            });

            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || 'Failed to report post');
            }

            // Update UI to show reported status
            reportButton.innerHTML = '<i class="fas fa-flag"></i> Reported';
            reportButton.disabled = true;
            reportButton.style.color = '#ff0000';
            
            showToast(result.message || 'Post reported successfully! Admin will review it shortly.');
            closeModal();
        } catch (error) {
            console.error('Error reporting post:', error);
            showToast(error.message || 'Error reporting post. Please try again.');
        }
    });
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

     // Function to check follow status on page load and hide buttons if already following
async function checkFollowStatusOnLoad() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/following`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const { following } = await response.json();
            // Store following list in localStorage to use during post rendering
            localStorage.setItem('followingList', JSON.stringify(following));
        }
    } catch (error) {
        console.error('Error checking follow status:', error);
    }
}
// Call the function to check follow status on page load

 //Then update the follow button click handler:
document.querySelectorAll('.follow-button').forEach(followButton => {
       followButton.addEventListener('click', async () => {
           const userIdToFollow = followButton.getAttribute('data-user-id');
           const token = localStorage.getItem('authToken');

           if (!token) {
               showToast('Please log in to follow users');
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

               // First check if there's any response at all
               if (!response.ok) {
                   throw new Error(`HTTP error! status: ${response.status}`);
               }

               // Check if response has content before parsing
               const text = await response.text();
               const result = text ? JSON.parse(text) : {};

               // Update localStorage following list
               let followingList = [];
               try {
                   followingList = JSON.parse(localStorage.getItem('followingList')) || [];
               } catch (e) {
                   console.error("Error parsing followingList:", e);
               }

               if (!followingList.includes(userIdToFollow)) {
                   followingList.push(userIdToFollow);
                   localStorage.setItem('followingList', JSON.stringify(followingList));
               }

               // Update all follow buttons for this user
               document.querySelectorAll(`.follow-button[data-user-id="${userIdToFollow}"]`).forEach(button => {
                   button.innerHTML = `<i class="fas fa-user-check"></i> Following`;
                   button.style.backgroundColor = '#28a745'; // Visual feedback
               });

               showToast(`You are now following this user!`);
           } catch (error) {
               console.error('Error following user:', error);
               showToast(error.message || 'Failed to follow user. Please try again.');
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

          
        } catch (error) {
            console.error('Error fetching posts:', error);
            postsContainer.innerHTML = '<p style="text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">No ads yet. Try again or create one!</p>';
        }
    }

    // Function to show toast notifications
    function showToast(message) {
    let toast = document.createElement("div");
    toast.className = "toast-message show";
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

    // Check login status when the page loads
    checkLoginStatus();
    
});

