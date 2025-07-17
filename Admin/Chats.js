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

// Global sets for bargain state management (as they were in your original code)
const acceptedOffers = new Set();
const endedBargains = new Set();
const bargainingSessions = new Map(); // productId -> senderId
const sentCounterOffers = new Set();

function saveBargainStates() {
    // Implement your save logic if necessary, otherwise remove
}

// Display a message in the chat
function displayMessage(message, isOptimistic = false) {
    // Check if a message with this _id is already displayed (important for preventing duplicates
    // when a server-confirmed message arrives after an optimistic one)
    if (message._id && displayedMessages.has(message._id)) {
        return;
    }

    // If this is an optimistic message, add its temporary ID to the map
    // Note: The new tempId handling means this map might be less critical for display,
    // but useful for tracking optimistic messages before confirmation.
    if (isOptimistic && message._id && message._id.startsWith('temp_')) {
        optimisticMessagesMap.set(message._id, message);
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
                displayText = message.text;
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
    msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    if (message.messageType === 'counter-offer' && offerDetails.productId) {
        msgDiv.setAttribute('data-product-id', offerDetails.productId);
        msgDiv.setAttribute('data-message-type', 'counter-offer');
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
            <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
        `;
    } else {
        // Regular message display
        msgDiv.innerHTML = `
            <div>${displayText}</div>
            ${displayImage ? `<img src="${displayImage}" class="product-photo-preview" alt="Product Image" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><p style="display:none;color:red;">Failed to load product image.</p>` : ''}
            <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
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
            acceptBtn.onclick = async () => {
                // Dummy functions, replace with your actual implementation
                const handleAcceptOffer = (details, sender) => {
                     console.log(`Accepting offer for ${details.productName} from ${sender}`);
                     showToast('Offer accepted!', 'success');
                };
                handleAcceptOffer(offerDetails, message.senderId);
            };
            msgDiv.appendChild(acceptBtn);

            const declineBtn = document.createElement('button');
            declineBtn.className = 'decline-offer-btn';
            declineBtn.textContent = 'Decline Offer';
            declineBtn.onclick = () => {
                // Dummy functions, replace with your actual implementation
                const openLastPriceModal = (productId, productName, image) => {
                    console.log(`Opening last price modal for ${productName}`);
                    showToast('Last price modal functionality not implemented.', 'warning');
                };
                openLastPriceModal(offerDetails.productId, offerDetails.productName, offerDetails.image);
            };
            msgDiv.appendChild(declineBtn);
        }

        if (message.messageType === 'counter-offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'accept-offer-btn';
            acceptBtn.textContent = 'Accept Last Price';
            acceptBtn.onclick = async () => {
                // Dummy functions, replace with your actual implementation
                const handleAcceptCounterOffer = (details, sender) => {
                    console.log(`Accepting counter offer for ${details.productName} from ${sender}`);
                    showToast('Counter offer accepted!', 'success');
                };
                handleAcceptCounterOffer(offerDetails, message.senderId);
            };
            msgDiv.appendChild(acceptBtn);

            const endBargainBtn = document.createElement('button');
            endBargainBtn.className = 'end-bargain-btn';
            endBargainBtn.textContent = 'End Bargain';
            endBargainBtn.onclick = async () => {
                // Dummy functions, replace with your actual implementation
                const handleEndBargain = (details, sender) => {
                    console.log(`Ending bargain for ${details.productName} with ${sender}`);
                    showToast('Bargain ended.', 'info');
                };
                handleEndBargain(offerDetails, message.senderId);
            };
            msgDiv.appendChild(endBargainBtn);
        }
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Add to displayedMessages after successful append
    if (message._id) {
        displayedMessages.add(message._id);
    }
}

// Helper functions for optimistic updates
function updateOptimisticMessageId(tempId, newMessageId) {
    // Find the optimistic message element in the DOM
    const optimisticMessageElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);

    if (optimisticMessageElement) {
        // Update its data-message-id attribute
        optimisticMessageElement.dataset.messageId = newMessageId;

        // Remove the temporary ID from the displayedMessages set
        displayedMessages.delete(tempId);
        // Add the new, real ID to the displayedMessages set
        displayedMessages.add(newMessageId);

        // Update the optimisticMessagesMap
        const optimisticMsg = optimisticMessagesMap.get(tempId);
        if (optimisticMsg) {
            optimisticMsg._id = newMessageId; // Update the message object itself
            optimisticMessagesMap.delete(tempId);
            optimisticMessagesMap.set(newMessageId, optimisticMsg);
        }

        // Update status for the sent message to show '✔' or '✔✔'
        const timestampElement = optimisticMessageElement.querySelector('.message-timestamp');
        if (timestampElement) {
            if (!timestampElement.textContent.includes('✔')) {
                timestampElement.textContent += ' ✔'; // Mark as sent
            }
        }
    } else {
        console.warn(`Optimistic message with temporary ID ${tempId} not found in DOM.`);
    }
}

