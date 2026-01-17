import {HeadsetInfo, LeftControllerInfo, RightControllerInfo} from './class.js';
import {HeadsetInfoElements, LeftControllerInfoElements, RightControllerInfoElements} from './elemets.js';
import "./xr.js";

const headsetInfo = new HeadsetInfo();
const leftControllerInfo = new LeftControllerInfo();
const rightControllerInfo = new RightControllerInfo();

// Example usage:
headsetInfo.setValue('battery.level', 100, HeadsetInfoElements);
leftControllerInfo.setValue('button.x.pressed', true, LeftControllerInfoElements, 'bool');
rightControllerInfo.setValue('axis.trigger', 200, RightControllerInfoElements, 'range');