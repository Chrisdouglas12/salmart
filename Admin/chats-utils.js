// utils.js

// Render product preview for initial messages
function renderProductPreview() {
    if (productImage && productName && !isInitialMessageSent) {
        const previewContainer = document.createElement('div');
        previewContainer.id = 'product-preview';
        previewContainer.style.margin = '10px';
        previewContainer.style.textAlign = 'center';
        const isValidImageUrl = productImage.startsWith('http://') || productImage.startsWith('https://');
        previewContainer.innerHTML = `
            <p style="font-size: 14px; color: #777;">Product Preview: ${productName}</p>
            ${isValidImageUrl
                ? `<img src="${productImage}" class="product-photo-preview" alt="Product Preview" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                   <p style="display:none;color:red;">Failed to load product image.</p>`
                : `<p style="color:red;">No product image available.</p>`}
        `;
        chatMessages.insertAdjacentElement('beforebegin', previewContainer);
    }
}

// Load chat history and check for initial message
async function loadChatHistory() {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                showToast('Please log in to view messages', 'error');
                window.location.href = 'login.html';
                return;
            }

            console.log(`Attempt ${attempt + 1}: Fetching messages for user1=${userId}, user2=${receiverId}`);
            const res = await fetch(`${API_BASE_URL}/messages?user1=${encodeURIComponent(userId)}&user2=${encodeURIComponent(receiverId)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log(`Fetch response status: ${res.status}`);

            if (!res.ok) {
                const errorText = await res.text();
                console.error(`Attempt ${attempt + 1}: Failed to fetch messages: ${res.status} ${res.statusText}`, errorText);
                if (res.status === 401) {
                    throw new Error('Authentication failed. Please log in again.');
                } else if (attempt < maxRetries) {
                    console.log(`Retrying in ${retryDelay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
                throw new Error(`Failed to load messages after ${maxRetries + 1} attempts: ${res.status} ${errorText}`);
            }

            const rawText = await res.text();
            console.log('Raw response:', rawText);
            let messages;
            try {
                messages = JSON.parse(rawText);
            } catch (e) {
                console.error('Invalid JSON response:', rawText);
                showToast('Failed to parse chat history. Using cached messages.', 'warning');
                messages = [];
            }

            if (!Array.isArray(messages)) {
                console.warn('Response is not an array:', messages);
                showToast('Invalid chat history format. Using cached messages.', 'warning');
                messages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
            }
            console.log(`Fetched ${messages.length} messages`);

            const validMessages = messages.filter((msg, index) => {
                if (!msg || typeof msg !== 'object' || !msg.text || !msg.messageType) {
                    console.warn(`Skipping invalid message at index ${index}:`, msg);
                    return false;
                }
                if (['offer', 'counter-offer', 'buyerAccept', 'sellerAccept', 'end-bargain'].includes(msg.messageType)) {
                    try {
                        JSON.parse(msg.text);
                        return true;
                    } catch (e) {
                        console.warn(`Invalid JSON text in message at index ${index}:`, msg.text);
                        msg.text = JSON.stringify({ text: msg.text });
                        return true;
                    }
                }
                return true;
            });

            const initialMessageExists = validMessages.some(msg => {
                if (msg.senderId === userId && msg.messageType === 'text' && msg.text.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(msg.text);
                        return parsed.image === productImage && parsed.text === predefinedMessage;
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            });

            if (initialMessageExists) {
                isInitialMessageSent = true;
                localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, 'true');
            }

            renderProductPreview();

            lastDisplayedDate = null;
            validMessages.forEach(displayMessage);
            localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(validMessages));
            return; // Success, exit function
        } catch (error) {
            console.error(`Attempt ${attempt + 1}: Error loading chat history:`, error);
            if (attempt === maxRetries) {
                showToast(`Failed to load messages: ${error.message}. Showing offline messages.`, 'error');
                const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
                storedMessages.forEach(displayMessage);
                renderProductPreview();
            }
        }
    }
}

// Format message date
function formatMessageDate(date) {
    const today = new Date();
    const messageDate = new Date(date);
    const isToday = messageDate.toDateString() === today.toDateString();

    if (isToday) return 'Today';

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (messageDate.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return messageDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Show toast notifications
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.error('Toast element not found');
        return;
    }
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
    }
    toast.textContent = message;
    toast.className = 'toast-message';
    if (type === 'error') {
        toast.classList.add('error');
    } else if (type === 'warning') {
        toast.classList.add('warning');
    }
    toast.style.display = 'block';
    toast.style.opacity = '1';
    toast.timeoutId = setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.style.display = 'none';
            toast.classList.remove('fade-out', 'error', 'warning');
        }, 500);
    }, 3000);
}

// Report a user
function reportUser() {
    const modal = document.getElementById('reportConfirmationModal');
    if (!modal) {
        showToast('Report modal not found', 'error');
        return;
    }
    modal.style.display = 'flex';

    const confirmBtn = document.getElementById('confirmReportBtn');
    const cancelBtn = document.getElementById('cancelReportBtn');

    const confirmHandler = () => {
        const reason = document.getElementById('reportReason').value.trim();
        if (!reason) {
            showToast('Please enter a reason for reporting', 'error');
            return;
        }

        showToast('Submitting report...', 'warning');
        fetch(`${API_BASE_URL}/users/report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                reportedUserId: receiverId,
                reason: reason,
                reporterId: userId
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('User reported successfully. Our team will review the report.', 'success');
                    document.getElementById('chat-dropdown').style.display = 'none';
                } else {
                    showToast(data.message || 'Failed to report user. Please try again.', 'error');
                }
                modal.style.display = 'none';
            })
            .catch(error => {
                console.error('Error reporting user:', error);
                showToast('An error occurred while reporting the user.', 'error');
                modal.style.display = 'none';
            });
    };

    const cancelHandler = () => {
        modal.style.display = 'none';
    };

    // Remove existing listeners to prevent duplicates
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    document.getElementById('confirmReportBtn').addEventListener('click', confirmHandler);
    document.getElementById('cancelReportBtn').addEventListener('click', cancelHandler);
}

// Block a user
function blockUser() {
    const modal = document.getElementById('blockConfirmationModal');
    if (!modal) {
        showToast('Block modal not found', 'error');
        return;
    }
    document.getElementById('blockConfirmationText').textContent =
        `Are you sure you want to block ${recipientUsername}? You won't be able to message each other.`;
    modal.style.display = 'flex';

    const confirmBtn = document.getElementById('confirmBlockBtn');
    const cancelBtn = document.getElementById('cancelBlockBtn');

    const confirmHandler = () => {
        showToast('Blocking user...', 'warning');
        fetch(`${API_BASE_URL}/users/block`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                blockerId: userId,
                userIdToBlock: receiverId
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('User blocked successfully.', 'success');
                    document.getElementById('chat-dropdown').style.display = 'none';
                    window.location.href = 'Chats.html';
                } else {
                    showToast(data.message || 'Failed to block user. Please try again.', 'error');
                }
                modal.style.display = 'none';
            })
            .catch(error => {
                console.error('Error blocking user:', error);
                showToast('An error occurred while blocking the user.', 'error');
                modal.style.display = 'none';
            });
    };

    const cancelHandler = () => {
        modal.style.display = 'none';
    };

    // Remove existing listeners to prevent duplicates
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    document.getElementById('confirmBlockBtn').addEventListener('click', confirmHandler);
    document.getElementById('cancelBlockBtn').addEventListener('click', cancelHandler);
}

// Initialize chat history loading
loadChatHistory();