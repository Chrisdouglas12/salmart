document.addEventListener('DOMContentLoaded', function() {
    const profilePicture1 = document.getElementById('profile-picture1');
    const profilePicture3 = document.getElementById('profile-picture3');
    const profilePicture = document.getElementById('profile-picture2');
    const profilePicture2 = document.getElementById('profile-picture');
    const profilePicture5 = document.getElementById('profile-picture5');
    const profilePicture6 = document.getElementById('profile-picture6');
    const profilePicture8 = document.getElementById('profile-picture8'); // for Deals.html
    const username8 = document.getElementById('username8'); // for Deals.html
    const username = document.getElementById('username');
    const followers = document.getElementById('followers'); // This seems unused in the original snippet but kept for context.
    const productsCount = document.getElementById('products-count');

    // Define API_BASE_URL upfront
    const API_BASE_URL = window.location.hostname === 'localhost' ?
        'http://localhost:3000' :
        'https://salmart.onrender.com';

    // Default profile picture URL
    const DEFAULT_PROFILE_PIC = "/default-avater.png";

    // Function to set default profile pictures
    function setDefaultProfilePictures() {
        const profilePictureElements = [
            profilePicture1, profilePicture3, profilePicture2,
            profilePicture5, profilePicture6, profilePicture8, profilePicture
        ];

        profilePictureElements.forEach(imgElement => {
            if (imgElement) {
                // Force set the default image
                imgElement.src = DEFAULT_PROFILE_PIC;
                // Also set alt text for accessibility
                
                console.log(`Set default profile picture for element:`, imgElement.id || imgElement.className);
            }
        });
    }

    // A utility function to check login state without immediate redirection
    function getAuthTokenAndUserId() {
        const token = localStorage.getItem('authToken');
        const userId = localStorage.getItem('userId'); // Assuming userId is stored in localStorage after login
        if (token && userId) {
            return { token, userId };
        }
        return null; // No token or userId found
    }

    // Attempt to get login credentials
    const authDetails = getAuthTokenAndUserId();

    // If a user is logged in, fetch their profile data
    if (authDetails) {
        const { token, userId } = authDetails;
        console.log(`Fetching profile for userId: ${userId}`);

        fetch(`${API_BASE_URL}/users-profile/${userId}`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Accept': 'application/json'
                }
            })
            .then(response => {
                if (!response.ok) return response.json().then(err => {
                    throw err;
                });
                return response.json();
            })
            .then(data => {
                console.log("Profile Data:", data);
                console.log("Raw profilePicture value:", data.profilePicture);

                let imageUrl = data.profilePicture ?
                    (data.profilePicture.startsWith("http") ? data.profilePicture : `${API_BASE_URL}${data.profilePicture.startsWith("/") ? data.profilePicture : '/' + data.profilePicture}`) :
                    DEFAULT_PROFILE_PIC;

                console.log("Final image URL:", imageUrl);

                // Update profile pictures across various elements
                const profilePictureElements = [
                    profilePicture1, profilePicture3, profilePicture2,
                    profilePicture5, profilePicture6, profilePicture8, profilePicture
                ];

                profilePictureElements.forEach(imgElement => {
                    if (imgElement) {
                        imgElement.src = ''; // Clear the old image
                        setTimeout(() => {
                            imgElement.src = imageUrl; // Set the new image URL
                        }, 100); // Small delay for refresh
                    }
                });

                // Set other profile details
                if (username) username.textContent = `${data.firstName} ${data.lastName}`;
               
                if (username8) username8.textContent = `${data.firstName} ${data.lastName}`;
                if (productsCount) productsCount.textContent = data.products?.length || 0;

                // Dispatch a custom event to signal that auth status is ready
                // This is crucial for post-renderer.js to know if a user is logged in
                window.loggedInUser = userId; // Store the logged-in user ID globally or on window
                const authStatusEvent = new CustomEvent('authStatusReady', {
                    detail: {
                        loggedInUser: userId
                    }
                });
                document.dispatchEvent(authStatusEvent);
            })
            .catch(error => {
                console.error('Error fetching profile:', error);
                
                // Set default profile pictures on error
                setDefaultProfilePictures();
                
                // showToast('You are offline. check your network and try again'); // Assuming showToast exists
                if (error.message === 'Invalid token' || error.status === 401 || error.status === 403) {
                    console.log('Invalid token, clearing storage and redirecting to login.');
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('userId'); // Also remove userId
                    // window.location.href = '/SignIn.html'; // Only redirect if an invalid token was the issue
                }
                // Even if there's an error fetching profile, if posts are meant to be public,
                // the post-renderer.js will still attempt to fetch them.
                window.loggedInUser = null; // Ensure loggedInUser is null if fetching profile fails
                const authStatusEvent = new CustomEvent('authStatusReady', {
                    detail: {
                        loggedInUser: null
                    }
                });
                document.dispatchEvent(authStatusEvent);
            });
    } else {
        // If not logged in, set default profile pictures
        console.log('User is not logged in. Setting default profile pictures.');
        
        // Use setTimeout to ensure DOM is fully ready and handle any timing issues
        setTimeout(() => {
            setDefaultProfilePictures();
        }, 50);
        
        // Immediately dispatch authStatusReady with null user
        window.loggedInUser = null;
        const authStatusEvent = new CustomEvent('authStatusReady', {
            detail: {
                loggedInUser: null
            }
        });
        document.dispatchEvent(authStatusEvent);
        console.log('User is not logged in. Posts will be displayed without user-specific features.');
    }
});