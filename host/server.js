import dgram from 'dgram';
import { WebSocketServer } from 'ws';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import forge from 'node-forge';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ Configuration ============
const DSU_PORT = 26760;
const WS_PORT = 8080;
const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;
const SERVER_ID = Math.floor(Math.random() * 0xFFFFFFFF);
const VIGEM_ENABLED = true; // Set to false to disable virtual controller

// Default client to always send data to (Dolphin's default DSU port)
const DEFAULT_DSU_CLIENT = {
    address: '127.0.0.1',
    port: 26760  // We send back to the same port we listen on
};

// ============ DSU Protocol Constants ============
const PROTOCOL_VERSION = 1001;
const MSG_TYPE_VERSION = 0x100000;
const MSG_TYPE_PORTS = 0x100001;
const MSG_TYPE_DATA = 0x100002;

// ============ Controller State ============
// Support up to 4 controllers (slots 0-3)
const controllers = [
    createControllerState(0),
    createControllerState(1),
    createControllerState(2),
    createControllerState(3)
];

function createControllerState(slot) {
    return {
        slot,
        connected: false,
        packetNumber: 0,
        mac: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, slot]),
        // Motion data
        accelX: 0, accelY: 0, accelZ: 0,
        gyroX: 0, gyroY: 0, gyroZ: 0,
        // Buttons and sticks
        buttons1: 0, buttons2: 0,
        leftStickX: 128, leftStickY: 128,
        rightStickX: 128, rightStickY: 128,
        // Analog buttons
        analogL1: 0, analogR1: 0, analogL2: 0, analogR2: 0,
        analogA: 0, analogB: 0, analogX: 0, analogY: 0,
        // Touch
        touch1Active: 0, touch1Id: 0, touch1X: 0, touch1Y: 0,
        touch2Active: 0, touch2Id: 0, touch2X: 0, touch2Y: 0,
        // Timestamps
        timestamp: BigInt(0),
        lastUpdate: Date.now()
    };
}

// Track the DSU client address (set when we receive any message from them)
let dsuClientAddress = null;
let dsuClientPort = null;

// ============ ViGEm Virtual Controller ============
let vigemProcess = null;
let vigemReady = false;

function startVigemFeeder() {
    if (!VIGEM_ENABLED) return;
    
    const feederPath = path.join(__dirname, 'vigem-feeder', 'bin', 'Release', 'net8.0', 'vigem-feeder.exe');
    
    if (!fs.existsSync(feederPath)) {
        console.log('⚠️ ViGEm feeder not found. Virtual controller disabled.');
        console.log('   Build with: cd vigem-feeder && dotnet build -c Release');
        return;
    }
    
    console.log('🎮 Starting ViGEm virtual controller...');
    
    vigemProcess = spawn(feederPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
    });
    
    let stdoutBuffer = '';
    
    vigemProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
            const msg = line.trim();
            if (msg === 'READY') {
                vigemReady = true;
                console.log('✅ Virtual Xbox 360 controller connected!');
            } else if (msg.startsWith('ERROR:')) {
                console.error('❌ ViGEm error:', msg.substring(6));
            }
        }
    });
    
    vigemProcess.stderr.on('data', (data) => {
        console.log('🎮 ViGEm:', data.toString().trim());
    });
    
    vigemProcess.on('close', (code) => {
        console.log(`🎮 ViGEm feeder exited with code ${code}`);
        vigemReady = false;
        vigemProcess = null;
    });
    
    vigemProcess.on('error', (err) => {
        console.error('❌ Failed to start ViGEm feeder:', err.message);
        vigemReady = false;
        vigemProcess = null;
    });
}

function sendToVigem(controllerData) {
    if (!vigemReady || !vigemProcess) return;
    
    try {
        const input = {
            buttons1: controllerData.buttons1 || 0,
            buttons2: controllerData.buttons2 || 0,
            leftStickX: controllerData.leftStickX || 128,
            leftStickY: controllerData.leftStickY || 128,
            rightStickX: controllerData.rightStickX || 128,
            rightStickY: controllerData.rightStickY || 128,
            leftTrigger: controllerData.analogL2 || 0,
            rightTrigger: controllerData.analogR2 || 0
        };
        
        vigemProcess.stdin.write(JSON.stringify(input) + '\n');
    } catch (err) {
        console.error('Failed to send to ViGEm:', err.message);
    }
}

