const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve frontend files from frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Game data structures
const lobbies = new Map(); // lobbyCode -> lobby data
const players = new Map(); // socketId -> player data
const countdownTimers = new Map(); // lobbyCode -> countdown interval

// Utility functions
function generateLobbyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function createLobby(hostSocketId, settings = {}) {
    let lobbyCode;
    do {
        lobbyCode = generateLobbyCode();
    } while (lobbies.has(lobbyCode));

    const lobby = {
        code: lobbyCode,
        host: hostSocketId,
        players: new Map(),
        spectators: new Set(),
        settings: {
            numPlayers: settings.numPlayers || 4,
            duration: settings.duration || 15,
            ...settings
        },
        status: 'waiting', // waiting, starting, qr-assignment, active, finished
        gameData: {
            startTime: null,
            endTime: null,
            scores: new Map(),
            eliminations: new Map()
        }
    };

    lobbies.set(lobbyCode, lobby);
    return lobby;
}

function addPlayerToLobby(lobbyCode, socketId, playerData) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return { success: false, error: 'Lobby not found' };

    if (lobby.players.size >= lobby.settings.numPlayers || lobby.status != 'waiting') {
        return { success: false, error: 'Lobby is full or game already started' };
    }

    // Check for duplicate names
    const requestedName = playerData.name || `Player${lobby.players.size + 1}`;
    const existingNames = Array.from(lobby.players.values()).map(p => p.name.toLowerCase());
    
    let finalName = requestedName;
    if (existingNames.includes(requestedName.toLowerCase())) {
        // Generate unique name by appending number
        let counter = 2;
        do {
            finalName = `${requestedName}${counter}`;
            counter++;
        } while (existingNames.includes(finalName.toLowerCase()) && counter <= 99);
        
        // If we still can't find unique name after 99 attempts, use socket ID
        if (existingNames.includes(finalName.toLowerCase())) {
            finalName = `Player_${socketId.substring(0, 4)}`;
        }
    }

    const player = {
        id: socketId,
        name: finalName,
        originalRequestedName: requestedName, // Store original for feedback
        isReady: false,
        isHost: socketId === lobby.host,
        health: 100,
        score: 0,
        eliminations: 0,
        isAlive: true,
        eliminatedAt: null,
        joinedAt: Date.now()
    };

    lobby.players.set(socketId, player);
    players.set(socketId, { ...player, lobbyCode });
    
    return { 
        success: true, 
        player: player,
        nameChanged: finalName !== requestedName 
    };
}
function removePlayerFromLobby(socketId) {
    const player = players.get(socketId);
    if (!player) return;

    const lobby = lobbies.get(player.lobbyCode);
    if (!lobby) return;

    lobby.players.delete(socketId);
    lobby.spectators.delete(socketId);
    players.delete(socketId);

    // Cancel countdown if it was in progress and check if all remaining players are ready
    if (lobby.status === 'starting') {
        const remainingPlayers = Array.from(lobby.players.values());
        const allReady = remainingPlayers.every(p => p.isReady);
        
        if (!allReady || remainingPlayers.length < lobby.settings.numPlayers) {
            cancelGameCountdown(player.lobbyCode);
        }
    }

    // If host left, assign new host or delete lobby
    if (lobby.host === socketId) {
        const remainingPlayers = Array.from(lobby.players.keys());
        if (remainingPlayers.length > 0) {
            lobby.host = remainingPlayers[0];
            const newHost = lobby.players.get(lobby.host);
            if (newHost) newHost.isHost = true;
        } else {
            // Clean up countdown timer if lobby is being deleted
            const countdownInterval = countdownTimers.get(player.lobbyCode);
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownTimers.delete(player.lobbyCode);
            }
            lobbies.delete(player.lobbyCode);
        }
    }
    checkGameStateAfterPlayerRemoval(player.lobbyCode);
    return player.lobbyCode;
}

function getLobbyState(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return null;

    return {
        code: lobby.code,
        status: lobby.status,
        settings: lobby.settings,
        host: lobby.host,
        players: Array.from(lobby.players.values()),
        spectatorCount: lobby.spectators.size,
        gameData: lobby.gameData
    };
}

