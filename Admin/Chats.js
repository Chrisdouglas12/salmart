// API base URL configuration for local and production environments
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://salmart-production.up.railway.app';

// Initialize Socket.IO connection with WebSocket and polling transports
const socket = io(API_BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling']
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
const userId = urlParams.get('user_id');
const receiverId = urlParams.get('recipient_id');
const recipientUsername = urlParams.get('recipient_username');
const recipientProfilePictureUrl = urlParams.get('recipient_profile_picture_url');
const predefinedMessage = urlParams.get('message') ? decodeURIComponent(urlParams.get('message')) : '';
const productImage = urlParams.get('product_image') ? decodeURIComponent(urlParams.get('product_image')) : '';

// Set recipient info in the UI
document.getElementById('chats-userName').textContent = recipientUsername;
document.getElementById('chatspic').src = recipientProfilePictureUrl;

// Pre-fill chat input with predefined message if provided
if (predefinedMessage) {
    typeSection.value = predefinedMessage;
}

// Display product image preview above chat
if (productImage) {
    const previewContainer = document.createElement('div');
    previewContainer.id = 'product-preview';
    previewContainer.style.margin = '10px';
    previewContainer.style.textAlign = 'center';
    previewContainer.innerHTML = `
        <p style="font-size: 14px; color: #777;">Product Preview</p>
        <img src="${productImage}" class="product-photo-preview" alt="Product Preview" style="max-width: 200px; border-radius: 5px;">
    `;
    chatMessages.insertAdjacentElement('beforebegin', previewContainer);
}

// Join chat room if userId and receiverId are available
if (userId && receiverId) socket.emit('joinRoom', userId);


let lastDisplayedDate = null;

// Track ended bargains
const endedBargains = new Set();
const bargainingSessions = new Set()
const acceptedOffers = new Set()
// Display a message in the chat, including offer/payment buttons and bargaining start message
function displayMessage(message) {
    const messageDate = new Date(message.createdAt);
    const formattedDate = formatMessageDate(messageDate);

    // Helper: create a persistent system message div
    function createSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'system-message';
        div.textContent = text;
        return div;
    }

    // Insert date separator if needed
    if (formattedDate !== lastDisplayedDate) {
        chatMessages.appendChild(createSystemMessage(formattedDate));
        lastDisplayedDate = formattedDate;
    }

    // Handle image messages (e.g., receipts)
    if (message.messageType === 'image') {
        const imageUrl = 
            (message.attachment && message.attachment.url) || 
            message.attachment || 
            message.content;

        if (imageUrl) {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
            const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            msgDiv.innerHTML = `
                ${message.text ? `<div>${message.text}</div>` : ''}
                <img src="${imageUrl}" class="product-photo-preview" alt="Receipt">
                <div class="message-timestamp">${time}</div>
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }
    }

    // Handle bargain end message
    if (message.messageType === 'endBargain') {
        const parsed = JSON.parse(message.text);
        endedBargains.add(parsed.productId);
        bargainingSessions.delete(parsed.productId);

        const endText = (message.senderId === userId)
            ? `This bargain for ${parsed.productName} was ended`
            : `This bargain was ended by the buyer`;

        chatMessages.appendChild(createSystemMessage(endText));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Handle buyerAccept message from SELLER's perspective (receiver)
    if (message.messageType === 'buyerAccept' && message.receiverId === userId) {
    // This is the seller's view - show different message
    const parsed = JSON.parse(message.text);
    const sellerText = `Your bid for ${parsed.productName} at ₦${Number(parsed.offer).toLocaleString('en-NG')} has been accepted`;
    chatMessages.appendChild(createSystemMessage(sellerText));
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return;
}
    // Handle buyerAccept message from BUYER's perspective (sender)
    if (message.messageType === 'buyerAccept' && message.senderId === userId) {
    // This is the buyer's view - show acceptance message
    const parsed = JSON.parse(message.text);
    const buyerDiv = createSystemMessage(`You agreed to pay ₦${Number(parsed.offer).toLocaleString('en-NG')} for "${parsed.productName}"`);

    if (parsed.image) {
        const imageContainer = document.createElement('div');
        imageContainer.style.margin = '10px 0';
        imageContainer.innerHTML = `
            <img src="${parsed.image}" class="product-photo-preview" alt="${parsed.productName}" style="max-width: 200px; border-radius: 5px;">
        `;
        buyerDiv.appendChild(imageContainer);
    }

        const paymentBtn = document.createElement('button');
        paymentBtn.className = 'proceed-to-payment-btn';
        paymentBtn.textContent = 'Proceed to Payment';

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

    // Handle sellerAccept message
    if (message.messageType === 'sellerAccept') {
        const parsed = JSON.parse(message.text);
        const sellerAcceptText = (message.senderId === userId)
            ? `You have accepted ₦${Number(parsed.offer).toLocaleString('en-NG')} for "${parsed.productName}". You shall be notified as soon as ${parsed.buyerName} makes payment.`
            : `Seller accepted your offer of ₦${Number(parsed.offer).toLocaleString('en-NG')}`;
        chatMessages.appendChild(createSystemMessage(sellerAcceptText));
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    // Parse message text and extract relevant data
    let msg = message.text, img = null, parsed;
    try {
        parsed = JSON.parse(message.text);
        msg = parsed.text || message.text;
        img = parsed.image || null;
    } catch {
        msg = message.text;
    }

    // Insert bargain start message for new offer messages, skip if bargain ended
    if (parsed?.offer && !bargainingSessions.has(`${parsed.productId}-${message.senderId}`) && !endedBargains.has(parsed.productId)) {
        bargainingSessions.add(`${parsed.productId}-${message.senderId}`);
        const startText = message.senderId === userId
            ? `You are bargaining for ${parsed.productName}`
            : `${recipientUsername} is bargaining for ${parsed.productName}`;
        chatMessages.appendChild(createSystemMessage(startText));
    }

    // Create regular message div
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    msgDiv.innerHTML = `
        <div>${msg}</div>
        ${img ? `<img src="${img}" class="product-photo-preview" alt="Product Image">` : ''}
        <div class="message-timestamp">${time} ${message.isRead ? '✔✔' : ''}</div>
    `;

    // Check if offer accepted or bargain ended
    const isOfferAccepted = parsed?.productId && acceptedOffers.has(parsed.productId);
    const isBargainEnded = parsed?.productId && endedBargains.has(parsed.productId);

    // Add Accept/Decline buttons for seller on buyer's unaccepted offer, only if bargain not ended
    if (parsed && parsed.offer && !parsed.payment && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId !== userId && message.senderId !== receiverId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                offer: Number(parsed.offer),
                senderId: message.senderId
            };
            document.getElementById('confirmationMessage').textContent = 
                `Are you sure you want to accept the offer of ₦${Number(parsed.offer).toLocaleString('en-NG')} for "${parsed.productName}"?`;
            const acceptModal = document.getElementById('acceptConfirmationModal');
            acceptModal.style.display = 'block';
            document.getElementById('confirmAcceptBtn').onclick = async () => {
                try {
                    const response = await fetch(`${API_BASE_URL}/posts/${productDetails.productId}/update-price`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                        },
                        body: JSON.stringify({ newPrice: productDetails.offer })
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Failed to update price');
                    }
                    const updatedPost = await response.json();

                    acceptedOffers.add(productDetails.productId);

                    // Remove Accept/Decline buttons from the offer message
                    const offerMessages = document.querySelectorAll(`.message.received`);
                    offerMessages.forEach(msg => {
                        if (msg.innerHTML.includes(parsed.productId)) {
                            const buttons = msg.querySelectorAll('.accept-offer-btn, .decline-offer-btn');
                            buttons.forEach(btn => btn.remove());
                        }
                    });

                    const acceptanceMessage = {
                        senderId: userId,
                        receiverId: productDetails.senderId,
                        text: JSON.stringify({
                            text: `Your offer for "${productDetails.productName}" has been accepted. New price is ₦${Number(productDetails.offer).toLocaleString('en-NG')}`,
                            productId: productDetails.productId,
                            productName: parsed.productName,
                            offer: productDetails.offer,
                            payment: true,
                            image: parsed.image || productImage || ''
                        }),
                        createdAt: new Date(),
                        isRead: false
                    };
                    socket.emit('sendMessage', acceptanceMessage);
                    displayMessage(acceptanceMessage);

                    acceptModal.style.display = 'none';
                    showToast('Price updated successfully!', 'success');
                } catch (error) {
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
        declineBtn.onclick = () => {
            openLastPriceModal(parsed.productId, parsed.productName, parsed.image);
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(declineBtn);
    }

    // Add Accept/End Bargain buttons for buyer on seller's counteroffer, only if bargain not ended
    if (parsed && parsed.offer && !parsed.payment && message.receiverId === userId && !isOfferAccepted && !isBargainEnded && message.senderId === receiverId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        acceptBtn.onclick = async () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                offer: Number(parsed.offer),
                senderId: message.senderId
            };
            document.getElementById('confirmationMessage').textContent = 
                `Are you sure you want to accept the seller's offer of ₦${Number(parsed.offer).toLocaleString('en-NG')} for "${parsed.productName}"?`;
            const acceptModal = document.getElementById('acceptConfirmationModal');
            acceptModal.style.display = 'block';
            document.getElementById('confirmAcceptBtn').onclick = async () => {
                try {
                    const response = await fetch(`${API_BASE_URL}/posts/${productDetails.productId}/update-price`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                        },
                        body: JSON.stringify({ newPrice: productDetails.offer })
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Failed to update price');
                    }
                    const updatedPost = await response.json();

                    acceptedOffers.add(productDetails.productId);

                    // Remove Accept/End Bargain buttons from the counteroffer message
                    const offerMessages = document.querySelectorAll(`.message.received`);
                    offerMessages.forEach(msg => {
                        if (msg.innerHTML.includes(parsed.productId)) {
                            const buttons = msg.querySelectorAll('.accept-offer-btn, .end-bargain-btn');
                            buttons.forEach(btn => btn.remove());
                        }
                    });

                    const acceptMessage = {
                        senderId: userId,
                        receiverId: productDetails.senderId,
                        messageType: 'buyerAccept',
                        text: JSON.stringify({
                            productId: productDetails.productId,
                            productName: parsed.productName,
                            offer: productDetails.offer,
                            image: parsed.image || productImage || ''
                        }),
                        createdAt: new Date(),
                        isRead: false
                    };
                    socket.emit('sendMessage', acceptMessage);
                    displayMessage(acceptMessage);

                    acceptModal.style.display = 'none';
                    showToast('Offer accepted successfully!', 'success');
                } catch (error) {
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
        endBargainBtn.onclick = () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName
            };

            endedBargains.add(productDetails.productId);

            // Remove Accept/End Bargain buttons from the counteroffer message
            const offerMessages = document.querySelectorAll(`.message.received`);
            offerMessages.forEach(msg => {
                if (msg.innerHTML.includes(parsed.productId)) {
                    const buttons = msg.querySelectorAll('.accept-offer-btn, .end-bargain-btn');
                    buttons.forEach(btn => btn.remove());
                }
            });

            const endBargainMessage = {
                senderId: userId,
                receiverId: message.senderId,
                messageType: 'endBargain',
                text: JSON.stringify({
                    productId: productDetails.productId,
                    productName: parsed.productName
                }),
                createdAt: new Date(),
                isRead: false
            };
            socket.emit('sendMessage', endBargainMessage);
            displayMessage(endBargainMessage);

            showToast('Bargain ended successfully!', 'success');
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(endBargainBtn);
    }

    // Add Proceed to Payment button for buyer after seller's acceptance
    if (parsed && parsed.payment && message.receiverId === userId) {
        const paymentBtn = document.createElement('button');
        paymentBtn.className = 'proceed-to-payment-btn';
        paymentBtn.textContent = 'Proceed to Payment';

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

        msgDiv.appendChild(paymentBtn);
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Open modal for seller to send a counteroffer with product image
function openLastPriceModal(productId, productName, productImage) {
    lastPriceModal.style.display = 'block';
    submitLastPriceBtn.onclick = () => {
        const lastPrice = lastPriceInput.value.trim();
        if (lastPrice && !isNaN(lastPrice) && Number(lastPrice) > 0) {
            const message = {
                senderId: userId,
                receiverId: receiverId,
                text: JSON.stringify({
                    text: `I can give you "${productName}" for ₦${Number(lastPrice).toLocaleString('en-NG')}`,
                    offer: lastPrice,
                    productId: productId,
                    productName: productName,
                    image: productImage || '' // Include product image
                }),
                createdAt: new Date(),
                isRead: false
            };
            try {
                socket.emit('sendMessage', message);
                displayMessage(message);
                console.log('Last price sent:', message);
                closeLastPriceModal();
            } catch (error) {
                console.error('Error sending last price:', error);
                showToast('Failed to send last price', 'error');
            }
        } else {
            showToast('Please enter a valid positive number', 'error');
        }
    };
}

// Close the last price modal and reset input
function closeLastPriceModal() {
    lastPriceModal.style.display = 'none';
    lastPriceInput.value = '';
}

// Handle bargain button click to open product selection modal
bargainBtn.onclick = async () => {
    const modal = document.getElementById('bargainModal');
    if (!modal) {
        console.error('Bargain modal with ID "bargainModal" not found.');
        return;
    }
    modal.style.display = 'block';
    try {
        const res = await fetch(`${API_BASE_URL}/products?sellerId=${receiverId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        const products = await res.json();
        const container = document.getElementById('bargainProductsContainer');
        if (!container) {
            console.error('Bargain products container not found.');
            return;
        }
        container.innerHTML = '';
        if (!products.length) {
            container.innerHTML = '<p>No products available.</p>';
            return;
        }
        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${product.photo}" alt="${product.description}">
                <div>
                    <strong>${product.description}</strong><br>
                    ₦${Number(product.price).toLocaleString('en-NG')}<br>
                    <input type="text" class="bargain-price-input" placeholder="Your Offer Price">
                    <button class="confirm-bargain-btn">Send Offer</button>
                </div>
            `;
            const sendButton = card.querySelector('.confirm-bargain-btn');
            const priceInput = card.querySelector('.bargain-price-input');

            // Restrict input to numbers only
            priceInput.addEventListener('beforeinput', (e) => {
                if (e.data && !/^[0-9]$/.test(e.data)) {
                    e.preventDefault();
                }
            });
            // Format input as currency
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

            // Send offer message with product image
            sendButton.onclick = () => {
                let price = priceInput.value.replace(/,/g, '');
                if (price && !isNaN(price) && Number(price) > 0) {
                    sendButton.disabled = true;
                    sendButton.textContent = 'Sending...';
                    const message = {
                        senderId: userId,
                        receiverId,
                        text: JSON.stringify({
                            text: `My offer for "${product.description}" is ₦${Number(price).toLocaleString('en-NG')}`,
                            offer: price,
                            productId: product._id,
                            productName: product.description,
                            image: product.photo // Include product image
                        }),
                        createdAt: new Date(),
                        isRead: false
                    };
                    try {
                        closeBargainModal();
                        socket.emit('sendMessage', message);
                        displayMessage(message);
                        console.log('Offer sent and modal closed');
                    } catch (error) {
                        console.error('Error sending message:', error);
                        showToast('Failed to send offer', 'error');
                        sendButton.disabled = false;
                        sendButton.textContent = 'Send Offer';
                        return;
                    }
                    setTimeout(() => {
                        sendButton.disabled = false;
                        sendButton.textContent = 'Send Offer';
                    }, 2000);
                } else {
                    showToast('Please enter a valid positive number', 'error');
                }
            };
            container.appendChild(card);
        });

        // Close bargain modal
        const closeModalBtn = document.getElementById('closeBargainModalBtn');
        if (closeModalBtn) {
            closeModalBtn.onclick = () => {
                console.log('Close button clicked, closing modal');
                closeBargainModal();
            };
        } else {
            console.warn('Close button with ID "closeBargainModalBtn" not found. Please verify modal HTML.');
        }
    } catch (e) {
        console.error('Fetch error:', e);
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
sendBtn.onclick = () => {
    const text = typeSection.value.trim();
    if (text) {
        const message = {
            senderId: userId,
            receiverId,
            text: productImage ? JSON.stringify({
                text,
                image: productImage
            }) : text,
            createdAt: new Date(),
            isRead: false
        };
        socket.emit('sendMessage', message);
        displayMessage(message);
        typeSection.value = '';
        // Remove product preview after sending the message
        const previewContainer = document.getElementById('product-preview');
        if (previewContainer) {
            previewContainer.remove();
        }
        // Send notification to recipient
        fetch('/send-notification', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                userId: receiverId,
                title: `New message from ${localStorage.getItem('username') || 'A user'}`,
                body: text.length > 30 ? `${text.substring(0, 30)}...` : text
            }) 
        }).catch(err => console.error('Notification error:', err));
    }
};

// Handle incoming messages
socket.on('receiveMessage', message => {
    if ((message.senderId === userId && message.receiverId === receiverId) || 
        (message.senderId === receiverId && message.receiverId === userId)) {
        displayMessage(message);
        socket.emit('markAsRead', { messageId: message._id });
        showToast(`New message from ${recipientUsername}`, 'success');
    }
});

// Load chat history from server
async function loadChatHistory() {
    try {
        const res = await fetch(`${API_BASE_URL}/messages?user1=${userId}&user2=${receiverId}`);
        if (!res.ok) throw new Error('Failed to fetch messages');
        const messages = await res.json();
        lastDisplayedDate = null;
        messages.forEach(displayMessage);
    } catch (error) {
        console.error('Error loading chat history:', error);
        showToast('Failed to load messages', 'error');
    }
}

loadChatHistory();

// Send typing signal to server
function sendTypingSignal() {
    socket.emit('typing', { senderId: userId, receiverId });
}

// Display typing indicator for recipient
socket.on('typing', data => {
    if (data.senderId === receiverId) {
        typingIndicator.textContent = `${recipientUsername} is typing...`;
        setTimeout(() => typingIndicator.textContent = '', 3000);
    }
});

// Handle price update responses
socket.on('priceUpdateResponse', data => {
    if ((data.senderId === receiverId && data.receiverId === userId) || 
        (data.senderId === userId && data.receiverId === receiverId)) {
        displayMessage(data);
    }
});

// Handle offer acceptance notifications
socket.on('offerAccepted', response => {
    if ((response.senderId === receiverId && response.receiverId === userId) || 
        (response.senderId === userId && data.receiverId === receiverId)) {
        displayMessage(response);
    }
});

// Handle socket connection
socket.on('connect', () => {
    console.log('Connected to server');
    if (userId) {
        socket.emit('joinRoom', userId);
    }
});

// Handle notifications (e.g., likes, comments)
socket.on('notification', data => {
    console.log('Received notification:', data);
    showToast(`${data.sender.firstName} ${data.sender.lastName} ${data.type === 'like' ? 'liked' : 'commented on'} your post`, 'success');
});

// Like a post
function likePost(postId, userId) {
    socket.emit('likePost', { postId, userId });
}

// Comment on a post
function commentPost(postId, userId, comment) {
    socket.emit('commentPost', { postId, userId, comment });
}

// Send a message via socket
function sendMessage(senderId, receiverId, text) {
    socket.emit('sendMessage', { senderId, receiverId, text });
}

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

// Toggle chat dropdown menu
ellipsisBtn.addEventListener('click', () => {
    chatDropdown.style.display = chatDropdown.style.display === 'block' ? 'none' : 'block';
});

// Close dropdown when clicking outside
window.addEventListener('click', function(e) {
    if (!ellipsisBtn.contains(e.target) && !chatDropdown.contains(e.target)) {
        chatDropdown.style.display = 'none';
    }
});

// Display toast notifications
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