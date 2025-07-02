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
function showStatusMessage(title, text, type = 'info') {
    console.log('🐛 showStatusMessage called:', { title, text, type }); // Debug line
    
    const statusMessage = document.getElementById('statusMessage');
    const statusTitle = document.getElementById('statusTitle');
    const statusText = document.getElementById('statusText');
    
    if (statusMessage && statusTitle && statusText) {
        // FORCE CLEAR FIRST
        statusTitle.innerHTML = '';
        statusText.innerHTML = '';
        
        // SET NEW VALUES
        statusTitle.textContent = title;
        statusText.textContent = text;
        
        console.log('🐛 Set title to:', statusTitle.textContent); // Debug line
        console.log('🐛 Set text to:', statusText.textContent); // Debug line
        
        // Reset all styles first
        statusMessage.style.borderColor = '';
        statusMessage.style.background = '';
        statusMessage.style.boxShadow = '';
        statusTitle.style.color = ''; // Clear any existing color
        statusText.style.color = ''; // Clear any existing color
        
        // Apply colors based on message type with !important equivalent (direct style setting)
        switch(type) {
            case 'success':
                statusMessage.style.borderColor = '#00ff00';
                statusMessage.style.background = 'rgba(0, 255, 0, 0.3)';
                statusMessage.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.4)';
                statusTitle.style.setProperty('color', '#00ff00', 'important'); // Force green title
                statusText.style.setProperty('color', '#ffffff', 'important'); // Force white text
                break;
            case 'error':
                statusMessage.style.borderColor = '#ff0000';
                statusMessage.style.background = 'rgba(255, 0, 0, 0.3)';
                statusMessage.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.4)';
                statusTitle.style.setProperty('color', '#ff0000', 'important'); // Force red title
                statusText.style.setProperty('color', '#ffffff', 'important'); // Force white text
                break;
            case 'warning':
                statusMessage.style.borderColor = '#ffaa00';
                statusMessage.style.background = 'rgba(255, 170, 0, 0.3)';
                statusMessage.style.boxShadow = '0 0 20px rgba(255, 170, 0, 0.4)';
                statusTitle.style.setProperty('color', '#ffaa00', 'important'); // Force orange title
                statusText.style.setProperty('color', '#ffffff', 'important'); // Force white text
                break;
            case 'eliminated':
                statusMessage.style.borderColor = '#ff0000';
                statusMessage.style.background = 'rgba(255, 0, 0, 0.8)';
                statusMessage.style.boxShadow = '0 0 30px rgba(255, 0, 0, 0.6)';
                statusTitle.style.setProperty('color', '#ffffff', 'important'); // Force white title
                statusText.style.setProperty('color', '#ffcccc', 'important'); // Force light pink text
                break;
            case 'hit':
                statusMessage.style.borderColor = '#ff6600';
                statusMessage.style.background = 'rgba(255, 102, 0, 0.3)';
                statusMessage.style.boxShadow = '0 0 20px rgba(255, 102, 0, 0.4)';
                statusTitle.style.setProperty('color', '#ff6600', 'important'); // Force orange title
                statusText.style.setProperty('color', '#ffffff', 'important'); // Force white text
                break;
            default: // 'info'
                statusMessage.style.borderColor = '#00ffff';
                statusMessage.style.background = 'rgba(0, 0, 0, 0.8)';
                statusMessage.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.3)';
                statusTitle.style.setProperty('color', '#00ffff', 'important'); // Force cyan title
                statusText.style.setProperty('color', '#ffffff', 'important'); // Force white text
        }
        
        console.log('🐛 Applied colors:', {
            titleColor: statusTitle.style.color,
            textColor: statusText.style.color,
            type: type
        }); // Debug line
        
        statusMessage.classList.add('show');
        
        // Auto hide based on message type
        let duration = 2000; // default
        if (type === 'eliminated' || type === 'error') {
            duration = 5000; // longer for critical messages
        } else if (type === 'hit' || type === 'success') {
            duration = 1500; // shorter for action feedback
        }
        
        setTimeout(() => {
            statusMessage.classList.remove('show');
            // Reset styles when hiding
            statusMessage.style.borderColor = '#00ffff';
            statusMessage.style.background = 'rgba(0, 0, 0, 0.9)';
            statusMessage.style.boxShadow = '';
            statusTitle.style.color = '#00ffff'; // Reset to default
            statusText.style.color = '#ffffff'; // Reset to default
        }, duration);
    } else {
        console.error('🐛 Status message elements not found!', { statusMessage, statusTitle, statusText });
    }
}

