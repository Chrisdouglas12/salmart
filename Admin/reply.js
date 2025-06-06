document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
    const commentDetailsContainer = document.querySelector('.comment-details-container');
    const replyInput = document.getElementById('reply-input');
    const replySubmit = document.getElementById('reply-submit');
    const userAvatar = document.getElementById('user-avatar');

    // Get postId and commentId from URL
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('postId');
    const commentId = urlParams.get('commentId');

    if (!postId || !commentId) {
        commentDetailsContainer.innerHTML = '<p>Comment not found.</p>';
        return;
    }

    // Function to format time (reused from post-details.js)
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

    // Show toast notification (reused)
    function showToast(message) {
        const toast = document.querySelector('.toast-message');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Fetch user profile for avatar
    async function fetchUserProfile() {
        try {
            const response = await fetch(`${API_BASE_URL}/verify-token`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
            });
            if (response.ok) {
                const userData = await response.json();
                userAvatar.src = userData.profilePicture || 'default-avater.png';
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
        }
    }

    // Fetch comment and replies
    async function fetchCommentAndReplies() {
        console.log('connecting to the server');
        try {
            const response = await fetch(`${API_BASE_URL}/post/reply/${postId}/${commentId}`);
            if (!response.ok) throw new Error('Failed to fetch comment');
            const data = await response.json();
            const comment = data.comment; // Assume API returns { comment: { ... } }

            // Render parent comment and replies
            commentDetailsContainer.innerHTML = `
                <div class="comment parent-comment">
                    <img src="${comment.profilePicture || 'default-avatar.png'}" class="comment-avatar">
                    <div class="comment-info">
                        <strong>${comment.name}</strong>
                        <p>${comment.text}</p>
                        <span class="comment-time">${formatTime(comment.createdAt)}</span>
                    </div>
                </div>
                <div class="replies-list">
                    ${comment.replies && comment.replies.length > 0 ? comment.replies.map(reply => `
                        <div class="comment reply">
                            <img src="${reply.profilePicture || 'default-avatar.png'}" class="comment-avatar">
                            <div class="comment-info">
                                <strong>${reply.name}</strong>
                                <p>${reply.text}</p>
                                <span class="comment-time">${formatTime(reply.createdAt)}</span>
                            </div>
                        </div>
                    `).join('') : '<p></p>'}
                </div>
            `;
        } catch (error) {
            console.error('Error fetching comment:', error);
            commentDetailsContainer.innerHTML = '<p>Error loading comment. Please try again.</p>';
        }
    }

    // Add reply functionality
    replySubmit.addEventListener('click', async () => {
        const replyText = replyInput.value.trim();
        if (!replyText) {
            showToast('Please enter a reply.');
            return;
        }

        replySubmit.disabled = true;
        try {
            const response = await fetch(`${API_BASE_URL}/post/reply/${postId}/${commentId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({ text: replyText }),
            });

            if (!response.ok) throw new Error('Failed to post reply');
            await response.json(); // No need to use the reply directly

            // Refresh the comment and replies list
            await fetchCommentAndReplies();

            replyInput.value = '';
            showToast('Your reply has been posted!');
        } catch (error) {
            console.error('Error posting reply:', error);
            showToast(error.message || 'Failed to post reply.');
        } finally {
            replySubmit.disabled = false;
        }
    });

    // Handle Enter key for reply submission
    replyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !replySubmit.disabled) {
            replySubmit.click();
        }
    });

    // Initialize page
    await fetchUserProfile();
    await fetchCommentAndReplies();
});