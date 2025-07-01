// Initialize Socket.io connection
const socket = io();

// Game state management
let gameState = {
    currentScreen: 'home',
    playerData: null,
    lobbyData: null,
    isHost: false,
    playerType: null, // 'player' or 'spectator'
    gameActive: false
};

// Screen elements mapping
const screens = {
    home: document.querySelector('.container:not(.create):not(.join):not(.wait):not(.live)'),
    createLobby: document.querySelector('.container.create'),
    joinLobby: document.querySelector('.container.join'),
    waitingRoom: document.querySelector('.container.wait'),
    liveLobbies: document.querySelector('.container.live'),
    gameSession: document.querySelector('.game-container'),
    spectatorMode: document.querySelector('.spectator-container'),
    results: document.querySelector('.results-container')
};

// Utility Functions
function showScreen(screenName) {
    // Clean up live lobbies updates when leaving that screen
    if (gameState.currentScreen === 'liveLobbies' && screenName !== 'liveLobbies') {
        stopLiveLobbiesUpdates();
    }
    
    // Hide all screens
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.add('hidden');
    });
    
    // Show target screen
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
        gameState.currentScreen = screenName;
        console.log(`Switched to screen: ${screenName}`);
        
        // Start live lobbies updates when entering that screen
        if (screenName === 'liveLobbies') {
            loadActiveLiveLobbies();
            startLiveLobbiesUpdates();
        }
    }
}

function showNotification(message, type = 'info') {
    // Simple notification system - you can enhance this
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // You could add a proper notification UI element here
    if (type === 'error') {
        alert(`Error: ${message}`);
    }
}

