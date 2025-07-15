// video-controls.js

// Function to show toast notification (included here to avoid dependency issues)
function showToast(message, bgColor = '#333') {
    const toast = document.querySelector('.toast-message') || document.createElement('div');
    if (!toast.parentNode) {
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

// Initialize Intersection Observer for videos
let videoObserver;

const handleVideoIntersection = (entries) => {
    entries.forEach(entry => {
        const videoContainer = entry.target;
        const video = videoContainer.querySelector('.post-video');
        const playPauseBtn = videoContainer.querySelector('.play-pause');
        const loadingSpinner = videoContainer.querySelector('.loading-spinner');
        const muteBtn = videoContainer.querySelector('.mute-button');

        if (!video) return;

        if (entry.isIntersecting) {
            // Video is in view
            if (!video.dataset.srcLoaded) {
                video.querySelectorAll('source[data-src]').forEach(sourceElem => {
                    sourceElem.src = sourceElem.dataset.src;
                });
                video.load();
                video.dataset.srcLoaded = 'true';
            }

            // Autoplay when in view, muted by default
            if (video.paused && video.readyState >= 3) {
                video.muted = true;
                if (muteBtn) muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                video.play().then(() => {
                    loadingSpinner.style.display = 'none';
                    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                }).catch(e => {
                    loadingSpinner.style.display = 'none';
                    console.log("Video autoplay prevented:", e);
                });
            }
        } else {
            // Video is out of view
            if (!video.paused) {
                video.pause();
                video.currentTime = 0;
                if (playPauseBtn) {
                    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                }
            }
            video.removeAttribute('src');
            video.querySelectorAll('source').forEach(sourceElem => {
                sourceElem.removeAttribute('src');
            });
            video.load();
            video.dataset.srcLoaded = '';
            video.dataset.thumbnailGenerated = '';
        }
    });
};

// Initialize the Intersection Observer
if ('IntersectionObserver' in window) {
    videoObserver = new IntersectionObserver(handleVideoIntersection, {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
    });
} else {
    console.warn("Intersection Observer not supported. Video lazy loading and auto-pause will not work.");
}

// Initialize video controls
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
    const seekPreviewCanvas = container.querySelector('.seek-preview-canvas');
    const volumeSlider = container.querySelector('.volume-slider');
    const playbackSpeed = container.querySelector('.playback-speed');
    const currentTimeDisplay = container.querySelector('.current-time');
    const durationDisplay = container.querySelector('.duration');

    if (video.dataset.controlsInitialized) {
        return;
    }
    video.dataset.controlsInitialized = 'true';

    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');

    video.addEventListener('loadedmetadata', () => {
        durationDisplay.textContent = formatVideoTime(video.duration);
        if (!video.dataset.thumbnailGenerated && video.duration > 2) {
            video.currentTime = 2;
        } else if (!video.dataset.thumbnailGenerated) {
            video.currentTime = 0;
        }
    });

    video.addEventListener('seeked', () => {
        if (!video.dataset.thumbnailGenerated && video.readyState >= 1) {
            const ctx = thumbnailCanvas.getContext('2d');
            thumbnailCanvas.width = video.videoWidth;
            thumbnailCanvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
            video.poster = thumbnailCanvas.toDataURL('image/jpeg');
            video.dataset.thumbnailGenerated = 'true';
            if (video.currentTime === 2 || video.duration <= 2) {
                video.currentTime = 0;
            }
        }
    });

    function formatVideoTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    video.addEventListener('timeupdate', () => {
        const progress = (video.currentTime / video.duration) * 100;
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        currentTimeDisplay.textContent = formatVideoTime(video.currentTime);

        if (video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            const bufferedPercent = (bufferedEnd / video.duration) * 100;
            bufferedBar.style.width = `${bufferedPercent}%`;
        }
    });

    playPauseBtn.addEventListener('click', () => {
        if (video.paused) {
            loadingSpinner.style.display = 'block';
            video.play().then(() => {
                loadingSpinner.style.display = 'none';
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }).catch(e => {
                loadingSpinner.style.display = 'none';
                showToast('Error playing video.', '#dc3545');
                console.error('Play error:', e);
            });
        } else {
            video.pause();
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    });

    video.addEventListener('canplay', () => {
        loadingSpinner.style.display = 'none';
    });

    muteBtn.addEventListener('click', () => {
        video.muted = !video.muted;
        muteBtn.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        volumeSlider.value = video.muted ? 0 : video.volume * 100;
    });

    volumeSlider.addEventListener('input', () => {
        video.volume = volumeSlider.value / 100;
        video.muted = volumeSlider.value == 0;
        muteBtn.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    });

    playbackSpeed.addEventListener('change', () => {
        video.playbackRate = parseFloat(playbackSpeed.value);
    });

    fullscreenBtn.addEventListener('click', () => {
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
            } else if (elem.webkitExitFullscreen) {
                elem.webkitExitFullscreen();
            }
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    });

    document.addEventListener('webkitfullscreenchange', () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    });

    let isDragging = false;
    let originalVideoTime = 0;

    const updateProgress = (e, isTouch = false) => {
        const rect = progressContainer.getBoundingClientRect();
        const posX = isTouch ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
        const width = rect.width;
        let progress = posX / width;
        progress = Math.max(0, Math.min(1, progress));
        const seekTime = progress * video.duration;

        if (isDragging) {
            video.currentTime = seekTime;
            progressBar.style.width = `${progress * 100}%`;
            progressBar.setAttribute('aria-valuenow', progress * 100);
        }

        seekPreview.style.left = `${posX}px`;
        seekPreviewCanvas.width = 120;
        seekPreviewCanvas.height = 68;

        const tempVideo = video.cloneNode(true);
        tempVideo.muted = true;
        tempVideo.currentTime = seekTime;
        tempVideo.addEventListener('seeked', () => {
            const ctx = seekPreviewCanvas.getContext('2d');
            ctx.drawImage(tempVideo, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
            tempVideo.remove();
        }, { once: true });
    };

    progressContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        originalVideoTime = video.currentTime;
        updateProgress(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) updateProgress(e);
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        seekPreview.style.display = 'none';
    });

    progressContainer.addEventListener('mousemove', (e) => {
        if (!isDragging) {
            seekPreview.style.display = 'block';
            updateProgress(e);
        }
    });

    progressContainer.addEventListener('mouseleave', () => {
        if (!isDragging) seekPreview.style.display = 'none';
    });

    progressContainer.addEventListener('click', (e) => {
        if (!isDragging) updateProgress(e);
    });

    progressContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        originalVideoTime = video.currentTime;
        updateProgress(e, true);
    });

    document.addEventListener('touchmove', (e) => {
        if (isDragging) updateProgress(e, true);
    });

    document.addEventListener('touchend', () => {
        isDragging = false;
        seekPreview.style.display = 'none';
    });

    postElement.addEventListener('keydown', (e) => {
        const isTargetInVideoContainer = container.contains(e.target);
        if (isTargetInVideoContainer) {
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    playPauseBtn.click();
                    break;
                case 'm':
                    muteBtn.click();
                    break;
                case 'f':
                    fullscreenBtn.click();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    video.currentTime = Math.max(0, video.currentTime - 5);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    video.currentTime = Math.min(video.duration, video.currentTime + 5);
                    break;
            }
        }
    });

    video.addEventListener('error', () => {
        showToast('Failed to load video.', '#dc3545');
        loadingSpinner.style.display = 'none';
    });

    video.addEventListener('ended', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        video.currentTime = 0;
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', 0);
    });
}

// Expose videoObserver and initializeVideoControls globally
window.videoObserver = videoObserver;
window.initializeVideoControls = initializeVideoControls;