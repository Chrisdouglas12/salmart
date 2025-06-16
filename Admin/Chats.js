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
const lastPriceModal = document.getElementById('lastPriceModal');
const lastPriceInput = document.getElementById('lastPriceInput');
const submitLastPriceBtn = document.getElementById('submitLastPriceBtn');
const ellipsisBtn = document.getElementById('ellipsis-btn');
const chatDropdown = document.getElementById('chat-dropdown');
const bargainBtn = document.getElementById('bargain-btn');


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

console.log('Product Image URL:', productImage);
console.log('Predefined Message:', JSON.stringify(predefinedMessage));

// Validate required URL parameters
if (!userId || !receiverId) {
    showToast('Missing user or recipient ID. Please try again.', 'error');
    window.location.href = 'index.html';
}


// Set recipient info in the UI
document.getElementById('chats-userName').textContent = recipientUsername;
document.getElementById('chatspic').src = recipientProfilePictureUrl;

// Pre-fill chat input with predefined message if provided
if (predefinedMessage) {
    typeSection.value = predefinedMessage;
} else {
    typeSection.value = '';
}

// Track ended bargains, counter-offers, displayed messages, and initial message status
const endedBargains = new Set(JSON.parse(localStorage.getItem(`endedBargains_${userId}_${receiverId}`) || '[]'));
const bargainingSessions = new Set(JSON.parse(localStorage.getItem(`bargainingSessions_${userId}_${receiverId}`) || '[]'));
const acceptedOffers = new Set(JSON.parse(localStorage.getItem(`acceptedOffers_${userId}_${receiverId}`) || '[]'));
const sentCounterOffers = new Set(JSON.parse(localStorage.getItem(`sentCounterOffers_${userId}_${receiverId}`) || '[]'));
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
                ? `<img src="${productImage}" class="product-photo-preview" alt="Product Preview" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
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

// Function to save state to localStorage
function saveBargainStates() {
    localStorage.setItem(`endedBargains_${userId}_${receiverId}`, JSON.stringify(Array.from(endedBargains)));
    localStorage.setItem(`bargainingSessions_${userId}_${receiverId}`, JSON.stringify(Array.from(bargainingSessions)));
    localStorage.setItem(`acceptedOffers_${userId}_${receiverId}`, JSON.stringify(Array.from(acceptedOffers)));
    localStorage.setItem(`sentCounterOffers_${userId}_${receiverId}`, JSON.stringify(Array.from(sentCounterOffers)));
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

    // Default message content, will be overridden if JSON parsing is successful
    let displayText = message.content || message.text || '';
    let displayImage = null;
    let offerDetails = message.offerDetails || {}; // Use offerDetails if present

    let parsedFromJson = {};
    if (typeof message.text === 'string' && message.text.startsWith('{')) {
        try {
            parsedFromJson = JSON.parse(message.text);
            // Prioritize parsedFromJson for text and image if it's there
            displayText = parsedFromJson.text || displayText;
            displayImage = parsedFromJson.image || displayImage;
            offerDetails = { ...offerDetails, ...parsedFromJson }; // Merge parsed details
        } catch (e) {
            console.warn('Failed to parse message text as JSON:', message.text, e);
            // If JSON parsing fails, just use the raw text
            displayText = message.text;
        }
    }

    // Ensure image URL is absolute if it's relative
    if (displayImage && !displayImage.match(/^https?:\/\//)) {
        displayImage = displayImage.startsWith('/') ? `${API_BASE_URL}${displayImage}` : displayImage;
    }

    if (formattedDate !== lastDisplayedDate) {
        chatMessages.appendChild(createSystemMessage(formattedDate));
        lastDisplayedDate = formattedDate;
    }

    // Update state based on message type (existing logic, mostly fine)
    if (offerDetails && offerDetails.productId) {
        const productKey = offerDetails.productId;
        if (['accepted', 'completed'].includes(offerDetails.status)) {
            acceptedOffers.add(productKey);
            bargainingSessions.delete(`${productKey}-${message.senderId}`);
            endedBargains.add(productKey); // An accepted or completed offer also ends the bargain
        } else if (offerDetails.status === 'rejected' || message.messageType === 'end-bargain') {
            endedBargains.add(productKey);
            bargainingSessions.delete(`${productKey}-${message.senderId}`);
        }
    }
    if (message.messageType === 'counter-offer' && message.senderId === userId && offerDetails?.productId) {
        sentCounterOffers.add(offerDetails.productId);
    }
    saveBargainStates(); // Save states after processing each message

    // --- SYSTEM MESSAGES (like offer accepted, rejected, ended) ---
    // These should always be displayed as system messages, not regular chat bubbles.
    // Ensure they handle the image display if present in offerDetails.
    // Removed 'sellerNotification' from this list to prevent it from being displayed to the seller.
    if (['accept-offer', 'reject-offer', 'end-bargain', 'payment-completed', 'buyerAccept', 'sellerAccept', 'sellerNotification'].includes(message.messageType)) {
        let systemText = displayText; // Start with parsed or raw text
        let systemImage = displayImage; // Start with parsed or raw image

        // Refine text based on messageType and offerDetails
        if (message.messageType === 'accept-offer') {
             systemText = `Offer for ${offerDetails.productName || 'Product'} at ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} was accepted.`;
        } else if (message.messageType === 'reject-offer') {
            systemText = `Offer for ${offerDetails.productName || 'Product'} was rejected.`;
        } else if (message.messageType === 'end-bargain') {
            systemText = `${message.senderId === userId ? 'You' : recipientUsername} ended the bargain for ${offerDetails.productName || 'Product'}.`;
        } else if (message.messageType === 'payment-completed') {
            systemText = `Payment completed for ${offerDetails.productName || 'Product'}.`;
            // For payment-completed, attachment URL is the receipt image
            systemImage = message.attachment?.url || systemImage;
        } else if (message.messageType === 'buyerAccept' && message.receiverId === userId) {
            systemText = `Your offer of ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} for "${offerDetails.productName || 'Product'}" has been accepted.`;
            systemImage = offerDetails.image || systemImage; // Use image from offerDetails
        } else if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
            systemText = `Accepted the offer of ₦${(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} for "${offerDetails.productName || 'Product'}".`;
            systemImage = offerDetails.image || systemImage; // Use image from offerDetails
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

        // Add action buttons only for relevant system messages to the current user
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
        // Removed sellerNotification button logic here

        chatMessages.appendChild(systemDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return; // Important: Return after displaying system message
    }


    // --- REGULAR CHAT MESSAGES (text, offer, counter-offer) ---
    // This section is for messages that appear in chat bubbles.
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

    // Case 1: Buyer receives an initial offer (first offer from seller, or buyer's original offer accepted by seller)
    // Only display accept/decline for buyer if it's an offer they haven't responded to, and the bargain isn't over.
    // This now only handles offers that are *not* system accepted messages
    if (message.messageType === 'offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept Offer';
        acceptBtn.onclick = async () => {
            handleAcceptOffer(offerDetails, message.senderId); // Pass offerDetails
        };
        msgDiv.appendChild(acceptBtn);

        const declineBtn = document.createElement('button');
        declineBtn.className = 'decline-offer-btn';
        declineBtn.textContent = 'Decline Offer';
        declineBtn.onclick = () => {
            openLastPriceModal(offerDetails.productId, offerDetails.productName, offerDetails.image); // Pass offerDetails
        };
        msgDiv.appendChild(declineBtn);
    }

    // Case 2: Buyer receives a counter-offer from seller
    if (message.messageType === 'counter-offer' && offerDetails.proposedPrice && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept Last Price';
        acceptBtn.onclick = async () => {
            handleAcceptCounterOffer(offerDetails, message.senderId); // Pass offerDetails
        };
        msgDiv.appendChild(acceptBtn);

        const endBargainBtn = document.createElement('button');
        endBargainBtn.className = 'end-bargain-btn';
        endBargainBtn.textContent = 'End Bargain';
        endBargainBtn.onclick = async () => {
            handleEndBargain(offerDetails, message.senderId); // Pass offerDetails
        };
        msgDiv.appendChild(endBargainBtn);
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to handle accepting an initial offer from buyer (seller side)
async function handleAcceptOffer(productDetails, originalOfferSenderId) {
    // productDetails now directly contains productId, productName, offer, image
    document.getElementById('confirmationMessage').textContent =
        `Are you sure you want to accept the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName || 'Product'}"?`;
    const acceptModal = document.getElementById('acceptConfirmationModal');
    acceptModal.style.display = 'block';

    document.getElementById('confirmAcceptBtn').onclick = async () => {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) throw new Error('No auth token found');

            // 1. Update product price (if necessary, though for a direct accept, it's already the offered price)
            const response = await fetch(`${API_BASE_URL}/posts/${productDetails.productId}/update-price`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ newPrice: productDetails.offer })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update price');
            }
            // const updatedPost = await response.json(); // Not strictly needed for UI

            // 2. Mark bargain as accepted/ended
            acceptedOffers.add(productDetails.productId);
            endedBargains.add(productDetails.productId);
            bargainingSessions.delete(`${productDetails.productId}-${originalOfferSenderId}`);
            saveBargainStates();

            // 3. Remove existing action buttons for this product
            const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${productDetails.productId}"]`);
            offerMessages.forEach(msg => {
                const buttons = msg.querySelectorAll('.accept-offer-btn, .decline-offer-btn, .end-bargain-btn');
                buttons.forEach(btn => btn.remove());
            });


            // 5. Prepare buyerAccept system message to send to the buyer
            const buyerAcceptMessage = {
                senderId: userId, // The seller is sending this
                receiverId: originalOfferSenderId, // Buyer
                messageType: 'buyerAccept',
                text: JSON.stringify({
                    text: `Your offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}" has been accepted.`,
                    productName: productDetails.productName,
                    productId: productDetails.productId,
                    offer: productDetails.offer,
                    image: productDetails.image
                }),
                offerDetails: {
                    productId: productDetails.productId,
                    productName: productDetails.productName,
                    proposedPrice: productDetails.offer,
                    status: 'accepted',
                    image: productDetails.image
                },
                createdAt: new Date(),
                isRead: false
            };


            // Send buyerAccept message via HTTP (this will then be emitted back via socket and displayed for buyer)
            const buyerAcceptResponse = await fetch(`${API_BASE_URL}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(buyerAcceptMessage)
            });
            const buyerAcceptData = await buyerAcceptResponse.json();
            if (!buyerAcceptResponse.ok) throw new Error(buyerAcceptData.error || `HTTP error ${buyerAcceptResponse.status}`);

            acceptModal.style.display = 'none';
            showToast('Offer accepted successfully!', 'success');

        } catch (error) {
            console.error('Failed to accept offer:', error);
            showToast(`Failed to accept offer: ${error.message}`, 'error');
            acceptModal.style.display = 'none';
        }
    };
    document.getElementById('cancelAcceptBtn').onclick = () => {
        acceptModal.style.display = 'none';
    };
}


// Function to handle accepting a counter-offer (buyer side)
async function handleAcceptCounterOffer(productDetails, counterOfferSenderId) {
    // productDetails now directly contains productId, productName, offer, image

    document.getElementById('confirmationMessage').textContent =
        `Are you sure you want to accept the last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName || 'Product'}"?`;
    const acceptModal = document.getElementById('acceptConfirmationModal');
    acceptModal.style.display = 'block';

    document.getElementById('confirmAcceptBtn').onclick = async () => {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) throw new Error('No auth token found');

            // 1. Update product price
            const response = await fetch(`${API_BASE_URL}/posts/${productDetails.productId}/update-price`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ newPrice: productDetails.offer })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update price');
            }
            // const updatedPost = await response.json(); // Not strictly needed for UI

            // 2. Mark bargain as accepted/ended
            acceptedOffers.add(productDetails.productId);
            endedBargains.add(productDetails.productId);
            bargainingSessions.delete(`${productDetails.productId}-${counterOfferSenderId}`);
            saveBargainStates();


            // 3. Remove existing action buttons for this product
            const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${productDetails.productId}"]`);
            offerMessages.forEach(msg => {
                const buttons = msg.querySelectorAll('.accept-offer-btn, .end-bargain-btn');
                buttons.forEach(btn => btn.remove());
            });

            // 4. Send buyerAccept system message to current user (buyer)
            const buyerAcceptMessage = {
                senderId: userId, // The buyer is sending this to themselves conceptually
                receiverId: userId, // Target is the buyer's own chat feed
                messageType: 'buyerAccept',
                text: JSON.stringify({ // Stringify for consistent parsing on receipt
                    text: `You have accepted the last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}".`,
                    productName: productDetails.productName,
                    productId: productDetails.productId,
                    offer: productDetails.offer,
                    image: productDetails.image
                }),
                offerDetails: { // Use offerDetails for structured data
                    productId: productDetails.productId,
                    productName: productDetails.productName,
                    proposedPrice: productDetails.offer,
                    status: 'accepted',
                    image: productDetails.image
                },
                createdAt: new Date(),
                isRead: false
            };

            // NO LONGER SENDING SELLER NOTIFICATION MESSAGE FROM HERE
            // const sellerNotificationMessage = {
            //     senderId: userId, // The buyer is sending this
            //     receiverId: counterOfferSenderId, // Seller
            //     messageType: 'sellerNotification',
            //     text: JSON.stringify({
            //         text: `Your last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}" has been accepted by ${recipientUsername}.`,
            //         productName: productDetails.productName,
            //         productId: productDetails.productId,
            //         offer: productDetails.offer,
            //         image: productDetails.image
            //     }),
            //     offerDetails: {
            //         productId: productDetails.productId,
            //         productName: productDetails.productName,
            //         proposedPrice: productDetails.offer,
            //         status: 'accepted',
            //         image: productDetails.image
            //     },
            //     createdAt: new Date(),
            //     isRead: false
            // };

            // Send buyerAccept message via HTTP so it's persisted for the buyer
            const buyerAcceptResponse = await fetch(`${API_BASE_URL}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(buyerAcceptMessage)
            });
            const buyerAcceptData = await buyerAcceptResponse.json();
            if (!buyerAcceptResponse.ok) throw new Error(buyerAcceptData.error || `HTTP error ${buyerAcceptResponse.status}`);
            // Display buyerAccept message directly for the current user (buyer) after it's confirmed sent
            displayMessage(buyerAcceptMessage, false);

            // NO LONGER SENDING SELLER NOTIFICATION MESSAGE FROM HERE
            // const sellerNotificationResponse = await fetch(`${API_BASE_URL}/send`, {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            //     body: JSON.stringify(sellerNotificationMessage)
            // });
            // const sellerNotificationData = await sellerNotificationResponse.json();
            // if (!sellerNotificationResponse.ok) throw new Error(sellerNotificationData.error || `HTTP error ${sellerNotificationResponse.status}`);

            acceptModal.style.display = 'none';
            showToast('Last price accepted successfully!', 'success');

        } catch (error) {
            console.error('Failed to accept counter-offer:', error);
            showToast(`Failed to accept last price: ${error.message}`, 'error');
            // No optimistic message to remove here, as it's handled on receipt
        }
    };
    document.getElementById('cancelAcceptBtn').onclick = () => {
        acceptModal.style.display = 'none';
    };
}


// Function to handle ending a bargain
async function handleEndBargain(productDetails, bargainInitiatorId) {
    // productDetails now directly contains productId, productName

    try {
        const token = localStorage.getItem('authToken');
        if (!token) throw new Error('No auth token found');

        endedBargains.add(productDetails.productId);
        bargainingSessions.delete(`${productDetails.productId}-${bargainInitiatorId}`);
        saveBargainStates();


        // Remove existing action buttons for this product
        const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${productDetails.productId}"]`);
        offerMessages.forEach(msg => {
            const buttons = msg.querySelectorAll('.accept-offer-btn, .decline-offer-btn, .end-bargain-btn');
            buttons.forEach(btn => btn.remove());
        });

        const endBargainMessage = {
            senderId: userId, // The one ending the bargain
            receiverId: bargainInitiatorId, // The other party in the chat
            messageType: 'end-bargain',
            text: JSON.stringify({ // Stringify for consistent parsing on receipt
                productId: productDetails.productId,
                productName: productDetails.productName
            }),
            offerDetails: { // Use offerDetails for structured data
                productId: productDetails.productId,
                productName: productDetails.productName,
                status: 'rejected' // Or 'ended' as a more general status
            },
            createdAt: new Date(),
            isRead: false
        };

        // Optimistic display for current user
        const optimisticEnd = { ...endBargainMessage, senderId: userId, status: 'sent' };
        displayMessage(optimisticEnd, true); // displayMessage will format it as a system message

        // Send via HTTP
        const endResponse = await fetch(`${API_BASE_URL}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(endBargainMessage)
        });
        const endData = await endResponse.json();
        if (!endResponse.ok) throw new Error(endData.error || `HTTP error ${endResponse.status}`);
        updateOptimisticMessageId(endData.data?._id);

        showToast('Bargain ended successfully!', 'success');
    } catch (error) {
        console.error('Failed to end bargain:', error);
        showToast(`Failed to end bargain: ${error.message}`, 'error');
        removeOptimisticMessage(); // Remove optimistic message on error
    }
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

// Helper to verify payment status
async function verifyPaymentStatus(productId, buyerId) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            showToast('Please log in to verify payment', 'error');
            return false;
        }
        const response = await fetch(`${API_BASE_URL}/payment-success?productId=${productId}&buyerId=${buyerId}&format=json`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Server error' }));
            console.error(`Payment verification failed: ${errorData.error || 'Server error'}`);
            return false;
        }
        const result = await response.json();
        return result.paymentCompleted;
    } catch (error) {
        console.error('Error verifying payment:', error);
        return false;
    }
}

// Helper to initiate payment
async function initiatePayment(postId, price, productName, paymentBtn) {
    const email = localStorage.getItem('email');
    const buyerId = localStorage.getItem('userId');
    if (!email || !buyerId) {
        showToast('Please log in to make a payment', 'error');
        return;
    }
    try {
        paymentBtn.disabled = true;
        paymentBtn.textContent = 'Processing...';
        const response = await fetch(`${API_BASE_URL}/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ email, postId, buyerId, amount: price, productName }) // Pass amount and product name
        });
        const result = await response.json();
        if (result.success) {
            window.location.href = result.url;
        } else {
            paymentBtn.disabled = false;
            paymentBtn.textContent = 'Proceed to Payment';
            showToast(`Payment initiation failed: ${result.message || 'Please try again'}`, 'error');
        }
    } catch (error) {
        paymentBtn.disabled = false;
        paymentBtn.textContent = 'Proceed to Payment';
        showToast('Payment processing error', 'error');
    }
}

