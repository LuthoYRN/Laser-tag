export class WebcamModule {
    constructor(videoElementId, outputElementId, monitorSectionId) {
        this.video = document.getElementById(videoElementId);
        this.outputElement = document.getElementById(outputElementId);
        this.monitorSection = document.getElementById(monitorSectionId);
        this.stream = null;
        this.monitorCanvasMasked = null;
        this.monitorCanvasUpperBody = null;
        this.monitorCtxMasked = null;
        this.monitorCtxUpperBody = null;
        this.boundingBoxSize = 200;
        this.animationFrameId = null;
        this.tfjsReady = false;
        this.selectedColorsHSV = []; // Array to store multiple colors
        this.colorTolerance = { h: 10, s: 40, v: 40 }; // Tolerance for HSV
        this.colorThreshold = 0.01; // 1% of pixels for color presence
        this.maxColors = 2; // Default to 2 colors
        this.detector = null;

        // Validate DOM elements
        if (!this.video) {
            throw new Error(`Video element with ID "${videoElementId}" not found`);
        }
        if (!this.outputElement) {
            throw new Error(`Output element with ID "${outputElementId}" not found`);
        }
        if (!this.monitorSection) {
            throw new Error(`Monitor section with ID "${monitorSectionId}" not found`);
        }

        this.loadTensorFlow();
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

    addColorFromRGB(r, g, b) {
        if (this.selectedColorsHSV.length >= this.maxColors) {
            alert(`Maximum ${this.maxColors} colors selected. Clear existing colors to select new ones.`);
            return false;
        }
        const hsv = this.rgbToHsv(r, g, b);
        this.selectedColorsHSV.push(hsv);
        console.log('Added color (HSV):', hsv);
        return true;
    }

    setMaxColors(maxColors) {
        this.maxColors = maxColors;
        this.selectedColorsHSV = []; // Reset colors when changing max
    }

    createMonitor(id, useFullResolution = false) {
        const canvas = document.createElement('canvas');
        canvas.id = id;
        if (useFullResolution && this.video.videoWidth && this.video.videoHeight) {
            canvas.width = this.video.videoWidth;
            canvas.height = this.video.videoHeight;
        } else {
            canvas.width = useFullResolution ? 640 : this.boundingBoxSize; // Fallback to ideal width
            canvas.height = useFullResolution ? 480 : this.boundingBoxSize; // Fallback to ideal height
        }
        return canvas;
    }

    addCenterMarkerAndMonitor() {
        // Ensure monitorSection has two child containers
        if (!this.monitorSection.children[0] || !this.monitorSection.children[1]) {
            throw new Error('Monitor section must contain exactly two child elements for canvases');
        }

        const existingMarker = document.getElementById('centerMarker');
        if (existingMarker) {
            existingMarker.remove();
        }
        const existingCanvasMasked = document.getElementById('monitorCanvasMasked');
        if (existingCanvasMasked) {
            existingCanvasMasked.remove();
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

        const monitorCanvasMasked = this.createMonitor('monitorCanvasMasked');
        const monitorCanvasUpperBody = this.createMonitor('monitorCanvasUpperBody', true);
        this.monitorCanvasMasked = monitorCanvasMasked;
        this.monitorCanvasUpperBody = monitorCanvasUpperBody;
        this.monitorCtxMasked = monitorCanvasMasked.getContext('2d');
        this.monitorCtxUpperBody = monitorCanvasUpperBody.getContext('2d');

        const maskedContainer = this.monitorSection.children[0];
        const upperBodyContainer = this.monitorSection.children[1];
        maskedContainer.appendChild(monitorCanvasMasked);
        upperBodyContainer.appendChild(monitorCanvasUpperBody);

        this.updateMonitor();
    }

    async updateMonitor() {
        if (!this.stream || !this.monitorCtxMasked || !this.monitorCtxUpperBody || this.video.readyState !== 4) {
            return;
        }

        const videoDisplayWidth = this.video.videoWidth;
        const videoDisplayHeight = this.video.videoHeight;
        const cropX = (videoDisplayWidth - this.boundingBoxSize) / 2;
        const cropY = (videoDisplayHeight - this.boundingBoxSize) / 2;

        // Color Mask Canvas (hidden, used for color detection)
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = this.boundingBoxSize;
        maskCanvas.height = this.boundingBoxSize;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.drawImage(
            this.video,
            cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
            0, 0, this.boundingBoxSize, this.boundingBoxSize
        );
        const colorPresence = [];
        const totalPixels = this.boundingBoxSize * this.boundingBoxSize;
        const pixelThreshold = totalPixels * this.colorThreshold; // 1% of pixels
        if (this.selectedColorsHSV.length > 0) {
            const imageData = maskCtx.getImageData(0, 0, this.boundingBoxSize, this.boundingBoxSize);
            const data = imageData.data;
            const pixelCounts = new Array(this.selectedColorsHSV.length).fill(0);
            
            // First pass: count matching pixels for each color
            for (let i = 0; i < data.length; i += 4) {
                const [pixelH, pixelS, pixelV] = this.rgbToHsv(data[i], data[i + 1], data[i + 2]);
                let matched = false;
                this.selectedColorsHSV.forEach(([h, s, v], index) => {
                    if (
                        (Math.abs(pixelH - h) <= this.colorTolerance.h ||
                         (pixelH + 360 - h) <= this.colorTolerance.h ||
                         (h + 360 - pixelH) <= this.colorTolerance.h) &&
                        Math.abs(pixelS - s) <= this.colorTolerance.s &&
                        Math.abs(pixelV - v) <= this.colorTolerance.v
                    ) {
                        pixelCounts[index]++;
                        matched = true;
                    }
                });
                if (!matched) {
                    // Set to black if no color matches
                    data[i] = 0;
                    data[i + 1] = 0;
                    data[i + 2] = 0;
                }
            }
            maskCtx.putImageData(imageData, 0, 0);
            // Determine which colors are present
            pixelCounts.forEach((count, index) => {
                if (count >= pixelThreshold) {
                    const [h, s, v] = this.selectedColorsHSV[index];
                    colorPresence.push(`Color${h}${s}${v}`);
                }
            });
        } else {
            // Clear to black if no colors selected
            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, this.boundingBoxSize, this.boundingBoxSize);
        }
        this.monitorCtxMasked.drawImage(maskCanvas, 0, 0);

        // Body Detection with MoveNet (hidden, used for body detection)
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

        // Combined prediction output
        if (bodyDetected && colorPresence.length > 0) {
            this.outputElement.textContent = colorPresence.join(', ');
        } else {
            this.outputElement.textContent = 'No body or colors detected';
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
            this.selectedColorsHSV = [];

            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }

            const centerMarker = document.getElementById('centerMarker');
            if (centerMarker) {
                centerMarker.remove();
            }
            const monitorCanvasMasked = document.getElementById('monitorCanvasMasked');
            if (monitorCanvasMasked) {
                monitorCanvasMasked.remove();
            }
            const monitorCanvasUpperBody = document.getElementById('monitorCanvasUpperBody');
            if (monitorCanvasUpperBody) {
                monitorCanvasUpperBody.remove();
            }
            this.outputElement.textContent = '';
        }
    }
}