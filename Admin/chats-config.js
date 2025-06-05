
    // Decide where to connect based on whether you're testing locally or on the live site
    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://salmart.onrender.com';

    // Connect to the server for real-time chat
    const socket = io(API_BASE_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth: { token: localStorage.getItem('authToken') }
    });

    // Get the parts of the chat interface (like the message area, buttons, etc.)
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

    // Get user and product details from the web address
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

    // Make sure we have the user and recipient IDs, or show an error
    if (!userId || !receiverId) {
        showToast('Missing user or recipient ID. Please try again.', 'error');
        window.location.href = 'index.html';
    }

    // Show the recipient's name and picture in the chat
    document.getElementById('chats-userName').textContent = recipientUsername;
    document.getElementById('chatspic').src = recipientProfilePictureUrl;

    // If there's a pre-written message, put it in the text box
    if (predefinedMessage) {
        typeSection.value = predefinedMessage;
    } else {
        typeSection.value = '';
    }

    // Keep track of bargains and messages
    const endedBargains = new Set();
    const bargainingSessions = new Set();
    const acceptedOffers = new Set();
    const sentCounterOffers = new Set();
    const displayedMessages = new Set();
    let isInitialMessageSent = localStorage.getItem(`initialMessageSent_${productId}_${receiverId}`) === 'true';

    // Show a preview of the product at the top of the chat
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

    // Join the chat room if we have the user IDs
    if (userId && receiverId) socket.emit('joinRoom', userId);

    // Format the date for messages (e.g., "Today", "Yesterday")
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

    // Send typing signal when user starts typing
    function sendTypingSignal() {
        socket.emit('typing', { senderId: userId, receiverId });
    }

    // Attach typing indicator to input field
    typeSection.addEventListener('input', sendTypingSignal);
