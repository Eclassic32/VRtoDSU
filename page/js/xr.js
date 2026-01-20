import { headsetInfo, leftControllerInfo, rightControllerInfo } from './main.js';
import { getControllerConfig, disableControllerConfigUpload } from './controllerConfig.js';
import { TrackerElements } from './elements.js';
import { sendAllControllerData } from './dsu.js';
import { isWSConnected } from './websocket.js';

export { headsetInfo, leftControllerInfo, rightControllerInfo };

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
        console.log("WebXR is available");
        
        // If the device allows creation of exclusive sessions set it as the
        // target of the 'Enter XR' button.
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported) {
                console.log("immersive-vr supported");
                // Updates the button to start an XR session when clicked.
                xrButton.addEventListener('click', onButtonClicked);
                xrButton.textContent = 'Enter VR';
                xrButton.disabled = false;
            } else {
                console.log("immersive-vr NOT supported");
                xrButton.textContent = 'VR Not Supported';
            }
        });
    } else {
        console.log("WebXR not available");
        xrButton.textContent = 'WebXR Not Available';
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
    disableControllerConfigUpload(true);

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
    disableControllerConfigUpload(false);

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
    
    headsetInfo.setValue('Yaw', yaw, TrackerElements.Headset.gyro, 'range');
    headsetInfo.setValue('Pitch', pitch, TrackerElements.Headset.gyro, 'range');
    headsetInfo.setValue('Roll', roll, TrackerElements.Headset.gyro, 'range');
    
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
                
                headsetInfo.setValue('X', ax, TrackerElements.Headset.accel, 'range');
                headsetInfo.setValue('Y', ay, TrackerElements.Headset.accel, 'range');
                headsetInfo.setValue('Z', az, TrackerElements.Headset.accel, 'range');
            }
        }
        prevHeadsetPosition = { x: pos.x, y: pos.y, z: pos.z };
    }
}

