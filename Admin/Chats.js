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
const attachBtn = document.getElementById('attach-btn'); // New: Get attach button
const imageInput = document.getElementById('image-input'); // New: Get hidden image input
const imagePreviewContainer = document.getElementById('image-preview-container'); // New: Container for image preview
const imagePreview = document.getElementById('image-preview'); // New: Image preview element
const closeImagePreview = document.getElementById('close-image-preview'); // New: Close preview button
const viewOnceToggle = document.getElementById('view-once-toggle'); // New: View once toggle


// Parse URL parameters for chat context
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id') || '';
const receiverId = urlParams.get('recipient_id') || '';
const recipientUsername = urlParams.get('recipient_username') ? decodeURIComponent(urlParams.get('recipient_username')) : 'User';
const recipientProfilePictureUrl = urlParams.get('recipient_profile_picture_url') ? decodeURIComponent(urlParams.get('recipient_profile_picture_url')) : '/default-avater.png';
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

// Track if a file is pending for upload (for image preview)
let pendingFile = null;

// Function to render product preview for initial message
function renderProductPreview() {
    if (productImage && productName && predefinedMessage && !isInitialMessageSent) {
        const previewContainer = document.createElement('div');
        previewContainer.id = 'product-preview';
        previewContainer.classList.add('url-photo-preview'); // Add a class for styling
        const isValidImageUrl = productImage.startsWith('http://') || productImage.startsWith('https://');
        previewContainer.innerHTML = `
            <div class="url-preview-content">
                <p class="url-preview-message">${predefinedMessage}</p>
                ${isValidImageUrl
                    ? `<img src="${productImage}" class="url-preview-image" alt="Product Preview" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                       <p style="display:none;color:red;">Failed to load product image.</p>`
                    : `<p style="color:red;">No product image available.</p>`}
                <p class="url-preview-product-name">${productName}</p>
            </div>
        `;
        chatMessages.insertAdjacentElement('beforebegin', previewContainer);
    }
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
    // Use the confirmed _id if available, otherwise use tempId for optimistic messages.
    // This allows us to find the element later for updates.
    const messageId = message._id || message.tempId;

    // IMPORTANT: Check if the message (by its FINAL _id) is already displayed.
    // This prevents duplicates when the server sends the confirmed message after optimistic display.
    if (message._id && displayedMessages.has(message._id)) {
        console.log(`Message ${message._id} already displayed. Skipping re-render.`);
        return;
    }

    // If this is an optimistic message and it corresponds to a message that now has a real _id,
    // we should let `updateOptimisticMessageId` handle it.
    if (isOptimistic && messageId.startsWith('temp_')) {
        // Store the optimistic message data, associated with its tempId
        // This map will be used by `updateOptimisticMessageId`
        optimisticMessagesMap.set(messageId, message);
    } else if (message._id && optimisticMessagesMap.has(message.tempId) && message.tempId) {
        // This branch should ideally not be hit if `updateOptimisticMessageId` works correctly
        // by handling the DOM update and `displayedMessages` Set.
        // If it does, it indicates a logic flow issue where `displayMessage` is called
        // for a confirmed message that *still* has an active optimistic entry.
        console.warn(`Display message for confirmed ID ${message._id} but optimistic entry ${message.tempId} exists. Potential double render.`);
        // Fall through to display for now, but inspect why.
    }

    const messageDate = new Date(message.createdAt);
    const formattedDate = formatMessageDate(messageDate);

    let displayText = message.content || message.text || '';
    let displayImageUrl = null; // Renamed from displayImage to avoid confusion with DOM element
    let offerDetails = message.offerDetails || {};

    // Parse message content for images or structured data
    if (message.messageType === 'image') {
        displayImageUrl = message.attachment?.url;
        // Optionally, use message.content for a caption if available
        if (!displayText && message.content) {
            displayText = message.content;
        } else if (!displayText) {
            displayText = 'Image'; // Default text for image-only messages
        }
    } else {
        let parsedFromJson = {};
        if (typeof message.text === 'string' && message.text.startsWith('{')) {
            try {
                parsedFromJson = JSON.parse(message.text);
                displayText = parsedFromJson.text || displayText;
                displayImageUrl = parsedFromJson.image || displayImageUrl;
                offerDetails = { ...offerDetails, ...parsedFromJson }; // Merge any offer details from text
            } catch (e) {
                console.warn('Failed to parse message text as JSON:', message.text, e);
                displayText = message.text; // Fallback to raw text
            }
        }
    }

    // Ensure image URLs are absolute if relative paths are used
    if (displayImageUrl && !displayImageUrl.match(/^https?:\/\//)) {
        displayImageUrl = displayImageUrl.startsWith('/') ? `${API_BASE_URL}${displayImageUrl}` : displayImageUrl;
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
        let systemImage = displayImageUrl;

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
        // Only add confirmed messages to displayedMessages Set
        if (message._id) {
            displayedMessages.add(message._id);
        }
        return; // System messages are handled, so return
    }

    // --- Regular Message Display ---
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    // Set a unique data-message-id, using tempId for optimistic, _id for confirmed
    msgDiv.dataset.messageId = messageId;

    // Add a class for optimistic messages for styling (e.g., lighter opacity)
    if (isOptimistic && messageId.startsWith('temp_')) {
        msgDiv.classList.add('optimistic-sending');
    }

    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    // Determine checkmark status
    let statusCheckmark = '';
    if (message.senderId === userId) {
        // If it's an optimistic message (still has tempId), show no checkmark or a single grey one
        if (isOptimistic || message.status === 'sending') {
            statusCheckmark = ''; // Or a single grey check: '✔' with a grey style
        } else if (message.status === 'seen') {
            statusCheckmark = '✔✔'; // Double check for seen
        } else if (message.status === 'delivered' || message.status === 'sent') {
            statusCheckmark = '✔'; // Single check for sent/delivered
        }
    }

// --- IMAGE DISPLAY LOGIC ---
if (message.messageType === 'image') {
    msgDiv.classList.add('image-message'); // Add a specific class for image messages

    if (message.viewOnce && message.viewOnce.enabled) {
        // Check if already viewed
        if (message.viewOnce.viewed) {
            // Show "Image was viewed and deleted" state
            msgDiv.classList.add('view-once-deleted-container');
            msgDiv.innerHTML = `
                <div class="view-once-deleted">
                    <i class="fas fa-eye-slash view-once-icon"></i>
                    <span class="view-once-text">This image was viewed and deleted</span>
                </div>
                <div class="message-timestamp">${time} ${statusCheckmark}</div>
            `;
        } else {
            // View-once image display (not yet viewed)
            msgDiv.classList.add('view-once-photo-container'); // Apply modern styling
            msgDiv.innerHTML = `
                <div class="view-once-overlay" data-src="${displayImageUrl || ''}" data-message-id="${message._id}" data-is-sender="${message.senderId === userId}">
                    <img src="${displayImageUrl || ''}" class="view-once-blurred-image" alt="One Time View Image">
                    <div class="view-once-text-overlay">
                        <span class="view-once-info-text">Uploaded photos are subject to one time view</span>
                        <i class="fas fa-eye view-once-icon"></i>
                        <span class="view-once-action-text">${message.senderId === userId ? 'Image Sent' : 'Tap to View'}</span>
                    </div>
                </div>
                <div class="message-timestamp">${time} ${statusCheckmark}</div>
            `;
            // Add click listener to the overlay for "view once" behavior, only if recipient
            if (message.senderId !== userId) {
                const overlay = msgDiv.querySelector('.view-once-overlay');
                if (overlay) {
                    overlay.addEventListener('click', function() {
                        const imgSource = this.dataset.src;
                        const messageId = this.dataset.messageId;
                        if (imgSource && messageId) {
                            this.innerHTML = `<img src="${imgSource}" class="view-once-actual-image" alt="View Once Image">`;
                            this.classList.remove('view-once-overlay'); // Remove overlay styling
                            this.classList.add('viewed-image-container'); // Add class for viewed state
                            this.removeEventListener('click', arguments.callee); // Remove listener after viewing

                            // Emit to server that the image has been viewed
                            socket.emit('imageViewed', {
                                messageId: messageId,
                                viewerId: userId
                            });

                            // Start deletion timer - hide image after 5 minutes
                            setTimeout(() => {
                                const viewedContainer = msgDiv.querySelector('.viewed-image-container');
                                if (viewedContainer) {
                                    viewedContainer.innerHTML = `
                                        <i class="fas fa-eye-slash view-once-icon"></i>
                                        <span class="view-once-text">This image was viewed and deleted</span>
                                    `;
                                    viewedContainer.classList.remove('viewed-image-container');
                                    viewedContainer.classList.add('view-once-deleted');
                                    msgDiv.classList.remove('view-once-photo-container');
                                    msgDiv.classList.add('view-once-deleted-container');
                                }
                            }, 300000); // 5 minutes (300,000 milliseconds)
                        } else {
                            showToast('Image not available.', 'error');
                        }
                    }, { once: true }); // Use { once: true } to auto-remove listener after first click
                }
            } else {
                // For the sender, prevent clicking and just show the blurred image with text
                const overlay = msgDiv.querySelector('.view-once-overlay');
                if (overlay) {
                    overlay.style.pointerEvents = 'none'; // Make it unclickable for the sender
                }
            }
        }
    } else {
        // Regular image display (non-view-once)
        msgDiv.innerHTML = `
            ${displayText ? `<div class="image-message-text">${displayText}</div>` : ''}
            ${displayImageUrl ? `
                <div class="image-container">
                    <img src="${displayImageUrl}" class="chat-image" alt="Chat Image"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                    <p style="display:none;color:red;">Failed to load image.</p>
                </div>
            ` : ''}
            <div class="message-timestamp">${time} ${statusCheckmark}</div>
        `;
    }
} else {
    // Regular text message display (existing code remains the same)
    msgDiv.innerHTML = `
        <div>${displayText}</div>
        ${displayImageUrl && message.messageType !== 'image' ? `<img src="${displayImageUrl}" class="product-photo-preview" alt="Product Image" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><p style="display:none;color:red;">Failed to load product image.</p>` : ''}
        <div class="message-timestamp">${time} ${statusCheckmark}</div>
    `;
}

    // --- Offer/Counter-offer buttons (existing logic) ---
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
            msgDiv.querySelector('.decline-offer-btn').disabled = true;
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
            msgDiv.querySelector('.end-bargain-btn').disabled = true;
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
    // This is crucial to prevent re-rendering already displayed messages.
    displayedMessages.add(messageId);
}

// Helper functions for optimistic updates
/**
 * Updates the temporary ID of an optimistic message to its confirmed database ID.
 * Also updates its status to 'delivered' and refreshes checkmarks.
 * @param {string} tempId - The temporary ID of the message.
 * @param {string} newMessageId - The actual database ID of the message.
 * @param {string} newStatus - The new status (e.g., 'delivered', 'seen').
 * @param {string} createdAt - The confirmed creation timestamp from the server.
 */
function updateOptimisticMessageId(tempId, newMessageId, newStatus, createdAt) {
    const optimisticMessageElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
    if (optimisticMessageElement) {
        optimisticMessageElement.dataset.messageId = newMessageId; // Update data attribute
        optimisticMessageElement.classList.remove('optimistic-sending'); // Remove any sending class

        // Update displayedMessages Set: remove old tempId, add new _id
        if (displayedMessages.has(tempId)) {
            displayedMessages.delete(tempId);
        }
        displayedMessages.add(newMessageId);

        // Update optimisticMessagesMap: remove old entry, add new entry with _id
        const optimisticMsg = optimisticMessagesMap.get(tempId);
        if (optimisticMsg) {
            optimisticMsg._id = newMessageId;
            optimisticMsg.status = newStatus;
            optimisticMsg.createdAt = createdAt; // Update with server's exact timestamp
            optimisticMessagesMap.delete(tempId);
            optimisticMessagesMap.set(newMessageId, optimisticMsg); // Map real ID to updated object

            // Update timestamp and checkmark
            const timestampElement = optimisticMessageElement.querySelector('.message-timestamp');
            if (timestampElement) {
                const timePart = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                let statusCheckmark = '';
                if (newStatus === 'seen') {
                    statusCheckmark = '✔✔';
                } else if (newStatus === 'delivered' || newStatus === 'sent') {
                    statusCheckmark = '✔';
                }
                timestampElement.textContent = `${timePart} ${statusCheckmark}`;
            }
        }
        console.log(`Optimistic message ${tempId} confirmed as ${newMessageId}. Status updated to ${newStatus}.`);
    } else {
        console.warn(`Optimistic message with temporary ID ${tempId} not found in DOM for update. This might mean the real message arrived first or it was a duplicate.`);
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

// --- Image Upload Logic ---
// Trigger the hidden file input when the attach button is clicked
attachBtn.addEventListener('click', () => {
    imageInput.click();
});

// Handle file selection from the hidden input
imageInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) {
        pendingFile = null; // Clear pending file if selection is cancelled
        imagePreviewContainer.style.display = 'none';
        return; // No file selected
    }

    if (!file.type.startsWith('image/')) {
        showToast('Only image files are allowed.', 'error');
        imageInput.value = ''; // Clear the input
        pendingFile = null;
        imagePreviewContainer.style.display = 'none';
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showToast('Image size exceeds 5MB limit.', 'error');
        imageInput.value = ''; // Clear the input
        pendingFile = null;
        imagePreviewContainer.style.display = 'none';
        return;
    }

    pendingFile = file; // Store the file temporarily

    // Show image preview
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreviewContainer.style.display = 'flex'; // Show the preview container
        typeSection.focus(); // Keep focus on input field
    };
    reader.readAsDataURL(file);
});

