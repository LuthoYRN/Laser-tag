const scanCounts = {};
const lastScanTimestamps = {};
const logList = document.getElementById('log-list');
//nn
// Start the QR scanner
function startScanner() {
  const qrScanner = new Html5Qrcode("qr-reader");

  const config = {
    fps: 10,
    qrbox: 250
  };

  qrScanner.start(
    { facingMode: "environment" },
    config,
    qrCodeMessage => {
      handleScan(qrCodeMessage);
    },
    error => {
      // Optionally log errors
    }
  ).catch(err => {
    console.error("Camera start failed", err);
  });
}

// Handle QR scan result
function handleScan(text) {
  const now = Date.now();
  const lastScanned = lastScanTimestamps[text] || 0;

  // Only register scan if 5 seconds have passed since last scan of this code
  if (now - lastScanned >= 5000) {
    lastScanTimestamps[text] = now;

    // Vibrate for feedback
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }

    if (!scanCounts[text]) {
      scanCounts[text] = 1;
    } else {
      scanCounts[text]++;
    }

    updateLog();
  }
}

// Update scan log on screen
function updateLog() {
  logList.innerHTML = '';
  for (const [qr, count] of Object.entries(scanCounts)) {
    const li = document.createElement('li');
    li.textContent = `${qr}: Scanned ${count} time(s)`;
    logList.appendChild(li);
  }
}

// Start everything
startScanner();
