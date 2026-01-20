import {HeadsetInfo, LeftControllerInfo, RightControllerInfo} from './class.js';
import {InitializeControllerInfoDisplays } from './elemets.js';
import "./xr.js";
import "./controllerConfig.js";
import "./websocket.js";

// Data models for storing device info (can be used for further processing)
const headsetInfo = new HeadsetInfo();
const leftControllerInfo = new LeftControllerInfo();
const rightControllerInfo = new RightControllerInfo();

// // Example usage:
// headsetInfo.setValue('battery.level', 100, TrackerElements.Headset);
// leftControllerInfo.setValue('button.x.pressed', true, TrackerElements.LeftController, 'bool');
// rightControllerInfo.setValue('axis.trigger', 200, TrackerElements.RightController, 'range');

// Export for potential use by other modules
export { headsetInfo, leftControllerInfo, rightControllerInfo };

InitializeControllerInfoDisplays();