const form = document.getElementById('form-se');
const errorMsg = document.getElementById('error-msg');
const successMsg = document.getElementById('success-msg');
const signInButton = document.getElementById('sign-btn');
const spinnerMsg = document.getElementById('spinner-msg');

// Function to send user ID to the native app via the WebView bridge
function sendUserIdToNativeApp(userId) {
    // Check if the WebView bridge exists
    if (window.ReactNativeWebView) {
        // Send a message to the native app with the user ID
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'user_login',
            userId: userId,
        }));
        console.log('User ID sent to native app:', userId);
    } else {
        console.log('Not in a native WebView environment. Skipping message.');
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    errorMsg.textContent = '';
    successMsg.style.display = 'none';

    if (!email || !password) {
        displayError('Please fill in all required fields.');
        return;
    }

    toggleButtonState(true);

    try {
        const API_BASE_URL = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : 'https://salmart.onrender.com';
            
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        // Check if there's content before calling response.json()
        if (response.status === 204) {
            throw new Error('No content received from the server.');
        }

        const data = await response.json();

        if (response.ok) {
            const token = data.token;
            // Assuming you have a jwt_decode function available (e.g., from a script tag)
            const decodedToken = jwt_decode(token);
            const userId = decodedToken.userId;

            if (Date.now() >= decodedToken.exp * 1000) {
                throw new Error('Your session has expired. Please log in again.');
            }

            localStorage.setItem('authToken', token);
            localStorage.setItem('tokenExpiry', decodedToken.exp * 1000);
            localStorage.setItem('userId', userId);
            localStorage.setItem('email', data.user.email);
            localStorage.setItem('firstName', data.user.firstName);
            localStorage.setItem('lastName', data.user.lastName);

            // 📢 NEW: Call the function to send the user ID to the native app
            sendUserIdToNativeApp(userId);
       
            successMsg.style.display = 'block';
            spinnerMsg.style.display = 'flex';

            setTimeout(() => {
                window.location.href = './Profile.html';
            }, 2000);
        } else {
            displayError(data.message || 'Invalid email or password.');
        }
    } catch (error) {
        console.error('Login error:', error);
        displayError('Cannot connect to the server. Please try again later.');
    } finally {
        toggleButtonState(false);
    }
});

function displayError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

function toggleButtonState(disable) {
    signInButton.disabled = disable;
    signInButton.textContent = disable ? 'Signing in...' : 'Sign in';
}
