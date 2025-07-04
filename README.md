# CV Laser Tag - Multiplayer QR Code Battle Arena

A real-time multiplayer laser tag game where players use QR codes for combat mechanics.

## 🔗 Live Site

* [https://laser-tag-yrn4.onrender.com](https://laser-tag-yrn4.onrender.com)

## 🚀 Features

### 🎮 Game Modes

* **Player Mode**: Active combat participation with camera scanning
* **Spectator Mode**: Live viewing of ongoing games with the ability to switch between players

### 🕹️ Core Gameplay

* **QR Code Combat**: Scan other players' QR codes to deal damage
* **Real-time Multiplayer**: Live synchronization across all connected devices using sockets.io
* **Health & Scoring System**: Tracks player health, damage taken, kills, and overall score
* **Powerup System**: Strategic boosts (damage, health) activated by scanning powerup QR codes earned through points

### 📺 Key Screens

* Lobby creation and joining interface
* Player waiting rooms with ready-check system
* Live game session with QR scanning and real-time updates
* Real-time leaderboard and final results screen
* Spectator leaderboard view for non-participant viewing

## 🛠 Tech Stack

* **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
* **Backend**: Node.js, Express.js
* **Real-time Engine**: Socket.io for low-latency multiplayer experience
* **QR Scanning**: Html5-qrcode library for camera-based scanning
* **UI/UX**: Custom-designed, responsive cyberpunk interface

## 📂 Project Structure

```
├── frontend/
│   ├── index.html          # Main game interface
│   ├── client.js           # Frontend game logic and Socket.io communication
│   └── css/
│       └── style.css       # Responsive cyberpunk theme styling
├── backend/
│   ├── server.js           # Express server with Socket.io integration
│   └── package.json        # Project metadata and dependencies
└── README.md               # Project overview and instructions
```

## ⚙️ Setup & Run Locally

1. **Clone the Repository**

   ```bash
   git clone "https://github.com/LuthoYRN/Laser-tag.git"
   cd Laser-tag/backend/
   ```

2. **Install Backend Dependencies**

   ```bash
   npm install express socket.io
   ```

3. **Start the Server**

   ```bash
   npm start
   ```

4. **Play the Game**

   * Open `http://localhost:3000` in your browser
   * Allow camera access when prompted for QR scanning

## 🕹️ How to Play

1. **Create or Join a Lobby**

   * One player hosts a lobby and shares the lobby code
   * Other players join using that code

2. **Assign QR Codes**

   * Each player scans their unique QR code to identify themselves in-game

3. **Start the Battle**

   * Players scan enemy QR codes using their camera to deal damage
   * Every successful scan reduces the opponent's health and earns points

4. **Use Powerups**

   * Accumulate points and scan powerup QR codes to activate boosts like:

     * 🔥 Damage Amplifier
     * ❤️ Health Restore

5. **Win Conditions**

   * Be the last player standing, or
   * Have the highest score when the match timer runs out
## 🔒 Permissions & Requirements

* Ensure **camera permissions** are granted for the browser
* Best experienced on **mobile devices** using the **back camera**
