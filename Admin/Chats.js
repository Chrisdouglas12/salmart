
    let lastDisplayedDate = null;

    // Create a system message (like "Today" or "Offer accepted")
    function createSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'system-message';
        div.textContent = text;
        return div;
    }

    // Show a message in the chat
    function displayMessage(message, isOptimistic = false) {
        if (message._id && displayedMessages.has(message._id)) {
            return;
        }
        if (message._id) {
            displayedMessages.add(message._id);
        }

        const messageDate = new Date(message.createdAt);
        const formattedDate = formatMessageDate(messageDate);

        if (formattedDate !== lastDisplayedDate) {
            chatMessages.appendChild(createSystemMessage(formattedDate));
            lastDisplayedDate = formattedDate;
        }

        if (message.offerDetails && message.offerDetails.productId) {
            if (['accepted', 'rejected', 'completed'].includes(message.offerDetails.status)) {
                acceptedOffers.add(message.offerDetails.productId);
                bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
                if (message.offerDetails.status === 'rejected' || message.offerDetails.status === 'completed') {
                    endedBargains.add(message.offerDetails.productId);
                }
            }
        }

        if (message.metadata?.isSystemMessage) {
            let systemText = message.text;
            switch (message.messageType) {
                case 'accept-offer':
                    systemText = `Offer for ${message.offerDetails.productName} at ₦${message.offerDetails.proposedPrice.toLocaleString('en-NG')} was accepted`;
                    break;
                case 'reject-offer':
                    systemText = `Offer for ${message.offerDetails.productName} was rejected`;
                    endedBargains.add(message.offerDetails.productId);
                    bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
                    break;
                case 'end-bargain':
                    systemText = `Bargaining for ${message.offerDetails.productName} has ended`;
                    endedBargains.add(message.offerDetails.productId);
                    bargainingSessions.delete(`${message.offerDetails.productId}-${message.senderId}`);
                    break;
                case 'payment-completed':
                    systemText = `Payment completed for ${message.offerDetails.productName}`;
                    break;
            }
            chatMessages.appendChild(createSystemMessage(systemText));
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        if (message.messageType === 'image' || (message.attachment && message.attachment.type === 'image')) {
            const imageUrl = message.attachment?.url || message.content;
            if (imageUrl) {
                const msgDiv = document.createElement('div');
                msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
                msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
                const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                msgDiv.innerHTML = `
                    ${message.text ? `<div>${message.text}</div>` : ''}
                    <img src="${imageUrl}" class="product-photo-preview" alt="Receipt" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                    <p style="display:none;color:red;">Failed to load image.</p>
                    <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
                `;
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                return;
            }
        }

        if (message.messageType === 'payment-completed' && message.attachment?.type === 'receipt') {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
            msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
            const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            msgDiv.innerHTML = `
                <div>Payment completed for ${message.offerDetails.productName}</div>
                <img src="${message.attachment.url}" class="product-photo-preview" alt="Receipt" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <p style="display:none;color:red;">Failed to load receipt image.</p>
                <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        if (message.messageType === 'endBargain' || message.messageType === 'end-bargain') {
            let parsed;
            try {
                parsed = JSON.parse(message.text);
            } catch (e) {
                console.warn('Failed to parse end-bargain message text:', message.text, e);
                parsed = message.offerDetails || {};
            }
            endedBargains.add(parsed.productId);
            bargainingSessions.delete(`${parsed.productId}-${message.senderId}`);
            const endText = message.senderId === userId
                ? `This bargain for ${parsed.productName || 'Product'} was ended by you`
                : `This bargain for ${parsed.productName || 'Product'} was ended by ${recipientUsername}`;
            chatMessages.appendChild(createSystemMessage(endText));
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        let msg = message.text, img = null, parsed = {};
        if (['offer', 'counter-offer', 'buyerAccept', 'sellerAccept'].includes(message.messageType)) {
            try {
                parsed = JSON.parse(message.text);
                msg = parsed.text || message.text;
                img = parsed.image || null;
                parsed.offer = parsed.offer || (message.offerDetails?.proposedPrice) || 0;
                parsed.productId = parsed.productId || (message.offerDetails?.productId) || '';
                parsed.productName = parsed.productName || (message.offerDetails?.productName) || 'Product';
                parsed.image = parsed.image || (message.offerDetails?.image) || '';
            } catch (e) {
                console.warn(`Failed to parse ${message.messageType} message text:`, message.text, e);
                msg = message.text;
                parsed = {
                    offer: (message.offerDetails?.proposedPrice) || 0,
                    productId: (message.offerDetails?.productId) || '',
                    productName: (message.offerDetails?.productName) || 'Product',
                    image: (message.offerDetails?.image) || ''
                };
            }
        } else if (message.messageType === 'text') {
            if (message.text.startsWith('{')) {
                try {
                    parsed = JSON.parse(message.text);
                    msg = parsed.text || message.text;
                    img = parsed.image || null;
                    if (img && !img.match(/^https?:\/\//)) {
                        img = img.startsWith('/') ? `${API_BASE_URL}${img}` : img;
                    }
                } catch (e) {
                    console.warn('Failed to parse text message as JSON:', message.text, e);
                    msg = message.text;
                    img = null;
                }
            } else {
                msg = message.text;
                img = null;
            }
        }

        if (message.messageType === 'counter-offer' && message.senderId === userId && parsed.productId) {
            sentCounterOffers.add(parsed.productId);
        }

        if (parsed?.offer && !bargainingSessions.has(`${parsed.productId}-${message.senderId}`) && !endedBargains.has(parsed.productId)) {
            bargainingSessions.add(`${parsed.productId}-${message.senderId}`);
            const startText = message.senderId === userId
                ? `You are bargaining for ${parsed.productName || 'Product'}`
                : `${recipientUsername} is bargaining for ${parsed.productName || 'Product'}`;
            chatMessages.appendChild(createSystemMessage(startText));
        }

        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', message.senderId === userId ? 'sent' : 'received');
        msgDiv.dataset.messageId = message._id || `temp_${Date.now()}`;
        const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        msgDiv.innerHTML = `
            <div>${msg}</div>
            ${img ? `<img src="${img}" class="product-photo-preview" alt="Product Image" style="max-width: 200px; border-radius: 5px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><p style="display:none;color:red;">Failed to load product image.</p>` : ''}
            <div class="message-timestamp">${time} ${message.status === 'seen' ? '✔✔' : isOptimistic ? '' : '✔'}</div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Send a new message when the send button is clicked
    sendBtn.onclick = async () => {
        const text = typeSection.value.trim();
        if (!text) {
            showToast('Please enter a message', 'error');
            return;
        }

        const normalizedText = text.replace(/\s+/g, ' ').trim();
        const normalizedPredefined = predefinedMessage.replace(/\s+/g, ' ').trim();
        const isInitialMessage = !isInitialMessageSent && predefinedMessage && productImage;

        const message = {
            receiverId,
            text: isInitialMessage ? JSON.stringify({ text, image: productImage }) : text,
            messageType: 'text',
            createdAt: new Date(),
            isRead: false
        };

        const optimisticMessage = { ...message, senderId: userId, status: 'sent' };
        displayMessage(optimisticMessage, true);
        typeSection.value = '';

        if (isInitialMessage) {
            isInitialMessageSent = true;
            localStorage.setItem(`initialMessageSent_${productId}_${receiverId}`, 'true');
            const previewContainer = document.getElementById('product-preview');
            if (previewContainer) {
                previewContainer.remove();
            }
        }

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
        } catch (error) {
            console.error('Error sending message:', error);
            showToast(`Failed to send message: ${error.message}`, 'error');
            const lastSent = chatMessages.querySelector('.message.sent:last-child');
            if (lastSent) lastSent.remove();
        }
    };

    // Handle incoming messages
    socket.on('newMessage', message => {
        if (!((message.senderId === userId && message.receiverId === receiverId) ||
              (message.senderId === receiverId && message.receiverId === userId))) {
            return;
        }
        displayMessage(message);
        if (message.receiverId === userId && message.status !== 'seen') {
            socket.emit('markAsSeen', {
                messageIds: [message._id],
                senderId: message.senderId,
                receiverId: userId
            });
        }
        showToast(`New message from ${recipientUsername}`, 'success');
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        storedMessages.push(message);
        localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
    });

    // Handle message synced event
    socket.on('messageSynced', (message) => {
        if (!((message.senderId === userId && message.receiverId === receiverId) ||
              (message.senderId === receiverId && message.receiverId === userId))) {
            return;
        }
        const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
        if (!storedMessages.some(msg => msg._id === message._id)) {
            storedMessages.push(message);
            localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(storedMessages));
        }
    });

    // Load past messages
    async function loadChatHistory() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                showToast('Please log in to view messages', 'error');
                window.location.href = 'login.html';
                return;
            }
            const res = await fetch(`${API_BASE_URL}/messages?user1=${userId}&user2=${receiverId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                throw new Error(`Failed to fetch messages: ${res.status}`);
            }
            let messages = await res.json();
            if (!Array.isArray(messages)) {
                messages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
            }
            const validMessages = messages.filter(msg => msg && typeof msg === 'object' && msg.text && msg.messageType);
            const initialMessageExists = validMessages.some(msg => {
                if (msg.senderId === userId && msg.messageType === 'text' && msg.text.startsWith('{')) {
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
            renderProductPreview();
            lastDisplayedDate = null;
            validMessages.forEach(displayMessage);
            localStorage.setItem(`chat_${userId}_${receiverId}`, JSON.stringify(validMessages));
        } catch (error) {
            console.error('Error loading chat history:', error);
            showToast(`Failed to load messages: ${error.message}`, 'error');
            const storedMessages = JSON.parse(localStorage.getItem(`chat_${userId}_${receiverId}`) || '[]');
            storedMessages.forEach(displayMessage);
            renderProductPreview();
        }
    }

    loadChatHistory();

    // Show typing indicator
    socket.on('typing', data => {
        if (data.senderId === receiverId) {
            typingIndicator.textContent = `${recipientUsername} is typing...`;
            setTimeout(() => typingIndicator.textContent = '', 3000);
        }
    });

    // Handle errors from the server
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
