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
            maxPlayers: settings.maxPlayers || 4,
            duration: settings.duration || 15,
            ...settings
        },
        status: 'waiting', // waiting, starting, active, finished
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
    if (!lobby) return false;

    if (lobby.players.size >= lobby.settings.maxPlayers) {
        return false;
    }

    const player = {
        id: socketId,
        name: playerData.name || `Player${lobby.players.size + 1}`,
        isReady: false,
        isHost: socketId === lobby.host,
        health: 100,
        score: 0,
        eliminations: 0,
        isAlive: true,
        joinedAt: Date.now()
    };

    lobby.players.set(socketId, player);
    players.set(socketId, { ...player, lobbyCode });
    
    return true;
}

function removePlayerFromLobby(socketId) {
    const player = players.get(socketId);
    if (!player) return;

    const lobby = lobbies.get(player.lobbyCode);
    if (!lobby) return;

    lobby.players.delete(socketId);
    lobby.spectators.delete(socketId);
    players.delete(socketId);

    // If host left, assign new host or delete lobby
    if (lobby.host === socketId) {
        const remainingPlayers = Array.from(lobby.players.keys());
        if (remainingPlayers.length > 0) {
            lobby.host = remainingPlayers[0];
            const newHost = lobby.players.get(lobby.host);
            if (newHost) newHost.isHost = true;
        } else {
            lobbies.delete(player.lobbyCode);
        }
    }

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
                maxPlayers: lobby.settings.maxPlayers,
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
                const success = addPlayerToLobby(lobbyCode, socket.id, { name });
                
                if (!success) {
                    return callback({ success: false, error: 'Lobby is full' });
                }
                
                socket.join(lobbyCode);
                
                callback({ success: true, type: 'player', lobby: getLobbyState(lobbyCode) });
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

        const lobbyPlayer = lobby.players.get(socket.id);
        if (lobbyPlayer) {
            lobbyPlayer.isReady = isReady;
            
            const lobbyState = getLobbyState(player.lobbyCode);
            io.to(player.lobbyCode).emit('lobby-updated', lobbyState);

            // Check if all players are ready
            const allReady = Array.from(lobby.players.values()).every(p => p.isReady);
            if (allReady && lobby.players.size >= 2) {
                startGameCountdown(player.lobbyCode);
            }
        }
    });

    socket.on('get-active-lobbies', (callback) => {
        const activeLobbies = getActiveLobbiesToSpectate();
        callback(activeLobbies);
    });

    // Game Events
    socket.on('shoot', (data) => {
        const player = players.get(socket.id);
        if (!player || player.type === 'spectator') return;

        const lobby = lobbies.get(player.lobbyCode);
        if (!lobby || lobby.status !== 'active') return;

        // Broadcast shoot event to all players in lobby
        socket.to(player.lobbyCode).emit('player-shot', {
            playerId: socket.id,
            playerName: player.name,
            timestamp: Date.now()
        });
    });

    socket.on('player-hit', (data) => {
        const player = players.get(socket.id);
        if (!player || player.type === 'spectator') return;

        const lobby = lobbies.get(player.lobbyCode);
        if (!lobby || lobby.status !== 'active') return;

        const lobbyPlayer = lobby.players.get(socket.id);
        if (lobbyPlayer && lobbyPlayer.isAlive) {
            lobbyPlayer.health = Math.max(0, lobbyPlayer.health - (data.damage || 10));
            
            if (lobbyPlayer.health <= 0) {
                lobbyPlayer.isAlive = false;
                
                // Update shooter's score
                if (data.shooterId && lobby.players.has(data.shooterId)) {
                    const shooter = lobby.players.get(data.shooterId);
                    shooter.eliminations += 1;
                    shooter.score += 100;
                }
                
                io.to(player.lobbyCode).emit('player-eliminated', {
                    playerId: socket.id,
                    playerName: lobbyPlayer.name,
                    shooterId: data.shooterId
                });
                
                checkGameEnd(player.lobbyCode);
            } else {
                io.to(player.lobbyCode).emit('player-damaged', {
                    playerId: socket.id,
                    health: lobbyPlayer.health
                });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const lobbyCode = removePlayerFromLobby(socket.id);
        if (lobbyCode) {
            socket.to(lobbyCode).emit('player-left', getLobbyState(lobbyCode));
        }
    });
});

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
            startGame(lobbyCode);
        }
    }, 1000);
}

function startGame(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    lobby.status = 'active';
    lobby.gameData.startTime = Date.now();
    lobby.gameData.endTime = Date.now() + (lobby.settings.duration * 60 * 1000);

    // Reset all players to alive state
    for (const player of lobby.players.values()) {
        player.health = 100;
        player.isAlive = true;
        player.score = 0;
        player.eliminations = 0;
    }

    io.to(lobbyCode).emit('game-started', {
        startTime: lobby.gameData.startTime,
        endTime: lobby.gameData.endTime,
        duration: lobby.settings.duration
    });

    // Start game timer
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
        }
    }, 1000);
}

function checkGameEnd(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    const alivePlayers = Array.from(lobby.players.values()).filter(p => p.isAlive);
    
    if (alivePlayers.length <= 1) {
        endGame(lobbyCode);
    }
}

function endGame(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    lobby.status = 'finished';
    
    // Calculate final results
    const results = Array.from(lobby.players.values())
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
            duration: Date.now() - lobby.gameData.startTime,
            totalPlayers: lobby.players.size
        }
    });

    console.log(`Game ended in lobby ${lobbyCode}`);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🎯 CV Laser Tag Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.io server ready for connections`);
    console.log(`📁 Serving frontend files from ../frontend/`);
});