function stopVigemFeeder() {
    if (vigemProcess) {
        vigemProcess.stdin.write('QUIT\n');
        vigemProcess = null;
        vigemReady = false;
    }
}

// ============ CRC32 Implementation ============
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c >>> 0;
}

function crc32(buffer) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
        crc = crc32Table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============ Packet Building ============
function buildHeader(messageType, payloadLength) {
    const header = Buffer.alloc(20);
    header.write('DSUS', 0);
    header.writeUInt16LE(PROTOCOL_VERSION, 4);
    header.writeUInt16LE(payloadLength + 4, 6); // +4 for message type
    // CRC32 at offset 8 (filled later)
    header.writeUInt32LE(SERVER_ID, 12);
    header.writeUInt32LE(messageType, 16);
    return header;
}

function finalizeCRC(packet) {
    // Zero out CRC field first
    packet.writeUInt32LE(0, 8);
    const calculatedCRC = crc32(packet);
    packet.writeUInt32LE(calculatedCRC, 8);
    return packet;
}

function buildVersionResponse() {
    const header = buildHeader(MSG_TYPE_VERSION, 2);
    const payload = Buffer.alloc(2);
    payload.writeUInt16LE(PROTOCOL_VERSION, 0);
    const packet = Buffer.concat([header, payload]);
    return finalizeCRC(packet);
}

function buildControllerInfoResponse(slot) {
    const controller = controllers[slot];
    const header = buildHeader(MSG_TYPE_PORTS, 12);
    const payload = Buffer.alloc(12);
    
    payload.writeUInt8(slot, 0);
    payload.writeUInt8(controller.connected ? 2 : 0, 1); // 0=not connected, 2=connected
    payload.writeUInt8(2, 2); // Full gyro
    payload.writeUInt8(0, 3); // Connection type N/A
    controller.mac.copy(payload, 4);
    payload.writeUInt8(controller.connected ? 0x05 : 0x00, 10); // Battery full or N/A
    payload.writeUInt8(0, 11); // Terminator
    
    const packet = Buffer.concat([header, payload]);
    return finalizeCRC(packet);
}

