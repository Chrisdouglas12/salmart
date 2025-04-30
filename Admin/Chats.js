const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://salmart-production.up.railway.app';
const socket = io(API_BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling']
});

const chatMessages = document.getElementById('chat-messages');
const typeSection = document.getElementById('type-section');
const sendBtn = document.getElementById('send-btn');
const bargainBtn = document.getElementById('bargain-btn');
const typingIndicator = document.getElementById('typing-indicator');
const lastPriceModal = document.getElementById('lastPriceModal');
const lastPriceInput = document.getElementById('lastPriceInput');
const submitLastPriceBtn = document.getElementById('submitLastPriceBtn');

// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id');
const receiverId = urlParams.get('recipient_id');
const recipientUsername = urlParams.get('recipient_username');
const recipientProfilePictureUrl = urlParams.get('recipient_profile_picture_url');
const predefinedMessage = urlParams.get('message') ? decodeURIComponent(urlParams.get('message')) : '';
const productImage = urlParams.get('product_image') ? decodeURIComponent(urlParams.get('product_image')) : '';

// Set recipient info
document.getElementById('chats-userName').textContent = recipientUsername;
document.getElementById('chatspic').src = recipientProfilePictureUrl;

// Pre-fill chat input with the predefined message
if (predefinedMessage) {
    typeSection.value = predefinedMessage;
}

// Display product image preview
if (productImage) {
    const previewContainer = document.createElement('div');
    previewContainer.id = 'product-preview';
    previewContainer.style.margin = '10px';
    previewContainer.style.textAlign = 'center';
    previewContainer.innerHTML = `
        <p style="font-size: 14px; color: #777;">Product Preview</p>
        <img src="${productImage}" class="product-photo-preview" alt="Product Preview" style="max-width: 100px; border-radius: 5px;">
    `;
    chatMessages.insertAdjacentElement('beforebegin', previewContainer);
}

if (userId && receiverId) socket.emit('joinRoom', userId);



