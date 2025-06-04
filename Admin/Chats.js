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
const bargainBtn = document.getElementById('bargain-btn');
const typingIndicator = document.getElementById('typing-indicator');
const lastPriceModal = document.getElementById('lastPriceModal');
const lastPriceInput = document.getElementById('lastPriceInput');
const submitLastPriceBtn = document.getElementById('submitLastPriceBtn');
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
const endedBargains = new Set();
const bargainingSessions = new Set();
const acceptedOffers = new Set();
const sentCounterOffers = new Set();
const displayedMessages = new Set();
let isInitialMessageSent = localStorage.getItem(`initialMessageSent_${productId}_${receiverId}`) === 'true';

// Store offer-related button elements by product ID for real-time updates
const offerButtons = new Map(); // Key: productId, Value: { acceptBtn, declineBtn, proceedToPaymentBtn, systemButton }

// Function to render product preview
function renderProductPreview() {
    // Only show product preview if it's an initial chat with a predefined product message,
    // and the initial message hasn't been sent yet.
    if (productImage && productName && predefinedMessage && !isInitialMessageSent) {
        let previewContainer = document.getElementById('product-preview');
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'product-preview';
            previewContainer.style.margin = '10px';
            previewContainer.style.textAlign = 'center';
            chatMessages.insertAdjacentElement('beforebegin', previewContainer);
        }
        const isValidImageUrl = productImage.startsWith('http://') || productImage.startsWith('https://');
        previewContainer.innerHTML = `
            <p style="font-size: 14px; color: #777;">Product Preview: ${productName}</p>
            ${isValidImageUrl
                ? `<img src="${productImage}" class="product-photo-preview" alt="Product Preview" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                   <p style="display:none;color:red;">Failed to load product image.</p>`
                : `<p style="color:red;">No product image available.</p>`}
        `;
    } else {
        const previewContainer = document.getElementById('product-preview');
        if (previewContainer) {
            previewContainer.remove();
        }
    }
}

// Join chat room if userId and receiverId are available
if (userId && receiverId) socket.emit('joinRoom', userId);

let lastDisplayedDate = null;

/**
 * Creates a system message div for display within the chat.
 * @param {string} text The main text content of the system message.
 * @param {string|null} productId The ID of the product related to the message.
 * @param {string|null} productPhoto URL of the product image to display.
 * @param {object|null} buttonDetails Details for a button to include (text, disabled, onClick).
 * @returns {HTMLDivElement} The created system message div element.
 */
function createSystemMessage(text, productId = null, productPhoto = null, buttonDetails = null) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerHTML = `<div>${text}</div>`;

    if (productPhoto) {
        const imageContainer = document.createElement('div');
        imageContainer.style.margin = '10px 0';
        imageContainer.innerHTML = `
            <img src="${productPhoto}" class="product-photo-preview" alt="Product Image" style="max-width: 150px; border-radius: 5px; display: block; margin: 0 auto;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
            <p style="display:none;color:red;">Failed to load image.</p>
        `;
        div.appendChild(imageContainer);
    }

    if (buttonDetails) {
        const btn = document.createElement('button');
        btn.className = 'system-message-button';
        btn.textContent = buttonDetails.text;
        btn.disabled = buttonDetails.disabled;
        if (buttonDetails.disabled) {
            btn.style.backgroundColor = 'gray';
            btn.style.cursor = 'not-allowed';
        }
        if (buttonDetails.onClick) {
            btn.onclick = buttonDetails.onClick;
        }
        div.appendChild(btn);
        // Store reference to the button for future updates
        if (productId) {
            offerButtons.set(productId, { ...offerButtons.get(productId), systemButton: btn });
        }
    }
    return div;
}

/**
 * Displays a message in the chat interface.
 * @param {object} message The message object to display.
 * @param {boolean} isOptimistic True if the message is being optimistically displayed before server confirmation.
 */
