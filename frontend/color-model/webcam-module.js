export class WebcamModule {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container element with ID "${containerId}" not found`);
        }

        // Create DOM elements
        this.video = document.createElement('video');
        this.video.id = 'videoElement';
        this.video.autoplay = true;

        this.outputElement = document.createElement('div');
        this.outputElement.id = 'colorPrediction';
        this.outputElement.textContent = 'No colors selected';

        this.monitorSection = document.createElement('div');
        this.monitorSection.id = 'monitorSection';
        this.monitorSection.className = 'monitor-section';

        this.monitorCanvasMaskedContainer = document.createElement('div');
        this.monitorCanvasUpperBodyContainer = document.createElement('div');
        this.monitorSection.appendChild(this.monitorCanvasMaskedContainer);
        this.monitorSection.appendChild(this.monitorCanvasUpperBodyContainer);

        // Append elements to container
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.appendChild(this.video);
        this.container.appendChild(videoContainer);
        this.container.appendChild(this.outputElement);
        this.container.appendChild(this.monitorSection);

        this.stream = null;
        this.monitorCanvasMasked = null;
        this.monitorCanvasUpperBody = null;
        this.monitorCtxMasked = null;
        this.monitorCtxUpperBody = null;
        this.boundingBoxSize = 200;
        this.animationFrameId = null;
        this.tfjsReady = false;
        this.selectedColorsHSV = [];
        this.colorTolerance = { h: 10, s: 40, v: 40 };
        this.colorThreshold = 0.01;
        this.maxColors = 2;
        this.detector = null;

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

    setColors(colorsHSV) {
        if (!Array.isArray(colorsHSV)) {
            console.error('setColors expects an array of HSV colors');
            return false;
        }
        if (colorsHSV.length > this.maxColors) {
            alert(`Maximum ${this.maxColors} colors allowed. Provided: ${colorsHSV.length}`);
            return false;
        }
        // Validate each HSV color
        const validColors = colorsHSV.filter(([h, s, v]) => {
            return Number.isInteger(h) && Number.isInteger(s) && Number.isInteger(v) &&
                   h >= 0 && h <= 360 && s >= 0 && s <= 100 && v >= 0 && v <= 100;
        });
        if (validColors.length !== colorsHSV.length) {
            console.error('Invalid HSV colors provided');
            return false;
        }
        this.selectedColorsHSV = validColors;
        console.log('Set colors (HSV):', this.selectedColorsHSV);
        return true;
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
        this.selectedColorsHSV = [];
    }

    createMonitor(id, useFullResolution = false) {
        const canvas = document.createElement('canvas');
        canvas.id = id;
        if (useFullResolution && this.video.videoWidth && this.video.videoHeight) {
            canvas.width = this.video.videoWidth;
            canvas.height = this.video.videoHeight;
        } else {
            canvas.width = useFullResolution ? 640 : this.boundingBoxSize;
            canvas.height = useFullResolution ? 480 : this.boundingBoxSize;
        }
        return canvas;
    }

    addCenterMarkerAndMonitor() {
        const existingMarker = this.container.querySelector('#centerMarker');
        if (existingMarker) {
            existingMarker.remove();
        }
        const existingCanvasMasked = this.container.querySelector('#monitorCanvasMasked');
        if (existingCanvasMasked) {
            existingCanvasMasked.remove();
        }
        const existingCanvasUpperBody = this.container.querySelector('#monitorCanvasUpperBody');
        if (existingCanvasUpperBody) {
            existingCanvasUpperBody.remove();
        }

        this.boundingBoxSize = window.innerWidth <= 600 ? 150 : 200;

        const videoContainer = this.video.parentElement;
        const centerMarker = document.createElement('div');
        centerMarker.id = 'centerMarker';
        videoContainer.appendChild(centerMarker);

        this.monitorCanvasMasked = this.createMonitor('monitorCanvasMasked');
        this.monitorCanvasUpperBody = this.createMonitor('monitorCanvasUpperBody', true);
        this.monitorCtxMasked = this.monitorCanvasMasked.getContext('2d');
        this.monitorCtxUpperBody = this.monitorCanvasUpperBody.getContext('2d');

        this.monitorCanvasMaskedContainer.appendChild(this.monitorCanvasMasked);
        this.monitorCanvasUpperBodyContainer.appendChild(this.monitorCanvasUpperBody);

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

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = this.boundingBoxSize;
        maskCanvas.height = this.boundingBoxSize;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.drawImage(
            this.video,
            cropX, cropY, this.boundingBoxSize, this.boundingBoxSize,
            0, 0, this.boundingBoxSize, this.boundingBoxSize
        );
        let dominantColor = null;
        const totalPixels = this.boundingBoxSize * this.boundingBoxSize;
        const pixelThreshold = totalPixels * this.colorThreshold;
        if (this.selectedColorsHSV.length > 0) {
            const imageData = maskCtx.getImageData(0, 0, this.boundingBoxSize, this.boundingBoxSize);
            const data = imageData.data;
            const pixelCounts = new Array(this.selectedColorsHSV.length).fill(0);
            
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
                    data[i] = 0;
                    data[i + 1] = 0;
                    data[i + 2] = 0;
                }
            }
            maskCtx.putImageData(imageData, 0, 0);
            let maxCount = 0;
            let dominantIndex = 0;
            pixelCounts.forEach((count, index) => {
                if (count >= pixelThreshold && count >= maxCount) {
                    maxCount = count;
                    dominantIndex = index;
                }
            });
            if (maxCount >= pixelThreshold) {
                const [h, s, v] = this.selectedColorsHSV[dominantIndex];
                dominantColor = `Color${h}${s}${v}`;
            }
        } else {
            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, this.boundingBoxSize, this.boundingBoxSize);
        }
        this.monitorCtxMasked.drawImage(maskCanvas, 0, 0);

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

                const upperBodyKeypointIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                const connections = [
                    [0, 1], [0, 2], [1, 3], [2, 4], [0, 5], [0, 6],
                    [5, 7], [7, 9], [6, 8], [8, 10], [5, 6],
                    [5, 11], [6, 12], [11, 12]
                ];

                if (poses.length > 0) {
                    const keypoints = poses[0].keypoints;
                    bodyDetected = upperBodyKeypointIndices.some(i => keypoints[i].score > 0.5);
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

        if (bodyDetected && dominantColor) {
            this.outputElement.textContent = dominantColor;
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

    async scanColor() {
        //TODO "static" method to scan color and send it back -> Color###
        return "Color";
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

            this.container.querySelector('#centerMarker')?.remove();
            this.container.querySelector('#monitorCanvasMasked')?.remove();
            this.container.querySelector('#monitorCanvasUpperBody')?.remove();
            this.outputElement.textContent = '';
        }
    }
}