function updateLobbyCode(code) {
    const lobbyCodeElements = document.querySelectorAll('.lobby-code');
    lobbyCodeElements.forEach(el => el.textContent = code);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Navigation Functions
function goBack() {
    // Clean up live lobbies updates when leaving
    if (gameState.currentScreen === 'liveLobbies') {
        stopLiveLobbiesUpdates();
    }
    
    switch(gameState.currentScreen) {
        case 'createLobby':
        case 'joinLobby':
        case 'liveLobbies':
            showScreen('home');
            break;
        case 'waitingRoom':
            socket.emit('leave-lobby');
            showScreen('home');
            break;
        case 'spectatorMode':
            showScreen('liveLobbies');
            // Restart live lobbies updates when returning
            if (gameState.currentScreen === 'liveLobbies') {
                loadActiveLiveLobbies();
                startLiveLobbiesUpdates();
            }
            break;
        case 'results':
            showScreen('home');
            break;
        default:
            showScreen('home');
    }
}

// Socket Event Handlers
socket.on('connect', () => {
    console.log('🔗 Connected to server:', socket.id);
    showNotification('Connected to game server', 'success');
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
    showNotification('Disconnected from server', 'error');
    showScreen('home');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showNotification('Failed to connect to server', 'error');
});

// Lobby Management Events
socket.on('player-joined', (lobbyState) => {
    console.log('Player joined lobby:', lobbyState);
    gameState.lobbyData = lobbyState;
    updateWaitingRoom(lobbyState);
});

socket.on('player-left', (lobbyState) => {
    console.log('Player left lobby:', lobbyState);
    gameState.lobbyData = lobbyState;
    updateWaitingRoom(lobbyState);
});

socket.on('lobby-updated', (lobbyState) => {
    console.log('Lobby updated:', lobbyState);
    gameState.lobbyData = lobbyState;
    updateWaitingRoom(lobbyState);
});

socket.on('spectator-joined', (data) => {
    console.log('Spectator joined:', data.name);
    showNotification(`${data.name} is now spectating`, 'info');
});

// Game Events
socket.on('game-starting', () => {
    console.log('Game starting countdown...');
    showGameStartCountdown();
    setReadyButtonState('countdown');
});

socket.on('countdown', (count) => {
    console.log('Countdown:', count);
    updateCountdown(count);
});

socket.on('countdown-canceled', () => {
    console.log('Countdown canceled');
    
    hideGameStartCountdown();
    
    if (gameState.lobbyData) {
        const currentPlayer = gameState.lobbyData.players.find(p => p.id === socket.id);
        if (currentPlayer) {
            updateReadyButton(currentPlayer.isReady);
        }
    }   
    setReadyButtonState('normal');
    showNotification('Countdown canceled - player not ready', 'info');
});

socket.on('game-started', (gameData) => {
    console.log('Game started!', gameData);
    gameState.gameActive = true;
    
    if (gameState.playerType === 'player') {
        showScreen('gameSession');
        initializeGameSession(gameData);
        // Show QR scanner modal first, before starting the actual game
        setTimeout(() => {
            showQRScannerModal();
        }, 500);
    } else if (gameState.playerType === 'spectator') {
        showScreen('spectatorMode');
        initializeSpectatorMode(gameData);
    }
});

// QR Code Assignment Events
socket.on('qr-assigned', (data) => {
    console.log('QR Code assigned:', data);
    if (data.success) {
        showPlayerAssignmentSuccess(data);
        hideQRScannerModal();
    } else {
        showNotification(data.message || 'Failed to assign QR code', 'error');
    }
});

socket.on('game-timer', (data) => {
    updateGameTimer(data.timeLeft, data.playersAlive);
});

socket.on('player-eliminated', (data) => {
    console.log('Player eliminated:', data);
    showNotification(`${data.playerName} was eliminated!`, 'info');
    updatePlayerList();
});

socket.on('player-damaged', (data) => {
    console.log('Player damaged:', data);
    if (data.playerId === socket.id) {
        updatePlayerHealth(data.health);
        triggerHitIndicator();
    }
});

socket.on('scan-result', (data) => {
    console.log('Scan result:', data);
    if (data.success) {
        updatePlayerScore(data.newScore);
        triggerShootIndicator();
        showNotification(`Hit ${data.targetPlayerName} for ${data.pointsEarned} points!`, 'success');
    } else {
        showNotification(data.message, 'error');
    }
});

socket.on('game-ended', (results) => {
    console.log('Game ended:', results);
    gameState.gameActive = false;
    showGameResults(results);
});

// Screen-specific Functions

// Home Screen
function initializeHome() {
    const createButton = document.querySelector('.create-mode');
    const joinButton = document.querySelector('.mode-button:not(.create-mode):not(.spectate-mode)');
    const spectateButton = document.querySelector('.spectate-mode');
    
    if (createButton) {
        createButton.addEventListener('click', () => showScreen('createLobby'));
    }
    
    if (joinButton) {
        joinButton.addEventListener('click', () => showScreen('joinLobby'));
    }
    
    if (spectateButton) {
        spectateButton.addEventListener('click', () => {
            showScreen('liveLobbies');
            loadActiveLiveLobbies();
        });
    }
}

// Create Lobby Screen
function initializeCreateLobby() {
    const createButton = document.querySelector('.create-button');
    const backButton = document.querySelector('.container.create .back-button');
    const numPlayersButtons = document.querySelectorAll('.container.create .option-button');
    const durationSlider = document.getElementById('durationSlider');
    const durationValue = document.getElementById('durationValue');
    
    // Back button
    if (backButton) {
        backButton.addEventListener('click', goBack);
    }
    
    // Number of players selection
    numPlayersButtons.forEach(button => {
        button.addEventListener('click', () => {
            numPlayersButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
        });
    });
    
    // Duration slider
    if (durationSlider && durationValue) {
        durationSlider.addEventListener('input', (e) => {
            durationValue.textContent = `${e.target.value} min`;
        });
    }
    
    // Create lobby button
    if (createButton) {
        createButton.addEventListener('click', createLobby);
    }
}

function createLobby() {
    const activeMaxButton = document.querySelector('.container.create .option-button.active');
    const durationSlider = document.getElementById('durationSlider');
    
    const settings = {
        numPlayers: parseInt(activeMaxButton?.textContent || '4'),
        duration: parseInt(durationSlider?.value || '15'),
        playerName: 'Host'
    };
    
    socket.emit('create-lobby', settings, (response) => {
        if (response.success) {
            gameState.lobbyData = response.lobby;
            gameState.isHost = true;
            gameState.playerType = 'player';
            updateLobbyCode(response.lobby.code);
            showScreen('waitingRoom');
            updateWaitingRoom(response.lobby);
        } else {
            showNotification(response.error, 'error');
        }
    });
}

// Join Lobby Screen
function initializeJoinLobby() {
    const joinButton = document.getElementById('joinButton');
    const lobbyInput = document.getElementById('lobbyCodeInput');
    const backButton = document.querySelector('.container.join .back-button');
    
    if (backButton) {
        backButton.addEventListener('click', goBack);
    }
    
    if (lobbyInput) {
        lobbyInput.addEventListener('input', (e) => {
            const code = e.target.value.toUpperCase();
            e.target.value = code;
            
            if (joinButton) {
                joinButton.disabled = code.length !== 6;
            }
        });
    }
    
    if (joinButton) {
        joinButton.addEventListener('click', joinLobby);
    }
}

function joinLobby() {
    const lobbyInput = document.getElementById('lobbyCodeInput');
    const lobbyCode = lobbyInput?.value.toUpperCase();
    
    if (!lobbyCode || lobbyCode.length !== 6) {
        showNotification('Please enter a valid 6-character lobby code', 'error');
        return;
    }
    
    const joinData = {
        lobbyCode,
        name: `Player${Math.floor(Math.random() * 1000)}`,
        type: 'player'
    };
    
    socket.emit('join-lobby', joinData, (response) => {
        if (response.success) {
            gameState.lobbyData = response.lobby;
            gameState.playerType = response.type;
            updateLobbyCode(response.lobby.code);
            showScreen('waitingRoom');
            updateWaitingRoom(response.lobby);
        } else {
            showNotification(response.error, 'error');
        }
    });
}

// Live Lobbies Screen
let liveLobbiesInterval = null;
let liveGameTimers = new Map(); // Store timer data for each lobby

function initializeLiveLobbies() {
    const backButton = document.querySelector('.container.live .back-button');
    const refreshButton = document.querySelector('.refresh-button');
    const container = document.getElementById('gamesContainer');
    
    // Immediately clear dummy data and show loading state
    if (container) {
        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading live games...</div>
            </div>
        `;
    }
    
    if (backButton) {
        backButton.addEventListener('click', goBack);
    }
    
    if (refreshButton) {
        refreshButton.addEventListener('click', loadActiveLiveLobbies);
    }
    // Start real-time updates
    loadActiveLiveLobbies();
    startLiveLobbiesUpdates();
}

function startLiveLobbiesUpdates() {
    // Clear any existing interval
    if (liveLobbiesInterval) {
        clearInterval(liveLobbiesInterval);
    }
    
    // Update lobby data every 10 seconds
    liveLobbiesInterval = setInterval(() => {
        if (gameState.currentScreen === 'liveLobbies') {
            loadActiveLiveLobbies();
        } else {
            // Stop updates if user left the screen
            stopLiveLobbiesUpdates();
        }
    }, 10000);
    
    // Update timers every second for smooth countdown
    setInterval(() => {
        if (gameState.currentScreen === 'liveLobbies') {
            updateLiveGameTimers();
        }
    }, 1000);
}

function stopLiveLobbiesUpdates() {
    if (liveLobbiesInterval) {
        clearInterval(liveLobbiesInterval);
        liveLobbiesInterval = null;
    }
    liveGameTimers.clear();
}

function loadActiveLiveLobbies() {
    const container = document.getElementById('gamesContainer');
    
    // Only show loading if container is empty or has loading state
    if (container && (!container.children.length || container.querySelector('.loading-state'))) {
        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading live games...</div>
            </div>
        `;
    }
    
    socket.emit('get-active-lobbies', (lobbies) => {
        // Store timer data for real-time updates
        liveGameTimers.clear();
        lobbies.forEach(lobby => {
            liveGameTimers.set(lobby.code, {
                timeLeft: lobby.timeLeft,
                lastUpdate: Date.now()
            });
        });
        
        displayActiveLiveLobbies(lobbies);
    });
}

function updateLiveGameTimers() {
    const now = Date.now();
    
    liveGameTimers.forEach((timerData, lobbyCode) => {
        const timeElement = document.querySelector(`[data-lobby-code="${lobbyCode}"] .time-value`);
        if (timeElement) {
            // Calculate time elapsed since last server update
            const elapsed = now - timerData.lastUpdate;
            const currentTimeLeft = Math.max(0, timerData.timeLeft - elapsed);
            
            // Update display
            timeElement.textContent = formatTime(Math.floor(currentTimeLeft / 1000));
            
            // Remove game if time expired
            if (currentTimeLeft <= 0) {
                const gameCard = document.querySelector(`[data-lobby-code="${lobbyCode}"]`);
                if (gameCard) {
                    gameCard.style.opacity = '0.5';
                    gameCard.style.pointerEvents = 'none';
                    setTimeout(() => {
                        loadActiveLiveLobbies(); // Refresh to get updated data
                    }, 2000);
                }
            }
        }
    });
}

function displayActiveLiveLobbies(lobbies) {
    const container = document.getElementById('gamesContainer');
    const gamesCount = document.getElementById('gamesCount');
    
    if (gamesCount) {
        gamesCount.textContent = `${lobbies.length} games in progress`;
    }
    
    if (!container) return;
    
    if (lobbies.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎯</div>
                <div class="empty-title">No Live Games</div>
                <div class="empty-subtitle">There are currently no games in progress. Check back in a few minutes or create your own lobby!</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = lobbies.map(lobby => `
        <div class="game-card" data-lobby-code="${lobby.code}">
            <div class="game-header">
                <div class="lobby-code">${lobby.code}</div>
                <div class="live-badge">
                    <div class="live-dot"></div>
                    LIVE
                </div>
            </div>
            <div class="game-info">
                <div class="info-item">
                    <div class="info-label">Players Left</div>
                    <div class="info-value players-value">${lobby.playersLeft}/${lobby.numPlayers}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Time Left</div>
                    <div class="info-value time-value">${formatTime(Math.floor(lobby.timeLeft / 1000))}</div>
                </div>
            </div>
            <button class="spectate-button" onclick="spectateGame('${lobby.code}')">👁️ Spectate Live</button>
        </div>
    `).join('');
}

function spectateGame(lobbyCode) {
    const joinData = {
        lobbyCode,
        name: `Spectator${Math.floor(Math.random() * 1000)}`,
        type: 'spectator'
    };
    
    socket.emit('join-lobby', joinData, (response) => {
        if (response.success) {
            gameState.lobbyData = response.lobby;
            gameState.playerType = 'spectator';
            showScreen('spectatorMode');
            initializeSpectatorMode(response.lobby);
        } else {
            showNotification(response.error, 'error');
        }
    });
}

// Waiting Room Functions
function updateWaitingRoom(lobbyState) {
    if (!lobbyState) return;
    
    // Update lobby info
    updateLobbyCode(lobbyState.code);
    
    const durationElement = document.querySelector('.container.wait .info-value');
    if (durationElement) {
        durationElement.textContent = `${lobbyState.settings.duration} min`;
    }
    
    const numPlayersElement = document.querySelector('.container.wait .info-item:last-child .info-value');
    if (numPlayersElement) {
        numPlayersElement.textContent = lobbyState.settings.numPlayers;
    }
    
    updatePlayerList(lobbyState);
    
    // Update ready button state based on current player's ready status
    const currentPlayer = lobbyState.players.find(p => p.id === socket.id);
    if (currentPlayer && lobbyState.status === 'waiting') {
        updateReadyButton(currentPlayer.isReady);
        setReadyButtonState('normal');
    }
}

function updatePlayerList(lobbyState = gameState.lobbyData) {
    if (!lobbyState) return;
    
    const playerList = document.querySelector('.player-list');
    const playersCount = document.querySelector('.players-count');
    
    if (playersCount) {
        playersCount.textContent = `${lobbyState.players.length} of ${lobbyState.settings.numPlayers} Players Connected`;
    }
    
    if (!playerList) return;
    
    const playerItems = [];
    
    // Add actual players
    lobbyState.players.forEach(player => {
        const isCurrentPlayer = player.id === socket.id;
        const playerHtml = `
            <div class="player-item ${player.isHost ? 'host' : ''} ${isCurrentPlayer ? 'current-player' : ''}">
                <div class="player-avatar">${player.name.substring(0, 2).toUpperCase()}</div>
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role ${player.isHost ? 'host' : ''} ${isCurrentPlayer ? 'you' : ''}">${player.isHost ? 'Host' : isCurrentPlayer ? 'You' : 'Player'}</div>
                </div>
                <div class="player-status ${player.isReady ? 'status-ready' : 'status-waiting'}">
                    <div class="status-dot"></div>
                    <span>${player.isReady ? 'READY' : 'WAITING'}</span>
                </div>
            </div>
        `;
        playerItems.push(playerHtml);
    });
    
    // Add empty slots
    const emptySlots = lobbyState.settings.numPlayers - lobbyState.players.length;
    for (let i = 0; i < emptySlots; i++) {
        const emptyHtml = `
            <div class="player-item empty-slot">
                <div class="player-avatar">?</div>
                <div class="player-info">
                    <div class="player-name">Waiting for player...</div>
                    <div class="player-role">Empty Slot</div>
                </div>
                <div class="player-status">
                    <span>---</span>
                </div>
            </div>
        `;
        playerItems.push(emptyHtml);
    }
    
    playerList.innerHTML = playerItems.join('');
}

function initializeWaitingRoom() {
    const readyButton = document.getElementById('readyButton');
    const leaveButton = document.querySelector('.container.wait .leave-button');
    
    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            socket.emit('leave-lobby');
            showScreen('home');
        });
    }
    
    if (readyButton) {
        readyButton.addEventListener('click', toggleReady);
    }
}