// Updated showNotification to use proper types
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Map notification types to status message types
    if (type === 'error') {
        showStatusMessage('⚠️ Error', message, 'error');
    } else if (type === 'success') {
        showStatusMessage('✅ Success', message, 'success');
    } else {
        showStatusMessage('ℹ️ Info', message, 'info');
    }
}

// Update all socket handlers to use specific types
socket.on('scan-result', (data) => {
    console.log('Scan result received:', data);
    if (data.success) {
        updatePlayerScore(data.newScore);
        triggerShootIndicator();
    } else {
         showStatusMessage('⚠️ Scan Failed', data.message, 'error');
    }
});

socket.on('player-damaged', (data) => {
    console.log('Player damaged:', data);
    if (data.playerId === socket.id) {
        updatePlayerHealth(data.health);
        triggerHitIndicator();
        showStatusMessage('💥 HIT!', `Hit by ${data.shooterName}! -${data.damage} HP (${data.health}% remaining)`, 'hit');
    } else if (data.shooterId === socket.id){
        showStatusMessage('🎯 Direct Hit!', `You hit ${data.playerName} for ${data.damage} damage!`, 'success');
    }
});

socket.on('player-eliminated', (data) => {
    console.log('Player eliminated:', data);
    if (data.playerId === socket.id) {
        updatePlayerHealth(0)
        triggerHitIndicator();
        showStatusMessage('💀 YOU WERE ELIMINATED!', 'You have been eliminated from the game', 'eliminated');
        if (gameState.gameActive && gameState.currentScreen === 'gameSession' && gameState.playerType === 'player') {
            setTimeout(() => {
                gameState.playerType = 'spectator';
                stopMainGameCamera();
                showScreen('spectatorMode');
                if ((gameState.lobbyData) && (!isLastEliminated)) {
                    initializeSpectatorMode(gameState.lobbyData);
                }
            }, 1000);
        }
    } else {
        showStatusMessage('🎯 Player Eliminated', `${data.playerName} was eliminated by ${data.shooterName}!`, 'warning');
    }
});

// New socket event for QR assignment phase
socket.on('qr-assignment-phase', (data) => {
    console.log('Entering QR assignment phase:', data);
    gameState.gameActive = false; // Game not yet active
    
    if (gameState.playerType === 'player') {
        showScreen('gameSession');
        initializeQRAssignmentPhase(data);
    } 
});

// New socket event for QR assignment progress
socket.on('qr-assignment-progress', (data) => {
    console.log('QR assignment progress:', data);
    updateQRAssignmentProgress(data.assigned, data.total, data.playerName);
});

// New socket event for actual game start (after QR assignment)
socket.on('game-actually-started', (gameData) => {
    console.log('Game actually started!', gameData);
    gameState.gameActive = true;
    
    // Hide QR assignment UI and show actual game
    hideQRAssignmentPhase();
    
    if (gameState.playerType === 'player') {
        initializeActualGameSession(gameData);
    } 
    
    // Show game start message
    showStatusMessage('🎯 GAME BEGINS!', 'All players ready - hunt begins now!');
});

// Initialize QR assignment phase
function initializeQRAssignmentPhase(data) {
    console.log('Initializing QR assignment phase');
    
    // Show QR assignment overlay instead of immediately starting game
    showQRAssignmentOverlay(data.message);
    
    // Show QR scanner modal for assignment
    setTimeout(() => {
        showQRScannerModal();
    }, 1000);
}

// Show QR assignment overlay
function showQRAssignmentOverlay(message) {
    const overlay = document.getElementById('qrAssignmentOverlay') || createQRAssignmentOverlay();
    const messageEl = overlay.querySelector('.assignment-message');
    const progressEl = overlay.querySelector('.assignment-progress');
    
    messageEl.textContent = message;
    progressEl.textContent = 'Waiting for all players to scan QR codes...';
    
    overlay.classList.add('show');
}

