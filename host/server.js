const WebSocket = require('ws');

const PORT = 26759;

const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server listening on port ${PORT}`);

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
