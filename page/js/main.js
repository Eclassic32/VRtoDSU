import {HeadsetInfo, LeftControllerInfo, RightControllerInfo} from './class.js';
import {HeadsetInfoElements, LeftControllerInfoElements, RightControllerInfoElements} from './elemets.js';
import "./xr.js";

// Data models for storing device info (can be used for further processing)
const headsetInfo = new HeadsetInfo();
const leftControllerInfo = new LeftControllerInfo();
const rightControllerInfo = new RightControllerInfo();

// Export for potential use by other modules
export { headsetInfo, leftControllerInfo, rightControllerInfo };