// Create QR assignment overlay (add this to your HTML)
function createQRAssignmentOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'qrAssignmentOverlay';
    overlay.className = 'qr-assignment-overlay';
    overlay.innerHTML = `
        <div class="assignment-container">
            <div class="assignment-icon">🎯</div>
            <div class="assignment-title">QR Code Assignment Phase</div>
            <div class="assignment-message">All players must scan their QR codes</div>
            <div class="assignment-progress">Waiting for all players...</div>
            <div class="assignment-players-status" id="playersStatus">
                <div class="status-text">Players Ready: <span id="readyCount">0</span>/<span id="totalCount">0</span></div>
                <div class="progress-bar-container">
                    <div class="progress-bar" id="progressBar"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

// Update QR assignment progress
function updateQRAssignmentProgress(assigned, total, playerName) {
    const overlay = document.getElementById('qrAssignmentOverlay');
    if (!overlay) return;
    
    const readyCount = overlay.querySelector('#readyCount');
    const totalCount = overlay.querySelector('#totalCount');
    const progressBar = overlay.querySelector('#progressBar');
    const progressText = overlay.querySelector('.assignment-progress');
    
    if (readyCount) readyCount.textContent = assigned;
    if (totalCount) totalCount.textContent = total;
    
    if (progressBar) {
        const percentage = (assigned / total) * 100;
        progressBar.style.width = percentage + '%';
    }
    
    if (progressText) {
        if (assigned === total) {
            progressText.textContent = 'All players ready! Starting game...';
            progressText.style.color = '#00ff00';
        } else {
            progressText.textContent = `${playerName} got their QR code! (${assigned}/${total})`;
        }
    }
}

// Hide QR assignment phase
function hideQRAssignmentPhase() {
    const overlay = document.getElementById('qrAssignmentOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
    
    // Hide QR scanner modal if still open
    hideQRScannerModal();
}

// Initialize actual game session (after QR assignment)
function initializeActualGameSession(gameData) {
    console.log('Initializing actual game session with data:', gameData);
    
    // Initialize player stats
    updatePlayerHealth(100);
    updatePlayerScore(0);
    updateGameTimer(gameData.duration * 60, gameState.lobbyData?.settings.numPlayers || 4);
    
    // Start main game camera
    startMainGameCamera();
    
    // Initialize forfeit modal
    initializeForfeitModal();
}

// Modified QR assignment success handler
socket.on('qr-assigned', (data) => {
    console.log('QR Code assigned:', data);
    if (data.success) {
        // Hide QR scanner immediately after successful scan
        hideQRScannerModal();
        
        // Show assignment overlay (will be updated by progress event)
        showQRAssignmentOverlay('Waiting for all players to scan...');
        
        // Show quick success message
        showNotification(`✅ ${data.playerName} QR registered!`, 'success');
    } else {
        showNotification(data.message || 'Failed to assign QR code', 'error');
    }
});
function createSuccessMessage() {
    const msg = document.createElement('div');
    msg.id = 'qrSuccessMessage';
    msg.className = 'qr-success-message';
    msg.style.cssText = `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 255, 0, 0.9);
        color: #000;
        padding: 10px 20px;
        border-radius: 10px;
        font-weight: bold;
        z-index: 2200;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    msg.style.opacity = '0';
    document.querySelector('.qr-scanner-container').appendChild(msg);
    
    // Add show class styling
    const style = document.createElement('style');
    style.textContent = '.qr-success-message.show { opacity: 1 !important; }';
    document.head.appendChild(style);
    
    return msg;
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

