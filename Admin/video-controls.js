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
                    <video class="reels-video" playsinline webkit-playsinline crossorigin="anonymous" muted></video>
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
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function hideControlsAfterDelay() {
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            modal.querySelector('.reels-controls').style.opacity = '0';
        }, 3000);
    }

    function showControls() {
        modal.querySelector('.reels-controls').style.opacity = '1';
        hideControlsAfterDelay();
    }

    // Open modal with video
    window.openReelsModal = function(originalVideo) {
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
        reelsVideo.pause();
        reelsVideo.currentTime = 0;
        currentOriginalVideo = null;
    }

    // Event listeners
    reelsCloseBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('reels-overlay')) {
            closeModal();
        }
    });

    // Video events
    reelsVideo.addEventListener('loadstart', () => {
        reelsLoading.style.display = 'block';
    });

    reelsVideo.addEventListener('canplay', () => {
        reelsLoading.style.display = 'none';
    });

    reelsVideo.addEventListener('loadedmetadata', () => {
        reelsDuration.textContent = formatTime(reelsVideo.duration);
    });

    reelsVideo.addEventListener('timeupdate', () => {
        const progress = (reelsVideo.currentTime / reelsVideo.duration) * 100;
        reelsProgressBar.style.width = `${progress}%`;
        reelsCurrentTime.textContent = formatTime(reelsVideo.currentTime);

        if (reelsVideo.buffered.length > 0) {
            const bufferedEnd = reelsVideo.buffered.end(reelsVideo.buffered.length - 1);
            const bufferedPercent = (bufferedEnd / reelsVideo.duration) * 100;
            reelsBufferedBar.style.width = `${bufferedPercent}%`;
        }
    });

    reelsVideo.addEventListener('ended', () => {
        reelsPlayPause.innerHTML = '<i class="fas fa-play"></i>';
        reelsVideo.currentTime = 0;
    });

    // Control events
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

    reelsMuteBtn.addEventListener('click', () => {
        reelsVideo.muted = !reelsVideo.muted;
        reelsMuteBtn.innerHTML = reelsVideo.muted ? 
            '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        showControls();
    });

    // Progress bar seeking
    reelsProgressTrack.addEventListener('click', (e) => {
        const rect = reelsProgressTrack.getBoundingClientRect();
        const progress = (e.clientX - rect.left) / rect.width;
        reelsVideo.currentTime = progress * reelsVideo.duration;
        showControls();
    });

    // Tap zones for mobile-like interaction
    tapZones.forEach(zone => {
        zone.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = zone.dataset.action;
            
            switch (action) {
                case 'seek-backward':
                    reelsVideo.currentTime = Math.max(0, reelsVideo.currentTime - 10);
                    break;
                case 'play-pause':
                    reelsPlayPause.click();
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
                reelsPlayPause.click();
                break;
            case 'ArrowLeft':
                reelsVideo.currentTime = Math.max(0, reelsVideo.currentTime - 10);
                showControls();
                break;
            case 'ArrowRight':
                reelsVideo.currentTime = Math.min(reelsVideo.duration, reelsVideo.currentTime + 10);
                showControls();
                break;
            case 'm':
                reelsMuteBtn.click();
                break;
        }
    });
}

