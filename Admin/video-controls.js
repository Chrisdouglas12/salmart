// Function to show toast notification (copied for independence, or can be passed from main script)
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

    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');

    video.addEventListener('loadedmetadata', () => {
        video.currentTime = 2; // Set a brief time for thumbnail generation
    });

    video.addEventListener('seeked', () => {
        if (video.currentTime === 2 && !video.dataset.thumbnailGenerated) {
            const ctx = thumbnailCanvas.getContext('2d');
            thumbnailCanvas.width = video.videoWidth;
            thumbnailCanvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
            video.poster = thumbnailCanvas.toDataURL('image/jpeg');
            video.dataset.thumbnailGenerated = 'true';
            video.currentTime = 0; // Reset to 0 after thumbnail generation
        }
    });

    function formatVideoTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    video.addEventListener('loadedmetadata', () => {
        durationDisplay.textContent = formatVideoTime(video.duration);
    });

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
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
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

    const updateProgress = (e, isTouch = false) => {
        const rect = progressContainer.getBoundingClientRect();
        const posX = isTouch ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
        const width = rect.width;
        let progress = posX / width;
        progress = Math.max(0, Math.min(1, progress));
        const seekTime = progress * video.duration;
        video.currentTime = seekTime;
        progressBar.style.width = `${progress * 100}%`;
        progressBar.setAttribute('aria-valuenow', progress * 100);

        seekPreview.style.left = `${posX}px`;
        seekPreviewCanvas.width = 120;
        seekPreviewCanvas.height = 68;
        // Temporarily set video.currentTime for accurate seek preview drawing
        video.currentTime = seekTime;
        setTimeout(() => {
            const ctx = seekPreviewCanvas.getContext('2d');
            ctx.drawImage(video, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
            // Revert video.currentTime if it was changed by the setTimeout
            // This line ensures the actual video playback position isn't disturbed by the preview seek.
            video.currentTime = seekTime; // Re-set to ensure consistency for visual updates
        }, 100); // Small delay to allow video to seek
    };

    progressContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
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
            const rect = progressContainer.getBoundingClientRect();
            const posX = e.clientX - rect.left;
            const width = rect.width;
            let progress = posX / width;
            progress = Math.max(0, Math.min(1, progress));
            const seekTime = progress * video.duration;
            seekPreview.style.display = 'block';
            seekPreview.style.left = `${posX}px`;
            seekPreviewCanvas.width = 120;
            seekPreviewCanvas.height = 68;
            video.currentTime = seekTime;
            setTimeout(() => {
                const ctx = seekPreviewCanvas.getContext('2d');
                ctx.drawImage(video, 0, 0, seekPreviewCanvas.width, seekPreviewCanvas.height);
                // Ensure video.currentTime is reset to its actual position after preview
                // This is crucial to not interrupt current playback if not dragging.
                // However, for seek preview, you generally *want* the video to seek to that point momentarily.
                // The current implementation changes `video.currentTime` and relies on `timeupdate` to refresh.
                // If you want to preview without changing actual playback, you'd need a separate video element or more complex canvas rendering.
            }, 100);
        }
    });

    progressContainer.addEventListener('mouseleave', () => {
        if (!isDragging) seekPreview.style.display = 'none';
    });

    progressContainer.addEventListener('click', (e) => {
        updateProgress(e);
    });

    progressContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
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
        if (e.target === video || e.target === container) {
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