function getActiveLobbiesToSpectate() {
    const activeLobbies = [];
    for (const [code, lobby] of lobbies) {
        if (lobby.status === 'active' && lobby.players.size > 0) {
            activeLobbies.push({
                code,
                playersLeft: Array.from(lobby.players.values()).filter(p => p.isAlive).length,
                numPlayers: lobby.settings.numPlayers,
                timeLeft: lobby.gameData.endTime ? 
                    Math.max(0, lobby.gameData.endTime - Date.now()) : 
                    lobby.settings.duration * 60 * 1000,
                spectatorCount: lobby.spectators.size
            });
        }
    }
    return activeLobbies;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Lobby Management
    socket.on('create-lobby', (settings, callback) => {
        try {
            const lobby = createLobby(socket.id, settings);
            
            // Add host as player
            addPlayerToLobby(lobby.code, socket.id, { 
                name: settings.playerName || 'Host' 
            });
            
            socket.join(lobby.code);
            
            console.log(`Lobby created: ${lobby.code} by ${socket.id}`);
            callback({ success: true, lobby: getLobbyState(lobby.code) });
        } catch (error) {
            console.error('Create lobby error:', error);
            callback({ success: false, error: 'Failed to create lobby' });
        }
    });

    socket.on('join-lobby', (data, callback) => {
        try {
            const { lobbyCode, name, type } = data;
            const lobby = lobbies.get(lobbyCode);
            
            if (!lobby) {
                return callback({ success: false, error: 'Lobby not found' });
            }

            if (type === 'spectator') {
                lobby.spectators.add(socket.id);
                socket.join(lobbyCode);
                players.set(socket.id, { lobbyCode, type: 'spectator', name: name || 'Spectator' });
                
                callback({ success: true, type: 'spectator', lobby: getLobbyState(lobbyCode) });
                socket.to(lobbyCode).emit('spectator-joined', { name: name || 'Spectator' });
            } else {
                const result = addPlayerToLobby(lobbyCode, socket.id, { name });
                
                if (!result.success) {
                    return callback({ success: false, error: result.error });
                }
                
                socket.join(lobbyCode);
                
                const response = { 
                    success: true, 
                    type: 'player', 
                    lobby: getLobbyState(lobbyCode) 
                };
                
                // Notify client if name was changed due to duplicate
                if (result.nameChanged) {
                    response.nameChanged = true;
                    response.originalName = result.player.originalRequestedName;
                    response.assignedName = result.player.name;
                }
                
                callback(response);
                socket.to(lobbyCode).emit('player-joined', getLobbyState(lobbyCode));
            }
            
            console.log(`${socket.id} joined lobby ${lobbyCode} as ${type}`);
        } catch (error) {
            console.error('Join lobby error:', error);
            callback({ success: false, error: 'Failed to join lobby' });
        }
    });

    socket.on('leave-lobby', () => {
        const lobbyCode = removePlayerFromLobby(socket.id);
        if (lobbyCode) {
            socket.leave(lobbyCode);
            socket.to(lobbyCode).emit('player-left', getLobbyState(lobbyCode));
            console.log(`${socket.id} left lobby ${lobbyCode}`);
        }
    });

    socket.on('player-ready', (isReady) => {
        const player = players.get(socket.id);
        if (!player || player.type === 'spectator') return;

        const lobby = lobbies.get(player.lobbyCode);
        if (!lobby) return;

        // Don't allow ready changes if game is already active
        if (lobby.status === 'active') return;

        const lobbyPlayer = lobby.players.get(socket.id);
        if (lobbyPlayer) {
            lobbyPlayer.isReady = isReady;
            
            const lobbyState = getLobbyState(player.lobbyCode);
            io.to(player.lobbyCode).emit('lobby-updated', lobbyState);

            // Check if all players are ready and lobby is in waiting state
            const allReady = Array.from(lobby.players.values()).every(p => p.isReady);
            
            if (allReady && lobby.players.size >= 2 && lobby.status === 'waiting') { //change back to>=lobby.settings.numPlayers
                startGameCountdown(player.lobbyCode);
            } 
            // Cancel countdown if someone unreadies during countdown
            else if (!allReady && lobby.status === 'starting') {
                cancelGameCountdown(player.lobbyCode);
            }
        }
    });

    socket.on('get-active-lobbies', (callback) => {
        const activeLobbies = getActiveLobbiesToSpectate();
        callback(activeLobbies);
    });

    socket.on('player-forfeit', () => {
        const player = players.get(socket.id);
        if (!player || player.type === 'spectator') return;

        const lobby = lobbies.get(player.lobbyCode);
        if (!lobby || lobby.status !== 'active') return;

        const lobbyPlayer = lobby.players.get(socket.id);
        if (!lobbyPlayer) return;
        //handle elimination
         handlePlayerElimination(
            player.lobbyCode, 
            socket.id, 
            null, 
            'Forfeit', 
            'forfeit'
        );
    });

    socket.on('assign-qr-code', (data) => {
        const player = players.get(socket.id);
        if (!player || player.type === 'spectator') return;

        const lobby = lobbies.get(player.lobbyCode);
        if (!lobby) return;

        const { qrCode } = data;
        
        // Check if QR code is already assigned to another player
        const existingPlayer = Array.from(lobby.players.values()).find(p => p.assignedQR === qrCode);
        if (existingPlayer && existingPlayer.id !== socket.id) {
            socket.emit('qr-assigned', {
                success: false,
                message: 'QR code already assigned to another player'
            });
            return;
        }
        
        // Assign QR code to player
        const lobbyPlayer = lobby.players.get(socket.id);
        if (lobbyPlayer) {
            lobbyPlayer.assignedQR = qrCode;
            lobbyPlayer.qrAssigned = true; // ADD THIS LINE
            
            socket.emit('qr-assigned', {
                success: true,
                qrCode: qrCode,
                playerName: lobbyPlayer.name,
                playerId: socket.id
            });
            
            // ADD PROGRESS TRACKING
            const totalPlayers = lobby.players.size;
            const assignedPlayers = Array.from(lobby.players.values()).filter(p => p.qrAssigned).length;
            
            io.to(player.lobbyCode).emit('qr-assignment-progress', {
                assigned: assignedPlayers,
                total: totalPlayers,
                playerName: lobbyPlayer.name
            });
            
            console.log(`Player ${lobbyPlayer.name} assigned QR code: ${qrCode} (${assignedPlayers}/${totalPlayers})`);
            
            // CHECK IF ALL PLAYERS READY
            if (assignedPlayers === totalPlayers) {
                startActualGame(player.lobbyCode);
            }
        }
    });

    // Game Events
    socket.on('qr-scan', (data) => {
        const player = players.get(socket.id);
        if (!player || player.type === 'spectator') return;

        const lobby = lobbies.get(player.lobbyCode);
        if (!lobby || lobby.status !== 'active') return;

        const { targetQrCode } = data;
        
        // Find target player by their assigned QR code
        const targetPlayer = Array.from(lobby.players.values()).find(p => p.assignedQR === targetQrCode);
        const scannerPlayer = lobby.players.get(socket.id); // Use socket.id, not scannerId from data
        
        console.log(`QR Scan attempt: Scanner=${scannerPlayer?.name}, Target QR=${targetQrCode}, Target found=${!!targetPlayer}`);
        
        if (!targetPlayer || !scannerPlayer) {
            console.log(`Scan failed: targetPlayer=${!!targetPlayer}, scannerPlayer=${!!scannerPlayer}`);
            socket.emit('scan-result', { 
                success: false, 
                message: 'Invalid QR code or player not found' 
            });
            return;
        }
        
        // Don't allow scanning yourself
        if (targetPlayer.id === socket.id) {
            socket.emit('scan-result', { 
                success: false, 
                message: 'Cannot scan your own QR code' 
            });
            return;
        }
        
        if (!targetPlayer.isAlive) {
            socket.emit('scan-result', { 
                success: false, 
                message: 'Target already eliminated' 
            });
            return;
        }
        
        if (!scannerPlayer.isAlive) {
            socket.emit('scan-result', { 
                success: false, 
                message: 'You are eliminated' 
            });
            return;
        }
        
        // Apply damage
        const damage = 10;
        const pointsEarned = 105;
        
        targetPlayer.health = Math.max(0, targetPlayer.health - damage);
        scannerPlayer.score += pointsEarned;
        
        console.log(`Hit registered: ${scannerPlayer.name} hit ${targetPlayer.name} for ${damage} damage. Target health: ${targetPlayer.health}`);
        
        // Notify scanner of successful hit
        socket.emit('scan-result', {
            success: true,
            targetPlayerId: targetPlayer.id,
            targetPlayerName: targetPlayer.name,
            damage: damage,
            pointsEarned: pointsEarned,
            newScore: scannerPlayer.score,
            scannerId: socket.id
        });

        if (targetPlayer.health <= 0) {
            scannerPlayer.eliminations += 1;
            scannerPlayer.score += 100;
            //handle elimination
            handlePlayerElimination(
                player.lobbyCode, 
                targetPlayer.id, 
                socket.id, 
                scannerPlayer.name
            );
        }else {
            // Notify all players of damage
            io.to(player.lobbyCode).emit('player-damaged', {
                playerId: targetPlayer.id,
                playerName: targetPlayer.name,
                health: targetPlayer.health,
                damage: damage,
                shooterId: socket.id,
                shooterName: scannerPlayer.name
            });
            io.to(player.lobbyCode).emit('lobby-updated', getLobbyState(player.lobbyCode));
            updateSpectators(player.lobbyCode, 'lobby-updated', getLobbyState(player.lobbyCode));
        }
        
        console.log(`${scannerPlayer.name} scanned ${targetPlayer.name} (${targetQrCode}) - Health: ${targetPlayer.health}`);
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const lobbyCode = removePlayerFromLobby(socket.id);
        if (lobbyCode) {
            socket.to(lobbyCode).emit('player-left', getLobbyState(lobbyCode));
        }
    });
});