function toggleReady() {
    const readyButton = document.getElementById('readyButton');
    if (!readyButton) return;
    
    // Don't allow toggling if button is disabled or game is starting
    if (readyButton.disabled) return;
    
    const isReady = readyButton.classList.contains('ready');
    const newReadyState = !isReady;
    
    socket.emit('player-ready', newReadyState);
    
    // Update button immediately for better UX
    updateReadyButton(newReadyState);
}

function updateReadyButton(isReady) {
    const readyButton = document.getElementById('readyButton');
    if (!readyButton) return;
    
    if (isReady) {
        readyButton.textContent = '⏳ Cancel Ready';
        readyButton.classList.remove('not-ready');
        readyButton.classList.add('ready');
    } else {
        readyButton.textContent = '🎯 Mark as Ready';
        readyButton.classList.remove('ready');
        readyButton.classList.add('not-ready');
    }
}

function setReadyButtonState(state) {
    const readyButton = document.getElementById('readyButton');
    if (!readyButton) return;
    
    switch(state) {
        case 'countdown':
            readyButton.textContent = '⏸️ Cancel Countdown';
            readyButton.disabled = false; // Allow canceling countdown
            break;
        case 'normal':
            readyButton.disabled = false;
            // Button text will be updated by lobby state
            break;
        case 'disabled':
            readyButton.disabled = true;
            break;
    }
}