function buildControllerDataPacket(slot) {
    const controller = controllers[slot];
    if (!controller.connected) return null;
    
    const header = buildHeader(MSG_TYPE_DATA, 80);
    const payload = Buffer.alloc(80);
    let offset = 0;
    
    // Shared beginning (11 bytes)
    payload.writeUInt8(slot, offset++);
    payload.writeUInt8(2, offset++); // Connected
    payload.writeUInt8(2, offset++); // Full gyro
    payload.writeUInt8(0, offset++); // Connection type
    controller.mac.copy(payload, offset); offset += 6;
    payload.writeUInt8(0x05, offset++); // Battery full
    
    // Controller connected (1 byte)
    payload.writeUInt8(1, offset++);
    
    // Packet number (4 bytes)
    payload.writeUInt32LE(controller.packetNumber++, offset); offset += 4;
    
    // Buttons (2 bytes)
    const btn1 = controller.buttons1 || 0;
    const btn2 = controller.buttons2 || 0;
    payload.writeUInt8(btn1, offset++);
    payload.writeUInt8(btn2, offset++);
    

    
    // Home & Touch buttons (2 bytes)
    payload.writeUInt8(0, offset++);
    payload.writeUInt8(0, offset++);
    
    // Sticks (4 bytes)
    payload.writeUInt8(controller.leftStickX, offset++);
    payload.writeUInt8(controller.leftStickY, offset++);
    payload.writeUInt8(controller.rightStickX, offset++);
    payload.writeUInt8(controller.rightStickY, offset++);
    
    // Analog D-pad (4 bytes) - not used
    payload.writeUInt8(0, offset++); // D-Pad Left
    payload.writeUInt8(0, offset++); // D-Pad Down
    payload.writeUInt8(0, offset++); // D-Pad Right
    payload.writeUInt8(0, offset++); // D-Pad Up
    
    // Analog face buttons (4 bytes) - derive from digital buttons
    // Corrected mapping based on testing:
    // btn2: Y(7), B(6), A(5), X(4) - correct bit positions
    // Analog order: Y, B, A, X (offsets 28, 29, 30, 31)
    const analogY = (btn2 & 0x80) ? 255 : 0; // Y is bit 7 (Triangle)
    const analogB = (btn2 & 0x40) ? 255 : 0; // B is bit 6 (Circle)
    const analogA = (btn2 & 0x20) ? 255 : 0; // A is bit 5 (Cross)
    const analogX = (btn2 & 0x10) ? 255 : 0; // X is bit 4 (Square)
    payload.writeUInt8(analogY, offset++); // Y (Triangle)
    payload.writeUInt8(analogB, offset++); // B (Circle)
    payload.writeUInt8(analogA, offset++); // A (Cross)
    payload.writeUInt8(analogX, offset++); // X (Square)
    

    
    // Analog triggers (4 bytes)
    payload.writeUInt8(controller.analogR1 || 0, offset++); // R1
    payload.writeUInt8(controller.analogL1 || 0, offset++); // L1
    payload.writeUInt8(controller.analogR2 || 0, offset++); // R2
    payload.writeUInt8(controller.analogL2 || 0, offset++); // L2
    
    // Touch 1 (6 bytes)
    payload.writeUInt8(controller.touch1Active, offset++);
    payload.writeUInt8(controller.touch1Id, offset++);
    payload.writeUInt16LE(controller.touch1X, offset); offset += 2;
    payload.writeUInt16LE(controller.touch1Y, offset); offset += 2;
    
    // Touch 2 (6 bytes)
    payload.writeUInt8(controller.touch2Active, offset++);
    payload.writeUInt8(controller.touch2Id, offset++);
    payload.writeUInt16LE(controller.touch2X, offset); offset += 2;
    payload.writeUInt16LE(controller.touch2Y, offset); offset += 2;
    
    // Timestamp (8 bytes)
    const now = BigInt(Date.now()) * BigInt(1000);
    payload.writeBigUInt64LE(now, offset); offset += 8;
    
    // Accelerometer (12 bytes) - in g's
    payload.writeFloatLE(controller.accelX, offset); offset += 4;
    payload.writeFloatLE(controller.accelY, offset); offset += 4;
    payload.writeFloatLE(controller.accelZ, offset); offset += 4;
    
    // Gyroscope (12 bytes) - in deg/s
    payload.writeFloatLE(controller.gyroX, offset); offset += 4;
    payload.writeFloatLE(controller.gyroY, offset); offset += 4;
    payload.writeFloatLE(controller.gyroZ, offset); offset += 4;
    
    const packet = Buffer.concat([header, payload]);
    return finalizeCRC(packet);
}

// ============ UDP Server (DSU) ============
const udpServer = dgram.createSocket('udp4');

udpServer.on('error', (err) => {
    console.error(`UDP Server error:\n${err.stack}`);
    udpServer.close();
});

udpServer.on('message', (msg, rinfo) => {
    if (msg.length < 20) return;
    
    const magic = msg.toString('ascii', 0, 4);
    if (magic !== 'DSUC') return;
    
    const msgType = msg.readUInt32LE(16);
    
    // Remember the client address - we'll always send data to them
    // Only log on first contact, silently update port changes
    const isNewAddress = !dsuClientAddress || dsuClientAddress !== rinfo.address;
    dsuClientAddress = rinfo.address;
    dsuClientPort = rinfo.port;
    if (isNewAddress) {
        console.log(`📨 DSU client connected: ${rinfo.address}`);
    }
    
    // Respond to protocol messages (but no need to track subscriptions anymore)
    switch (msgType) {
        case MSG_TYPE_VERSION:
            const versionResp = buildVersionResponse();
            udpServer.send(versionResp, rinfo.port, rinfo.address);
            break;
            
        case MSG_TYPE_PORTS:
            const numPorts = msg.readInt32LE(20);
            for (let i = 0; i < Math.min(numPorts, 4); i++) {
                const slot = msg.readUInt8(24 + i);
                if (slot < 4) {
                    const resp = buildControllerInfoResponse(slot);
                    udpServer.send(resp, rinfo.port, rinfo.address);
                }
            }
            break;
            
        case MSG_TYPE_DATA:
            // Client is requesting data - send an immediate burst to the new port
            // This ensures no gap when client switches ports
            for (let slot = 0; slot < 4; slot++) {
                const controller = controllers[slot];
                if (controller.connected) {
                    const packet = buildControllerDataPacket(slot);
                    if (packet) {
                        udpServer.send(packet, rinfo.port, rinfo.address);
                    }
                }
            }
            break;
    }
});

udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`🎮 DSU Server listening on ${address.address}:${address.port}`);
});