// Open modal for seller to send a counteroffer
function openLastPriceModal(productId, productName, productImage) {
    lastPriceModal.style.display = 'block';
    lastPriceInput.focus(); // Focus the input when modal opens
    submitLastPriceBtn.onclick = async () => {
        const lastPrice = lastPriceInput.value.trim().replace(/,/g, '');
        if (lastPrice && !isNaN(lastPrice) && Number(lastPrice) > 0) {
            const message = {
                receiverId: receiverId, // Buyer is the receiver
                messageType: 'counter-offer',
                text: JSON.stringify({ // Stringify for consistent parsing on receipt
                    text: `The last price I can give you for "${productName}" is ₦${Number(lastPrice).toLocaleString('en-NG')}`,
                    offer: Number(lastPrice),
                    productId: productId,
                    productName: productName,
                    image: productImage || ''
                }),
                offerDetails: { // Use offerDetails for structured data
                    productId,
                    productName,
                    proposedPrice: Number(lastPrice),
                    originalPrice: originalPrice || Number(lastPrice),
                    image: productImage || ''
                },
                createdAt: new Date(),
                isRead: false
            };

            // Optimistic display for seller (current user)
            const optimisticMessage = { ...message, senderId: userId, status: 'sent' };
            displayMessage(optimisticMessage, true);

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
                sentCounterOffers.add(productId); // Mark that a counter-offer was sent for this product
                saveBargainStates();
                console.log('Last price sent:', data);
                closeLastPriceModal();
            } catch (error) {
                console.error('Error sending last price:', error);
                showToast(`Failed to send last price: ${error.message}`, 'error');
                removeOptimisticMessage();
            }
        } else {
            showToast('Please enter a valid positive number', 'error');
        }
    };
}