function showGameStartCountdown() {
    const countdownSection = document.getElementById('gameStartSection');
    const countdownElement = document.getElementById('countdown');
    
    if (countdownSection) {
        countdownSection.classList.add('show');
    }
    
    // Reset countdown display to 5 when showing
    if (countdownElement) {
        countdownElement.textContent = '5';
    }
}

function hideGameStartCountdown() {
    const countdownSection = document.getElementById('gameStartSection');
    if (countdownSection) {
        countdownSection.classList.remove('show');
        
        // Clear the countdown number to prevent showing stale data
        const countdownElement = document.getElementById('countdown');
        if (countdownElement) {
            countdownElement.textContent = '5'; // Reset to default
        }
    }
}

function updateCountdown(count) {
    const countdownElement = document.getElementById('countdown');
    const countdownSection = document.getElementById('gameStartSection');
    
    // Only update if countdown section is visible
    if (countdownElement && countdownSection && countdownSection.classList.contains('show')) {
        countdownElement.textContent = count;
    }
}

// Game Session Functions
let qrScanner = null;

function initializeGameSession(gameData) {
    console.log('Initializing game session with data:', gameData);
    
    // Initialize player stats
    updatePlayerHealth(100);
    updatePlayerScore(0);
    updateGameTimer(gameData.duration * 60, gameState.lobbyData?.settings.numPlayers || 4);
    
    // Show initial status message
    showStatusMessage('Game Started!', 'Hunt for treasures and eliminate opponents');
    
    // Initialize forfeit modal
    initializeForfeitModal();
}