function displayMessage(message, isOptimistic = false) {
    // Only display messages once to prevent duplicates, especially with optimistic updates
    if (message._id && displayedMessages.has(message._id) && !isOptimistic) {
        return;
    }
    if (message._id) {
        displayedMessages.add(message._id);
    }

    const messageDate = new Date(message.createdAt);
    const formattedDate = formatMessageDate(messageDate);

    if (formattedDate !== lastDisplayedDate) {
        chatMessages.appendChild(createSystemMessage(formattedDate));
        lastDisplayedDate = formattedDate;
    }

    // Attempt to parse message.text if it's a string starting with '{'
    let parsedMessageText = {};
    if (typeof message.text === 'string' && message.text.startsWith('{')) {
        try {
            parsedMessageText = JSON.parse(message.text);
        } catch (e) {
            console.warn('Failed to parse message text as JSON:', message.text, e);
            parsedMessageText = { text: message.text }; // Fallback to raw text
        }
    } else if (typeof message.text === 'object') {
        parsedMessageText = message.text;
    } else {
        parsedMessageText = { text: message.text };
    }

    // Combine message.offerDetails with parsedMessageText for comprehensive offer data
    const offerDetails = {
        ...parsedMessageText, // This might contain product details if message.text was a JSON string
        ...(message.offerDetails || {}) // Explicit offerDetails from the server take precedence
    };

    // Update bargaining and offer statuses based on actual offer details
    if (offerDetails.productId) {
        if (['accepted', 'rejected', 'completed'].includes(offerDetails.status)) {
            acceptedOffers.add(offerDetails.productId);
            bargainingSessions.delete(`${offerDetails.productId}-${message.senderId}`);
            if (offerDetails.status === 'rejected' || offerDetails.status === 'completed') {
                endedBargains.add(offerDetails.productId);
            }
        }
    }

    // Handle system messages directly
    if (message.metadata?.isSystemMessage) {
        let systemText = offerDetails.text || message.text; // Prefer parsed text first
        let productPhoto = offerDetails.image || null;
        let buttonDetails = null;

        if (message.messageType === 'sellerCounterAccepted' && message.receiverId === userId) {
            // Seller's view when buyer accepts their counter offer
            systemText = `Your last price for "${offerDetails.productName || 'Product'}" was accepted.`;
            productPhoto = offerDetails.image || '';
            buttonDetails = {
                text: 'Waiting for payment',
                disabled: true
            };
            // Check payment status to update button text on load
            verifyPaymentStatus(offerDetails.productId, 'seller').then(isPaid => {
                if (isPaid) {
                    const btn = offerButtons.get(offerDetails.productId)?.systemButton;
                    if (btn) {
                        btn.textContent = 'Payment Completed';
                        btn.style.backgroundColor = 'gray';
                        btn.style.cursor = 'not-allowed';
                    }
                }
            });
        } else if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
            // Seller's view when seller accepts initial offer
            systemText = `You have accepted the offer of ₦${Number(offerDetails.proposedPrice || 0).toLocaleString('en-NG')} for "${offerDetails.productName || 'Product'}".`;
            productPhoto = offerDetails.image || '';
            buttonDetails = {
                text: 'Waiting for payment',
                disabled: true
            };
            // Check payment status to update button text on load
            verifyPaymentStatus(offerDetails.productId, 'seller').then(isPaid => {
                if (isPaid) {
                    const btn = offerButtons.get(offerDetails.productId)?.systemButton;
                    if (btn) {
                        btn.textContent = 'Payment Completed';
                        btn.style.backgroundColor = 'gray';
                        btn.style.cursor = 'not-allowed';
                    }
                }
            });
        } else if (message.messageType === 'buyerAccept' && message.receiverId === userId) {
            // This is the message for the buyer when an offer (initial or counter) is accepted.
            const acceptedAmount = Number(offerDetails.proposedPrice || offerDetails.offer || 0).toLocaleString('en-NG');
            systemText = `Your offer for "${offerDetails.productName || 'Product'}" has been accepted.`;
            productPhoto = offerDetails.image || '';

            const buyerDiv = createSystemMessage(systemText, offerDetails.productId, productPhoto);

            const paymentBtn = document.createElement('button');
            paymentBtn.className = 'proceed-to-payment-btn';
            paymentBtn.textContent = 'Proceed to Payment';

            // Store reference to this button for real-time updates and persistence
            offerButtons.set(offerDetails.productId, { ...offerButtons.get(offerDetails.productId), proceedToPaymentBtn: paymentBtn });

            const verifyPaymentAndUpdateButton = async () => {
                const isPaid = await verifyPaymentStatus(offerDetails.productId, 'buyer');
                if (isPaid) {
                    paymentBtn.disabled = true;
                    paymentBtn.textContent = 'Payment Completed';
                    paymentBtn.style.backgroundColor = 'gray';
                    paymentBtn.style.cursor = 'not-allowed';
                } else {
                    paymentBtn.disabled = false;
                    paymentBtn.textContent = 'Proceed to Payment';
                    paymentBtn.style.backgroundColor = ''; // Reset if previously gray/red
                    paymentBtn.style.cursor = 'pointer';
                }
            };

            verifyPaymentAndUpdateButton(); // Initial check on load

            paymentBtn.onclick = async () => {
                const postId = offerDetails.productId;
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
                        body: JSON.stringify({ email, postId, buyerId })
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
            };

            buyerDiv.appendChild(paymentBtn);
            chatMessages.appendChild(buyerDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return; // Exit here as we've handled the buyerAccept system message with its custom layout
        }
        else {
            switch (message.messageType) {
                case 'accept-offer': // Generic acceptance (might not be used explicitly now but kept for robustness)
                    systemText = `Offer for ${offerDetails.productName} at ₦${Number(offerDetails.proposedPrice).toLocaleString('en-NG')} was accepted.`;
                    break;
                case 'reject-offer':
                    systemText = `Offer for ${offerDetails.productName} was rejected.`;
                    endedBargains.add(offerDetails.productId);
                    bargainingSessions.delete(`${offerDetails.productId}-${message.senderId}`);
                    break;
                case 'end-bargain':
                    systemText = `Bargaining for ${offerDetails.productName} has ended.`;
                    endedBargains.add(offerDetails.productId);
                    bargainingSessions.delete(`${offerDetails.productId}-${message.senderId}`);
                    break;
                case 'payment-completed':
                    systemText = `Payment completed for ${offerDetails.productName}.`;
                    break;
                default:
                    // If it's a generic system message, use its text directly
                    systemText = offerDetails.text || message.text;
                    break;
            }
        }
        // For other system messages (not buyerAccept), use the standard createSystemMessage function
        chatMessages.appendChild(createSystemMessage(systemText, offerDetails.productId, productPhoto, buttonDetails));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Handle specific message types like image messages or payment completed with receipt
    if (message.messageType === 'image' || (message.attachment && message.attachment.type === 'image')) {
        const imageUrl = message.attachment?.url || parsedMessageText.image || message.content;
        if (imageUrl) {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
            msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
            const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            msgDiv.innerHTML = `
                ${parsedMessageText.text ? `<div>${parsedMessageText.text}</div>` : ''}
                <img src="${imageUrl}" class="product-photo-preview" alt="Receipt" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load image.</p>
                <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }
    }

    if (message.messageType === 'payment-completed' && message.attachment?.type === 'receipt') {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
        msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
        const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msgDiv.innerHTML = `
            <div>Payment completed for ${offerDetails.productName}</div>
            <img src="${message.attachment.url}" class="product-photo-preview" alt="Receipt" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
            <p style="display:none;color:red;">Failed to load receipt image.</p>
            <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Display bargaining session start message for 'offer' and 'counter-offer'
    if (['offer', 'counter-offer'].includes(message.messageType) && offerDetails?.offer && !bargainingSessions.has(`${offerDetails.productId}-${message.senderId}`) && !endedBargains.has(offerDetails.productId)) {
        bargainingSessions.add(`${offerDetails.productId}-${message.senderId}`);
        const startText = message.senderId === userId
            ? `You are bargaining for ${offerDetails.productName || 'Product'}`
            : `${recipientUsername} is bargaining for ${offerDetails.productName || 'Product'}`;
        chatMessages.appendChild(createSystemMessage(startText));
    }

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    if (['offer', 'counter-offer'].includes(message.messageType) && offerDetails.productId) {
        msgDiv.setAttribute('data-product-id', offerDetails.productId);
        msgDiv.setAttribute('data-message-type', message.messageType);
    }

    // Fix relative image URLs if present in parsed message text
    if (parsedMessageText.image && !parsedMessageText.image.match(/^https?:\/\//)) {
        parsedMessageText.image = parsedMessageText.image.startsWith('/') ? `${API_BASE_URL}${parsedMessageText.image}` : parsedMessageText.image;
    }

    msgDiv.innerHTML = `
        <div>${parsedMessageText.text || message.text}</div>
        ${parsedMessageText.image ? `<img src="${parsedMessageText.image}" class="product-photo-preview" alt="Product Image" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><p style="display:none;color:red;">Failed to load product image.</p>` : ''}
        <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
    `;

    const isOfferAccepted = offerDetails.productId && acceptedOffers.has(offerDetails.productId);
    const isBargainEnded = offerDetails.productId && endedBargains.has(offerDetails.productId);

    // Seller's side: Buyer's initial offer (receiver is seller)
    if (message.messageType === 'offer' && offerDetails.offer && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId !== userId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        if (offerDetails.productId) offerButtons.set(offerDetails.productId, { ...offerButtons.get(offerDetails.productId), acceptBtn: acceptBtn });

        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: offerDetails.productId,
                productName: offerDetails.productName,
                offer: Number(offerDetails.offer),
                senderId: message.senderId, // The buyer's ID
                image: offerDetails.image || productImage || ''
            };
            document.getElementById('confirmationMessage').textContent =
                `Are you sure you want to accept the offer of ₦${Number(offerDetails.offer).toLocaleString('en-NG')} for "${offerDetails.productName || 'Product'}"?`;
            const acceptModal = document.getElementById('acceptConfirmationModal');
            acceptModal.style.display = 'block';
            document.getElementById('confirmAcceptBtn').onclick = async () => {
                try {
                    const token = localStorage.getItem('authToken');
                    if (!token) throw new Error('No auth token found');
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
                    const updatedPost = await response.json();

                    acceptedOffers.add(productDetails.productId);
                    endedBargains.add(productDetails.productId); // End bargaining for this product

                    // Remove buttons from all relevant messages
                    const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${offerDetails.productId}"]`);
                    offerMessages.forEach(msg => {
                        const buttons = msg.querySelectorAll('.accept-offer-btn, .decline-offer-btn, .end-bargain-btn');
                        buttons.forEach(btn => btn.remove());
                    });

                    // Seller sends system message to themselves (for persistence and UI update)
                    const sellerAcceptMessage = {
                        senderId: userId, // Current user is sender (seller)
                        receiverId: userId, // Seller (current user)
                        messageType: 'sellerAccept',
                        metadata: { isSystemMessage: true },
                        text: JSON.stringify({
                            text: `You have accepted the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}".`,
                            productName: productDetails.productName,
                            productId: productDetails.productId,
                            proposedPrice: productDetails.offer,
                            image: productDetails.image
                        }),
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: productDetails.productName,
                            proposedPrice: productDetails.offer,
                            image: productDetails.image,
                            status: 'accepted'
                        },
                        createdAt: new Date(),
                        isRead: true
                    };

                    // Optimistic display for seller
                    const optimisticSellerAccept = { ...sellerAcceptMessage, _id: `temp_seller_accept_${Date.now()}` };
                    displayMessage(optimisticSellerAccept, true);

                    // Seller sends system message to buyer
                    const buyerAcceptNotificationMessage = {
                        senderId: userId, // Seller is sending this to the buyer
                        receiverId: message.senderId, // Buyer
                        messageType: 'buyerAccept',
                        metadata: { isSystemMessage: true },
                        text: JSON.stringify({
                            text: `Your offer for "${productDetails.productName}" has been accepted.`,
                            productName: productDetails.productName,
                            productId: productDetails.productId,
                            offer: productDetails.offer,
                            buyerName: recipientUsername, // This will be seller's name from buyer's perspective
                            image: productDetails.image
                        }),
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: productDetails.productName,
                            proposedPrice: productDetails.offer,
                            image: productDetails.image,
                            status: 'accepted'
                        },
                        createdAt: new Date(),
                        isRead: false
                    };

                    // Send the buyerAcceptNotificationMessage via HTTP
                    const acceptResponse = await fetch(`${API_BASE_URL}/send`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(buyerAcceptNotificationMessage)
                    });
                    const acceptData = await acceptResponse.json();
                    if (!acceptResponse.ok) throw new Error(acceptData.error || `HTTP error ${acceptResponse.status}`);

                    // Save the seller's system message to localStorage for persistence
                    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
                    // Only add if not already present from previous load (e.g. if page was reloaded quickly)
                    if (!storedMessages.some(msg => msg._id === sellerAcceptMessage._id)) {
                        storedMessages.push({ ...sellerAcceptMessage, _id: acceptData.data?._id || optimisticSellerAccept._id });
                        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
                    }

                    acceptModal.style.display = 'none';
                    showToast('Offer accepted successfully!', 'success');
                } catch (error) {
                    console.error('Failed to accept initial offer:', error);
                    showToast(`Failed to accept offer: ${error.message}`, 'error');
                    acceptModal.style.display = 'none';
                }
            };
            document.getElementById('cancelAcceptBtn').onclick = () => {
                acceptModal.style.display = 'none';
            };
        };

        const declineBtn = document.createElement('button');
        declineBtn.className = 'decline-offer-btn';
        declineBtn.textContent = 'Decline';
        if (offerDetails.productId) offerButtons.set(offerDetails.productId, { ...offerButtons.get(offerDetails.productId), declineBtn: declineBtn });

        declineBtn.onclick = () => {
            openLastPriceModal(offerDetails.productId, offerDetails.productName, offerDetails.image || productImage);
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(declineBtn);
    }

    // Buyer's side: Seller's counter offer (receiver is buyer)
    if (message.messageType === 'counter-offer' && offerDetails.offer && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId === receiverId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        if (offerDetails.productId) offerButtons.set(offerDetails.productId, { ...offerButtons.get(offerDetails.productId), acceptBtn: acceptBtn });

        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: offerDetails.productId,
                productName: offerDetails.productName,
                offer: Number(offerDetails.offer),
                senderId: message.senderId, // The seller's ID
                image: offerDetails.image || productImage || ''
            };
            document.getElementById('confirmationMessage').textContent =
                `Are you sure you want to accept the seller's offer of ₦${Number(offerDetails.offer).toLocaleString('en-NG')} for "${offerDetails.productName || 'Product'}"?`;
            const acceptModal = document.getElementById('acceptConfirmationModal');
            acceptModal.style.display = 'block';
            document.getElementById('confirmAcceptBtn').onclick = async () => {
                try {
                    const token = localStorage.getItem('authToken');
                    if (!token) throw new Error('No auth token found');
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
                    const updatedPost = await response.json();

                    acceptedOffers.add(productDetails.productId);
                    endedBargains.add(productDetails.productId); // End bargaining for this product

                    // Remove buttons from all relevant messages
                    const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${offerDetails.productId}"]`);
                    offerMessages.forEach(msg => {
                        const buttons = msg.querySelectorAll('.accept-offer-btn, .end-bargain-btn');
                        buttons.forEach(btn => btn.remove());
                    });

                    // Buyer sends system message to themselves (for persistence and UI update)
                    const buyerAcceptMessage = {
                        senderId: userId, // Current user is sender (buyer)
                        receiverId: userId, // Buyer (current user)
                        messageType: 'buyerAccept',
                        metadata: { isSystemMessage: true },
                        text: JSON.stringify({
                            text: `You have accepted the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}".`,
                            productName: productDetails.productName,
                            productId: productDetails.productId,
                            offer: productDetails.offer,
                            buyerName: localStorage.getItem('username') || 'Buyer',
                            image: productDetails.image
                        }),
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: productDetails.productName,
                            proposedPrice: productDetails.offer,
                            image: productDetails.image,
                            status: 'accepted'
                        },
                        createdAt: new Date(),
                        isRead: true
                    };

                    // Optimistic display for buyer
                    const optimisticBuyerAccept = { ...buyerAcceptMessage, _id: `temp_buyer_accept_${Date.now()}` };
                    displayMessage(optimisticBuyerAccept, true);


                    // Buyer sends notification to seller that counter-offer was accepted
                    const sellerNotificationMessage = {
                        senderId: userId, // Buyer is sending this to the seller
                        receiverId: message.senderId, // Seller
                        messageType: 'sellerCounterAccepted',
                        metadata: { isSystemMessage: true },
                        text: JSON.stringify({
                            text: `Your last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}" was accepted by ${recipientUsername}.`,
                            productName: productDetails.productName,
                            productId: productDetails.productId,
                            proposedPrice: productDetails.offer,
                            image: productDetails.image
                        }),
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: productDetails.productName,
                            proposedPrice: productDetails.offer,
                            image: productDetails.image,
                            status: 'accepted'
                        },
                        createdAt: new Date(),
                        isRead: false
                    };

                    // Send sellerNotification message via HTTP
                    const sellerResponse = await fetch(`${API_BASE_URL}/send`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(sellerNotificationMessage)
                    });
                    const sellerData = await sellerResponse.json();
                    if (!sellerResponse.ok) throw new Error(sellerData.error || `HTTP error ${sellerResponse.status}`);

                    // Also save the buyer's system message to localStorage for persistence
                    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
                    if (!storedMessages.some(msg => msg._id === buyerAcceptMessage._id)) {
                        storedMessages.push({ ...buyerAcceptMessage, _id: sellerData.data?._id || optimisticBuyerAccept._id });
                        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
                    }

                    acceptModal.style.display = 'none';
                    showToast('Offer accepted successfully!', 'success');
                } catch (error) {
                    console.error('Failed to accept counter-offer:', error);
                    showToast(`Failed to accept offer: ${error.message}`, 'error');
                    acceptModal.style.display = 'none';
                }
            };
            document.getElementById('cancelAcceptBtn').onclick = () => {
                acceptModal.style.display = 'none';
            };
        };

        const endBargainBtn = document.createElement('button');
        endBargainBtn.className = 'end-bargain-btn';
        endBargainBtn.textContent = 'End Bargain';
        endBargainBtn.onclick = async () => {
            const productDetails = {
                productId: offerDetails.productId,
                productName: offerDetails.productName
            };

            try {
                const token = localStorage.getItem('authToken');
                if (!token) throw new Error('No auth token found');
                endedBargains.add(productDetails.productId);
                bargainingSessions.delete(`${productDetails.productId}-${message.senderId}`);


                // Remove buttons from all relevant messages
                const offerMessages = document.querySelectorAll(`.message[data-product-id="${offerDetails.productId}"]`);
                offerMessages.forEach(msg => {
                    const buttons = msg.querySelectorAll('.accept-offer-btn, .end-bargain-btn');
                    buttons.forEach(btn => btn.remove());
                });

                const endBargainMessage = {
                    senderId: userId, // Current user is sender
                    receiverId: message.senderId, // The other party
                    messageType: 'end-bargain',
                    metadata: { isSystemMessage: true }, // Mark as system message
                    text: JSON.stringify({
                        productId: productDetails.productId,
                        productName: productDetails.productName,
                        text: `Bargaining for "${productDetails.productName}" has ended.`
                    }),
                    offerDetails: {
                        productId: offerDetails.productId,
                        productName: offerDetails.productName,
                        status: 'rejected' // Or 'ended' depending on desired status
                    },
                    createdAt: new Date(),
                    isRead: false
                };

                // Optimistic display
                const optimisticEnd = { ...endBargainMessage, _id: `temp_end_bargain_${Date.now()}` };
                displayMessage(optimisticEnd, true);

                // Send via HTTP
                const endResponse = await fetch(`${API_BASE_URL}/send`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(endBargainMessage)
                });
                const endData = await endResponse.json();
                if (!endResponse.ok) throw new Error(endData.error || `HTTP error ${endResponse.status}`);

                // Also save to localStorage for persistence
                const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
                if (!storedMessages.some(msg => msg._id === endData.data?._id || optimisticEnd._id)) {
                    storedMessages.push({ ...endBargainMessage, _id: endData.data?._id || optimisticEnd._id });
                    localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
                }

                showToast('Bargain ended successfully!', 'success');
            } catch (error) {
                console.error('Failed to end bargain:', error);
                showToast(`Failed to end bargain: ${error.message}`, 'error');
                const lastSent = chatMessages.querySelector('.message.sent:last-child');
                if (lastSent && lastSent.dataset.messageId.startsWith('temp_end_bargain_')) lastSent.remove();
            }
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(endBargainBtn);
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Formats a number with thousands separators for NGN (Nigerian Naira) locale.
 * @param {number|string} number The number to format.
 * @returns {string} The formatted number string.
 */
