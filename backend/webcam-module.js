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

    createMonitor() {
        const canvas = document.createElement('canvas');
        canvas.id = 'monitorCanvas';
        canvas.width = this.boundingBoxSize;
        canvas.height = this.boundingBoxSize;
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
        const videoDisplayHeight = this.video.videoHeight; // Fixed typo from videoWidth
        const cropX = (videoDisplayWidth - this.boundingBoxSize) / 2;
        const cropY = (videoDisplayHeight - this.boundingBoxSize) / 2;

        this.monitorCtx.drawImage(
            this.video,
            cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
            0, 0, this.boundingBoxSize, this.boundingBoxSize
        );

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