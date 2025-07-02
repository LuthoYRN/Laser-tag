class WebcamModule {
    constructor() {
        this.video = document.getElementById('videoElement');
        this.toggleButton = document.getElementById('toggleButton');
        this.stream = null;
        this.monitorCanvas = null;
        this.monitorCtx = null;
        this.boundingBoxSize = 200; // Size for cropping from video
        this.outputSize = 28; // Output size for monitor view (28x28)
        this.animationFrameId = null;
        this.opencvReady = false;
        this.loadOpenCV();
        this.initializeEventListeners();
    }

    loadOpenCV() {
        // Create script element for OpenCV.js
        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
        script.async = true;
        script.onload = () => {
            cv.onRuntimeInitialized = () => {
                console.log('OpenCV.js loaded successfully');
                this.opencvReady = true;
            };
        };
        script.onerror = () => {
            console.error('Failed to load OpenCV.js');
            alert('Failed to load OpenCV.js. Please check your network connection.');
        };
        document.head.appendChild(script);
    }

    initializeEventListeners() {
        this.toggleButton.addEventListener('click', () => {
            if (this.stream) {
                this.stopCamera();
            } else {
                this.startCamera();
            }
        });
    }

    createMonitor() {
        const canvas = document.createElement('canvas');
        canvas.id = 'monitorCanvas';
        canvas.width = this.outputSize; // Set canvas to 28x28
        canvas.height = this.outputSize;
        return canvas;
    }

    addCenterMarkerAndMonitor() {
        const existingMarker = document.getElementById('centerMarker');
        if (existingMarker) {
            existingMarker.remove();
        }
        const existingCanvas = document.getElementById('monitorCanvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }

        // Update bounding box size based on screen width
        this.boundingBoxSize = window.innerWidth <= 600 ? 150 : 200;

        const videoContainer = this.video.parentElement;
        const centerMarker = document.createElement('div');
        centerMarker.id = 'centerMarker';
        videoContainer.appendChild(centerMarker);

        const monitorSection = document.querySelector('.monitor-section');
        const monitorCanvas = this.createMonitor();
        this.monitorCanvas = monitorCanvas;
        this.monitorCtx = monitorCanvas.getContext('2d');
        monitorSection.appendChild(monitorCanvas);

        this.updateMonitor();
    }

    updateMonitor() {
        if (!this.stream || !this.monitorCtx || this.video.readyState !== 4) {
            return;
        }

        // Use displayed dimensions to match the video's rendered size
        const videoDisplayWidth = this.video.videoWidth;
        const videoDisplayHeight = this.video.videoHeight;
        const cropX = (videoDisplayWidth - this.boundingBoxSize) / 2;
        const cropY = (videoDisplayHeight - this.boundingBoxSize) / 2;

        if (this.opencvReady) {
            // Create a temporary canvas to capture the cropped frame
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.boundingBoxSize;
            tempCanvas.height = this.boundingBoxSize;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.boundingBoxSize, this.boundingBoxSize
            );

            // Process with OpenCV.js
            let src = cv.imread(tempCanvas);
            let gray = new cv.Mat();
            let resized = new cv.Mat();
            let binary = new cv.Mat();

            // Convert to grayscale
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Resize to 28x28
            let dsize = new cv.Size(this.outputSize, this.outputSize);
            cv.resize(gray, resized, dsize, 0, 0, cv.INTER_AREA);

            // Apply binary thresholding
            cv.threshold(resized, binary, 100, 255, cv.THRESH_BINARY);

            // Display on monitor canvas
            cv.imshow(this.monitorCanvas, binary);

            // Clean up
            src.delete();
            gray.delete();
            resized.delete();
            binary.delete();
        } else {
            // Fallback rendering if OpenCV.js is not ready
            this.monitorCtx.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.outputSize, this.outputSize
            );
        }

        this.animationFrameId = requestAnimationFrame(() => this.updateMonitor());
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    noiseSuppression: true,
                    focusMode: "auto",
                    facingMode: 'environment'
                },
                audio: false
            });

            this.video.srcObject = this.stream;
            this.toggleButton.textContent = 'Stop Camera';
            this.toggleButton.classList.add('stop');

            this.video.addEventListener('canplay', () => {
                this.addCenterMarkerAndMonitor();
            }, { once: true });
        } catch (error) {
            console.error('Error accessing webcam:', error);
            alert(`Error: ${error.message}`);
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
            this.toggleButton.textContent = 'Start Camera';
            this.toggleButton.classList.remove('stop');

            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }

            const centerMarker = document.getElementById('centerMarker');
            if (centerMarker) {
                centerMarker.remove();
            }
            const monitorCanvas = document.getElementById('monitorCanvas');
            if (monitorCanvas) {
                monitorCanvas.remove();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WebcamModule();
});