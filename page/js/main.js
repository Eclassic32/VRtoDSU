import {HeadsetInfo, LeftControllerInfo, RightControllerInfo} from './class.js';
import {InitializeControllerInfoDisplays } from './elements.js';
import "./xr.js";
import "./controllerConfig.js";
import "./websocket.js";

// Data models for storing device info (can be used for further processing)
const headsetInfo = new HeadsetInfo();
const leftControllerInfo = new LeftControllerInfo();
const rightControllerInfo = new RightControllerInfo();

// Export for potential use by other modules
export { headsetInfo, leftControllerInfo, rightControllerInfo };

InitializeControllerInfoDisplays();