function showStatusMessage(title, text) {
    const statusMessage = document.getElementById('statusMessage');
    const statusTitle = document.getElementById('statusTitle');
    const statusText = document.getElementById('statusText');
    
    if (statusMessage && statusTitle && statusText) {
        statusTitle.textContent = title;
        statusText.textContent = text;
        statusMessage.classList.add('show');
        
        // Auto hide after 3 seconds
        setTimeout(() => {
            statusMessage.classList.remove('show');
        }, 3000);
    }
}

function showQRScannerModal() {
    const modal = document.getElementById('qrScannerModal');
    if (modal) {
        modal.classList.add('show');
        startQRScanner();
    }
}

function hideQRScannerModal() {
    const modal = document.getElementById('qrScannerModal');
    if (modal) {
        modal.classList.remove('show');
        stopQRScanner();
    }
}

function startQRScanner() {
    const qrReader = document.getElementById('qrModalPlaceholder');    
    // Initialize html5-qrcode scanner - SIMPLE APPROACH
    qrScanner = new Html5Qrcode("qrModalPlaceholder");
    
    const config = {
        fps: 10,
        qrbox: 200  // Simple number, not object
    };
    
    qrScanner.start(
        { facingMode: "environment" },  // Simple camera constraint
        config,
        qrCodeMessage => {
            console.log('QR Code detected:', qrCodeMessage);
            handleQRScan(qrCodeMessage);
        },
        error => {
            // Silently handle scanning errors
        }
    ).then(() => {
        // Camera started successfully
        console.log('QR Scanner camera started successfully');
        if (qrReader) {
            qrReader.style.display = 'none';
        }
        qrReader.style.display = 'block';
    }).catch(err => {
        console.error("QR Scanner failed to start:", err);
        if (qrReader) {
            qrReader.innerHTML = '❌<br>Camera Access Required<br><small>Please allow camera permissions</small>';
        }
    });
}

