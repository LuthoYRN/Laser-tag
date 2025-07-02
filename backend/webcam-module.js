class WebcamModule {
    constructor() {
        this.video = document.getElementById('videoElement');
        this.toggleButton = document.getElementById('toggleButton');
        this.pickColorButton = document.getElementById('pickColorButton');
        this.stream = null;
        this.monitorCanvasGrayscale = null;
        this.monitorCanvasBinary = null;
        this.monitorCanvasInverted = null;
        this.monitorCanvasMasked = null;
        this.monitorCtxGrayscale = null;
        this.monitorCtxBinary = null;
        this.monitorCtxInverted = null;
        this.monitorCtxMasked = null;
        this.boundingBoxSize = 200;
        this.outputSize = 28;
        this.animationFrameId = null;
        this.opencvReady = false;
        this.selectedColor = null;
        this.colorTolerance = 30;
        this.loadOpenCV();
        this.initializeEventListeners();
    }

    loadOpenCV() {
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
        this.pickColorButton.addEventListener('click', () => {
            this.pickColor();
        });
    }

    pickColor() {
        if (!this.stream || this.video.readyState !== 4) {
            alert('Camera is not active or video is not ready.');
            return;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.video.videoWidth;
        tempCanvas.height = this.video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.video, 0, 0, tempCanvas.width, tempCanvas.height);
        const centerX = Math.floor(tempCanvas.width / 2);
        const centerY = Math.floor(tempCanvas.height / 2);
        const pixelData = tempCtx.getImageData(centerX, centerY, 1, 1).data;
        this.selectedColor = [pixelData[0], pixelData[1], pixelData[2]];
        console.log('Selected color:', this.selectedColor);
    }

    createMonitor(id) {
        const canvas = document.createElement('canvas');
        canvas.id = id;
        canvas.width = this.outputSize;
        canvas.height = this.outputSize;
        return canvas;
    }

    addCenterMarkerAndMonitor() {
        const existingMarker = document.getElementById('centerMarker');
        if (existingMarker) {
            existingMarker.remove();
        }
        const existingCanvasGrayscale = document.getElementById('monitorCanvasGrayscale');
        if (existingCanvasGrayscale) {
            existingCanvasGrayscale.remove();
        }
        const existingCanvasBinary = document.getElementById('monitorCanvasBinary');
        if (existingCanvasBinary) {
            existingCanvasBinary.remove();
        }
        const existingCanvasInverted = document.getElementById('monitorCanvasInverted');
        if (existingCanvasInverted) {
            existingCanvasInverted.remove();
        }
        const existingCanvasMasked = document.getElementById('monitorCanvasMasked');
        if (existingCanvasMasked) {
            existingCanvasMasked.remove();
        }

        this.boundingBoxSize = window.innerWidth <= 600 ? 150 : 200;

        const videoContainer = this.video.parentElement;
        const centerMarker = document.createElement('div');
        centerMarker.id = 'centerMarker';
        videoContainer.appendChild(centerMarker);

        const monitorSection = document.querySelector('.monitor-section');
        const monitorCanvasGrayscale = this.createMonitor('monitorCanvasGrayscale');
        const monitorCanvasBinary = this.createMonitor('monitorCanvasBinary');
        const monitorCanvasInverted = this.createMonitor('monitorCanvasInverted');
        const monitorCanvasMasked = this.createMonitor('monitorCanvasMasked');
        this.monitorCanvasGrayscale = monitorCanvasGrayscale;
        this.monitorCanvasBinary = monitorCanvasBinary;
        this.monitorCanvasInverted = monitorCanvasInverted;
        this.monitorCanvasMasked = monitorCanvasMasked;
        this.monitorCtxGrayscale = monitorCanvasGrayscale.getContext('2d');
        this.monitorCtxBinary = monitorCanvasBinary.getContext('2d');
        this.monitorCtxInverted = monitorCanvasInverted.getContext('2d');
        this.monitorCtxMasked = monitorCanvasMasked.getContext('2d');

        monitorSection.children[0].appendChild(monitorCanvasGrayscale);
        monitorSection.children[1].appendChild(monitorCanvasBinary);
        monitorSection.children[2].appendChild(monitorCanvasInverted);
        monitorSection.children[3].appendChild(monitorCanvasMasked);

        this.updateMonitor();
    }

    updateMonitor() {
        if (!this.stream || !this.monitorCtxGrayscale || !this.monitorCtxBinary || !this.monitorCtxInverted || !this.monitorCtxMasked || this.video.readyState !== 4) {
            return;
        }

        const videoDisplayWidth = this.video.videoWidth;
        const videoDisplayHeight = this.video.videoHeight;
        const cropX = (videoDisplayWidth - this.boundingBoxSize) / 2;
        const cropY = (videoDisplayHeight - this.boundingBoxSize) / 2;

        if (this.opencvReady) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.boundingBoxSize;
            tempCanvas.height = this.boundingBoxSize;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.boundingBoxSize, this.boundingBoxSize
            );

            let src = cv.imread(tempCanvas);
            let gray = new cv.Mat();
            let resized = new cv.Mat();
            let binary = new cv.Mat();
            let inverted = new cv.Mat();

            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            let dsize = new cv.Size(this.outputSize, this.outputSize);
            cv.resize(gray, resized, dsize, 0, 0, cv.INTER_AREA);
            cv.threshold(resized, binary, 100, 255, cv.THRESH_BINARY);
            cv.bitwise_not(binary, inverted);

            if (this.selectedColor) {
                let srcColor = cv.imread(tempCanvas);
                cv.resize(srcColor, srcColor, dsize, 0, 0, cv.INTER_AREA);
                let mask = new cv.Mat();
                let masked = new cv.Mat.zeros(srcColor.rows, srcColor.cols, srcColor.type());
                let lowerBound = new cv.Mat(srcColor.rows, srcColor.cols, srcColor.type(), [
                    Math.max(this.selectedColor[0] - this.colorTolerance, 0),
                    Math.max(this.selectedColor[1] - this.colorTolerance, 0),
                    Math.max(this.selectedColor[2] - this.colorTolerance, 0),
                    255
                ]);
                let upperBound = new cv.Mat(srcColor.rows, srcColor.cols, srcColor.type(), [
                    Math.min(this.selectedColor[0] + this.colorTolerance, 255),
                    Math.min(this.selectedColor[1] + this.colorTolerance, 255),
                    Math.min(this.selectedColor[2] + this.colorTolerance, 255),
                    255
                ]);
                cv.inRange(srcColor, lowerBound, upperBound, mask);
                cv.bitwise_and(srcColor, srcColor, masked, mask);
                cv.imshow(this.monitorCanvasMasked, masked);
                srcColor.delete();
                mask.delete();
                lowerBound.delete();
                upperBound.delete();
            } else {
                let black = new cv.Mat(this.outputSize, this.outputSize, cv.CV_8UC4, [0, 0, 0, 255]);
                cv.imshow(this.monitorCanvasMasked, black);
                black.delete();
            }

            cv.imshow(this.monitorCanvasGrayscale, resized);
            cv.imshow(this.monitorCanvasBinary, binary);
            cv.imshow(this.monitorCanvasInverted, inverted);

            src.delete();
            gray.delete();
            resized.delete();
            binary.delete();
            inverted.delete();
        } else {
            this.monitorCtxGrayscale.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.outputSize, this.outputSize
            );
            this.monitorCtxBinary.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.outputSize, this.outputSize
            );
            this.monitorCtxInverted.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.outputSize, this.outputSize
            );
            this.monitorCtxMasked.drawImage(
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
            this.selectedColor = null;

            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }

            const centerMarker = document.getElementById('centerMarker');
            if (centerMarker) {
                centerMarker.remove();
            }
            const monitorCanvasGrayscale = document.getElementById('monitorCanvasGrayscale');
            if (monitorCanvasGrayscale) {
                monitorCanvasGrayscale.remove();
            }
            const monitorCanvasBinary = document.getElementById('monitorCanvasBinary');
            if (monitorCanvasBinary) {
                monitorCanvasBinary.remove();
            }
            const monitorCanvasInverted = document.getElementById('monitorCanvasInverted');
            if (monitorCanvasInverted) {
                monitorCanvasInverted.remove();
            }
            const monitorCanvasMasked = document.getElementById('monitorCanvasMasked');
            if (monitorCanvasMasked) {
                monitorCanvasMasked.remove();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WebcamModule();
});