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
const offerButtons = new Map(); // Key: productId, Value: { acceptBtn, declineBtn, proceedToPaymentBtn }

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
        btn.className = 'system-message-button'; // New class for system message buttons
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

    if (message.offerDetails && message.offerDetails.productId) {
        if (['accepted', 'rejected', 'completed'].includes(message.offerDetails.status)) {
            acceptedOffers.add(message.offerDetails.productId);
            bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
            if (message.offerDetails.status === 'rejected' || message.offerDetails.status === 'completed') {
                endedBargains.add(message.offerDetails.productId);
            }
        }
    }

    if (message.metadata?.isSystemMessage) {
        let systemText = message.text;
        let productPhoto = null;
        let buttonDetails = null;

        if (message.messageType === 'sellerCounterAccepted' && message.receiverId === userId) {
            // Seller's view when buyer accepts their counter offer
            const parsed = message.offerDetails || {};
            systemText = `You last price was accepted.`;
            productPhoto = parsed.image || ''; // Product photo for system message
            buttonDetails = {
                text: 'Waiting for payment',
                disabled: true
            };
        } else if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
             // Seller's view when seller accepts initial offer
            const parsed = message.offerDetails || {};
            systemText = `You have accepted the offer of ₦${Number(parsed.proposedPrice || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}".`;
            productPhoto = parsed.image || '';
            buttonDetails = {
                text: 'Waiting for payment',
                disabled: true
            };
        } else {
            switch (message.messageType) {
                case 'accept-offer':
                    systemText = `Offer for ${message.offerDetails.productName} at ₦${message.offerDetails.proposedPrice.toLocaleString('en-NG')} was accepted`;
                    break;
                case 'reject-offer':
                    systemText = `Offer for ${message.offerDetails.productName} was rejected`;
                    endedBargains.add(message.offerDetails.productId);
                    bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
                    break;
                case 'end-bargain':
                    systemText = `Bargaining for ${message.offerDetails.productName} has ended`;
                    endedBargains.add(message.offerDetails.productId);
                    bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
                    break;
                case 'payment-completed':
                    systemText = `Payment completed for ${message.offerDetails.productName}`;
                    break;
            }
        }
        chatMessages.appendChild(createSystemMessage(systemText, message.offerDetails?.productId, productPhoto, buttonDetails));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Existing handling for image messages, payment completed with receipt etc.
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
        let parsed;
        try {
            parsed = JSON.parse(message.text);
        } catch (e) {
            console.warn('Failed to parse buyerAccept message text:', message.text, e);
            parsed = {};
        }
        // This is the message for the buyer
        const buyerDiv = createSystemMessage(`Your offer for "${parsed.productName || 'Product'}" has been accepted.`);

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

        // Store reference to this button for real-time updates
        offerButtons.set(parsed.productId, { ...offerButtons.get(parsed.productId), proceedToPaymentBtn: paymentBtn });

        const verifyPayment = async () => {
            try {
                const token = localStorage.getItem('authToken');
                if (!token) {
                    showToast('Please log in to verify payment', 'error');
                    return false;
                }
                const response = await fetch(`${API_BASE_URL}/payment-success?productId=${parsed.productId}&buyerId=${userId}&format=json`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Server error' }));
                    showToast(`Payment verification failed: ${errorData.error || 'Server error'}`, 'error');
                    return false;
                }
                const result = await response.json();
                if (result.paymentCompleted) {
                    paymentBtn.disabled = true;
                    paymentBtn.textContent = 'Payment Completed';
                    paymentBtn.style.backgroundColor = 'gray';
                    paymentBtn.style.cursor = 'not-allowed';
                    return true;
                }
                return false;
            } catch (error) {
                showToast('Error verifying payment. Please try again.', 'error');
                return false;
            }
        };

        verifyPayment().then(isPaid => {
            if (!isPaid) {
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
            }
        });

        buyerDiv.appendChild(paymentBtn);
        chatMessages.appendChild(buyerDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
        // This block is for the seller to see when THEY accept an initial offer.
        let parsed;
        try {
            parsed = message.offerDetails || JSON.parse(message.text);
        } catch (e) {
            console.warn('Failed to parse sellerAccept message:', message, e);
            parsed = {};
        }

        const sellerAcceptText = `You have accepted the offer of ₦${Number(parsed.proposedPrice || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}".`;
        const productPhoto = parsed.image || ''; // Assuming product photo is in offerDetails

        // Button for seller
        const buttonDetails = {
            text: 'Waiting for payment',
            disabled: true
        };

        chatMessages.appendChild(createSystemMessage(sellerAcceptText, parsed.productId, productPhoto, buttonDetails));
        acceptedOffers.add(parsed.productId);
        bargainingSessions.delete(`${parsed.productId}-${message.senderId}`);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }


    let msg = message.text, img = null, parsed = {};
    console.log('Processing message:', { messageType: message.messageType, text: message.text });
    if (['offer', 'counter-offer', 'buyerAccept', 'sellerAccept', 'sellerCounterAccepted'].includes(message.messageType)) { // Added sellerCounterAccepted
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

    if (message.messageType === 'counter-offer' && message.senderId === userId && parsed.productId) {
        sentCounterOffers.add(parsed.productId);
        console.log(`Added to sentCounterOffers: ${parsed.productId}`, sentCounterOffers);
    }

    if (parsed?.offer && !bargainingSessions.has(`${parsed.productId}-${message.senderId}`) && !endedBargains.has(parsed.productId)) {
        bargainingSessions.add(`${parsed.productId}-${message.senderId}`);
        const startText = message.senderId === userId
            ? `You are bargaining for ${parsed.productName || 'Product'}`
            : `${recipientUsername} is bargaining for ${parsed.productName || 'Product'}`;
        chatMessages.appendChild(createSystemMessage(startText));
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

    if (message.messageType === 'offer' && parsed.offer && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId !== userId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        
        // Store reference to the accept button
        if(parsed.productId) offerButtons.set(parsed.productId, { ...offerButtons.get(parsed.productId), acceptBtn: acceptBtn });

        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                offer: Number(parsed.offer),
                senderId: message.senderId // This is the buyer who sent the initial offer
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

                    // Seller sends message to themselves (system message)
                    const sellerAcceptMessage = {
                        receiverId: userId, // Seller (current user)
                        messageType: 'sellerAccept', // New type for seller's acceptance confirmation
                        metadata: { isSystemMessage: true }, // Mark as system message
                        text: JSON.stringify({
                            text: `You have accepted the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${parsed.productName}".`,
                            productName: parsed.productName,
                            productId: productDetails.productId,
                            proposedPrice: productDetails.offer,
                            image: parsed.image || productImage || '' // Include product image
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

                    // Seller sends message to buyer (offer accepted message)
                    const buyerAcceptMessage = {
                        receiverId: message.senderId, // Buyer
                        messageType: 'buyerAccept',
                        text: JSON.stringify({
                            text: `Your offer for "${parsed.productName}" has been accepted.`,
                            productName: parsed.productName,
                            productId: productDetails.productId,
                            offer: productDetails.offer,
                            buyerName: localStorage.getItem('username') || 'Buyer',
                            image: parsed.image || productImage || '' // Include product image
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


                    // Optimistic display for seller
                    const optimisticSellerAccept = { ...sellerAcceptMessage, senderId: userId, status: 'sent', _id: `temp_${Date.now()}_seller_accept` };
                    displayMessage(optimisticSellerAccept, true);

                    // Send buyerAccept message
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
                    // No need to update lastSent for optimisticSellerAccept as it's a system message.
                    // The actual message for buyer will be handled by the backend.

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
        // Store reference to the decline button
        if(parsed.productId) offerButtons.set(parsed.productId, { ...offerButtons.get(parsed.productId), declineBtn: declineBtn });

        declineBtn.onclick = () => {
            openLastPriceModal(parsed.productId, parsed.productName, parsed.image || productImage); // Pass product image
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(declineBtn);
    }

    if (message.messageType === 'counter-offer' && parsed.offer && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId === receiverId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
         // Store reference to the accept button
        if(parsed.productId) offerButtons.set(parsed.productId, { ...offerButtons.get(parsed.productId), acceptBtn: acceptBtn });

        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                offer: Number(parsed.offer),
                senderId: message.senderId // This is the seller who sent the counter-offer
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

                    // Buyer sends message to themselves (offer accepted)
                    const buyerAcceptMessage = {
                        receiverId: userId, // Buyer (current user)
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

                    // Buyer sends notification to seller (sellerCounterAccepted)
                    const sellerNotificationMessage = {
                        receiverId: message.senderId, // Seller
                        messageType: 'sellerCounterAccepted', // New type for seller notification when buyer accepts counter-offer
                        metadata: { isSystemMessage: true }, // Mark as system message
                        text: JSON.stringify({
                            text: `Your last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${parsed.productName}" was accepted by ${recipientUsername}.`,
                            productName: parsed.productName,
                            productId: productDetails.productId,
                            proposedPrice: productDetails.offer,
                            image: parsed.image || productImage || '' // Include product image
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

                    // Optimistic display for buyer
                    const optimisticBuyerAccept = { ...buyerAcceptMessage, senderId: userId, status: 'sent', _id: `temp_${Date.now()}_buyer_accept` };
                    displayMessage(optimisticBuyerAccept, true);


                    // Send buyerAccept message
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


                    // Send sellerNotification message
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
                    receiverId: message.senderId,
                    messageType: 'end-bargain',
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
                const optimisticEnd = { ...endBargainMessage, senderId: userId, status: 'sent' };
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
                const lastSent = chatMessages.querySelector('.message.sent:last-child');
                if (lastSent && endData.data?._id) {
                    lastSent.dataset.messageId = endData.data._id;
                    displayedMessages.add(endData.data._id);
                }

                showToast('Bargain ended successfully!', 'success');
            } catch (error) {
                console.error('Failed to end bargain:', error);
                showToast(`Failed to end bargain: ${error.message}`, 'error');
                const lastSent = chatMessages.querySelector('.message.sent:last-child');
                if (lastSent) lastSent.remove();
            }
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(endBargainBtn);
    }

    // This block handles the payment button for the buyer, regardless of whether it's an initial offer or counter-offer accepted.
    // It should specifically trigger when a buyer receives a 'buyerAccept' message.
    // The previous logic for `parsed.payment && message.receiverId === userId` seems to be intended for this,
    // but the `buyerAccept` message is explicitly handled at the beginning of `displayMessage` function.
    // We'll rely on the `buyerAccept` block for the button and its `verifyPayment` logic.

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Format number with thousands separators
function formatNumberWithCommas(number) {
    if (typeof number !== 'number' && typeof number !== 'string') return '';
    const num = parseFloat(String(number).replace(/,/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

// Add thousands separators to lastPriceInput
lastPriceInput.addEventListener('input', (e) => {
    const input = e.target;
    const cursorPosition = input.selectionStart;
    let value = input.value.replace(/[^0-9]/g, '');
    if (value) {
        const formattedValue = formatNumberWithCommas(value);
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


// Open modal for seller to send a counteroffer
function openLastPriceModal(productId, productName, productImage) {
    lastPriceModal.style.display = 'block';
    submitLastPriceBtn.onclick = async () => { // Changed to async
        const lastPrice = lastPriceInput.value.trim().replace(/,/g, ''); // Remove commas
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
                const lastSent = chatMessages.querySelector('.message.sent:last-child');
                if (lastSent && data.data?._id) {
                    lastSent.dataset.messageId = data.data._id;
                    displayedMessages.add(data.data._id);
                }
                console.log('Last price sent:', data);
                closeLastPriceModal();
            } catch (error) {
                console.error('Error sending last price:', error);
                showToast(`Failed to send last price: ${error.message}`, 'error');
                const lastSent = chatMessages.querySelector('.message.sent:last-child');
                if (lastSent) lastSent.remove();
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
            container.innerHTML = '<p>No products available.</p>';
            return;
        }

        data.products.forEach(product => {
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

            // Apply thousands separators to bargain price input
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
                    const formattedValue = formatNumberWithCommas(value);
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
                let price = priceInput.value.replace(/,/g, ''); // Remove commas before sending
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
                        const lastSent = chatMessages.querySelector('.message.sent:last-child');
                        if (lastSent && data.data?._id) {
                            lastSent.dataset.messageId = data.data._id;
                            displayedMessages.add(data.data._id);
                        }
                        console.log('Offer sent:', data);
                        closeBargainModal();
                    } catch (error) {
                        console.error('Error sending offer:', error);
                        showToast(`Failed to send offer: ${error.message}`, 'error');
                        const lastSent = chatMessages.querySelector('.message.sent:last-child');
                        if (lastSent) lastSent.remove();
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

    // Normalize text and predefinedMessage to handle newlines and whitespace
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const normalizedPredefined = predefinedMessage.replace(/\s+/g, ' ').trim();
    const isInitialMessage = !isInitialMessageSent && predefinedMessage && productImage;

    console.log('Message comparison:', {
        inputText: text,
        normalizedText,
        predefinedMessage: predefinedMessage,
        normalizedPredefined,
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
        const lastSent = chatMessages.querySelector('.message.sent:last-child');
        if (lastSent && data.data?._id) {
            lastSent.dataset.messageId = data.data._id;
            displayedMessages.add(data.data._id);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showToast(`Failed to send message: ${error.message}`, 'error');
        const lastSent = chatMessages.querySelector('.message.sent:last-child');
        if (lastSent) lastSent.remove();
    }
};

// Handle incoming messages
socket.on('newMessage', message => {
    // Ensure message is relevant to the current chat
    if (!((message.senderId === userId && message.receiverId === receiverId) ||
          (message.senderId === receiverId && message.receiverId === userId))) {
        return;
    }

    // Explicitly check for system message types for display
    if (message.messageType === 'sellerCounterAccepted' || message.messageType === 'sellerAccept') {
        // These are handled as system messages and should be displayed as such for the receiver
        displayMessage(message);
    } else if (message.messageType === 'buyerAccept') {
        // Only display for the buyer (receiver of the buyerAccept message)
        if (message.receiverId === userId) {
            displayMessage(message);
        } else {
            console.log('Skipping buyerAccept message for non-buyer:', {
                productId: message.offerDetails?.productId,
                userId,
                receiverId: message.receiverId
            });
            return;
        }
    } else {
        // Default display for other message types
        displayMessage(message);
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

    // Store in localStorage as a fallback
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    if (!storedMessages.some(msg => msg._id === message._id)) { // Prevent duplicates from optimistic updates
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    }
});

// New Socket.IO event for real-time payment status updates
socket.on('paymentStatusUpdate', (data) => {
    console.log('Received paymentStatusUpdate:', data);
    if (data.productId && (data.buyerId === userId || data.sellerId === userId)) { // Check if relevant to current user
        const productRelatedButtons = offerButtons.get(data.productId);

        if (productRelatedButtons) {
            // Update seller's "Waiting for payment" button
            if (productRelatedButtons.systemButton) {
                if (data.status === 'completed') {
                    productRelatedButtons.systemButton.textContent = 'Payment Completed';
                    productRelatedButtons.systemButton.disabled = true;
                    productRelatedButtons.systemButton.style.backgroundColor = 'gray';
                    productRelatedButtons.systemButton.style.cursor = 'not-allowed';
                    showToast('Payment confirmed!', 'success');
                } else if (data.status === 'failed') {
                     // Optionally handle failed payments for seller
                    productRelatedButtons.systemButton.textContent = 'Payment Failed';
                    productRelatedButtons.systemButton.style.backgroundColor = 'red';
                    productRelatedButtons.systemButton.style.cursor = 'not-allowed';
                    showToast('Payment failed. Please contact the buyer.', 'error');
                }
            }
            // Update buyer's "Proceed to Payment" button
            if (productRelatedButtons.proceedToPaymentBtn) {
                if (data.status === 'completed') {
                    productRelatedButtons.proceedToPaymentBtn.textContent = 'Payment Completed';
                    productRelatedButtons.proceedToPaymentBtn.disabled = true;
                    productRelatedButtons.proceedToPaymentBtn.style.backgroundColor = 'gray';
                    productRelatedButtons.proceedToPaymentBtn.style.cursor = 'not-allowed';
                } else if (data.status === 'failed') {
                    productRelatedButtons.proceedToPaymentBtn.textContent = 'Payment Failed';
                    productRelatedButtons.proceedToPaymentBtn.disabled = false; // Allow retry
                    productRelatedButtons.proceedToPaymentBtn.style.backgroundColor = 'red';
                }
            }
        }
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
    showToast(`New message from ${notification.senderName}: ${notification.text}`, 'success');
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
            if (!msg || typeof msg !== 'object' || !msg.text || !msg.messageType) {
                console.warn(`Skipping invalid message at index ${index}:`, msg);
                return false;
            }
            if (['offer', 'counter-offer', 'buyerAccept', 'sellerAccept', 'sellerCounterAccepted', 'end-bargain'].includes(msg.messageType)) {
                try {
                    JSON.parse(msg.text);
                    return true;
                } catch (e) {
                    console.warn(`Invalid JSON text in message at index ${index}:`, msg.text);
                    // Attempt to parse text if it's not valid JSON, treat it as plain text content for now
                    msg.text = JSON.stringify({ text: msg.text }); // Wrap in JSON for consistency
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
