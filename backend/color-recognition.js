import { WebcamModule } from './webcam-module.js';

class ColorRecognizer {
    constructor() {
        this.webcamModule = new WebcamModule('videoElement', 'colorPrediction', 'monitorSection');
        this.toggleButton = document.getElementById('toggleButton');
        this.pickColorButton = document.getElementById('pickColorButton');
        this.colorPicker = document.getElementById('colorPicker');
        this.colorCountSelect = document.getElementById('colorCountSelect');
        this.colorValue = document.getElementById('colorValue');
        this.colorSwatches = document.getElementById('colorSwatches');
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.toggleButton.addEventListener('click', () => {
            if (this.webcamModule.stream) {
                this.webcamModule.stopCamera();
                this.toggleButton.textContent = 'Start Camera';
                this.toggleButton.classList.remove('stop');
            } else {
                this.webcamModule.startCamera();
                this.toggleButton.textContent = 'Stop Camera';
                this.toggleButton.classList.add('stop');
            }
        });
        this.pickColorButton.addEventListener('click', () => {
            this.pickColor();
        });
        this.colorPicker.addEventListener('change', () => {
            this.setColorFromPicker();
        });
        this.colorCountSelect.addEventListener('change', () => {
            this.webcamModule.setMaxColors(parseInt(this.colorCountSelect.value));
            this.updateColorDisplay();
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
        if (!this.webcamModule.stream || this.webcamModule.video.readyState !== 4) {
            alert('Camera is not active or video is not ready.');
            return;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.webcamModule.video.videoWidth;
        tempCanvas.height = this.webcamModule.video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.webcamModule.video, 0, 0, tempCanvas.width, tempCanvas.height);
        const centerX = Math.floor(tempCanvas.width / 2);
        const centerY = Math.floor(tempCanvas.height / 2);
        const pixelData = tempCtx.getImageData(centerX, centerY, 1, 1).data;
        const success = this.webcamModule.addColorFromRGB(pixelData[0], pixelData[1], pixelData[2]);
        if (success) {
            this.updateColorDisplay();
        }
    }

    setColorFromPicker() {
        const hexColor = this.colorPicker.value;
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        const success = this.webcamModule.addColorFromRGB(r, g, b);
        if (success) {
            this.updateColorDisplay();
        }
    }

    updateColorDisplay() {
        this.colorSwatches.innerHTML = ''; // Clear existing swatches
        if (this.webcamModule.selectedColorsHSV.length > 0) {
            const hsvText = this.webcamModule.selectedColorsHSV.map((hsv) => `Color${hsv[0]}${hsv[1]}${hsv[2]}`).join(', ');
            this.colorValue.textContent = hsvText;
            this.webcamModule.selectedColorsHSV.forEach((hsv) => {
                const [r, g, b] = this.hsvToRgb(hsv[0], hsv[1], hsv[2]);
                const swatch = document.createElement('div');
                swatch.className = 'color-swatch';
                swatch.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
                this.colorSwatches.appendChild(swatch);
            });
            // Set color picker to last selected color
            const lastHsv = this.webcamModule.selectedColorsHSV[this.webcamModule.selectedColorsHSV.length - 1];
            const [r, g, b] = this.hsvToRgb(lastHsv[0], lastHsv[1], lastHsv[2]);
            this.colorPicker.value = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
        } else {
            this.colorValue.textContent = 'No colors selected';
            this.colorPicker.value = '#000000';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ColorRecognizer();
});