// Close image preview
closeImagePreview.addEventListener('click', () => {
    imagePreviewContainer.style.display = 'none';
    imagePreview.src = '';
    imageInput.value = ''; // Clear the file input
    pendingFile = null; // Clear pending file
});

// Send a new message from the chat input (modified to handle pending image)
sendBtn.onclick = async () => {
    const text = typeSection.value.trim();
    const isInitialMessage = !isInitialMessageSent && predefinedMessage && productImage;
    const isViewOnce = viewOnceToggle.checked; // Get view-once status from toggle

    // If an image is pending, send it
    if (pendingFile) {
        const file = pendingFile;
        const tempMessageId = `temp_${Date.now()}`;

        // Create a FileReader to get a preview (data URL) for optimistic display
        const reader = new FileReader();
        reader.onload = (e) => {
            const localImageUrl = e.target.result; // Data URL for immediate display

            // Optimistically display the image message
            displayMessage({
                senderId: userId,
                receiverId: receiverId,
                messageType: 'image',
                content: text, // Use text as caption for image
                attachment: { url: localImageUrl, filename: file.name },
                createdAt: new Date().toISOString(),
                isRead: false,
                tempId: tempMessageId,
                status: 'sending',
                viewOnce: {
                    enabled: isViewOnce,
                    viewed: false,
                    deleteAt: isViewOnce ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null // 5 minutes if view-once
                }
            }, true);
        };
        reader.readAsDataURL(file);

        const formData = new FormData();
        formData.append('image', file);
        formData.append('senderId', userId);
        formData.append('receiverId', receiverId);
        formData.append('messageType', 'image');
        formData.append('tempId', tempMessageId);
        formData.append('content', text); // Send text as caption
        formData.append('viewOnce', JSON.stringify({
            enabled: isViewOnce,
            viewed: false,
            deleteAt: isViewOnce ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null
        }));

        fetch(`${API_BASE_URL}/upload-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.message || 'Image upload failed'); });
            }
            return response.json();
        })
        .then(data => {
            console.log('Image upload successful:', data);

            const messageToSend = {
                receiverId,
                text: text, // Caption
                messageType: 'image',
                attachment: {
                    url: data.imageUrl,
                    fileType: 'image',
                    cloudinaryPublicId: data.publicId
                },
                viewOnce: {
                    enabled: isViewOnce,
                    viewed: false,
                    deleteAt: isViewOnce ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null
                },
                tempId: tempMessageId,
                senderId: userId,
                createdAt: new Date().toISOString(),
                isRead: false
            };

            socket.emit('sendMessage', messageToSend);
            console.log('Emitted image message via socket:', messageToSend);
        })
        .catch(error => {
            console.error('Error uploading image:', error);
            showToast(`Failed to send image: ${error.message}`, 'error');
            removeOptimisticMessage(tempMessageId);
        });

        // Clear preview and input after sending
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '';
        imageInput.value = '';
        pendingFile = null;
        typeSection.value = ''; // Clear text input as well
        viewOnceToggle.checked = false; // Reset toggle

        return; // Exit as image sending is handled
    }

    // If no image is pending, proceed with text message
    if (!text && !predefinedMessage) {
        showToast('Please enter a message or select an image.', 'error');
        return;
    }

    // Generate a temporary ID for optimistic UI
    const tempMessageId = `temp_${Date.now()}`;

    // Construct the message object to send
    const messageToSend = {
        receiverId,
        text: isInitialMessage ? JSON.stringify({ text, image: productImage }) : text,
        messageType: 'text', // Default to text
        createdAt: new Date().toISOString(), // Use client-side timestamp for optimistic display
        isRead: false,
        tempId: tempMessageId, // Include tempId for optimistic UI
        senderId: userId, // Ensure senderId is explicitly set
        // Add other properties if relevant (e.g., offerDetails, attachment)
        // For predefined message, the server will handle offerDetails from `text` JSON
    };

    // Optimistically display the message immediately
    // Pass the message with the tempId as its _id for initial display logic
    displayMessage({ ...messageToSend, _id: tempMessageId, status: 'sending' }, true);

    // Clear input field
    typeSection.value = '';
    viewOnceToggle.checked = false; // Reset toggle

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

// NEW: Listener for message status updates (primarily for the sender's own messages)
// This will update the tempId to the real _id and update the status (e.g., to 'delivered').
socket.on('messageStatusUpdate', ({ _id, tempId, status, createdAt, attachment, viewOnce }) => {
    console.log(`Received messageStatusUpdate: tempId=${tempId}, _id=${_id}, status=${status}`);
    if (tempId) {
        // Retrieve the optimistic message from the map
        const optimisticMsg = optimisticMessagesMap.get(tempId);
        if (optimisticMsg) {
            // Update the optimistic message with confirmed details from the server
            optimisticMsg._id = _id;
            optimisticMsg.status = status;
            optimisticMsg.createdAt = createdAt;
            // Crucial: Update attachment URL and viewOnce status if it's an image
            if (attachment && attachment.url) {
                optimisticMsg.attachment = attachment;
            }
            if (typeof viewOnce === 'boolean') {
                optimisticMsg.viewOnce = { enabled: viewOnce, viewed: false, deleteAt: null };
            }
            if (typeof viewOnce === 'object' && viewOnce !== null) {
                optimisticMsg.viewOnce = viewOnce; // Update full viewOnce object
            }
            // Remove the old optimistic message from DOM and display the confirmed one.
            // This ensures all properties (like viewOnce) are correctly applied.
            removeOptimisticMessage(tempId);
            displayMessage(optimisticMsg); // Re-display with full confirmed details
            console.log(`Optimistic message ${tempId} confirmed as ${_id} and re-rendered.`);
        } else {
            console.warn(`Optimistic message with tempId ${tempId} not found in map for status update. Displaying new message.`);
            // If the optimistic message wasn't found (e.g., page refresh before confirmation),
            // ensure the message is still displayed if it's genuinely new.
            if (!displayedMessages.has(_id)) {
                displayMessage({ _id, status, createdAt, attachment, viewOnce, tempId, ...optimisticMsg }); // Pass all available info
            }
        }
    } else {
        // This case handles status updates for messages that might already be fully loaded,
        // or messages that never had a tempId (e.g., from other devices).
        // Ensure its status (checkmark) is updated if it exists in DOM.
        const messageElement = chatMessages.querySelector(`[data-message-id="${_id}"]`);
        if (messageElement) {
            const timestampElement = messageElement.querySelector('.message-timestamp');
            if (timestampElement) {
                const timePart = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                let statusCheckmark = '';
                if (status === 'seen') {
                    statusCheckmark = '✔✔';
                } else if (status === 'delivered' || status === 'sent') {
                    statusCheckmark = '✔';
                }
                timestampElement.textContent = `${timePart} ${statusCheckmark}`;
            }
        }
    }

    // Also, if this message is being updated to 'delivered' or 'seen', ensure it's saved to localStorage
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    const existingIndex = storedMessages.findIndex(msg => msg._id === _id || msg.tempId === tempId);

    if (existingIndex !== -1) {
        // Update existing message in localStorage with new _id, status, and createdAt
        const updatedMsg = { ...storedMessages[existingIndex], _id, status, createdAt };
        if (tempId) delete updatedMsg.tempId; // Remove tempId once real ID is known
        if (attachment) updatedMsg.attachment = attachment;
        if (typeof viewOnce === 'boolean') updatedMsg.viewOnce = { enabled: viewOnce, viewed: false, deleteAt: null };
        if (typeof viewOnce === 'object' && viewOnce !== null) updatedMsg.viewOnce = viewOnce;
        storedMessages[existingIndex] = updatedMsg;
    } else {
        // If it's a new confirmed message not previously in local storage (e.g., from another device)
        // You might need to fetch the full message details from the server or ensure `newMessage` handles it.
        // For now, this scenario should largely be covered by the `newMessage` listener.
        console.warn(`messageStatusUpdate received for _id ${_id} but not found in local storage for update.`);
    }
    localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
});


// Handle incoming messages for display
// This event is fired when a message is sent to the chat room,
// meaning both sender and receiver will receive it here if they're in the chat.
socket.on('newMessage', message => {
    console.log('Received newMessage (from chat_room):', message);

    // If the message has a tempId and we have an optimistic message matching it,
    // this means it's the server's confirmation for our own sent message.
    // `messageStatusUpdate` should have updated the DOM for the sender.
    // For the receiver, it's always a new message.
    if (!displayedMessages.has(message._id)) {
        displayMessage(message); // Display the message
        console.log(`Displaying new message with _id: ${message._id}`);
    } else {
        // If message is already displayed (by its _id), it could be a redundant emit
        // or a status update for an existing message (e.g., if a previous `newMessage` only had 'sent' status
        // and a later one confirms 'delivered' for some edge case).
        // It's safer to only update its visual status if it's already rendered.
        console.log(`Message ${message._id} already in DOM. Checking for status update.`);
        const messageElement = chatMessages.querySelector(`[data-message-id="${message._id}"]`);
        if (messageElement) {
            const timestampElement = messageElement.querySelector('.message-timestamp');
            if (timestampElement) {
                let statusText = timestampElement.textContent.split(' ')[0]; // Get only the time part
                if (message.status === 'seen') {
                    statusText += ' ✔✔';
                } else if (message.status === 'delivered') {
                    statusText += ' ✔';
                }
                timestampElement.textContent = statusText; // Update checkmarks
            }
        }
    }

    // Mark as seen if this message is received by the current user and not yet seen
    // Ensure this is only for messages *from* the other person *to* us *in this chat*.
    if (message.receiverId === userId && message.senderId === receiverId && message.status !== 'seen') {
        console.log('Emitting markAsSeen for message:', message._id);
        socket.emit('markAsSeen', {
            messageIds: [message._id],
            senderId: message.senderId, // The person who sent the message
            receiverId: userId // The person who received and is now seeing it
        });
    }

    // Update local storage for persistence
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    const existingIndex = storedMessages.findIndex(msg => msg._id === message._id); // Find by actual _id

    if (existingIndex !== -1) {
        storedMessages[existingIndex] = message; // Update existing message with new status/details
    } else {
        // Only push if it's a truly new message to store (and has a confirmed _id)
        if (message._id && !message._id.startsWith('temp_')) {
             storedMessages.push(message);
        }
    }
    localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));

    // Show toast for new incoming messages from other users
    // This listener also gets our own messages back, so only toast if from the other user
    if (message.senderId !== userId) {
        showToast(`New message from ${recipientUsername}`, 'success');
    }
});

// Handle 'messagesSeen' event (for sender's UI to update checkmarks)
socket.on('messagesSeen', ({ messageIds, seenBy, seenAt }) => {
    console.log(`Received messagesSeen event for IDs: ${messageIds} seen by ${seenBy}`);
    // Check if the current user is the sender of these messages
    // The event means *our* messages were seen *by the other person (seenBy == receiverId)*
    if (seenBy === receiverId) {
        messageIds.forEach((messageId) => {
            const messageDiv = chatMessages.querySelector(`.message.sent[data-message-id="${messageId}"]`);
            if (messageDiv) {
                const timestamp = messageDiv.querySelector('.message-timestamp');
                if (timestamp && !timestamp.textContent.includes('✔✔')) { // Only update if not already double-checked
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
    console.log('Received newMessageNotification:', notification);
    // Only show toast if it's not a message from the currently active chat partner
    // or if the user is not currently focused on the browser tab/window.
    // This allows for toasts when the user is on another app or tab.
    if (notification.senderId !== receiverId || !document.hasFocus()) {
        showToast(`New message from ${notification.senderName}: ${notification.text}`, 'success');
    }
});

// Listener for when a view-once image has been 'viewed' on the backend.
// This allows you to update the UI on other devices or to confirm deletion.
socket.on('imageViewedConfirmation', ({ messageId, viewerId }) => {
    console.log(`Image message ${messageId} confirmed as viewed by ${viewerId}.`);
    const messageDiv = chatMessages.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageDiv) {
        let overlay = messageDiv.querySelector('.view-once-overlay');
        if (overlay) {
            // Update the overlay to show "Image Viewed"
            overlay.innerHTML = `<i class="fas fa-eye-slash view-once-icon"></i><span class="view-once-text">Image Viewed</span>`;
            overlay.classList.remove('view-once-overlay');
            overlay.classList.add('viewed-image-container');
            overlay.style.pointerEvents = 'none'; // Make it unclickable
        }
        // If the image was already displayed (e.g., by the sender), dim it
        let actualImage = messageDiv.querySelector('.view-once-actual-image');
        let blurredImage = messageDiv.querySelector('.view-once-blurred-image');
        if (actualImage) {
            actualImage.style.opacity = '0.5'; // Example: dim the image after it's viewed
            // Add a "Viewed" label
            const viewedLabel = document.createElement('span');
            viewedLabel.textContent = ' (Viewed)';
            viewedLabel.style.fontSize = '0.8em';
            viewedLabel.style.color = '#777';
            if (!messageDiv.querySelector('.viewed-label')) {
                viewedLabel.classList.add('viewed-label');
                messageDiv.querySelector('.message-timestamp').prepend(viewedLabel);
            }
        } else if (blurredImage) {
            // If it's the sender's side showing the blurred image, dim it further and update text
            blurredImage.style.filter = 'blur(8px) brightness(0.7)'; // Even more blur/dim
            const infoText = messageDiv.querySelector('.view-once-info-text');
            const actionText = messageDiv.querySelector('.view-once-action-text');
            if (infoText) infoText.textContent = 'Image was viewed by recipient';
            if (actionText) actionText.style.display = 'none'; // Hide "Image Sent"
        }
    }
});

// Listener for when a view-once image has been 'deleted' on the backend.
socket.on('imageViewDeleted', ({ messageId }) => {
    console.log(`Image message ${messageId} confirmed as deleted.`);
    const messageDiv = chatMessages.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageDiv) {
        messageDiv.classList.remove('view-once-photo-container', 'viewed-image-container');
        messageDiv.classList.add('view-once-deleted-container');
        messageDiv.innerHTML = `
            <div class="view-once-deleted">
                <i class="fas fa-eye-slash view-once-icon"></i>
                <span class="view-once-text">This image was viewed and deleted</span>
            </div>
            ${messageDiv.querySelector('.message-timestamp') ? messageDiv.querySelector('.message-timestamp').outerHTML : ''}
        `;
    }
});


// Load chat history (still useful for initial load and offline sync)
async function loadChatHistory() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            showToast('Please log in to view messages', 'error');
            window.location.href = 'SignIn.html';
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
            // Only check for messages from the current user (senderId)
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
        displayedMessages.clear(); // Clear previously displayed messages for fresh load
        optimisticMessagesMap.clear(); // Clear any lingering optimistic messages
        validMessages.forEach(msg => displayMessage(msg)); // Display all valid messages
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(validMessages)); // Update local storage
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to bottom

        // After loading history, if the current user is the receiver and there are unread messages from this sender,
        // mark them as seen.
        const unreadMessagesFromSender = validMessages.filter(msg =>
            msg.receiverId === userId && msg.senderId === receiverId && !msg.isRead && msg.status !== 'seen'
        ).map(msg => msg._id);

        if (unreadMessagesFromSender.length > 0) {
            console.log(`Marking ${unreadMessagesFromSender.length} messages as seen after loading history.`);
            socket.emit('markAsSeen', {
                messageIds: unreadMessagesFromSender,
                senderId: receiverId, // The other participant is the sender of these messages
                receiverId: userId // We are the receiver
            });
        }

    } catch (error) {
        console.error('Error loading chat history:', error);
        showToast(`Failed to load messages: ${error.message}`, 'error');
        // Fallback to local storage if API call fails
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        lastDisplayedDate = null;
        displayedMessages.clear();
        optimisticMessagesMap.clear(); // Clear optimistic on fallback too
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

// Event listener for enlarging images (modified to also handle view-once images)
document.getElementById('chat-messages').addEventListener('click', (e) => {
    // If a regular chat image or product preview is clicked
    if (e.target.classList.contains('chat-image') || e.target.classList.contains('product-photo-preview') || e.target.classList.contains('receipt-image')) {
        const image = e.target;
        openImageModal(image.src);
    }
    // The 'view-once-overlay' has its own click handler to reveal the image
    // Once revealed, the 'view-once-actual-image' can also be enlarged if clicked again.
    else if (e.target.classList.contains('view-once-actual-image')) {
        const image = e.target;
        openImageModal(image.src);
    }
});

function openImageModal(imageUrl) {
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
    img.src = imageUrl;
    img.style.maxWidth = '90%';
    img.style.maxHeight = '90%';
    img.style.borderRadius = '10px';
    img.style.objectFit = 'contain'; // Ensure image scales correctly

    img.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent modal from closing when clicking the image
    });

    modal.appendChild(img);
    document.body.appendChild(modal);

    modal.addEventListener('click', () => {
        document.body.removeChild(modal); // Close modal when clicking outside the image
    });
}


// Add typing indicator trigger
typeSection.addEventListener('input', sendTypingSignal);

// Debug all socket events for development
socket.onAny((event, ...args) => {
    console.log(`Socket event received: ${event}`, args);
});
