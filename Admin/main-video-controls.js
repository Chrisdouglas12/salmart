// Optimized video loading and controls with Facebook Reels-style fullscreen modal

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
                } else {
                    if (!video.paused) {
                        video.pause();
                    }
                }
            });
        }, {
            rootMargin: '0px 0px 300px 0px',
            threshold: 0.5
        });
    }

    videoElement.classList.add('lazy-loading');
    videoElement.removeAttribute('autoplay');
    videoElement.setAttribute('preload', 'metadata');
    window.videoIntersectionObserver.observe(videoElement);
}

// Create Facebook Reels-style modal
function createReelsModal() {
    if (document.getElementById('reels-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'reels-modal';
    modal.innerHTML = `
        <div class="reels-overlay">
            <div class="reels-container">
                <button class="reels-close-btn" aria-label="Close">
                    <i class="fas fa-times"></i>
                </button>
                <div class="reels-video-wrapper">
                    <video class="reels-video" playsinline webkit-playsinline crossorigin="anonymous" ></video>
                    <div class="reels-loading">
                        <div class="spinner"></div>
                    </div>
                    <div class="reels-controls">
                        <button class="reels-play-pause" aria-label="Play/Pause">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="reels-progress-container">
                            <div class="reels-progress-track">
                                <div class="reels-buffered-bar"></div>
                                <div class="reels-progress-bar"></div>
                            </div>
                        </div>
                        <div class="reels-time">
                            <span class="reels-current-time">0:00</span> / 
                            <span class="reels-duration">0:00</span>
                        </div>
                        <button class="reels-mute-btn" aria-label="Mute/Unmute">
                            <i class="fas fa-volume-mute"></i>
                        </button>
                    </div>
                    <div class="reels-tap-zones">
                        <div class="reels-tap-left" data-action="seek-backward"></div>
                        <div class="reels-tap-center" data-action="play-pause"></div>
                        <div class="reels-tap-right" data-action="seek-forward"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add modal styles
    const styles = `
        <style id="reels-modal-styles">
        #reels-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            background: rgba(0, 0, 0, 0.95);
            animation: fadeIn 0.3s ease-out;
        }

        #reels-modal.active {
            display: flex;
        }

        .reels-overlay {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        }

        .reels-container {
            position: relative;
            width: 100%;
            max-width: 400px;
            max-height: 90vh;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .reels-close-btn {
            position: absolute;
            top: 15px;
            right: 15px;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.6);
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            color: white;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }

        .reels-close-btn:hover {
            background: rgba(0, 0, 0, 0.8);
        }

        .reels-video-wrapper {
            position: relative;
            width: 100%;
            height: 70vh;
            max-height: 600px;
            background: #000;
        }

        .reels-video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            outline: none;
        }

        .reels-loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: none;
        }

        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-top: 3px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        .reels-controls {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
            padding: 40px 20px 20px;
            display: flex;
            align-items: center;
            gap: 15px;
            opacity: 1;
            transition: opacity 0.3s;
        }

        .reels-video-wrapper:hover .reels-controls {
            opacity: 1;
        }

        .reels-play-pause {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            color: white;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            backdrop-filter: blur(10px);
        }

        .reels-play-pause:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .reels-progress-container {
            flex: 1;
            margin: 0 10px;
        }

        .reels-progress-track {
            height: 4px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 2px;
            position: relative;
            cursor: pointer;
        }

        .reels-buffered-bar {
            height: 100%;
            background: rgba(255, 255, 255, 0.5);
            border-radius: 2px;
            width: 0%;
            transition: width 0.1s;
        }

        .reels-progress-bar {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            background: #1877f2;
            border-radius: 2px;
            width: 0%;
            transition: width 0.1s;
        }

        .reels-progress-bar::after {
            content: '';
            position: absolute;
            right: -6px;
            top: 50%;
            transform: translateY(-50%);
            width: 12px;
            height: 12px;
            background: #1877f2;
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .reels-progress-track:hover .reels-progress-bar::after {
            opacity: 1;
        }

        .reels-time {
            color: white;
            font-size: 12px;
            white-space: nowrap;
        }

        .reels-mute-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            color: white;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            backdrop-filter: blur(10px);
        }

        .reels-mute-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .reels-tap-zones {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
        }

        .reels-tap-left,
        .reels-tap-center,
        .reels-tap-right {
            flex: 1;
            cursor: pointer;
            position: relative;
        }

        .reels-tap-center {
            flex: 2;
        }

        .reels-tap-left:active::before,
        .reels-tap-right:active::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 50px;
            height: 50px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            animation: tapFeedback 0.3s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @keyframes tapFeedback {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.8; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }

        @media (max-width: 768px) {
            .reels-container {
                max-width: 100%;
                height: 100vh;
                max-height: 100vh;
                border-radius: 0;
            }

            .reels-video-wrapper {
                height: 100vh;
                max-height: 100vh;
            }

            .reels-overlay {
                padding: 0;
            }
        }
        </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
    document.body.appendChild(modal);

    return modal;
}

