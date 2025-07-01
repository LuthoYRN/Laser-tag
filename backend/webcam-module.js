// webcam-module.js
class WebcamModule {
    constructor() {
        this.video = document.getElementById('webcam');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusDiv = document.getElementById('status');
        this.stream = null;
        this.isClassifying = false;
        
        // Crop box settings
        this.cropSize = 200; // Size of the crop box (200x200 pixels)

        this.options = {
            inputs: [64, 64, 4],
            task: 'imageClassification'
        };

        this.initializeEventListeners();
        this.shapeClassifier = ml5.neuralNetwork(this.options);

        this.modelDetails = {
            model: './model/shape-model/model.json',
            metadata: './model/shape-model/model_meta.json',
            weights: './model/shape-model/model.weights.bin'
        };

        this.gotResults = this.gotResults.bind(this);

        this.shapeClassifier.load(this.modelDetails, () => {
            console.log('Model ready!');
            this.updateStatus('Model loaded successfully', 'success');
        });
    }

    // Create overlay with center marker
    createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '10';

        // Create center crop box
        const cropBox = document.createElement('div');
        cropBox.id = 'cropBox';
        cropBox.style.position = 'absolute';
        cropBox.style.width = `${this.cropSize}px`;
        cropBox.style.height = `${this.cropSize}px`;
        cropBox.style.border = '3px solid #00ff00';
        cropBox.style.borderRadius = '8px';
        cropBox.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
        cropBox.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.5)';
        
        // Center the crop box
        cropBox.style.left = '50%';
        cropBox.style.top = '50%';
        cropBox.style.transform = 'translate(-50%, -50%)';

        // Add label
        const label = document.createElement('div');
        label.textContent = 'Classification Area';
        label.style.position = 'absolute';
        label.style.top = '-25px';
        label.style.left = '50%';
        label.style.transform = 'translateX(-50%)';
        label.style.backgroundColor = 'rgba(0, 255, 0, 0.8)';
        label.style.color = 'white';
        label.style.padding = '2px 8px';
        label.style.borderRadius = '4px';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';

        cropBox.appendChild(label);
        overlay.appendChild(cropBox);

        return overlay;
    }

    // Method to preprocess only the center crop area to 64x64x4 format
    preprocessImage() {
        if (!this.video || this.video.readyState !== 4) {
            console.warn('Video not ready for preprocessing');
            return null;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;

        // Calculate crop area (center of video)
        const videoWidth = this.video.videoWidth;
        const videoHeight = this.video.videoHeight;
        
        // Calculate center crop coordinates
        const cropX = (videoWidth - this.cropSize) / 2;
        const cropY = (videoHeight - this.cropSize) / 2;

        console.log(`Video dimensions: ${videoWidth}x${videoHeight}`);
        console.log(`Crop area: ${cropX}, ${cropY}, ${this.cropSize}x${this.cropSize}`);

        // Draw only the center crop area, resized to 64x64
        ctx.drawImage(
            this.video,
            cropX, cropY, this.cropSize, this.cropSize, // Source crop area
            0, 0, 64, 64 // Destination (64x64)
        );

        // Get image data (RGBA format)
        const imageData = ctx.getImageData(0, 0, 64, 64);
        const data = imageData.data;

        // Convert to normalized array [0-1] for the neural network
        const normalizedData = [];
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255.0;
            const g = data[i + 1] / 255.0;
            const b = data[i + 2] / 255.0;
            const a = data[i + 3] / 255.0;
            normalizedData.push(r, g, b, a);
        }

        console.log(`Preprocessed data length: ${normalizedData.length}`);
        return normalizedData;
    }

    // Create debug canvas to show the cropped area
    createPreprocessCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        canvas.style.border = '2px solid red';
        canvas.style.position = 'absolute';
        canvas.style.top = '10px';
        canvas.style.right = '10px';
        canvas.style.zIndex = '20';
        canvas.id = 'preprocessCanvas';

        const label = document.createElement('div');
        label.textContent = 'Processed (64x64)';
        label.style.position = 'absolute';
        label.style.top = '-20px';
        label.style.right = '10px';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        label.style.color = 'red';
        label.style.zIndex = '20';
        label.id = 'preprocessLabel';

        if (!document.getElementById('preprocessCanvas')) {
            document.body.appendChild(canvas);
            document.body.appendChild(label);
        }

        return canvas;
    }

    gotResults(err, results) {
        this.isClassifying = false;

        if (Array.isArray(err) && err.length > 0) {
            results = err;
            err = null;
        }

        if (err && !Array.isArray(err)) {
            console.error('Classification error:', err);
            this.updateStatus(`Classification error: ${err.message || err}`, 'error');
            return;
        }

        if (!results || !Array.isArray(results) || results.length === 0) {
            console.warn('No valid classification results returned:', results);
            this.updateStatus('No classification results', 'error');
            if (this.stream && this.video.readyState === 4) {
                setTimeout(() => this.classifyImage(), 500);
            }
            return;
        }

        if (!results[0] || typeof results[0].label === 'undefined' || typeof results[0].confidence === 'undefined') {
            console.warn('Invalid result structure:', results[0]);
            if (this.stream && this.video.readyState === 4) {
                setTimeout(() => this.classifyImage(), 500);
            }
            return;
        }

        let label = results[0].label;
        let confidence = (100 * results[0].confidence).toFixed(2);
        console.log(`${label} ${confidence}%`);

        // Show top 3 results
        const topResults = results.slice(0, 3)
            .map(r => `${r.label}: ${(r.confidence * 100).toFixed(1)}%`)
            .join(' | ');
        console.log('Top results:', topResults);

        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <div style="font-size: 20px; font-weight: bold; margin-bottom: 5px;">
                    ${label} (${confidence}%)
                </div>
                <div style="font-size: 14px; color: #666;">
                    ${topResults}
                </div>
            `;
        }

        if (this.stream && this.video.readyState === 4) {
            setTimeout(() => this.classifyImage(), 100);
        }
    }

    classifyImage() {
        if (this.isClassifying) {
            return;
        }

        if (!this.video || this.video.readyState !== 4) {
            console.log('Video not ready for classification');
            if (this.stream) {
                setTimeout(() => this.classifyImage(), 200);
            }
            return;
        }

        if (!this.shapeClassifier || !this.shapeClassifier.ready) {
            console.log('Model not ready for classification');
            if (this.stream) {
                setTimeout(() => this.classifyImage(), 200);
            }
            return;
        }

        this.isClassifying = true;

        try {
            const preprocessedData = this.preprocessImage();

            if (!preprocessedData) {
                console.error('Failed to preprocess image');
                this.isClassifying = false;
                return;
            }

            this.showPreprocessedImage();

            this.shapeClassifier.classify(
                preprocessedData,
                this.gotResults
            );

        } catch (error) {
            console.error('Error during classification:', error);
            this.isClassifying = false;
            this.updateStatus(`Classification error: ${error.message}`, 'error');
        }
    }

    showPreprocessedImage() {
        const debugCanvas = document.getElementById('preprocessCanvas') || this.createPreprocessCanvas();
        const ctx = debugCanvas.getContext('2d');

        // Calculate crop area
        const videoWidth = this.video.videoWidth;
        const videoHeight = this.video.videoHeight;
        const cropX = (videoWidth - this.cropSize) / 2;
        const cropY = (videoHeight - this.cropSize) / 2;

        // Draw the cropped area to the debug canvas
        ctx.drawImage(
            this.video,
            cropX, cropY, this.cropSize, this.cropSize,
            0, 0, 64, 64
        );
    }

    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.stopBtn.addEventListener('click', () => this.stopCamera());
    }

    async startCamera() {
        try {
            this.updateStatus('Requesting camera access...', 'info');

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: false
            });

            this.video.srcObject = this.stream;

            this.video.addEventListener('loadedmetadata', () => {
                console.log('Video metadata loaded');
                console.log(`Video dimensions: ${this.video.videoWidth}x${this.video.videoHeight}`);
                
                // Add overlay after video is loaded
                this.addOverlay();
            });

            this.video.addEventListener('canplay', () => {
                console.log('Video can play, starting classification...');
                setTimeout(() => {
                    if (this.shapeClassifier && this.shapeClassifier.ready) {
                        this.classifyImage();
                    } else {
                        this.updateStatus('Waiting for model to load...', 'info');
                        const checkModel = () => {
                            if (this.shapeClassifier && this.shapeClassifier.ready && this.stream) {
                                this.classifyImage();
                            } else if (this.stream) {
                                setTimeout(checkModel, 500);
                            }
                        };
                        checkModel();
                    }
                }, 1000);
            });

            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.updateStatus('Camera started successfully!', 'success');

        } catch (error) {
            console.error('Error accessing webcam:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
        }
    }

    addOverlay() {
        // Remove existing overlay
        const existingOverlay = document.getElementById('overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        // Create and add new overlay
        const overlay = this.createOverlay();
        
        // Position overlay relative to video
        const videoContainer = this.video.parentElement;
        videoContainer.style.position = 'relative';
        videoContainer.appendChild(overlay);
    }

    stopCamera() {
        this.isClassifying = false;

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.updateStatus('Camera stopped', 'info');

            const resultsDiv = document.getElementById('results');
            if (resultsDiv) {
                resultsDiv.textContent = '';
            }

            // Remove overlay and debug elements
            const overlay = document.getElementById('overlay');
            if (overlay) {
                overlay.remove();
            }

            const debugCanvas = document.getElementById('preprocessCanvas');
            if (debugCanvas) {
                debugCanvas.remove();
            }

            const debugLabel = document.getElementById('preprocessLabel');
            if (debugLabel) {
                debugLabel.remove();
            }
        }
    }

    updateStatus(message, type) {
        this.statusDiv.textContent = message;
        this.statusDiv.className = type;
    }

    // Method to adjust crop size
    setCropSize(size) {
        this.cropSize = size;
        console.log(`Crop size set to: ${size}x${size}`);
        
        // Update overlay if it exists
        const cropBox = document.getElementById('cropBox');
        if (cropBox) {
            cropBox.style.width = `${size}px`;
            cropBox.style.height = `${size}px`;
        }
    }

    captureFrame() {
        if (!this.stream || this.video.readyState !== 4) {
            console.warn('Camera not ready for frame capture');
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);

        return canvas;
    }

    getImageData() {
        const canvas = this.captureFrame();
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const webcamModule = new WebcamModule();
    window.webcamModule = webcamModule;
    
    // Expose crop size control for testing
    window.setCropSize = (size) => webcamModule.setCropSize(size);
});