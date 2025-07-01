class WebcamModule {
    constructor() {
        this.video = document.getElementById('videoElement');
        this.toggleButton = document.getElementById('toggleButton');
        this.stream = null;
        this.monitorCanvas = null;
        this.monitorCtx = null;
        this.boundingBoxSize = 200; // Default size, adjusted in media query
        this.animationFrameId = null;
        this.initializeEventListeners();
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

    createBoundingBox() {
        const boundingBox = document.createElement('div');
        boundingBox.id = 'boundingBox';
        const centerMarker = document.createElement('div');
        centerMarker.id = 'centerMarker';
        boundingBox.appendChild(centerMarker);
        return boundingBox;
    }

    createMonitor() {
        const canvas = document.createElement('canvas');
        canvas.id = 'monitorCanvas';
        canvas.width = this.boundingBoxSize;
        canvas.height = this.boundingBoxSize;
        return canvas;
    }

    addBoundingBoxAndMonitor() {
        const existingBox = document.getElementById('boundingBox');
        if (existingBox) {
            existingBox.remove();
        }
        const existingCanvas = document.getElementById('monitorCanvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }

        // Update bounding box size based on screen width
        this.boundingBoxSize = window.innerWidth <= 600 ? 150 : 200;

        const videoContainer = this.video.parentElement;
        const boundingBox = this.createBoundingBox();
        videoContainer.appendChild(boundingBox);

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

        const videoWidth = this.video.videoWidth;
        const videoHeight = this.video.videoHeight;
        const cropX = (videoWidth - this.boundingBoxSize) / 2;
        const cropY = (videoHeight - this.boundingBoxSize) / 2;

        this.monitorCtx.drawImage(
            this.video,
            cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
            0, 0, this.boundingBoxSize, this.boundingBoxSize
        );

        this.animationFrameId = requestAnimationFrame(() => this.updateMonitor());
    }

    /*updateMonitor() {
        if (!this.stream || !this.monitorCtx || this.video.readyState !== 4) {
            return;
        }

        const videoWidth = this.video.videoWidth;
        const videoHeight = this.video.videoHeight;
        const cropX = (videoWidth - this.boundingBoxSize) / 2;
        const cropY = (videoHeight - this.boundingBoxSize) / 2;

        console.log(`Crop coordinates: x=${cropX}, y=${cropY}, size=${this.boundingBoxSize}`);
        this.monitorCtx.drawImage(
            this.video,
            cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
            0, 0, this.boundingBoxSize, this.boundingBoxSize
        );

        this.animationFrameId = requestAnimationFrame(() => this.updateMonitor());
    }*/

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

            this.video.addEventListener('loadedmetadata', () => {
                this.addBoundingBoxAndMonitor();
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

            const boundingBox = document.getElementById('boundingBox');
            if (boundingBox) {
                boundingBox.remove();
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