
    // --- Constants and Utility Functions ---
    const API_BASE_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com');
    const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://salmart.onrender.com';
    const DEFAULT_PLACEHOLDER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    function throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    function debounce(func, delay) {
        let timeoutId;
        return function() {
            const args = arguments;
            const context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(context, args), delay);
        }
    }

    // --- Optimized Image Loading Class ---
    class ImageLoader {
        constructor() {
            this.cache = new Map();
            this.observer = new IntersectionObserver(this.handleIntersections.bind(this), {
                rootMargin: '800px 0px 800px 0px',
                threshold: 0.01
            });
            this.loader = new Image();
            this.batch = [];
        }

        observe(imgElement, originalSrc) {
            if (!originalSrc || this.cache.has(originalSrc)) {
                this.setSource(imgElement, originalSrc || '');
                return;
            }

            imgElement.dataset.originalSrc = originalSrc;
            imgElement.classList.add('lazy-loading');
            this.observer.observe(imgElement);
        }

        setSource(imgElement, src) {
            const isPlaceholder = src === DEFAULT_PLACEHOLDER_IMAGE || !src;
            if (isPlaceholder) {
                imgElement.src = DEFAULT_PLACEHOLDER_IMAGE;
                imgElement.classList.add('lazy-loading');
                return;
            }

            if (this.cache.has(src)) {
                imgElement.src = this.cache.get(src);
                imgElement.classList.remove('lazy-loading');
                imgElement.classList.add('loaded');
                return;
            }

            imgElement.src = src;
            imgElement.onload = () => {
                imgElement.classList.remove('lazy-loading');
                imgElement.classList.add('loaded');
                this.cache.set(src, src);
            };
            imgElement.onerror = () => {
                imgElement.src = '';
                imgElement.classList.remove('lazy-loading');
                console.error(`Failed to load image: ${src}`);
            };
        }

        handleIntersections(entries, observer) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imgElement = entry.target;
                    const originalSrc = imgElement.dataset.originalSrc;
                    if (originalSrc) {
                        this.batch.push({
                            imgElement,
                            originalSrc
                        });
                        observer.unobserve(imgElement);
                    }
                }
            });
            if (this.batch.length > 0) {
                this.processBatch();
            }
        }

        processBatch() {
            this.batch.forEach(({
                imgElement,
                originalSrc
            }) => {
                this.setSource(imgElement, originalSrc);
            });
            this.batch = [];
        }

        disconnect() {
            this.observer.disconnect();
        }
    }

    const imageLoader = new ImageLoader();

    function lazyLoadImage(imgElement, originalSrc) {
        if (!imgElement) return;
        imageLoader.observe(imgElement, originalSrc);
    }

    // --- Lazy Video Loading ---
    function lazyLoadVideo(videoElement) {
        const sourceElements = videoElement.querySelectorAll('source[data-src]');
        if (sourceElements.length === 0) return;

        if (!window.videoIntersectionObserver) {
            window.videoIntersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const video = entry.target;
                    if (entry.isIntersecting) {
                        video.querySelectorAll('source[data-src]').forEach(source => {
                            source.src = source.dataset.src;
                        });
                        video.load();
                        video.classList.remove('lazy-loading');
                        video.removeAttribute('autoplay');
                    } else {
                        if (!video.paused) {
                            video.pause();
                        }
                    }
                });
            }, {
                rootMargin: '0px 0px 300px 0px',
                threshold: 0.1
            });
        }

        videoElement.classList.add('lazy-loading');
        videoElement.removeAttribute('autoplay');
        videoElement.setAttribute('preload', 'metadata');
        window.videoIntersectionObserver.observe(videoElement);
    }

    // --- General Utility Functions ---
    function showToast(message, bgColor = '#333') {
        let toast = document.querySelector('.toast-message');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast-message';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.backgroundColor = bgColor;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
    window.showToast = showToast;

    function formatTime(timestamp) {
        const now = new Date();
        const postDate = new Date(timestamp);
        const diffInSeconds = Math.floor((now - postDate) / 1000);

        if (diffInSeconds < 60) return "Just now";
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w`;

        const currentYear = now.getFullYear();
        const postYear = postDate.getFullYear();

        if (postYear === currentYear) {
            return postDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
            });
        } else {
            return postDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric"
            });
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function redirectToLogin() {
        showToast('Please log in to access this feature', '#dc3545');
        setTimeout(() => {
            window.location.href = 'SignIn.html';
        }, 1000);
    }
    window.redirectToLogin = redirectToLogin;

