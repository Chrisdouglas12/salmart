// product-details.js
const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);

    const productId = params.get('postId');
    const productImage = params.get('productImage');
    const productTitle = params.get('productTitle');
    const productDescription = params.get('productDescription');
    const productLocation = params.get('productLocation');
    const productCondition = params.get('productCondition');
    const productPrice = params.get('productPrice');
    const sellerId = params.get('sellerId');

    // Populate the HTML elements
    document.getElementById('productImage').src = productImage || '/salmart-192x192.png';
    document.getElementById('productTitle').textContent = productTitle;
    document.getElementById('productPrice').textContent = productPrice;
    document.getElementById('productDescription').textContent = productDescription;
    document.getElementById('productLocation').textContent = productLocation;
    document.getElementById('productCondition').textContent = productCondition;

    // Make product data available for buttons
    const productData = {
        postId: productId,
        productImage: productImage,
        productTitle: productTitle,
        productDescription: productDescription,
        productLocation: productLocation,
        productCondition: productCondition,
        productPrice: productPrice,
        sellerId: sellerId
    };

    // --- Optional: Fetch Seller Details for Chat if not passed via URL ---
    let sellerUsername = "Seller"; // Default
    let sellerProfilePicture = "/salmart-192x192.png"; // Default

    if (sellerId) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/users/${sellerId}`);
            if (response.ok) {
                const sellerInfo = await response.json();
                sellerUsername = sellerInfo.name || "Seller";
                sellerProfilePicture = sellerInfo.profilePicture || "/salmart-192x192.png";
            } else {
                console.warn(`Could not fetch seller info for ID: ${sellerId}. Status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching seller details:', error);
        }
    }
    // --- End Optional Seller Details Fetch ---

    // Add event listeners for the new buttons
    const buyWithEscrowBtn = document.getElementById('buyWithEscrowBtn');
    const chatSellerBtn = document.getElementById('chatSellerBtn');

    if (buyWithEscrowBtn) {
        // Pass productData, as the handleBuyWithEscrow function needs it
        buyWithEscrowBtn.addEventListener('click', () => handleBuyWithEscrow(productData));
    }

    if (chatSellerBtn) {
        // Pass fetched seller details to handleChatSeller
        chatSellerBtn.addEventListener('click', () => handleChatSeller(productData, sellerUsername, sellerProfilePicture));
    }

    // Toast message function (copy-pasted for independence, or link a shared utility)
    function showToast(message, bgColor = '#333') {
        const toast = document.getElementById('toast-message');
        if (!toast) {
            console.error('Toast message element not found.');
            // Fallback for development if toast element is missing in HTML
            const tempToast = document.createElement('div');
            tempToast.className = 'toast-message';
            tempToast.style.position = 'fixed';
            tempToast.style.bottom = '20px';
            tempToast.style.left = '50%';
            tempToast.style.transform = 'translateX(-50%)';
            tempToast.style.backgroundColor = '#333';
            tempToast.style.color = 'white';
            tempToast.style.padding = '10px 20px';
            tempToast.style.borderRadius = '5px';
            tempToast.style.zIndex = '1000';
            tempToast.style.transition = 'opacity 0.5s ease-in-out';
            tempToast.style.opacity = '0';
            document.body.appendChild(tempToast);
            window.showToast = (msg, bg) => {
                tempToast.textContent = msg;
                tempToast.style.backgroundColor = bg;
                tempToast.style.opacity = '1';
                setTimeout(() => tempToast.style.opacity = '0', 3000);
            };
            window.showToast(message, bgColor); // Call the newly created toast
            return;
        }
        toast.textContent = message;
        toast.style.backgroundColor = bgColor;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            // setTimeout(() => toast.remove(), 500); // Only if you create it dynamically
        }, 3000);
    }
    window.showToast = showToast; // Make it globally available for consistency
});


async function handleBuyWithEscrow(product) {
    const email = localStorage.getItem('email');
    const buyerId = localStorage.getItem('userId');
    const authToken = localStorage.getItem('authToken'); // Get auth token

    if (!email || !buyerId || !product.postId || !authToken) { // Check for authToken
        window.showToast("Please log in to make a purchase or complete your profile.", '#dc3545');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`, // Added Authorization header
            },
            body: JSON.stringify({
                email,
                postId: product.postId,
                buyerId,
                currency: 'NGN',
            }),
        });

        const result = await response.json();

        // Redirect to result.url on success, as per your request
        if (response.ok && result.success && result.url) {
            window.location.href = result.url;
        } else {
            // Show message if payment initiation failed or no URL was provided
            window.showToast(`Payment failed: ${result.message || 'Please try again.'}`, '#dc3545');
        }
    } catch (error) {
        console.error('Payment error:', error);
        window.showToast('Failed to process payment. Please try again.', '#dc3545');
    }
}

async function handleChatSeller(product, recipientUsername, recipientProfilePictureUrl) {
    const loggedInUser = localStorage.getItem('userId');
    if (!loggedInUser) {
        window.showToast("Please log in to chat with the seller.", '#dc3545');
        setTimeout(() => {
            window.location.href = 'SignIn.html';
        }, 1500);
        return;
    }

    if (!product || !product.sellerId || !product.productTitle || !product.productImage || !product.postId) {
        window.showToast('Seller or product information missing.', '#dc3545');
        console.error('Missing seller or product info for chat:', product);
        return;
    }

    let productImage = product.productImage;
    // Ensure product image URL is absolute if it's relative
    if (productImage && !productImage.match(/^https?:\/\//)) {
        productImage = productImage.startsWith('/') ? `${API_BASE_URL}${productImage}` : `${API_BASE_URL}/${productImage}`;
    }

    const message = `I'm ready to pay for this now, is it still available?\n\nProduct: ${product.productDescription || product.productTitle}`;
    const encodedMessage = encodeURIComponent(message);
    const encodedProductImage = encodeURIComponent(productImage);
    const encodedRecipientUsername = encodeURIComponent(recipientUsername);
    const encodedRecipientProfilePictureUrl = encodeURIComponent(recipientProfilePictureUrl);
    const encodedProductDescription = encodeURIComponent(product.productDescription || product.productTitle);

    const chatUrl = `Chats.html?user_id=${loggedInUser}&recipient_id=${product.sellerId}&recipient_username=${encodedRecipientUsername}&recipient_profile_picture_url=${encodedRecipientProfilePictureUrl}&message=${encodedMessage}&product_image=${encodedProductImage}&product_id=${product.postId}&product_name=${encodedProductDescription}`;
    window.location.href = chatUrl;
}