function startMainGameCamera() {
    const mainQrReader = document.getElementById('qrReader');
    const placeholder = document.getElementById('qrCameraPlaceholder');
    
    if (!mainQrReader) return;
    
    // Hide placeholder
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    
    // Initialize main game QR scanner - SIMPLE APPROACH
    const mainScanner = new Html5Qrcode("qrReader");
    
    const config = {
        fps: 10,
        qrbox: 150  // Smaller for gameplay
    };
    
    mainScanner.start(
        { facingMode: "environment" },
        config,
        qrCodeMessage => {
            handleGameQRScan(qrCodeMessage);
        },
        error => {
            // Silently handle scanning errors
        }
    ).then(() => {
        mainQrReader.style.display = 'block';
        console.log('Main game camera started');
    }).catch(err => {
        console.error("Main game camera failed to start", err);
        if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.innerHTML = '❌<br>Camera Access Required';
        }
    });
}
function stopQRScanner() {
    if (qrScanner) {
        qrScanner.stop().then(() => {
            qrScanner.clear();
            qrScanner = null;
            
            const qrReader = document.getElementById('qrModalReader');
            const placeholder = document.getElementById('qrModalPlaceholder');
            
            if (qrReader) qrReader.style.display = 'none';
            if (placeholder) {
                placeholder.style.display = 'flex';
                placeholder.innerHTML = '📷<br>Camera View<br>';
            }
        }).catch(err => {
            console.error("Error stopping QR scanner:", err);
        });
    }
}

function handleQRScan(qrData) {
    // Haptic feedback
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
    
    console.log('QR Code scanned:', qrData);
    
    // Send QR assignment to server
    socket.emit('assign-qr-code', {
        qrCode: qrData,
        playerId: socket.id
    });
}

function showPlayerAssignmentSuccess(data) {
    const modal = document.getElementById('playerAssignmentModal');
    const playerName = document.getElementById('assignmentPlayerName');
    
    if (modal) {
        if (playerName) {
            playerName.textContent = data.playerName || 'Player';
        }
        modal.classList.add('show');
        
        // Auto hide after 2 seconds
        setTimeout(() => {
            modal.classList.remove('show');
            // Start the main game camera now
            startMainGameCamera();
        }, 2000);
    }
}

