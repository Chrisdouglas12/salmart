// config.js

// API base URL configuration for local and production environments
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://salmart.onrender.com';

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
const recipientUsername = urlParams.get('recipient_username') 
    ? decodeURIComponent(urlParams.get('recipient_username')) 
    : 'User';
const recipientProfilePictureUrl = urlParams.get('recipient_profile_picture_url') 
    ? decodeURIComponent(urlParams.get('recipient_profile_picture_url')) 
    : '/default-avatar.png';
const predefinedMessage = urlParams.get('message') 
    ? decodeURIComponent(urlParams.get('message')) 
    : '';
const productImage = urlParams.get('product_image') 
    ? decodeURIComponent(urlParams.get('product_image')) 
    : '';
const productId = urlParams.get('product_id') || '';
const productName = urlParams.get('product_name') 
    ? decodeURIComponent(urlParams.get('product_name')) 
    : '';
const originalPrice = urlParams.get('original_price') 
    ? parseFloat(urlParams.get('original_price')) 
    : null;

// Log product details for debugging
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

// Track state variables
const endedBargains = new Set();
const bargainingSessions = new Set();
const acceptedOffers = new Set();
const sentCounterOffers = new Set();
const displayedMessages = new Set();
const displayedMessages = new Set();
let isInitialMessageSent = localStorage.getItem(`initialMessageSent_${productId}_${receiverId}`) === 'true';