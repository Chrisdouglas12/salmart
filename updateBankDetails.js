  const openBtn = document.createElement("button");
  openBtn.textContent = "Update Bank Details";
  openBtn.className = "bank-button";
  openBtn.style.marginTop = "10px";
  openBtn.type = "button"; // prevent form submit reload
  document.getElementById("upload-form").appendChild(openBtn);

  const overlay = document.getElementById("overlay");
  const bottomSheet = document.getElementById("bottom-sheet");
  const closeBtn = document.getElementById("close-sheet");

  const bankNameInput = document.getElementById("bankName");
  const bankCodeInput = document.getElementById("bankCode");
  const accountNumberInput = document.getElementById("accountNumber");
  const accountNameInput = document.getElementById("accountName");
  const API_BASE_URL = window.location.hostname === 'localhost' 
       ?
      'http://localhost:3000' :
      'https://salmart-production.up.railway.app'

  // Show bottom sheet and autofill form
  openBtn.addEventListener("click", async () => {
    bottomSheet.style.bottom = "0";
    overlay.style.display = "block";

    const token = localStorage.getItem("authToken"); // Get the token from localStorage

    if (!token) {
      alert("You are not logged in. Please log in to update bank details.");
      return;
    }

    try {
      const res = await fetch(`http://localhost:3000/get-bank-details`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // Include the token in the headers
        }
      });

      const data = await res.json();

      if (res.ok && data.success && data.bankDetails) {
        bankNameInput.value = data.bankDetails.bankName || "";
        accountNumberInput.value = data.bankDetails.accountNumber || "";
        bankCodeInput.value = data.bankDetails.bankCode || "";
        accountNameInput.value = data.bankDetails.accountName || "";
      } else {
        bankNameInput.value = "";
        accountNumberInput.value = "";
        accountNameInput.value = "";
      }
    } catch (err) {
      console.error("Error loading bank details:", err);
    }
  });

  // Close bottom sheet
  const closeSheet = () => {
    bottomSheet.style.bottom = "-100%";
    overlay.style.display = "none";
  };

  closeBtn.addEventListener("click", closeSheet);
  overlay.addEventListener("click", closeSheet);

  // Handle form submit
  document.getElementById("bank-details-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const token = localStorage.getItem("authToken"); // Get the token from localStorage

    if (!token) {
      alert("You are not logged in. Please log in to update bank details.");
      return;
    }

    const bankName = bankNameInput.value.trim();
    const accountNumber = accountNumberInput.value.trim();
    const accountName = accountNameInput.value.trim();
    const bankCode = bankCodeInput.value.trim();

    try {
      const res = await fetch(`${API_BASE_URL}/update-bank-details`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // Include the token in the headers
        },
        body: JSON.stringify({ bankName, accountNumber, accountName, bankCode }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        alert("Bank details updated successfully!");
        closeSheet();
      } else {
        alert("Failed to update: " + result.message);
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong!");
    }
  });