// Update controller orientation display
function updateControllerOrientation(pose, elements, controllerInfo, prevOrientation, prevPosition) {
    if (!pose || !pose.transform) return { orientation: prevOrientation, position: prevPosition };
    
    const orientation = pose.transform.orientation;
    const euler = quaternionToEuler(orientation);
    
    // Map euler angles to display range (0 to 255)
    const yaw = clamp(mapRange(euler.yaw, -180, 180, 0, 255), 0, 255);
    const pitch = clamp(mapRange(euler.pitch, -90, 90, 0, 255), 0, 255);
    const roll = clamp(mapRange(euler.roll, -180, 180, 0, 255), 0, 255);
    
    controllerInfo.setValue('Yaw', yaw, elements.gyro, 'range');
    controllerInfo.setValue('Pitch', pitch, elements.gyro, 'range');
    controllerInfo.setValue('Roll', roll, elements.gyro, 'range');
    
    // Calculate acceleration from position changes
    if (pose.transform.position) {
        const pos = pose.transform.position;
        if (prevPosition && prevTime) {
            const dt = (performance.now() - prevTime) / 1000;
            if (dt > 0) {
                const ax = clamp(mapRange((pos.x - prevPosition.x) / dt, -2, 2, 0, 255), 0, 255);
                const ay = clamp(mapRange((pos.y - prevPosition.y) / dt, -2, 2, 0, 255), 0, 255);
                const az = clamp(mapRange((pos.z - prevPosition.z) / dt, -2, 2, 0, 255), 0, 255);
                
                controllerInfo.setValue('X', ax, elements.accel, 'range');
                controllerInfo.setValue('Y', ay, elements.accel, 'range');
                controllerInfo.setValue('Z', az, elements.accel, 'range');
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
function updateController(inputSource, frame, elements, controllerInfo, isLeft) {
    const gamepad = inputSource.gamepad;
    if (!gamepad) return;
    
    // Get controller pose
    const gripSpace = inputSource.gripSpace;
    if (gripSpace) {
        const pose = frame.getPose(gripSpace, xrRefSpace);
        if (isLeft) {
            const result = updateControllerOrientation(pose, elements, controllerInfo, prevLeftControllerOrientation, prevLeftControllerPosition);
            prevLeftControllerOrientation = result.orientation;
            prevLeftControllerPosition = result.position;
        } else {
            const result = updateControllerOrientation(pose, elements, controllerInfo, prevRightControllerOrientation, prevRightControllerPosition);
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
        
        controllerInfo.setValue('StickX', mappedStickX, elements.axis, 'range');
        controllerInfo.setValue('StickY', mappedStickY, elements.axis, 'range');
    }
    
    // Update buttons
    // Standard XR controller button mapping:
    // 0: Trigger
    // 1: Grip/Squeeze
    // 2: Unused (sometimes touchpad click)
    // 3: Thumbstick click
    // 4: A/X button
    // 5: B/Y button
    // 6: Surface touch (capacitive sensor on controller body) / Menu-System press
    
    if (gamepad.buttons.length > 0) {
        // Trigger (button 0)
        const triggerValue = clamp(Math.round(gamepad.buttons[0].value * 255), 0, 255);
        controllerInfo.setValue('Trigger', triggerValue, elements.axis, 'range');
        controllerInfo.setValue('Touch', gamepad.buttons[0].touched, elements.buttons.Trigger, 'bool');
    }
    
    if (gamepad.buttons.length > 1) {
        // Grip (button 1) - axis value only
        const gripValue = clamp(Math.round(gamepad.buttons[1].value * 255), 0, 255);
        controllerInfo.setValue('Grip', gripValue, elements.axis, 'range');
    }
    
    if (gamepad.buttons.length > 3) {
        // Thumbstick click (button 3)
        controllerInfo.setValue('Touch', gamepad.buttons[3].touched, elements.buttons.StickClick, 'bool');
        controllerInfo.setValue('Press', gamepad.buttons[3].pressed, elements.buttons.StickClick, 'bool');
    }
    
    if (gamepad.buttons.length > 4) {
        // A/X button (button 4)
        const primaryButtonName = isLeft ? 'X' : 'A';
        const primaryButtonElements = isLeft ? elements.buttons.X : elements.buttons.A;
        controllerInfo.setValue('Touch', gamepad.buttons[4].touched, primaryButtonElements, 'bool');
        controllerInfo.setValue('Press', gamepad.buttons[4].pressed, primaryButtonElements, 'bool');
    }
    
    if (gamepad.buttons.length > 5) {
        // B/Y button (button 5)
        const secondaryButtonElements = isLeft ? elements.buttons.Y : elements.buttons.B;
        controllerInfo.setValue('Touch', gamepad.buttons[5].touched, secondaryButtonElements, 'bool');
        controllerInfo.setValue('Press', gamepad.buttons[5].pressed, secondaryButtonElements, 'bool');
    }
    
    if (gamepad.buttons.length > 6) {
        // Button 6: Surface touch sensor + Menu/System press
        // Touch goes to surface element, press goes to menu/system
        controllerInfo.setValue('Touch', gamepad.buttons[6].touched, elements.buttons.Surface, 'bool');
        const menuButtonElements = isLeft ? elements.buttons.Menu : elements.buttons.System;
        controllerInfo.setValue('Press', gamepad.buttons[6].pressed, menuButtonElements, 'bool');
    }
}

// Process all input sources (controllers)
function processInputSources(frame) {
    const session = frame.session;
    
    for (const inputSource of session.inputSources) {
        if (inputSource.handedness === 'left') {
            if (!TrackerElements.LeftController) continue;
            updateController(inputSource, frame, TrackerElements.LeftController, leftControllerInfo, true);
        } else if (inputSource.handedness === 'right') {
            if (!TrackerElements.RightController) continue;
            updateController(inputSource, frame, TrackerElements.RightController, rightControllerInfo, false);
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
    if (pose && TrackerElements.Headset) {
        updateHeadsetOrientation(pose);
    }
    
    // Process controller inputs
    processInputSources(frame);
    
    // Update time for next frame's calculations
    prevTime = performance.now();

    // Send controller data via DSU protocol if WebSocket is connected
    if (isWSConnected) {
        sendAllControllerData();
    }

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
