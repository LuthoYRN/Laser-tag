class DigitRecognizer {
    constructor() {
        this.session = new onnx.InferenceSession();
        this.loadModel();
    }

    async loadModel() {
        try {
            await this.session.loadModel('./model/number-model/model.onnx');
            console.log('Digit recognition model loaded successfully!');
        } catch (error) {
            console.error('Error loading digit recognition model:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DigitRecognizer();
});