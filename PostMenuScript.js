const optionsButton = postElement.querySelector('.post-options-button');
const optionsMenu = postElement.querySelector('.post-options-menu');

optionsButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevents it from closing immediately if other listeners exist
    optionsMenu.style.display = optionsMenu.style.display === 'block' ? 'none' : 'block';
});

// Optional: Close menu when clicking outside
document.addEventListener('click', (event) => {
    if (!optionsMenu.contains(event.target) && !optionsButton.contains(event.target)) {
        optionsMenu.style.display = 'none';
    }
});