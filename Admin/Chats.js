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

    // Update bargaining and offer statuses
    if (message.offerDetails && message.offerDetails.productId) {
        if (['accepted', 'rejected', 'completed'].includes(message.offerDetails.status)) {
            acceptedOffers.add(message.offerDetails.productId);
            bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
            if (message.offerDetails.status === 'rejected' || message.offerDetails.status === 'completed') {
                endedBargains.add(message.offerDetails.productId);
            }
        }
    }

    // Handle system messages directly
    if (message.metadata?.isSystemMessage) {
        let systemText = message.text;
        let productPhoto = null;
        let buttonDetails = null;
        const parsedOfferDetails = message.offerDetails || {};

        if (message.messageType === 'sellerCounterAccepted' && message.receiverId === userId) {
            // Seller's view when buyer accepts their counter offer
            systemText = `Your last price was accepted.`;
            productPhoto = parsedOfferDetails.image || '';
            buttonDetails = {
                text: 'Waiting for payment',
                disabled: true
            };
            // Check payment status to update button text on load
            verifyPaymentStatus(parsedOfferDetails.productId, 'seller').then(isPaid => {
                if (isPaid) {
                    buttonDetails.text = 'Payment Completed';
                }
            });
        } else if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
            // Seller's view when seller accepts initial offer
            systemText = `You have accepted the offer of ₦${Number(parsedOfferDetails.proposedPrice || 0).toLocaleString('en-NG')} for "${parsedOfferDetails.productName || 'Product'}".`;
            productPhoto = parsedOfferDetails.image || '';
            buttonDetails = {
                text: 'Waiting for payment',
                disabled: true
            };
            // Check payment status to update button text on load
            verifyPaymentStatus(parsedOfferDetails.productId, 'seller').then(isPaid => {
                if (isPaid) {
                    buttonDetails.text = 'Payment Completed';
                }
            });
        } else {
            switch (message.messageType) {
                case 'accept-offer':
                    systemText = `Offer for ${parsedOfferDetails.productName} at ₦${parsedOfferDetails.proposedPrice.toLocaleString('en-NG')} was accepted`;
                    break;
                case 'reject-offer':
                    systemText = `Offer for ${parsedOfferDetails.productName} was rejected`;
                    endedBargains.add(parsedOfferDetails.productId);
                    bargainingSessions.delete(`${parsedOfferDetails.productId}-${message.senderId}`);
                    break;
                case 'end-bargain':
                    systemText = `Bargaining for ${parsedOfferDetails.productName} has ended`;
                    endedBargains.add(parsedOfferDetails.productId);
                    bargainingSessions.delete(`${parsedOfferDetails.productId}-${message.senderId}`);
                    break;
                case 'payment-completed':
                    systemText = `Payment completed for ${parsedOfferDetails.productName}`;
                    break;
                default:
                    // If it's a generic system message, use its text directly
                    systemText = message.text;
                    break;
            }
        }
        chatMessages.appendChild(createSystemMessage(systemText, parsedOfferDetails.productId, productPhoto, buttonDetails));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Handle specific message types like image messages or payment completed with receipt
    if (message.messageType === 'image' || (message.attachment && message.attachment.type === 'image')) {
        const imageUrl = message.attachment?.url || message.content;
        if (imageUrl) {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
            msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
            const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            msgDiv.innerHTML = `
                ${message.text ? `<div>${message.text}</div>` : ''}
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
            <div>Payment completed for ${message.offerDetails.productName}</div>
            <img src="${message.attachment.url}" class="product-photo-preview" alt="Receipt" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
            <p style="display:none;color:red;">Failed to load receipt image.</p>
            <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    if (message.messageType === 'endBargain' || message.messageType === 'end-bargain') {
        let parsed;
        try {
            parsed = JSON.parse(message.text);
        } catch (e) {
            console.warn('Failed to parse end-bargain message text:', message.text, e);
            parsed = message.offerDetails || {};
        }
        endedBargains.add(parsed.productId);
        bargainingSessions.delete(`${parsed.productId}-${message.senderId}`);

        const endText = message.senderId === userId
            ? `This bargain for ${parsed.productName || 'Product'} was ended by you`
            : `This bargain for ${parsed.productName || 'Product'} was ended by ${recipientUsername}`;

        chatMessages.appendChild(createSystemMessage(endText));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    if (message.messageType === 'buyerAccept' && message.receiverId === userId) {
        // This is the message for the buyer when an offer (initial or counter) is accepted.
        const parsed = message.offerDetails || JSON.parse(message.text);
        const acceptedAmount = Number(parsed.proposedPrice || parsed.offer || 0).toLocaleString('en-NG');
        const buyerAcceptText = `You have accepted the offer of ₦${acceptedAmount} for "${parsed.productName || 'Product'}".`;

        const buyerDiv = createSystemMessage(buyerAcceptText);

        if (parsed.image) {
            const imageContainer = document.createElement('div');
            imageContainer.style.margin = '10px 0';
            imageContainer.innerHTML = `
                <img src="${parsed.image}" class="product-photo-preview" alt="${parsed.productName || 'Product'}" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load product image.</p>
            `;
            buyerDiv.appendChild(imageContainer);
        }

        const paymentBtn = document.createElement('button');
        paymentBtn.className = 'proceed-to-payment-btn';
        paymentBtn.textContent = 'Proceed to Payment';

        // Store reference to this button for real-time updates and persistence
        offerButtons.set(parsed.productId, { ...offerButtons.get(parsed.productId), proceedToPaymentBtn: paymentBtn });

        const verifyPaymentAndUpdateButton = async () => {
            const isPaid = await verifyPaymentStatus(parsed.productId, 'buyer');
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
            const postId = parsed.productId;
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
        return;
    }

    let msg = message.text, img = null, parsed = {};
    console.log('Processing message:', { messageType: message.messageType, text: message.text });

    // Parse message content for offer, counter-offer, and general text messages that might contain JSON
    if (['offer', 'counter-offer', 'text'].includes(message.messageType) && message.text.startsWith('{')) {
        try {
            parsed = JSON.parse(message.text);
            msg = parsed.text || message.text;
            img = parsed.image || null;
            parsed.offer = parsed.offer || (message.offerDetails?.proposedPrice) || 0;
            parsed.productId = parsed.productId || (message.offerDetails?.productId) || '';
            parsed.productName = parsed.productName || (message.offerDetails?.productName) || 'Product';
            parsed.image = parsed.image || (message.offerDetails?.image) || '';
            console.log('Parsed special message:', parsed, 'Image:', img);

            // Fix relative image URLs
            if (img && !img.match(/^https?:\/\//)) {
                img = img.startsWith('/') ? `${API_BASE_URL}${img}` : img;
            }
        } catch (e) {
            console.warn(`Failed to parse ${message.messageType} message text as JSON:`, message.text, e);
            msg = message.text;
            img = null;
            // Ensure offerDetails are still populated if available
            parsed = {
                offer: (message.offerDetails?.proposedPrice) || 0,
                productId: (message.offerDetails?.productId) || '',
                productName: (message.offerDetails?.productName) || 'Product',
                image: (message.offerDetails?.image) || ''
            };
        }
    } else {
        msg = message.text;
        img = null;
        console.log('Plain text message or already handled system/image message:', msg, 'Image:', img);
    }

    if (message.messageType === 'counter-offer' && message.senderId === userId && parsed.productId) {
        sentCounterOffers.add(parsed.productId);
        console.log(`Added to sentCounterOffers: ${parsed.productId}`, sentCounterOffers);
    }

    // Display bargaining session start message
    if (parsed?.offer && !bargainingSessions.has(`${parsed.productId}-${message.senderId}`) && !endedBargains.has(parsed.productId)) {
        bargainingSessions.add(`${parsed.productId}-${message.senderId}`);
        const startText = message.senderId === userId
            ? `You are bargaining for ${parsed.productName || 'Product'}`
            : `${recipientUsername} is bargaining for ${parsed.productName || 'Product'}`;
        chatMessages.appendChild(createSystemMessage(startText));
    }

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    if (['offer', 'counter-offer'].includes(message.messageType) && parsed.productId) {
        msgDiv.setAttribute('data-product-id', parsed.productId);
        msgDiv.setAttribute('data-message-type', message.messageType);
    }

    msgDiv.innerHTML = `
        <div>${msg}</div>
        ${img ? `<img src="${img}" class="product-photo-preview" alt="Product Image" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><p style="display:none;color:red;">Failed to load product image.</p>` : ''}
        <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
    `;

    const isOfferAccepted = parsed.productId && acceptedOffers.has(parsed.productId);
    const isBargainEnded = parsed.productId && endedBargains.has(parsed.productId);

    console.log(`Rendering message:`, {
        messageType: message.messageType,
        receiverId: message.receiverId,
        userId,
        senderId: message.senderId,
        parsedOffer: parsed.offer,
        isOfferAccepted,
        isBargainEnded,
        productId: parsed.productId,
        hasCounterOffer: sentCounterOffers.has(parsed.productId),
        image: img
    });

    // Seller's side: Buyer's initial offer (receiver is seller)
    if (message.messageType === 'offer' && parsed.offer && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId !== userId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        if (parsed.productId) offerButtons.set(parsed.productId, { ...offerButtons.get(parsed.productId), acceptBtn: acceptBtn });

        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                offer: Number(parsed.offer),
                senderId: message.senderId
            };
            document.getElementById('confirmationMessage').textContent =
                `Are you sure you want to accept the offer of ₦${Number(parsed.offer).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}"?`;
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

                    // Remove buttons from all relevant messages
                    const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${parsed.productId}"]`);
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
                            text: `You have accepted the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${parsed.productName}".`,
                            productName: parsed.productName,
                            productId: productDetails.productId,
                            proposedPrice: productDetails.offer,
                            image: parsed.image || productImage || ''
                        }),
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: parsed.productName,
                            proposedPrice: productDetails.offer,
                            image: parsed.image || productImage || '',
                            status: 'accepted'
                        },
                        createdAt: new Date(),
                        isRead: true // System messages are considered read by sender
                    };

                    // Optimistic display for seller
                    const optimisticSellerAccept = { ...sellerAcceptMessage, _id: `temp_seller_accept_${Date.now()}` };
                    displayMessage(optimisticSellerAccept, true);

                    // Buyer sends message to seller (offer accepted message)
                    const buyerAcceptMessage = {
                        senderId: userId, // Seller is sending this to the buyer
                        receiverId: message.senderId, // Buyer
                        messageType: 'buyerAccept',
                        text: JSON.stringify({
                            text: `Your offer for "${parsed.productName}" has been accepted.`,
                            productName: parsed.productName,
                            productId: productDetails.productId,
                            offer: productDetails.offer,
                            buyerName: localStorage.getItem('username') || 'Buyer',
                            image: parsed.image || productImage || ''
                        }),
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: parsed.productName,
                            proposedPrice: productDetails.offer,
                            image: parsed.image || productImage || '',
                            status: 'accepted'
                        },
                        createdAt: new Date(),
                        isRead: false
                    };

                    // Send the buyerAccept message via HTTP
                    const acceptResponse = await fetch(`${API_BASE_URL}/send`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(buyerAcceptMessage)
                    });
                    const acceptData = await acceptResponse.json();
                    if (!acceptResponse.ok) throw new Error(acceptData.error || `HTTP error ${acceptResponse.status}`);

                    // Also save the seller's system message to localStorage for persistence
                    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
                    if (!storedMessages.some(msg => msg._id === sellerAcceptMessage._id)) {
                         // Assign a temporary ID if no _id from server for system messages
                        const tempId = `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        storedMessages.push({ ...sellerAcceptMessage, _id: tempId });
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
        if (parsed.productId) offerButtons.set(parsed.productId, { ...offerButtons.get(parsed.productId), declineBtn: declineBtn });

        declineBtn.onclick = () => {
            openLastPriceModal(parsed.productId, parsed.productName, parsed.image || productImage);
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(declineBtn);
    }

    // Buyer's side: Seller's counter offer (receiver is buyer)
    if (message.messageType === 'counter-offer' && parsed.offer && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId === receiverId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        if (parsed.productId) offerButtons.set(parsed.productId, { ...offerButtons.get(parsed.productId), acceptBtn: acceptBtn });

        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                offer: Number(parsed.offer),
                senderId: message.senderId
            };
            document.getElementById('confirmationMessage').textContent =
                `Are you sure you want to accept the seller's offer of ₦${Number(parsed.offer).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}"?`;
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

                    // Remove buttons from all relevant messages
                    const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${parsed.productId}"]`);
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
                            text: `You have accepted the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${parsed.productName}".`,
                            productName: parsed.productName,
                            productId: productDetails.productId,
                            offer: productDetails.offer,
                            buyerName: localStorage.getItem('username') || 'Buyer',
                            image: parsed.image || productImage || ''
                        }),
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: parsed.productName,
                            proposedPrice: productDetails.offer,
                            image: parsed.image || productImage || '',
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
                            text: `Your last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${parsed.productName}" was accepted by ${recipientUsername}.`,
                            productName: parsed.productName,
                            productId: productDetails.productId,
                            proposedPrice: productDetails.offer,
                            image: parsed.image || productImage || ''
                        }),
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: parsed.productName,
                            proposedPrice: productDetails.offer,
                            image: parsed.image || productImage || '',
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
                        const tempId = `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        storedMessages.push({ ...buyerAcceptMessage, _id: tempId });
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
                productId: parsed.productId,
                productName: parsed.productName
            };

            try {
                const token = localStorage.getItem('authToken');
                if (!token) throw new Error('No auth token found');
                endedBargains.add(productDetails.productId);

                const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${parsed.productId}"]`);
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
                        productName: productDetails.productName
                    }),
                    offerDetails: {
                        productId: parsed.productId,
                        productName: parsed.productName,
                        status: 'rejected'
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
                if (!storedMessages.some(msg => msg._id === endBargainMessage._id)) {
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
    const num = parseFloat(String(number).replace(/[^0-9.]/g, '')); // Allow decimals for robustness, then format as integer
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

    // Remove all non-digit characters for processing
    let value = originalValue.replace(/\D/g, '');

    // Format the value
    let formattedValue = '';
    if (value) {
        formattedValue = formatNumberWithCommas(value);
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
                    originalPrice: originalPrice || Number(lastPrice),
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

                // Update optimistic message with actual ID from server
                const sentMessageDiv = chatMessages.querySelector(`[data-message-id="${optimisticMessage._id}"]`);
                if (sentMessageDiv && data.data?._id) {
                    sentMessageDiv.dataset.messageId = data.data._id;
                    displayedMessages.delete(optimisticMessage._id);
                    displayedMessages.add(data.data._id);
                }
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
            container.innerHTML = '<p>No products available.</p>';
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

                let value = originalValue.replace(/\D/g, '');

                let formattedValue = '';
                if (value) {
                    formattedValue = formatNumberWithCommas(value);
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

    const isInitialMessage = !isInitialMessageSent && predefinedMessage && productImage;

    const message = {
        receiverId,
        text: isInitialMessage ? JSON.stringify({ text, image: productImage }) : text,
        messageType: 'text',
        createdAt: new Date(),
        isRead: false
    };

    console.log('Sending message:', {
        text: message.text,
        isJson: message.text.startsWith('{'),
        parsed: message.text.startsWith('{') ? JSON.parse(message.text) : null,
        isInitialMessage,
        isInitialMessageSent
    });

    // Optimistic display
    const optimisticMessage = { ...message, senderId: userId, status: 'sent', _id: `temp_msg_${Date.now()}` };
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

        const sentMessageDiv = chatMessages.querySelector(`[data-message-id="${optimisticMessage._id}"]`);
        if (sentMessageDiv && data.data?._id) {
            sentMessageDiv.dataset.messageId = data.data._id;
            displayedMessages.delete(optimisticMessage._id);
            displayedMessages.add(data.data._id);
        }
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
    if (!displayedMessages.has(message._id)) {
        displayMessage(message);
    } else {
        console.log('Skipping duplicate message:', message._id);
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
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) {
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
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
                (msg.messageType === 'sellerAccept' || msg.messageType === 'sellerCounterAccepted' || msg.messageType === 'buyerAccept')) {
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


// Handle message synced event for persistence
socket.on('messageSynced', (message) => {
    if (!((message.senderId === userId && message.receiverId === receiverId) ||
          (message.senderId === receiverId && message.receiverId === userId))) {
        return;
    }
    console.log('Message synced:', message);
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) {
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    } else {
        // If message exists, update its status (e.g., from optimistic to confirmed)
        const updatedMessages = storedMessages.map(msg =>
            msg._id === message._id ? { ...msg, ...message } : msg
        );
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(updatedMessages));
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
            if (!msg || typeof msg !== 'object' || !msg.text || !msg.messageType) {
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

        // Check if initial message was sent by looking through history
        const initialMessageExists = validMessages.some(msg => {
            if (msg.senderId === userId && msg.messageType === 'text') {
                // If msg.text is an object (from JSON.parse above), check its properties
                if (typeof msg.text === 'object' && msg.text !== null && msg.text.image === productImage && msg.text.text === predefinedMessage) {
                    return true;
                }
                // Fallback for old messages where text might not have been JSON.stringified
                if (typeof msg.text === 'string' && msg.text.includes(productImage) && msg.text.includes(predefinedMessage)) {
                    return true;
                }
            }
            return false;
        });

        if (initialMessageExists) {
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
        console.error('Error loading chat history:', error);
        showToast(`Failed to load messages: ${error.message}`, 'error');
        // Fallback to localStorage if API call fails
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        chatMessages.innerHTML = ''; // Clear current display
        displayedMessages.clear();
        lastDisplayedDate = null;
        storedMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(displayMessage);
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
        setTimeout(() => typingIndicator.textContent = '', 3000);
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
