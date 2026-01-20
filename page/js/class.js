import { setBoolValue, setRangeValue } from './elements.js';
export { HeadsetInfo, LeftControllerInfo, RightControllerInfo };

class VRInfo {
    constructor() {
        this.name = '';
        this.gyro = new GyroModuleInfo();
        this.accel = new AccelModuleInfo();
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

class GyroModuleInfo {
    constructor() {
        this.yaw = 0;
        this.pitch = 0;
        this.roll = 0;
    }
}

class AccelModuleInfo {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
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