udpServer.bind(DSU_PORT);

// ============ Data Streaming Loop ============
setInterval(() => {
    // If we have a known DSU client, always send data (no subscription required)
    if (dsuClientAddress && dsuClientPort) {
        for (let slot = 0; slot < 4; slot++) {
            const controller = controllers[slot];
            if (controller.connected) {
                const packet = buildControllerDataPacket(slot);
                if (packet) {
                    udpServer.send(packet, dsuClientPort, dsuClientAddress);
                }
            }
        }
    }
}, 4); // ~250Hz update rate

// ============ Generate Self-Signed Certificate using node-forge ============
console.log('🔐 Generating self-signed certificate...');

function generateCertificate() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(16));
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    const attrs = [
        { name: 'commonName', value: '192.168.0.19' },
        { name: 'countryName', value: 'US' },
        { name: 'organizationName', value: 'VRtoDSU' }
    ];
    
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    
    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { 
            name: 'keyUsage', 
            digitalSignature: true, 
            keyEncipherment: true
        },
        { 
            name: 'extKeyUsage', 
            serverAuth: true 
        },
        {
            name: 'subjectAltName',
            altNames: [
                { type: 2, value: 'localhost' },
                { type: 7, ip: '127.0.0.1' },
                { type: 7, ip: '192.168.0.19' }
            ]
        }
    ]);
    
    // Sign with SHA-256
    cert.sign(keys.privateKey, forge.md.sha256.create());
    
    return {
        private: forge.pki.privateKeyToPem(keys.privateKey),
        cert: forge.pki.certificateToPem(cert)
    };
}

const pems = generateCertificate();
console.log('✅ Certificate generated successfully');

// ============ Request Handler ============
function handleRequest(req, res) {
    // Add CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    let filePath = path.join(__dirname, '..', 'web', req.url === '/' ? 'index.html' : req.url);
    
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.ico': 'image/x-icon'
    };
    
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

// ============ HTTP Server ============
const httpServer = http.createServer(handleRequest);

// ============ HTTPS Server ============
const httpsServer = https.createServer({
    key: pems.private,
    cert: pems.cert
}, handleRequest);

// ============ WebSocket Servers ============
const wss = new WebSocketServer({ server: httpServer });
const wssSecure = new WebSocketServer({ server: httpsServer });