function displayMessage(message) {
    const messageDate = new Date(message.createdAt);
    const formattedDate = formatMessageDate(messageDate);

    if (formattedDate !== lastDisplayedDate) {
        const dateSeparator = document.createElement('div');
        dateSeparator.textContent = formattedDate;
        dateSeparator.style.textAlign = 'center';
        dateSeparator.style.margin = '10px 0';
        dateSeparator.style.color = '#777';
        dateSeparator.style.fontSize = '14px';
        chatMessages.appendChild(dateSeparator);
        lastDisplayedDate = formattedDate;
    }

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    if (message.messageType === 'image') {
        const imageUrl = 
            (message.attachment && message.attachment.url) || 
            message.attachment || 
            message.content;

        if (imageUrl) {
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

    let msg = message.text, img = null, parsed;
    try {
        parsed = JSON.parse(message.text);
        msg = parsed.text;
        img = parsed.image;
    } catch {
        msg = message.text;
    }

    msgDiv.innerHTML = `
        <div>${msg}</div>
        ${img ? `<img src="${img}" class="product-photo-preview">` : ''}
        <div class="message-timestamp">${time} ${message.isRead ? '✔✔' : ''}</div>
    `;

    if (parsed && parsed.offer && message.receiverId === userId) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-offer-btn';
        acceptBtn.textContent = 'Accept';
        acceptBtn.onclick = () => {
            const productDetails = {
                productId: parsed.productId,
                productName: parsed.productName,
                offer: parsed.offer,
                senderId: message.senderId
            };
            document.getElementById('confirmationMessage').textContent = 
                `Are you sure you want to accept the offer of ₦${parsed.offer} for "${parsed.productName}"?`;
            const acceptModal = document.getElementById('acceptConfirmationModal');
            acceptModal.style.display = 'block';
            document.getElementById('confirmAcceptBtn').onclick = async () => {
                try {
                    const response = await fetch(`${API_BASE_URL}/posts/${productDetails.productId}/update-price`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newPrice: productDetails.offer })
                    });
                    if (response.ok) {
                        const acceptanceMessage = {
                            senderId: userId,
                            receiverId: productDetails.senderId,
                            text: JSON.stringify({
                                text: `Your offer for "${productDetails.productName}" has been accepted. New price is ₦${Number(productDetails.offer).toLocaleString('en-NG')}`,
                                productId: productDetails.productId,
                                productName: parsed.productName,
                                offer: productDetails.offer,
                                payment: true
                            }),
                            createdAt: new Date(),
                            isRead: false
                        };
                        socket.emit('sendMessage', acceptanceMessage);
                        displayMessage(acceptanceMessage);
                        acceptModal.style.display = 'none';
                        showToast('Price updated successfully!');
                    } else {
                        acceptModal.style.display = 'none';
                        showToast('Failed to update price. Please try again.', 'error');
                    }
                } catch (error) {
                    console.error('Error updating price:', error);
                    acceptModal.style.display = 'none';
                    showToast('An error occurred while updating the price.', 'error');
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
            openLastPriceModal(parsed.productId, parsed.productName);
        };

        msgDiv.appendChild(acceptBtn);
        msgDiv.appendChild(declineBtn);
    }

    if (parsed && parsed.payment && message.receiverId === userId) {
        const paymentBtn = document.createElement('button');
        paymentBtn.className = 'proceed-to-payment-btn';
        paymentBtn.textContent = 'Proceed to Payment';
        const verifyPayment = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/payment-success?productId=${parsed.productId}&buyerId=${userId}`);
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
                console.error('Payment verification error:', error);
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
                        alert('Please log in to make a payment');
                        return;
                    }
                    try {
                        paymentBtn.disabled = true;
                        paymentBtn.textContent = 'Processing...';
                        const response = await fetch(`${API_BASE_URL}/pay`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, postId, buyerId }),
                        });
                        const result = await response.json();
                        if (result.success) {
                            window.location.href = result.url;
                        } else {
                            paymentBtn.disabled = false;
                            paymentBtn.textContent = 'Proceed to Payment';
                            alert('Payment initiation failed: ' + (result.message || 'Please try again'));
                        }
                    } catch (error) {
                        console.error('Payment error:', error);
                        paymentBtn.disabled = false;
                        paymentBtn.textContent = 'Proceed to Payment';
                        alert('Payment processing error');
                    }
                };
            }
        });
        msgDiv.appendChild(paymentBtn);
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function openLastPriceModal(productId, productName) {
    lastPriceModal.style.display = 'block';
    submitLastPriceBtn.onclick = () => {
        const lastPrice = lastPriceInput.value.trim();
        if (lastPrice) {
            socket.emit('sendMessage', {
                senderId: userId,
                receiverId: receiverId,
                text: JSON.stringify({
                    text: `I can give you "${productName}" for ₦${Number(lastPrice).toLocaleString('en-NG')}`,
                    offer: lastPrice,
                    productId: productId,
                    productName: productName,
                    image: ''
                }),
                createdAt: new Date()
            });
            closeLastPriceModal();
        }
    };
}

if (!window.location.pathname.includes("Chats.html")) {
    verifyPayment();
}

function closeLastPriceModal() {
    lastPriceModal.style.display = 'none';
    lastPriceInput.value = '';
}

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

socket.on('receiveMessage', message => {
    if ((message.senderId === userId && message.receiverId === receiverId) || 
        (message.senderId === receiverId && message.receiverId === userId)) {
        displayMessage(message);
        socket.emit('markAsRead', { messageId: message._id });
        showToast(`New message from ${recipientUsername}`, 'success');
    }
});

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

function sendTypingSignal() {
    socket.emit('typing', { senderId: userId, receiverId });
}

socket.on('typing', data => {
    if (data.senderId === receiverId) {
        typingIndicator.textContent = `${recipientUsername} is typing...`;
        setTimeout(() => typingIndicator.textContent = '', 3000);
    }
});

bargainBtn.onclick = async () => {
    document.getElementById('bargainModal').style.display = 'block';
    try {
        const res = await fetch(`${API_BASE_URL}/products?sellerId=${receiverId}`);
        const products = await res.json();
        const container = document.getElementById('bargainProductsContainer');
        container.innerHTML = '';
        if (!products.length) return container.innerHTML = '<p>No products available.</p>';
        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${product.photo}" alt="">
                <div>
                    <strong>${product.description}</strong><br>
                    ₦${Number(product.price).toLocaleString('en-NG')}<br>
                    <input type="number" class="bargain-price-input" placeholder="Your Offer Price">
                    <button class="confirm-bargain-btn">Send Offer</button>
                </div>
            `;
            card.querySelector('.confirm-bargain-btn').onclick = () => {
                const price = card.querySelector('.bargain-price-input').value;
                if (price) {
                    const message = {
                        senderId: userId,
                        receiverId,
                        text: JSON.stringify({
                            text: `My offer for "${product.description}" is ₦${Number(price).toLocaleString('en-NG')}`,
                            offer: price,
                            productId: product._id,
                            productName: product.description,
                            image: product.photo
                        }),
                        createdAt: new Date()
                    };
                    socket.emit('sendMessage', message);
                    displayMessage(message);
                    closeBargainModal();
                }
            };
            container.appendChild(card);
        });
    } catch (e) {
        document.getElementById('bargainProductsContainer').innerHTML = '<p>Error loading products.</p>';
    }
};

function closeBargainModal() {
    document.getElementById('bargainModal').style.display = 'none';
}

socket.on('priceUpdateResponse', data => {
    if ((data.senderId === receiverId && data.receiverId === userId) || 
        (data.senderId === userId && data.receiverId === receiverId)) {
        displayMessage(data);
    }
});

socket.on('offerAccepted', response => {
    if ((response.senderId === receiverId && response.receiverId === userId) || 
        (response.senderId === userId && response.receiverId === receiverId)) {
        displayMessage(response);
    }
});

socket.on('connect', () => {
    console.log('Connected to server');
    if (userId) {
        socket.emit('joinRoom', userId);
    }
});

socket.on('notification', data => {
    console.log('Received notification:', data);
    showToast(`${data.sender.firstName} ${data.sender.lastName} ${data.type === 'like' ? 'liked' : 'commented on'} your post`, 'success');
});

function likePost(postId, userId) {
    socket.emit('likePost', { postId, userId });
}

function commentPost(postId, userId, comment) {
    socket.emit('commentPost', { postId, userId, comment });
}

function sendMessage(senderId, receiverId, text) {
    socket.emit('sendMessage', { senderId, receiverId, text });
}

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

const ellipsisBtn = document.getElementById('ellipsis-btn');
const chatDropdown = document.getElementById('chat-dropdown');

ellipsisBtn.addEventListener('click', () => {
    chatDropdown.style.display = chatDropdown.style.display === 'block' ? 'none' : 'block';
});

window.addEventListener('click', function(e) {
    if (!ellipsisBtn.contains(e.target) && !chatDropdown.contains(e.target)) {
        chatDropdown.style.display = 'none';
    }
});

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
                window.location.href = 'chats.html';
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