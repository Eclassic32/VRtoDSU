const WebSocket = require('ws');
const dgram = require('dgram');
const os = require('os');

const WS_PORT = 26759;
const DSU_PORT = 26760;

// DSU Protocol Constants
const DSU_MAGIC_SERVER = 'DSUS';
const DSU_MAGIC_CLIENT = 'DSUC';
const DSU_PROTOCOL_VERSION = 1001;

// Message Types
const MSG_TYPE_VERSION = 0x100000;
const MSG_TYPE_PORTS = 0x100001;
const MSG_TYPE_DATA = 0x100002;

// Server ID (random on startup)
const SERVER_ID = Math.floor(Math.random() * 0xFFFFFFFF);

// Store registered DSU clients (address:port -> { slots, lastSeen })
const dsuClients = new Map();
const CLIENT_TIMEOUT = 5000; // 5 seconds

// Latest controller data from WebSocket
let latestControllerData = null;

// ============== CRC32 Implementation ==============
const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
        }
        table[i] = crc;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
        crc = crc32Table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============== DSU Packet Building ==============

function buildDsuHeader(messageType, payloadLength) {
    const header = Buffer.alloc(20);
    
    // Magic string "DSUS" (4 bytes)
    header.write(DSU_MAGIC_SERVER, 0, 4, 'ascii');
    
    // Protocol version (2 bytes, little-endian)
    header.writeUInt16LE(DSU_PROTOCOL_VERSION, 4);
    
    // Payload length (2 bytes, little-endian) - length after header
    header.writeUInt16LE(payloadLength + 4, 6); // +4 for message type
    
    // CRC32 placeholder (4 bytes) - will be filled later
    header.writeUInt32LE(0, 8);
    
    // Server ID (4 bytes, little-endian)
    header.writeUInt32LE(SERVER_ID, 12);
    
    // Message type (4 bytes, little-endian)
    header.writeUInt32LE(messageType, 16);
    
    return header;
}

function finalizeDsuPacket(packet) {
    // Zero out CRC field before calculating
    packet.writeUInt32LE(0, 8);
    // Calculate and write CRC32
    const crcValue = crc32(packet);
    packet.writeUInt32LE(crcValue, 8);
    return packet;
}

function buildVersionResponse() {
    const header = buildDsuHeader(MSG_TYPE_VERSION, 2);
    const payload = Buffer.alloc(2);
    payload.writeUInt16LE(DSU_PROTOCOL_VERSION, 0);
    
    const packet = Buffer.concat([header, payload]);
    return finalizeDsuPacket(packet);
}

function buildPortsResponse(slot, isConnected = true) {
    const header = buildDsuHeader(MSG_TYPE_PORTS, 12);
    const payload = Buffer.alloc(12);
    
    // Shared beginning (11 bytes)
    payload.writeUInt8(slot, 0);                    // Slot number
    payload.writeUInt8(isConnected ? 2 : 0, 1);     // Slot state: 2 = connected
    payload.writeUInt8(2, 2);                       // Device model: 2 = full gyro
    payload.writeUInt8(0, 3);                       // Connection type: 0 = not applicable
    // MAC address (6 bytes) - use slot+1 as last byte
    payload.writeUInt8(0, 4);
    payload.writeUInt8(0, 5);
    payload.writeUInt8(0, 6);
    payload.writeUInt8(0, 7);
    payload.writeUInt8(0, 8);
    payload.writeUInt8(slot + 1, 9);
    payload.writeUInt8(0x04, 10);                   // Battery: High
    payload.writeUInt8(0, 11);                      // Terminator byte
    
    const packet = Buffer.concat([header, payload]);
    return finalizeDsuPacket(packet);
}

function buildControllerDataPacket(slot, packetData) {
    const header = buildDsuHeader(MSG_TYPE_DATA, 80);
    const payload = Buffer.from(packetData);
    
    const packet = Buffer.concat([header, payload]);
    return finalizeDsuPacket(packet);
}

// ============== DSU Message Parsing ==============

function parseDsuMessage(buffer, rinfo) {
    if (buffer.length < 20) return null;
    
    const magic = buffer.toString('ascii', 0, 4);
    if (magic !== DSU_MAGIC_CLIENT) return null;
    
    const version = buffer.readUInt16LE(4);
    const length = buffer.readUInt16LE(6);
    const clientId = buffer.readUInt32LE(12);
    const messageType = buffer.readUInt32LE(16);
    
    return {
        magic,
        version,
        length,
        clientId,
        messageType,
        payload: buffer.slice(20)
    };
}

// ============== DSU UDP Server ==============

