# VR to DSU

Convert Meta Quest 2 controller movements into Cemuhook DSU Protocol data for use with emulators like Dolphin, Cemu, Yuzu, and Ryujinx.

## 🎮 Features

- **WebXR Integration**: Uses WebXR to capture controller motion data from Meta Quest 2
- **DSU Protocol**: Full implementation of Cemuhook DSU protocol (version 1001)
- **Real-time Streaming**: ~250Hz motion data transmission
- **Dual Modes**:
  - **Combined**: Both controllers → 1 DSU slot (motion from left, sticks from both)
  - **Separate**: Each controller → its own DSU slot
- **Button Mapping**: Triggers, grips, thumbsticks, and face buttons all mapped

## 📋 Requirements

- **VR Headset**: Meta Quest 2 (or other WebXR-compatible headset)
- **Browser**: Meta Quest Browser or Chromium-based browser (not Firefox)
- **PC**: Node.js 18+ installed
- **Network**: Quest and PC on the same local network

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd host
npm install
```

### 2. Start the Server

```bash
cd host
npm start
```

The server will start on:
- **HTTP/WebSocket**: `http://localhost:3000`
- **DSU UDP**: `localhost:26760`

### 3. Find Your PC's IP Address

```bash
# Windows
ipconfig
# Look for IPv4 Address (e.g., 192.168.1.100)
```

### 4. Connect Your Quest 2

1. Put on your Quest 2 headset
2. Open the Meta Quest Browser
3. Navigate to `http://YOUR_PC_IP:3000`
4. Click **"Start VR Session"**
5. Grant controller permissions when prompted

### 5. Configure Your Emulator

#### Dolphin:
1. Go to **Controllers** → **Alternate Input Sources**
2. Check **Enable** under DSU Client
3. Set Server Address: `127.0.0.1`, Port: `26760`
4. Click **Add**

#### Yuzu/Ryujinx:
1. Go to **Controller Settings**
2. Set controller type with **Motion** enabled
3. Enable **Cemuhook compatible motion**
4. Enter DSU address: `127.0.0.1:26760`
5. Set `1` for Controller Slot, `2` for Right Slot (separate mode)

> To stop using the app, just close the browser tab or click Stop.

## 🎯 Controller Mapping

### Combined Mode (Default)
| Quest Input | DSU Output |
|-------------|------------|
| Left Thumbstick | Left Stick |
| Right Thumbstick | Right Stick |
| Left Controller Motion | Accelerometer/Gyroscope |
| A (Right) / X (Left) | A / X |
| B (Right) / Y (Left) | B / Y |
| Triggers | L2 / R2 |
| Grips | L1 / R1 |

### Separate Mode
- Left Controller → DSU Slot 0
- Right Controller → DSU Slot 1

## 🔧 Troubleshooting

- **"WebXR Not Supported"**: Use Meta Quest Browser or Chromium
- **"Server Disconnected"**: Check PC IP and that both devices are on the same network
- **No motion in emulator**: Click "Add" in DSU settings, restart VR session

## 📁 Project Structure

```
VRtoDSU/
├── host/
│   ├── package.json
│   └── server.js      # Node.js server (DSU + WebSocket + HTTP)
├── web/
│   ├── index.html     # Frontend UI
│   └── app.js         # WebXR controller capture
└── README.md
```

## Credits
https://github.com/v1993/cemuhook-protocol - Info about CemuHook Protocol
https://immersive-web.github.io/ - WebXR