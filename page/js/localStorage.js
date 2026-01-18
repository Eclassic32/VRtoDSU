// Controller config localStorage key and defaults
const CONTROLLER_CONFIG_KEY = 'controllerConfig';
const CONTROLLER_CONFIG_NAME_KEY = 'controllerConfigName';
const DEFAULT_CONFIG_PATH = './page/assets/quest2.json';

let controllerConfig = null;
export function getControllerConfig() {
    if (!controllerConfig) {
        const item = localStorage.getItem(CONTROLLER_CONFIG_KEY);
        controllerConfig = item ? JSON.parse(item) : null;
    }
    return controllerConfig;
}

function updateConfigLabel(name) {
    const span = document.getElementById('controller-config-file');
    if (span) span.textContent = name;
}

async function loadDefaultConfigIfMissing() {
    if (!localStorage.getItem(CONTROLLER_CONFIG_KEY)) {
        try {
            const resp = await fetch(DEFAULT_CONFIG_PATH);
            if (!resp.ok) throw new Error('Network response was not ok');
            const json = await resp.json();
            localStorage.setItem(CONTROLLER_CONFIG_KEY, JSON.stringify(json));
            localStorage.setItem(CONTROLLER_CONFIG_NAME_KEY, json.meta?.name || 'quest2.json');
            updateConfigLabel(json.meta?.name || 'Example Quest 2 Controller Config');
        } catch (err) {
            console.error('Failed to load default controller config:', err);
        }
    } else {
        const name = localStorage.getItem(CONTROLLER_CONFIG_NAME_KEY) || 'Custom Controller Config';
        updateConfigLabel(name);
    }
}

function setupUploadHandler() {
    const btn = document.getElementById('upload-controller-config-button');
    const input = document.getElementById('upload-controller-config-file');
    if (!btn || !input) return;

    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            localStorage.setItem(CONTROLLER_CONFIG_KEY, JSON.stringify(data));
            localStorage.setItem(CONTROLLER_CONFIG_NAME_KEY, data.meta?.name || file.name);
            updateConfigLabel(data.meta?.name || file.name);
        } catch (err) {
            console.error('Invalid controller config file:', err);
            alert('Failed to load controller config: invalid JSON');
        } finally {
            input.value = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupUploadHandler();
    loadDefaultConfigIfMissing();
});