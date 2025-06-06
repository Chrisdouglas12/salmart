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


const bargainBtn = document.getElementById('bargain-btn');

bargainBtn.addEventListener('click', (e) => {
  e.preventDefault();
  showCustomToast("🛠️ Bargain Mode is under development.");
});

function showCustomToast(message) {
  // Create toast element
  const toast = document.createElement('div');
  toast.textContent = message;

  // Apply styles
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#333',
    color: '#fff',
    padding: '12px 20px',
    borderRadius: '8px',
    fontFamily: 'Segoe UI, sans-serif',
    fontSize: '14px',
    boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
    opacity: '0',
    zIndex: '9999',
    transition: 'opacity 0.3s ease',
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  // Animate out and remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}
// To disable the button
bargainBtn.disabled = true;
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
function displayMessage(message, isOptimistic = false) { // Added isOptimistic parameter
    if (message._id && displayedMessages.has(message._id)) {
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

    // Update state based on message type
    if (message.offerDetails && message.offerDetails.productId) {
        const productKey = message.offerDetails.productId;
        if (['accepted', 'completed'].includes(message.offerDetails.status)) {
            acceptedOffers.add(productKey);
            bargainingSessions.delete(`${productKey}-${message.senderId}`);
            endedBargains.add(productKey); // An accepted or completed offer also ends the bargain
        } else if (message.offerDetails.status === 'rejected' || message.messageType === 'end-bargain') {
            endedBargains.add(productKey);
            bargainingSessions.delete(`${productKey}-${message.senderId}`);
        }
    }
    if (message.messageType === 'counter-offer' && message.senderId === userId && message.offerDetails?.productId) {
        sentCounterOffers.add(message.offerDetails.productId);
    }
    saveBargainStates(); // Save states after processing each message

    if (message.metadata?.isSystemMessage) {
        let systemText = message.text;
        switch (message.messageType) {
            case 'accept-offer':
                systemText = `Offer for ${message.offerDetails.productName} at ₦${message.offerDetails.proposedPrice.toLocaleString('en-NG')} was accepted`;
                break;
            case 'reject-offer':
                systemText = `Offer for ${message.offerDetails.productName} was rejected`;
                break;
            case 'end-bargain':
                systemText = `Bargaining for ${message.offerDetails.productName} has ended`;
                break;
            case 'payment-completed':
                systemText = `Payment completed for ${message.offerDetails.productName}`;
                break;
        }
        chatMessages.appendChild(createSystemMessage(systemText));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Handle image messages
    if (message.messageType === 'image' || (message.attachment && message.attachment.type === 'image')) {
        const imageUrl = message.attachment?.url || message.content;
        if (imageUrl) {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
            msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`; // Temp ID for optimistic messages
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

    // Handle payment completed messages
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

    // Handle end bargain messages
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
        saveBargainStates();

        const endText = message.senderId === userId
            ? `This bargain for ${parsed.productName || 'Product'} was ended by you.`
            : `This bargain for ${parsed.productName || 'Product'} was ended by ${recipientUsername}.`;

        chatMessages.appendChild(createSystemMessage(endText));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    let msg = message.text, img = null, parsed = {};
    console.log('Processing message:', { messageType: message.messageType, text: message.text });
    if (['offer', 'counter-offer', 'buyerAccept', 'sellerAccept', 'sellerNotification'].includes(message.messageType)) {
        try {
            parsed = JSON.parse(message.text);
            msg = parsed.text || message.text;
            img = parsed.image || null;
            parsed.offer = parsed.offer || (message.offerDetails?.proposedPrice) || 0;
            parsed.productId = parsed.productId || (message.offerDetails?.productId) || '';
            parsed.productName = parsed.productName || (message.offerDetails?.productName) || 'Product';
            parsed.image = parsed.image || (message.offerDetails?.image) || '';
            console.log('Parsed special message:', parsed, 'Image:', img);
        } catch (e) {
            console.warn(`Failed to parse ${message.messageType} message text:`, message.text, e);
            msg = message.text;
            parsed = {
                offer: (message.offerDetails?.proposedPrice) || 0,
                productId: (message.offerDetails?.productId) || '',
                productName: (message.offerDetails?.productName) || 'Product',
                image: (message.offerDetails?.image) || ''
            };
        }
    } else if (message.messageType === 'text') {
        if (message.text.startsWith('{')) {
            try {
                parsed = JSON.parse(message.text);
                msg = parsed.text || message.text;
                img = parsed.image || null;
                console.log('Parsed text message:', parsed, 'Image:', img);
                if (img && !img.match(/^https?:\/\//)) {
                    console.warn('Invalid image URL, attempting to fix:', img);
                    img = img.startsWith('/') ? `${API_BASE_URL}${img}` : img;
                }
            } catch (e) {
                console.warn('Failed to parse text message as JSON:', message.text, e);
                msg = message.text;
                img = null;
            }
        } else {
            msg = message.text;
            img = null;
            console.log('Plain text message:', msg, 'Image:', img);
        }
    }

    // Determine if it's a new bargaining session start
    if (parsed?.offer && parsed.productId && !bargainingSessions.has(`${parsed.productId}-${message.senderId}`) && !endedBargains.has(parsed.productId) && !acceptedOffers.has(parsed.productId)) {
        bargainingSessions.add(`${parsed.productId}-${message.senderId}`);
        saveBargainStates();
        const startText = message.senderId === userId
            ? `You are bargaining for ${parsed.productName || 'Product'}.`
            : `${recipientUsername} is bargaining for ${parsed.productName || 'Product'}.`;
        chatMessages.appendChild(createSystemMessage(startText));
    }


    // Handle buyerAccept system message (buyer's side: accepted counter-offer)
    if (message.messageType === 'buyerAccept' && message.senderId === userId) {
        if (!parsed.productId || acceptedOffers.has(parsed.productId)) {
            // If already accepted or no product ID, don't re-display
            return;
        }

        const buyerDiv = createSystemMessage(`Your offer of ₦${Number(parsed.offer || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}" has been accepted.`);

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

        const checkPaymentStatus = async () => {
            const isPaid = await verifyPaymentStatus(parsed.productId, userId);
            if (isPaid) {
                paymentBtn.disabled = true;
                paymentBtn.textContent = 'Payment Completed';
                paymentBtn.style.backgroundColor = 'gray';
                paymentBtn.style.cursor = 'not-allowed';
            } else {
                paymentBtn.onclick = () => initiatePayment(parsed.productId, parsed.offer, parsed.productName, paymentBtn);
            }
        };
        checkPaymentStatus();

        buyerDiv.appendChild(paymentBtn);
        chatMessages.appendChild(buyerDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        acceptedOffers.add(parsed.productId);
        endedBargains.add(parsed.productId);
        bargainingSessions.delete(`${parsed.productId}-${message.senderId}`);
        saveBargainStates();
        return;
    }
    
    // Handle sellerAccept system message (seller's side: accepted buyer's offer)
    if (message.messageType === 'sellerAccept' && message.senderId === userId) {
        if (!parsed.productId || acceptedOffers.has(parsed.productId)) {
            return;
        }
        
        const sellerDiv = createSystemMessage(`You have accepted the offer of ₦${Number(parsed.offer || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}".`);
        
        if (parsed.image) {
            const imageContainer = document.createElement('div');
            imageContainer.style.margin = '10px 0';
            imageContainer.innerHTML = `
                <img src="${parsed.image}" class="product-photo-preview" alt="${parsed.productName || 'Product'}" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load product image.</p>
            `;
            sellerDiv.appendChild(imageContainer);
        }

        const waitingForPaymentBtn = document.createElement('button');
        waitingForPaymentBtn.className = 'waiting-for-payment-btn';
        waitingForPaymentBtn.textContent = 'Waiting for Payment';
        waitingForPaymentBtn.disabled = true; // Seller waits for buyer to pay
        waitingForPaymentBtn.style.backgroundColor = '#f0ad4e'; // A distinctive color for waiting
        waitingForPaymentBtn.style.cursor = 'not-allowed';

        sellerDiv.appendChild(waitingForPaymentBtn);
        chatMessages.appendChild(sellerDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        acceptedOffers.add(parsed.productId);
        endedBargains.add(parsed.productId);
        bargainingSessions.delete(`${parsed.productId}-${message.senderId}`);
        saveBargainStates();
        return;
    }

    // Handle sellerNotification system message (seller's side: buyer accepted seller's last price)
    if (message.messageType === 'sellerNotification' && message.receiverId === userId) {
        if (!parsed.productId || acceptedOffers.has(parsed.productId)) {
            return;
        }
        const sellerDiv = createSystemMessage(`Your last price of ₦${Number(parsed.offer || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}" has been accepted by ${recipientUsername}.`);

        if (parsed.image) {
            const imageContainer = document.createElement('div');
            imageContainer.style.margin = '10px 0';
            imageContainer.innerHTML = `
                <img src="${parsed.image}" class="product-photo-preview" alt="${parsed.productName || 'Product'}" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load product image.</p>
            `;
            sellerDiv.appendChild(imageContainer);
        }

        const awaitingPaymentBtn = document.createElement('button');
        awaitingPaymentBtn.className = 'awaiting-payment-btn';
        awaitingPaymentBtn.textContent = 'Awaiting Payment';
        awaitingPaymentBtn.disabled = true; // Seller waits for buyer to pay
        awaitingPaymentBtn.style.backgroundColor = '#f0ad4e'; // A distinctive color for waiting
        awaitingPaymentBtn.style.cursor = 'not-allowed';

        sellerDiv.appendChild(awaitingPaymentBtn);
        chatMessages.appendChild(sellerDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        acceptedOffers.add(parsed.productId);
        endedBargains.add(parsed.productId);
        bargainingSessions.delete(`${parsed.productId}-${message.senderId}`);
        saveBargainStates();
        return;
    }


    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`; // Temp ID for optimistic messages
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    if (message.messageType === 'counter-offer' && parsed.productId) {
        msgDiv.setAttribute('data-product-id', parsed.productId);
        msgDiv.setAttribute('data-message-type', 'counter-offer');
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

    // Case 1: Buyer receives an offer (first offer from seller, or buyer's original offer accepted by seller)
    // Only display accept/decline for buyer if it's an offer they haven't responded to, and the bargain isn't over.
    if (message.messageType === 'offer' && parsed.offer && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept Offer';
        acceptBtn.onclick = async () => {
            handleAcceptOffer(parsed, message.senderId);
        };
        msgDiv.appendChild(acceptBtn);

        const declineBtn = document.createElement('button');
        declineBtn.className = 'decline-offer-btn';
        declineBtn.textContent = 'Decline Offer';
        declineBtn.onclick = () => {
            openLastPriceModal(parsed.productId, parsed.productName, parsed.image);
        };
        msgDiv.appendChild(declineBtn);
    }
    
    // Case 2: Buyer receives a counter-offer from seller
    if (message.messageType === 'counter-offer' && parsed.offer && message.receiverId === userId && message.senderId === receiverId && !isOfferAccepted && !isBargainEnded) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept Last Price';
        acceptBtn.onclick = async () => {
            handleAcceptCounterOffer(parsed, message.senderId);
        };
        msgDiv.appendChild(acceptBtn);

        const endBargainBtn = document.createElement('button');
        endBargainBtn.className = 'end-bargain-btn';
        endBargainBtn.textContent = 'End Bargain';
        endBargainBtn.onclick = async () => {
            handleEndBargain(parsed, message.senderId);
        };
        msgDiv.appendChild(endBargainBtn);
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to handle accepting an initial offer from buyer (seller side)
async function handleAcceptOffer(parsedMessage, originalOfferSenderId) {
    const productDetails = {
        productId: parsedMessage.productId,
        productName: parsedMessage.productName,
        offer: Number(parsedMessage.offer), // This is the buyer's offer
        image: parsedMessage.image || productImage || ''
    };

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

            // 4. Send sellerAccept system message to current user (seller)
            const sellerAcceptMessage = {
                receiverId: userId, // Seller
                messageType: 'sellerAccept',
                text: JSON.stringify({
                    text: `You have accepted the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}".`,
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

            // 5. Send buyerNotification system message to the buyer
            const buyerNotificationMessage = {
                receiverId: originalOfferSenderId, // Buyer
                messageType: 'buyerAccept', // This is what the buyer sees as "your offer accepted"
                text: JSON.stringify({
                    text: `Your offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}" has been accepted.`,
                    productName: productDetails.productName,
                    productId: productDetails.productId,
                    offer: productDetails.offer,
                    image: productDetails.image,
                    buyerName: recipientUsername // This is the buyer's username in the context of the seller
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

            // Optimistic display for seller
            const optimisticSellerAccept = { ...sellerAcceptMessage, senderId: userId, status: 'sent' };
            displayMessage(optimisticSellerAccept, true);

            // Send sellerAccept message via HTTP
            const sellerAcceptResponse = await fetch(`${API_BASE_URL}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(sellerAcceptMessage)
            });
            const sellerAcceptData = await sellerAcceptResponse.json();
            if (!sellerAcceptResponse.ok) throw new Error(sellerAcceptData.error || `HTTP error ${sellerAcceptResponse.status}`);
            updateOptimisticMessageId(sellerAcceptData.data?._id);


            // Send buyerNotification message via HTTP
            const buyerNotificationResponse = await fetch(`${API_BASE_URL}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(buyerNotificationMessage)
            });
            const buyerNotificationData = await buyerNotificationResponse.json();
            if (!buyerNotificationResponse.ok) throw new Error(buyerNotificationData.error || `HTTP error ${buyerNotificationResponse.status}`);

            acceptModal.style.display = 'none';
            showToast('Offer accepted successfully!', 'success');

        } catch (error) {
            console.error('Failed to accept offer:', error);
            showToast(`Failed to accept offer: ${error.message}`, 'error');
            acceptModal.style.display = 'none';
            removeOptimisticMessage(); // Remove optimistic message on error
        }
    };
    document.getElementById('cancelAcceptBtn').onclick = () => {
        acceptModal.style.display = 'none';
    };
}


// Function to handle accepting a counter-offer (buyer side)
async function handleAcceptCounterOffer(parsedMessage, counterOfferSenderId) {
    const productDetails = {
        productId: parsedMessage.productId,
        productName: parsedMessage.productName,
        offer: Number(parsedMessage.offer), // This is the seller's counter-offer
        image: parsedMessage.image || productImage || ''
    };

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
                receiverId: userId, // Buyer
                messageType: 'buyerAccept',
                text: JSON.stringify({
                    text: `You have accepted the last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}".`,
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

            // 5. Send sellerNotification system message to the seller
            const sellerNotificationMessage = {
                receiverId: counterOfferSenderId, // Seller
                messageType: 'sellerNotification',
                text: JSON.stringify({
                    text: `Your last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}" has been accepted by ${recipientUsername}.`,
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

            // Optimistic display for buyer
            const optimisticBuyerAccept = { ...buyerAcceptMessage, senderId: userId, status: 'sent' };
            displayMessage(optimisticBuyerAccept, true);

            // Send buyerAccept message via HTTP
            const buyerAcceptResponse = await fetch(`${API_BASE_URL}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(buyerAcceptMessage)
            });
            const buyerAcceptData = await buyerAcceptResponse.json();
            if (!buyerAcceptResponse.ok) throw new Error(buyerAcceptData.error || `HTTP error ${buyerAcceptResponse.status}`);
            updateOptimisticMessageId(buyerAcceptData.data?._id);

            // Send sellerNotification message via HTTP
            const sellerNotificationResponse = await fetch(`${API_BASE_URL}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(sellerNotificationMessage)
            });
            const sellerNotificationData = await sellerNotificationResponse.json();
            if (!sellerNotificationResponse.ok) throw new Error(sellerNotificationData.error || `HTTP error ${sellerNotificationResponse.status}`);

            acceptModal.style.display = 'none';
            showToast('Last price accepted successfully!', 'success');

        } catch (error) {
            console.error('Failed to accept counter-offer:', error);
            showToast(`Failed to accept last price: ${error.message}`, 'error');
            acceptModal.style.display = 'none';
            removeOptimisticMessage(); // Remove optimistic message on error
        }
    };
    document.getElementById('cancelAcceptBtn').onclick = () => {
        acceptModal.style.display = 'none';
    };
}


// Function to handle ending a bargain
async function handleEndBargain(parsedMessage, bargainInitiatorId) {
    const productDetails = {
        productId: parsedMessage.productId,
        productName: parsedMessage.productName
    };

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
            receiverId: bargainInitiatorId,
            messageType: 'end-bargain',
            text: JSON.stringify({
                productId: productDetails.productId,
                productName: productDetails.productName
            }),
            offerDetails: {
                productId: parsedMessage.productId,
                productName: parsedMessage.productName,
                status: 'rejected' // Or 'ended' as a more general status
            },
            createdAt: new Date(),
            isRead: false
        };

        // Optimistic display for current user
        const optimisticEnd = { ...endBargainMessage, senderId: userId, status: 'sent' };
        displayMessage(optimisticEnd, true);

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
    submitLastPriceBtn.onclick = async () => {
        const lastPrice = lastPriceInput.value.trim().replace(/,/g, '');
        if (lastPrice && !isNaN(lastPrice) && Number(lastPrice) > 0) {
            const message = {
                receiverId: receiverId, // Buyer is the receiver
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
                        text: JSON.stringify({
                            text: `My offer for "${product.title}" is ₦${Number(price).toLocaleString('en-NG')}`, // Use title
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
    if (!((message.senderId === userId && message.receiverId === receiverId) ||
          (message.senderId === receiverId && message.receiverId === userId))) {
        return;
    }

    // Special handling for system messages that are explicitly for one party
    if (message.messageType === 'buyerAccept' && message.receiverId !== userId) {
        // This buyerAccept message is intended for the buyer, but the current user is the seller.
        // It's already handled as a sellerNotification on the seller's side.
        // So, we prevent redundant display.
        return;
    }
    if (message.messageType === 'sellerAccept' && message.receiverId !== userId) {
        // This sellerAccept message is intended for the seller, but the current user is the buyer.
        // It's already handled as a buyerAccept on the buyer's side.
        return;
    }
     if (message.messageType === 'sellerNotification' && message.receiverId !== userId) {
        // This sellerNotification message is intended for the seller, but the current user is the buyer.
        // It's already handled as a buyerAccept on the buyer's side.
        return;
    }


    displayMessage(message);

    if (message.receiverId === userId && message.status !== 'seen') {
        socket.emit('markAsSeen', {
            messageIds: [message._id],
            senderId: message.senderId,
            receiverId: userId
        });
    }

    showToast(`New message from ${recipientUsername}`, 'success');

    // Store in localStorage as a fallback
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) { // Prevent duplicates
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
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
    }
});

// Handle new message notifications
socket.on('newMessageNotification', (notification) => {
    console.log('Received new message notification:', notification);
    // Only show toast if not already in the active chat
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
                console.warn(`Skipping message with no text at index ${index}:`, msg);
                return false;
            }
            if (['offer', 'counter-offer', 'buyerAccept', 'sellerAccept', 'sellerNotification', 'end-bargain'].includes(msg.messageType)) {
                try {
                    // Try parsing, if it fails, replace text with empty string to avoid error
                    // or ensure it's handled gracefully
                    JSON.parse(msg.text);
                    return true;
                } catch (e) {
                    console.warn(`Invalid JSON text in message at index ${index} (${msg.messageType}):`, msg.text);
                    // Decide how to handle: either skip, or set a default text
                    // For now, let's allow it but the displayMessage function will handle the malformed JSON.
                    return true;
                }
            }
            return true;
        });


        // Check if initial message was sent
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

        // Render product preview if initial message not sent
        renderProductPreview();

        lastDisplayedDate = null;
        validMessages.forEach(displayMessage);
        // Update localStorage with fetched messages
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(validMessages));
    } catch (error) {
        console.error('Error loading chat history:', error);
        showToast(`Failed to load messages: ${error.message}`, 'error');
        // Fallback to localStorage
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        storedMessages.forEach(displayMessage);
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
        if (messageIds.includes(timestamp.dataset.messageId)) {
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