// Modified video controls initialization
function initializeVideoControls(postElement) {
    const container = postElement.querySelector('.post-video-container');
    if (!container) return;

    const video = container.querySelector('.post-video');
    const thumbnailCanvas = container.querySelector('.video-thumbnail');
    const loadingSpinner = container.querySelector('.loading-spinner');
    const playPauseBtn = container.querySelector('.play-pause');
    const muteBtn = container.querySelector('.mute-button');
    const fullscreenBtn = container.querySelector('.fullscreen-button');
    const progressBar = container.querySelector('.progress-bar');
    const bufferedBar = container.querySelector('.buffered-bar');
    const progressContainer = container.querySelector('.progress-container');
    const seekPreview = container.querySelector('.seek-preview');
    const volumeSlider = container.querySelector('.volume-slider');
    const playbackSpeed = container.querySelector('.playback-speed');
    const currentTimeDisplay = container.querySelector('.current-time');
    const durationDisplay = container.querySelector('.duration');

    // Initialize Reels modal if not already done
    if (!document.getElementById('reels-modal')) {
        initializeReelsModal();
    }

    // Video click handler for opening Reels modal
    video.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.openReelsModal(video);
    });

    // Add click cursor to video
    video.style.cursor = 'pointer';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');
    video.removeAttribute('autoplay');
    video.muted = true;

    // Rest of the original functionality for inline controls
    const throttle = (func, limit) => {
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
    };

    const debounce = (func, delay) => {
        let timeoutId;
        return function() {
            const args = arguments;
            const context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(context, args), delay);
        }
    };

    video.addEventListener('loadedmetadata', () => {
        video.currentTime = 2;
    });

    video.addEventListener('seeked', () => {
        if (video.currentTime === 2 && !video.dataset.thumbnailGenerated) {
            const ctx = thumbnailCanvas.getContext('2d');
            thumbnailCanvas.width = video.videoWidth;
            thumbnailCanvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
            video.poster = thumbnailCanvas.toDataURL('image/jpeg');
            video.dataset.thumbnailGenerated = 'true';
            video.currentTime = 0;
        }
    });

    function formatVideoTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    if (durationDisplay) {
        video.addEventListener('loadedmetadata', () => {
            durationDisplay.textContent = formatVideoTime(video.duration);
        });
    }

    // Inline play/pause (alternative to modal)
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent modal from opening
            if (video.paused) {
                loadingSpinner.style.display = 'block';
                video.play().then(() => {
                    loadingSpinner.style.display = 'none';
                    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                }).catch(e => {
                    loadingSpinner.style.display = 'none';
                    console.error('Play error:', e);
                });
            } else {
                video.pause();
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        });
    }

    // Rest of the original control handlers remain the same...
    // (keeping all the existing functionality for inline video controls)
    
    const throttledTimeUpdate = throttle(() => {
        if (progressBar && currentTimeDisplay) {
            const progress = (video.currentTime / video.duration) * 100;
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            currentTimeDisplay.textContent = formatVideoTime(video.currentTime);

            if (video.buffered.length > 0 && bufferedBar) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const bufferedPercent = (bufferedEnd / video.duration) * 100;
                bufferedBar.style.width = `${bufferedPercent}%`;
            }
        }
    }, 100);

    video.addEventListener('timeupdate', throttledTimeUpdate);

    if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            video.muted = !video.muted;
            muteBtn.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
            if (volumeSlider) volumeSlider.value = video.muted ? 0 : video.volume * 100;
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', throttle(() => {
            video.volume = volumeSlider.value / 100;
            video.muted = volumeSlider.value == 0;
            if (muteBtn) muteBtn.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        }, 50));
    }

    if (playbackSpeed) {
        playbackSpeed.addEventListener('change', () => {
            video.playbackRate = parseFloat(playbackSpeed.value);
        });
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                const elem = container;
                if (elem.requestFullscreen) {
                    elem.requestFullscreen().catch(e => console.error('Fullscreen error:', e));
                } else if (elem.webkitRequestFullscreen) {
                    elem.webkitRequestFullscreen();
                }
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(e => console.error('Exit fullscreen error:', e));
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            }
        });
    }

    // Progress bar interaction
    if (progressContainer) {
        let isDragging = false;
        let isHoveringProgress = false;

        const updateProgress = (e, isTouch = false) => {
            const rect = progressContainer.getBoundingClientRect();
            const posX = isTouch ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
            const width = rect.width;
            let progress = posX / width;
            progress = Math.max(0, Math.min(1, progress));
            const seekTime = progress * video.duration;
            video.currentTime = seekTime;
            if (progressBar) {
                progressBar.style.width = `${progress * 100}%`;
                progressBar.setAttribute('aria-valuenow', progress * 100);
            }
        };

        const debouncedSeekPreview = debounce((posX, seekTime) => {
            if (seekPreview && !isDragging && isHoveringProgress) {
                seekPreview.style.display = 'block';
                seekPreview.style.left = `${posX}px`;
                seekPreview.innerHTML = `<div style="background: rgba(0,0,0,0.8); color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${formatVideoTime(seekTime)}</div>`;
            }
        }, 100);

        progressContainer.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isDragging = true;
            updateProgress(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) updateProgress(e);
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            if (seekPreview) seekPreview.style.display = 'none';
        });

        progressContainer.addEventListener('mousemove', throttle((e) => {
            if (!isDragging) {
                isHoveringProgress = true;
                const rect = progressContainer.getBoundingClientRect();
                const posX = e.clientX - rect.left;
                const width = rect.width;
                let progress = posX / width;
                progress = Math.max(0, Math.min(1, progress));
                const seekTime = progress * video.duration;
                debouncedSeekPreview(posX, seekTime);
            }
        }, 50));

        progressContainer.addEventListener('mouseleave', () => {
            isHoveringProgress = false;
            if (seekPreview && !isDragging) seekPreview.style.display = 'none';
        });

        progressContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            updateProgress(e);
        });
    }

    video.addEventListener('canplay', () => {
        if (loadingSpinner) loadingSpinner.style.display = 'none';
    });

    video.addEventListener('error', () => {
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        console.error('Failed to load video');
    });

    video.addEventListener('ended', () => {
        if (playPauseBtn) playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        video.currentTime = 0;
        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
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