// Initialize Reels modal functionality
function initializeReelsModal() {
    const modal = createReelsModal();
    if (!modal) return; // Safety check
    
    const reelsVideo = modal.querySelector('.reels-video');
    const reelsLoading = modal.querySelector('.reels-loading');
    const reelsPlayPause = modal.querySelector('.reels-play-pause');
    const reelsMuteBtn = modal.querySelector('.reels-mute-btn');
    const reelsProgressBar = modal.querySelector('.reels-progress-bar');
    const reelsBufferedBar = modal.querySelector('.reels-buffered-bar');
    const reelsProgressTrack = modal.querySelector('.reels-progress-track');
    const reelsCurrentTime = modal.querySelector('.reels-current-time');
    const reelsDuration = modal.querySelector('.reels-duration');
    const reelsCloseBtn = modal.querySelector('.reels-close-btn');
    const tapZones = modal.querySelectorAll('[data-action]');

    let currentOriginalVideo = null;
    let controlsTimeout;

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function hideControlsAfterDelay() {
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            const controls = modal.querySelector('.reels-controls');
            if (controls) {
                controls.style.opacity = '0';
            }
        }, 3000);
    }

    function showControls() {
        const controls = modal.querySelector('.reels-controls');
        if (controls) {
            controls.style.opacity = '1';
        }
        hideControlsAfterDelay();
    }

    // Open modal with video
    window.openReelsModal = function(originalVideo) {
        if (!originalVideo) return;
        
        currentOriginalVideo = originalVideo;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Copy video sources to modal video
        const sources = originalVideo.querySelectorAll('source');
        reelsVideo.innerHTML = '';
        sources.forEach(source => {
            const newSource = document.createElement('source');
            newSource.src = source.src || source.dataset.src;
            newSource.type = source.type;
            reelsVideo.appendChild(newSource);
        });

        reelsVideo.load();
        showControls();
    };

    // Close modal
    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        if (reelsVideo) {
            reelsVideo.pause();
            reelsVideo.currentTime = 0;
        }
        currentOriginalVideo = null;
    }

    // Event listeners
    if (reelsCloseBtn) {
        reelsCloseBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('reels-overlay')) {
            closeModal();
        }
    });

    // Video events
    if (reelsVideo) {
        reelsVideo.addEventListener('loadstart', () => {
            if (reelsLoading) reelsLoading.style.display = 'block';
        });

        reelsVideo.addEventListener('canplay', () => {
            if (reelsLoading) reelsLoading.style.display = 'none';
        });

        reelsVideo.addEventListener('loadedmetadata', () => {
            if (reelsDuration) {
                reelsDuration.textContent = formatTime(reelsVideo.duration);
            }
        });

        reelsVideo.addEventListener('timeupdate', () => {
            if (!reelsVideo.duration) return;
            
            const progress = (reelsVideo.currentTime / reelsVideo.duration) * 100;
            if (reelsProgressBar) {
                reelsProgressBar.style.width = `${progress}%`;
            }
            if (reelsCurrentTime) {
                reelsCurrentTime.textContent = formatTime(reelsVideo.currentTime);
            }

            if (reelsVideo.buffered.length > 0 && reelsBufferedBar) {
                const bufferedEnd = reelsVideo.buffered.end(reelsVideo.buffered.length - 1);
                const bufferedPercent = (bufferedEnd / reelsVideo.duration) * 100;
                reelsBufferedBar.style.width = `${bufferedPercent}%`;
            }
        });

        reelsVideo.addEventListener('ended', () => {
            if (reelsPlayPause) {
                reelsPlayPause.innerHTML = '<i class="fas fa-play"></i>';
            }
            reelsVideo.currentTime = 0;
        });
    }

    // Control events
    if (reelsPlayPause) {
        reelsPlayPause.addEventListener('click', () => {
            if (reelsVideo.paused) {
                reelsVideo.play();
                reelsPlayPause.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                reelsVideo.pause();
                reelsPlayPause.innerHTML = '<i class="fas fa-play"></i>';
            }
            showControls();
        });
    }

    if (reelsMuteBtn) {
        reelsMuteBtn.addEventListener('click', () => {
            reelsVideo.muted = !reelsVideo.muted;
            reelsMuteBtn.innerHTML = reelsVideo.muted ? 
                '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
            showControls();
        });
    }

    // Progress bar seeking
    if (reelsProgressTrack) {
        reelsProgressTrack.addEventListener('click', (e) => {
            if (!reelsVideo.duration) return;
            
            const rect = reelsProgressTrack.getBoundingClientRect();
            const progress = (e.clientX - rect.left) / rect.width;
            reelsVideo.currentTime = progress * reelsVideo.duration;
            showControls();
        });
    }

    // Tap zones for mobile-like interaction
    tapZones.forEach(zone => {
        zone.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = zone.dataset.action;
            
            if (!reelsVideo) return;
            
            switch (action) {
                case 'seek-backward':
                    reelsVideo.currentTime = Math.max(0, reelsVideo.currentTime - 10);
                    break;
                case 'play-pause':
                    if (reelsPlayPause) reelsPlayPause.click();
                    break;
                case 'seek-forward':
                    reelsVideo.currentTime = Math.min(reelsVideo.duration, reelsVideo.currentTime + 10);
                    break;
            }
            showControls();
        });
    });

    // Show controls on mouse move
    modal.addEventListener('mousemove', showControls);

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;

        switch (e.key) {
            case 'Escape':
                closeModal();
                break;
            case ' ':
                e.preventDefault();
                if (reelsPlayPause) reelsPlayPause.click();
                break;
            case 'ArrowLeft':
                if (reelsVideo) {
                    reelsVideo.currentTime = Math.max(0, reelsVideo.currentTime - 10);
                    showControls();
                }
                break;
            case 'ArrowRight':
                if (reelsVideo) {
                    reelsVideo.currentTime = Math.min(reelsVideo.duration, reelsVideo.currentTime + 10);
                    showControls();
                }
                break;
            case 'm':
                if (reelsMuteBtn) reelsMuteBtn.click();
                break;
        }
    });
}

