
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Fetch the profile data
    const token = localStorage.getItem("authToken");
    const API_BASE_URL = window.location.hostname
    const response = await fetch("http://localhost:3000/users-profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch profile data");
    }

    const profile = await response.json();

    // Populate the profile page
    const usernameElement = document.getElementById("username");
    if (usernameElement) {
      usernameElement.textContent = `${profile.firstName} ${profile.lastName}`;
    }

    const bioElement = document.getElementById("bio");
    if (bioElement) {
      bioElement.textContent = profile.bio || "No bio available";
    }

    const followersElement = document.getElementById("followers");
    if (followersElement) {
      followersElement.textContent = profile.followers || 0;
    }

    const followingElement = document.getElementById("following");
    if (followingElement) {
      followingElement.textContent = profile.following || 0;
    }

    const productsCountElement = document.getElementById("products-count");
    if (productsCountElement) {
      productsCountElement.textContent = profile.products.length || 0;
    }

    const profilePictureElement = document.getElementById("profile-picture");
    if (profilePictureElement && profile.profilePicture) {
      profilePictureElement.src = profile.profilePicture;
    }

    // Load user's products dynamically
    const productListElement = document.getElementById("product-list");
    if (productListElement) {
      profile.products.forEach((product) => {
        const productItem = document.createElement("div");
        productItem.classList.add("product");
        productItem.innerHTML = `
          <img src="${product.photo}" alt="${product.description}">
          <div>
            <h3>${product.description}</h3>
            <p>${product.price}</p>
            <p>${product.productCondition}</p>
            <p>${product.location}</p>
          </div>
        `;
        productListElement.appendChild(productItem);
      });
    }
  } catch (error) {
    console.error("Error:", error);
    alert("Could not load profile data. Please try again later.");
  }
});