// Close the last price modal
function closeLastPriceModal() {
    lastPriceModal.style.display = 'none';
    lastPriceInput.value = '';
}

// Handle bargain button click
bargainBtn.onclick = async () => {
    const modal = document.getElementById('bargainModal');
    if (!modal) {
        console.error('Bargain modal with ID "bargainModal" not found.');
        showToast('Bargain modal not found', 'error');
        return;
    }
    modal.style.display = 'block';
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error('No auth token found');
        }
        const res = await fetch(`${API_BASE_URL}/products?sellerId=${receiverId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            throw new Error(`HTTP error! Status: ${res.status}`);
        }
        const data = await res.json();
        console.log('Products API response:', data); // Log the full response

        const container = document.getElementById('bargainProductsContainer');
        if (!container) {
            console.error('Bargain products container not found.');
            showToast('Products container not found', 'error');
            return;
        }
        container.innerHTML = '';

        if (!data.success || !data.products || data.products.length === 0) {
            console.log('No products found in response:', data);
            container.innerHTML = '<p>No products available for bargaining with this seller.</p>';
            return;
        }

        data.products.forEach(product => {
            // Only show products not already involved in an accepted or ended bargain
            if (acceptedOffers.has(product._id) || endedBargains.has(product._id)) {
                return;
            }

            console.log('Rendering product:', product); // Log each product
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${product.photo || '/default-image.png'}" alt="${product.title || 'Product'}" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load product image.</p>
                <div>
                    <strong>${product.title || 'No Title'}</strong><br>
                    ₦${Number(product.price).toLocaleString('en-NG')}<br>
                    <input type="text" class="bargain-price-input" placeholder="Your Offer Price">
                    <button class="confirm-bargain-btn">Send Offer</button>
                </div>
            `;
            const sendButton = card.querySelector('.confirm-bargain-btn');
            const priceInput = card.querySelector('.bargain-price-input');

            priceInput.addEventListener('beforeinput', (e) => {
                if (e.data && !/^[0-9]$/.test(e.data)) {
                    e.preventDefault();
                }
            });

            priceInput.addEventListener('input', (e) => {
                const input = e.target;
                const cursorPosition = input.selectionStart;
                let value = input.value.replace(/[^0-9]/g, '');
                if (value) {
                    const formattedValue = Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 });
                    input.value = formattedValue;
                    const commasBeforeCursor = (input.value.slice(0, cursorPosition).match(/,/g) || []).length;
                    const newCommasBeforeCursor = (formattedValue.slice(0, cursorPosition).match(/,/g) || []).length;
                    input.setSelectionRange(
                        cursorPosition + (newCommasBeforeCursor - commasBeforeCursor),
                        cursorPosition + (newCommasBeforeCursor - commasBeforeCursor)
                    );
                } else {
                    input.value = '';
                }
            });

            sendButton.onclick = async () => {
                let price = priceInput.value.replace(/,/g, '');
                if (price && !isNaN(price) && Number(price) > 0) {
                    sendButton.disabled = true;
                    sendButton.textContent = 'Sending...';
                    const message = {
                        receiverId,
                        messageType: 'offer',
                        text: JSON.stringify({ // Stringify for consistent parsing on receipt
                            text: `My offer for "${product.title}" is ₦${Number(price).toLocaleString('en-NG')}`, // Use title
                            offer: Number(price),
                            productId: product._id,
                            productName: product.title,
                            image: product.photo || ''
                        }),
                        offerDetails: { // Use offerDetails for structured data
                            productId: product._id,
                            productName: product.title,
                            proposedPrice: Number(price),
                            originalPrice: product.price,
                            image: product.photo || ''
                        },
                        createdAt: new Date(),
                        isRead: false
                    };

                    // Optimistic display
                    const optimisticMessage = { ...message, senderId: userId, status: 'sent' };
                    displayMessage(optimisticMessage, true);

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
                        bargainingSessions.add(`${product._id}-${userId}`); // Mark as bargaining
                        saveBargainStates();
                        console.log('Offer sent:', data);
                        closeBargainModal();
                    } catch (error) {
                        console.error('Error sending offer:', error);
                        showToast(`Failed to send offer: ${error.message}`, 'error');
                        removeOptimisticMessage();
                    } finally {
                        sendButton.disabled = false;
                        sendButton.textContent = 'Send Offer';
                    }
                } else {
                    showToast('Please enter a valid positive number', 'error');
                }
            };
            container.appendChild(card);
        });

        const closeModalBtn = document.getElementById('closeBargainModalBtn');
        if (closeModalBtn) {
            closeModalBtn.onclick = () => {
                console.log('Close button clicked, closing modal');
                closeBargainModal();
            };
        } else {
            console.warn('Close button with ID "closeBargainModalBtn" not found.');
        }
    } catch (e) {
        console.error('Fetch error:', e);
        showToast(`Error loading products: ${e.message}`, 'error');
        document.getElementById('bargainProductsContainer').innerHTML = '<p>Error loading products.</p>';
    }
};

