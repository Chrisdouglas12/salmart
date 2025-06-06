// ui.js
let lastDisplayedDate = null;

// Helper: create a persistent system message div
function createSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    div.style.textAlign = 'center';
    return div;
}

// Helper: Format message date
function formatMessageDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-NG', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Helper: Store message in localStorage
function storeMessage(message) {
    const storageKey = `chat_${userId}_${receiverId}`;
    let storedMessages = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    // Avoid duplicates by checking _id
    if (message._id && storedMessages.some(msg => msg._id === message._id)) {
        return;
    }
    
    // Ensure message has necessary fields
    const messageToStore = {
        ...message,
        _id: message._id || `temp_${Date.now()}`,
        createdAt: message.createdAt || new Date().toISOString(),
        messageType: message.messageType || 'text',
        senderId: message.senderId || userId,
        receiverId: message.receiverId || receiverId,
        isRead: message.isRead || false,
        status: message.status || 'sent',
        offerDetails: message.offerDetails || null,
        metadata: message.metadata || null,
        text: message.text || ''
    };
    
    storedMessages.push(messageToStore);
    localStorage.setItem(storageKey, JSON.stringify(storedMessages));
}

// Helper: Load and display stored messages
async function loadStoredMessages() {
    const storageKey = `chat_${userId}_${receiverId}`;
    let storedMessages = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    // Optionally fetch from server to sync
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            const response = await fetch(`${API_BASE_URL}/messages?receiverId=${receiverId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const serverMessages = await response.json();
                storedMessages = serverMessages.data || storedMessages;
                localStorage.setItem(storageKey, JSON.stringify(storedMessages));
            }
        }
    } catch (error) {
        console.error('Error fetching server messages:', error);
    }
    
    // Sort messages by createdAt
    storedMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    // Display messages
    storedMessages.forEach(message => {
        if (!displayedMessages.has(message._id)) {
            displayMessage(message);
        }
    });
}

// Ensure your socket is initialized and connected somewhere
// Example: const socket = io('http://your-server-url');

// Initialize chat on page load
document.addEventListener('DOMContentLoaded', () => {
    loadStoredMessages();
});

// --- NEW: Socket Listener for incoming messages ---
socket.on('message', (newMessage) => {
    console.log('New message received via socket:', newMessage);
    storeMessage(newMessage); // Store incoming message
    displayMessage(newMessage);
});

// --- NEW: Socket Listener for real-time payment completion ---
socket.on('payment-completed', (data) => {
    console.log('Payment completed event received:', data);
    if (data.productId) {
        // For the seller's view: update the "Waiting for Payment" button
        const sellerPaymentButton = document.querySelector(`.waiting-for-payment-btn[data-product-id="${data.productId}"]`);
        if (sellerPaymentButton) {
            sellerPaymentButton.textContent = 'Payment Completed';
            sellerPaymentButton.disabled = true;
            sellerPaymentButton.style.backgroundColor = 'green';
            sellerPaymentButton.style.cursor = 'not-allowed';
            showToast(`Payment completed for ${data.productName || 'product'}!`, 'success');
        }

        // For the buyer's view: update the "Proceed to Payment" button
        const buyerPaymentButton = document.querySelector(`.proceed-to-payment-btn[data-product-id="${data.productId}"]`);
        if (buyerPaymentButton) {
            buyerPaymentButton.textContent = 'Payment Completed';
            buyerPaymentButton.disabled = true;
            buyerPaymentButton.style.backgroundColor = 'green';
            buyerPaymentButton.style.cursor = 'not-allowed';
            showToast(`Your payment for ${data.productName || 'product'} is complete!`, 'success');
        }

        // Create and store system message for payment completion
        const paymentMessage = {
            _id: `payment_${data.productId}_${Date.now()}`,
            metadata: { isSystemMessage: true },
            messageType: 'payment-completed',
            offerDetails: {
                productId: data.productId,
                productName: data.productName,
                image: data.image
            },
            createdAt: new Date().toISOString(),
            isRead: true,
            senderId: null, // System-generated
            receiverId: userId
        };
        storeMessage(paymentMessage);
        displayMessage(paymentMessage);
    }
});

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

    // Always add date separator if date changes
    if (formattedDate !== lastDisplayedDate) {
        const dateMessage = {
            _id: `date_${formattedDate}_${Date.now()}`,
            metadata: { isSystemMessage: true },
            messageType: 'date-separator',
            text: formattedDate,
            createdAt: message.createdAt,
            senderId: null,
            receiverId: userId
        };
        storeMessage(dateMessage);
        chatMessages.appendChild(createSystemMessage(formattedDate));
        lastDisplayedDate = formattedDate;
    }

    // Update acceptedOffers and endedBargains sets for state management
    if (message.offerDetails && message.offerDetails.productId) {
        if (['accepted', 'rejected', 'completed'].includes(message.offerDetails.status)) {
            acceptedOffers.add(message.offerDetails.productId);
            bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
            if (message.offerDetails.status === 'rejected' || message.offerDetails.status === 'completed') {
                endedBargains.add(message.offerDetails.productId);
            }
        }
    }

    // --- Handle System Messages (persist and center) ---
    if (message.metadata?.isSystemMessage) {
        let systemText = message.text;
        switch (message.messageType) {
            case 'accept-offer':
                systemText = `Offer for ${message.offerDetails.productName} at ₦${message.offerDetails.proposedPrice.toLocaleString('en-NG')} was accepted.`;
                break;
            case 'reject-offer':
                systemText = `Offer for ${message.offerDetails.productName} was rejected.`;
                endedBargains.add(message.offerDetails.productId);
                bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
                break;
            case 'end-bargain':
                systemText = message.offerDetails?.productName
                    ? `Bargaining for "${message.offerDetails.productName}" has ended.`
                    : `A bargaining session has ended.`;
                endedBargains.add(message.offerDetails.productId);
                bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
                break;
            case 'payment-completed':
                systemText = `Payment completed for "${message.offerDetails.productName || 'product'}".`;
                break;
            case 'date-separator':
                systemText = message.text; // Use formatted date
                break;
        }
        chatMessages.appendChild(createSystemMessage(systemText));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Handle image messages
    if (message.messageType === 'image' || (message.image && message.image.type === 'image')) {
        const imageUrl = message.image?.url || message.content;
        if (imageUrl) {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message', message.senderId);
            msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
            const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            msgDiv.innerHTML = `
                ${message.text ? `<div>${message.text}</div>` : ''}
                <img src="${imageUrl}" class="product-photo-preview" alt="Receipt" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load image.</p>
                <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔' : isOptimistic ? '' : '✔'}</div>
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }
    }

    // Handle payment completed messages (for receipt/image type messages)
    if (message.messageType === 'payment-computed' && message.image?.type === 'image') {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', message.senderId);
        msgDiv.dataset.messageId = message._id || message.content;
        const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        msgDiv.innerHTML = `
            <div>Payment completed for ${message.offerDetails?.productName || 'Product'}</div>
            <img src="${message.image.url}" class="product-photo-preview" alt="Receipt" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextSibling.style.display='block';">
            <p style="display:none;color:red;">Failed to load receipt image.</p>
            <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Handle end bargain messages (from sender, displayed as a system message for both)
    if (message.messageType === 'endBargain' || message.messageType === 'end-bargain') {
        let parsed;
        try {
            parsed = message.offerDetails || JSON.parse(message.text);
        } catch (e) {
            console.warn('Failed to parse end-bargain message text:', message.text, e);
            parsed = message.offerDetails || {};
        }
        endedBargains.add(parsed.productId);
        bargainingSessions.delete(`${parsed.productId}-${parsed.senderId}`);

        const endText = message.senderId === userId
            ? `You have ended the bargain for "${parsed.productName || 'Product'}".`
            : `${recipientUsername} has ended the bargain offer for "${parsed.productName || 'Product'}".`;

        const systemMessage = {
            _id: `endBargain_${parsed.productId}_${Date.now()}`,
            metadata: { isSystemMessage: true },
            messageType: 'end-bargain',
            text: endText,
            offerDetails: parsed,
            createdAt: message.createdAt,
            senderId: null,
            receiverId: userId
        };
        storeMessage(systemMessage);
        chatMessages.appendChild(createSystemMessage(endText));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // --- CRUCIAL: Handle buyerAccept messages (only for the BUYER - userId) ---
    // This is the message the buyer sees after an offer/counter-offer is accepted by the seller.
    if (message.messageType === 'buyerAccept' && message.receiverId === userId) {
        let parsed;
        try {
            parsed = message.offerDetails || JSON.parse(message.text);
        } catch (e) {
            console.warn('Failed to parse buyerAccept message text:', message.text, e);
            parsed = {};
        }

        let systemMessageText;
        if (parsed.isCounterOffer) {
            systemMessageText = `You have accepted the last price of ₦${Number(parsed.proposedPrice || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}".`;
        } else {
            systemMessageText = `Your offer of ₦${Number(parsed.proposedPrice || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}" was accepted.`;
        }

        const buyerDiv = createSystemMessage(systemMessageText); // Use system message for buyer's acceptance confirmation

        if (parsed.image) {
            const imageContainer = document.createElement('div');
            imageContainer.style.margin = '10px auto'; // Center image
            imageContainer.style.textAlign = 'center';
            imageContainer.innerHTML = `
                <img src="${parsed.image}" class="product-photo-preview" alt="${parsed.productName || 'Product'}" style="max-width: 200px; border-radius: 5px; display: block; margin: 0 auto;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load product image.</p>
            `;
            buyerDiv.appendChild(imageContainer);
        }

        const paymentBtn = document.createElement('button');
        paymentBtn.className = 'proceed-to-payment-btn';
        paymentBtn.textContent = 'Proceed to Payment';
        paymentBtn.dataset.productId = parsed.productId;
        paymentBtn.style.display = 'block';
        paymentBtn.style.margin = '10px auto';

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
                    paymentBtn.textContent = 'Payment Completed';
                    paymentBtn.disabled = true;
                    paymentBtn.style.backgroundColor = 'green';
                    paymentBtn.style.cursor = 'not-allowed';
                    return true;
                }
                return false;
            } catch (error) {
                showToast('Error verifying payment:', error);
                return false;
            }
        };

        await verifyPayment().then(isPaid => {
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

        // Store buyerAccept system message
        const buyerAcceptSystemMessage = {
            _id: `buyerAccept_${parsed.productId}_${Date.now()}`,
            metadata: { isSystemMessage: true },
            messageType: 'buyerAccept',
            text: systemMessageText,
            offerDetails: parsed,
            createdAt: message.createdAt,
            senderId: null,
            receiverId: userId
        };
        storeMessage(buyerAcceptSystemMessage);
        return;
    }

    // --- CRUCIAL: Handle sellerAccept messages (only for the SELLER - userId) ---
    // This is the message the seller sees after they accept an offer or their counter-offer is accepted.
    if (message.messageType === 'sellerAccept' && message.receiverId === userId) {
        let parsed;
        try {
            parsed = message.offerDetails || JSON.parse(message.text);
        } catch (e) {
            console.warn('Failed to parse sellerAccept message:', message, e);
            parsed = {};
        }

        let sellerAcceptText;
        if (parsed.isCounterOffer) {
            sellerAcceptText = `Your last price of ₦${Number(parsed.proposedPrice || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}" has been accepted.`;
        } else {
            sellerAcceptText = `You have accepted the offer of ₦${Number(parsed.proposedPrice || 0).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}".`;
        }

        const sellerAcceptDiv = createSystemMessage(sellerAcceptText);

        if (parsed.image) {
            const imageContainer = document.createElement('div');
            imageContainer.style.margin = '10px auto';
            imageContainer.style.textAlign = 'center';
            imageContainer.innerHTML = `
                <img src="${parsed.image}" class="product-photo-preview" alt="${parsed.productName || 'Product'}" style="max-width: 200px; border-radius: 5px; display: block; margin: 0 auto;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load product image.</p>
            `;
            sellerAcceptDiv.appendChild(imageContainer);
        }

        const paymentStatusBtn = document.createElement('button');
        paymentStatusBtn.className = 'waiting-for-payment-btn';
        paymentStatusBtn.textContent = 'Awaiting Payment...';
        paymentStatusBtn.disabled = true;
        paymentStatusBtn.style.backgroundColor = 'gray';
        paymentStatusBtn.style.cursor = 'not-allowed';
        paymentStatusBtn.dataset.productId = parsed.productId;
        paymentStatusBtn.style.display = 'block';
        paymentStatusBtn.style.margin = '10px auto';

        sellerAcceptDiv.appendChild(paymentStatusBtn);
        chatMessages.appendChild(sellerAcceptDiv);

        acceptedOffers.add(parsed.productId);
        bargainingSessions.delete(`${parsed.productId}-${message.senderId}`);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Store sellerAccept system message
        const sellerAcceptSystemMessage = {
            _id: `sellerAccept_${parsed.productId}_${Date.now()}`,
            metadata: { isSystemMessage: true },
            messageType: 'sellerAccept',
            text: sellerAcceptText,
            offerDetails: parsed,
            createdAt: message.createdAt,
            senderId: null,
            receiverId: userId
        };
        storeMessage(sellerAcceptSystemMessage);
        return;
    }

    // Parse message content for general messages, offers, counter-offers
    let msg = message.text, img = null, parsed = {};
    console.log('Processing message:', { messageType: message.messageType, text: message.text });

    if (['offer', 'counter-offer'].includes(message.messageType)) {
        try {
            parsed = JSON.parse(message.text);
            msg = parsed.text || message.text;
            img = parsed.image || null;
            parsed.offer = parsed.offer || (message.offerDetails?.proposedPrice) || 0;
            parsed.productId = parsed.productId || (message.offerDetails?.productId) || '';
            parsed.productName = parsed.productName || (message.offerDetails?.productName) || 'Product';
            parsed.image = parsed.image || (message.offerDetails?.image) || '';
            parsed.isCounterOffer = message.offerDetails?.isCounterOffer || (message.messageType === 'counter-offer');
            console.log('Parsed special message (offer/counter-offer):', parsed, 'Image:', img);
        } catch (e) {
            console.warn(`Failed to parse ${message.messageType} message text:`, message.text, e);
            parsed = {
                offer: (message.offerDetails?.proposedPrice) || 0,
                productId: (message.offerDetails?.productId) || '',
                productName: (message.offerDetails?.productName) || 'Product',
                image: (message.offerDetails?.image) || '',
                isCounterOffer: message.offerDetails?.isCounterOffer || (message.messageType === 'counter-offer')
            };
        }
    } else if (message.messageType === 'text') {
        if (message.text.startsWith('{') && message.text.includes('image')) {
            try {
                parsed = JSON.parse(message.text);
                msg = parsed.text || message.text;
                img = parsed.image || null;
                console.log('Parsed text message with image:', parsed, 'Image:', img);
                if (img && !img.match(/^https?:\/\//)) {
                    console.warn('Invalid image URL, attempting to fix:', img);
                    img = img.startsWith('/') ? `${API_BASE_URL}${img}` : img;
                }
            } catch (e) {
                console.warn('Failed to parse text message as JSON (no image expected):', message.text, e);
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

    // Start bargaining session if not already in one and not ended
    if (parsed?.offer && !bargainingSessions.has(`${parsed.productId}-${message.senderId}`) && !endedBargains.has(parsed.productId)) {
        bargainingSessions.add(`${parsed.productId}-${message.senderId}`);
        const startText = message.senderId === userId
            ? `You are bargaining for "${parsed.productName || 'Product'}".`
            : `${recipientUsername} is bargaining for "${parsed.productName || 'Product'}".`;
        const bargainingStartMessage = {
            _id: `bargainStart_${parsed.productId}_${Date.now()}`,
            metadata: { isSystemMessage: true },
            messageType: 'bargain-start',
            text: startText,
            offerDetails: { productId: parsed.productId, productName: parsed.productName },
            createdAt: message.createdAt,
            senderId: null,
            receiverId: userId
        };
        storeMessage(bargainingStartMessage);
        chatMessages.appendChild(createSystemMessage(startText));
    }

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
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

    // --- Handle offer messages (for seller to accept/decline initial offer) ---
    if (message.messageType === 'offer' && parsed.offer && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId !== userId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                proposedPrice: Number(parsed.offer),
                senderId: message.senderId,
                image: parsed.image || productImage || ''
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
                        body: JSON.stringify({ newPrice: productDetails.proposedPrice })
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Failed to update price');
                    }
                    const updatedPost = await response.json();

                    acceptedOffers.add(productDetails.productId);

                    const originalMsgDiv = document.querySelector(`.message[data-message-id="${message._id}"]`);
                    if (originalMsgDiv) {
                        const buttons = originalMsgDiv.querySelectorAll('.accept-offer-btn, .decline-offer-btn');
                        buttons.forEach(btn => btn.remove());
                        const acceptedTextSpan = document.createElement('span');
                        acceptedTextSpan.style.fontSize = '0.8em';
                        acceptedTextSpan.style.color = 'green';
                        acceptedTextSpan.textContent = ' (Offer Accepted)';
                        originalMsgDiv.querySelector('div').appendChild(acceptedTextSpan);
                    }

                    const buyerNotificationMessage = {
                        receiverId: productDetails.senderId,
                        messageType: 'buyerAccept',
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: productDetails.productName,
                            proposedPrice: productDetails.proposedPrice,
                            image: productDetails.image,
                            status: 'accepted',
                            isCounterOffer: false
                        },
                        createdAt: new Date().toISOString(),
                        isRead: false
                    };

                    const sellerConfirmationMessage = {
                        receiverId: userId,
                        messageType: 'sellerAccept',
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: productDetails.productName,
                            proposedPrice: productDetails.proposedPrice,
                            image: productDetails.image,
                            status: 'accepted',
                            isCounterOffer: false
                        },
                        createdAt: new Date().toISOString(),
                        isRead: false
                    };

                    const optimisticSellerAccept = { ...sellerConfirmationMessage, senderId: userId, status: 'sent' };
                    displayMessage(optimisticSellerAccept, true);

                    const buyerResponse = await fetch(`${API_BASE_URL}/send`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(buyerNotificationMessage)
                    });
                    const buyerData = await buyerResponse.json();
                    if (!buyerResponse.ok) throw new Error(buyerData.error || `HTTP error ${buyerResponse.status}`);

                    const sellerResponse = await fetch(`${API_BASE_URL}/send`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(sellerConfirmationMessage)
                    });
                    const sellerData = await sellerResponse.json();
                    if (!sellerResponse.ok) throw new Error(sellerData.error || `HTTP error ${sellerResponse.status}`);

                    acceptModal.style.display = 'none';
                    showToast('Offer accepted successfully!', 'success');
                } catch (error) {
                    console.error('Failed to accept offer:', error);
                    showToast(`Failed to accept offer: ${error.message}`, 'error');
                    acceptModal.style.display = 'none';
                    const lastSent = chatMessages.querySelector('.message.sent:last-child');
                    if (lastSent) lastSent.remove();
                }
            };
            document.getElementById('cancelAcceptBtn').onclick = () => {
                acceptModal.style.display = 'none';
            };
        };

        const declineBtn = document.createElement('button');
        declineBtn.className = 'decline-offer-btn';
        declineBtn.textContent = 'Decline';
        declineBtn.onclick = () => {
            openLastPriceModal(parsed.productId, parsed.productName, parsed.image);
            document.getElementById('acceptConfirmationModal').style.display = 'none';
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(declineBtn);
    }

    // --- Handle counter-offer messages (for buyer to accept/end counter-offer) ---
    if (message.messageType === 'counter-offer' && parsed.offer && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId !== userId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                proposedPrice: Number(parsed.offer),
                senderId: message.senderId,
                image: parsed.image || productImage || ''
            };
            document.getElementById('confirmationMessage').textContent =
                `Are you sure you want to accept the counter-offer of ₦${Number(parsed.offer).toLocaleString('en-NG')} for "${parsed.productName || 'Product'}"?`;
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
                        body: JSON.stringify({ newPrice: productDetails.proposedPrice })
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Failed to update price');
                    }
                    const updatedPost = await response.json();

                    acceptedOffers.add(productDetails.productId);

                    const originalMsgDiv = document.querySelector(`.message[data-message-id="${message._id}"]`);
                    if (originalMsgDiv) {
                        const buttons = originalMsgDiv.querySelectorAll('.accept-offer-btn, .end-bargain-btn');
                        buttons.forEach(btn => btn.remove());
                        const acceptedTextSpan = document.createElement('span');
                        acceptedTextSpan.style.fontSize = '0.8em';
                        acceptedTextSpan.style.color = 'green';
                        acceptedTextSpan.textContent = ' (Counter-Offer Accepted)';
                        originalMsgDiv.querySelector('div').appendChild(acceptedTextSpan);
                    }

                    const sellerNotificationMessage = {
                        receiverId: productDetails.senderId,
                        messageType: 'sellerAccept',
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: productDetails.productName,
                            proposedPrice: productDetails.proposedPrice,
                            image: productDetails.image,
                            status: 'accepted',
                            isCounterOffer: true
                        },
                        createdAt: new Date().toISOString(),
                        isRead: false
                    };

                    const buyerConfirmationMessage = {
                        receiverId: userId,
                        messageType: 'buyerAccept',
                        offerDetails: {
                            productId: productDetails.productId,
                            productName: productDetails.productName,
                            proposedPrice: productDetails.proposedPrice,
                            image: productDetails.image,
                            status: 'accepted',
                            isCounterOffer: true
                        },
                        createdAt: new Date().toISOString(),
                        isRead: false
                    };

                    const optimisticBuyerAccept = { ...buyerConfirmationMessage, senderId: userId, status: 'sent' };
                    displayMessage(optimisticBuyerAccept, true);

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

                    const buyerResponse = await fetch(`${API_BASE_URL}/send`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(buyerConfirmationMessage)
                    });
                    const buyerData = await buyerResponse.json();
                    if (!buyerResponse.ok) throw new Error(buyerData.error || `HTTP error ${buyerResponse.status}`);

                    acceptModal.style.display = 'none';
                    showToast('Counter-offer accepted successfully!', 'success');
                } catch (error) {
                    console.error('Failed to accept counter-offer:', error);
                    showToast(`Failed to accept offer: ${error.message}`, 'error');
                    acceptModal.style.display = 'none';
                    const lastSent = chatMessages.querySelector('.message.sent:last-child');
                    if (lastSent) lastSent.remove();
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

                const originalMsgDiv = document.querySelector(`.message[data-message-id="${message._id}"]`);
                if (originalMsgDiv) {
                    const buttons = originalMsgDiv.querySelectorAll('.accept-offer-btn, .end-bargain-btn');
                    buttons.forEach(btn => btn.remove());
                    const endedTextSpan = document.createElement('span');
                    endedTextSpan.style.fontSize = '0.8em';
                    endedTextSpan.style.color = 'red';
                    endedTextSpan.textContent = ' (Bargain Ended)';
                    originalMsgDiv.querySelector('div').appendChild(endedTextSpan);
                }

                const endBargainMessage = {
                    receiverId: message.senderId,
                    messageType: 'end-bargain',
                    offerDetails: {
                        productId: productDetails.productId,
                        productName: productDetails.productName,
                        status: 'rejected'
                    },
                    createdAt: new Date().toISOString(),
                    isRead: false
                };

                const optimisticEnd = { ...endBargainMessage, senderId: userId, status: 'sent' };
                displayMessage(optimisticEnd, true);

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
                showToast(`Error: ${error.message}`, 'error');
                const lastSent = chatMessages.querySelector('.message.sent:last-child');
                if (lastSent) lastSent.remove();
            }
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(endBargainBtn);
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Open modal for seller to send a counteroffer
function openLastPriceModal(productId, productName, productImage) {
    lastPriceModal.style.display = 'block';

    lastPriceInput.addEventListener('beforeinput', (e) => {
        if (e.data && !/^[0-9]$/.test(e.data)) {
            e.preventDefault();
        }
    });

    lastPriceInput.addEventListener('input', (e) => {
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

    submitLastPriceBtn.onclick = async () => {
        const lastPrice = lastPriceInput.value.replace(/,/g, '').trim();
        if (lastPrice && !isNaN(lastPrice) && Number(lastPrice) > 0) {
            const message = {
                receiverId: receiverId,
                messageType: 'counter-offer',
                text: JSON.stringify({
                    text: `My counter-offer for "${productName}" is ₦${Number(lastPrice).toLocaleString('en-NG')}`,
                    offer: Number(lastPrice),
                    productId,
                    productName,
                    image: productImage || ''
                }),
                offerDetails: {
                    productId,
                    productName,
                    proposedPrice: Number(lastPrice),
                    originalPrice: originalPrice || Number(lastPrice),
                    image: productImage || '',
                    isCounterOffer: true
                },
                createdAt: new Date().toISOString(),
                isRead: false
            };

            const optimisticMessage = { ...message, senderId: userId, status: 'sent' };
            displayMessage(optimisticMessage, true);
            storeMessage(optimisticMessage);

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
                console.log('Last price (counter-offer) sent:', data);
                closeLastPriceModal();
            } catch (error) {
                console.error('Error sending last price (counter-offer):', error);
                showToast(`Failed to send counter-offer: ${error.message}`, 'error');
                const lastSent = chatMessages.querySelector('.message.sent:last-child');
                if (lastSent) lastSent.remove();
            }
        } else {
            showToast('Please enter a valid positive number for your counter-offer.', 'error');
        }
    };
}

// Close the last price modal
function closeLastPriceModal() {
    lastPriceModal.style.display = 'none';
    lastPriceInput.value = '';
}

// Handle bargain button click
bargainBtn.addEventListener('click', async () => {
    const modal = document.getElementById('bargainModal');
    if (!modal) {
        console.error('Bargain modal with ID "bargainModal" not found.');
        showToast('Bargain modal not found.', 'error');
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
            console.log('Product:', product);
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${product.photo || 'default-image.png'}" alt="${product.title}" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:#f00;">Failed to load product image.</p>
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
                if (price && !isNaN(price) && Number(price) > 0 {
                    sendButton.disabled = true;
                    sendButton.textContent = 'Sending...';
                    const message = {
                        receiverId,
                        messageType: 'offer',
                        text: JSON.stringify({
                            'text': `My offer for "${product.title}" is ₦${Number(price).toLocaleString('en-NG')}`,
                            offer: Number(price),
                            productId: product._id,
                            productName: product.title,
                            image: product.photo || ''
                        }),
                        offerDetails: {
                            productId: product._id,
                            productName: product.title,
                            acceptedPrice: Number(proposedPrice),
                            proposedPrice: Number(price),
                            image: product.photo || '',
                            isCounterOffer: false
                        },
                        createdAt: new Date().toISOString(),
                        isRead: false
                    };

                    const optimisticMessage = { ...message, senderId: userId, status: 'sent' };
                    displayMessage(optimisticMessage, true);
                    storeMessage(optimisticMessage);

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
                        console.log('Offer sent:', 'data', data);
                        closeModal();
                    } catch (bargainModal(error) {
                        console.error('Error sending offer:', error);
                        showToast(`Failed to send offer: ${error.message}`, 'error');
                        const lastSent = chatMessages.querySelector('.message.sent:last-child');
                        if (lastSent) lastSent.remove();
                    } finally {
                        sendButton.disabled = false;
                        sendButton.textContent = 'Send Offer';
                    }
                } else {
                    showToast('Please enter a valid positive number for your offer.', 'error');
                }
            };
            container.appendChild(card);
        });

        const closeModalBtn = document.getElementById('closeBargainModalBtn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                console.log('Clicked close button, closing modal');
                closeModal();
                bargainModalBtn();
            });
        } else {
            console.warn('Close button with ID "closeBargainModalBtn" not found.');
        }
    } catch (e) {
        console.error('Fetch error:', error);
        showToast(`Failed to load products: ${e.message}`, 'error');
        document.getElementById('bargainProductsContainer').innerHTML = '<p>Failed to load products.</p>';
    }
});

// Close the modal
function closeModal() {
    const modal = document.getElementById('bargainModal');
    if (modal) {
        console.log('Modal with ID "bargainModal" not found.');
        console.error('Modal error');
    } else {
        console.log('Closing modal');
        modal.style.display = 'none';
    }
}

// Send a new message
sendBtn.addEventListener('click', async () => {
    const text = typeSection.value.trim();
    if (!text) {
        console.log('Empty message not sent');
        showToast('Please enter a message:', 'error');
        return;
    }

    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const isInitialMessage = !isInitialMessageSent && predefinedMessage && productImage;

    console.log('Message comparison:', {
        inputText: text,
        normalizedText:,
        predefinedMessage:,
        productImage:,
        isInitialMessage:,
        isInitialMessageSent:
    });