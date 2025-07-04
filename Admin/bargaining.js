// --- Bargaining-Specific DOM Elements ---
const lastPriceModal = document.getElementById('lastPriceModal');
const lastPriceInput = document.getElementById('lastPriceInput');
const submitLastPriceBtn = document.getElementById('submitLastPriceBtn');
const bargainBtn = document.getElementById('bargain-btn');

// --- Bargaining State Management ---
// Track ended bargains, counter-offers, displayed messages, and initial message status
const endedBargains = new Set(JSON.parse(localStorage.getItem(`endedBargains_${userId}_${receiverId}`) || '[]'));
const bargainingSessions = new Set(JSON.parse(localStorage.getItem(`bargainingSessions_${userId}_${receiverId}`) || '[]'));
const acceptedOffers = new Set(JSON.parse(localStorage.getItem(`acceptedOffers_${userId}_${receiverId}`) || '[]'));
const sentCounterOffers = new Set(JSON.parse(localStorage.getItem(`sentCounterOffers_${userId}_${receiverId}`) || '[]'));
const displayedSystemMessages = new Set(JSON.parse(localStorage.getItem(`displayedSystemMessages_${userId}_${receiverId}`) || '[]'));

// Function to save bargaining states to localStorage
function saveBargainStates() {
    localStorage.setItem(`endedBargains_${userId}_${receiverId}`, JSON.stringify(Array.from(endedBargains)));
    localStorage.setItem(`bargainingSessions_${userId}_${receiverId}`, JSON.stringify(Array.from(bargainingSessions)));
    localStorage.setItem(`acceptedOffers_${userId}_${receiverId}`, JSON.stringify(Array.from(acceptedOffers)));
    localStorage.setItem(`sentCounterOffers_${userId}_${receiverId}`, JSON.stringify(Array.from(sentCounterOffers)));
    localStorage.setItem(`displayedSystemMessages_${userId}_${receiverId}`, JSON.stringify(Array.from(displayedSystemMessages)));
}

