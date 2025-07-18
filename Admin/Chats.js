// API base URL configuration for local and production environments
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com';

// Initialize Socket.IO connection with WebSocket and polling transports
// IMPORTANT: Ensure the auth token is always sent on connection
const socket = io(API_BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: localStorage.getItem('authToken') } // CRITICAL FOR SOCKET AUTHENTICATION
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

// Track displayed messages and optimistic messages
// displayedMessages: Stores _id of messages already rendered to prevent duplicates
const displayedMessages = new Set();
// optimisticMessagesMap: Maps tempId to the actual message object for quick lookup
const optimisticMessagesMap = new Map();

// Flag for initial message handling
let isInitialMessageSent = localStorage.getItem(`initialMessageSent_${productId}_${receiverId}`) === 'true';

// Function to render product preview for initial message
function renderProductPreview() {
    if (productImage && productName && predefinedMessage && !isInitialMessageSent) {
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

// Join chat room and user room upon connection
// These are now handled in socket.on('connect') below
if (userId && receiverId) {
    // These will be emitted when the socket connects
}

let lastDisplayedDate = null;

// Helper: create a persistent system message div
function createSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    return div;
}

// Global sets for bargain state management (ensure these persist if needed across sessions)
// Consider using localStorage or a more robust state management for these if critical
const acceptedOffers = new Set();
const endedBargains = new Set();
const bargainingSessions = new Map(); // Potentially map productId to last offer message ID
const sentCounterOffers = new Set();

// Function to update local storage for bargain states
function saveBargainStates() {
    // For simplicity, not fully implementing persistence here.
    // In a real app, you might serialize these sets/maps to localStorage
    // or fetch them from server on load.
    // Example: localStorage.setItem('acceptedOffers', JSON.stringify(Array.from(acceptedOffers)));
}

/**
 * Displays a message in the chat interface.
 * Handles optimistic updates, status indicators, and special message types.
 * @param {object} message - The message object to display.
 * @param {boolean} isOptimistic - True if this is an optimistic display for a sent message.
 */
function displayMessage(message, isOptimistic = false) {
    const messageId = message._id || message.tempId; // Use tempId for optimistic, _id for confirmed

    // If message already displayed (by _id) and not an optimistic placeholder, skip
    if (message._id && !isOptimistic && displayedMessages.has(message._id)) {
        console.log(`Message ${message._id} already displayed. Skipping.`);
        return;
    }
    // If optimistic and we have a real _id, check if real message is already displayed
    if (isOptimistic && message._id && !messageId.startsWith('temp_') && displayedMessages.has(message._id)) {
        console.log(`Optimistic message ${message._id} trying to display, but real message is there. Skipping.`);
        return;
    }

    // Handle optimistic messages: if it's an optimistic message (has tempId)
    // and we already have a real message with the same _id, don't re-add.
    if (isOptimistic && messageId.startsWith('temp_')) {
        optimisticMessagesMap.set(messageId, message);
    } else if (optimisticMessagesMap.has(message.tempId)) {
        // If we receive a confirmed message that matches an optimistic one,
        // we'll update its ID and then process it, avoiding duplicates.
        // This scenario is handled by `updateOptimisticMessageId`
    }

    const messageDate = new Date(message.createdAt);
    const formattedDate = formatMessageDate(messageDate);

    let displayText = message.content || message.text || '';
    let displayImage = null;
    let offerDetails = message.offerDetails || {};

    // Parse message content for images or structured data
    if (message.messageType === 'image') {
        displayImage = message.attachment?.url;
        if (!displayText) {
            displayText = 'Image'; // Default text for image-only messages
        }
    } else {
        let parsedFromJson = {};
        if (typeof message.text === 'string' && message.text.startsWith('{')) {
            try {
                parsedFromJson = JSON.parse(message.text);
                displayText = parsedFromJson.text || displayText;
                displayImage = parsedFromJson.image || displayImage;
                offerDetails = { ...offerDetails, ...parsedFromJson }; // Merge any offer details from text
            } catch (e) {
                console.warn('Failed to parse message text as JSON:', message.text, e);
                displayText = message.text; // Fallback to raw text
            }
        }
    }

    // Ensure image URLs are absolute if relative paths are used
    if (displayImage && !displayImage.match(/^https?:\/\//)) {
        displayImage = displayImage.startsWith('/') ? `${API_BASE_URL}${displayImage}` : displayImage;
    }

    // Display date separator if date changes
    if (formattedDate !== lastDisplayedDate) {
        chatMessages.appendChild(createSystemMessage(formattedDate));
        lastDisplayedDate = formattedDate;
    }

    // Update bargain states based on offer messages
    if (offerDetails && offerDetails.productId) {
        const productKey = offerDetails.productId;
        if (['accepted', 'completed'].includes(offerDetails.status)) {
            acceptedOffers.add(productKey);
            bargainingSessions.delete(`${productKey}-${message.senderId}`); // End active session for this product
            endedBargains.add(productKey);
        } else if (offerDetails.status === 'rejected' || message.messageType === 'end-bargain') {
            endedBargains.add(productKey);
            bargainingSessions.delete(`${productKey}-${message.senderId}`);
        }
    }
    if (message.messageType === 'counter-offer' && message.senderId === userId && offerDetails?.productId) {
        sentCounterOffers.add(offerDetails.productId);
    }
    saveBargainStates(); // Save updated states (if implementation exists)

    // Handle system messages (offer accept/decline, bargain end, payment completion)
    const isSystemMessageType = [
        'bargainStart', 'end-bargain', 'buyerAccept', 'sellerAccept', 'sellerDecline',
        'buyerDeclineResponse', 'offer', 'counter-offer', 'payment-completed'
    ].includes(message.messageType) && message.metadata?.isSystemMessage;

    if (isSystemMessageType) {
        let systemText = displayText;
        let systemImage = displayImage;

        // Customize system message text based on type
        if (message.messageType === 'bargainStart') {
             // Example: "You started a bargain for Product X at $Y"
            systemText = message.senderId === userId ?
                `You started a bargain for ${offerDetails.productName || 'Product'} at ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')}.` :
                `${recipientUsername} started a bargain for ${offerDetails.productName || 'Product'} at ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')}.`;
        } else if (message.messageType === 'buyerAccept') {
            systemText = `Offer for ${offerDetails.productName || 'Product'} at ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} was accepted.`;
            // Add specific buttons/actions for the buyer if this is the message they receive
        } else if (message.messageType === 'sellerAccept') {
            systemText = `Accepted the offer of ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} for "${offerDetails.productName || 'Product'}".`;
            // Add specific buttons/actions for the seller if this is the message they receive
        } else if (message.messageType === 'sellerDecline' || message.messageType === 'buyerDeclineResponse') {
            systemText = `Offer for ${offerDetails.productName || 'Product'} was rejected.`;
        } else if (message.messageType === 'end-bargain') {
            systemText = `${message.senderId === userId ? 'You' : recipientUsername} ended the bargain for ${offerDetails.productName || 'Product'}.`;
        } else if (message.messageType === 'payment-completed') {
            systemText = `Payment completed for ${offerDetails.productName || 'Product'}.`;
            systemImage = message.attachment?.url || systemImage;
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

        // Add action buttons for system messages (e.g., "Proceed to Payment")
        if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
            const paymentBtn = document.createElement('button');
            paymentBtn.className = 'proceed-to-payment-btn';
            paymentBtn.textContent = 'Proceed to Payment';

            const verifyPaymentStatus = async (productId, userId) => {
                // You would typically make an API call here to check payment status
                // For now, return false to simulate not paid
                console.log(`Verifying payment for product ${productId} by user ${userId}`);
                // Example: const response = await fetch(`${API_BASE_URL}/payments/status/${productId}/${userId}`);
                // const data = await response.json();
                // return data.isPaid;
                return false;
            };

            const initiatePayment = (productId, price, productName, button) => {
                console.log(`Initiating payment for ${productName} (ID: ${productId}) at ₦${price}`);
                showToast(`Initiating payment for ${productName}...`, 'info');
                // Simulate payment initiation (replace with actual payment gateway redirection/modal)
                setTimeout(() => {
                    showToast('Payment initiated. Follow prompts.', 'success');
                    button.disabled = true;
                    button.textContent = 'Payment Initiated';
                    button.style.backgroundColor = 'gray';
                    button.style.cursor = 'not-allowed';
                    // In a real app, this would redirect or open a payment modal
                }, 1500);
            };

            const checkAndSetPaymentButton = async () => {
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
            checkAndSetPaymentButton(); // Call immediately to set initial state
            systemDiv.appendChild(paymentBtn);
        } else if (message.messageType === 'buyerAccept' && message.receiverId === userId) {
            // For the seller, indicating waiting for buyer's payment
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
        if (message._id) {
            displayedMessages.add(message._id);
        }
        return; // System messages are handled, so return
    }

    // --- Regular Message Display ---
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    // Set a unique data-message-id, using tempId for optimistic messages
    msgDiv.dataset.messageId = messageId;

    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    // Determine checkmark status
    let statusCheckmark = '';
    if (message.senderId === userId) {
        if (isOptimistic || message.status === 'sending') {
            statusCheckmark = ''; // No checkmark for sending
        } else if (message.status === 'seen') {
            statusCheckmark = '✔✔'; // Double check for seen
        } else if (message.status === 'delivered' || message.status === 'sent') {
            statusCheckmark = '✔'; // Single check for sent/delivered
        }
    }

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
            <div class="message-timestamp">${time} ${statusCheckmark}</div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div>${displayText}</div>
            ${displayImage ? `<img src="${displayImage}" class="product-photo-preview" alt="Product Image" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><p style="display:none;color:red;">Failed to load product image.</p>` : ''}
            <div class="message-timestamp">${time} ${statusCheckmark}</div>
        `;
    }

    // --- Offer/Counter-offer buttons ---
    // Ensure buttons only appear on relevant messages and if not already accepted/ended
    const isOfferAccepted = offerDetails.productId && acceptedOffers.has(offerDetails.productId);
    const isBargainEnded = offerDetails.productId && endedBargains.has(offerDetails.productId);

    if (message.messageType === 'offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept Offer';
        acceptBtn.onclick = async () => {
            // Emit to server to accept offer
            socket.emit('acceptOffer', {
                offerId: message._id,
                acceptorId: userId,
                productId: offerDetails.productId,
                proposedPrice: offerDetails.proposedPrice,
                productName: offerDetails.productName,
                productImage: offerDetails.image
            });
            showToast('Accepting offer...', 'info');
            // Disable buttons immediately to prevent double-clicks
            acceptBtn.disabled = true;
            declineBtn.disabled = true;
        };
        msgDiv.appendChild(acceptBtn);

        const declineBtn = document.createElement('button');
        declineBtn.className = 'decline-offer-btn';
        declineBtn.textContent = 'Decline Offer';
        declineBtn.onclick = () => {
            // Emit to server to decline offer
            socket.emit('declineOffer', {
                offerId: message._id,
                declinerId: userId,
                productId: offerDetails.productId,
                productName: offerDetails.productName,
                productImage: offerDetails.image
            });
            showToast('Declining offer...', 'info');
            acceptBtn.disabled = true;
            declineBtn.disabled = true;
        };
        msgDiv.appendChild(declineBtn);
    }

    if (message.messageType === 'counter-offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept Last Price';
        acceptBtn.onclick = async () => {
            // Emit to server to accept counter offer (same as acceptOffer event)
            socket.emit('acceptOffer', {
                offerId: message._id,
                acceptorId: userId,
                productId: offerDetails.productId,
                proposedPrice: offerDetails.proposedPrice,
                productName: offerDetails.productName,
                productImage: offerDetails.image
            });
            showToast('Accepting counter offer...', 'info');
            acceptBtn.disabled = true;
            endBargainBtn.disabled = true;
        };
        msgDiv.appendChild(acceptBtn);

        const endBargainBtn = document.createElement('button');
        endBargainBtn.className = 'end-bargain-btn';
        endBargainBtn.textContent = 'End Bargain';
        endBargainBtn.onclick = async () => {
            // Emit to server to end bargain
            socket.emit('endBargain', {
                offerId: message._id, // Pass the ID of the offer being ended
                enderId: userId,
                productId: offerDetails.productId,
                productName: offerDetails.productName
            });
            showToast('Ending bargain...', 'info');
            acceptBtn.disabled = true;
            endBargainBtn.disabled = true;
        };
        msgDiv.appendChild(endBargainBtn);
    }

    // Append the message element
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Add message ID to displayed set (use real ID if available, otherwise tempId)
    displayedMessages.add(messageId);
}

// Helper functions for optimistic updates
/**
 * Updates the temporary ID of an optimistic message to its confirmed database ID.
 * Also updates its status to 'delivered' and refreshes checkmarks.
 * @param {string} tempId - The temporary ID of the message.
 * @param {string} newMessageId - The actual database ID of the message.
 */
function updateOptimisticMessageId(tempId, newMessageId) {
    const optimisticMessageElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
    if (optimisticMessageElement) {
        optimisticMessageElement.dataset.messageId = newMessageId; // Update data attribute
        optimisticMessageElement.classList.remove('optimistic-sending'); // Remove any sending class

        // Update displayedMessages Set
        if (displayedMessages.has(tempId)) {
            displayedMessages.delete(tempId);
        }
        displayedMessages.add(newMessageId);

        // Update optimisticMessagesMap
        const optimisticMsg = optimisticMessagesMap.get(tempId);
        if (optimisticMsg) {
            optimisticMsg._id = newMessageId;
            optimisticMsg.status = 'delivered'; // Update status to delivered
            optimisticMessagesMap.delete(tempId);
            optimisticMessagesMap.set(newMessageId, optimisticMsg);

            // Update timestamp with single checkmark
            const timestampElement = optimisticMessageElement.querySelector('.message-timestamp');
            if (timestampElement) {
                const timePart = timestampElement.textContent.split(' ')[0]; // Keep only the time
                timestampElement.textContent = `${timePart} ✔`; // Add single check
            }
        }
        console.log(`Optimistic message ${tempId} confirmed as ${newMessageId}. Status updated.`);
    } else {
        console.warn(`Optimistic message with temporary ID ${tempId} not found in DOM for update.`);
    }
}

/**
 * Removes an optimistic message from the DOM and tracking maps (e.g., on send failure).
 * @param {string} tempId - The temporary ID of the message to remove.
 */
function removeOptimisticMessage(tempId) {
    const optimisticMessageElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
    if (optimisticMessageElement) {
        optimisticMessageElement.remove();
        displayedMessages.delete(tempId);
        optimisticMessagesMap.delete(tempId);
        console.log(`Optimistic message with tempId ${tempId} removed.`);
    }
}

// Send a new message from the chat input
sendBtn.onclick = async () => {
    const text = typeSection.value.trim();
    if (!text && !predefinedMessage) { // Allow sending initial message even if input empty
        showToast('Please enter a message or use the predefined message.', 'error');
        return;
    }

    const isInitialMessage = !isInitialMessageSent && predefinedMessage && productImage;
    // Generate a temporary ID for optimistic UI
    const tempMessageId = `temp_${Date.now()}`;

    // Construct the message object to send
    const messageToSend = {
        receiverId,
        text: isInitialMessage ? JSON.stringify({ text, image: productImage }) : text,
        messageType: 'text', // Default to text
        createdAt: new Date().toISOString(),
        isRead: false,
        tempId: tempMessageId, // Include tempId for optimistic UI
        senderId: userId, // Ensure senderId is explicitly set
        // Add other properties if relevant (e.g., offerDetails, attachment)
        // For predefined message, the server will handle offerDetails from `text` JSON
    };

    // Optimistically display the message immediately
    displayMessage({ ...messageToSend, _id: tempMessageId, status: 'sending' }, true);

    // Clear input field
    typeSection.value = '';

    // Handle initial message flag and UI cleanup
    if (isInitialMessage) {
        isInitialMessageSent = true;
        localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, 'true');
        const previewContainer = document.getElementById('product-preview');
        if (previewContainer) {
            previewContainer.remove();
        }
    }

    // --- Send message via Socket.IO instead of Fetch ---
    socket.emit('sendMessage', messageToSend);
    console.log('Emitted sendMessage:', messageToSend);
    // Error handling for sendMessage is now via socket.on('messageError')
};

// --- Socket.IO Event Listeners ---

// Handle incoming messages
// This event is fired for new messages sent to THIS client,
// or for sender's own messages being confirmed by the server.
socket.on('newMessage', message => {
    console.log('Received newMessage:', message);

    // Update optimistic message if this is the confirmation for a sent message
    if (message.tempId && message.senderId === userId) {
        updateOptimisticMessageId(message.tempId, message._id);
        console.log(`Confirmed optimistic message with tempId: ${message.tempId}, new _id: ${message._id}`);
    }

    // Now, display the message if it's new (not already displayed by _id)
    // Check if the message is already displayed (by its confirmed _id)
    if (!displayedMessages.has(message._id)) {
        displayMessage(message); // Display the message
        console.log(`Displaying new message with _id: ${message._id}`);
    } else {
        // If message is already displayed, it might be an optimistic one
        // or a status update for an existing message.
        // Re-displaying might cause issues, better to just update status.
        console.log(`Message ${message._id} already in DOM. Attempting to update status.`);
        const messageElement = chatMessages.querySelector(`[data-message-id="${message._id}"]`);
        if (messageElement) {
            const timestampElement = messageElement.querySelector('.message-timestamp');
            if (timestampElement) {
                // Update status checkmarks
                let statusText = timestampElement.textContent.split(' ').slice(0, -1).join(' '); // Get text without current checks
                if (message.status === 'seen') {
                    statusText += ' ✔✔';
                } else if (message.status === 'delivered') {
                    statusText += ' ✔';
                }
                timestampElement.textContent = statusText;
            }
        }
    }

    // Mark as seen if this message is received by the current user and not yet seen
    if (message.receiverId === userId && message.senderId === receiverId && message.status !== 'seen') {
        console.log('Emitting markAsSeen for message:', message._id);
        socket.emit('markAsSeen', {
            messageIds: [message._id],
            senderId: message.senderId, // The person who sent the message
            receiverId: userId // The person who received and is now seeing it
        });
    }

    // Update local storage (consider debouncing this for performance on high message volume)
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    const existingIndex = storedMessages.findIndex(msg => msg._id === message._id);
    if (existingIndex !== -1) {
        storedMessages[existingIndex] = message; // Update existing message with new status/details
    } else {
        // Only push if it's a truly new message to store
        if (!message._id.startsWith('temp_')) { // Don't save optimistic messages directly
             storedMessages.push(message);
        }
    }
    localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));

    // Show toast for new incoming messages from other users
    if (message.senderId !== userId) {
        showToast(`New message from ${recipientUsername}`, 'success');
    }
});

// Handle 'messagesSeen' event (for sender's UI to update checkmarks)
socket.on('messagesSeen', ({ messageIds, seenBy, seenAt }) => {
    console.log(`Received messagesSeen event for IDs: ${messageIds} seen by ${seenBy}`);
    // Check if the current user is the sender of these messages
    if (seenBy !== userId) { // If it was seen by the other person (receiverId)
        messageIds.forEach((messageId) => {
            const messageDiv = chatMessages.querySelector(`.message.sent[data-message-id="${messageId}"]`);
            if (messageDiv) {
                const timestamp = messageDiv.querySelector('.message-timestamp');
                if (timestamp && !timestamp.textContent.includes('✔✔')) {
                    const timePart = timestamp.textContent.split(' ')[0];
                    timestamp.textContent = `${timePart} ✔✔`; // Update to double checkmark
                    console.log(`Updated message ${messageId} to seen status.`);
                }
            }
        });
    }
});


// Handle new message notifications (for messages not in active chat view)
socket.on('newMessageNotification', (notification) => {
    // Only show toast if it's not a message from the currently active chat partner
    // or if the user is not currently in the chat screen
    if (notification.senderId !== receiverId || !document.hasFocus()) { // Simplified check
        showToast(`New message from ${notification.senderName}: ${notification.text}`, 'success');
    }
});


// Load chat history (still useful for initial load and offline sync)
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
            showToast('Failed to parse chat history.', 'error');
            messages = [];
        }

        if (!Array.isArray(messages)) {
            console.warn('Response is not an array:', messages);
            showToast('Invalid chat history format.', 'error');
            messages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        }

        // Filter and validate messages
        const validMessages = messages.filter(msg => {
            if (!msg || typeof msg !== 'object' || !msg.messageType) {
                console.warn(`Skipping invalid message object:`, msg);
                return false;
            }
            // Basic check for message content or type for non-text messages
            if (!msg.text && !['image', 'payment-completed', 'bargainStart', 'end-bargain', 'buyerAccept', 'sellerAccept', 'offer', 'counter-offer'].includes(msg.messageType)) {
                console.warn(`Skipping message (no text, unknown special type):`, msg);
                return false;
            }
            return true;
        });

        // Check if initial message was already sent based on history
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

        renderProductPreview(); // Render product preview if applicable
        lastDisplayedDate = null; // Reset date for fresh render
        displayedMessages.clear(); // Clear previously displayed messages
        validMessages.forEach(msg => displayMessage(msg)); // Display all valid messages
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(validMessages)); // Update local storage
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to bottom
    } catch (error) {
        console.error('Error loading chat history:', error);
        showToast(`Failed to load messages: ${error.message}`, 'error');
        // Fallback to local storage if API call fails
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        lastDisplayedDate = null;
        displayedMessages.clear();
        storedMessages.forEach(msg => displayMessage(msg));
        renderProductPreview();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Initial load of chat history on page load
loadChatHistory();

// Send typing signal when user types
function sendTypingSignal() {
    socket.emit('typing', { senderId: userId, receiverId });
}

// Display typing indicator
socket.on('typing', data => {
    // Only show typing indicator if the sender is the other person in this chat
    if (data.senderId === receiverId) {
        typingIndicator.textContent = `${recipientUsername} is typing...`;
        if (typingIndicator.timeout) clearTimeout(typingIndicator.timeout);
        typingIndicator.timeout = setTimeout(() => typingIndicator.textContent = '', 3000); // Clear after 3 seconds of no activity
    }
});

// Handle socket errors
socket.on('messageError', ({ tempId, error }) => {
    showToast(`Message error: ${error}`, 'error');
    if (tempId) {
        removeOptimisticMessage(tempId); // Remove the optimistic message if sending failed
    }
});

socket.on('offerError', ({ error }) => {
    showToast(`Offer error: ${error}`, 'error');
});

socket.on('markSeenError', ({ error }) => {
    showToast(`Error marking message as seen: ${error}`, 'error');
});

// --- Socket Connection Status Handlers ---
socket.on('connect', () => {
    console.log('Connected to server');
    if (userId && receiverId) {
        // Emit joinRoom for user-specific notifications across tabs/devices
        socket.emit('joinRoom', userId);
        // Emit joinChatRoom for real-time chat updates within this specific chat
        const chatRoomId = [userId, receiverId].sort().join('_');
        socket.emit('joinChatRoom', chatRoomId);
        console.log(`Joined rooms: user_${userId} and chat_${chatRoomId}`);
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showToast('Disconnected from chat. Reconnecting...', 'warning');
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    showToast(`Connection error: ${error.message}. Please check your internet.`, 'error');
});

// --- Utility Functions ---

// Format message date for display
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

// Close dropdown if clicked outside
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
    toast.className = 'toast-message'; // Reset classes
    if (type === 'error') {
        toast.classList.add('error');
    } else if (type === 'warning') {
        toast.classList.add('warning');
    } else if (type === 'info') {
        toast.classList.add('info');
    }
    toast.style.display = 'block';
    toast.style.opacity = '1';
    toast.timeoutId = setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.style.display = 'none';
            toast.classList.remove('fade-out');
        }, 500); // Fade out duration
    }, 3000); // Display duration
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

    document.getElementById('reportReason').value = ''; // Clear previous reason

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
                    showToast('User reported successfully.');
                    document.getElementById('chat-dropdown').style.display = 'none';
                } else {
                    showToast(data.message || 'Failed to report user.', 'error');
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
                    window.location.href = 'Chats.html'; // Redirect or refresh chat
                } else {
                    showToast(data.message || 'Failed to block user.', 'error');
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

// Event listener for enlarging images
document.getElementById('chat-messages').addEventListener('click', (e) => {
    if (e.target.classList.contains('receipt-image') || e.target.classList.contains('product-photo-preview')) {
        const image = e.target;
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
            event.stopPropagation(); // Prevent modal from closing when clicking the image
        });

        modal.appendChild(img);
        document.body.appendChild(modal);

        modal.addEventListener('click', () => {
            document.body.removeChild(modal); // Close modal when clicking outside the image
        });
    }
});

// Add typing indicator trigger
typeSection.addEventListener('input', sendTypingSignal);

// Debug all socket events for development
socket.onAny((event, ...args) => {
    console.log(`Socket event received: ${event}`, args);
});
