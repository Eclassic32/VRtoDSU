import { setBoolValue, setRangeValue, 
         HeadsetInfoElements, LeftControllerInfoElements, RightControllerInfoElements } from './elemets.js';

// XR globals.
let xrButton = document.getElementById('xr-button');
let xrSession = null;
let xrRefSpace = null;

// WebGL scene globals.
let gl = null;

// Previous pose data for calculating angular velocity (gyro) and linear acceleration
let prevHeadsetOrientation = null;
let prevLeftControllerOrientation = null;
let prevRightControllerOrientation = null;
let prevHeadsetPosition = null;
let prevLeftControllerPosition = null;
let prevRightControllerPosition = null;
let prevTime = null;

// Checks to see if WebXR is available and, if so, requests an XRDevice
// that is connected to the system and tests it to ensure it supports the
// desired session options.
function initXR() {
    // Is WebXR available on this UA?
    if (navigator.xr) {
        // If the device allows creation of exclusive sessions set it as the
        // target of the 'Enter XR' button.
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported) {
                // Updates the button to start an XR session when clicked.
                xrButton.addEventListener('click', onButtonClicked);
                xrButton.textContent = 'Enter VR';
                xrButton.disabled = false;
            }
        });
    }
}

// Called when the user clicks the button to enter XR. If we don't have a
// session we'll request one, and if we do have a session we'll end it.
function onButtonClicked() {
    if (!xrSession) {
        navigator.xr.requestSession('immersive-vr').then(onSessionStarted);
    } else {
        xrSession.end();
    }
}

// Called when we've successfully acquired a XRSession. In response we
// will set up the necessary session state and kick off the frame loop.
function onSessionStarted(session) {
    xrSession = session;
    xrButton.textContent = 'Exit VR';

    // Listen for the sessions 'end' event so we can respond if the user
    // or UA ends the session for any reason.
    session.addEventListener('end', onSessionEnded);

    // Create a WebGL context to render with, initialized to be compatible
    // with the XRDisplay we're presenting to.
    let canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl', { xrCompatible: true });

    // Use the new WebGL context to create a XRWebGLLayer and set it as the
    // sessions baseLayer. This allows any content rendered to the layer to
    // be displayed on the XRDevice.
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

    // Get a reference space, which is required for querying poses. In this
    // case an 'local' reference space means that all poses will be relative
    // to the location where the XRDevice was first detected.
    session.requestReferenceSpace('local').then((refSpace) => {
        xrRefSpace = refSpace;

        // Inform the session that we're ready to begin drawing.
        session.requestAnimationFrame(onXRFrame);
    });
}

// Called either when the user has explicitly ended the session by calling
// session.end() or when the UA has ended the session for any reason.
// At this point the session object is no longer usable and should be
// discarded.
function onSessionEnded(event) {
    xrSession = null;
    xrButton.textContent = 'Enter VR';

    // Reset previous pose data
    prevHeadsetOrientation = null;
    prevLeftControllerOrientation = null;
    prevRightControllerOrientation = null;
    prevHeadsetPosition = null;
    prevLeftControllerPosition = null;
    prevRightControllerPosition = null;
    prevTime = null;

    // In this simple case discard the WebGL context too, since we're not
    // rendering anything else to the screen with it.
    gl = null;
}

// Convert quaternion to Euler angles (yaw, pitch, roll) in degrees
function quaternionToEuler(q) {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    
    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);
    
    // Pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch;
    if (Math.abs(sinp) >= 1) {
        pitch = Math.sign(sinp) * Math.PI / 2; // Use 90 degrees if out of range
    } else {
        pitch = Math.asin(sinp);
    }
    
    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);
    
    // Convert to degrees
    return {
        yaw: yaw * 180 / Math.PI,
        pitch: pitch * 180 / Math.PI,
        roll: roll * 180 / Math.PI
    };
}

