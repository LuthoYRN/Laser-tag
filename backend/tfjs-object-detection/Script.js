// DOM elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const detectionsDiv = document.getElementById('detections');
const ctx = canvas.getContext('2d');

// Variables
let model;
let detecting = false;
let detectionInterval;

// Load the model
async function loadModel() {
    console.log('Loading shape detection model...');
    
    //MobileNet
    model = await tf.loadLayersModel('https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json');
    
    console.log('Shape detection model loaded');
}

// Start webcam
async function setupWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        video.srcObject = stream;
        
        // Important: Return a promise that resolves when video is playing
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // Set canvas dimensions to match video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Start video playback
                video.play()
                    .then(() => {
                        console.log('Video playback started');
                        resolve();
                    })
                    .catch(err => {
                        console.error('Error playing video:', err);
                        reject(err);
                    });
            };
        });
    } catch (err) {
        console.error('Error accessing camera:', err);
        alert('Could not access the camera. Please ensure you have granted camera permissions.');
        throw err; // Re-throw to be caught by startDetection
    }
}

// Detect objects in the video stream
async function detectObjects() {
    if (!model || video.readyState !== 4) return;
    
    // Preprocess the image
    const tensor = tf.browser.fromPixels(video)
        .resizeNearestNeighbor([224, 224]) // Adjust based on model requirements
        .toFloat()
        .expandDims();
    
    // Perform prediction
    const predictions = await model.predict(tensor).data();
    
    // Process predictions (this will vary based on your model)
    const detectedShapes = processShapePredictions(predictions);
    
    // Draw detections
    drawDetections(detectedShapes);
    
    // Clean up
    tensor.dispose();
}

function processShapePredictions(predictions) {
    // This will vary based on your model's output format
    // Example for a simple model that returns [circleProb, squareProb, triangleProb]
    const shapeClasses = ['circle', 'square', 'triangle'];
    const maxIndex = predictions.indexOf(Math.max(...predictions));
    
    return [{
        class: shapeClasses[maxIndex],
        score: predictions[maxIndex],
        bbox: [50, 50, 100, 100] // Example bounding box
    }];
}

// Draw bounding boxes and labels
function drawDetections(predictions) {
    predictions.forEach(prediction => {
        // Draw bounding box
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(...prediction.bbox);
        
        // Draw label background
        ctx.fillStyle = '#00FFFF';
        const textWidth = ctx.measureText(prediction.class).width;
        const textHeight = parseInt(ctx.font, 10);
        ctx.fillRect(
            prediction.bbox[0],
            prediction.bbox[1],
            textWidth + 10,
            textHeight + 10
        );
        
        // Draw text
        ctx.fillStyle = '#000000';
        ctx.fillText(
            `${prediction.class} ${(prediction.score * 100).toFixed(1)}%`,
            prediction.bbox[0] + 5,
            prediction.bbox[1] + textHeight + 5
        );
    });
}

// Display detection information
function displayDetectionInfo(predictions) {
    if (predictions.length === 0) {
        detectionsDiv.innerHTML = '<p>No objects detected</p>';
        return;
    }
    
    let html = '<ul>';
    predictions.forEach(pred => {
        html += `<li>${pred.class} (${(pred.score * 100).toFixed(1)}% confidence)</li>`;
    });
    html += '</ul>';
    
    detectionsDiv.innerHTML = html;
}

// Start detection
async function startDetection() {
    if (detecting) return;
    
    try {
        await setupWebcam();
        detecting = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        
        // Run detection every 200ms
        detectionInterval = setInterval(detectObjects, 200);
        
        // Make sure video is visible
        video.style.display = 'block';
        canvas.style.display = 'block';
    } catch (err) {
        console.error('Error starting detection:', err);
        alert('Failed to start detection. Please check console for details.');
    }
}

// Stop detection
function stopDetection() {
    if (!detecting) return;
    
    detecting = false;
    clearInterval(detectionInterval);
    startButton.disabled = false;
    stopButton.disabled = true;
    
    // Stop video stream
    const stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detectionsDiv.innerHTML = '';
}

// Event listeners
startButton.addEventListener('click', startDetection);
stopButton.addEventListener('click', stopDetection);

// Initialize
(async function init() {
    await loadModel();
    console.log('Ready for object detection');
})();