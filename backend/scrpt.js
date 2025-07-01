// updated version with detection
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');
let points = 0;
let health = 100;

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise(resolve => video.onloadedmetadata = resolve);
}

function drawVideo() {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  requestAnimationFrame(drawVideo);
}

function processFrame() {
  if (!cv || video.readyState !== 4) {
    requestAnimationFrame(processFrame);
    return;
  }

  const mat = cv.imread(canvas);
  cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY);
  cv.threshold(mat, mat, 100, 255, cv.THRESH_BINARY);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(mat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    if (area > 1000) { // Filter small noise
      let perimeter = cv.arcLength(cnt, true);
      let approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 3, true);
      let shape = approx.rows;
      ctx.strokeStyle = 'red';
      ctx.beginPath();
      let points = approx.data32S;
      ctx.moveTo(points[0], points[1]);
      for (let j = 2; j < points.length; j += 2) ctx.lineTo(points[j], points[j + 1]);
      ctx.closePath();
      ctx.stroke();

      if (shape === 3) handleWeaponDetection('triangle');
      else if (shape === 4) handleWeaponDetection('square');
      else if (perimeter / area > 0.1) handleWeaponDetection('circle'); // Rough circle check
    }
    cnt.delete();
    approx.delete();
  }

  contours.delete();
  hierarchy.delete();
  mat.delete();
  requestAnimationFrame(processFrame);
}

async function detectNumbers() {
  if (video.readyState === 4) {
    const { data: { text } } = await Tesseract.recognize(video, 'eng', { logger: m => console.log(m) });
    const number = text.match(/\d+/);
    if (number) handlePlayerDetection(number[0]);
  }
}

function handlePlayerDetection(playerId) {
  navigator.vibrate(200);
  // new Audio('shoot.mp3').play(); // Uncomment after adding sound file
  points += 10;
  health = Math.max(0, health - 10);
  updateStatus();
}

function handleWeaponDetection(weapon) {
  navigator.vibrate(100);
  // new Audio('pickup.mp3').play(); // Uncomment after adding sound file
  if (weapon === 'circle') points += 20;
  else if (weapon === 'square') health += 20;
  else if (weapon === 'triangle') points += 30;
  updateStatus();
}

function updateStatus() {
  statusDiv.textContent = `Points: ${points} | Health: ${health}`;
}

async function start() {
  await setupCamera();
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (cv) { clearInterval(check); resolve(); }
    }, 100);
  });
  drawVideo();
  processFrame();
  setInterval(detectNumbers, 1000); // Run OCR every second
}

start();