socket.on('connect', () => {
    console.log('🔗 Connected to server:', socket.id);
    showStatusMessage('🔗 Connected', 'Connected to game server', 'success');
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
    showStatusMessage('❌ Disconnected', 'Lost connection to server', 'error');
    showScreen('home');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showStatusMessage('❌ Connection Error', 'Failed to connect to server', 'error');
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

socket.on('game-timer', (data) => {
    updateGameTimer(data.timeLeft, data.playersAlive);
});

socket.on('game-ended', (results) => {
    console.log('Game ended:', results);
    gameState.gameActive = false;
    
    showGameResults(results);
});
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
    const qrQuit = document.getElementById('qrCancel');  
    qrScanner = new Html5Qrcode("qrModalPlaceholder");
    
    if (qrQuit) {
        qrQuit.addEventListener('click',cancelQRScanning)
    }
    // Make qrbox responsive to screen size
    const screenWidth = window.innerWidth;
    const qrBoxSize = Math.min(screenWidth * 0.8, 300); // 80% of screen width, max 300px
    
    const config = {
        fps: 20,
        qrbox: qrBoxSize,
        aspectRatio: 1.0 // Square scanning area
    };
    
    qrScanner.start(
        { facingMode: "environment" },
        config,
        qrCodeMessage => {
            console.log('QR Code detected:', qrCodeMessage);
            handleQRScan(qrCodeMessage);
        },
        error => {
            // Silently handle scanning errors
        }
    ).then(() => {
        console.log('QR Scanner camera started successfully');
        if (qrReader) {
            qrReader.style.display = 'block';
        }
    }).catch(err => {
        console.error("QR Scanner failed to start:", err);
        if (qrReader) {
            qrReader.innerHTML = '❌<br>Camera Access Required<br><small>Please allow camera permissions</small>';
        }
    });
}

function startMainGameCamera() {
    const placeholder = document.getElementById('qrCameraPlaceholder');
    
    if (!placeholder) {
        console.error('Camera placeholder not found');
        return;
    }
    
    // Clear any existing content
    placeholder.innerHTML = '';
    
    const mainScanner = new Html5Qrcode("qrCameraPlaceholder");
    
    const screenWidth = window.innerWidth;
    const qrBoxSize = Math.min(screenWidth * 0.9, 400);
    
    const config = {
        fps: 20,
        qrbox: qrBoxSize,
        aspectRatio: 1.0
    };
    
    console.log(`Setting QR box size to: ${qrBoxSize}px for screen width: ${screenWidth}px`);
    
    placeholder.innerHTML = '<div style="color: #00ffff; text-align: center;">📷<br>Starting Camera...</div>';
    
    mainScanner.start(
        { facingMode: "environment" },
        config,
        qrCodeMessage => {
            handleGameQRScan(qrCodeMessage);
        },
        error => {
            // Silently handle scanning errors - don't log every frame
        }
    ).then(() => {
        console.log('Main game camera started successfully with QR box size:', qrBoxSize);
        
        const crosshair = document.querySelector('.crosshair');
        if (crosshair) {
            crosshair.classList.add('scanning');
        }
        
    }).catch(err => {
        console.error("Main game camera failed to start:", err);
        
        // Show error message using status system instead of alert
        showStatusMessage('📷 Camera Error', 'Camera access required - please allow permissions and refresh');
        
        placeholder.innerHTML = `
            <div style="color: #ff0000; text-align: center; padding: 20px;">
                ❌<br>
                Camera Access Required<br>
                <small>Please allow camera permissions and refresh</small>
            </div>
        `;
    });
}

function stopMainGameCamera() {
    try {
        const placeholder = document.getElementById('qrCameraPlaceholder');
        if (placeholder) {
            const existingVideo = placeholder.querySelector('video');
            if (existingVideo) {
                const stream = existingVideo.srcObject;
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
            }
            placeholder.innerHTML = '<div style="color: #00ffff; text-align: center;">📷<br>Camera Stopped</div>';
        }
        
        const crosshair = document.querySelector('.crosshair');
        if (crosshair) {
            crosshair.classList.remove('scanning');
        }
    } catch (err) {
        console.log('Error stopping camera:', err);
    }
}
function stopQRScanner() {
    if (qrScanner) {
        qrScanner.stop().then(() => {
            qrScanner.clear();
            qrScanner = null;
            
            const placeholder = document.getElementById('qrModalPlaceholder');
            
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
    console.log('QR Code scanned:', qrData);
    
    // Send QR assignment to server
    socket.emit('assign-qr-code', {
        qrCode: qrData,
        playerId: socket.id
    });
}
// Replace the handleGameQRScan function in client.js
let lastGameScanTime = 0;

function handleGameQRScan(qrData) {
    const now = Date.now();
    
    // Prevent rapid scanning (1 second cooldown)
    if (now - lastGameScanTime < 1000) {
        console.log('Scan cooldown active, ignoring scan');
        return;
    }
    
    lastGameScanTime = now;
       
       
    console.log('Game QR Code scanned:', qrData);
    
    // Send scan to server - only need the target QR code
    socket.emit('qr-scan', {
        targetQrCode: qrData
    });
}

function cancelQRScanning() {
    hideQRScannerModal();
    const assignmentOverlay = document.getElementById('qrAssignmentOverlay');
    if (assignmentOverlay) {
        assignmentOverlay.classList.remove('show');
    }
    socket.emit('leave-lobby');
    showScreen("joinLobby")
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
    if (gameState.gameActive && gameState.currentScreen === 'gameSession' && gameState.playerType === 'player') {
        setTimeout(() => {
            gameState.playerType = 'spectator';
            stopMainGameCamera();
            showScreen('spectatorMode');
            if (gameState.lobbyData) {
                initializeSpectatorMode(gameState.lobbyData);
            }
        }, 1000);
    }
    else{
        showScreen('home');
    }
}

function cancelForfeit() {
    const modal = document.getElementById('forfeitModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function showGameResults(results) {
    console.log('Showing game results:', results);
    showScreen('results');
    
    const { results: players, winner, finalStats } = results;
    
    const currentUserAsPlayer = players ? players.find(p => p.id === socket.id) : null;
    const isPureSpectator = !currentUserAsPlayer; // True if user wasn't in the game
    
    console.log('Current user type:', isPureSpectator ? 'Pure Spectator' : 'Player/Eliminated Player');
    
    // Update winner section
    const winnerName = document.querySelector('.winner-name');
    const winnerScore = document.querySelector('.winner-score');
    
    if (winner && winnerName && winnerScore) {
        winnerName.textContent = winner.name;
        winnerScore.textContent = `Final Score: ${winner.score.toLocaleString()}`;
    }
    
    const playerStatsContainer = document.querySelector('.player-stats');
    if (playerStatsContainer && players) {
        playerStatsContainer.innerHTML = players.map(player => {
            const isCurrentPlayer = player.id === socket.id;
            const isWinner = player.rank === 1;
            
            // Format survival time
            const survivalMinutes = Math.floor(player.survivalTime / 60);
            const survivalSeconds = player.survivalTime % 60;
            const survivalFormatted = `${survivalMinutes}:${survivalSeconds.toString().padStart(2, '0')}`;
            
            const youLabel = (isCurrentPlayer && !isPureSpectator) ? ' (You)' : '';
            
            return `
                <div class="player-stat-item ${isWinner ? 'winner' : ''} ${isCurrentPlayer && !isPureSpectator ? 'you' : ''}">
                    <div class="rank-badge ${player.rank === 1 ? 'rank-1' : player.rank === 2 ? 'rank-2' : player.rank === 3 ? 'rank-3' : 'rank-other'}">${player.rank}</div>
                    <div class="player-info">
                        <div class="player-name ${isWinner ? 'winner' : ''} ${isCurrentPlayer && !isPureSpectator ? 'you' : ''}">${player.name}${youLabel}</div>
                        <div class="player-details">
                            <div class="detail-item">
                                <div class="detail-label">Score</div>
                                <div class="detail-value">${player.score.toLocaleString()}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Eliminations</div>
                                <div class="detail-value">${player.eliminations}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Survival</div>
                                <div class="detail-value">${survivalFormatted}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    const homeButton = document.querySelector('.lobby-button');
    if (homeButton) {
        homeButton.onclick = () => {
            showScreen('home');
            // Reset game state
            gameState.gameActive = false;
            gameState.lobbyData = null;
            gameState.playerType = null;
        };
    }  
  }

function initializeSpectatorMode(gameData) {
    console.log('Initializing spectator mode with data:', gameData);
   
    // Update lobby code display
    const lobbyCodeEl = document.querySelector('.spectator-container .lobby-code');
    if (lobbyCodeEl && gameData.code) {
        lobbyCodeEl.textContent = gameData.code;
    }
    const currentPlayer = gameData.players ? gameData.players.find(p => p.id === socket.id) : null;
    const isEliminatedPlayer = currentPlayer && !currentPlayer.isAlive;

    // Update viewer badge
    const viewerBadge = document.getElementById('viewerBadge');
    if (viewerBadge) {
        if (isEliminatedPlayer) {
            viewerBadge.textContent = '💀 ELIMINATED';
            viewerBadge.className = 'viewer-badge eliminated';
        } else {
            viewerBadge.textContent = '👁️ SPECTATING';
            viewerBadge.className = 'viewer-badge spectator';
        }
    }   

    const yourStats = document.getElementById('yourStats');
    if (yourStats && isEliminatedPlayer) {
        yourStats.classList.remove('spectator-mode'); // Show the stats
        
        // Calculate rank
        const sortedPlayers = [...gameData.players].sort((a, b) => {
            if (a.isAlive !== b.isAlive) return b.isAlive - a.isAlive;
            return b.score - a.score;
        });
        const playerRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
        
        const finalRankValue = yourStats.querySelector('.final-stat-value');
        const scoreValue = yourStats.querySelectorAll('.final-stat-value')[1];
        const elimsValue = yourStats.querySelectorAll('.final-stat-value')[2];
        
        if (finalRankValue) finalRankValue.textContent = `#${playerRank}`;
        if (scoreValue) scoreValue.textContent = currentPlayer.score.toLocaleString();
        if (elimsValue) elimsValue.textContent = currentPlayer.eliminations;
    } else if (yourStats) {
        yourStats.classList.add('spectator-mode'); // Hide the stats
    }
    // Initialize back button
    const backButton = document.querySelector('.spectator-container .back-button');
    if (backButton) {
        backButton.onclick = goBack;
    }
    
    // Initialize camera view toggle
    const cameraBackBtn = document.querySelector('.camera-back-btn');
    if (cameraBackBtn) {
        cameraBackBtn.onclick = () => showSpectatorLeaderboard();
    }
    
    // Show leaderboard by default
    showSpectatorLeaderboard();
    
    // Update leaderboard with current game data
    updateSpectatorLeaderboard(gameData);
    
    // Start real-time updates
    startSpectatorUpdates();
}

function updateSpectatorLeaderboard(lobbyData) {
    if (!lobbyData || !lobbyData.players) return;
    
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;
    
    // Sort players by score, alive status
    const sortedPlayers = [...lobbyData.players].sort((a, b) => {
        if (a.isAlive !== b.isAlive) return b.isAlive - a.isAlive; // Alive players first
        return b.score - a.score; // Then by score
    });
    
    leaderboardList.innerHTML = sortedPlayers.map((player, index) => {
        const rank = index + 1;
        const isCurrentUser = player.id === socket.id;
        
        return `
            <div class="leaderboard-item ${player.isAlive ? 'alive' : 'eliminated'} ${isCurrentUser ? 'you' : ''}" 
                 ${player.isAlive ? `onclick="viewPlayerCamera('${player.id}', '${player.name}')"` : ''}>
                <div class="rank-badge ${rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : player.isAlive ? 'rank-other' : 'rank-eliminated'}">${rank}</div>
                <div class="player-info">
                    <div class="leaderboard-name ${player.isAlive ? 'alive' : 'eliminated'} ${isCurrentUser ? 'you' : ''}">${player.name}${isCurrentUser ? ' (You)' : ''}</div>
                    <div class="player-details">
                        <span>Score: <span class="score-value">${player.score.toLocaleString()}</span></span>
                        <span>Eliminations: <span class="eliminations-value">${player.eliminations}</span></span>
                    </div>
                </div>
                <div class="status-indicator ${player.isAlive ? 'status-alive' : 'status-eliminated'}"></div>
            </div>
        `;
    }).join('');
    
    // Update players alive count in top HUD
    const playersValue = document.querySelector('.spectator-container .players-value');
    if (playersValue) {
        const alivePlayers = sortedPlayers.filter(p => p.isAlive).length;
        playersValue.textContent = `${alivePlayers}/${sortedPlayers.length}`;
    }
}

function showSpectatorLeaderboard() {
    const leaderboardView = document.getElementById('leaderboardView');
    const cameraView = document.getElementById('cameraView');
    
    if (leaderboardView) leaderboardView.classList.remove('hidden');
    if (cameraView) cameraView.classList.remove('active');
}

function viewPlayerCamera(playerId, playerName) {
    const leaderboardView = document.getElementById('leaderboardView');
    const cameraView = document.getElementById('cameraView');
    const viewingPlayer = document.getElementById('viewingPlayer');
    const cameraPlayerName = document.getElementById('cameraPlayerName');
    
    if (leaderboardView) leaderboardView.classList.add('hidden');
    if (cameraView) cameraView.classList.add('active');
    if (viewingPlayer) viewingPlayer.textContent = playerName;
    if (cameraPlayerName) cameraPlayerName.textContent = playerName;
    
    // Update camera stats for selected player
    updateCameraPlayerStats(playerId);
}

function updateCameraPlayerStats(playerId) {
    if (!gameState.lobbyData || !gameState.lobbyData.players) return;
    
    const player = gameState.lobbyData.players.find(p => p.id === playerId);
    if (!player) return;
    
    const scoreEl = document.getElementById('cameraPlayerScore');
    const elimsEl = document.getElementById('cameraPlayerElims');
    const rankEl = document.getElementById('cameraPlayerRank');
    const healthEl = document.getElementById('cameraPlayerHealth');
    
    if (scoreEl) scoreEl.textContent = player.score.toLocaleString();
    if (elimsEl) elimsEl.textContent = player.eliminations;
    if (healthEl) {
        healthEl.style.width = `${player.health}%`;
        healthEl.className = `health-bar ${player.health > 60 ? 'health-high' : player.health > 30 ? 'health-medium' : 'health-low'}`;
    }
    
    // Calculate rank
    if (rankEl && gameState.lobbyData.players) {
        const sortedPlayers = [...gameState.lobbyData.players].sort((a, b) => {
            if (a.isAlive !== b.isAlive) return b.isAlive - a.isAlive;
            return b.score - a.score;
        });
        const rank = sortedPlayers.findIndex(p => p.id === playerId) + 1;
        rankEl.textContent = `#${rank}`;
    }
}

function startSpectatorUpdates() {
    socket.on('lobby-updated', (lobbyData) => {
        if (gameState.currentScreen === 'spectatorMode') {
            gameState.lobbyData = lobbyData;
            updateSpectatorLeaderboard(lobbyData);
            updateEliminatedPlayerStats(lobbyData);
            updateCameraViewIfActive();
        }
    });
    // Listen for game timer updates
    socket.on('game-timer', (data) => {
        if (gameState.currentScreen === 'spectatorMode') {
            const timerValue = document.getElementById('timerValue');
            if (timerValue) {
                timerValue.textContent = formatTime(data.timeLeft);
            }
        }
    });
    
    // Listen for player updates
    socket.on('player-damaged', (data) => {
        if (gameState.currentScreen === 'spectatorMode') {
            // Update the damaged player's health in spectator view
            updateSpectatorLeaderboard(gameState.lobbyData);
            updateCameraViewIfActive();
        }
    });
    
    socket.on('player-eliminated', (data) => {
        if (gameState.currentScreen === 'spectatorMode') {
            updateSpectatorLeaderboard(gameState.lobbyData);
            updateCameraViewIfActive();
            if (data.playerId === socket.id) {
                updateEliminatedPlayerStats(gameState.lobbyData);
            }
        }
    });
}

function updateEliminatedPlayerStats(lobbyData) {
    const currentPlayer = lobbyData.players ? lobbyData.players.find(p => p.id === socket.id) : null;
    const isEliminatedPlayer = currentPlayer && !currentPlayer.isAlive;
    
    const yourStats = document.getElementById('yourStats');
    if (yourStats && isEliminatedPlayer) {
        yourStats.classList.remove('spectator-mode');
        
        // Calculate current rank
        const sortedPlayers = [...lobbyData.players].sort((a, b) => {
            if (a.isAlive !== b.isAlive) return b.isAlive - a.isAlive;
            return b.score - a.score;
        });
        const playerRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
        
        // Update stats with current data
        const finalRankValue = yourStats.querySelector('.final-stat-value');
        const scoreValue = yourStats.querySelectorAll('.final-stat-value')[1];
        const elimsValue = yourStats.querySelectorAll('.final-stat-value')[2];
        
        if (finalRankValue) finalRankValue.textContent = `#${playerRank}`;
        if (scoreValue) scoreValue.textContent = currentPlayer.score.toLocaleString();
        if (elimsValue) elimsValue.textContent = currentPlayer.eliminations;
        
        // Update viewer badge
        const viewerBadge = document.getElementById('viewerBadge');
        if (viewerBadge) {
            viewerBadge.textContent = '💀 ELIMINATED';
            viewerBadge.className = 'viewer-badge eliminated';
        }
    }
}

function updateCameraViewIfActive() {
    const cameraView = document.getElementById('cameraView');
    const viewingPlayer = document.getElementById('viewingPlayer');
    
    // Check if camera view is currently active
    if (cameraView && cameraView.classList.contains('active') && viewingPlayer) {
        const playerName = viewingPlayer.textContent;
        
        // Find the player by name and update their stats
        if (gameState.lobbyData && gameState.lobbyData.players) {
            const player = gameState.lobbyData.players.find(p => p.name === playerName);
            if (player) {
                console.log(`📹 Updating camera view for ${playerName} in real-time`);
                updateCameraPlayerStats(player.id);
                
                if (!player.isAlive) {
                    const cameraPlayerName = document.getElementById('cameraPlayerName');
                    if (cameraPlayerName) {
                        cameraPlayerName.textContent = `${playerName} 💀`;
                        cameraPlayerName.style.color = '#ff6666';
                    }
                }
            }
        }
    }
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