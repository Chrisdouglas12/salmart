document.addEventListener("DOMContentLoaded", function () {
    const profilePicInput = document.getElementById("profile-picture-upload");
    const profilePic = document.getElementById("profile-picture");
    const uploadButton = document.getElementById("upload-button");

    // Listen for file selection
    profilePicInput.addEventListener("change", function () {
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = function (e) {
                profilePic.src = e.target.result; // Show preview
                uploadButton.style.display = "block"; // Show upload button
            };
            reader.readAsDataURL(this.files[0]);
        }
    });

    // Handle upload to backend
    uploadButton.addEventListener("click", async function () {
        const file = profilePicInput.files[0];
        if (!file) return alert("Please select a file first.");

        const formData = new FormData();
        formData.append("profilePicture", file);

        try {
            const response = await fetch("http://localhost:3000/upload-profile-picture", { // Change to your API URL
                method: "POST",
                body: formData,
                headers: {
                    // You may need to include authorization if required
                    "Authorization": "Bearer " + localStorage.getItem("authToken")
                }
            });

            const result = await response.json();

            if (response.ok) {
                profilePic.src = result.imageUrl; // Update to new profile pic
                if(profilePic) {
                  profilePic.src = '';
                  setTimeOut(() => {
                    profilePic.src = imageUrl;
                  }, 100)
                }
                
                uploadButton.style.display = "none"; // Hide upload button
                alert("Profile picture updated successfully!");
            } else {
                alert("Upload failed: " + result.message);
            }
        } catch (error) {
            console.error("Error uploading file:", error);
            alert("An error occurred. Please try again.");
        }
    });
});