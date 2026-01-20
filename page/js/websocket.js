import { getControllerConfig } from './controllerConfig.js';

const hostStatusSpan = document.getElementById('host-status');
const hostIPInput = document.getElementById('host-ip');
const connectButton = document.getElementById('connect-button');

let ws = null;

function updateStatus(status, color = 'inherit') {
    if (hostStatusSpan) {
        hostStatusSpan.textContent = status;
        hostStatusSpan.style.color = color;
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
        updateStatus('No IP provided', 'red');
        return;
    }
    
    if (ws) {
        ws.close();
    }
    
    updateStatus('Connecting...', 'orange');
    
    ip = (ip.startsWith('ws://') || ip.startsWith('wss://')) ? ip : `ws://${ip}`;
    ws = new WebSocket(ip);

    ws.onopen = () => {
        updateStatus('Connected', 'green');
        sendControllerConfig();
    };

    ws.onclose = () => {
        updateStatus('Disconnected', 'red');
        ws = null;
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        updateStatus('Error', 'red');
    };

    ws.onmessage = (event) => {
        console.log('Message from server:', event.data);
    };
}

connectButton?.addEventListener('click', connect);
