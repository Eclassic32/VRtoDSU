import { setBoolValue, setRangeValue } from './elemets.js';
export { HeadsetInfo, LeftControllerInfo, RightControllerInfo };

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
        this.buttons = {
            volUp : { pressed: false },
            volDown : { pressed: false },
            power : { pressed: false },
        };
    }
}

class ControllerInfo extends VRInfo {
    constructor() {
        super();
        this.buttons = {
            stickClick : {touch: false, press: false},
            surface : {touch: false, press: null},
            trigger : {touch: false, press: null}
        }

        this.axis = {
            stickX : 128,
            stickY : 128,
            trigger : 0,
            grip : 0
        };

        this.rumble = 0;
    }
}

class LeftControllerInfo extends ControllerInfo {
    constructor() {
        super();
        this.buttons.x = { touch: false, press: false };
        this.buttons.y = { touch: false, press: false };
        this.buttons.menu = { touch: null, press: false };
    }
}

class RightControllerInfo extends ControllerInfo {
    constructor() {
        super();
        this.buttons.a = { touch: false, press: false };
        this.buttons.b = { touch: false, press: false };
        this.buttons.system = { touch: null, press: false };
    }
}
