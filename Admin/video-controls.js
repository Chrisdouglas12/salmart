// Optimized video loading and controls for better scrolling performance

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
                    // Remove autoplay - videos will only play when user clicks play
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
    // Disable autoplay by default
    videoElement.removeAttribute('autoplay');
    videoElement.setAttribute('preload', 'metadata'); // Changed from 'none' to 'metadata' for better UX
    window.videoIntersectionObserver.observe(videoElement);
}

// Optimized video controls with performance improvements
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

    // Disable autoplay and set appropriate attributes
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');
    video.removeAttribute('autoplay'); // Explicitly remove autoplay
    video.muted = true; // Keep muted for better UX

    // Throttle functions for better performance
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

    // Debounce function for expensive operations
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

    video.addEventListener('loadedmetadata', () => {
        durationDisplay.textContent = formatVideoTime(video.duration);
    });

    // Throttled time update for better performance
    const throttledTimeUpdate = throttle(() => {
        const progress = (video.currentTime / video.duration) * 100;
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        currentTimeDisplay.textContent = formatVideoTime(video.currentTime);

        if (video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            const bufferedPercent = (bufferedEnd / video.duration) * 100;
            bufferedBar.style.width = `${bufferedPercent}%`;
        }
    }, 100); // Update every 100ms instead of on every timeupdate

    video.addEventListener('timeupdate', throttledTimeUpdate);

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

    volumeSlider.addEventListener('input', throttle(() => {
        video.volume = volumeSlider.value / 100;
        video.muted = volumeSlider.value == 0;
        muteBtn.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    }, 50));

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
    let isHoveringProgress = false;

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
    };

    // Optimized seek preview with debouncing and simplified rendering
    const debouncedSeekPreview = debounce((posX, seekTime) => {
        if (!isDragging && isHoveringProgress) {
            seekPreview.style.display = 'block';
            seekPreview.style.left = `${posX}px`;
            
            // Simplified preview - only show time, not video frame for better performance
            seekPreview.innerHTML = `<div style="background: rgba(0,0,0,0.8); color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${formatVideoTime(seekTime)}</div>`;
        }
    }, 100);

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

    // Optimized mouse move handler with throttling
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
        if (!isDragging) seekPreview.style.display = 'none';
    });

    progressContainer.addEventListener('click', (e) => {
        updateProgress(e);
    });

    // Touch events with throttling
    progressContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        updateProgress(e, true);
    });

    document.addEventListener('touchmove', throttle((e) => {
        if (isDragging) updateProgress(e, true);
    }, 50));

    document.addEventListener('touchend', () => {
        isDragging = false;
        seekPreview.style.display = 'none';
    });

    // Keyboard controls
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

    // Add passive event listeners where possible for better scroll performance
    progressContainer.addEventListener('wheel', (e) => {
        e.stopPropagation(); // Prevent wheel events from bubbling up during scroll
    }, { passive: true });
}