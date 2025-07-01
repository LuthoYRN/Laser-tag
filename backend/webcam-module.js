// webcam-module.js
class WebcamModule {
    constructor() {
        this.video = document.getElementById('webcam');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusDiv = document.getElementById('status');
        this.stream = null;

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

        this.shapeClassifier.load(this.modelDetails, () => { console.log('model ready!') });

    }

    gotResults(err, results) {
        // console.log(`This is results ${results}`);
        if (err) {
            console.error('Classification error:', err);
            this.updateStatus(`Classification error: ${err.message}`, 'error');
            return;
        }

        // Check if results are valid
        if (!results || results.length === 0) {
            console.warn('No classification results returned');
            this.updateStatus('No classification results', 'error');
            // Retry classification if camera is active
            if (this.stream) {
                setTimeout(() => this.classifyImage(), 100); // Delay to avoid tight loop
            }
            return;
        }

        let label = results[0].label;
        let confidence = (100 * results[0].confidence).toFixed(2);
        console.log(`${label} ${confidence}%`);
        this.classifyImage(this.video);
    }

    classifyImage(video) {
        this.shapeClassifier.classify(
            {
                image: video
            },
            this.gotResults
        );
    }

    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.stopBtn.addEventListener('click', () => this.stopCamera());
    }

    async startCamera() {
        try {
            this.updateStatus('Requesting camera access...', 'info');

            // Request webcam access
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user' // Use front camera
                },
                audio: false
            });

            // Set video source to webcam stream
            this.video.srcObject = this.stream;

            // Update UI
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.updateStatus('Camera started successfully!', 'success');
            
            // Optional: Add event listeners for video events
            this.video.addEventListener('loadedmetadata', () => {
                console.log('Video metadata loaded');
                console.log(`Video dimensions: ${this.video.videoWidth}x${this.video.videoHeight}`);
            });

        } catch (error) {
            console.error('Error accessing webcam:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
        }
    }

    stopCamera() {
        if (this.stream) {
            // Stop all tracks
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;

            // Clear video source
            this.video.srcObject = null;

            // Update UI
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.updateStatus('Camera stopped', 'info');
        }
    }

    updateStatus(message, type) {
        this.statusDiv.textContent = message;
        this.statusDiv.className = type;
    }

    // Method to get current video frame (useful for processing)
    captureFrame() {
        if (!this.stream) {
            console.warn('Camera not started');
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);

        return canvas;
    }

    // Method to get image data for processing
    getImageData() {
        const canvas = this.captureFrame();
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
}

// Initialize the module when page loads
document.addEventListener('DOMContentLoaded', () => {
    const webcamModule = new WebcamModule();

    // Make it globally accessible for testing
    window.webcamModule = webcamModule;
});