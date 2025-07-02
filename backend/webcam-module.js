class WebcamModule {
    constructor() {
        this.video = document.getElementById('videoElement');
        this.toggleButton = document.getElementById('toggleButton');
        this.pickColorButton = document.getElementById('pickColorButton');
        this.colorPicker = document.getElementById('colorPicker');
        this.colorValue = document.getElementById('colorValue');
        this.colorSwatch = document.getElementById('colorSwatch');
        this.bodyPrediction = document.getElementById('bodyPrediction');
        this.colorPrediction = document.getElementById('colorPrediction');
        this.stream = null;
        this.monitorCanvasOriginal = null;
        this.monitorCanvasMasked = null;
        this.monitorCanvasBinary = null;
        this.monitorCanvasUpperBody = null;
        this.monitorCtxOriginal = null;
        this.monitorCtxMasked = null;
        this.monitorCtxBinary = null;
        this.monitorCtxUpperBody = null;
        this.boundingBoxSize = 200;
        this.animationFrameId = null;
        this.tfjsReady = false;
        this.selectedColorHSV = null;
        this.colorTolerance = { h: 10, s: 40, v: 40 }; // Tolerance for HSV
        this.colorThreshold = 0.01; // 1% of pixels for color presence
        this.detector = null;
        this.loadTensorFlow();
        this.initializeEventListeners();
    }

    async loadTensorFlow() {
        try {
            console.log('Loading TensorFlow.js and MoveNet model...');
            const model = poseDetection.SupportedModels.MoveNet;
            const detectorConfig = {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
            };
            this.detector = await poseDetection.createDetector(model, detectorConfig);
            console.log('MoveNet model loaded successfully');
            this.tfjsReady = true;
        } catch (error) {
            console.error('Failed to load TensorFlow.js or MoveNet model:', error);
            alert('Failed to load TensorFlow.js or MoveNet model. Please check your network connection.');
        }
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

    createMonitor(id, useFullResolution = false) {
        const canvas = document.createElement('canvas');
        canvas.id = id;
        if (useFullResolution) {
            canvas.width = this.video.videoWidth || 640; // Fallback to ideal width
            canvas.height = this.video.videoHeight || 480; // Fallback to ideal height
        } else {
            canvas.width = this.boundingBoxSize;
            canvas.height = this.boundingBoxSize;
        }
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
        const existingCanvasUpperBody = document.getElementById('monitorCanvasUpperBody');
        if (existingCanvasUpperBody) {
            existingCanvasUpperBody.remove();
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
        const monitorCanvasUpperBody = this.createMonitor('monitorCanvasUpperBody', true);
        this.monitorCanvasOriginal = monitorCanvasOriginal;
        this.monitorCanvasMasked = monitorCanvasMasked;
        this.monitorCanvasBinary = monitorCanvasBinary;
        this.monitorCanvasUpperBody = monitorCanvasUpperBody;
        this.monitorCtxOriginal = monitorCanvasOriginal.getContext('2d');
        this.monitorCtxMasked = monitorCanvasMasked.getContext('2d');
        this.monitorCtxBinary = monitorCanvasBinary.getContext('2d');
        this.monitorCtxUpperBody = monitorCanvasUpperBody.getContext('2d');

        monitorSection.children[0].appendChild(monitorCanvasOriginal);
        monitorSection.children[1].appendChild(monitorCanvasMasked);
        monitorSection.children[2].appendChild(monitorCanvasBinary);
        monitorSection.children[3].appendChild(monitorCanvasUpperBody);

        this.updateColorDisplay();
        this.updateMonitor();
    }

    async updateMonitor() {
        if (!this.stream || !this.monitorCtxOriginal || !this.monitorCtxMasked || !this.monitorCtxBinary || !this.monitorCtxUpperBody || this.video.readyState !== 4) {
            return;
        }

        const videoDisplayWidth = this.video.videoWidth;
        const videoDisplayHeight = this.video.videoHeight;
        const cropX = (videoDisplayWidth - this.boundingBoxSize) / 2;
        const cropY = (videoDisplayHeight - this.boundingBoxSize) / 2;

        // Original Canvas (cropped)
        this.monitorCtxOriginal.drawImage(
            this.video,
            cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
            0, 0, this.boundingBoxSize, this.boundingBoxSize
        );

        // Color Mask Canvas (cropped)
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = this.boundingBoxSize;
        maskCanvas.height = this.boundingBoxSize;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.drawImage(
            this.video,
            cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
            0, 0, this.boundingBoxSize, this.boundingBoxSize
        );
        let colorPixelCount = 0;
        const totalPixels = this.boundingBoxSize * this.boundingBoxSize;
        const pixelThreshold = totalPixels * this.colorThreshold; // 1% of pixels
        if (this.selectedColorHSV) {
            const [h, s, v] = this.selectedColorHSV;
            const imageData = maskCtx.getImageData(0, 0, this.boundingBoxSize, this.boundingBoxSize);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const [pixelH, pixelS, pixelV] = this.rgbToHsv(data[i], data[i + 1], data[i + 2]);
                if (
                    (Math.abs(pixelH - h) <= this.colorTolerance.h ||
                     (pixelH + 360 - h) <= this.colorTolerance.h ||
                     (h + 360 - pixelH) <= this.colorTolerance.h) &&
                    Math.abs(pixelS - s) <= this.colorTolerance.s &&
                    Math.abs(pixelV - v) <= this.colorTolerance.v
                ) {
                    colorPixelCount++; // Count matching pixels
                    continue; // Keep the pixel color
                }
                // Set to black
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
            }
            maskCtx.putImageData(imageData, 0, 0);
        } else {
            // Clear to black if no color selected
            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, this.boundingBoxSize, this.boundingBoxSize);
        }
        this.monitorCtxMasked.drawImage(maskCanvas, 0, 0);
        const colorPresent = colorPixelCount >= pixelThreshold;

        // Binary Canvas (cropped)
        const binaryCanvas = document.createElement('canvas');
        binaryCanvas.width = this.boundingBoxSize;
        binaryCanvas.height = this.boundingBoxSize;
        const binaryCtx = binaryCanvas.getContext('2d');
        binaryCtx.drawImage(
            this.video,
            cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
            0, 0, this.boundingBoxSize, this.boundingBoxSize
        );
        const imageData = binaryCtx.getImageData(0, 0, this.boundingBoxSize, this.boundingBoxSize);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Grayscale using luminance: 0.299R + 0.587G + 0.114B
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const value = gray > 100 ? 255 : 0; // Threshold at 100
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
        }
        binaryCtx.putImageData(imageData, 0, 0);
        this.monitorCtxBinary.drawImage(binaryCanvas, 0, 0);

        // Body Detection with MoveNet (waist-up only)
        let bodyDetected = false;
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = videoDisplayWidth;
        fullCanvas.height = videoDisplayHeight;
        const fullCtx = fullCanvas.getContext('2d');
        fullCtx.drawImage(this.video, 0, 0, videoDisplayWidth, videoDisplayHeight);

        if (this.tfjsReady && this.detector) {
            try {
                const poses = await this.detector.estimatePoses(this.video);
                fullCtx.drawImage(this.video, 0, 0, videoDisplayWidth, videoDisplayHeight);

                const upperBodyKeypointIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // nose to hips
                const keypointNames = [
                    'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
                    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
                    'left_wrist', 'right_wrist', 'left_hip', 'right_hip'
                ];
                const connections = [
                    [0, 1], [0, 2], [1, 3], [2, 4], [0, 5], [0, 6],
                    [5, 7], [7, 9], [6, 8], [8, 10], [5, 6],
                    [5, 11], [6, 12], [11, 12]
                ];

                if (poses.length > 0) {
                    const keypoints = poses[0].keypoints;
                    bodyDetected = upperBodyKeypointIndices.some(i => keypoints[i].score > 0.5); // Waist-up detected if any keypoint has confidence > 0.5
                    upperBodyKeypointIndices.forEach(i => {
                        const kp = keypoints[i];
                        if (kp.score > 0.5) {
                            fullCtx.fillStyle = '#00ff00';
                            fullCtx.beginPath();
                            fullCtx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
                            fullCtx.fill();
                        }
                    });

                    fullCtx.strokeStyle = '#00ff00';
                    fullCtx.lineWidth = 2;
                    connections.forEach(([i, j]) => {
                        const kp1 = keypoints[i];
                        const kp2 = keypoints[j];
                        if (kp1.score > 0.5 && kp2.score > 0.5) {
                            fullCtx.beginPath();
                            fullCtx.moveTo(kp1.x, kp1.y);
                            fullCtx.lineTo(kp2.x, kp2.y);
                            fullCtx.stroke();
                        }
                    });
                }
                this.monitorCtxUpperBody.drawImage(fullCanvas, 0, 0, videoDisplayWidth, videoDisplayHeight);
            } catch (error) {
                console.error('Error during pose detection:', error);
                this.monitorCtxUpperBody.drawImage(this.video, 0, 0, videoDisplayWidth, videoDisplayHeight);
            }
        } else {
            this.monitorCtxUpperBody.drawImage(this.video, 0, 0, videoDisplayWidth, videoDisplayHeight);
        }

        // Update prediction text in separate divs
        this.bodyPrediction.textContent = bodyDetected ? 'Body detected' : 'No body detected';
        this.colorPrediction.textContent = colorPresent ? 'Selected color present' : 'Selected color not present';

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
            const monitorCanvasUpperBody = document.getElementById('monitorCanvasUpperBody');
            if (monitorCanvasUpperBody) {
                monitorCanvasUpperBody.remove();
            }
            this.bodyPrediction.textContent = '';
            this.colorPrediction.textContent = '';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WebcamModule();
});