function formatNumberWithCommas(number) {
    if (typeof number !== 'number' && typeof number !== 'string') return '';
    const num = parseFloat(String(number).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return '';
    // Use 'en-NG' locale for Nigerian Naira formatting, omitting fraction digits
    return num.toLocaleString('en-NG', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

// Add thousands separators to lastPriceInput and maintain cursor position
lastPriceInput.addEventListener('input', (e) => {
    const input = e.target;
    const originalValue = input.value;
    const cursorPosition = input.selectionStart;

    // Remove all non-digit and non-decimal characters for processing
    let value = originalValue.replace(/[^\d.]/g, '');

    // Format the value
    let formattedValue = '';
    if (value) {
        // Handle decimals if needed, but for prices usually whole numbers
        const parts = value.split('.');
        parts[0] = formatNumberWithCommas(parts[0]);
        formattedValue = parts.join('.');
    }

    input.value = formattedValue;

    // Adjust cursor position
    const diff = formattedValue.length - originalValue.length;
    input.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
});


/**
 * Opens the modal for the seller to send a counteroffer.
 * @param {string} productId The ID of the product.
 * @param {string} productName The name of the product.
 * @param {string} productImage The URL of the product image.
 */
function openLastPriceModal(productId, productName, productImage) {
    lastPriceModal.style.display = 'block';
    lastPriceInput.value = ''; // Clear previous input
    submitLastPriceBtn.onclick = async () => {
        const lastPrice = lastPriceInput.value.trim().replace(/,/g, ''); // Remove commas for numerical value
        if (lastPrice && !isNaN(lastPrice) && Number(lastPrice) > 0) {
            const message = {
                receiverId: receiverId,
                messageType: 'counter-offer',
                text: JSON.stringify({
                    text: `I can give you "${productName}" for ₦${Number(lastPrice).toLocaleString('en-NG')}`,
                    offer: Number(lastPrice),
                    productId: productId,
                    productName: productName,
                    image: productImage || ''
                }),
                offerDetails: {
                    productId,
                    productName,
                    proposedPrice: Number(lastPrice),
                    originalPrice: originalPrice || Number(lastPrice), // Use originalPrice if available, otherwise current offer
                    image: productImage || ''
                },
                createdAt: new Date(),
                isRead: false
            };

            // Optimistic display
            const optimisticMessage = { ...message, senderId: userId, status: 'sent', _id: `temp_counter_offer_${Date.now()}` };
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

                // Update optimistic message with actual ID from server and persist
                const sentMessageDiv = chatMessages.querySelector(`[data-message-id="${optimisticMessage._id}"]`);
                if (sentMessageDiv && data.data?._id) {
                    sentMessageDiv.dataset.messageId = data.data._id;
                    displayedMessages.delete(optimisticMessage._id);
                    displayedMessages.add(data.data._id);
                }

                const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
                const existingIndex = storedMessages.findIndex(msg => msg._id === optimisticMessage._id);
                if (existingIndex !== -1) {
                    storedMessages[existingIndex] = { ...message, senderId: userId, _id: data.data._id || optimisticMessage._id };
                } else {
                    storedMessages.push({ ...message, senderId: userId, _id: data.data._id || optimisticMessage._id });
                }
                localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));

                console.log('Last price sent:', data);
                closeLastPriceModal();
            } catch (error) {
                console.error('Error sending last price:', error);
                showToast(`Failed to send last price: ${error.message}`, 'error');
                // Remove optimistic message if sending failed
                const failedSentMessage = chatMessages.querySelector(`[data-message-id="${optimisticMessage._id}"]`);
                if (failedSentMessage) failedSentMessage.remove();
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
        console.log('Products API response:', data);

        const container = document.getElementById('bargainProductsContainer');
        if (!container) {
            console.error('Bargain products container not found.');
            showToast('Products container not found', 'error');
            return;
        }
        container.innerHTML = '';

        if (!data.success || !data.products || data.products.length === 0) {
            console.log('No products found in response:', data);
            container.innerHTML = '<p>No products available for bargaining.</p>';
            return;
        }

        data.products.forEach(product => {
            console.log('Rendering product:', product);
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

            // Apply thousands separators to bargain price input
            priceInput.addEventListener('input', (e) => {
                const input = e.target;
                const originalValue = input.value;
                const cursorPosition = input.selectionStart;

                let value = originalValue.replace(/[^\d.]/g, '');

                let formattedValue = '';
                if (value) {
                    const parts = value.split('.');
                    parts[0] = formatNumberWithCommas(parts[0]);
                    formattedValue = parts.join('.');
                }

                input.value = formattedValue;

                const diff = formattedValue.length - originalValue.length;
                input.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
            });

            sendButton.onclick = async () => {
                let price = priceInput.value.replace(/,/g, ''); // Remove commas before sending
                if (price && !isNaN(price) && Number(price) > 0) {
                    sendButton.disabled = true;
                    sendButton.textContent = 'Sending...';
                    const message = {
                        receiverId,
                        messageType: 'offer',
                        text: JSON.stringify({
                            text: `My offer for "${product.title}" is ₦${Number(price).toLocaleString('en-NG')}`,
                            offer: Number(price),
                            productId: product._id,
                            productName: product.title,
                            image: product.photo || ''
                        }),
                        offerDetails: {
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
                    const optimisticMessage = { ...message, senderId: userId, status: 'sent', _id: `temp_offer_${Date.now()}` };
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

                        const sentMessageDiv = chatMessages.querySelector(`[data-message-id="${optimisticMessage._id}"]`);
                        if (sentMessageDiv && data.data?._id) {
                            sentMessageDiv.dataset.messageId = data.data._id;
                            displayedMessages.delete(optimisticMessage._id);
                            displayedMessages.add(data.data._id);
                        }

                        // Persist the message after successful send
                        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
                        const existingIndex = storedMessages.findIndex(msg => msg._id === optimisticMessage._id);
                        if (existingIndex !== -1) {
                            storedMessages[existingIndex] = { ...message, senderId: userId, _id: data.data._id || optimisticMessage._id };
                        } else {
                            storedMessages.push({ ...message, senderId: userId, _id: data.data._id || optimisticMessage._id });
                        }
                        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));

                        console.log('Offer sent:', data);
                        closeBargainModal();
                    } catch (error) {
                        console.error('Error sending offer:', error);
                        showToast(`Failed to send offer: ${error.message}`, 'error');
                        const failedSentMessage = chatMessages.querySelector(`[data-message-id="${optimisticMessage._id}"]`);
                        if (failedSentMessage) failedSentMessage.remove();
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

    const messageContent = predefinedMessage && productImage && !isInitialMessageSent
        ? JSON.stringify({ text, image: productImage, productId, productName }) // Include product details for initial message
        : text;

    const message = {
        receiverId,
        text: messageContent,
        messageType: 'text',
        createdAt: new Date(),
        isRead: false
    };

    console.log('Sending message:', {
        text: message.text,
        isJson: typeof message.text === 'string' && message.text.startsWith('{'),
        parsed: typeof message.text === 'string' && message.text.startsWith('{') ? JSON.parse(message.text) : null,
        isInitialMessage: predefinedMessage && productImage && !isInitialMessageSent,
        isInitialMessageSent
    });

    // Optimistic display
    const optimisticMessage = { ...message, senderId: userId, status: 'sent', _id: `temp_msg_${Date.now()}` };
    displayMessage(optimisticMessage, true);

    // Clear input immediately
    typeSection.value = '';

    // Handle initial message preview removal
    if (predefinedMessage && productImage && !isInitialMessageSent) {
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

        const sentMessageDiv = chatMessages.querySelector(`[data-message-id="${optimisticMessage._id}"]`);
        if (sentMessageDiv && data.data?._id) {
            sentMessageDiv.dataset.messageId = data.data._id;
            displayedMessages.delete(optimisticMessage._id);
            displayedMessages.add(data.data._id);
        }

        // Persist the message after successful send
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        const existingIndex = storedMessages.findIndex(msg => msg._id === optimisticMessage._id);
        if (existingIndex !== -1) {
            storedMessages[existingIndex] = { ...message, senderId: userId, _id: data.data._id || optimisticMessage._id };
        } else {
            storedMessages.push({ ...message, senderId: userId, _id: data.data._id || optimisticMessage._id });
        }
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));

    } catch (error) {
        console.error('Error sending message:', error);
        showToast(`Failed to send message: ${error.message}`, 'error');
        const failedSentMessage = chatMessages.querySelector(`[data-message-id="${optimisticMessage._id}"]`);
        if (failedSentMessage) failedSentMessage.remove();
    }
};

/**
 * Verifies the payment status for a product.
 * @param {string} productId The ID of the product.
 * @param {'buyer'|'seller'} role The role (buyer or seller) for context.
 * @returns {Promise<boolean>} True if payment is completed, false otherwise.
 */
async function verifyPaymentStatus(productId, role) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.warn('No auth token found for payment verification.');
            return false;
        }
        const response = await fetch(`${API_BASE_URL}/payment-status?productId=${productId}&buyerId=${role === 'buyer' ? userId : receiverId}&sellerId=${role === 'seller' ? userId : receiverId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Server error' }));
            console.error(`Payment verification failed: ${errorData.error || 'Server error'}`, errorData);
            return false;
        }
        const result = await response.json();
        return result.paymentCompleted;
    } catch (error) {
        console.error('Error verifying payment status:', error);
        return false;
    }
}

// Handle incoming messages
socket.on('newMessage', message => {
    // Ensure message is relevant to the current chat
    if (!((message.senderId === userId && message.receiverId === receiverId) ||
          (message.senderId === receiverId && message.receiverId === userId))) {
        return;
    }

    // Only display if it's not an optimistic message being confirmed
    // and if the message is new or its status has changed
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    const existingMessage = storedMessages.find(msg => msg._id === message._id);

    if (!displayedMessages.has(message._id) || (existingMessage && existingMessage.status !== message.status)) {
        displayMessage(message);
    } else {
        console.log('Skipping duplicate or already displayed message:', message._id);
    }

    // Mark message as seen if the current user is the receiver and message is not already seen
    if (message.receiverId === userId && message.status !== 'seen') {
        socket.emit('markAsSeen', {
            messageIds: [message._id],
            senderId: message.senderId,
            receiverId: userId
        });
    }

    showToast(`New message from ${recipientUsername}`, 'success');

    // Store in localStorage
    if (!storedMessages.some(msg => msg._id === message._id)) {
        storedMessages.push(message);
    } else {
        // Update existing message in local storage if status changes
        const updatedMessages = storedMessages.map(msg =>
            msg._id === message._id ? { ...msg, ...message } : msg
        );
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(updatedMessages));
    }
});

// New Socket.IO event for real-time payment status updates
socket.on('paymentStatusUpdate', async (data) => {
    console.log('Received paymentStatusUpdate:', data);
    if (data.productId && (data.buyerId === userId || data.sellerId === userId)) {
        const productRelatedButtons = offerButtons.get(data.productId);

        // Update seller's "Waiting for payment" button
        if (productRelatedButtons?.systemButton) {
            if (data.status === 'completed') {
                productRelatedButtons.systemButton.textContent = 'Payment Completed';
                productRelatedButtons.systemButton.disabled = true;
                productRelatedButtons.systemButton.style.backgroundColor = 'gray';
                productRelatedButtons.systemButton.style.cursor = 'not-allowed';
                showToast('Payment confirmed!', 'success');
            } else if (data.status === 'failed') {
                productRelatedButtons.systemButton.textContent = 'Payment Failed';
                productRelatedButtons.systemButton.style.backgroundColor = 'red';
                productRelatedButtons.systemButton.style.cursor = 'not-allowed';
                showToast('Payment failed. Please contact the buyer.', 'error');
            }
        }
        // Update buyer's "Proceed to Payment" button
        if (productRelatedButtons?.proceedToPaymentBtn) {
            if (data.status === 'completed') {
                productRelatedButtons.proceedToPaymentBtn.textContent = 'Payment Completed';
                productRelatedButtons.proceedToPaymentBtn.disabled = true;
                productRelatedButtons.proceedToPaymentBtn.style.backgroundColor = 'gray';
                productRelatedButtons.proceedToPaymentBtn.style.cursor = 'not-allowed';
            } else if (data.status === 'failed') {
                productRelatedButtons.proceedToPaymentBtn.textContent = 'Payment Failed';
                productRelatedButtons.proceedToPaymentBtn.disabled = false;
                productRelatedButtons.proceedToPaymentBtn.style.backgroundColor = 'red';
            }
        }

        // To ensure persistence, update the relevant message in localStorage
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        const updatedMessages = storedMessages.map(msg => {
            if (msg.offerDetails?.productId === data.productId &&
                (msg.messageType === 'sellerAccept' || msg.messageType === 'sellerCounterAccepted' || msg.messageType === 'buyerAccept' || msg.messageType === 'payment-completed')) {
                // Update the status within the message's offerDetails for persistence
                return {
                    ...msg,
                    offerDetails: {
                        ...msg.offerDetails,
                        status: data.status
                    }
                };
            }
            return msg;
        });
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(updatedMessages));
    }
});


// Handle message synced event for persistence (for optimistic messages)
socket.on('messageSynced', (message) => {
    if (!((message.senderId === userId && message.receiverId === receiverId) ||
          (message.senderId === receiverId && message.receiverId === userId))) {
        return;
    }
    console.log('Message synced:', message);
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    // Check if the message with the temporary ID exists and update it with the actual ID
    const tempId = `temp_msg_${message.createdAt.getTime()}`; // Assuming optimistic message ID structure
    const existingIndex = storedMessages.findIndex(msg => msg._id === tempId || msg._id === message._id);

    if (existingIndex !== -1) {
        // Update the existing optimistic message with the server's ID and status
        storedMessages[existingIndex] = { ...storedMessages[existingIndex], ...message, _id: message._id };
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));

        // Update the DOM element's data-message-id
        const domMessage = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
        if (domMessage) {
            domMessage.dataset.messageId = message._id;
        }
    } else if (!storedMessages.some(msg => msg._id === message._id)) {
        // If it's a new message not previously optimistically displayed, add it
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    }
});

// Handle new message notifications
socket.on('newMessageNotification', (notification) => {
    console.log('Received new message notification:', notification);
    showToast(`New message from ${notification.senderName}: ${notification.text}`, 'success');
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

        console.log(`Fetching messages for user1=${userId}, user2=${receiverId}`);
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
            messages = []; // Treat as empty array if format is wrong
        }
        console.log(`Fetched ${messages.length} messages`);

        // Filter and process messages before displaying
        const validMessages = messages.filter((msg, index) => {
            if (!msg || typeof msg !== 'object' || !msg.messageType) { // message.text might be missing for system messages
                console.warn(`Skipping invalid message at index ${index}:`, msg);
                return false;
            }
            // Ensure message.text is a string, then if it starts with '{', attempt to parse it
            if (typeof msg.text === 'string' && msg.text.startsWith('{')) {
                try {
                    const parsedText = JSON.parse(msg.text);
                    if (typeof parsedText === 'object' && parsedText !== null) {
                        msg.text = parsedText; // Replace msg.text with the parsed object for easier access
                    }
                } catch (e) {
                    console.warn(`Invalid JSON text in message at index ${index}:`, msg.text);
                    // If parsing fails, keep msg.text as original string
                }
            }
            return true;
        });

        // Clear existing messages before re-rendering
        chatMessages.innerHTML = '';
        displayedMessages.clear(); // Clear displayed messages set
        acceptedOffers.clear(); // Clear accepted offers set on load
        endedBargains.clear(); // Clear ended bargains set on load
        bargainingSessions.clear(); // Clear bargaining sessions on load
        offerButtons.clear(); // Clear offer buttons map on load

        // Check if initial message was sent by looking through history
        const initialMessageExistsInHistory = validMessages.some(msg => {
            if (msg.senderId === userId && msg.messageType === 'text') {
                if (typeof msg.text === 'object' && msg.text !== null) {
                    return msg.text.image === productImage && msg.text.text === predefinedMessage && msg.text.productId === productId;
                }
                // Fallback for old messages where text might not have been JSON.stringified
                return typeof msg.text === 'string' && msg.text.includes(productImage) && msg.text.includes(predefinedMessage);
            }
            return false;
        });

        if (initialMessageExistsInHistory) {
            isInitialMessageSent = true;
            localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, 'true');
        } else {
            isInitialMessageSent = false;
            localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, 'false');
        }

        renderProductPreview(); // Render product preview based on updated isInitialMessageSent

        lastDisplayedDate = null; // Reset date for fresh rendering
        validMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(displayMessage);

        // Mark all loaded messages as seen (if current user is receiver)
        const unreadMessages = validMessages.filter(msg => msg.receiverId === userId && msg.status !== 'seen').map(msg => msg._id);
        if (unreadMessages.length > 0) {
            socket.emit('markAsSeen', {
                messageIds: unreadMessages,
                senderId: receiverId, // The sender of these messages
                receiverId: userId
            });
        }

        // Update localStorage with fetched messages (after filtering and processing)
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(validMessages));

    } catch (error) {
        console.error('Error loading chat history from API:', error);
        showToast(`Failed to load messages from server: ${error.message}. Loading from local storage.`, 'error');
        // Fallback to localStorage if API call fails
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        chatMessages.innerHTML = ''; // Clear current display
        displayedMessages.clear();
        acceptedOffers.clear();
        endedBargains.clear();
        bargainingSessions.clear();
        offerButtons.clear();
        lastDisplayedDate = null;
        storedMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(displayMessage);

        // Re-evaluate isInitialMessageSent based on stored messages
        const initialMessageExistsInLocalStorage = storedMessages.some(msg => {
            if (msg.senderId === userId && msg.messageType === 'text') {
                if (typeof msg.text === 'object' && msg.text !== null) {
                    return msg.text.image === productImage && msg.text.text === predefinedMessage && msg.text.productId === productId;
                }
                return typeof msg.text === 'string' && msg.text.includes(productImage) && msg.text.includes(predefinedMessage);
            }
            return false;
        });
        isInitialMessageSent = initialMessageExistsInLocalStorage;
        localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, isInitialMessageSent);

        renderProductPreview();
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
        if (typingIndicator.timeoutId) {
            clearTimeout(typingIndicator.timeoutId);
        }
        typingIndicator.timeoutId = setTimeout(() => typingIndicator.textContent = '', 3000);
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
        const messageId = timestamp.closest('.message').dataset.messageId;
        if (messageIds.includes(messageId) && !timestamp.textContent.includes('✔✔')) {
            timestamp.textContent += ' ✔✔';
            // Update the status in localStorage for persistence
            const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
            const updatedMessages = storedMessages.map(msg =>
                msg._id === messageId ? { ...msg, status: 'seen' } : msg
            );
            localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(updatedMessages));
        }
    });
});

socket.on('connect', () => {
    console.log('Connected to server');
    if (userId) {
        socket.emit('joinRoom', userId);
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
