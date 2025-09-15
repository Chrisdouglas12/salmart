// post-sharing.js (Updated to use backend URL for social sharing)

/* This script controls post sharing*/

document.addEventListener('DOMContentLoaded', function () {
    const showToast = window.showToast; // Utility from auth.js
    
    // Backend URL for share links (where meta tags are served)
    const BACKEND_URL = 'https://salmart.onrender.com';

    async function copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fixed typo: createElement instead of createElementa
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            }
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    }

    function openAppOrWeb(appUrl, webUrl) {
        // This is a common pattern for deep linking or falling back to web
        window.location.href = appUrl;
        setTimeout(() => {
            // Check if the app opened (e.g., by checking if the page is hidden)
            // Note: This check is not foolproof and may not work on all devices/browsers.
            if (!document.hidden) {
                window.open(webUrl, '_blank');
            }
        }, 500); // Give browser a short time to switch to app
    }

    function sharePost(post, postLink, platform) {
        // Use the backend share link that has Open Graph meta tags for better previews
        const shareableLink = postLink; // This points to backend /share/:postId URL
        const shareText = `Check out this product: ${post.description || 'No description'} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-NG') : 'Price not specified'}`;

        switch (platform) {
            case 'copy':
                copyToClipboard(shareableLink);
                if (showToast) showToast('Link copied to clipboard!');
                break;
            case 'whatsapp':
                // WhatsApp will automatically generate preview from Open Graph meta tags
                const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareText + '\n' + shareableLink)}`;
                const whatsappWebUrl = `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareableLink)}`;
                openAppOrWeb(whatsappUrl, whatsappWebUrl);
                break;
            case 'facebook':
                // Facebook uses Open Graph tags for preview
                const facebookUrl = `fb://sharer.php?u=${encodeURIComponent(shareableLink)}`;
                const facebookWebUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareableLink)}`;
                openAppOrWeb(facebookUrl, facebookWebUrl);
                break;
            case 'twitter':
                // Twitter uses Twitter Card meta tags
                const twitterUrl = `twitter://post?message=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareableLink)}`;
                const twitterWebUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareableLink)}`;
                openAppOrWeb(twitterUrl, twitterWebUrl);
                break;
            case 'telegram':
                // Telegram will show preview based on Open Graph tags
                const telegramUrl = `tg://msg_url?url=${encodeURIComponent(shareableLink)}&text=${encodeURIComponent(shareText)}`;
                const telegramWebUrl = `https://t.me/share/url?url=${encodeURIComponent(shareableLink)}&text=${encodeURIComponent(shareText)}`;
                openAppOrWeb(telegramUrl, telegramWebUrl);
                break;
            case 'instagram':
                // Instagram sharing via URL schemes is highly limited, especially for posts.
                // This will typically just open the app. Direct sharing of external content is usually via its API or limited.
                const instagramUrl = `instagram://app`; // This might just open the app.
                openAppOrWeb(instagramUrl, `https://www.instagram.com/`);
                if (showToast) showToast('Instagram sharing is limited. You may need to share manually.', '#ffc107');
                break;
            default:
                console.warn('Unknown sharing platform:', platform);
                if (showToast) showToast('Could not share to this platform.', '#dc3545');
        }
    }

    function showShareModal(post) {
        const shareModal = document.createElement('div');
        shareModal.className = 'share-modal';
        
        // Point to backend URL for proper social media scraping
        // Backend will serve meta tags and redirect users to frontend
        const postLink = `${BACKEND_URL}/share/${post._id}`;
        
        shareModal.innerHTML = `
            <div class="share-modal-content">
                <div class="share-modal-header">
                    <h3>Share this product</h3>
                    <span class="close-share-modal">×</span>
                </div>
                <div class="share-modal-body">
                    <div class="share-preview">
                        <small>Links shared will show a preview with product image</small>
                    </div>
                    <div class="share-options">
                        <button class="share-option" data-platform="copy">
                            <i class="fas fa-copy"></i>
                            <span>Copy Link</span>
                        </button>
                        <button class="share-option" data-platform="whatsapp">
                            <i class="fab fa-whatsapp"></i>
                            <span>WhatsApp</span>
                        </button>
                        <button class="share-option" data-platform="facebook">
                            <i class="fab fa-facebook"></i>
                            <span>Facebook</span>
                        </button>
                        <button class="share-option" data-platform="twitter">
                            <i class="fab fa-twitter"></i>
                            <span>Twitter</span>
                        </button>
                        <button class="share-option" data-platform="telegram">
                            <i class="fab fa-telegram"></i>
                            <span>Telegram</span>
                        </button>
                        <button class="share-option" data-platform="instagram">
                            <i class="fab fa-instagram"></i>
                            <span>Instagram</span>
                        </button>
                    </div>
                    <div class="share-link-container">
                        <input type="text" value="${postLink}" readonly class="share-link">
                        <button class="copy-link-button">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(shareModal);
        document.body.style.overflow = 'hidden';

        const closeModal = () => {
            document.body.removeChild(shareModal);
            document.body.style.overflow = '';
        };

        shareModal.querySelector('.close-share-modal').addEventListener('click', closeModal);
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) closeModal();
        });

        const shareOptions = shareModal.querySelectorAll('.share-option');
        shareOptions.forEach(option => {
            option.addEventListener('click', () => {
                const platform = option.getAttribute('data-platform');
                sharePost(post, postLink, platform);
                closeModal();
            });
        });

        shareModal.querySelector('.copy-link-button').addEventListener('click', async () => {
            const success = await copyToClipboard(postLink);
            if (showToast) showToast(success ? 'Link copied to clipboard!' : 'Failed to copy link');
        });
    }

    // Expose the showShareModal function globally so post-interactions.js can call it
    window.showShareModal = showShareModal;
});