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
    // Hide all screens
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.add('hidden');
    });
    
    // Show target screen
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
        gameState.currentScreen = screenName;
        console.log(`Switched to screen: ${screenName}`);
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
});

socket.on('countdown', (count) => {
    console.log('Countdown:', count);
    updateCountdown(count);
});

socket.on('game-started', (gameData) => {
    console.log('Game started!', gameData);
    gameState.gameActive = true;
    
    if (gameState.playerType === 'player') {
        showScreen('gameSession');
        initializeGameSession(gameData);
    } else if (gameState.playerType === 'spectator') {
        showScreen('spectatorMode');
        initializeSpectatorMode(gameData);
    }
});

socket.on('game-timer', (data) => {
    updateGameTimer(data.timeLeft, data.playersAlive);
});

socket.on('player-shot', (data) => {
    console.log('Player shot:', data);
    // Handle shooting animation/feedback
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
function initializeLiveLobbies() {
    const backButton = document.querySelector('.container.live .back-button');
    const refreshButton = document.querySelector('.refresh-button');
    
    if (backButton) {
        backButton.addEventListener('click', goBack);
    }
    
    if (refreshButton) {
        refreshButton.addEventListener('click', loadActiveLiveLobbies);
    }
}

function loadActiveLiveLobbies() {
    socket.emit('get-active-lobbies', (lobbies) => {
        displayActiveLiveLobbies(lobbies);
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
    
    const isReady = readyButton.classList.contains('ready');
    const newReadyState = !isReady;
    
    socket.emit('player-ready', newReadyState);
    
    if (newReadyState) {
        readyButton.textContent = '⏳ Cancel Ready';
        readyButton.classList.remove('not-ready');
        readyButton.classList.add('ready');
    } else {
        readyButton.textContent = '🎯 Mark as Ready';
        readyButton.classList.remove('ready');
        readyButton.classList.add('not-ready');
    }
}

function showGameStartCountdown() {
    const countdownSection = document.getElementById('gameStartSection');
    if (countdownSection) {
        countdownSection.classList.add('show');
    }
}

function updateCountdown(count) {
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        countdownElement.textContent = count;
    }
}

// Game Session Functions (basic structure)
function initializeGameSession(gameData) {
    console.log('Initializing game session with data:', gameData);
    // Game-specific initialization will be added in next phase
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
    
    // Load active lobbies every 30 seconds if on live lobbies screen
    setInterval(() => {
        if (gameState.currentScreen === 'liveLobbies') {
            loadActiveLiveLobbies();
        }
    }, 30000);
});

// Global functions for HTML onclick handlers
window.goBack = goBack;
window.spectateGame = spectateGame;