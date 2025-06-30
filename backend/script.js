let video = document.getElementById('videoElement');
let toggleButton = document.getElementById('toggleButton');
let textArea = document.getElementById('textArea');
let stream = null;
let isStreaming = false;

// Function to update text display
function updateTextDisplay(message) {
    const timestamp = new Date().toLocaleTimeString();
    textArea.innerHTML = `<p>[${timestamp}] ${message}</p>`;
}

// Function to start camera
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: false 
        });
        
        video.srcObject = stream;
        isStreaming = true;
        
        toggleButton.textContent = 'Stop Camera';
        toggleButton.classList.add('stop');
        
        updateTextDisplay('Camera started successfully');
        
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
        
        updateTextDisplay('Camera stopped');
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

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (stream) {
        stopCamera();
    }
});

// Initial message
updateTextDisplay('Click "Start Camera" to begin');