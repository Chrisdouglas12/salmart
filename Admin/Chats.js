// API base URL configuration for local and production environments
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com';

// Initialize Socket.IO connection with WebSocket and polling transports
const socket = io(API_BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: localStorage.getItem('authToken') }
});

// DOM elements for chat interface
const chatMessages = document.getElementById('chat-messages');
const typeSection = document.getElementById('type-section');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const ellipsisBtn = document.getElementById('ellipsis-btn');
const chatDropdown = document.getElementById('chat-dropdown');

// Parse URL parameters for chat context
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id') || '';
const receiverId = urlParams.get('recipient_id') || '';
const recipientUsername = urlParams.get('recipient_username') ? decodeURIComponent(urlParams.get('recipient_username')) : 'User';
const recipientProfilePictureUrl = urlParams.get('recipient_profile_picture_url') ? decodeURIComponent(urlParams.get('recipient_profile_picture_url')) : '/default-avatar.png';
const predefinedMessage = urlParams.get('message') ? decodeURIComponent(urlParams.get('message')) : '';
const productImage = urlParams.get('product_image') ? decodeURIComponent(urlParams.get('product_image')) : '';
const productId = urlParams.get('product_id') || '';
const productName = urlParams.get('product_name') ? decodeURIComponent(urlParams.get('product_name')) : '';
const originalPrice = urlParams.get('original_price') ? parseFloat(urlParams.get('original_price')) : null;


// Set recipient info in the UI
document.getElementById('chats-userName').textContent = recipientUsername;
document.getElementById('chatspic').src = recipientProfilePictureUrl;

// Pre-fill chat input with predefined message if provided
if (predefinedMessage) {
    typeSection.value = predefinedMessage;
} else {
    typeSection.value = '';
}

// Track displayed messages and initial message status
const displayedMessages = new Set();
let isInitialMessageSent = localStorage.getItem(`initialMessageSent_${productId}_${receiverId}`) === 'true';