function handlePlayerElimination(lobbyCode, eliminatedPlayerId, shooterId = null, shooterName = 'Unknown', reason = null) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    const eliminatedPlayer = lobby.players.get(eliminatedPlayerId);
    if (!eliminatedPlayer) return;

    // Mark player as eliminated
    eliminatedPlayer.isAlive = false;
    eliminatedPlayer.health = 0;
    eliminatedPlayer.eliminatedAt = Date.now();

    console.log(`Player eliminated: ${eliminatedPlayer.name} by ${shooterName}`);

    io.to(lobbyCode).emit('lobby-updated', getLobbyState(lobbyCode));
    updateSpectators(lobbyCode, 'lobby-updated', getLobbyState(lobbyCode));

    const alivePlayers = Array.from(lobby.players.values()).filter(p => p.isAlive);
    const isLastEliminated = (alivePlayers.length <= 1);
    // Send elimination event
    io.to(lobbyCode).emit('player-eliminated', {
        playerId: eliminatedPlayerId,
        playerName: eliminatedPlayer.name,
        shooterId: shooterId,
        shooterName: shooterName,
        reason: reason,
        isLastEliminated : isLastEliminated
    });
    
    if (isLastEliminated) {
        endGame(lobbyCode);
    }
}

function startGameCountdown(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    lobby.status = 'starting';
    io.to(lobbyCode).emit('game-starting');

    let countdown = 5;
    const countdownInterval = setInterval(() => {
        io.to(lobbyCode).emit('countdown', countdown);
        countdown--;

        if (countdown < 0) {
            clearInterval(countdownInterval);
            countdownTimers.delete(lobbyCode);
            startGame(lobbyCode);
        }
    }, 1000);

    // Store the interval so we can cancel it if needed
    countdownTimers.set(lobbyCode, countdownInterval);
}