function handleGameQRScan(qrData) {
    // Haptic feedback
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    console.log('Game QR Code scanned:', qrData);
    
    // Send scan to server
    socket.emit('qr-scan', {
        targetQrCode: qrData,
        scannerId: socket.id
    });
}

function cancelQRScanning() {
    hideQRScannerModal();
    // Start main game camera directly
    socket.emit("player-forfeit")
}

function updateGameTimer(timeLeft, playersAlive) {
    const timerElement = document.getElementById('gameTimer');
    const playersElement = document.getElementById('playersLeft');
    
    if (timerElement) {
        timerElement.textContent = formatTime(timeLeft);
    }
    
    if (playersElement && gameState.lobbyData) {
        playersElement.textContent = `${playersAlive}/${gameState.lobbyData.settings.numPlayers}`;
    }
}

function updatePlayerHealth(health) {
    const healthBar = document.getElementById('healthBar');
    const healthText = document.getElementById('healthText');
    
    if (healthBar) {
        healthBar.style.width = `${health}%`;
        healthBar.className = `health-bar ${health > 60 ? 'high' : health > 30 ? 'medium' : 'low'}`;
    }
    
    if (healthText) {
        healthText.textContent = `${health}%`;
    }
}

function updatePlayerScore(score) {
    const scoreElement = document.getElementById('playerScore');
    if (scoreElement) {
        scoreElement.textContent = score.toLocaleString();
    }
}

function triggerShootIndicator() {
    const shootIndicator = document.getElementById('shootIndicator');
    if (shootIndicator) {
        shootIndicator.classList.add('active');
        setTimeout(() => {
            shootIndicator.classList.remove('active');
        }, 300);
    }
}

function triggerHitIndicator() {
    const hitIndicator = document.getElementById('hitIndicator');
    if (hitIndicator) {
        hitIndicator.classList.add('active');
        setTimeout(() => {
            hitIndicator.classList.remove('active');
        }, 500);
    }
}

// Forfeit Modal Functions
function initializeForfeitModal() {
    const confirmBtn = document.querySelector('.forfeit-confirm-btn');
    const cancelBtn = document.querySelector('.forfeit-cancel-btn');
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmForfeit);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelForfeit);
    }
}

function showForfeitConfirm() {
    const modal = document.getElementById('forfeitModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function confirmForfeit() {
    // Send forfeit to server
    socket.emit('player-forfeit');
    
    // Hide modal and return to home
    cancelForfeit();
    showScreen('home');
    showNotification('You have forfeited the game', 'info');
}

function cancelForfeit() {
    const modal = document.getElementById('forfeitModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function showEliminationPopup() {
    const statusMessage = document.getElementById('statusMessage');
    const statusTitle = document.getElementById('statusTitle');
    const statusText = document.getElementById('statusText');
    
    if (statusMessage && statusTitle && statusText) {
        statusTitle.textContent = '💀 ELIMINATED!';
        statusText.textContent = 'Transitioning to spectator mode...';
        statusMessage.classList.add('show');
        statusMessage.style.borderColor = '#ff0000';
    }
}

// Spectator Mode Functions (basic structure)
function initializeSpectatorMode(gameData) {
    console.log('Initializing spectator mode with data:', gameData);
    // Spectator-specific initialization will be added in next phase
}

function showGameResults(results) {
    console.log('Showing game results:', results);
    showScreen('results');
    // Results display will be enhanced in next phase
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 CV Laser Tag Client initialized');
    
    // Initialize all screens
    initializeHome();
    initializeCreateLobby();
    initializeJoinLobby();
    initializeLiveLobbies();
    initializeWaitingRoom();
    
    // Start on home screen
    showScreen('home');
});

// Global functions for HTML onclick handlers
window.goBack = goBack;
window.spectateGame = spectateGame;
window.cancelQRScanning = cancelQRScanning;
window.showForfeitConfirm = showForfeitConfirm;
window.confirmForfeit = confirmForfeit;
window.cancelForfeit = cancelForfeit;