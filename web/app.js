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
        
        // Smoothing filters for motion data
        this.accelSmooth = { left: null, right: null };
        this.gyroSmooth = { left: null, right: null };
        
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
        
        // Calculate acceleration in controller's local frame
        // DSU expects acceleration WITH gravity, in the controller's reference frame
        // When controller is flat (screen up), gravity should be ~(0, 1, 0) in g's
        
        // Gravity vector in world space (pointing down)
        const gravityWorld = { x: 0, y: -9.8, z: 0 };
        
        // Rotate gravity into controller's local frame using quaternion
        // To rotate a vector by quaternion: v' = q * v * q^-1
        // For unit quaternion, q^-1 = conjugate
        const q = orientation;
        
        // Quaternion conjugate (inverse for unit quaternion)
        const qConj = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
        
        // Rotate gravity: first compute q * gravity (as pure quaternion with w=0)
        // q * v where v = (gx, gy, gz, 0)
        const qv = {
            w: -q.x * gravityWorld.x - q.y * gravityWorld.y - q.z * gravityWorld.z,
            x: q.w * gravityWorld.x + q.y * gravityWorld.z - q.z * gravityWorld.y,
            y: q.w * gravityWorld.y + q.z * gravityWorld.x - q.x * gravityWorld.z,
            z: q.w * gravityWorld.z + q.x * gravityWorld.y - q.y * gravityWorld.x
        };
        
        // Then compute (q * v) * qConj
        const gravityLocal = {
            x: qv.w * qConj.x + qv.x * qConj.w + qv.y * qConj.z - qv.z * qConj.y,
            y: qv.w * qConj.y - qv.x * qConj.z + qv.y * qConj.w + qv.z * qConj.x,
            z: qv.w * qConj.z + qv.x * qConj.y - qv.y * qConj.x + qv.z * qConj.w
        };
        
        // Negate because accelerometer measures reaction to gravity (upward force)
        // and convert to g's
        let accel = {
            x: -gravityLocal.x / 9.8,
            y: -gravityLocal.y / 9.8,
            z: -gravityLocal.z / 9.8
        };
        
        // Add linear acceleration from movement
        const estimator = this.velocityEstimator[hand];
        if (estimator.lastPos && estimator.lastTime) {
            const dt = (time - estimator.lastTime) / 1000;
            if (dt > 0.001 && dt < 0.1) {
                const newVel = {
                    x: (position.x - estimator.lastPos.x) / dt,
                    y: (position.y - estimator.lastPos.y) / dt,
                    z: (position.z - estimator.lastPos.z) / dt
                };
                
                if (estimator.velocity) {
                    // Calculate linear acceleration in world space
                    const linearAccelWorld = {
                        x: (newVel.x - estimator.velocity.x) / dt,
                        y: (newVel.y - estimator.velocity.y) / dt,
                        z: (newVel.z - estimator.velocity.z) / dt
                    };
                    
                    // Rotate linear acceleration to controller's local frame
                    const lav = {
                        w: -q.x * linearAccelWorld.x - q.y * linearAccelWorld.y - q.z * linearAccelWorld.z,
                        x: q.w * linearAccelWorld.x + q.y * linearAccelWorld.z - q.z * linearAccelWorld.y,
                        y: q.w * linearAccelWorld.y + q.z * linearAccelWorld.x - q.x * linearAccelWorld.z,
                        z: q.w * linearAccelWorld.z + q.x * linearAccelWorld.y - q.y * linearAccelWorld.x
                    };
                    const linearAccelLocal = {
                        x: lav.w * qConj.x + lav.x * qConj.w + lav.y * qConj.z - lav.z * qConj.y,
                        y: lav.w * qConj.y - lav.x * qConj.z + lav.y * qConj.w + lav.z * qConj.x,
                        z: lav.w * qConj.z + lav.x * qConj.y - lav.y * qConj.x + lav.z * qConj.w
                    };
                    
                    // Add to gravity-based acceleration (with dampening to reduce noise)
                    const linearScale = 0.3; // Reduce noise from position-based estimation
                    accel.x += linearAccelLocal.x / 9.8 * linearScale;
                    accel.y += linearAccelLocal.y / 9.8 * linearScale;
                    accel.z += linearAccelLocal.z / 9.8 * linearScale;
                }
                
                estimator.velocity = newVel;
            }
        }
        
        estimator.lastPos = { x: position.x, y: position.y, z: position.z };
        estimator.lastTime = time;
        
        // Clamp acceleration to reasonable range
        accel.x = Math.max(-4, Math.min(4, accel.x));
        accel.y = Math.max(-4, Math.min(4, accel.y));
        accel.z = Math.max(-4, Math.min(4, accel.z));
        
        // Apply smoothing to reduce noise
        if (this.accelSmooth[hand]) {
            const alpha = 0.3; // Smoothing factor (0 = no change, 1 = no smoothing)
            accel.x = this.accelSmooth[hand].x * (1 - alpha) + accel.x * alpha;
            accel.y = this.accelSmooth[hand].y * (1 - alpha) + accel.y * alpha;
            accel.z = this.accelSmooth[hand].z * (1 - alpha) + accel.z * alpha;
        }
        this.accelSmooth[hand] = { ...accel };
        
        // Extract angular velocity from quaternion changes
        // Note: WebXR doesn't directly provide angular velocity, so we estimate
        const gyro = this.estimateAngularVelocity(hand, orientation, time);
        
        // Get gamepad data
        let thumbstick = { x: 0, y: 0 };
        let trigger = 0;
        let grip = 0;
        let buttons = [];
        let buttonA = false, buttonB = false; // For right: A/B, for left: X/Y
        let menuButton = false;
        
        if (source.gamepad) {
            const gp = source.gamepad;
            
            // Meta Quest Touch controller layout (WebXR):
            // axes[0], axes[1] = touchpad (if exists)
            // axes[2], axes[3] = thumbstick X/Y
            // buttons[0] = trigger
            // buttons[1] = grip
            // buttons[2] = touchpad (unused)
            // buttons[3] = thumbstick press
            // buttons[4] = A/X button (primary)
            // buttons[5] = B/Y button (secondary)
            // buttons[6] = thumbrest touch (optional)
            
            if (gp.axes.length >= 4) {
                thumbstick.x = gp.axes[2] || 0;
                thumbstick.y = -(gp.axes[3] || 0); // Invert Y
            } else if (gp.axes.length >= 2) {
                thumbstick.x = gp.axes[0] || 0;
                thumbstick.y = -(gp.axes[1] || 0); // Invert Y
            }
            
            if (gp.buttons.length > 0) {
                trigger = gp.buttons[0]?.value || 0;
                grip = gp.buttons[1]?.value || 0;
                
                // Correct Quest controller button indices:
                // 0 = trigger, 1 = grip, 2 = unused, 3 = stick click
                // 4 = A/X (primary), 5 = B/Y (secondary), 6 = menu (left only)
                buttonA = gp.buttons[4]?.pressed || false; // A on right, X on left
                buttonB = gp.buttons[5]?.pressed || false; // B on right, Y on left
                menuButton = gp.buttons[6]?.pressed || false; // Menu button
                
                buttons = gp.buttons.map(b => ({ pressed: b.pressed, value: b.value, touched: b.touched }));
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
            buttons,
            buttonA, // Primary face button (A for right, X for left)
            buttonB, // Secondary face button (B for right, Y for left)
            menuButton // Menu button
        };
    }
    
    // Store last orientations for angular velocity estimation
    lastOrientations = { left: null, right: null };
    lastOrientationTimes = { left: 0, right: 0 };
    
    estimateAngularVelocity(hand, orientation, time) {
        const lastQ = this.lastOrientations[hand];
        const lastT = this.lastOrientationTimes[hand];
        
        // Store current orientation
        this.lastOrientations[hand] = { 
            x: orientation.x, 
            y: orientation.y, 
            z: orientation.z, 
            w: orientation.w 
        };
        this.lastOrientationTimes[hand] = time;
        
        if (!lastQ || !lastT) return { x: 0, y: 0, z: 0 };
        
        const dt = (time - lastT) / 1000;
        // Require minimum dt to avoid division spikes, and max to avoid stale data
        // Use 1ms minimum (Quest runs at 72Hz = ~14ms per frame, so this should be fine)
        if (dt < 0.001 || dt > 0.1) {
            return this.gyroSmooth[hand] ? { ...this.gyroSmooth[hand] } : { x: 0, y: 0, z: 0 };
        }
        
        // Handle quaternion double-cover: q and -q represent the same rotation
        // If dot product is negative, negate one quaternion to take shortest path
        let qx = orientation.x, qy = orientation.y, qz = orientation.z, qw = orientation.w;
        const dot = lastQ.x * qx + lastQ.y * qy + lastQ.z * qz + lastQ.w * qw;
        if (dot < 0) {
            qx = -qx;
            qy = -qy;
            qz = -qz;
            qw = -qw;
        }
        
        // Compute quaternion difference: dq = q_new * q_old^(-1)
        // For small rotations, the xyz components of dq approximate half the rotation vector
        const qOldConjX = -lastQ.x, qOldConjY = -lastQ.y, qOldConjZ = -lastQ.z, qOldConjW = lastQ.w;
        
        // Quaternion multiplication: q * qOldConj
        const dqW = qw * qOldConjW - qx * qOldConjX - qy * qOldConjY - qz * qOldConjZ;
        const dqX = qw * qOldConjX + qx * qOldConjW + qy * qOldConjZ - qz * qOldConjY;
        const dqY = qw * qOldConjY - qx * qOldConjZ + qy * qOldConjW + qz * qOldConjX;
        const dqZ = qw * qOldConjZ + qx * qOldConjY - qy * qOldConjX + qz * qOldConjW;
        
        // For small angles, angular velocity ≈ 2 * dq.xyz / dt
        let gyroX = 2 * dqX / dt;
        let gyroY = 2 * dqY / dt;
        let gyroZ = 2 * dqZ / dt;
        
        // Fix axis signs to match DS4/DSU coordinate system
        gyroY = -gyroY;
        gyroZ = -gyroZ;
        
        // Check for NaN or Infinity FIRST
        if (!Number.isFinite(gyroX)) gyroX = 0;
        if (!Number.isFinite(gyroY)) gyroY = 0;
        if (!Number.isFinite(gyroZ)) gyroZ = 0;
        
        // Clamp to reasonable range (max ~5 rev/sec = 31 rad/s)
        const maxGyro = 31;
        gyroX = Math.max(-maxGyro, Math.min(maxGyro, gyroX));
        gyroY = Math.max(-maxGyro, Math.min(maxGyro, gyroY));
        gyroZ = Math.max(-maxGyro, Math.min(maxGyro, gyroZ));
        
        // Apply deadzone to filter out tiny jittery values
        const deadzone = 0.1; // radians/sec
        if (Math.abs(gyroX) < deadzone) gyroX = 0;
        if (Math.abs(gyroY) < deadzone) gyroY = 0;
        if (Math.abs(gyroZ) < deadzone) gyroZ = 0;
        
        // Apply smoothing to reduce noise
        const prev = this.gyroSmooth[hand];
        if (prev) {
            const alpha = 0.5; // Smoothing factor
            gyroX = prev.x * (1 - alpha) + gyroX * alpha;
            gyroY = prev.y * (1 - alpha) + gyroY * alpha;
            gyroZ = prev.z * (1 - alpha) + gyroZ * alpha;
        }
        
        // Final cleanup: snap tiny values to zero (prevents floating point dust like 1e-15)
        if (Math.abs(gyroX) < 0.001) gyroX = 0;
        if (Math.abs(gyroY) < 0.001) gyroY = 0;
        if (Math.abs(gyroZ) < 0.001) gyroZ = 0;
        
        const result = { x: gyroX, y: gyroY, z: gyroZ };
        this.gyroSmooth[hand] = result;
        
        return result;
    }
    
    getButtons1(left, right) {
        // Bit layout according to DSU protocol (descending order 128,64,32...):
        // Bit 7 (0x80): D-Pad Left
        // Bit 6 (0x40): D-Pad Down  
        // Bit 5 (0x20): D-Pad Right
        // Bit 4 (0x10): D-Pad Up
        // Bit 3 (0x08): Options
        // Bit 2 (0x04): R3
        // Bit 1 (0x02): L3
        // Bit 0 (0x01): Share
        let buttons = 0;
        
        // Stick click is button index 3
        if (left?.buttons?.[3]?.pressed) buttons |= 0x02;  // L3 (bit 1)
        if (right?.buttons?.[3]?.pressed) buttons |= 0x04; // R3 (bit 2)
        
        // Map menu button to Options
        if (left?.menuButton) buttons |= 0x08; // Options (bit 3)
        
        return buttons;
    }
    
    getButtons2(left, right) {
        // Protocol says: Y(7), B(6), A(5), X(4), R1(3), L1(2), R2(1), L2(0)
        // But based on testing, the actual mapping appears to be:
        // Bit 7 (0x80): X (Square)
        // Bit 6 (0x40): A (Cross)
        // Bit 5 (0x20): B (Circle)
        // Bit 4 (0x10): Y (Triangle)
        let buttons = 0;
        
        // Map Quest buttons - corrected based on user testing
        // Left controller: X (buttonA), Y (buttonB)
        // Right controller: A (buttonA), B (buttonB)
        
        if (left?.buttonA) buttons |= 0x80;  // Quest X → Square (bit 7)
        if (left?.buttonB) buttons |= 0x10;  // Quest Y → Triangle (bit 4)
        if (right?.buttonA) buttons |= 0x40; // Quest A → Cross (bit 6)
        if (right?.buttonB) buttons |= 0x20; // Quest B → Circle (bit 5)
        
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
                Trigger: ${(left.trigger * 100).toFixed(0)}% | Grip: ${(left.grip * 100).toFixed(0)}%<br>
                X: ${left.buttonA ? '●' : '○'} Y: ${left.buttonB ? '●' : '○'}
            `;
            accelEl.textContent = `X: ${left.accel.x.toFixed(2)} Y: ${left.accel.y.toFixed(2)} Z: ${left.accel.z.toFixed(2)}`;
            gyroEl.textContent = `X: ${left.gyro.x.toFixed(2)} Y: ${left.gyro.y.toFixed(2)} Z: ${left.gyro.z.toFixed(2)}`;
        } else {
            leftEl.textContent = 'Not connected';
        }
        
        if (right) {
            rightEl.innerHTML = `
                Stick: ${right.thumbstick.x.toFixed(2)}, ${right.thumbstick.y.toFixed(2)}<br>
                Trigger: ${(right.trigger * 100).toFixed(0)}% | Grip: ${(right.grip * 100).toFixed(0)}%<br>
                A: ${right.buttonA ? '●' : '○'} B: ${right.buttonB ? '●' : '○'}
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
