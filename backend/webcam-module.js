// webcam-module.js
class WebcamModule {
    constructor() {
        this.video = document.getElementById('webcam');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusDiv = document.getElementById('status');
        this.stream = null;
        this.isClassifying = false;

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

        // Bind the gotResults method to maintain context
        this.gotResults = this.gotResults.bind(this);

        this.shapeClassifier.load(this.modelDetails, () => {
            console.log('Model ready!');
            this.updateStatus('Model loaded successfully', 'success');
        });
    }

    // Method to preprocess video frame to 64x64x4 format
    preprocessImage() {
        if (!this.video || this.video.readyState !== 4) {
            console.warn('Video not ready for preprocessing');
            return null;
        }

        // Create canvas for processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas size to model input size (64x64)
        canvas.width = 64;
        canvas.height = 64;

        // Draw and resize video frame to 64x64
        ctx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight,
            0, 0, 64, 64);

        // Get image data (RGBA format)
        const imageData = ctx.getImageData(0, 0, 64, 64);
        const data = imageData.data; // This is Uint8ClampedArray with RGBA values

        // Convert to normalized array [0-1] for the neural network
        const normalizedData = [];

        for (let i = 0; i < data.length; i += 4) {
            // Extract RGBA values and normalize to 0-1 range
            const r = data[i] / 255.0;
            const g = data[i + 1] / 255.0;
            const b = data[i + 2] / 255.0;
            const a = data[i + 3] / 255.0;

            normalizedData.push(r, g, b, a);
        }

        console.log(`Preprocessed data length: ${normalizedData.length}`); // Should be 16384 (64*64*4)

        return normalizedData;
    }

    // Alternative method using canvas element (if you want to see the preprocessed image)
    createPreprocessCanvas() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;
        canvas.style.border = '1px solid red';
        canvas.style.position = 'absolute';
        canvas.style.top = '10px';
        canvas.style.right = '10px';
        canvas.id = 'preprocessCanvas';

        // Add to page for debugging (optional)
        if (!document.getElementById('preprocessCanvas')) {
            document.body.appendChild(canvas);
        }

        return canvas;
    }

    gotResults(err, results) {
        this.isClassifying = false;

        // Check if 'err' is actually the results (ml5.js sometimes does this)
        if (Array.isArray(err) && err.length > 0) {
            // 'err' is actually the results array
            results = err;
            err = null;
        }

        // Now handle actual errors
        if (err && !Array.isArray(err)) {
            console.error('Classification error:', err);
            this.updateStatus(`Classification error: ${err.message || err}`, 'error');
            return;
        }

        // Validate results
        if (!results || !Array.isArray(results) || results.length === 0) {
            console.warn('No valid classification results returned:', results);
            this.updateStatus('No classification results', 'error');
            if (this.stream && this.video.readyState === 4) {
                setTimeout(() => this.classifyImage(), 500);
            }
            return;
        }

        // Additional check for valid result structure
        if (!results[0] || typeof results[0].label === 'undefined' || typeof results[0].confidence === 'undefined') {
            console.warn('Invalid result structure:', results[0]);
            if (this.stream && this.video.readyState === 4) {
                setTimeout(() => this.classifyImage(), 500);
            }
            return;
        }

        // Successfully got results - display them
        let label = results[0].label;
        let confidence = (100 * results[0].confidence).toFixed(2);
        console.log(`${label} ${confidence}%`);

        // Show all results for debugging
        console.log('All results:', results.map(r => `${r.label}: ${(r.confidence * 100).toFixed(2)}%`));

        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            resultsDiv.textContent = `Detected: ${label} (${confidence}% confidence)`;
        }

        // Continue classification if camera is still active
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
            // Preprocess the image to 64x64x4 format
            const preprocessedData = this.preprocessImage();

            if (!preprocessedData) {
                console.error('Failed to preprocess image');
                this.isClassifying = false;
                return;
            }

            // Optional: Show preprocessed image for debugging
            this.showPreprocessedImage();

            // Classify using the preprocessed data
            this.shapeClassifier.classify(
                preprocessedData, // Use preprocessed data instead of raw video
                this.gotResults
            );

        } catch (error) {
            console.error('Error during classification:', error);
            this.isClassifying = false;
            this.updateStatus(`Classification error: ${error.message}`, 'error');
        }
    }

    // Optional: Method to display the preprocessed 64x64 image for debugging
    showPreprocessedImage() {
        const debugCanvas = document.getElementById('preprocessCanvas') || this.createPreprocessCanvas();
        const ctx = debugCanvas.getContext('2d');

        // Draw the current video frame resized to 64x64
        ctx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight,
            0, 0, 64, 64);
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

            // Remove debug canvas if it exists
            const debugCanvas = document.getElementById('preprocessCanvas');
            if (debugCanvas) {
                debugCanvas.remove();
            }
        }
    }

    updateStatus(message, type) {
        this.statusDiv.textContent = message;
        this.statusDiv.className = type;
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
});