// SINGLE, CORRECTED initializeVideoControls function
function initializeVideoControls(postElement) {
    const container = postElement.querySelector('.post-video-container');
    if (!container) return;

    const video = container.querySelector('.post-video');
    if (!video) return;

    // Get new structure elements (with null checks)
    const playOverlay = container.querySelector('.video-play-overlay');
    const playButton = container.querySelector('.video-play-button');
    const durationBadge = container.querySelector('.video-duration-badge');
    const durationText = container.querySelector('.video-duration-text');
    const loadingSpinner = container.querySelector('.video-thumbnail-loading');

    // Initialize Reels modal if not already done
    if (!document.getElementById('reels-modal')) {
        initializeReelsModal();
    }

    // Format time helper
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Show video duration when metadata loads
    video.addEventListener('loadedmetadata', () => {
        if (durationText && durationBadge && video.duration) {
            durationText.textContent = formatTime(video.duration);
            durationBadge.style.display = 'block';
        }
    });

    // Handle thumbnail/play button click
    const handlePlayClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Show loading state (only if elements exist)
        if (loadingSpinner) {
            loadingSpinner.style.display = 'block';
        }
        if (playButton) {
            playButton.classList.add('loading');
        }
        
        // Open Reels modal
        setTimeout(() => {
            window.openReelsModal(video);
            
            // Hide loading state (only if elements exist)
            if (loadingSpinner) {
                loadingSpinner.style.display = 'none';
            }
            if (playButton) {
                playButton.classList.remove('loading');
            }
        }, 300);
    };

    // Add click handlers (only if elements exist)
    if (playOverlay) {
        playOverlay.addEventListener('click', handlePlayClick);
    }
    
    // Also handle direct video click as backup
    video.addEventListener('click', handlePlayClick);

    // Ensure video shows poster/thumbnail
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');
    video.removeAttribute('autoplay');
    video.muted = true;
    video.preload = 'metadata';

    // Generate thumbnail at 2 seconds if no poster (SAFE VERSION)
    if (!video.poster || video.poster === '') {
        let thumbnailGenerated = false;
        
        video.addEventListener('loadedmetadata', () => {
            if (!thumbnailGenerated && video.duration > 2) {
                video.currentTime = 2;
            }
        });

        video.addEventListener('seeked', () => {
            if (video.currentTime === 2 && !thumbnailGenerated && video.videoWidth > 0) {
                try {
                    // Create canvas safely
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    if (ctx && video.videoWidth && video.videoHeight) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        video.poster = canvas.toDataURL('image/jpeg', 0.8);
                        thumbnailGenerated = true;
                        video.currentTime = 0;
                    }
                } catch (error) {
                    console.warn('Could not generate video thumbnail:', error);
                    thumbnailGenerated = true; // Prevent retrying
                }
            }
        });
    }

    // Optional: Add hover effects (only if elements exist)
    if (playButton) {
        container.addEventListener('mouseenter', () => {
            playButton.style.transform = 'scale(1.05)';
        });

        container.addEventListener('mouseleave', () => {
            playButton.style.transform = 'scale(1)';
        });
    }

    // Error handling
    video.addEventListener('error', (e) => {
        console.error('Video error:', e);
        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }
    });
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize existing videos
    document.querySelectorAll('.post-video').forEach(video => {
        lazyLoadVideo(video);
        const postElement = video.closest('.post');
        if (postElement) {
            initializeVideoControls(postElement);
        }
    });
});