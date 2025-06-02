// share.js
import { showToast, copyToClipboard } from 'utils.js';

export function sharePost(post, postLink, platform) {
    const shareText = `Check out this product: ${post.description || 'No description'} - ${post.price ? '₦' + Number(post.price).toLocaleString('en-Ng') : 'Price not specified'}`;

    function openAppOrWeb(appUrl, webUrl) {
        window.location.href = appUrl;
        setTimeout(() => {
            if (!document.hidden) {
                window.open(webUrl, '_blank');
            }
        }, 500);
    }

    switch (platform) {
        case 'copy':
            copyToClipboard(postLink);
            showToast('Link copied to clipboard!');
            break;
        case 'whatsapp':
            const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareText + '\n' + postLink)}`;
            const whatsappWebUrl = `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + postLink)}`;
            openAppOrWeb(whatsappUrl, whatsappWebUrl);
            break;
        case 'facebook':
            const facebookUrl = `fb://sharer.php?u=${encodeURIComponent(postLink)}`;
            const facebookWebUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postLink)}`;
            openAppOrWeb(facebookUrl, facebookWebUrl);
            break;
        case 'twitter':
            const twitterUrl = `twitter://post?message=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postLink)}`;
            const twitterWebUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postLink)}`;
            openAppOrWeb(twitterUrl, twitterWebUrl);
            break;
        case 'telegram':
            const telegramUrl = `tg://msg_url?url=${encodeURIComponent(postLink)}&text=${encodeURIComponent(shareText)}`;
            const telegramWebUrl = `https://t.me/share/url?url=${encodeURIComponent(postLink)}&text=${encodeURIComponent(shareText)}`;
            openAppOrWeb(telegramUrl, telegramWebUrl);
            break;
        case 'instagram':
            const instagramUrl = `instagram://library?AssetPath=${encodeURIComponent(postLink)}`;
            openAppOrWeb(instagramUrl, `https://www.instagram.com/`);
            break;
    }
}