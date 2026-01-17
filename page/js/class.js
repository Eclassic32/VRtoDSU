import { setBoolValue, setRangeValue } from './elemets.js';

class VRInfo {
    constructor() {
        this.battery = { level: null, charging: null, state: null };
        this.gyro = { x: null, y: null, z: null };
        this.accel = { x: null, y: null, z: null };
    }

    setValue(name, value, elementGroup=null, type=null) {
        if (this.hasOwnProperty(name)) {
            this[name] = value;
        }
        if (elementGroup && elementGroup.hasOwnProperty(name)) {
            const element = elementGroup[name];
            if (type === 'bool') {
                setBoolValue(value, element);
            } else if (type === 'range') {
                setRangeValue(value, element);
            } else {
                element.innerText = value;
            }
        }
    }
}

class HeadsetInfo extends VRInfo {
    constructor() {
        super();
        this.volUp = { pressed: false };
        this.volDown = { pressed: false };
        this.power = { pressed: false };
    }
}

class ControllerInfo extends VRInfo {
    constructor() {
        super();
        this.stickClick = {touch: false, press: false};
        this.sideSensor = {touch: false, press: null};
        this.triggerSensor = {touch: false, press: null};

        this.stickX = 128;
        this.stickY = 128;
        this.trigger = 0;
        this.grip = 0;

        this.rumble = 0;
    }
}

class LeftControllerInfo extends ControllerInfo {
    constructor() {
        super();
        this.x = { touch: false, press: false };
        this.y = { touch: false, press: false };
        this.menu = { touch: false, press: false };
    }
}

class RightControllerInfo extends ControllerInfo {
    constructor() {
        super();
        this.a = { touch: false, press: false };
        this.b = { touch: false, press: false };
        this.system = { touch: false, press: false };
    }
}

export { HeadsetInfo, LeftControllerInfo, RightControllerInfo };