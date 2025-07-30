const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);

    const productId = params.get('postId');
    let productImage = params.get('productImage');
    const productTitle = params.get('productTitle');
    const productDescription = params.get('productDescription');
    const productLocation = params.get('productLocation');
    const productCondition = params.get('productCondition');
    const productPrice = params.get('productPrice');
    const sellerId = params.get('sellerId');

    // Sanitize productImage
    if (productImage && !productImage.match(/^https?:\/\//)) {
        productImage = productImage.startsWith('/')
            ? `${API_BASE_URL}${productImage}`
            : `${API_BASE_URL}/${productImage}`;
    }

    document.getElementById('productImage').src = productImage || '/salmart-192x192.png';
    document.getElementById('productTitle').textContent = productTitle || 'Untitled Product';
    document.getElementById('productPrice').textContent = productPrice || 'Price not specified';
    document.getElementById('productDescription').textContent = productDescription || 'No description available';
    document.getElementById('productLocation').textContent = productLocation || 'N/A';
    document.getElementById('productCondition').textContent = productCondition || 'N/A';

    // Fetch seller details
    let sellerUsername = 'User';
    let sellerProfilePicture = '/salmart-192x192.png';
    const authToken = localStorage.getItem('authToken');

    if (sellerId && authToken) {
        try {
            const response = await fetch(`${API_BASE_URL}/user/${sellerId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                },
            });
            if (response.ok) {
                const user = await response.json();
                sellerUsername = `${user.firstName} ${user.lastName}` || 'User';
                sellerProfilePicture = user.profilePicture || '/salmart-192x192.png';
            }
        } catch (error) {
            console.error('Error fetching seller details:', error);
            window.showToast('Error loading seller information.', '#dc3545');
        }
    }

    const productData = {
        postId: productId,
        productImage,
        productTitle,
        productDescription,
        productLocation,
        productCondition,
        productPrice,
        sellerId,
    };

    const buyWithEscrowBtn = document.getElementById('buyWithEscrowBtn');
    const chatSellerBtn = document.getElementById('chatSellerBtn');

    if (buyWithEscrowBtn) {
        buyWithEscrowBtn.addEventListener('click', () => handleBuyWithEscrow(productData));
    }

    if (chatSellerBtn) {
        chatSellerBtn.addEventListener('click', () => handleChatSeller(productData, sellerUsername, sellerProfilePicture));
    }

    // Toast definition
    window.showToast = function showToast(message, bgColor = '#333') {
        const toast = document.getElementById('toast-message');
        if (!toast) {
            const tempToast = document.createElement('div');
            tempToast.className = 'toast-message';
            Object.assign(tempToast.style, {
                position: 'fixed',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: bgColor,
                color: 'white',
                padding: '10px 20px',
                borderRadius: '5px',
                zIndex: '1000',
                transition: 'opacity 0.5s ease-in-out',
                opacity: '1',
            });
            tempToast.textContent = message;
            document.body.appendChild(tempToast);
            setTimeout(() => tempToast.style.opacity = '0', 3000);
            return;
        }
        toast.textContent = message;
        toast.style.backgroundColor = bgColor;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    };
});

async function handleBuyWithEscrow(product) {
    const email = localStorage.getItem('email');
    const buyerId = localStorage.getItem('userId');
    const authToken = localStorage.getItem('authToken');

    if (!email || !buyerId || !product.postId || !authToken) {
        window.showToast("Please log in to make a purchase or complete your profile.", '#dc3545');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                email,
                postId: product.postId,
                buyerId,
                currency: 'NGN',
            }),
        });

        const result = await response.json();

        if (response.ok && result.success && result.url) {
            window.location.href = result.url;
        } else {
            window.showToast(`Payment failed: ${result.message || 'Please try again.'}`, '#dc3545');
        }
    } catch (error) {
        console.error('Payment error:', error);
        window.showToast('Failed to process payment. Please try again.', '#dc3545');
    }
}

function handleChatSeller(product, recipientUsername, recipientProfilePictureUrl) {
    const loggedInUser = localStorage.getItem('userId');
    if (!loggedInUser) {
        window.showToast("Please log in to chat with the seller.", '#dc3545');
        setTimeout(() => {
            window.location.href = 'SignIn.html';
        }, 1500);
        return;
    }

    const message = `I'm ready to pay for this now, is it still available?\n\nProduct: ${product.productTitle || product.productDescription}`;

    // Build chat URL with all data
    const chatUrl = `Chats.html?` + new URLSearchParams({
        user_id: loggedInUser,
        recipient_id: product.sellerId,
        recipient_username: recipientUsername || 'User',
        recipient_profile_picture_url: recipientProfilePictureUrl || '/salmart-192x192.png',
        message: message,
        product_image: product.productImage || '',
        product_id: product.postId,
        product_name: product.productTitle || '',
    }).toString();

    window.location.href = chatUrl;
}