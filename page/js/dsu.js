/**
 * DSU Protocol (Cemuhook) data generator
 * Generates controller data packets according to the cemuhook protocol
 * Reference: https://github.com/v1993/cemuhook-protocol
 */

import { sendControlData } from './websocket.js';
import { headsetInfo, leftControllerInfo, rightControllerInfo } from './xr.js';

// Packet counters for each slot
const packetCounters = [0, 0, 0];

// Server ID (randomly generated on startup)
const SERVER_ID = Math.floor(Math.random() * 0xFFFFFFFF);

// Motion timestamp base (microseconds)
let motionTimestampBase = 0;

/**
 * Get current motion timestamp in microseconds
 */
function getMotionTimestamp() {
    if (motionTimestampBase === 0) {
        motionTimestampBase = performance.now() * 1000;
    }
    return Math.floor(performance.now() * 1000);
}

/**
 * Create the shared response beginning (11 bytes)
 * @param {number} slot - Controller slot (0-3)
 * @param {boolean} isConnected - Whether the controller is connected
 * @returns {number[]} Array of bytes
 */
function createSharedBeginning(slot, isConnected = true, battery=0x04) {
    return [
        slot,                    // Slot number
        isConnected ? 2 : 0,     // Slot state: 2 = connected, 0 = not connected
        2,                       // Device model: 2 = full gyro
        0,                       // Connection type: 0 = not applicable
        0, 0, 0, 0, 0, slot + 1, // MAC address (use slot+1 as last byte for uniqueness)
        battery                  // Battery status (Default: 0x04 = High) [Currently Unsupported]
    ];
}

/**
 * Convert a float to 4 bytes (little-endian IEEE 754)
 * @param {number} value - Float value
 * @returns {number[]} Array of 4 bytes
 */
function floatToBytes(value) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, true); // little-endian
    return [
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
    ];
}

/**
 * Convert a 32-bit unsigned int to 4 bytes (little-endian)
 * @param {number} value - Unsigned 32-bit value
 * @returns {number[]} Array of 4 bytes
 */
function uint32ToBytes(value) {
    return [
        value & 0xFF,
        (value >> 8) & 0xFF,
        (value >> 16) & 0xFF,
        (value >> 24) & 0xFF
    ];
}

/**
 * Convert a 64-bit unsigned int to 8 bytes (little-endian)
 * @param {number} value - Unsigned 64-bit value (as number, may lose precision for very large values)
 * @returns {number[]} Array of 8 bytes
 */
function uint64ToBytes(value) {
    // JavaScript numbers are 64-bit floats, so we handle this carefully
    const low = value >>> 0;
    const high = Math.floor(value / 0x100000000) >>> 0;
    return [
        low & 0xFF,
        (low >> 8) & 0xFF,
        (low >> 16) & 0xFF,
        (low >> 24) & 0xFF,
        high & 0xFF,
        (high >> 8) & 0xFF,
        (high >> 16) & 0xFF,
        (high >> 24) & 0xFF
    ];
}

/**
 * Create touch data structure (6 bytes, inactive)
 * @returns {number[]} Array of 6 bytes
 */
function createEmptyTouch() {
    return [0, 0, 0, 0, 0, 0]; // inactive touch
}

/**
 * Build controller data packet for a device
 * @param {number} slot - Controller slot (0 = headset, 1 = left, 2 = right)
 * @param {object} deviceInfo - Device info object (headsetInfo, leftControllerInfo, rightControllerInfo)
 * @returns {number[]} Array of bytes representing the controller data
 */
