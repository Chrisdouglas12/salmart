// Video Editor Module
class VideoEditor {
    constructor() {
        this.originalVideoFile = null;
        this.processedVideoFile = null;
        this.canvas = null;
        this.ctx = null;
        this.video = null;
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.startTime = 0;
        this.endTime = 0;
        this.textOverlays = [];
        this.selectedOverlay = null;
        this.isDragging = false;
        this.quality = 'auto'; // auto-adjusts for target file size
        this.targetFileSize = 6 * 1024 * 1024; // 6MB target
        this.maxDuration = 60; // 60 seconds max
        
        // WhatsApp-like compression settings
        this.compressionSettings = {
            targetWidth: 720,
            targetHeight: 1280,
            targetFrameRate: 30,
            targetBitrate: 800000, // Will be dynamically calculated
            audioEnabled: true,
            audioBitrate: 128000
        };
        
        // DOM elements
        this.modal = null;
        this.canvas = null;
        this.video = null;
        this.playPauseBtn = null;
        this.timeline = null;
        this.startHandle = null;
        this.endHandle = null;
        this.playhead = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
    }
    
    bindEvents() {
        // Edit video button
        const editBtn = document.getElementById('edit-video-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.openEditor());
        }
        
        // Close editor
        const closeBtn = document.getElementById('close-video-editor');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeEditor());
        }
        
        // Process video button
        const processBtn = document.getElementById('process-video-btn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processVideo());
        }
        
        // Cancel edit
        const cancelBtn = document.getElementById('cancel-edit-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeEditor());
        }
        
        // Add text button
        const addTextBtn = document.getElementById('add-text-btn');
        if (addTextBtn) {
            addTextBtn.addEventListener('click', () => this.showTextEditor());
        }
        
        // Text editor buttons
        const applyTextBtn = document.getElementById('apply-text-btn');
        const cancelTextBtn = document.getElementById('cancel-text-btn');
        if (applyTextBtn) applyTextBtn.addEventListener('click', () => this.applyText());
        if (cancelTextBtn) cancelTextBtn.addEventListener('click', () => this.hideTextEditor());
        
        // Quality selection - now auto-calculates based on target size
        const qualityInputs = document.querySelectorAll('input[name="quality"]');
        qualityInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.quality = e.target.value;
                this.updateCompressionSettings();
            });
        });
        
        // Play/pause button
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.togglePlayback());
        }
    }
    
    updateCompressionSettings() {
        const duration = this.endTime - this.startTime;
        
        // Calculate target bitrate based on file size and duration
        const totalBitsAvailable = this.targetFileSize * 8; // Convert to bits
        const audioBits = this.compressionSettings.audioBitrate * duration;
        const videoBits = totalBitsAvailable - audioBits;
        const targetVideoBitrate = Math.floor(videoBits / duration);
        
        // Adjust resolution based on quality setting
        switch (this.quality) {
            case 'high':
                this.compressionSettings.targetWidth = 720;
                this.compressionSettings.targetHeight = 1280;
                this.compressionSettings.targetBitrate = Math.min(targetVideoBitrate, 1200000);
                break;
            case 'medium':
                this.compressionSettings.targetWidth = 540;
                this.compressionSettings.targetHeight = 960;
                this.compressionSettings.targetBitrate = Math.min(targetVideoBitrate, 800000);
                break;
            case 'low':
                this.compressionSettings.targetWidth = 480;
                this.compressionSettings.targetHeight = 854;
                this.compressionSettings.targetBitrate = Math.min(targetVideoBitrate, 500000);
                break;
            default: // auto
                this.compressionSettings.targetBitrate = Math.min(targetVideoBitrate, 1000000);
                this.autoAdjustResolution();
        }
        
        console.log('Compression settings updated:', this.compressionSettings);
    }
    
    autoAdjustResolution() {
        if (!this.video) return;
        
        const originalWidth = this.video.videoWidth;
        const originalHeight = this.video.videoHeight;
        const aspectRatio = originalWidth / originalHeight;
        
        // Determine if video is portrait or landscape
        if (aspectRatio < 1) { // Portrait
            this.compressionSettings.targetWidth = Math.min(720, originalWidth);
            this.compressionSettings.targetHeight = Math.min(1280, originalHeight);
        } else { // Landscape
            this.compressionSettings.targetWidth = Math.min(1280, originalWidth);
            this.compressionSettings.targetHeight = Math.min(720, originalHeight);
        }
        
        // Maintain aspect ratio
        if (originalWidth > this.compressionSettings.targetWidth) {
            this.compressionSettings.targetHeight = Math.floor(
                (this.compressionSettings.targetWidth / originalWidth) * originalHeight
            );
        }
        
        if (originalHeight > this.compressionSettings.targetHeight) {
            this.compressionSettings.targetWidth = Math.floor(
                (this.compressionSettings.targetHeight / originalHeight) * originalWidth
            );
        }
        
        // Ensure dimensions are even (required for some codecs)
        this.compressionSettings.targetWidth = Math.floor(this.compressionSettings.targetWidth / 2) * 2;
        this.compressionSettings.targetHeight = Math.floor(this.compressionSettings.targetHeight / 2) * 2;
    }
    
    openEditor() {
        const videoFile = document.getElementById('video-input').files[0];
        if (!videoFile) {
            showToast('Please select a video file first', '#dc3545');
            return;
        }
        
        this.originalVideoFile = videoFile;
        this.modal = document.getElementById('video-editor-modal');
        this.canvas = document.getElementById('video-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        if (this.modal) {
            this.modal.style.display = 'block';
            this.setupEditor();
        }
    }
    
    closeEditor() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
        this.cleanup();
    }
    
    async setupEditor() {
        try {
            // Create video element
            this.video = document.createElement('video');
            this.video.src = URL.createObjectURL(this.originalVideoFile);
            this.video.muted = true;
            this.video.preload = 'metadata';
            this.video.crossOrigin = 'anonymous';
            
            // Wait for metadata to load
            await new Promise((resolve, reject) => {
                this.video.addEventListener('loadedmetadata', resolve);
                this.video.addEventListener('error', reject);
                setTimeout(() => reject(new Error('Video load timeout')), 10000);
            });
            
            this.duration = this.video.duration;
            this.endTime = Math.min(this.duration, this.maxDuration);
            
            // Set canvas size based on video dimensions
            this.setupCanvasSize();
            
            // Setup timeline
            this.setupTimeline();
            this.setupCanvasEvents();
            this.updateCompressionSettings();
            this.updateDisplay();
            this.drawFrame();
            
            // Update time displays
            document.getElementById('total-time').textContent = this.formatTime(this.duration);
            document.getElementById('end-time').textContent = this.formatTime(this.endTime);
            
            // Show estimated file size
            this.updateFileSizeEstimate();
            
        } catch (error) {
            console.error('Error setting up video editor:', error);
            showToast('Error loading video for editing', '#dc3545');
            this.closeEditor();
        }
    }
    
    setupCanvasSize() {
        const originalWidth = this.video.videoWidth;
        const originalHeight = this.video.videoHeight;
        const aspectRatio = originalWidth / originalHeight;
        
        // Display canvas size (for preview)
        const maxDisplayWidth = 600;
        const maxDisplayHeight = 400;
        
        let displayWidth, displayHeight;
        
        if (aspectRatio > maxDisplayWidth / maxDisplayHeight) {
            displayWidth = maxDisplayWidth;
            displayHeight = maxDisplayWidth / aspectRatio;
        } else {
            displayHeight = maxDisplayHeight;
            displayWidth = maxDisplayHeight * aspectRatio;
        }
        
        // Set canvas size to match target compression resolution
        this.canvas.width = this.compressionSettings.targetWidth;
        this.canvas.height = this.compressionSettings.targetHeight;
        
        // Set display size
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = displayHeight + 'px';
    }
    
    updateFileSizeEstimate() {
        const duration = this.endTime - this.startTime;
        const videoBits = this.compressionSettings.targetBitrate * duration;
        const audioBits = this.compressionSettings.audioBitrate * duration;
        const totalBits = videoBits + audioBits;
        const estimatedSize = Math.floor(totalBits / 8); // Convert to bytes
        
        const estimatedSizeMB = (estimatedSize / (1024 * 1024)).toFixed(1);
        
        // Update UI if element exists
        const sizeElement = document.getElementById('estimated-size');
        if (sizeElement) {
            sizeElement.textContent = `Estimated size: ${estimatedSizeMB}MB`;
        }
    }
    
    setupTimeline() {
        this.timeline = document.getElementById('timeline-container');
        this.startHandle = document.getElementById('start-handle');
        this.endHandle = document.getElementById('end-handle');
        this.playhead = document.getElementById('playhead');
        
        if (!this.timeline || !this.startHandle || !this.endHandle || !this.playhead) return;
        
        // Set initial positions
        this.updateTimelineHandles();
        
        // Handle dragging
        this.startHandle.addEventListener('mousedown', (e) => this.startDragging(e, 'start'));
        this.endHandle.addEventListener('mousedown', (e) => this.startDragging(e, 'end'));
        this.timeline.addEventListener('click', (e) => this.seekToPosition(e));
        
        document.addEventListener('mousemove', (e) => this.handleDrag(e));
        document.addEventListener('mouseup', () => this.stopDragging());
    }
    
    setupCanvasEvents() {
        if (!this.canvas) return;
        
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleCanvasMouseUp());
    }
    
    startDragging(e, type) {
        e.preventDefault();
        this.isDragging = type;
    }
    
    handleDrag(e) {
        if (!this.isDragging || !this.timeline) return;
        
        const rect = this.timeline.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const percentage = x / rect.width;
        const time = percentage * this.duration;
        
        if (this.isDragging === 'start') {
            this.startTime = Math.max(0, Math.min(time, this.endTime - 1));
        } else if (this.isDragging === 'end') {
            this.endTime = Math.max(this.startTime + 1, Math.min(time, this.duration));
            // Limit to maxDuration
            if (this.endTime - this.startTime > this.maxDuration) {
                this.endTime = this.startTime + this.maxDuration;
            }
        }
        
        this.updateTimelineHandles();
        this.updateDisplay();
        this.updateCompressionSettings();
        this.updateFileSizeEstimate();
        this.seekTo(this.startTime);
    }
    
    stopDragging() {
        this.isDragging = false;
    }
    
    seekToPosition(e) {
        if (this.isDragging) return;
        
        const rect = this.timeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const time = this.startTime + (percentage * (this.endTime - this.startTime));
        
        this.seekTo(time);
    }
    
    seekTo(time) {
        this.currentTime = Math.max(this.startTime, Math.min(time, this.endTime));
        if (this.video) {
            this.video.currentTime = this.currentTime;
        }
        this.updatePlayhead();
        this.updateDisplay();
        this.drawFrame();
    }
    
    updateTimelineHandles() {
        if (!this.timeline || !this.startHandle || !this.endHandle) return;
        
        const startPercentage = (this.startTime / this.duration) * 100;
        const endPercentage = (this.endTime / this.duration) * 100;
        
        this.startHandle.style.left = startPercentage + '%';
        this.endHandle.style.right = (100 - endPercentage) + '%';
    }
    
    updatePlayhead() {
        if (!this.playhead || !this.timeline) return;
        
        const trimDuration = this.endTime - this.startTime;
        const trimProgress = (this.currentTime - this.startTime) / trimDuration;
        const startPercentage = (this.startTime / this.duration) * 100;
        const endPercentage = (this.endTime / this.duration) * 100;
        const trimWidth = endPercentage - startPercentage;
        
        this.playhead.style.left = (startPercentage + (trimProgress * trimWidth)) + '%';
    }
    
    updateDisplay() {
        document.getElementById('current-time').textContent = this.formatTime(this.currentTime);
        document.getElementById('start-time').textContent = this.formatTime(this.startTime);
        document.getElementById('end-time').textContent = this.formatTime(this.endTime);
        document.getElementById('trim-duration').textContent = this.formatTime(this.endTime - this.startTime);
    }
    
    drawFrame() {
        if (!this.video || !this.ctx) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw video frame scaled to canvas size
        this.ctx.drawImage(
            this.video, 
            0, 0, this.video.videoWidth, this.video.videoHeight,
            0, 0, this.canvas.width, this.canvas.height
        );
        
        // Draw text overlays
        this.textOverlays.forEach(overlay => {
            this.drawTextOverlay(overlay);
        });
    }
    
    drawTextOverlay(overlay) {
        if (!this.ctx) return;
        
        this.ctx.save();
        
        // Scale font size based on canvas resolution
        const scaleFactor = this.canvas.width / 720; // Base scale on 720p width
        const scaledFontSize = Math.max(16, overlay.fontSize * scaleFactor);
        
        this.ctx.font = `bold ${scaledFontSize}px Arial, sans-serif`;
        this.ctx.fillStyle = overlay.color;
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.lineWidth = Math.max(2, scaledFontSize / 16);
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Add text shadow for better readability
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        // Draw stroke first
        this.ctx.strokeText(overlay.text, overlay.x, overlay.y);
        // Then fill
        this.ctx.fillText(overlay.text, overlay.x, overlay.y);
        
        this.ctx.restore();
        
        // Draw selection border if selected
        if (overlay === this.selectedOverlay) {
            this.ctx.save();
            this.ctx.strokeStyle = '#25D366'; // WhatsApp green
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([8, 4]);
            
            const metrics = this.ctx.measureText(overlay.text);
            const width = metrics.width + 30;
            const height = scaledFontSize + 20;
            
            this.ctx.strokeRect(
                overlay.x - width/2,
                overlay.y - height/2,
                width,
                height
            );
            this.ctx.restore();
        }
    }
    
    togglePlayback() {
        if (!this.video) return;
        
        if (this.isPlaying) {
            this.pauseVideo();
        } else {
            this.playVideo();
        }
    }
    
    async playVideo() {
        if (!this.video) return;
        
        this.isPlaying = true;
        const playBtn = document.getElementById('play-pause-btn');
        if (playBtn) playBtn.textContent = '⏸️';
        
        // Animation loop
        const animate = () => {
            if (!this.isPlaying) return;
            
            this.currentTime = this.video.currentTime;
            
            // Stop at end of trim
            if (this.currentTime >= this.endTime) {
                this.seekTo(this.startTime);
                this.pauseVideo();
                return;
            }
            
            this.updatePlayhead();
            this.updateDisplay();
            this.drawFrame();
            
            requestAnimationFrame(animate);
        };
        
        try {
            await this.video.play();
            animate();
        } catch (error) {
            console.error('Error playing video:', error);
            this.pauseVideo();
        }
    }
    
    pauseVideo() {
        this.isPlaying = false;
        const playBtn = document.getElementById('play-pause-btn');
        if (playBtn) playBtn.textContent = '▶️';
        if (this.video) {
            this.video.pause();
        }
    }
    
    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        
        // Check if clicking on text overlay
        let clickedOverlay = null;
        for (const overlay of this.textOverlays) {
            const scaleFactor = this.canvas.width / 720;
            const scaledFontSize = Math.max(16, overlay.fontSize * scaleFactor);
            const metrics = this.ctx.measureText(overlay.text);
            const width = metrics.width + 30;
            const height = scaledFontSize + 20;
            
            if (x >= overlay.x - width/2 && x <= overlay.x + width/2 &&
                y >= overlay.y - height/2 && y <= overlay.y + height/2) {
                clickedOverlay = overlay;
                break;
            }
        }
        
        this.selectedOverlay = clickedOverlay;
        this.drawFrame();
    }
    
    handleCanvasMouseDown(e) {
        if (this.selectedOverlay) {
            this.isDragging = 'text';
        }
    }
    
    handleCanvasMouseMove(e) {
        if (this.isDragging === 'text' && this.selectedOverlay) {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
            
            this.selectedOverlay.x = Math.max(50, Math.min(this.canvas.width - 50, x));
            this.selectedOverlay.y = Math.max(30, Math.min(this.canvas.height - 30, y));
            
            this.drawFrame();
        }
    }
    
    handleCanvasMouseUp() {
        if (this.isDragging === 'text') {
            this.isDragging = false;
        }
    }
    
    showTextEditor() {
        const textEditor = document.getElementById('text-editor');
        if (textEditor) {
            textEditor.style.display = 'block';
            const textInput = document.getElementById('text-input');
            if (textInput) textInput.focus();
        }
    }
    
    hideTextEditor() {
        const textEditor = document.getElementById('text-editor');
        if (textEditor) {
            textEditor.style.display = 'none';
        }
        const textInput = document.getElementById('text-input');
        if (textInput) textInput.value = '';
    }
    
    applyText() {
        const textInput = document.getElementById('text-input');
        const fontSizeSelect = document.getElementById('font-size');
        const colorInput = document.getElementById('text-color');
        
        const text = textInput ? textInput.value.trim() : '';
        if (!text) {
            showToast('Please enter some text', '#dc3545');
            return;
        }
        
        const overlay = {
            text: text,
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            fontSize: fontSizeSelect ? parseInt(fontSizeSelect.value) : 32,
            color: colorInput ? colorInput.value : '#FFFFFF'
        };
        
        this.textOverlays.push(overlay);
        this.selectedOverlay = overlay;
        this.hideTextEditor();
        this.drawFrame();
    }
    
    async processVideo() {
        if (!this.originalVideoFile) {
            showToast('No video to process', '#dc3545');
            return;
        }
        
        try {
            if (typeof showVideoProcessingModal === 'function') {
                showVideoProcessingModal('Processing video...');
            }
            if (typeof updateProcessingProgress === 'function') {
                updateProcessingProgress('Preparing video compression...');
            }
            
            // Create processed video with WhatsApp-like compression
            const processedFile = await this.createCompressedVideo();
            
            if (processedFile) {
                // Update the global processed video file
                if (typeof window !== 'undefined') {
                    window.processedVideoFile = processedFile;
                }
                
                // Update preview
                const previewContainer = document.getElementById('video-preview-container');
                if (previewContainer) {
                    previewContainer.innerHTML = '';
                    
                    const video = document.createElement('video');
                    video.src = URL.createObjectURL(processedFile);
                    video.controls = true;
                    video.muted = true;
                    video.style.maxWidth = '100%';
                    video.style.maxHeight = '200px';
                    previewContainer.appendChild(video);
                }
                
                const fileSizeMB = (processedFile.size / (1024 * 1024)).toFixed(1);
                const message = `Video processed successfully! Duration: ${this.formatTime(this.endTime - this.startTime)}, Size: ${fileSizeMB}MB`;
                
                if (typeof showProcessingStatus === 'function') {
                    showProcessingStatus(message, false);
                }
                if (typeof showToast === 'function') {
                    showToast('Video processed successfully!', '#25D366');
                }
                
                this.closeEditor();
            }
            
        } catch (error) {
            console.error('Error processing video:', error);
            if (typeof showToast === 'function') {
                showToast('Error processing video. Please try again.', '#dc3545');
            }
        } finally {
            if (typeof hideVideoProcessingModal === 'function') {
                hideVideoProcessingModal();
            }
        }
    }
    
    async createCompressedVideo() {
        return new Promise((resolve, reject) => {
            if (typeof updateProcessingProgress === 'function') {
                updateProcessingProgress('Starting video compression...');
            }
            
            // Create a higher quality stream for better compression
            const stream = this.canvas.captureStream(this.compressionSettings.targetFrameRate);
            
            // Use modern codec settings for better compression
            let mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm;codecs=vp8';
            }
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
            }
            
            const recorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: this.compressionSettings.targetBitrate,
                audioBitsPerSecond: this.compressionSettings.audioBitrate
            });
            
            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };
            
            recorder.onstop = () => {
                try {
                    const blob = new Blob(chunks, { type: mimeType });
                    const file = new File([blob], 'compressed-video.webm', { 
                        type: mimeType,
                        lastModified: Date.now()
                    });
                    
                    console.log(`Final video size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
                    resolve(file);
                } catch (error) {
                    reject(error);
                }
            };
            
            recorder.onerror = (e) => {
                console.error('MediaRecorder error:', e);
                reject(new Error('Recording failed'));
            };
            
            recorder.start(100); // Record in 100ms chunks for better quality
            
            // Record the trimmed section with smooth playback
            this.recordTrimmedSectionSmooth(recorder);
        });
    }
    
    async recordTrimmedSectionSmooth(recorder) {
        if (!this.video) return;
        
        const duration = this.endTime - this.startTime;
        const frameRate = this.compressionSettings.targetFrameRate;
        const frameInterval = 1000 / frameRate;
        const totalFrames = Math.floor(duration * frameRate);
        let currentFrame = 0;
        
        // Seek to start
        this.video.currentTime = this.startTime;
        await this.waitForVideoSeek();
        
        const recordFrame = async () => {
            if (currentFrame >= totalFrames) {
                recorder.stop();
                return;
            }
            
            const progress = (currentFrame / totalFrames) * 100;
            if (typeof updateProcessingProgress === 'function') {
                updateProcessingProgress(`Compressing: ${Math.round(progress)}%`);
            }
            
            // Update video time
            const currentVideoTime = this.startTime + (currentFrame / frameRate);
            this.video.currentTime = currentVideoTime;
            
            // Wait for video to seek and update canvas
            await this.waitForVideoSeek();
            this.drawFrame();
            
            currentFrame++;
            
            // Use more precise timing
            setTimeout(recordFrame, frameInterval);
        };
        
        // Start recording after a brief delay
        setTimeout(recordFrame, 200);
    }
    
    waitForVideoSeek() {
        return new Promise((resolve) => {
            if (this.video.readyState >= 2) {
                resolve();
            } else {
                this.video.addEventListener('canplay', resolve, { once: true });
                setTimeout(resolve, 50); // Fallback timeout
            }
        });
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    cleanup() {
        if (this.video) {
            this.video.pause();
            URL.revokeObjectURL(this.video.src);
            this.video = null;
        }
        
        this.isPlaying = false;
        this.textOverlays = [];
        this.selectedOverlay = null;
        this.isDragging = false;
        this.originalVideoFile = null;
    }
}

// Initialize video editor when DOM is loaded
let videoEditor = null;

document.addEventListener('DOMContentLoaded', () => {
    videoEditor = new VideoEditor();
});

// Update the existing video input change handler
if (typeof originalVideoInputHandler === 'undefined') {
    // Store the original handler if it exists
    const originalVideoInput = document.getElementById('video-input');
    if (originalVideoInput) {
        const originalHandler = originalVideoInput.onchange;
        
        originalVideoInput.addEventListener('change', async function(e) {
            // Call original handler first
            if (originalHandler) {
                await originalHandler.call(this, e);
            }
            
            // Show edit
            // Show edit button if video is selected
            const editBtn = document.getElementById('edit-video-btn');
            const file = e.target.files[0];
            
            if (file && editBtn) {
                editBtn.style.display = 'inline-block';
            } else if (editBtn) {
                editBtn.style.display = 'none';
            }
        });
    }
}

// Export for global access
window.videoEditor = videoEditor;