// Function to display system message (persists across page reloads)
function displaySystemMessage(messageId, content, isForCurrentUser = true) {
    if (displayedSystemMessages.has(messageId)) return; // Already displayed
    
    const messageContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-message';
    messageDiv.setAttribute('data-message-id', messageId);
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="system-message-text">${content.text}</div>
            <div class="product-info">
                <img src="${content.image || '/default-image.png'}" alt="${content.productName}" 
                     style="max-width: 150px; border-radius: 5px; margin: 10px 0;" 
                     onerror="this.style.display='none';">
                <div class="product-name">${content.productName}</div>
                <div class="price">₦${content.offer.toLocaleString('en-NG')}</div>
                ${content.showPaymentButton ? `
                    <button class="payment-btn" data-product-id="${content.productId}" 
                            data-price="${content.offer}" data-product-name="${content.productName}">
                        ${content.paymentCompleted ? 'Payment Completed' : 'Proceed to Payment'}
                    </button>
                ` : content.showWaitingButton ? `
                    <button class="waiting-btn" disabled>
                        ${content.paymentCompleted ? 'Payment Completed' : 'Waiting for Payment'}
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    messageContainer.appendChild(messageDiv);
    displayedSystemMessages.add(messageId);
    saveBargainStates();
    
    // Add payment button functionality if needed
    if (content.showPaymentButton && !content.paymentCompleted) {
        const paymentBtn = messageDiv.querySelector('.payment-btn');
        if (paymentBtn) {
            paymentBtn.onclick = () => {
                initiatePayment(content.productId, content.offer, content.productName, paymentBtn);
            };
        }
    }
    
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

// Function to handle accepting an initial offer from buyer (seller side)
async function handleAcceptOffer(productDetails, originalOfferSenderId) {
    document.getElementById('confirmationMessage').textContent =
        `Are you sure you want to accept the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName || 'Product'}"?`;
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

            acceptedOffers.add(productDetails.productId);
            endedBargains.add(productDetails.productId);
            bargainingSessions.delete(`${productDetails.productId}-${originalOfferSenderId}`);
            saveBargainStates();

            // Remove action buttons from offer messages
            const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${productDetails.productId}"]`);
            offerMessages.forEach(msg => {
                const buttons = msg.querySelectorAll('.accept-offer-btn, .decline-offer-btn, .end-bargain-btn');
                buttons.forEach(btn => btn.remove());
            });

            // Check payment status
            const paymentCompleted = await verifyPaymentStatus(productDetails.productId, originalOfferSenderId);

            // Display system message for seller (current user)
            const sellerMessageId = `seller-accept-${productDetails.productId}-${originalOfferSenderId}`;
            displaySystemMessage(sellerMessageId, {
                text: `You have accepted the offer of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}"`,
                productName: productDetails.productName,
                productId: productDetails.productId,
                offer: productDetails.offer,
                image: productDetails.image,
                showWaitingButton: true,
                paymentCompleted: paymentCompleted
            });

            // Send message to buyer (this will trigger their system message)
            const buyerNotificationMessage = {
                senderId: userId,
                receiverId: originalOfferSenderId,
                messageType: 'offerAccepted',
                text: JSON.stringify({
                    productId: productDetails.productId,
                    productName: productDetails.productName,
                    offer: productDetails.offer,
                    image: productDetails.image,
                    messageType: 'offerAccepted'
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
        }
    };
    
    document.getElementById('cancelAcceptBtn').onclick = () => {
        acceptModal.style.display = 'none';
    };
}

// Function to handle accepting a counter-offer (buyer side)
async function handleAcceptCounterOffer(productDetails, counterOfferSenderId) {
    document.getElementById('confirmationMessage').textContent =
        `Are you sure you want to accept the last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName || 'Product'}"?`;
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

            acceptedOffers.add(productDetails.productId);
            endedBargains.add(productDetails.productId);
            bargainingSessions.delete(`${productDetails.productId}-${counterOfferSenderId}`);
            saveBargainStates();

            // Remove action buttons from counter-offer messages
            const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${productDetails.productId}"]`);
            offerMessages.forEach(msg => {
                const buttons = msg.querySelectorAll('.accept-offer-btn, .end-bargain-btn');
                buttons.forEach(btn => btn.remove());
            });

            // Check payment status
            const paymentCompleted = await verifyPaymentStatus(productDetails.productId, userId);

            // Display system message for buyer (current user)
            const buyerMessageId = `buyer-accept-counter-${productDetails.productId}-${counterOfferSenderId}`;
            displaySystemMessage(buyerMessageId, {
                text: `You have accepted the last price of ₦${productDetails.offer.toLocaleString('en-NG')} for "${productDetails.productName}"`,
                productName: productDetails.productName,
                productId: productDetails.productId,
                offer: productDetails.offer,
                image: productDetails.image,
                showPaymentButton: true,
                paymentCompleted: paymentCompleted
            });

            // Send message to seller (this will trigger their system message)
            const sellerNotificationMessage = {
                senderId: userId,
                receiverId: counterOfferSenderId,
                messageType: 'counterOfferAccepted',
                text: JSON.stringify({
                    productId: productDetails.productId,
                    productName: productDetails.productName,
                    offer: productDetails.offer,
                    image: productDetails.image,
                    messageType: 'counterOfferAccepted'
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
        }
    };
    
    document.getElementById('cancelAcceptBtn').onclick = () => {
        acceptModal.style.display = 'none';
    };
}

// Function to handle incoming messages and display appropriate system messages
function handleIncomingMessage(message) {
    const messageData = JSON.parse(message.text);
    
    if (message.messageType === 'offerAccepted' && message.senderId !== userId) {
        // Buyer receives notification that their offer was accepted
        const buyerMessageId = `buyer-offer-accepted-${messageData.productId}-${message.senderId}`;
        const paymentCompleted = verifyPaymentStatus(messageData.productId, userId);
        
        displaySystemMessage(buyerMessageId, {
            text: `Your offer of ₦${messageData.offer.toLocaleString('en-NG')} for "${messageData.productName}" has been accepted`,
            productName: messageData.productName,
            productId: messageData.productId,
            offer: messageData.offer,
            image: messageData.image,
            showPaymentButton: true,
            paymentCompleted: paymentCompleted
        });
    } else if (message.messageType === 'counterOfferAccepted' && message.senderId !== userId) {
        // Seller receives notification that their counter-offer was accepted
        const sellerMessageId = `seller-counter-accepted-${messageData.productId}-${message.senderId}`;
        const paymentCompleted = verifyPaymentStatus(messageData.productId, message.senderId);
        
        displaySystemMessage(sellerMessageId, {
            text: `Your last price of ₦${messageData.offer.toLocaleString('en-NG')} for "${messageData.productName}" has been accepted`,
            productName: messageData.productName,
            productId: messageData.productId,
            offer: messageData.offer,
            image: messageData.image,
            showWaitingButton: true,
            paymentCompleted: paymentCompleted
        });
    }
}

// Function to restore system messages on page load
function restoreSystemMessages() {
    // This function should be called when the page loads to restore all persistent system messages
    displayedSystemMessages.forEach(messageId => {
        // You might want to store additional message data to properly restore them
        // For now, this is a placeholder - you'd need to implement proper message restoration
        console.log(`Restoring system message: ${messageId}`);
    });
}

// Function to update payment status for system messages
async function updatePaymentStatus(productId, buyerId) {
    const paymentCompleted = await verifyPaymentStatus(productId, buyerId);
    
    // Update all relevant system messages
    const systemMessages = document.querySelectorAll('.system-message');
    systemMessages.forEach(msg => {
        const paymentBtn = msg.querySelector('.payment-btn');
        const waitingBtn = msg.querySelector('.waiting-btn');
        
        if (paymentBtn && msg.querySelector(`[data-product-id="${productId}"]`)) {
            if (paymentCompleted) {
                paymentBtn.textContent = 'Payment Completed';
                paymentBtn.disabled = true;
                paymentBtn.classList.add('completed');
            }
        }
        
        if (waitingBtn && msg.querySelector(`[data-product-id="${productId}"]`)) {
            if (paymentCompleted) {
                waitingBtn.textContent = 'Payment Completed';
                waitingBtn.classList.add('completed');
            }
        }
    });
}

// Function to handle ending a bargain
async function handleEndBargain(productDetails, bargainInitiatorId) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) throw new Error('No auth token found');

        endedBargains.add(productDetails.productId);
        bargainingSessions.delete(`${productDetails.productId}-${bargainInitiatorId}`);
        saveBargainStates();

        const offerMessages = document.querySelectorAll(`.message.received[data-product-id="${productDetails.productId}"]`);
        offerMessages.forEach(msg => {
            const buttons = msg.querySelectorAll('.accept-offer-btn, .decline-offer-btn, .end-bargain-btn');
            buttons.forEach(btn => btn.remove());
        });

        const endBargainMessage = {
            senderId: userId,
            receiverId: bargainInitiatorId,
            messageType: 'end-bargain',
            text: JSON.stringify({
                productId: productDetails.productId,
                productName: productDetails.productName
            }),
            offerDetails: {
                productId: productDetails.productId,
                productName: productDetails.productName,
                status: 'rejected'
            },
            createdAt: new Date(),
            isRead: false
        };

        const optimisticEnd = { ...endBargainMessage, senderId: userId, status: 'sent' };
        displayMessage(optimisticEnd, true);

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
        removeOptimisticMessage();
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
            body: JSON.stringify({ email, postId, buyerId, amount: price, productName })
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
    lastPriceInput.focus();
    submitLastPriceBtn.onclick = async () => {
        const lastPrice = lastPriceInput.value.trim().replace(/,/g, '');
        if (lastPrice && !isNaN(lastPrice) && Number(lastPrice) > 0) {
            const message = {
                receiverId: receiverId,
                messageType: 'counter-offer',
                text: JSON.stringify({
                    text: `The last price I can give you for "${productName}" is ₦${Number(lastPrice).toLocaleString('en-NG')}`,
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
                sentCounterOffers.add(productId);
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

        const container = document.getElementById('bargainProductsContainer');
        if (!container) {
            console.error('Bargain products container not found.');
            showToast('Products container not found', 'error');
            return;
        }
        container.innerHTML = '';

        if (!data.success || !data.products || data.products.length === 0) {
            container.innerHTML = '<p>No products available for bargaining with this seller.</p>';
            return;
        }

        data.products.forEach(product => {
            if (acceptedOffers.has(product._id) || endedBargains.has(product._id)) {
                return;
            }

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
                        bargainingSessions.add(`${product._id}-${userId}`);
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
                closeBargainModal();
            };
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
        modal.style.display = 'none';
    }
}

// Call this function when the page loads to restore system messages
document.addEventListener('DOMContentLoaded', () => {
    restoreSystemMessages();
});

// Call this function when receiving new messages via WebSocket/polling
// messageHandler.onMessage = (message) => {
//     handleIncomingMessage(message);
//     // ... other message handling logic
// };