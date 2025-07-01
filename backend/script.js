let video = document.getElementById('videoElement');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let toggleButton = document.getElementById('toggleButton');
let detectButton = document.getElementById('detectButton');
let textArea = document.getElementById('textArea');
let objectsArea = document.getElementById('objectsArea');
let loadingText = document.getElementById('loadingText');
let progressBar = document.getElementById('progressBar');
let progressFill = document.getElementById('progressFill');
let loadingIndicator = document.querySelector('.loading-indicator');

let stream = null;
let isStreaming = false;
let isDetecting = false;
let detector = null;
let detectedObjects = [];

// Load ml5.js YOLO model
async function loadModel() {
    loadingIndicator.classList.remove('hidden');
    loadingText.textContent = 'Loading YOLO model...';
    progressFill.style.width = '20%';

    try {
        detector = await ml5.objectDetector('yolo', { confidenceThreshold: 0.3 }, modelLoaded);
    } catch (error) {
        console.error('Error loading YOLO model:', error);
        updateTextDisplay(`Error loading model: ${error.message}`);
        loadingIndicator.classList.add('hidden');
        detectButton.disabled = false;
    }
}

// Callback when model is loaded
function modelLoaded() {
    console.log('YOLO model loaded');
    updateTextDisplay('YOLO model loaded successfully');
    progressFill.style.width = '100%';
    setTimeout(() => {
        loadingIndicator.classList.add('hidden');
        progressFill.style.width = '0%';
    }, 500);
    detectButton.disabled = false;
    detectButton.textContent = 'Start Detection';
}

// Function to update objects display
function updateObjectsDisplay(objects) {
    if (objects && objects.length > 0) {
        objectsArea.innerHTML = '';
        objects.forEach((obj, index) => {
            const objectElement = document.createElement('div');
            objectElement.className = 'object-item';
            const label = document.createElement('span');
            label.textContent = `${index + 1}. ${obj.label} (${obj.timestamp})`;
            const confidence = document.createElement('span');
            confidence.className = `confidence ${getConfidenceClass(obj.confidence)}`;
            confidence.textContent = `(${(obj.confidence * 100).toFixed(2)}%)`;
            objectElement.appendChild(label);
            objectElement.appendChild(confidence);
            objectsArea.appendChild(objectElement);
        });
    } else {
        objectsArea.innerHTML = '<p>No objects detected yet...</p>';
    }
}

// Determine confidence class for styling
function getConfidenceClass(confidence) {
    if (confidence > 0.7) return 'high-confidence';
    if (confidence > 0.4) return 'medium-confidence';
    return 'low-confidence';
}

// Function to add detected objects
function addDetectedObjects(results) {
    const timestamp = new Date().toLocaleTimeString();
    detectedObjects = results.map(result => ({
        label: result.label,
        confidence: result.confidence,
        timestamp: timestamp,
        x: result.x,
        y: result.y,
        width: result.width,
        height: result.height
    }));
    
    // Keep only last 10 objects
    if (detectedObjects.length > 10) {
        detectedObjects = detectedObjects.slice(0, 10);
    }
    
    updateObjectsDisplay(detectedObjects);
}

// Function to draw bounding boxes on canvas
function drawBoundingBoxes(results) {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw bounding boxes and labels
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.font = '16px Arial';
    ctx.fillStyle = 'red';
    
    results.forEach(result => {
        // Draw bounding box
        ctx.strokeRect(result.x, result.y, result.width, result.height);
        // Draw label and confidence above box
        ctx.fillText(`${result.label} (${(result.confidence * 100).toFixed(2)}%)`, result.x, result.y - 10);
    });
}

// Function to start detection
function startDetection() {
    if (!detector) {
        updateTextDisplay('Model not loaded yet. Please wait.');
        return;
    }
    if (!isStreaming) {
        updateTextDisplay('Camera not started. Please start the camera first.');
        return;
    }
    
    isDetecting = true;
    detectButton.textContent = 'Stop Detection';
    detectButton.classList.add('detecting');
    updateTextDisplay('Object detection started');
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    detect();
}

// Function to stop detection
function stopDetection() {
    isDetecting = false;
    detectButton.textContent = 'Start Detection';
    detectButton.classList.remove('detecting');
    updateTextDisplay('Object detection stopped');
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Clear objects display
    detectedObjects = [];
    updateObjectsDisplay([]);
}

// Real-time detection loop
function detect() {
    if (!isDetecting || !isStreaming) {
        return;
    }

    detector.detect(video, (err, results) => {
        if (err) {
            console.error('Detection error:', err);
            updateTextDisplay(`Detection error: ${err.message}`);
            requestAnimationFrame(detect);
            return;
        }

        // Process and display detected objects
        addDetectedObjects(results);
        // Draw bounding boxes
        drawBoundingBoxes(results);

        // Continue detection loop
        requestAnimationFrame(detect);
    });
}

// Function to update text display
function updateTextDisplay(message) {
    const timestamp = new Date().toLocaleTimeString();
    textArea.innerHTML = `<p>[${timestamp}] ${message}</p>`;
}

// Function to start camera
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480 }, // Match CSS dimensions
            audio: false 
        });
        
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            isStreaming = true;
            toggleButton.textContent = 'Stop Camera';
            toggleButton.classList.add('stop');
            updateTextDisplay('Camera started successfully');
            // Enable detection button once camera is ready
            if (detector) {
                detectButton.disabled = false;
            }
            // Set canvas size initially
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        };
    } catch (error) {
        console.error('Error accessing camera:', error);
        updateTextDisplay(`Error: ${error.message}`);
    }
}

// Function to stop camera
function stopCamera() {
    if (stream) {
        let tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        
        video.srcObject = null;
        stream = null;
        isStreaming = false;
        
        toggleButton.textContent = 'Start Camera';
        toggleButton.classList.remove('stop');
        
        // Stop detection if running
        if (isDetecting) {
            stopDetection();
        }
        
        updateTextDisplay('Camera stopped');
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// Toggle camera on button click
toggleButton.addEventListener('click', () => {
    if (isStreaming) {
        stopCamera();
    } else {
        startCamera();
    }
});

// Toggle detection on button click
detectButton.addEventListener('click', () => {
    if (isDetecting) {
        stopDetection();
    } else {
        startDetection();
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (stream) {
        stopCamera();
    }
});

// Initialize
updateTextDisplay('Click "Start Camera" to begin');
updateObjectsDisplay([]);
detectButton.disabled = true; // Disable until model is loaded
loadModel(); // Start loading YOLO model