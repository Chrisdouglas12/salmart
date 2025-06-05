// socket.js

// Initialize Socket.IO connection with WebSocket and polling transports
const socket = io(API_BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: localStorage.getItem('authToken') }
});

// Join chat room if userId and receiverId are available
if (userId && receiverId) socket.emit('joinRoom', userId);

// Handle incoming messages
socket.on('newMessage', message => {
    // Filter messages for the current conversation
    if (!((message.senderId === userId && message.receiverId === receiverId) ||
          (message.senderId === receiverId && message.receiverId === userId))) {
        return;
    }

    if (message.messageType === 'buyerAccept') {
        let parsed;
        try {
            parsed = JSON.parse(message.text);
        } catch (e) {
            console.warn('Failed to parse buyerAccept message text in newMessage:', message.text, e);
            return;
        }

        // Display only for the buyer
        if (message.receiverId === userId) {
            displayMessage(message);
        } else {
            console.log('Skipping buyerAccept message for non-buyer:', {
                productId: parsed.productId,
                userId,
                receiverId: message.receiverId
            });
            return;
        }
    } else {
        displayMessage(message);
    }

    // Mark message as seen if received by the user
    if (message.receiverId === userId && message.status !== 'seen') {
        socket.emit('markAsSeen', {
            messageIds: [message._id],
            senderId: message.senderId,
            receiverId: userId
        });
    }

    showToast(`New message from ${recipientUsername}`, 'success');

    // Store message in localStorage as a fallback
    const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
    storedMessages.push(message);
    localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
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