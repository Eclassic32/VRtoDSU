// VR to DSU - WebXR Controller Bridge
// Captures Meta Quest controller motion data and sends to DSU server

class VRtoDSU {
    constructor() {
        this.ws = null;
        this.xrSession = null;
        this.xrRefSpace = null;
        this.mode = 'combined'; // 'combined' or 'separate'
        this.isRunning = false;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.serverAddress = null;
        
        // Controller state
        this.controllers = {
            left: { connected: false, position: null, orientation: null, gamepad: null },
            right: { connected: false, position: null, orientation: null, gamepad: null }
        };
        
        // Motion estimation (for devices without linear acceleration)
        this.velocityEstimator = {
            left: { lastPos: null, lastTime: 0, velocity: { x: 0, y: 0, z: 0 } },
            right: { lastPos: null, lastTime: 0, velocity: { x: 0, y: 0, z: 0 } }
        };
        
        this.init();
    }
    
    init() {
        // Check WebXR support
        if (!navigator.xr) {
            document.getElementById('notSupported').style.display = 'block';
            document.getElementById('startBtn').disabled = true;
            return;
        }
        
        // Check HTTPS (required for WebXR except localhost)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            document.getElementById('httpsWarning').style.display = 'block';
        }
        
        // Setup event listeners
        document.getElementById('startBtn').addEventListener('click', () => this.startVR());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopVR());
        
        // Mode selector
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.mode = e.target.dataset.mode;
            });
        });
        
        // Server connection button
        document.getElementById('connectBtn').addEventListener('click', () => this.manualConnect());
        
        // Load saved server address
        const savedIP = localStorage.getItem('vrtodsu_server_ip');
        const savedPort = localStorage.getItem('vrtodsu_server_port');
        if (savedIP) document.getElementById('serverIP').value = savedIP;
        if (savedPort) document.getElementById('serverPort').value = savedPort;
        
        // Auto-connect if we're on localhost (development mode)
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            this.serverAddress = `ws://${location.hostname}:${location.port || 3000}`;
            this.connectWebSocket();
        }
    }
    
    manualConnect() {
        const ip = document.getElementById('serverIP').value.trim();
        const port = document.getElementById('serverPort').value.trim() || '3443';
        
        if (!ip) {
            alert('Please enter your PC\'s IP address');
            return;
        }
        
        // Save for next time
        localStorage.setItem('vrtodsu_server_ip', ip);
        localStorage.setItem('vrtodsu_server_port', port);
        
        // Use wss:// for secure connection (required from HTTPS pages like GitHub Pages)
        const protocol = (location.protocol === 'https:') ? 'wss' : 'ws';
        this.serverAddress = `${protocol}://${ip}:${port}`;
        this.connectWebSocket();
    }
    
    connectWebSocket() {
        if (!this.serverAddress) {
            this.updateStatus('ws', false, 'Enter server IP');
            return;
        }
        
        try {
            this.ws = new WebSocket(this.serverAddress);
            
            this.ws.onopen = () => {
                this.updateStatus('ws', true, 'Connected');
                console.log('WebSocket connected to', this.serverAddress);
            };
            
            this.ws.onclose = () => {
                this.updateStatus('ws', false, 'Disconnected');
                console.log('WebSocket disconnected, reconnecting in 2s...');
                setTimeout(() => this.connectWebSocket(), 2000);
            };
            
            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                this.updateStatus('ws', false, 'Error - check IP');
            };
        } catch (e) {
            console.error('Failed to connect WebSocket:', e);
            this.updateStatus('ws', false, 'Connection failed');
            setTimeout(() => this.connectWebSocket(), 2000);
        }
    }
    
    updateStatus(type, connected, text) {
        const indicator = document.getElementById(`${type}Indicator`);
        const status = document.getElementById(`${type}Status`);
        
        indicator.className = `status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`;
        status.textContent = text;
    }
    
    async startVR() {
        try {
            // Check if immersive-vr is supported
            const supported = await navigator.xr.isSessionSupported('immersive-vr');
            if (!supported) {
                alert('Immersive VR not supported on this device');
                return;
            }
            
            // Request VR session with hand tracking if available
            this.xrSession = await navigator.xr.requestSession('immersive-vr', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['hand-tracking']
            });
            
            this.isRunning = true;
            document.getElementById('startBtn').style.display = 'none';
            document.getElementById('stopBtn').style.display = 'inline-block';
            this.updateStatus('xr', true, 'Active');
            
            // Setup WebGL context for XR
            const canvas = document.getElementById('vrView');
            canvas.style.display = 'block';
            const gl = canvas.getContext('webgl2', { xrCompatible: true }) || 
                       canvas.getContext('webgl', { xrCompatible: true });
            
            // Setup XR rendering
            await this.xrSession.updateRenderState({
                baseLayer: new XRWebGLLayer(this.xrSession, gl)
            });
            
            // Get reference space
            this.xrRefSpace = await this.xrSession.requestReferenceSpace('local-floor');
            
            // Handle session end
            this.xrSession.addEventListener('end', () => {
                this.isRunning = false;
                this.xrSession = null;
                document.getElementById('startBtn').style.display = 'inline-block';
                document.getElementById('stopBtn').style.display = 'none';
                document.getElementById('vrView').style.display = 'none';
                this.updateStatus('xr', false, 'Ended');
                this.updateStatus('ctrl', false, 'Not Detected');
                
                // Notify server controllers disconnected
                if (this.mode === 'separate') {
                    this.send({ type: 'controller_disconnect', slot: 0 });
                    this.send({ type: 'controller_disconnect', slot: 1 });
                } else {
                    this.send({ type: 'controller_disconnect', slot: 0 });
                }
            });
            
            // Start render loop
            this.xrSession.requestAnimationFrame((t, f) => this.onXRFrame(t, f));
            
        } catch (e) {
            console.error('Failed to start VR:', e);
            alert('Failed to start VR session: ' + e.message);
        }
    }
    
    stopVR() {
        if (this.xrSession) {
            this.xrSession.end();
        }
    }
    
    onXRFrame(time, frame) {
        if (!this.isRunning || !this.xrSession) return;
        
        // Schedule next frame
        this.xrSession.requestAnimationFrame((t, f) => this.onXRFrame(t, f));
        
        // Get input sources (controllers)
        const inputSources = this.xrSession.inputSources;
        
        let leftController = null;
        let rightController = null;
        
        for (const source of inputSources) {
            if (source.handedness === 'left') {
                leftController = source;
            } else if (source.handedness === 'right') {
                rightController = source;
            }
        }
        
        // Process controllers
        const leftData = this.processController(frame, leftController, 'left', time);
        const rightData = this.processController(frame, rightController, 'right', time);
        
        // Update UI
        this.updateControllerUI(leftData, rightData);
        
        // Update controller status
        const controllersConnected = leftData || rightData;
        if (controllersConnected) {
            const count = (leftData ? 1 : 0) + (rightData ? 1 : 0);
            this.updateStatus('ctrl', true, `${count} Controller${count > 1 ? 's' : ''}`);
        } else {
            this.updateStatus('ctrl', false, 'Not Detected');
        }
        
        // Send data to server
        if (this.mode === 'combined' && (leftData || rightData)) {
            this.send({
                type: 'combined_controller',
                left: leftData,
                right: rightData,
                buttons1: this.getButtons1(leftData, rightData),
                buttons2: this.getButtons2(leftData, rightData)
            });
        } else {
            if (leftData) {
                this.send({
                    type: 'controller_data',
                    slot: 0,
                    ...leftData,
                    buttons1: this.getButtons1(leftData, null),
                    buttons2: this.getButtons2(leftData, null)
                });
            }
            if (rightData) {
                this.send({
                    type: 'controller_data',
                    slot: 1,
                    ...rightData,
                    buttons1: this.getButtons1(null, rightData),
                    buttons2: this.getButtons2(null, rightData)
                });
            }
        }
        
        this.frameCount++;
    }
    
    processController(frame, source, hand, time) {
        if (!source || !source.gripSpace) return null;
        
        const pose = frame.getPose(source.gripSpace, this.xrRefSpace);
        if (!pose) return null;
        
        const position = pose.transform.position;
        const orientation = pose.transform.orientation;
        
        // Estimate acceleration from position changes
        const estimator = this.velocityEstimator[hand];
        let accel = { x: 0, y: 0, z: 0 };
        
        if (estimator.lastPos && estimator.lastTime) {
            const dt = (time - estimator.lastTime) / 1000; // seconds
            if (dt > 0 && dt < 0.1) { // Reasonable delta time
                // Calculate velocity
                const newVel = {
                    x: (position.x - estimator.lastPos.x) / dt,
                    y: (position.y - estimator.lastPos.y) / dt,
                    z: (position.z - estimator.lastPos.z) / dt
                };
                
                // Calculate acceleration (velocity change)
                accel = {
                    x: (newVel.x - estimator.velocity.x) / dt,
                    y: (newVel.y - estimator.velocity.y) / dt + 9.8, // Add gravity
                    z: (newVel.z - estimator.velocity.z) / dt
                };
                
                // Clamp to reasonable values and convert to g's
                accel.x = Math.max(-16, Math.min(16, accel.x / 9.8));
                accel.y = Math.max(-16, Math.min(16, accel.y / 9.8));
                accel.z = Math.max(-16, Math.min(16, accel.z / 9.8));
                
                estimator.velocity = newVel;
            }
        }
        
        estimator.lastPos = { x: position.x, y: position.y, z: position.z };
        estimator.lastTime = time;
        
        // Extract angular velocity from quaternion changes
        // Note: WebXR doesn't directly provide angular velocity, so we estimate
        const gyro = this.estimateAngularVelocity(hand, orientation, time);
        
        // Get gamepad data
        let thumbstick = { x: 0, y: 0 };
        let trigger = 0;
        let grip = 0;
        let buttons = [];
        
        if (source.gamepad) {
            const gp = source.gamepad;
            
            // Meta Quest controller layout:
            // axes[0] = thumbstick X, axes[1] = thumbstick Y
            // buttons[0] = trigger, buttons[1] = grip
            // buttons[3] = thumbstick press, buttons[4] = X/A, buttons[5] = Y/B
            
            if (gp.axes.length >= 2) {
                thumbstick.x = gp.axes[2] || gp.axes[0] || 0;
                thumbstick.y = -(gp.axes[3] || gp.axes[1] || 0); // Invert Y
            }
            
            if (gp.buttons.length > 0) {
                trigger = gp.buttons[0]?.value || 0;
                grip = gp.buttons[1]?.value || 0;
                buttons = gp.buttons.map(b => ({ pressed: b.pressed, value: b.value }));
            }
        }
        
        return {
            position: { x: position.x, y: position.y, z: position.z },
            orientation: { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w },
            accel,
            gyro,
            thumbstick,
            trigger,
            grip,
            buttons
        };
    }
    
    // Store last orientations for angular velocity estimation
    lastOrientations = { left: null, right: null };
    lastOrientationTimes = { left: 0, right: 0 };
    
    estimateAngularVelocity(hand, orientation, time) {
        const lastQ = this.lastOrientations[hand];
        const lastT = this.lastOrientationTimes[hand];
        
        this.lastOrientations[hand] = { ...orientation };
        this.lastOrientationTimes[hand] = time;
        
        if (!lastQ || !lastT) return { x: 0, y: 0, z: 0 };
        
        const dt = (time - lastT) / 1000;
        if (dt <= 0 || dt > 0.1) return { x: 0, y: 0, z: 0 };
        
        // Simplified angular velocity estimation from quaternion difference
        // This is an approximation - proper implementation would use quaternion derivatives
        const dq = {
            x: (orientation.x - lastQ.x) / dt,
            y: (orientation.y - lastQ.y) / dt,
            z: (orientation.z - lastQ.z) / dt,
            w: (orientation.w - lastQ.w) / dt
        };
        
        // Convert to angular velocity (rad/s)
        // ω = 2 * dq * q^-1 (simplified)
        const gyro = {
            x: 2 * dq.x * Math.sign(orientation.w),
            y: 2 * dq.y * Math.sign(orientation.w),
            z: 2 * dq.z * Math.sign(orientation.w)
        };
        
        return gyro;
    }
    
    getButtons1(left, right) {
        // D-Pad Left, D-Pad Down, D-Pad Right, D-Pad Up, Options, R3, L3, Share
        let buttons = 0;
        
        // Map thumbstick press to L3/R3
        if (left?.buttons?.[3]?.pressed) buttons |= 0x02; // L3
        if (right?.buttons?.[3]?.pressed) buttons |= 0x04; // R3
        
        return buttons;
    }
    
    getButtons2(left, right) {
        // Y, B, A, X, R1, L1, R2, L2
        let buttons = 0;
        
        // Map Quest buttons
        // Left: X (button 4), Y (button 5)
        // Right: A (button 4), B (button 5)
        
        if (left?.buttons?.[4]?.pressed) buttons |= 0x10; // X
        if (left?.buttons?.[5]?.pressed) buttons |= 0x80; // Y
        if (right?.buttons?.[4]?.pressed) buttons |= 0x20; // A
        if (right?.buttons?.[5]?.pressed) buttons |= 0x40; // B
        
        // Triggers and grips
        if (left?.trigger > 0.5) buttons |= 0x01; // L2
        if (right?.trigger > 0.5) buttons |= 0x02; // R2
        if (left?.grip > 0.5) buttons |= 0x04; // L1
        if (right?.grip > 0.5) buttons |= 0x08; // R1
        
        return buttons;
    }
    
    updateControllerUI(left, right) {
        const leftEl = document.getElementById('leftData');
        const rightEl = document.getElementById('rightData');
        const accelEl = document.getElementById('accelData');
        const gyroEl = document.getElementById('gyroData');
        
        if (left) {
            leftEl.innerHTML = `
                Stick: ${left.thumbstick.x.toFixed(2)}, ${left.thumbstick.y.toFixed(2)}<br>
                Trigger: ${(left.trigger * 100).toFixed(0)}%<br>
                Grip: ${(left.grip * 100).toFixed(0)}%
            `;
            accelEl.textContent = `X: ${left.accel.x.toFixed(2)} Y: ${left.accel.y.toFixed(2)} Z: ${left.accel.z.toFixed(2)}`;
            gyroEl.textContent = `X: ${left.gyro.x.toFixed(2)} Y: ${left.gyro.y.toFixed(2)} Z: ${left.gyro.z.toFixed(2)}`;
        } else {
            leftEl.textContent = 'Not connected';
        }
        
        if (right) {
            rightEl.innerHTML = `
                Stick: ${right.thumbstick.x.toFixed(2)}, ${right.thumbstick.y.toFixed(2)}<br>
                Trigger: ${(right.trigger * 100).toFixed(0)}%<br>
                Grip: ${(right.grip * 100).toFixed(0)}%
            `;
        } else {
            rightEl.textContent = 'Not connected';
        }
    }
    
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
}

// Initialize when page loads
window.addEventListener('load', () => {
    window.app = new VRtoDSU();
});