// Function to render product preview
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
                ? `<img src="${productImage}" class="product-photo-preview" alt="Product Preview" style="max-width: 200px; border-radius: 5px; margin-top: 60px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                   <p style="display:none;color:red;">Failed to load product image.</p>`
                : `<p style="color:red;">No product image available.</p>`}
        `;
        chatMessages.insertAdjacentElement('beforebegin', previewContainer);
    }
}

// Join chat room if userId and receiverId are available
if (userId && receiverId) socket.emit('joinRoom', userId);

let lastDisplayedDate = null;

// Helper: create a persistent system message div
function createSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    return div;
}


// Display a message in the chat
function displayMessage(message, isOptimistic = false) {
    if (message._id && displayedMessages.has(message._id)) {
        return;
    }
    if (message._id) {
        displayedMessages.add(message._id);
    }

    const messageDate = new Date(message.createdAt);
    const formattedDate = formatMessageDate(messageDate);

    let displayText = message.content || message.text || '';
    let displayImage = null;
    let offerDetails = message.offerDetails || {};

    let parsedFromJson = {};
    if (typeof message.text === 'string' && message.text.startsWith('{')) {
        try {
            parsedFromJson = JSON.parse(message.text);
            displayText = parsedFromJson.text || displayText;
            displayImage = parsedFromJson.image || displayImage;
            offerDetails = { ...offerDetails, ...parsedFromJson };
        } catch (e) {
            console.warn('Failed to parse message text as JSON:', message.text, e);
            displayText = message.text;
        }
    }

    if (displayImage && !displayImage.match(/^https?:\/\//)) {
        displayImage = displayImage.startsWith('/') ? `${API_BASE_URL}${displayImage}` : displayImage;
    }

    if (formattedDate !== lastDisplayedDate) {
        chatMessages.appendChild(createSystemMessage(formattedDate));
        lastDisplayedDate = formattedDate;
    }

    // Update state based on message type
    if (offerDetails && offerDetails.productId) {
        const productKey = offerDetails.productId;
        if (['accepted', 'completed'].includes(offerDetails.status)) {
            acceptedOffers.add(productKey);
            bargainingSessions.delete(`${productKey}-${message.senderId}`);
            endedBargains.add(productKey);
        } else if (offerDetails.status === 'rejected' || message.messageType === 'end-bargain') {
            endedBargains.add(productKey);
            bargainingSessions.delete(`${productKey}-${message.senderId}`);
        }
    }
    if (message.messageType === 'counter-offer' && message.senderId === userId && offerDetails?.productId) {
        sentCounterOffers.add(offerDetails.productId);
    }
    saveBargainStates();

    // --- SYSTEM MESSAGES ---
    if (['accept-offer', 'reject-offer', 'end-bargain', 'payment-completed', 'buyerAccept', 'sellerAccept'].includes(message.messageType)) {
        let systemText = displayText;
        let systemImage = displayImage;

        if (message.messageType === 'accept-offer') {
             systemText = `Offer for ${offerDetails.productName || 'Product'} at ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} was accepted.`;
        } else if (message.messageType === 'reject-offer') {
            systemText = `Offer for ${offerDetails.productName || 'Product'} was rejected.`;
        } else if (message.messageType === 'end-bargain') {
            systemText = `${message.senderId === userId ? 'You' : recipientUsername} ended the bargain for ${offerDetails.productName || 'Product'}.`;
        } else if (message.messageType === 'payment-completed') {
            systemText = `Payment completed for ${offerDetails.productName || 'Product'}.`;
            systemImage = message.attachment?.url || systemImage;
        } else if (message.messageType === 'buyerAccept' && message.receiverId === userId) {
            systemText = `Your offer of ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} for "${offerDetails.productName || 'Product'}" has been accepted.`;
            systemImage = offerDetails.image || systemImage;
        } else if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
            systemText = `Accepted the offer of ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} for "${offerDetails.productName || 'Product'}".`;
            systemImage = offerDetails.image || systemImage;
        }

        const systemDiv = createSystemMessage(systemText);

        if (systemImage) {
            const imageContainer = document.createElement('div');
            imageContainer.style.margin = '10px 0';
            imageContainer.innerHTML = `
                <img src="${systemImage}" class="product-photo-preview" alt="${offerDetails.productName || 'Product'}"
                    style="max-width: 200px; border-radius: 5px;"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load image.</p>
            `;
            systemDiv.appendChild(imageContainer);
        }

        if (message.messageType === 'buyerAccept' && message.receiverId === userId) {
            const paymentBtn = document.createElement('button');
            paymentBtn.className = 'proceed-to-payment-btn';
            paymentBtn.textContent = 'Proceed to Payment';

            const checkPaymentStatus = async () => {
                const isPaid = await verifyPaymentStatus(offerDetails.productId, userId);
                if (isPaid) {
                    paymentBtn.disabled = true;
                    paymentBtn.textContent = 'Payment Completed';
                    paymentBtn.style.backgroundColor = 'gray';
                    paymentBtn.style.cursor = 'not-allowed';
                } else {
                    paymentBtn.onclick = () => initiatePayment(offerDetails.productId, offerDetails.proposedPrice, offerDetails.productName, paymentBtn);
                }
            };
            checkPaymentStatus();
            systemDiv.appendChild(paymentBtn);
        } else if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
            const waitingForPaymentBtn = document.createElement('button');
            waitingForPaymentBtn.className = 'waiting-for-payment-btn';
            waitingForPaymentBtn.textContent = 'Waiting for Payment';
            waitingForPaymentBtn.disabled = true;
            waitingForPaymentBtn.style.backgroundColor = '#f0ad4e';
            waitingForPaymentBtn.style.cursor = 'not-allowed';
            systemDiv.appendChild(waitingForPaymentBtn);
        }

        chatMessages.appendChild(systemDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // --- REGULAR CHAT MESSAGES ---
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    if (message.messageType === 'counter-offer' && offerDetails.productId) {
        msgDiv.setAttribute('data-product-id', offerDetails.productId);
        msgDiv.setAttribute('data-message-type', 'counter-offer');
    }

    msgDiv.innerHTML = `
        <div>${displayText}</div>
        ${displayImage ? `<img src="${displayImage}" class="product-photo-preview" alt="Product Image" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><p style="display:none;color:red;">Failed to load product image.</p>` : ''}
        <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
    `;

    const isOfferAccepted = offerDetails.productId && acceptedOffers.has(offerDetails.productId);
    const isBargainEnded = offerDetails.productId && endedBargains.has(offerDetails.productId);

    if (message.messageType === 'offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept Offer';
        acceptBtn.onclick = async () => {
            handleAcceptOffer(offerDetails, message.senderId);
        };
        msgDiv.appendChild(acceptBtn);

        const declineBtn = document.createElement('button');
        declineBtn.className = 'decline-offer-btn';
        declineBtn.textContent = 'Decline Offer';
        declineBtn.onclick = () => {
            openLastPriceModal(offerDetails.productId, offerDetails.productName, offerDetails.image);
        };
        msgDiv.appendChild(declineBtn);
    }

    if (message.messageType === 'counter-offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept Last Price';
        acceptBtn.onclick = async () => {
            handleAcceptCounterOffer(offerDetails, message.senderId);
        };
        msgDiv.appendChild(acceptBtn);

        const endBargainBtn = document.createElement('button');
        endBargainBtn.className = 'end-bargain-btn';
        endBargainBtn.textContent = 'End Bargain';
        endBargainBtn.onclick = async () => {
            handleEndBargain(offerDetails, message.senderId);
        };
        msgDiv.appendChild(endBargainBtn);
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Helper functions for optimistic updates
function updateOptimisticMessageId(newMessageId) {
    const lastSent = chatMessages.querySelector('.message.sent:last-child');
    if (lastSent && newMessageId) {
        lastSent.dataset.messageId = newMessageId;
        displayedMessages.add(newMessageId);
    }
}

function removeOptimisticMessage() {
    const lastSent = chatMessages.querySelector('.message.sent:last-child');
    if (lastSent && lastSent.dataset.messageId.startsWith('temp_')) {
        lastSent.remove();
    }
}

// Send a new message from the chat input
sendBtn.onclick = async () => {
    const text = typeSection.value.trim();
    if (!text) {
        showToast('Please enter a message', 'error');
        return;
    }

    const isInitialMessage = !isInitialMessageSent && predefinedMessage && productImage;

    const message = {
        receiverId,
        text: isInitialMessage ? JSON.stringify({ text, image: productImage }) : text,
        messageType: 'text',
        createdAt: new Date(),
        isRead: false
    };

    const optimisticMessage = { ...message, senderId: userId, status: 'sent' };
    displayMessage(optimisticMessage, true);

    typeSection.value = '';

    if (isInitialMessage) {
        isInitialMessageSent = true;
        localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, 'true');
        const previewContainer = document.getElementById('product-preview');
        if (previewContainer) {
            previewContainer.remove();
        }
    }

    try {
        const token = localStorage.getItem('authToken');
        if (!token) throw new Error('No auth token found');
        const response = await fetch(`${API_BASE_URL}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(message)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
        updateOptimisticMessageId(data.data?._id);
    } catch (error) {
        console.error('Error sending message:', error);
        showToast(`Failed to send message: ${error.message}`, 'error');
        removeOptimisticMessage();
    }
};