// Close the bargain modal
function closeBargainModal() {
    const modal = document.getElementById('bargainModal');
    if (modal) {
        console.log('Closing bargain modal');
        modal.style.display = 'none';
    } else {
        console.error('Bargain modal with ID "bargainModal" not found.');
    }
}

// Send a new message from the chat input
sendBtn.onclick = async () => {
    const text = typeSection.value.trim();
    if (!text) {
        console.log('Empty message not sent');
        showToast('Please enter a message', 'error');
        return;
    }

    const isInitialMessage = !isInitialMessageSent && predefinedMessage && productImage;

    console.log('Message comparison:', {
        inputText: text,
        predefinedMessage: predefinedMessage,
        isInitialMessage,
        isInitialMessageSent
    });

    const message = {
        receiverId,
        // If it's an initial message with product image, ensure text is JSON string with image
        text: isInitialMessage ? JSON.stringify({ text, image: productImage }) : text,
        messageType: 'text',
        createdAt: new Date(),
        isRead: false
    };

    console.log('Sending message:', {
        text: message.text,
        isJson: typeof message.text === 'string' && message.text.startsWith('{'),
        parsed: typeof message.text === 'string' && message.text.startsWith('{') ? JSON.parse(message.text) : null,
        isInitialMessage,
        isInitialMessageSent
    });

    // Optimistic display
    const optimisticMessage = { ...message, senderId: userId, status: 'sent' };
    displayMessage(optimisticMessage, true);

    // Clear input immediately
    typeSection.value = '';

    // Handle initial message preview removal
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
    // Ensure the message is relevant to the current chat
    // This is crucial. If a message is sent to the shared chat room, both users
    // should receive it, and this filter ensures it's for *this* chat.
    const isForCurrentChat =
        (message.senderId === userId && message.receiverId === receiverId) ||
        (message.senderId === receiverId && message.receiverId === userId) ||
        (message.receiverId === userId && ['sellerAccept', 'buyerAccept', 'end-bargain', 'payment-completed'].includes(message.messageType)); // System messages specific to current user

    if (!isForCurrentChat) {
        return;
    }

    displayMessage(message);

    // Mark as seen only if the current user is the receiver and they didn't send it themselves
    if (message.receiverId === userId && message.status !== 'seen' && message.senderId !== userId) {
        socket.emit('markAsSeen', {
            messageIds: [message._id],
            senderId: message.senderId,
            receiverId: userId
        });
    }

    // Only show toast for messages from the other user
    if (message.senderId !== userId) {
        showToast(`New message from ${recipientUsername}`, 'success');
    }

    // Store in localStorage as a fallback
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) { // Prevent duplicates
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    }
});

