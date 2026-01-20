const WebSocket = require('ws');
const os = require('os');

const WS_PORT = 26759;
const DSU_PORT = 26760;

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

    ws.on('config', (message) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Config:`, message.toString());
    });

    ws.on('control', (message) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Control:`, message.toString());
    });

    ws.on('close', (code, reason) => {
        console.log(`[DISCONNECTED] Client disconnected. Code: ${code}, Reason: ${reason || 'None'}`);
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
    if (!getAll && nets.Ethernet[1].address) 
        return ["localhost", "127.0.0.1", nets.Ethernet[1].address];
    
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            ips.push(net.address);
        }
    }
    return ips;
}