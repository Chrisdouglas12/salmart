
    // Open the modal to make a counter-offer
    function openLastPriceModal(productId, productName, productImage) {
        lastPriceModal.style.display = 'block';
        submitLastPriceBtn.onclick = async () => {
            const lastPrice = lastPriceInput.value.trim();
            if (lastPrice && !isNaN(lastPrice) && Number(lastPrice) > 0) {
                const message = {
                    receiverId: receiverId,
                    messageType: 'counter-offer',
                    text: JSON.stringify({
                        text: `I can give you "${productName}" for ₦${Number(lastPrice).toLocaleString('en-NG')}`,
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
                    const lastSent = chatMessages.querySelector('.message.sent:last-child');
                    if (lastSent && data.data?._id) {
                        lastSent.dataset.messageId = data.data._id;
                        displayedMessages.add(data.data._id);
                    }
                    closeLastPriceModal();
                } catch (error) {
                    console.error('Error sending last price:', error);
                    showToast(`Failed to send last price: ${error.message}`, 'error');
                    const lastSent = chatMessages.querySelector('.message.sent:last-child');
                    if (lastSent) lastSent.remove();
                }
            } else {
                showToast('Please enter a valid positive number', 'error');
            }
        };
    }

    // Close the counter-offer modal
    function closeLastPriceModal() {
        lastPriceModal.style.display = 'none';
        lastPriceInput.value = '';
    }

    // Handle the bargain button to show products for bargaining
    bargainBtn.onclick = async () => {
        const modal = document.getElementById('bargainModal');
        if (!modal) {
            showToast('Bargain modal not found', 'error');
            return;
        }
        modal.style.display = 'block';
        try {
            const token = localStorage.getItem('authToken');
            if (!token) throw new Error('No auth token found');
            const res = await fetch(`${API_BASE_URL}/products?sellerId=${receiverId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
            const data = await res.json();
            const container = document.getElementById('bargainProductsContainer');
            if (!container) {
                showToast('Products container not found', 'error');
                return;
            }
            container.innerHTML = '';
            if (!data.success || !data.products || data.products.length === 0) {
                container.innerHTML = '<p>No products available.</p>';
                return;
            }
            data.products.forEach(product => {
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
                            const lastSent = chatMessages.querySelector('.message.sent:last-child');
                            if (lastSent && data.data?._id) {
                                lastSent.dataset.messageId = data.data._id;
                                displayedMessages.add(data.data._id);
                            }
                            closeBargainModal();
                        } catch (error) {
                            console.error('Error sending offer:', error);
                            showToast(`Failed to send offer: ${error.message}`, 'error');
                            const lastSent = chatMessages.querySelector('.message.sent:last-child');
                            if (lastSent) lastSent.remove();
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
                closeModalBtn.onclick = closeBargainModal;
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

    // Show notifications (like pop-up messages)
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

    // Toggle the chat options menu
    ellipsisBtn.addEventListener('click', () => {
        chatDropdown.style.display = chatDropdown.style.display === 'block' ? 'none' : 'block';
    });

    window.addEventListener('click', function (e) {
        if (!ellipsisBtn.contains(e.target) && !chatDropdown.contains(e.target)) {
            chatDropdown.style.display = 'none';
        }
    });
