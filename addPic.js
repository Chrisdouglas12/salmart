document.addEventListener('DOMContentLoaded', function() {
    const profilePicture1 = document.getElementById('profile-picture1');
    const profilePicture3 = document.getElementById('profile-picture3');
    const profilePicture = document.getElementById('profile-picture2');
    const profilePicture2 = document.getElementById('profile-picture');
    const profilePicture5 = document.getElementById('profile-picture5');
    const profilePicture6 = document.getElementById('profile-picture6');
    const username = document.getElementById('username');
    const profileUsername = document.getElementById('profileHeaderUsr');
    const followers = document.getElementById('followers');
    const productsCount = document.getElementById('products-count');
    const bio = document.getElementById('bio');

    let userId = new URLSearchParams(window.location.search).get('userId') || localStorage.getItem('userId');

    if (!userId) {
        alert('User ID is not available. Please log in.');
        window.location.href = '/SignIn.html';
        return;
    }

    function checkLoginState() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            alert('You must be logged in to perform this action.');
            window.location.href = '/SignIn.html';
            return false;
        }
        return true;
    }

    if (checkLoginState()) {

        const token = localStorage.getItem('authToken');
        console.log(`Fetching profile for userId: ${userId}`);
const API_BASE_URL = window.location.hostname === 'localhost' 
       ?
      'http://localhost:3000' :
      'https://salmart-production.up.railway.app'

        fetch(`${API_BASE_URL}/users-profile/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw err; });
            return response.json();
        })
        .then(data => {
            console.log("Profile Data:", data);
            console.log("Raw profilePicture value:", data.profilePicture);

            // Construct image URL (fixed version)
            let imageUrl = data.profilePicture
                ? (data.profilePicture.startsWith("http") ? data.profilePicture : `${API_BASE_URL} ${data.profilePicture.startsWith("/") ? data.profilePicture : '/' + data.profilePicture}`)
                : "/default-avatar.png";

            console.log("Final image URL:", imageUrl);

            // Force reload of the image by temporarily setting it to an empty string
            if (profilePicture1) {
                profilePicture1.src = ''; // Clear the old image
                setTimeout(() => {
                    profilePicture1.src = imageUrl; // Set the new image URL
                }, 100); // Add a slight delay to ensure it refreshes
            }
            if (profilePicture3) {
                profilePicture3.src = '';
                setTimeout(() => {
                    profilePicture3.src = imageUrl;
                }, 100);
            }
            if (profilePicture2) {
                profilePicture2.src = '';
                setTimeout(() => {
                    profilePicture2.src = imageUrl;
                }, 100);
            }
            if (profilePicture5) {
                profilePicture5.src = '';
                setTimeout(() => {
                    profilePicture5.src = imageUrl;
                }, 100);
            }
            if(profilePicture6) {
              profilePicture6.src = '';
              setTimeout(() => {
                profilePicture6.src = imageUrl;
              }, 100);
            }
            if (profilePicture) {
                profilePicture.src = '';
                setTimeout(() => {
                    profilePicture.src = imageUrl;
                }, 100);
            }

            // Set other profile details
            if (username) username.textContent = `${data.firstName} ${data.lastName}`;
            if (profileUsername) profileUsername.textContent = `${data.firstName} ${data.lastName}`;
            if (productsCount) productsCount.textContent = data.products?.length || 0;

        })
        .catch(error => {
            console.error('Error fetching profile:', error);
            showToast('You are offline. check your network and try again');
            if (error.message === 'Invalid token') {
                localStorage.removeItem('authToken');
                window.location.href = '/SignIn.html';
            }
        });
    }
});