import {HeadsetInfo, LeftControllerInfo, RightControllerInfo} from './class.js';
import {HeadsetInfoElements, LeftControllerInfoElements, RightControllerInfoElements} from './elemets.js';
import "./xr.js";
import "./controllerConfig.js";

// Data models for storing device info (can be used for further processing)
const headsetInfo = new HeadsetInfo();
const leftControllerInfo = new LeftControllerInfo();
const rightControllerInfo = new RightControllerInfo();

// // Example usage:
// headsetInfo.setValue('battery.level', 100, HeadsetInfoElements);
// leftControllerInfo.setValue('button.x.pressed', true, LeftControllerInfoElements, 'bool');
// rightControllerInfo.setValue('axis.trigger', 200, RightControllerInfoElements, 'range');

// Export for potential use by other modules
export { headsetInfo, leftControllerInfo, rightControllerInfo,
         HeadsetInfoElements, LeftControllerInfoElements, RightControllerInfoElements };