function buildControllerDataPacket(slot, deviceInfo) {
    const packet = [];
    
    // Shared beginning (11 bytes)
    packet.push(...createSharedBeginning(slot, true));
    
    // Is controller connected (1 byte)
    packet.push(1);
    
    // Packet number (4 bytes)
    packet.push(...uint32ToBytes(packetCounters[slot]++));
    
    // D-Pad bitmask (1 byte) - ignored for now
    packet.push(0);
    
    // Button bitmask (1 byte) - ignored for now
    packet.push(0);
    
    // HOME Button (1 byte) - ignored
    packet.push(0);
    
    // Touch Button (1 byte) - ignored
    packet.push(0);
    
    // Left stick X/Y (2 bytes) - neutral position (128)
    packet.push(128, 128);
    
    // Right stick X/Y (2 bytes) - neutral position (128)
    packet.push(128, 128);
    
    // Analog D-Pad Left, Down, Right, Up (4 bytes) - ignored
    packet.push(0, 0, 0, 0);
    
    // Analog Y, B, A, X (4 bytes) - ignored
    packet.push(0, 0, 0, 0);
    
    // Analog R1, L1, R2, L2 (4 bytes) - ignored
    packet.push(0, 0, 0, 0);
    
    // First touch (6 bytes) - inactive
    packet.push(...createEmptyTouch());
    
    // Second touch (6 bytes) - inactive
    packet.push(...createEmptyTouch());
    
    // Motion data timestamp in microseconds (8 bytes)
    packet.push(...uint64ToBytes(getMotionTimestamp()));
    
    // Get gyro and accel data from deviceInfo
    // The gyro values in deviceInfo are mapped to 0-255, we need to convert back to deg/s
    // The accel values in deviceInfo are mapped to 0-255, we need to convert back to g's
    
    // For gyro: 0-255 was mapped from actual angular velocity
    // For now, let's use the raw gyro values and convert them to approximate deg/s
    // The display uses 0-255 where 128 is neutral, so we map back
    const gyro = deviceInfo.gyro || { yaw: 0, pitch: 0, roll: 0 };
    const accel = deviceInfo.accel || { x: 0, y: 0, z: 0 };
    
    // Convert from 0-255 display range back to real values
    // Gyro: assuming the display range represents approximately -500 to +500 deg/s
    // But looking at the code, the gyro values ARE the Euler angles (not angular velocity)
    // For DSU protocol, we need actual angular velocity in deg/s
    // For now, we'll send the Euler angles as a placeholder (this may need adjustment)
    
    // Map 0-255 back to approximate range
    // For yaw/roll: 0-255 -> -180 to 180 degrees
    // For pitch: 0-255 -> -90 to 90 degrees
    const gyroYaw = ((gyro.yaw - 128) / 128) * 180;
    const gyroPitch = ((gyro.pitch - 128) / 128) * 90;
    const gyroRoll = ((gyro.roll - 128) / 128) * 180;
    
    // For accel: 0-255 was mapped from velocity changes
    // Map back to approximate g values (-2 to +2 g range based on the XR code)
    const accelX = ((accel.x - 128) / 128) * 2;
    const accelY = ((accel.y - 128) / 128) * 2;
    const accelZ = ((accel.z - 128) / 128) * 2;
    
    // Accelerometer X, Y, Z (12 bytes - 3 floats)
    packet.push(...floatToBytes(accelX));
    packet.push(...floatToBytes(accelY));
    packet.push(...floatToBytes(accelZ));
    
    // Gyroscope pitch, yaw, roll (12 bytes - 3 floats)
    packet.push(...floatToBytes(gyroPitch));
    packet.push(...floatToBytes(gyroYaw));
    packet.push(...floatToBytes(gyroRoll));
    
    return packet;
}

/**
 * Send controller data for all three devices (headset, left controller, right controller)
 */
export function sendAllControllerData() {
    const controllers = [
        { slot: 0, info: headsetInfo, name: 'headset' },
        { slot: 1, info: leftControllerInfo, name: 'leftController' },
        { slot: 2, info: rightControllerInfo, name: 'rightController' }
    ];
    
    const allData = controllers.map(({ slot, info, name }) => {
        const packet = buildControllerDataPacket(slot, info);
        return {
            slot,
            name,
            packet: Array.from(packet) // Ensure it's a plain array for JSON serialization
        };
    });
    
    sendControlData({
        type: 'dsu_controller_data',
        controllers: allData
    });
}

/**
 * Send controller data for a specific slot
 * @param {number} slot - Controller slot (0 = headset, 1 = left, 2 = right)
 */
export function sendControllerDataForSlot(slot) {
    let info;
    let name;
    
    switch (slot) {
        case 0:
            info = headsetInfo;
            name = 'headset';
            break;
        case 1:
            info = leftControllerInfo;
            name = 'leftController';
            break;
        case 2:
            info = rightControllerInfo;
            name = 'rightController';
            break;
        default:
            console.warn('Invalid slot:', slot);
            return;
    }
    
    const packet = buildControllerDataPacket(slot, info);
    
    sendControlData({
        type: 'dsu_controller_data',
        controllers: [{
            slot,
            name,
            packet: Array.from(packet)
        }]
    });
}

/**
 * Reset packet counters (call when connection is reset)
 */
export function resetPacketCounters() {
    packetCounters[0] = 0;
    packetCounters[1] = 0;
    packetCounters[2] = 0;
}