function cancelGameCountdown(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    // Clear the countdown timer
    const countdownInterval = countdownTimers.get(lobbyCode);
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownTimers.delete(lobbyCode);
    }

    // Reset lobby status to waiting
    lobby.status = 'waiting';
    
    // Notify all players that countdown was canceled
    io.to(lobbyCode).emit('countdown-canceled');
    
    console.log(`Countdown canceled for lobby ${lobbyCode}`);
}

function startGame(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    // Change status to 'qr-assignment' 
    lobby.status = 'qr-assignment';
    
    // Reset all players to alive state and clear QR assignments
    for (const player of lobby.players.values()) {
        player.health = 100;
        player.isAlive = true;
        player.score = 0;
        player.eliminations = 0;
        player.assignedQR = null; // Clear any previous QR assignments
        player.qrAssigned = false; // Track QR assignment status
    }

    // Notify players to enter QR assignment phase
    io.to(lobbyCode).emit('qr-assignment-phase', {
        message: 'All players must scan their QR codes before the game begins'
    });

    console.log(`QR Assignment phase started for lobby ${lobbyCode}`);
}

// New function to start the actual game after QR assignment
function startActualGame(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    // NOW set the game as active and start timers
    lobby.status = 'active';
    lobby.gameData.startTime = Date.now();
    lobby.gameData.endTime = Date.now() + (lobby.settings.duration * 60 * 1000);

    io.to(lobbyCode).emit('game-actually-started', {
        startTime: lobby.gameData.startTime,
        endTime: lobby.gameData.endTime,
        duration: lobby.settings.duration,
        message: 'All QR codes assigned! Game begins now!'
    });

    // Start game timer ONLY after QR assignment is complete
    const gameTimer = setInterval(() => {
        const timeLeft = lobby.gameData.endTime - Date.now();
        
        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            endGame(lobbyCode);
        } else {
            io.to(lobbyCode).emit('game-timer', {
                timeLeft: Math.ceil(timeLeft / 1000),
                playersAlive: Array.from(lobby.players.values()).filter(p => p.isAlive).length
            });
            updateSpectators(lobbyCode, 'lobby-updated', getLobbyState(lobbyCode));
        }
    }, 1000);

    console.log(`Actual game started for lobby ${lobbyCode} - all QR codes assigned`);
}
function endGame(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    lobby.status = 'finished';
    const gameEndTime = Date.now();
    
    const results = Array.from(lobby.players.values())
        .map(player => {
            const eliminationTime = player.eliminatedAt || gameEndTime;
            const survivalTime = eliminationTime - lobby.gameData.startTime;
            
            return {
                ...player,
                survivalTime: Math.max(0, Math.floor(survivalTime / 1000))
            };
        })
        .sort((a, b) => {
            if (a.isAlive !== b.isAlive) return b.isAlive - a.isAlive;
            return b.score - a.score;
        })
        .map((player, index) => ({
            ...player,
            rank: index + 1
        }));

    io.to(lobbyCode).emit('game-ended', {
        results,
        winner: results[0],
        finalStats: {
            duration: gameEndTime - lobby.gameData.startTime,
            totalPlayers: lobby.players.size
        }
    });
}

