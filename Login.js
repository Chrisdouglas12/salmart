const form = document.getElementById('form-se');
const errorMsg = document.getElementById('error-msg');
const successMsg = document.getElementById('success-msg');
const signInButton = document.getElementById('sign-btn');
const spinnerMsg = document.getElementById('spinner-msg');

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
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            const token = data.token;
            const decodedToken = jwt_decode(token);

            if (Date.now() >= decodedToken.exp * 1000) {
                throw new Error('Your session has expired. Please log in again.');
            }

            localStorage.setItem('authToken', token);
            localStorage.setItem('tokenExpiry', decodedToken.exp * 1000);
            localStorage.setItem('userId', decodedToken.userId);
            localStorage.setItem('email', data.user.email);

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
        displayError('Failed to connect to the server. Please try again later.');
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