// Handle incoming messages
socket.on('newMessage', message => {
    const isForCurrentChat =
        (message.senderId === userId && message.receiverId === receiverId) ||
        (message.senderId === receiverId && message.receiverId === userId) ||
        (message.receiverId === userId && ['sellerAccept', 'buyerAccept', 'end-bargain', 'payment-completed'].includes(message.messageType));

    if (!isForCurrentChat) {
        return;
    }

    displayMessage(message);

    if (message.receiverId === userId && message.status !== 'seen' && message.senderId !== userId) {
        socket.emit('markAsSeen', {
            messageIds: [message._id],
            senderId: message.senderId,
            receiverId: userId
        });
    }

    if (message.senderId !== userId) {
        showToast(`New message from ${recipientUsername}`, 'success');
    }

    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) {
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    }
});

// Handle message synced event for persistence
socket.on('messageSynced', (message) => {
    const isForCurrentChat =
        (message.senderId === userId && message.receiverId === receiverId) ||
        (message.senderId === receiverId && message.receiverId === userId);

    if (!isForCurrentChat) {
        return;
    }
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) {
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    }
});

// Handle new message notifications
socket.on('newMessageNotification', (notification) => {
    if (notification.senderId !== receiverId) {
        showToast(`New message from ${notification.senderName}: ${notification.text}`, 'success');
    }
});