// Handle message synced event for persistence
socket.on('messageSynced', (message) => {
    // Ensure the message is relevant to the current chat
    const isForCurrentChat =
        (message.senderId === userId && message.receiverId === receiverId) ||
        (message.senderId === receiverId && message.receiverId === userId);

    if (!isForCurrentChat) {
        return;
    }
    console.log('Message synced:', message);
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) {
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    }
});

// Handle new message notifications
socket.on('newMessageNotification', (notification) => {
    console.log('Received new message notification:', notification);
    // Only show toast if not already in the active chat with that sender
    if (notification.senderId !== receiverId) {
        showToast(`New message from ${notification.senderName}: ${notification.text}`, 'success');
    }
});

// Load chat history and check for initial message
async function loadChatHistory() {
    try {
        // Check for auth token
        const token = localStorage.getItem('authToken');
        if (!token) {
            showToast('Please log in to view messages', 'error');
            window.location.href = 'login.html';
            return;
        }

        console.log(`Fetching messages for user1=${userId}&user2=${receiverId}`);
        const res = await fetch(`${API_BASE_URL}/messages?user1=${userId}&user2=${receiverId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`Fetch response status: ${res.status}`);
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Failed to fetch messages: ${res.status} ${res.statusText}`, errorText);
            throw new Error(`Failed to fetch messages: ${res.status} ${res.statusText}`);
        }

        const rawText = await res.text();
        console.log('Raw response:', rawText);
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
            // Fallback to localStorage
            messages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        }
        console.log(`Fetched ${messages.length} messages`);

        const validMessages = messages.filter((msg, index) => {
            if (!msg || typeof msg !== 'object' || !msg.messageType) {
                console.warn(`Skipping invalid message at index ${index}:`, msg);
                return false;
            }
            // Ensure message.text exists for non-image/payment types, or if it's supposed to be JSON
            if (!msg.text && !['image', 'payment-completed'].includes(msg.messageType)) {
                // For system messages, text might be in offerDetails or implicitly handled
                if (!['sellerAccept', 'buyerAccept', 'end-bargain'].includes(msg.messageType)) {
                    console.warn(`Skipping message with no text at index ${index}:`, msg);
                    return false;
                }
            }
            // If it's a message type that *should* have JSON in text, try parsing
            if (typeof msg.text === 'string' && msg.text.startsWith('{') && ['offer', 'counter-offer', 'buyerAccept', 'sellerAccept', 'end-bargain', 'text'].includes(msg.messageType)) {
                try {
                    JSON.parse(msg.text); // Just check if it's parsable, displayMessage handles the content
                } catch (e) {
                    console.warn(`Invalid JSON text in message at index ${index} (${msg.messageType}):`, msg.text);
                    // Decide how to handle: either skip, or set a default text
                    // For now, let's allow it but the displayMessage function will handle the malformed JSON.
                }
            }
            return true;
        });

        // Check if initial message was sent
        const initialMessageExists = validMessages.some(msg => {
            if (msg.senderId === userId && msg.messageType === 'text' && typeof msg.text === 'string' && msg.text.startsWith('{')) {
                try {
                    const parsed = JSON.parse(msg.text);
                    // Check if the parsed message matches the predefined message and product image
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

        // Render product preview if initial message not sent
        renderProductPreview();

        lastDisplayedDate = null; // Reset for re-rendering
        validMessages.forEach(displayMessage);
        // Update localStorage with fetched messages
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(validMessages));

        // Scroll to bottom after loading history
        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {
        console.error('Error loading chat history:', error);
        showToast(`Failed to load messages: ${error.message}`, 'error');
        // Fallback to localStorage if API fails completely
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        storedMessages.forEach(displayMessage);
        renderProductPreview();
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to bottom on fallback
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
        // Clear after a short delay
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
        // Find the message div based on the timestamp's parent
        const messageDiv = timestamp.closest('.message');
        if (messageDiv && messageIds.includes(messageDiv.dataset.messageId)) {
            // Check if '✔✔' is already present to avoid duplication
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
        // It's a good idea to also emit a 'joinChat' for the specific conversation room
        // This assumes your backend has a concept of a chat room ID for a conversation
        const chatRoomId = [userId, receiverId].sort().join('_'); // Consistent room ID
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

    // Clear previous input if any
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
