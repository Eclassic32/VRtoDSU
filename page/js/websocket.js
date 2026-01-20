import { getControllerConfig } from './controllerConfig.js';

const hostStatusSpan = document.getElementById('host-status');
const hostIPInput = document.getElementById('host-ip');
const connectButton = document.getElementById('connect-button');

let ws = null;
export let isWSConnected = false;

console.log(connectButton);


function updateStatus(isConnected, status, color = 'inherit', btnText = null) {
    isWSConnected = isConnected;
    if (hostStatusSpan) {
        hostStatusSpan.textContent = status;
        hostStatusSpan.style.color = color;
    }
    if (connectButton && btnText) {
        connectButton.textContent = btnText;
    }
}

export function sendControllerConfig() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket not connected');
        return false;
    }
    const config = getControllerConfig();
    if (!config) {
        console.warn('No controller config available');
        return false;
    }
    console.log(JSON.stringify({ type: 'config', data: config }));
    
    ws.send(JSON.stringify({ type: 'config', data: config }));
    return true;
}

export function sendControlData(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket not connected');
        return false;
    }
    ws.send(JSON.stringify({ type: 'control', data }));
    return true;
}

function connect() {
    console.log("Connection Started");
    
    let ip = hostIPInput?.value?.trim();
    if (!ip) {
        updateStatus(false, 'No IP provided', 'red', 'Connect to Host');
        return;
    }
    
    if (ws) {
        ws.close();
    }
    
    updateStatus(false, 'Connecting...', 'orange', 'Connecting...');
    
    ip = (ip.startsWith('ws://') || ip.startsWith('wss://')) ? ip : `ws://${ip}`;
    ws = new WebSocket(ip);

    ws.onopen = () => {
        updateStatus(true, 'Connected', 'green', 'Disconnect');
        sendControllerConfig();
    };

    ws.onclose = () => {
        updateStatus(false, 'Disconnected', 'red', 'Connect to Host');
        ws = null;
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        updateStatus(false, 'Error', 'red', 'Connect to Host');
    };

    ws.onmessage = (event) => {
        const msg = event.data;
        if (msg.type == "rumble")
            console.log("Rumble: " + msg.data);
        else console.log('Message from server:', event.data);
    };
}

function disconnect() {
    if (ws) {
        ws.close(1000, 'Client disconnected');
    }
}


connectButton?.addEventListener('click', () => {
    if (isWSConnected) {
        disconnect();
    } else {
        connect();
    }
});