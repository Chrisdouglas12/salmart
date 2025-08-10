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
        this.quality = 'medium';
        
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
        
        // Quality selection
        const qualityInputs = document.querySelectorAll('input[name="quality"]');
        qualityInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.quality = e.target.value;
            });
        });
        
        // Play/pause button
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.togglePlayback());
        }
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
            
            // Wait for metadata to load
            await new Promise((resolve, reject) => {
                this.video.addEventListener('loadedmetadata', resolve);
                this.video.addEventListener('error', reject);
            });
            
            this.duration = this.video.duration;
            this.endTime = Math.min(this.duration, MAX_VIDEO_DURATION);
            
            // Set canvas size
            const aspectRatio = this.video.videoWidth / this.video.videoHeight;
            const maxWidth = 600;
            const maxHeight = 400;
            
            if (aspectRatio > maxWidth / maxHeight) {
                this.canvas.width = maxWidth;
                this.canvas.height = maxWidth / aspectRatio;
            } else {
                this.canvas.height = maxHeight;
                this.canvas.width = maxHeight * aspectRatio;
            }
            
            this.canvas.style.width = this.canvas.width + 'px';
            this.canvas.style.height = this.canvas.height + 'px';
            
            // Setup timeline
            this.setupTimeline();
            this.setupCanvasEvents();
            this.updateDisplay();
            this.drawFrame();
            
            // Update time displays
            document.getElementById('total-time').textContent = this.formatTime(this.duration);
            document.getElementById('end-time').textContent = this.formatTime(this.endTime);
            
        } catch (error) {
            console.error('Error setting up video editor:', error);
            showToast('Error loading video for editing', '#dc3545');
            this.closeEditor();
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
            // Limit to MAX_VIDEO_DURATION
            if (this.endTime - this.startTime > MAX_VIDEO_DURATION) {
                this.endTime = this.startTime + MAX_VIDEO_DURATION;
            }
        }
        
        this.updateTimelineHandles();
        this.updateDisplay();
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
        
        // Draw video frame
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Draw text overlays
        this.textOverlays.forEach(overlay => {
            this.drawTextOverlay(overlay);
        });
    }
    
    drawTextOverlay(overlay) {
        if (!this.ctx) return;
        
        this.ctx.save();
        this.ctx.font = `${overlay.fontSize}px Arial`;
        this.ctx.fillStyle = overlay.color;
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.textAlign = 'center';
        
        // Draw stroke first
        this.ctx.strokeText(overlay.text, overlay.x, overlay.y);
        // Then fill
        this.ctx.fillText(overlay.text, overlay.x, overlay.y);
        
        this.ctx.restore();
        
        // Draw selection border if selected
        if (overlay === this.selectedOverlay) {
            this.ctx.save();
            this.ctx.strokeStyle = '#28a745';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            
            const metrics = this.ctx.measureText(overlay.text);
            const width = metrics.width + 20;
            const height = overlay.fontSize + 10;
            
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
        document.getElementById('play-pause-btn').textContent = '⏸️';
        
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
        document.getElementById('play-pause-btn').textContent = '▶️';
        if (this.video) {
            this.video.pause();
        }
    }
    
    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Scale coordinates
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const canvasX = x * scaleX;
        const canvasY = y * scaleY;
        
        // Check if clicking on text overlay
        let clickedOverlay = null;
        for (const overlay of this.textOverlays) {
            const metrics = this.ctx.measureText(overlay.text);
            const width = metrics.width + 20;
            const height = overlay.fontSize + 10;
            
            if (canvasX >= overlay.x - width/2 && canvasX <= overlay.x + width/2 &&
                canvasY >= overlay.y - height/2 && canvasY <= overlay.y + height/2) {
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
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            this.selectedOverlay.x = x * scaleX;
            this.selectedOverlay.y = y * scaleY;
            
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
            document.getElementById('text-input').focus();
        }
    }
    
    hideTextEditor() {
        const textEditor = document.getElementById('text-editor');
        if (textEditor) {
            textEditor.style.display = 'none';
        }
        document.getElementById('text-input').value = '';
    }
    
    applyText() {
        const textInput = document.getElementById('text-input');
        const fontSizeSelect = document.getElementById('font-size');
        const colorInput = document.getElementById('text-color');
        
        const text = textInput.value.trim();
        if (!text) {
            showToast('Please enter some text', '#dc3545');
            return;
        }
        
        const overlay = {
            text: text,
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            fontSize: parseInt(fontSizeSelect.value),
            color: colorInput.value
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
            showVideoProcessingModal('Processing video...');
            updateProcessingProgress('Preparing video processing...');
            
            // Create processed video using canvas recording
            const processedFile = await this.createProcessedVideo();
            
            if (processedFile) {
                // Update the global processed video file
                processedVideoFile = processedFile;
                
                // Update preview
                const previewContainer = document.getElementById('video-preview-container');
                previewContainer.innerHTML = '';
                
                const video = document.createElement('video');
                video.src = URL.createObjectURL(processedFile);
                video.controls = true;
                video.muted = true;
                video.style.maxWidth = '100%';
                video.style.maxHeight = '200px';
                previewContainer.appendChild(video);
                
                showProcessingStatus(`Video processed successfully! Duration: ${this.formatTime(this.endTime - this.startTime)}`, false);
                showToast('Video processed successfully!', '#28a745');
                this.closeEditor();
            }
            
        } catch (error) {
            console.error('Error processing video:', error);
            showToast('Error processing video. Please try again.', '#dc3545');
        } finally {
            hideVideoProcessingModal();
        }
    }
    
    async createProcessedVideo() {
        return new Promise((resolve, reject) => {
            updateProcessingProgress('Creating processed video...');
            
            const stream = this.canvas.captureStream(30); // 30fps
            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm',
                videoBitsPerSecond: this.getVideoBitrate()
            });
            
            const chunks = [];
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const file = new File([blob], 'processed-video.webm', { type: 'video/webm' });
                resolve(file);
            };
            recorder.onerror = reject;
            
            recorder.start();
            
            // Record the trimmed portion
            this.recordTrimmedSection(recorder);
        });
    }
    
    async recordTrimmedSection(recorder) {
        if (!this.video) return;
        
        const duration = this.endTime - this.startTime;
        const frameRate = 30;
        const totalFrames = Math.floor(duration * frameRate);
        let currentFrame = 0;
        
        this.video.currentTime = this.startTime;
        
        const recordFrame = async () => {
            if (currentFrame >= totalFrames) {
                recorder.stop();
                return;
            }
            
            const progress = (currentFrame / totalFrames) * 100;
            updateProcessingProgress(`Recording: ${Math.round(progress)}%`);
            
            this.drawFrame();
            currentFrame++;
            
            // Advance video time
            const timeStep = duration / totalFrames;
            this.video.currentTime = this.startTime + (currentFrame * timeStep);
            
            // Wait for next frame
            await new Promise(resolve => setTimeout(resolve, 1000 / frameRate));
            recordFrame();
        };
        
        // Start recording
        setTimeout(recordFrame, 100);
    }
    
    getVideoBitrate() {
        const bitrates = {
            'low': 500000,    // 500 kbps
            'medium': 1000000, // 1 Mbps
            'high': 2000000    // 2 Mbps
        };
        return bitrates[this.quality] || bitrates.medium;
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
        }
        
        this.isPlaying = false;
        this.textOverlays = [];
        this.selectedOverlay = null;
        this.isDragging = false;
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