const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
    const parsed = parseDsuMessage(msg, rinfo);
    if (!parsed) return;
    
    const clientKey = `${rinfo.address}:${rinfo.port}`;
    
    switch (parsed.messageType) {
        case MSG_TYPE_VERSION:
            // Send version response
            const versionResp = buildVersionResponse();
            udpServer.send(versionResp, rinfo.port, rinfo.address);
            break;
            
        case MSG_TYPE_PORTS:
            // Parse requested ports
            if (parsed.payload.length >= 4) {
                const numPorts = parsed.payload.readInt32LE(0);
                for (let i = 0; i < Math.min(numPorts, 4); i++) {
                    if (parsed.payload.length > 4 + i) {
                        const slot = parsed.payload.readUInt8(4 + i);
                        if (slot < 3) { // We have 3 slots (0, 1, 2)
                            const portsResp = buildPortsResponse(slot, true);
                            udpServer.send(portsResp, rinfo.port, rinfo.address);
                        }
                    }
                }
            }
            break;
            
        case MSG_TYPE_DATA:
            // Register client for data streaming
            const flags = parsed.payload.length > 0 ? parsed.payload.readUInt8(0) : 0;
            let slots = [];
            
            if (flags === 0) {
                // Subscribe to all controllers
                slots = [0, 1, 2];
            } else if (flags & 1) {
                // Slot-based registration
                const slot = parsed.payload.length > 1 ? parsed.payload.readUInt8(1) : 0;
                if (slot < 3) slots = [slot];
            }
            
            dsuClients.set(clientKey, {
                address: rinfo.address,
                port: rinfo.port,
                slots,
                lastSeen: Date.now()
            });
            
            // Immediately send current data if available
            if (latestControllerData) {
                sendControllerDataToClient(clientKey);
            }
            break;
    }
});

udpServer.on('error', (err) => {
    console.error('[DSU ERROR]', err.message);
});

udpServer.bind(DSU_PORT, () => {
    console.log(`[DSU] UDP server listening on port ${DSU_PORT}`);
});

// ============== Send Controller Data to DSU Clients ==============

function sendControllerDataToClient(clientKey) {
    const client = dsuClients.get(clientKey);
    if (!client || !latestControllerData) return;
    
    for (const controller of latestControllerData.controllers) {
        if (client.slots.includes(controller.slot)) {
            const packet = buildControllerDataPacket(controller.slot, controller.packet);
            udpServer.send(packet, client.port, client.address);
        }
    }
}

function broadcastControllerData() {
    const now = Date.now();
    
    // Clean up timed-out clients and send data to active ones
    for (const [clientKey, client] of dsuClients.entries()) {
        if (now - client.lastSeen > CLIENT_TIMEOUT) {
            dsuClients.delete(clientKey);
            continue;
        }
        sendControllerDataToClient(clientKey);
    }
}

// ============== WebSocket Server ==============

const possibleIPs = Array.from(new Set(getLocalIPs(false)));
const possibleWsUrls = possibleIPs.map(ip => `ws://${ip}:${WS_PORT}`);

const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`--------------------------------`);
console.log(`| Websocket IPs:`);
possibleWsUrls.forEach(url => console.log(`|   ${url}`));
console.log(`--------------------------------`);
console.log(`| DSU IPs:`);
possibleIPs.forEach(ip => console.log(`|   ${ip}:${DSU_PORT}`));
console.log(`--------------------------------`);

wss.on('connection', (ws, req) => {
    const clientAddress = req.socket.remoteAddress;
    console.log(`\n[CONNECTED] Client connected from ${clientAddress}`);

    ws.on('message', (message) => {
        const timestamp = new Date().toISOString();
        message = JSON.parse(message);
        
        if (message.type === 'config') {
            console.log(`[${timestamp}] Config:`, message.data.meta.name);
        } else if (message.type === 'control') {
            const controlData = message.data;
            
            // Check if this is DSU controller data
            if (controlData && controlData.type === 'dsu_controller_data') {
                latestControllerData = controlData;
                broadcastControllerData();
            }
        } else {
            console.log(`[${timestamp}] Unknown message type:`, message.toString());
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[DISCONNECTED] Client disconnected. Code: ${code} 
                        ${(code != 1000) ? `Reason: ${reason || 'None'}` : ''}`);
    });

    ws.on('error', (error) => {
        console.error('[ERROR]', error.message);
    });
});

wss.on('error', (error) => {
    console.error('[SERVER ERROR]', error.message);
});

console.log('Waiting for connections...\n');

function getLocalIPs(getAll = false) {
    const nets = os.networkInterfaces();
    if (!getAll && nets.Ethernet && nets.Ethernet[1] && nets.Ethernet[1].address) 
        return ["localhost", "127.0.0.1", nets.Ethernet[1].address];
    
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            ips.push(net.address);
        }
    }
    return ips;
}