function handleWebSocket(ws) {
    console.log('📱 WebXR client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'controller_connect':
                    const slot = data.slot || 0;
                    if (slot < 4) {
                        controllers[slot].connected = true;
                        controllers[slot].lastUpdate = Date.now();
                        console.log(`🎮 Controller ${slot} connected`);
                    }
                    break;
                    
                case 'controller_disconnect':
                    const dSlot = data.slot || 0;
                    if (dSlot < 4) {
                        controllers[dSlot].connected = false;
                        console.log(`🎮 Controller ${dSlot} disconnected`);
                    }
                    break;
                    
                case 'controller_data':
                    const cSlot = data.slot || 0;
                    if (cSlot < 4) {
                        // Mark as connected when receiving data
                        if (!controllers[cSlot].connected) {
                            controllers[cSlot].connected = true;
                            console.log(`🎮 Controller ${cSlot} now connected (from data)`);
                        }
                        const ctrl = controllers[cSlot];
                        ctrl.lastUpdate = Date.now();
                        

                        
                        // Motion data (convert to DSU coordinate system)
                        if (data.accel) {
                            ctrl.accelX = data.accel.x || 0;
                            ctrl.accelY = data.accel.y || 0;
                            ctrl.accelZ = data.accel.z || 0;
                        }
                        if (data.gyro) {
                            // Convert rad/s to deg/s
                            ctrl.gyroX = (data.gyro.x || 0) * (180 / Math.PI);
                            ctrl.gyroY = (data.gyro.y || 0) * (180 / Math.PI);
                            ctrl.gyroZ = (data.gyro.z || 0) * (180 / Math.PI);
                        }
                        
                        // Buttons (always update from data)
                        ctrl.buttons1 = data.buttons1 || 0;
                        ctrl.buttons2 = data.buttons2 || 0;
                        
                        // Analog triggers/grips
                        if (data.trigger !== undefined) {
                            ctrl.analogL2 = cSlot === 0 ? Math.round(data.trigger * 255) : 0;
                            ctrl.analogR2 = cSlot === 1 ? Math.round(data.trigger * 255) : 0;
                        }
                        if (data.grip !== undefined) {
                            ctrl.analogL1 = cSlot === 0 ? Math.round(data.grip * 255) : 0;
                            ctrl.analogR1 = cSlot === 1 ? Math.round(data.grip * 255) : 0;
                        }
                        
                        // Sticks (0-255, 128 = center)
                        if (data.thumbstick) {
                            if (cSlot === 0) { // Left controller = left stick
                                ctrl.leftStickX = Math.round((data.thumbstick.x + 1) * 127.5);
                                ctrl.leftStickY = Math.round((data.thumbstick.y + 1) * 127.5);
                            } else { // Right controller = right stick
                                ctrl.rightStickX = Math.round((data.thumbstick.x + 1) * 127.5);
                                ctrl.rightStickY = Math.round((data.thumbstick.y + 1) * 127.5);
                            }
                        }
                        
                        // Send to virtual controller (combine both slots)
                        sendToVigem({
                            buttons1: controllers[0].buttons1 | controllers[1].buttons1,
                            buttons2: controllers[0].buttons2 | controllers[1].buttons2,
                            leftStickX: controllers[0].leftStickX,
                            leftStickY: controllers[0].leftStickY,
                            rightStickX: controllers[1].rightStickX,
                            rightStickY: controllers[1].rightStickY,
                            analogL2: controllers[0].analogL2,
                            analogR2: controllers[1].analogR2
                        });
                    }
                    break;
                    
                case 'combined_controller':
                    // Combined mode: both controllers mapped to slot 0
                    controllers[0].connected = true;
                    controllers[0].lastUpdate = Date.now();
                    const c = controllers[0];
                    
                    if (data.left) {
                        if (data.left.accel) {
                            c.accelX = data.left.accel.x || 0;
                            c.accelY = data.left.accel.y || 0;
                            c.accelZ = data.left.accel.z || 0;
                        }
                        if (data.left.gyro) {
                            c.gyroX = (data.left.gyro.x || 0) * (180 / Math.PI);
                            c.gyroY = (data.left.gyro.y || 0) * (180 / Math.PI);
                            c.gyroZ = (data.left.gyro.z || 0) * (180 / Math.PI);
                        }
                        if (data.left.thumbstick) {
                            c.leftStickX = Math.round((data.left.thumbstick.x + 1) * 127.5);
                            c.leftStickY = Math.round((data.left.thumbstick.y + 1) * 127.5);
                        }
                    }
                    if (data.right) {
                        if (data.right.thumbstick) {
                            c.rightStickX = Math.round((data.right.thumbstick.x + 1) * 127.5);
                            c.rightStickY = Math.round((data.right.thumbstick.y + 1) * 127.5);
                        }
                    }
                    if (data.buttons1 !== undefined) c.buttons1 = data.buttons1;
                    if (data.buttons2 !== undefined) c.buttons2 = data.buttons2;
                    
                    // Send to virtual controller
                    sendToVigem(c);
                    break;
            }
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    });
    
    ws.on('close', () => {
        console.log('📱 WebXR client disconnected');
        // Optionally disconnect all controllers
        controllers.forEach(c => c.connected = false);
    });
}

wss.on('connection', handleWebSocket);
wssSecure.on('connection', handleWebSocket);

httpServer.listen(HTTP_PORT, () => {
    console.log(`🌐 HTTP Server running at http://localhost:${HTTP_PORT}`);
    console.log(`🔌 WebSocket (ws://) on same port`);
});

httpsServer.listen(HTTPS_PORT, () => {
    console.log(`🔒 HTTPS Server running at https://localhost:${HTTPS_PORT}`);
    console.log(`🔌 Secure WebSocket (wss://) on same port`);
    console.log('');
    console.log('📋 Instructions:');
    console.log('   For GitHub Pages (Quest Browser):');
    console.log(`   1. First visit https://YOUR_PC_IP:${HTTPS_PORT} and accept the certificate`);
    console.log(`   2. Then open GitHub Pages and enter YOUR_PC_IP:${HTTPS_PORT}`);
    console.log('');
    console.log(`   DSU client (Dolphin): localhost:${DSU_PORT}`);
    console.log('');
    
    // Start ViGEm virtual controller
    startVigemFeeder();
});

// Clean shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    stopVigemFeeder();
    process.exit(0);
});

process.on('SIGTERM', () => {
    stopVigemFeeder();
    process.exit(0);
});
