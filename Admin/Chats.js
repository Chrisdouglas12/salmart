// frontend/public/js/chat.js (or wherever your chat client code is)

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
// Store optimistic messages by their temporary ID for later update
const optimisticMessagesMap = new Map();

// We removed the localStorage check for initialMessageSent here
// as it's more cleanly handled directly within the sendBtn.onclick logic.

// Function to render product preview
function renderProductPreview() {
    // Only render if a predefined message and product image are present
    // and if we haven't already considered an initial message sent for this product/receiver
    const isInitialMessageSentForThisChat = localStorage.getItem(`initialMessageSent_${productId}_${receiverId}`) === 'true';

    if (productImage && productName && !isInitialMessageSentForThisChat) {
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

// Global sets for bargain state management (as they were in your original code)
const acceptedOffers = new Set();
const endedBargains = new Set();
const bargainingSessions = new Map(); // productId -> senderId
const sentCounterOffers = new Set();

function saveBargainStates() {
    // Implement your save logic if necessary, otherwise remove
    // For a real app, you might save these to localStorage or a server for persistence across sessions
}

// Function to display a message in the chat
function displayMessage(message, isOptimistic = false) {
    // Check if a message with this _id is already displayed (important for preventing duplicates
    // when a server-confirmed message arrives after an optimistic one)
    if (message._id && displayedMessages.has(message._id)) {
        return;
    }

    // Add to displayedMessages set immediately for any message that's being rendered
    // If it's an optimistic message, use its tempId as its initial _id for tracking.
    // If it's a server-confirmed message, it will have a real _id.
    if (message._id) {
        displayedMessages.add(message._id);
    }

    const messageDate = new Date(message.createdAt);
    const formattedDate = formatMessageDate(messageDate);

    let displayText = message.content || message.text || '';
    let displayImage = null;
    let offerDetails = message.offerDetails || {};

    // Handle different message types
    if (message.messageType === 'image') {
        // For receipt images, use the attachment URL
        displayImage = message.attachment?.url;
        if (!displayText) {
            displayText = 'Payment Receipt'; // Default text for receipt images
        }
    } else {
        // Existing JSON parsing logic for other message types
        let parsedFromJson = {};
        if (typeof message.text === 'string' && message.text.startsWith('{')) {
            try {
                parsedFromJson = JSON.parse(message.text);
                displayText = parsedFromJson.text || displayText;
                displayImage = parsedFromJson.image || displayImage;
                offerDetails = { ...offerDetails, ...parsedFromJson };
            } catch (e) {
                console.warn('Failed to parse message text as JSON:', message.text, e);
                displayText = message.text; // Use original text if JSON parsing fails
            }
        }
    }

    // Fix image URL if it's relative
    if (displayImage && !displayImage.match(/^https?:\/\//)) {
        displayImage = displayImage.startsWith('/') ? `${API_BASE_URL}${displayImage}` : displayImage;
    }

    if (formattedDate !== lastDisplayedDate) {
        chatMessages.appendChild(createSystemMessage(formattedDate));
        lastDisplayedDate = formattedDate;
    }

    // Update state based on message type (your existing logic)
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
        let systemText = displayText; // Start with parsed or raw text
        let systemImage = displayImage; // Start with parsed or raw image

        // Re-evaluate text based on messageType for clearer system messages
        if (message.messageType === 'accept-offer' || message.messageType === 'buyerAccept') {
             systemText = `Offer for ${offerDetails.productName || 'Product'} at ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} was accepted.`;
        } else if (message.messageType === 'reject-offer' || message.messageType === 'buyerDeclineResponse' || message.messageType === 'sellerDecline') {
            systemText = `Offer for ${offerDetails.productName || 'Product'} was rejected.`;
        } else if (message.messageType === 'end-bargain') {
            systemText = `${message.senderId === userId ? 'You' : recipientUsername} ended the bargain for ${offerDetails.productName || 'Product'}.`;
        } else if (message.messageType === 'payment-completed') {
            systemText = `Payment completed for ${offerDetails.productName || 'Product'}.`;
            systemImage = message.attachment?.url || systemImage; // Prioritize attachment URL for payment receipts
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
                // Dummy functions, replace with your actual implementation
                const verifyPaymentStatus = async (productId, userId) => {
                    // Your actual payment verification logic here
                    console.log(`Verifying payment for product ${productId} by user ${userId}`);
                    return false; // Return true if paid, false otherwise
                };

                const initiatePayment = (productId, price, productName, button) => {
                    // Your actual payment initiation logic here
                    console.log(`Initiating payment for ${productName} (ID: ${productId}) at ₦${price}`);
                    showToast(`Initiating payment for ${productName}...`, 'info');
                    // Simulate payment process
                    setTimeout(() => {
                        showToast('Payment initiated. Follow prompts.', 'success');
                        button.disabled = true;
                        button.textContent = 'Payment Initiated';
                        button.style.backgroundColor = 'gray';
                        button.style.cursor = 'not-allowed';
                    }, 1500);
                };

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

    // --- REGULAR CHAT MESSAGES (including image messages) ---
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    // Use the actual _id if available, otherwise the temporary one for optimistic updates
    msgDiv.dataset.messageId = message._id; // `message._id` will be the tempId for optimistic, or real ID otherwise
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    if (message.messageType === 'counter-offer' && offerDetails.productId) {
        msgDiv.setAttribute('data-product-id', offerDetails.productId);
        msgDiv.setAttribute('data-message-type', 'counter-offer');
    }

    // Determine checkmark status for outgoing messages
    let statusIndicator = '';
    if (message.senderId === userId) {
        if (isOptimistic || message.status === 'sending') { // 'sending' could be a status you set for optimistic
            statusIndicator = '✔'; // Single checkmark for optimistically sent messages
        } else if (message.status === 'seen') {
            statusIndicator = '✔✔'; // Double checkmark for seen
        } else if (message.status === 'sent' || message.status === 'delivered') { // 'sent' usually means one check
            statusIndicator = '✔';
        }
    }


    // Special styling for image messages (receipts)
    if (message.messageType === 'image') {
        msgDiv.classList.add('image-message');
        msgDiv.innerHTML = `
            <div class="image-message-text">${displayText}</div>
            ${displayImage ? `
                <div class="image-container" style="margin: 10px 0;">
                    <img src="${displayImage}" class="receipt-image" alt="Receipt"
                         style="max-width: 200px; border-radius: 8px; border: 1px solid #ddd;"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                    <p style="display:none;color:red;">Failed to load receipt image.</p>
                </div>
            ` : ''}
            <div class="message-timestamp">${time} <span class="status-indicator">${statusIndicator}</span></div>
        `;
    } else {
        // Regular message display
        msgDiv.innerHTML = `
            <div>${displayText}</div>
            ${displayImage ? `<img src="${displayImage}" class="product-photo-preview" alt="Product Image" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><p style="display:none;color:red;">Failed to load product image.</p>` : ''}
            <div class="message-timestamp">${time} <span class="status-indicator">${statusIndicator}</span></div>
        `;
    }


    const isOfferAccepted = offerDetails.productId && acceptedOffers.has(offerDetails.productId);
    const isBargainEnded = offerDetails.productId && endedBargains.has(offerDetails.productId);

    // Add offer buttons for non-image messages
    if (message.messageType !== 'image') {
        if (message.messageType === 'offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'accept-offer-btn';
            acceptBtn.textContent = 'Accept Offer';
            // Store offer details on the button for easy access in delegated event
            acceptBtn.dataset.offerId = message._id;
            acceptBtn.dataset.productId = offerDetails.productId;
            acceptBtn.dataset.proposedPrice = offerDetails.proposedPrice;
            acceptBtn.dataset.productName = offerDetails.productName;
            acceptBtn.dataset.productImage = offerDetails.image;

            msgDiv.appendChild(acceptBtn);

            const declineBtn = document.createElement('button');
            declineBtn.className = 'decline-offer-btn';
            declineBtn.textContent = 'Decline Offer';
            declineBtn.dataset.offerId = message._id;
            declineBtn.dataset.productId = offerDetails.productId;
            declineBtn.dataset.productName = offerDetails.productName;
            declineBtn.dataset.productImage = offerDetails.image;
            msgDiv.appendChild(declineBtn);
        }

        if (message.messageType === 'counter-offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'accept-offer-btn'; // Reusing class, but this is for counter-offer
            acceptBtn.textContent = 'Accept Last Price';
            acceptBtn.dataset.offerId = message._id;
            acceptBtn.dataset.productId = offerDetails.productId;
            acceptBtn.dataset.proposedPrice = offerDetails.proposedPrice;
            acceptBtn.dataset.productName = offerDetails.productName;
            acceptBtn.dataset.productImage = offerDetails.image;
            msgDiv.appendChild(acceptBtn);

            const endBargainBtn = document.createElement('button');
            endBargainBtn.className = 'end-bargain-btn';
            endBargainBtn.textContent = 'End Bargain';
            endBargainBtn.dataset.offerId = message._id;
            endBargainBtn.dataset.productId = offerDetails.productId;
            endBargainBtn.dataset.productName = offerDetails.productName;
            msgDiv.appendChild(endBargainBtn);
        }
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Helper functions for optimistic updates
function updateOptimisticMessageId(tempId, newMessageId, newStatus = 'sent') {
    const optimisticMessageElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);

    if (optimisticMessageElement) {
        optimisticMessageElement.dataset.messageId = newMessageId; // Update the ID
        displayedMessages.delete(tempId); // Remove tempId from set
        displayedMessages.add(newMessageId); // Add new ID to set

        // Update the status indicator
        const statusSpan = optimisticMessageElement.querySelector('.status-indicator');
        if (statusSpan) {
            if (newStatus === 'seen') {
                statusSpan.textContent = '✔✔'; // Double checkmark for seen
            } else {
                statusSpan.textContent = '✔'; // Single check for sent/delivered
            }
        }
    } else {
        console.warn(`Optimistic message with temporary ID ${tempId} not found in DOM for update.`);
    }
}

function removeOptimisticMessage(tempId) {
    const optimisticMessageElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
    if (optimisticMessageElement) {
        optimisticMessageElement.remove();
        displayedMessages.delete(tempId);
    }
}

// Send a new message from the chat input
sendBtn.onclick = async () => {
    const text = typeSection.value.trim();
    if (!text) {
        showToast('Please enter a message', 'error');
        return;
    }

    // Determine if this is the initial product message
    const isInitialMessageForThisChat = predefinedMessage && productImage &&
        localStorage.getItem(`initialMessageSent_${productId}_${receiverId}`) !== 'true';

    const tempMessageId = `temp_${Date.now()}`; // Generate a temporary ID

    const messagePayload = {
        senderId: userId,
        receiverId,
        // If it's the initial message, include product image/details in text as JSON
        text: isInitialMessageForThisChat ? JSON.stringify({ text, image: productImage }) : text,
        messageType: 'text',
        createdAt: new Date().toISOString(),
        isRead: false,
        tempId: tempMessageId // Include tempId for server to echo back
    };

    // 1. Optimistically display the message for the sender
    // Pass tempId as _id for the initial optimistic display
    displayMessage({ ...messagePayload, _id: tempMessageId, status: 'sending' }, true);

    typeSection.value = ''; // Clear input immediately

    // If it was the initial message, mark it as sent in localStorage and remove preview
    if (isInitialMessageForThisChat) {
        localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, 'true');
        const previewContainer = document.getElementById('product-preview');
        if (previewContainer) {
            previewContainer.remove();
        }
    }

    try {
        // 2. Send message ONLY via Socket.IO for real-time delivery and persistence
        socket.emit('sendMessage', messagePayload);
        console.log(`Socket.IO emitted sendMessage with tempId: ${tempMessageId}`);

    } catch (error) {
        console.error('Error sending message:', error);
        showToast(`Failed to send message: ${error.message}`, 'error');
        removeOptimisticMessage(tempMessageId); // Remove the optimistic message on error
    }
};

// Handle incoming messages
socket.on('newMessage', message => {
    // Determine if the message is relevant to the current chat window
    const isForCurrentChat =
        (message.senderId === userId && message.receiverId === receiverId) || // Message sent by current user to current receiver
        (message.senderId === receiverId && message.receiverId === userId); // Message sent by current receiver to current user

    // Handle system messages that are always displayed if they concern the current user
    const isSystemMessageForCurrentUser =
        message.receiverId === userId &&
        ['sellerAccept', 'buyerAccept', 'end-bargain', 'payment-completed', 'accept-offer', 'reject-offer'].includes(message.messageType);


    if (!isForCurrentChat && !isSystemMessageForCurrentUser) {
        console.log("Message not for this chat window or not a system message for current user. Ignoring.");
        return; // Ignore messages not meant for the currently open chat or specific system messages
    }

    // If it's a message you sent (identified by tempId AND senderId being current user)
    // This `newMessage` event is the server's confirmation of your optimistic message.
    if (message.tempId && message.senderId === userId) {
        updateOptimisticMessageId(message.tempId, message._id, message.status);
        console.log(`Updated optimistic message with ID: ${message._id}`);
        // No need to display it again, as it was already optimistically displayed.
        return;
    }

    // Display the incoming message (if it's not our own confirmed optimistic message)
    displayMessage(message);

    // Mark as seen if it's an incoming message in the current chat from the chat partner
    // Also, ensure it's not a system message being marked seen by a user (system messages don't have 'seen' status from users)
    if (message.receiverId === userId && message.senderId === receiverId && message.status !== 'seen' && !message.metadata?.isSystemMessage) {
        socket.emit('markAsSeen', {
            messageIds: [message._id],
            senderId: message.senderId, // The actual sender of this new message
            receiverId: userId
        });
        console.log(`Emitted markAsSeen for new incoming message ${message._id}.`);
    }

    // If the message is from someone else to you (even if not the current chat partner)
    // or a system notification, show a toast.
    if (message.senderId !== userId || isSystemMessageForCurrentUser) {
        let toastText = `${message.senderId === receiverId ? recipientUsername : 'New Message'}: ${message.text || message.messageType}`;
        if (message.text && message.text.startsWith('{')) {
             try {
                 const parsed = JSON.parse(message.text);
                 toastText = `${message.senderId === receiverId ? recipientUsername : 'New Message'}: ${parsed.text || 'Notification'}`;
             } catch (e) { /* ignore */ }
        }
        showToast(toastText, 'success');
    }

    // Update localStorage with the newly received message
    // Ensure we only store valid messages with real _id (i.e., not tempIds)
    if (message._id && !message.tempId) { // Only store messages with a real ID from the server
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        if (!storedMessages.some(msg => msg._id === message._id)) {
            storedMessages.push(message);
            localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
        }
    }
});

// REMOVED `socket.on('messageSynced', ...)`: This event is now redundant
// because `newMessage` handles the full real-time display and confirmation.

// Handle new message notifications (for messages outside the current chat window)
socket.on('newMessageNotification', (notification) => {
    // Only show toast if the notification is for a different chat or a general notification
    // Adjusted condition: if the sender is NOT the current receiver AND the sender is NOT the current user
    if (notification.senderId !== receiverId && notification.senderId !== userId) {
        showToast(`New message from ${notification.senderName}: ${notification.text}`, 'success');
    } else if (notification.senderId === receiverId) {
        // If it IS from the current receiver, but we are still not in that chat (e.g. chat window open, but userId not matching params yet?)
        // This case is typically handled by `newMessage` directly for the current chat,
        // but this could catch edge cases or notifications for current chat when not in focus.
         // For now, let's let the `newMessage` handler take precedence for current chat.
         // If `newMessage` handles it, this notification might be redundant.
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
            console.error('Invalid JSON response from /messages:', rawText);
            showToast('Failed to parse chat history. Some messages may be missing.', 'error');
            messages = [];
        }

        if (!Array.isArray(messages)) {
            console.warn('Response from /messages is not an array:', messages);
            showToast('Invalid chat history format received from server.', 'error');
            // Fallback to localStorage if server response is not an array
            messages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        }

        const validMessages = messages.filter((msg, index) => {
            if (!msg || typeof msg !== 'object' || !msg.messageType) {
                console.warn(`Skipping invalid message at index ${index}:`, msg);
                return false;
            }
            // Ensure message has text or is a known type that doesn't require text
            if (!msg.text && !['image', 'payment-completed'].includes(msg.messageType)) {
                if (!['sellerAccept', 'buyerAccept', 'end-bargain', 'offer', 'counter-offer', 'accept-offer', 'reject-offer'].includes(msg.messageType)) {
                    console.warn(`Skipping message ${msg._id} due to missing text and unknown type: ${msg.messageType}`);
                    return false;
                }
            }
            // Validate JSON in text field if applicable
            if (typeof msg.text === 'string' && msg.text.startsWith('{')) {
                try {
                    JSON.parse(msg.text);
                } catch (e) {
                    console.warn(`Message with ID ${msg._id} has malformed JSON in text field. Treating as plain text.`);
                    // It's often safer to keep the message and display its raw text rather than skipping it.
                }
            }
            return true;
        });

        // Check if an initial message (product message) was already sent
        let isInitialMessageSent = localStorage.getItem(`initialMessageSent_${productId}_${receiverId}`) === 'true';
        if (!isInitialMessageSent && predefinedMessage && productImage) {
            const initialMessageExistsInHistory = validMessages.some(msg => {
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
            if (initialMessageExistsInHistory) {
                isInitialMessageSent = true;
                localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, 'true');
            }
        }

        renderProductPreview(); // Call renderProductPreview AFTER checking isInitialMessageSent
                               // so it correctly decides whether to render or not.

        lastDisplayedDate = null;
        // CRITICAL FIX: Clear displayedMessages set before displaying history
        // This prevents duplicate messages if some were optimistically added
        // and then fetched again, or if there were old entries in the set.
        displayedMessages.clear();
        chatMessages.innerHTML = ''; // Clear existing messages in the DOM

        validMessages.forEach(displayMessage);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(validMessages));

        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {
        console.error('Error loading chat history:', error);
        showToast(`Failed to load messages: ${error.message}`, 'error');
        // Fallback to showing messages from localStorage if API fails
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        // Clear displayedMessages set before displaying history to prevent issues
        displayedMessages.clear();
        chatMessages.innerHTML = ''; // Clear existing messages in the DOM
        storedMessages.forEach(displayMessage);
        renderProductPreview(); // Render preview even on error if not sent
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Ensure loadChatHistory is called when the page loads
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
    const messages = document.querySelectorAll('.message.sent'); // Only care about sent messages
    messages.forEach((messageDiv) => {
        if (messageDiv && messageIds.includes(messageDiv.dataset.messageId)) {
            const timestamp = messageDiv.querySelector('.message-timestamp .status-indicator');
            if (timestamp && timestamp.textContent !== '✔✔') { // Only update if not already seen
                timestamp.textContent = '✔✔';
            }
        }
    });
});

socket.on('connect', () => {
    console.log('Connected to server');
    if (userId) {
        socket.emit('joinRoom', userId); // For general user presence/notifications
        // If you need specific chat room joining for other features, keep this:
        const chatRoomId = [userId, receiverId].sort().join('_'); // Consistent chat room ID
        socket.emit('joinChatRoom', chatRoomId); // Ensure this is also joined if needed for room-specific broadcasts
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    // Handle disconnection (e.g., show a "reconnecting" message)
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    showToast(`Connection error: ${error.message}`, 'error');
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
    } else if (type === 'info') { // Add info type
        toast.classList.add('info');
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
    if (!modal) {
        console.error('Report confirmation modal not found.');
        showToast('Report functionality not fully set up.', 'error');
        return;
    }
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
    const modal = document.getElementById('blockConfirmationModal');
    if (!modal) {
        console.error('Block confirmation modal not found.');
        showToast('Block functionality not fully set up.', 'error');
        return;
    }

    document.getElementById('blockConfirmationText').textContent =
        `Are you sure you want to block ${recipientUsername}? You won't be able to message each other.`;
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

// Delegated event listener for dynamic buttons within chat-messages
document.getElementById('chat-messages').addEventListener('click', async (event) => {
    // Zoom image on click
    if (event.target.classList.contains('receipt-image') || event.target.classList.contains('product-photo-preview')) {
        const image = event.target;
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '10000';

        const img = document.createElement('img');
        img.src = image.src;
        img.style.maxWidth = '90%';
        img.style.maxHeight = '90%';
        img.style.borderRadius = '10px';

        img.addEventListener('click', (event) => {
          event.stopPropagation();
        });

        modal.appendChild(img);
        document.body.appendChild(modal);

        modal.addEventListener('click', () => {
          document.body.removeChild(modal);
        });
    }

    // Handle "Accept Offer" button clicks
    if (event.target.classList.contains('accept-offer-btn')) {
        const button = event.target;
        const offerId = button.dataset.offerId;
        const productId = button.dataset.productId;
        const proposedPrice = parseFloat(button.dataset.proposedPrice);
        const productName = button.dataset.productName;
        const productImage = button.dataset.productImage;

        if (confirm('Are you sure you want to accept this offer?')) {
            try {
                // Emit to server to handle offer acceptance via Socket.IO
                socket.emit('acceptOffer', {
                    offerId,
                    acceptorId: userId,
                    productId,
                    proposedPrice,
                    productName,
                    productImage
                });
                showToast('Accepting offer...', 'info');

                // Optimistic UI update for the button
                button.disabled = true;
                button.textContent = 'Accepted';
                button.style.backgroundColor = '#28a745'; // Green
                button.style.cursor = 'not-allowed';
                const declineButton = button.nextElementSibling;
                if (declineButton && declineButton.classList.contains('decline-offer-btn')) {
                    declineButton.remove(); // Remove decline button
                }
                const endBargainButton = button.nextElementSibling; // For counter-offer's accept
                if (endBargainButton && endBargainButton.classList.contains('end-bargain-btn')) {
                    endBargainButton.remove();
                }

            } catch (error) {
                console.error('Error accepting offer:', error);
                showToast('Failed to accept offer.', 'error');
                button.disabled = false;
                button.textContent = 'Accept Offer';
                button.style.backgroundColor = ''; // Revert style
                button.style.cursor = 'pointer';
            }
        }
    }

    // Handle "Decline Offer" button clicks
    if (event.target.classList.contains('decline-offer-btn')) {
        const button = event.target;
        const offerId = button.dataset.offerId;
        const productId = button.dataset.productId;
        const productName = button.dataset.productName;
        const productImage = button.dataset.productImage;

        if (confirm('Are you sure you want to decline this offer?')) {
            try {
                // Emit to server to handle offer decline via Socket.IO
                socket.emit('declineOffer', {
                    offerId,
                    declinerId: userId,
                    productId,
                    productName,
                    productImage
                });
                showToast('Declining offer...', 'info');

                // Optimistic UI update for the buttons
                button.disabled = true;
                button.textContent = 'Declined';
                button.style.backgroundColor = '#dc3545'; // Red
                button.style.cursor = 'not-allowed';
                const acceptButton = button.previousElementSibling;
                if (acceptButton && acceptButton.classList.contains('accept-offer-btn')) {
                    acceptButton.remove(); // Remove accept button
                }

            } catch (error) {
                console.error('Error declining offer:', error);
                showToast('Failed to decline offer.', 'error');
                button.disabled = false;
                button.textContent = 'Decline Offer';
                button.style.backgroundColor = ''; // Revert style
                button.style.cursor = 'pointer';
            }
        }
    }

    // Handle "End Bargain" button clicks (for counter-offers)
    if (event.target.classList.contains('end-bargain-btn')) {
        const button = event.target;
        const offerId = button.dataset.offerId;
        const productId = button.dataset.productId;
        const productName = button.dataset.productName;

        if (confirm('Are you sure you want to end this bargain?')) {
            try {
                socket.emit('endBargain', {
                    offerId,
                    enderId: userId,
                    productId,
                    productName
                });
                showToast('Ending bargain...', 'info');

                button.disabled = true;
                button.textContent = 'Bargain Ended';
                button.style.backgroundColor = '#6c757d'; // Gray
                button.style.cursor = 'not-allowed';
                const acceptButton = button.previousElementSibling;
                 if (acceptButton && acceptButton.classList.contains('accept-offer-btn')) {
                    acceptButton.remove(); // Remove accept button for counter-offer
                }
            } catch (error) {
                console.error('Error ending bargain:', error);
                showToast('Failed to end bargain.', 'error');
                button.disabled = false;
                button.textContent = 'End Bargain';
            }
        }
    }
});

// Add typing indicator trigger
typeSection.addEventListener('input', sendTypingSignal);