// Load chat history and check for initial message
async function loadChatHistory() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            showToast('Please log in to view messages', 'error');
            window.location.href = 'login.html';
            return;
        }

        const res = await fetch(`${API_BASE_URL}/messages?user1=${userId}&user2=${receiverId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Failed to fetch messages: ${res.status} ${res.statusText}`);
        }

        const rawText = await res.text();
        let messages;
        try {
            messages = JSON.parse(rawText);
        } catch (e) {
            console.error('Invalid JSON response:', rawText);
            showToast('Failed to parse chat history. Some messages may be missing.', 'error');
            messages = [];
        }

        if (!Array.isArray(messages)) {
            console.warn('Response is not an array:', messages);
            showToast('Invalid chat history format.', 'error');
            messages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        }

        const validMessages = messages.filter((msg, index) => {
            if (!msg || typeof msg !== 'object' || !msg.messageType) {
                return false;
            }
            if (!msg.text && !['image', 'payment-completed'].includes(msg.messageType)) {
                if (!['sellerAccept', 'buyerAccept', 'end-bargain'].includes(msg.messageType)) {
                    return false;
                }
            }
            if (typeof msg.text === 'string' && msg.text.startsWith('{') && ['offer', 'counter-offer', 'buyerAccept', 'sellerAccept', 'end-bargain', 'text'].includes(msg.messageType)) {
                try {
                    JSON.parse(msg.text);
                } catch (e) {
                }
            }
            return true;
        });

        const initialMessageExists = validMessages.some(msg => {
            if (msg.senderId === userId && msg.messageType === 'text' && typeof msg.text === 'string' && msg.text.startsWith('{')) {
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

        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {
        console.error('Error loading chat history:', error);
        showToast(`Failed to load messages: ${error.message}`, 'error');
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        storedMessages.forEach(displayMessage);
        renderProductPreview();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

loadChatHistory();

// Send typing signal
function sendTypingSignal() {
    socket.emit('typing', { senderId: userId, receiverId });
}

// Display typing indicator
socket.on('typing', data => {
    if (data.senderId === receiverId) {
        typingIndicator.textContent = `${recipientUsername} is typing...`;
        if (typingIndicator.timeout) clearTimeout(typingIndicator.timeout);
        typingIndicator.timeout = setTimeout(() => typingIndicator.textContent = '', 3000);
    }
});

// Handle socket errors
socket.on('messageError', ({ error }) => {
    showToast(`Message error: ${error}`, 'error');
});

socket.on('offerError', ({ error }) => {
    showToast(`Offer error: ${error}`, 'error');
});

socket.on('markSeenError', ({ error }) => {
    showToast(`Error marking message as seen: ${error}`, 'error');
});

socket.on('messagesSeen', ({ messageIds }) => {
    const messages = document.querySelectorAll('.message.sent .message-timestamp');
    messages.forEach((timestamp) => {
        const messageDiv = timestamp.closest('.message');
        if (messageDiv && messageIds.includes(messageDiv.dataset.messageId)) {
            if (!timestamp.textContent.includes('✔✔')) {
                timestamp.textContent += ' ✔✔';
            }
        }
    });
});


socket.on('connect', () => {
    console.log('Connected to server');
    if (userId) {
        socket.emit('joinRoom', userId);
        const chatRoomId = [userId, receiverId].sort().join('_');
        socket.emit('joinChatRoom', chatRoomId);
    }
});

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

// Toggle chat dropdown
ellipsisBtn.addEventListener('click', () => {
    chatDropdown.style.display = chatDropdown.style.display === 'block' ? 'none' : 'block';
});

window.addEventListener('click', function (e) {
    if (!ellipsisBtn.contains(e.target) && !chatDropdown.contains(e.target)) {
        chatDropdown.style.display = 'none';
    }
});

// Show toast notifications
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
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
            toast.classList.remove('fade-out');
        }, 500);
    }, 3000);
}

// Report a user
function reportUser() {
    const modal = document.getElementById('reportConfirmationModal');
    modal.style.display = 'flex';

    document.getElementById('reportReason').value = '';

    document.getElementById('confirmReportBtn').onclick = () => {
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
                    showToast('User reported successfully. Our team will review the report.');
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

    document.getElementById('cancelReportBtn').onclick = () => {
        modal.style.display = 'none';
    };
}

// Block a user
function blockUser() {
    document.getElementById('blockConfirmationText').textContent =
        `Are you sure you want to block ${recipientUsername}? You won't be able to message each other.`;
    const modal = document.getElementById('blockConfirmationModal');
    modal.style.display = 'flex';

    document.getElementById('confirmBlockBtn').onclick = () => {
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
                    showToast('User blocked successfully.');
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

    document.getElementById('cancelBlockBtn').onclick = () => {
        modal.style.display = 'none';
    };
}

// Add typing indicator trigger
typeSection.addEventListener('input', sendTypingSignal);
