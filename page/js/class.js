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
        this.Yaw = 0;
        this.Pitch = 0;
        this.Roll = 0;
    }
}

class AccelModuleInfo {
    constructor() {
        this.X = 0;
        this.Y = 0;
        this.Z = 0;
    }
}

class HeadsetInfo extends VRInfo {
    constructor() {
        super();
        this.buttons = {
            VolumeUp : { pressed: false },
            VolumeDown : { pressed: false },
            Power : { pressed: false },
        };
    }
}

class ControllerInfo extends VRInfo {
    constructor() {
        super();
        this.buttons = {
            StickClick : {touch: false, press: false},
            Surface : {touch: false, press: null},
            Trigger : {touch: false, press: null}
        }

        this.axis = {
            StickX : 128,
            StickY : 128,
            Trigger : 0,
            Grip : 0
        };

        this.Rumble = 0;
    }
}

class LeftControllerInfo extends ControllerInfo {
    constructor() {
        super();
        this.buttons.X = { touch: false, press: false };
        this.buttons.Y = { touch: false, press: false };
        this.buttons.Menu = { touch: null, press: false };
    }
}

class RightControllerInfo extends ControllerInfo {
    constructor() {
        super();
        this.buttons.A = { touch: false, press: false };
        this.buttons.B = { touch: false, press: false };
        this.buttons.System = { touch: null, press: false };
    }
}