function removeOptimisticMessage(tempId) {
    const optimisticMessageElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
    if (optimisticMessageElement) {
        optimisticMessageElement.remove();
        displayedMessages.delete(tempId);
        optimisticMessagesMap.delete(tempId);
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
    const tempMessageId = `temp_${Date.now()}`; // Generate a temporary ID

    const messageToSend = { // Renamed to avoid confusion with the object passed to displayMessage
        receiverId,
        text: isInitialMessage ? JSON.stringify({ text, image: productImage }) : text,
        messageType: 'text',
        createdAt: new Date().toISOString(), // Use ISO string for consistent date
        isRead: false,
        tempId: tempMessageId // Crucially, add the temporary ID here for server echo
    };

    // Display the optimistic message
    displayMessage({ ...messageToSend, senderId: userId, _id: tempMessageId, status: 'sending' }, true); // Pass tempId as _id for optimistic display

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
            body: JSON.stringify(messageToSend) // Send messageToSend which includes tempId
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);

        // The server response data should ideally include the _id and the tempId it received.
        // We now rely on the 'newMessage' event for updating the optimistic message.
        // If the server doesn't emit 'newMessage' back to the sender, you might need this:
        // if (data.data?._id && data.data?.tempId) { // assuming server sends back tempId
        //     updateOptimisticMessageId(data.data.tempId, data.data._id);
        // } else if (data.data?._id) {
        //     // Fallback if server doesn't echo tempId, try to match by content if still needed, but less reliable.
        //     // For now, rely solely on the 'newMessage' event with tempId.
        // } else {
        //     console.warn('Server did not return a message _id or tempId.');
        //     removeOptimisticMessage(tempMessageId); // Fallback: remove if no real ID confirmation
        // }

    } catch (error) {
        console.error('Error sending message:', error);
        showToast(`Failed to send message: ${error.message}`, 'error');
        removeOptimisticMessage(tempMessageId); // Remove the optimistic message on error
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

    // NEW LOGIC: If the incoming message has a tempId and was sent by the current user,
    // it's a confirmation for an optimistic message we already displayed.
    if (message.tempId && message.senderId === userId) {
        updateOptimisticMessageId(message.tempId, message._id);
        // Also, update the status for the sent message to show '✔' or '✔✔'
        const messageElement = chatMessages.querySelector(`[data-message-id="${message._id}"]`);
        if (messageElement) {
            const timestampElement = messageElement.querySelector('.message-timestamp');
            if (timestampElement) {
                if (message.status === 'seen' && !timestampElement.textContent.includes('✔✔')) {
                    // Replace single check with double check if already sent, or just add double check
                    timestampElement.textContent = timestampElement.textContent.replace(/ ✔$/, '') + ' ✔✔';
                } else if (!timestampElement.textContent.includes('✔')) {
                    timestampElement.textContent += ' ✔'; // Mark as sent
                }
            }
        }
        return; // IMPORTANT: Don't display again if it's our own confirmed message
    }

    // Display the incoming message (if not our own confirmed message)
    displayMessage(message);

    // Mark as seen if it's a message received by the current user from the other party
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

    // Update localStorage with the newly received message
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) {
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    }
});

// Handle message synced event for persistence (ensure it's not duplicating what newMessage does)
socket.on('messageSynced', (message) => {
    // This event might be redundant if 'newMessage' already covers persistence,
    // but keeping the logic in case it serves a specific purpose (e.g., historical sync)
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
            // Fallback to localStorage if server response is not an array
            messages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        }

        const validMessages = messages.filter((msg, index) => {
            if (!msg || typeof msg !== 'object' || !msg.messageType) {
                return false;
            }
            // Ensure message has text or is a known type that doesn't require text
            if (!msg.text && !['image', 'payment-completed'].includes(msg.messageType)) {
                if (!['sellerAccept', 'buyerAccept', 'end-bargain', 'offer', 'counter-offer'].includes(msg.messageType)) {
                    return false;
                }
            }
            // Validate JSON in text field if applicable
            if (typeof msg.text === 'string' && msg.text.startsWith('{') && ['offer', 'counter-offer', 'buyerAccept', 'sellerAccept', 'end-bargain', 'text'].includes(msg.messageType)) {
                try {
                    JSON.parse(msg.text);
                } catch (e) {
                    console.warn(`Message with ID ${msg._id} has malformed JSON in text field.`);
                    // Decide if you want to skip such messages or treat them as plain text
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
        // Clear displayedMessages set before displaying history to prevent issues
        displayedMessages.clear();
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
        socket.emit('joinRoom', userId); // For general user presence/notifications
        const chatRoomId = [userId, receiverId].sort().join('_');
        socket.emit('joinChatRoom', chatRoomId); // For specific chat room messages
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
      event.stopPropagation();
    });

    modal.appendChild(img);
    document.body.appendChild(modal);

    modal.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }
});
// Add typing indicator trigger
typeSection.addEventListener('input', sendTypingSignal);
