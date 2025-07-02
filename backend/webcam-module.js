class WebcamModule {
    constructor() {
        this.video = document.getElementById('videoElement');
        this.toggleButton = document.getElementById('toggleButton');
        this.pickColorButton = document.getElementById('pickColorButton');
        this.colorPicker = document.getElementById('colorPicker');
        this.colorValue = document.getElementById('colorValue');
        this.colorSwatch = document.getElementById('colorSwatch');
        this.stream = null;
        this.monitorCanvasOriginal = null;
        this.monitorCanvasMasked = null;
        this.monitorCanvasBinary = null;
        this.monitorCanvasPlaceholder = null;
        this.monitorCtxOriginal = null;
        this.monitorCtxMasked = null;
        this.monitorCtxBinary = null;
        this.monitorCtxPlaceholder = null;
        this.boundingBoxSize = 200;
        this.outputSize = 28;
        this.animationFrameId = null;
        this.opencvReady = false;
        this.selectedColorHSV = null;
        this.colorTolerance = { h: 10, s: 40, v: 40 }; // Tolerance for HSV: ±10 for hue, ±40 for saturation/value
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
        this.colorPicker.addEventListener('change', () => {
            this.setColorFromPicker();
        });
    }

    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        let h, s, v = max;

        if (delta === 0) {
            h = 0;
        } else if (max === r) {
            h = ((g - b) / delta) % 6;
        } else if (max === g) {
            h = (b - r) / delta + 2;
        } else {
            h = (r - g) / delta + 4;
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;
        s = max === 0 ? 0 : delta / max;
        s = Math.round(s * 100);
        v = Math.round(v * 100);
        return [h, s, v];
    }

    hsvToRgb(h, s, v) {
        h /= 360;
        s /= 100;
        v /= 100;
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
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
        this.selectedColorHSV = this.rgbToHsv(pixelData[0], pixelData[1], pixelData[2]);
        this.updateColorDisplay();
        console.log('Selected color (HSV):', this.selectedColorHSV);
    }

    setColorFromPicker() {
        const hexColor = this.colorPicker.value;
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        this.selectedColorHSV = this.rgbToHsv(r, g, b);
        this.updateColorDisplay();
        console.log('Selected color from picker (HSV):', this.selectedColorHSV);
    }

    updateColorDisplay() {
        if (this.selectedColorHSV) {
            const [h, s, v] = this.selectedColorHSV;
            this.colorValue.textContent = `HSV(${h}, ${s}%, ${v}%)`;
            const [r, g, b] = this.hsvToRgb(h, s, v);
            this.colorSwatch.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            this.colorPicker.value = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
        } else {
            this.colorValue.textContent = 'No color selected';
            this.colorSwatch.style.backgroundColor = 'transparent';
            this.colorPicker.value = '#000000';
        }
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
        const existingCanvasOriginal = document.getElementById('monitorCanvasOriginal');
        if (existingCanvasOriginal) {
            existingCanvasOriginal.remove();
        }
        const existingCanvasMasked = document.getElementById('monitorCanvasMasked');
        if (existingCanvasMasked) {
            existingCanvasMasked.remove();
        }
        const existingCanvasBinary = document.getElementById('monitorCanvasBinary');
        if (existingCanvasBinary) {
            existingCanvasBinary.remove();
        }
        const existingCanvasPlaceholder = document.getElementById('monitorCanvasPlaceholder');
        if (existingCanvasPlaceholder) {
            existingCanvasPlaceholder.remove();
        }

        this.boundingBoxSize = window.innerWidth <= 600 ? 150 : 200;

        const videoContainer = this.video.parentElement;
        const centerMarker = document.createElement('div');
        centerMarker.id = 'centerMarker';
        videoContainer.appendChild(centerMarker);

        const monitorSection = document.querySelector('.monitor-section');
        const monitorCanvasOriginal = this.createMonitor('monitorCanvasOriginal');
        const monitorCanvasMasked = this.createMonitor('monitorCanvasMasked');
        const monitorCanvasBinary = this.createMonitor('monitorCanvasBinary');
        const monitorCanvasPlaceholder = this.createMonitor('monitorCanvasPlaceholder');
        this.monitorCanvasOriginal = monitorCanvasOriginal;
        this.monitorCanvasMasked = monitorCanvasMasked;
        this.monitorCanvasBinary = monitorCanvasBinary;
        this.monitorCanvasPlaceholder = monitorCanvasPlaceholder;
        this.monitorCtxOriginal = monitorCanvasOriginal.getContext('2d');
        this.monitorCtxMasked = monitorCanvasMasked.getContext('2d');
        this.monitorCtxBinary = monitorCanvasBinary.getContext('2d');
        this.monitorCtxPlaceholder = monitorCanvasPlaceholder.getContext('2d');

        monitorSection.children[0].appendChild(monitorCanvasOriginal);
        monitorSection.children[1].appendChild(monitorCanvasMasked);
        monitorSection.children[2].appendChild(monitorCanvasBinary);
        monitorSection.children[3].appendChild(monitorCanvasPlaceholder);

        this.updateColorDisplay();
        this.updateMonitor();
    }

    updateMonitor() {
        if (!this.stream || !this.monitorCtxOriginal || !this.monitorCtxMasked || !this.monitorCtxBinary || !this.monitorCtxPlaceholder || this.video.readyState !== 4) {
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

            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            let dsize = new cv.Size(this.outputSize, this.outputSize);
            cv.resize(gray, resized, dsize, 0, 0, cv.INTER_AREA);
            cv.threshold(resized, binary, 100, 255, cv.THRESH_BINARY);

            // Original (no filter)
            let srcColor = cv.imread(tempCanvas);
            cv.resize(srcColor, srcColor, dsize, 0, 0, cv.INTER_AREA);
            cv.imshow(this.monitorCanvasOriginal, srcColor);

            // Color Mask
            if (this.selectedColorHSV) {
                let hsv = new cv.Mat();
                cv.cvtColor(srcColor, hsv, cv.COLOR_RGB2HSV);
                let mask = new cv.Mat();
                let masked = new cv.Mat.zeros(srcColor.rows, srcColor.cols, srcColor.type());
                const [h, s, v] = this.selectedColorHSV;
                // OpenCV HSV: H (0-180), S (0-255), V (0-255)
                const hOpenCV = h / 2; // Convert hue from 0-360 to 0-180
                const sOpenCV = (s / 100) * 255; // Convert saturation from 0-100% to 0-255
                const vOpenCV = (v / 100) * 255; // Convert value from 0-100% to 0-255
                let lowerBound = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
                    Math.max(hOpenCV - this.colorTolerance.h, 0),
                    Math.max(sOpenCV - this.colorTolerance.s, 0),
                    Math.max(vOpenCV - this.colorTolerance.v, 0),
                    255
                ]);
                let upperBound = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
                    Math.min(hOpenCV + this.colorTolerance.h, 180),
                    Math.min(sOpenCV + this.colorTolerance.s, 255),
                    Math.min(vOpenCV + this.colorTolerance.v, 255),
                    255
                ]);
                cv.inRange(hsv, lowerBound, upperBound, mask);
                cv.bitwise_and(srcColor, srcColor, masked, mask);
                cv.imshow(this.monitorCanvasMasked, masked);
                hsv.delete();
                mask.delete();
                lowerBound.delete();
                upperBound.delete();
            } else {
                let black = new cv.Mat(this.outputSize, this.outputSize, cv.CV_8UC4, [0, 0, 0, 255]);
                cv.imshow(this.monitorCanvasMasked, black);
                black.delete();
            }

            // Binary
            cv.imshow(this.monitorCanvasBinary, binary);

            // Placeholder (temporarily black)
            let black = new cv.Mat(this.outputSize, this.outputSize, cv.CV_8UC4, [0, 0, 0, 255]);
            cv.imshow(this.monitorCanvasPlaceholder, black);
            black.delete();

            src.delete();
            gray.delete();
            resized.delete();
            binary.delete();
            srcColor.delete();
        } else {
            this.monitorCtxOriginal.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.outputSize, this.outputSize
            );
            this.monitorCtxMasked.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.outputSize, this.outputSize
            );
            this.monitorCtxBinary.drawImage(
                this.video,
                cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
                0, 0, this.outputSize, this.outputSize
            );
            this.monitorCtxPlaceholder.drawImage(
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
            this.selectedColorHSV = null;
            this.updateColorDisplay();

            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }

            const centerMarker = document.getElementById('centerMarker');
            if (centerMarker) {
                centerMarker.remove();
            }
            const monitorCanvasOriginal = document.getElementById('monitorCanvasOriginal');
            if (monitorCanvasOriginal) {
                monitorCanvasOriginal.remove();
            }
            const monitorCanvasMasked = document.getElementById('monitorCanvasMasked');
            if (monitorCanvasMasked) {
                monitorCanvasMasked.remove();
            }
            const monitorCanvasBinary = document.getElementById('monitorCanvasBinary');
            if (monitorCanvasBinary) {
                monitorCanvasBinary.remove();
            }
            const monitorCanvasPlaceholder = document.getElementById('monitorCanvasPlaceholder');
            if (monitorCanvasPlaceholder) {
                monitorCanvasPlaceholder.remove();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WebcamModule();
});