// Map a value from one range to another (e.g., -180..180 to 0..255)
function mapRange(value, inMin, inMax, outMin, outMax) {
    return Math.round(((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin);
}

// Clamp a value between min and max
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Update headset orientation display
function updateHeadsetOrientation(pose) {
    if (!pose || !pose.transform) return;
    
    const orientation = pose.transform.orientation;
    const euler = quaternionToEuler(orientation);
    
    // Map euler angles (-180 to 180) to display range (0 to 255)
    const yaw = clamp(mapRange(euler.yaw, -180, 180, 0, 255), 0, 255);
    const pitch = clamp(mapRange(euler.pitch, -90, 90, 0, 255), 0, 255);
    const roll = clamp(mapRange(euler.roll, -180, 180, 0, 255), 0, 255);
    
    setRangeValue(yaw, HeadsetInfoElements.gyro.yaw);
    setRangeValue(pitch, HeadsetInfoElements.gyro.pitch);
    setRangeValue(roll, HeadsetInfoElements.gyro.roll);
    
    // Calculate acceleration from position changes
    if (pose.transform.position) {
        const pos = pose.transform.position;
        if (prevHeadsetPosition && prevTime) {
            const dt = (performance.now() - prevTime) / 1000;
            if (dt > 0) {
                // Simple velocity-based "acceleration" visualization
                const ax = clamp(mapRange((pos.x - prevHeadsetPosition.x) / dt, -2, 2, 0, 255), 0, 255);
                const ay = clamp(mapRange((pos.y - prevHeadsetPosition.y) / dt, -2, 2, 0, 255), 0, 255);
                const az = clamp(mapRange((pos.z - prevHeadsetPosition.z) / dt, -2, 2, 0, 255), 0, 255);
                
                setRangeValue(ax, HeadsetInfoElements.accel.x);
                setRangeValue(ay, HeadsetInfoElements.accel.y);
                setRangeValue(az, HeadsetInfoElements.accel.z);
            }
        }
        prevHeadsetPosition = { x: pos.x, y: pos.y, z: pos.z };
    }
}

// Update controller orientation display
function updateControllerOrientation(pose, elements, prevOrientation, prevPosition) {
    if (!pose || !pose.transform) return { orientation: prevOrientation, position: prevPosition };
    
    const orientation = pose.transform.orientation;
    const euler = quaternionToEuler(orientation);
    
    // Map euler angles to display range (0 to 255)
    const yaw = clamp(mapRange(euler.yaw, -180, 180, 0, 255), 0, 255);
    const pitch = clamp(mapRange(euler.pitch, -90, 90, 0, 255), 0, 255);
    const roll = clamp(mapRange(euler.roll, -180, 180, 0, 255), 0, 255);
    
    setRangeValue(yaw, elements.gyro.yaw);
    setRangeValue(pitch, elements.gyro.pitch);
    setRangeValue(roll, elements.gyro.roll);
    
    // Calculate acceleration from position changes
    if (pose.transform.position) {
        const pos = pose.transform.position;
        if (prevPosition && prevTime) {
            const dt = (performance.now() - prevTime) / 1000;
            if (dt > 0) {
                const ax = clamp(mapRange((pos.x - prevPosition.x) / dt, -2, 2, 0, 255), 0, 255);
                const ay = clamp(mapRange((pos.y - prevPosition.y) / dt, -2, 2, 0, 255), 0, 255);
                const az = clamp(mapRange((pos.z - prevPosition.z) / dt, -2, 2, 0, 255), 0, 255);
                
                setRangeValue(ax, elements.accel.x);
                setRangeValue(ay, elements.accel.y);
                setRangeValue(az, elements.accel.z);
            }
        }
        return { 
            orientation: { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w },
            position: { x: pos.x, y: pos.y, z: pos.z }
        };
    }
    
    return { orientation: prevOrientation, position: prevPosition };
}

// Update controller buttons and axes
function updateController(inputSource, frame, elements, isLeft) {
    const gamepad = inputSource.gamepad;
    if (!gamepad) return;
    
    // Get controller pose
    const gripSpace = inputSource.gripSpace;
    if (gripSpace) {
        const pose = frame.getPose(gripSpace, xrRefSpace);
        if (isLeft) {
            const result = updateControllerOrientation(pose, elements, prevLeftControllerOrientation, prevLeftControllerPosition);
            prevLeftControllerOrientation = result.orientation;
            prevLeftControllerPosition = result.position;
        } else {
            const result = updateControllerOrientation(pose, elements, prevRightControllerOrientation, prevRightControllerPosition);
            prevRightControllerOrientation = result.orientation;
            prevRightControllerPosition = result.position;
        }
    }
    
    // Update axes (thumbstick and trigger/grip)
    if (gamepad.axes.length >= 4) {
        // Thumbstick X: axes[2], Thumbstick Y: axes[3] (typical mapping)
        // Some controllers use axes[0] and axes[1] for thumbstick
        const stickX = gamepad.axes.length > 2 ? gamepad.axes[2] : gamepad.axes[0];
        const stickY = gamepad.axes.length > 3 ? gamepad.axes[3] : gamepad.axes[1];
        
        // Map from -1..1 to 0..255 (128 is center)
        const mappedStickX = clamp(mapRange(stickX, -1, 1, 0, 255), 0, 255);
        const mappedStickY = clamp(mapRange(stickY, -1, 1, 0, 255), 0, 255);
        
        setRangeValue(mappedStickX, elements.axis.stickX);
        setRangeValue(mappedStickY, elements.axis.stickY);
    }
    
    // Update buttons
    // Standard XR controller button mapping:
    // 0: Trigger
    // 1: Grip/Squeeze
    // 2: Unused (sometimes touchpad click)
    // 3: Thumbstick click
    // 4: A/X button
    // 5: B/Y button
    // 6: Menu/System button (if available)
    
    if (gamepad.buttons.length > 0) {
        // Trigger (button 0)
        const triggerValue = clamp(Math.round(gamepad.buttons[0].value * 255), 0, 255);
        setRangeValue(triggerValue, elements.axis.trigger);
        if (elements.buttons.trigger) {
            setBoolValue(gamepad.buttons[0].touched, elements.buttons.trigger.touch);
        }
    }
    
    if (gamepad.buttons.length > 1) {
        // Grip (button 1)
        const gripValue = clamp(Math.round(gamepad.buttons[1].value * 255), 0, 255);
        setRangeValue(gripValue, elements.axis.grip);
        if (elements.buttons.side) {
            setBoolValue(gamepad.buttons[1].touched, elements.buttons.side.touch);
        }
    }
    
    if (gamepad.buttons.length > 3) {
        // Thumbstick click (button 3)
        if (elements.buttons.stickClick) {
            setBoolValue(gamepad.buttons[3].touched, elements.buttons.stickClick.touch);
            setBoolValue(gamepad.buttons[3].pressed, elements.buttons.stickClick.pressed);
        }
    }
    
    if (gamepad.buttons.length > 4) {
        // A/X button (button 4)
        const primaryButton = isLeft ? elements.buttons.x : elements.buttons.a;
        if (primaryButton) {
            setBoolValue(gamepad.buttons[4].touched, primaryButton.touch);
            setBoolValue(gamepad.buttons[4].pressed, primaryButton.pressed);
        }
    }
    
    if (gamepad.buttons.length > 5) {
        // B/Y button (button 5)
        const secondaryButton = isLeft ? elements.buttons.y : elements.buttons.b;
        if (secondaryButton) {
            setBoolValue(gamepad.buttons[5].touched, secondaryButton.touch);
            setBoolValue(gamepad.buttons[5].pressed, secondaryButton.pressed);
        }
    }
    
    if (gamepad.buttons.length > 6) {
        // Menu/System button (button 6)
        const menuButton = isLeft ? elements.buttons.menu : elements.buttons.system;
        if (menuButton) {
            setBoolValue(gamepad.buttons[6].touched, menuButton.touch);
            setBoolValue(gamepad.buttons[6].pressed, menuButton.pressed);
        }
    }
}

// Process all input sources (controllers)
function processInputSources(frame) {
    const session = frame.session;
    
    for (const inputSource of session.inputSources) {
        if (inputSource.handedness === 'left') {
            updateController(inputSource, frame, LeftControllerInfoElements, true);
        } else if (inputSource.handedness === 'right') {
            updateController(inputSource, frame, RightControllerInfoElements, false);
        }
    }
}

// Called every time the XRSession requests that a new frame be drawn.
function onXRFrame(time, frame) {
    let session = frame.session;

    // Inform the session that we're ready for the next frame.
    session.requestAnimationFrame(onXRFrame);

    // Get the XRDevice pose relative to the reference space we created
    // earlier.
    let pose = frame.getViewerPose(xrRefSpace);

    // Update headset orientation
    if (pose) {
        updateHeadsetOrientation(pose);
    }
    
    // Process controller inputs
    processInputSources(frame);
    
    // Update time for next frame's calculations
    prevTime = performance.now();

    // Getting the pose may fail if, for example, tracking is lost. So we
    // have to check to make sure that we got a valid pose before attempting
    // to render with it. If not in this case we'll just leave the
    // framebuffer cleared, so tracking loss means the scene will simply
    // disappear.
    if (pose) {
        let glLayer = session.renderState.baseLayer;

        // If we do have a valid pose, bind the WebGL layer's framebuffer,
        // which is where any content to be displayed on the XRDevice must be
        // rendered.
        gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);

        // Update the clear color so that we can observe the color in the
        // headset changing over time.
        gl.clearColor(Math.cos(time / 2000),
                    Math.cos(time / 4000),
                    Math.cos(time / 6000), 1.0);

        // Clear the framebuffer
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
}

// Start the XR application.
initXR();
