
// Access the video and canvas elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Load the COCO-SSD model
async function loadModel() {
  const model = await cocoSsd.load();
  console.log('Model loaded');
  detectFrame(model);
}

// Access the camera
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
}

// Detect objects in each frame
async function detectFrame(model) {
  const predictions = await model.detect(video);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  predictions.forEach(prediction => {
    ctx.beginPath();
    ctx.rect(...prediction.bbox);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'green';
    ctx.fillStyle = 'green';
    ctx.stroke();
    ctx.fillText(`${prediction.class} (${Math.round(prediction.score * 100)}%)`, 
                 prediction.bbox[0], prediction.bbox[1] - 5);
  });

  requestAnimationFrame(() => detectFrame(model));
}

// Start the application
async function start() {
  await setupCamera();
  await loadModel();
}

start();