function checkGameStateAfterPlayerRemoval(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    const remainingPlayers = Array.from(lobby.players.values());
    
    // If during QR assignment and only 1 player left, end the game
    if (lobby.status === 'qr-assignment' && remainingPlayers.length <= 1) {
        console.log(`Game ending: Only ${remainingPlayers.length} player(s) left during QR assignment`);
        lobby.status = 'finished';
        io.to(lobbyCode).emit('game-ended', {
            results: remainingPlayers.map((player, index) => ({
                ...player,
                rank: index + 1,
                survivalTime: 0
            })),
            winner: remainingPlayers[0] || null,
            finalStats: {
                duration: 0,
                totalPlayers: lobby.settings.numPlayers,
                reason: 'Insufficient players during QR assignment'
            }
        });
        return;
    }
    
    // If during active game and only 1 alive player left, end the game
    if (lobby.status === 'active') {
        const alivePlayers = remainingPlayers.filter(p => p.isAlive);
        if (alivePlayers.length <= 1) {
            console.log(`Game ending: Only ${alivePlayers.length} alive player(s) left`);
            endGame(lobbyCode);
            return;
        }
    }
}

function updateSpectators(lobbyCode, eventType, data) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;
    
    // Send updates to all spectators in the lobby
    lobby.spectators.forEach(spectatorId => {
        const spectatorSocket = io.sockets.sockets.get(spectatorId);
        if (spectatorSocket) {
            spectatorSocket.emit(eventType, data);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎯 CV Laser Tag Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.io server ready for connections`);
    console.log(`📁 Serving frontend files from ../frontend/`);
});