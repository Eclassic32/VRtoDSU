import { getControllerConfig } from "./controllerConfig.js";

export { setBoolValue, setRangeValue, testRumble, InitializeControllerInfoDisplays, 
         HeadsetInfoElements, LeftControllerInfoElements, RightControllerInfoElements};

function setBoolValue(value, element) {
    element.classList.remove('btn-notActive', 'btn-active');
    element.classList.add(value ? 'btn-active' : 'btn-notActive');
}

function setRangeValue(value, range) {
    range.num.innerText = value;
    range.range.value = value;
}

function testRumble(strength, device) {
    let rumbleValue;
    switch (strength) {
        case "low":
            rumbleValue = 31;
            break;
        case "mid":
            rumbleValue = 127;
            break;
        case "high":
            rumbleValue = 255;
            break;
        default:
            break;
    }

    // FIX: Send rumble command to the device
}

let HeadsetInfoElements = {
    buttons: {
        volUp: { pressed: document.getElementById('headset-volume-up-btn-pressed') }, 
        volDown: { pressed: document.getElementById('headset-volume-down-btn-pressed') },
        power: { pressed: document.getElementById('headset-power-btn-pressed') }
    },
    gyro: {
        yaw: {
            num: document.getElementById('headset-yaw-num'),
            range: document.getElementById('headset-yaw-range')
        },
        pitch: {
            num: document.getElementById('headset-pitch-num'),
            range: document.getElementById('headset-pitch-range')
        },
        roll: {
            num: document.getElementById('headset-roll-num'),
            range: document.getElementById('headset-roll-range')
        }
    },
    accel: {
        x: {
            num: document.getElementById('headset-accel-x-num'),
            range: document.getElementById('headset-accel-x-range')
        },
        y: {
            num: document.getElementById('headset-accel-y-num'),
            range: document.getElementById('headset-accel-y-range')
        },
        z: {
            num: document.getElementById('headset-accel-z-num'),
            range: document.getElementById('headset-accel-z-range')
        }
    }
}

let LeftControllerInfoElements = {
    buttons: {
        x: {
            touch: document.getElementById('left-x-btn-touch'), 
            pressed: document.getElementById('left-x-btn-pressed') 
        },
        y: {
            touch: document.getElementById('left-y-btn-touch'), 
            pressed: document.getElementById('left-y-btn-pressed')
        },
        menu: {
            touch: document.getElementById('left-menu-btn-touch'), 
            pressed: document.getElementById('left-menu-btn-pressed')
        },
        stickClick: {
            touch: document.getElementById('left-stick-btn-touch'),
            pressed: document.getElementById('left-stick-btn-pressed')
        },
        surface: {
            touch: document.getElementById('left-surface-touch'), 
            pressed: document.getElementById('left-surface-pressed')
        },
        trigger: {
            touch: document.getElementById('left-trigger-touch'), 
            pressed: document.getElementById('left-trigger-pressed')
        }
    },
    axis: {
        stickX: {
            num: document.getElementById('left-stick-x-num'),
            range: document.getElementById('left-stick-x-range')
        },
        stickY: {
            num: document.getElementById('left-stick-y-num'),
            range: document.getElementById('left-stick-y-range')
        },
        trigger: {
            num: document.getElementById('left-trigger-num'),
            range: document.getElementById('left-trigger-range')
        },
        grip: {
            num: document.getElementById('left-grip-num'),
            range: document.getElementById('left-grip-range')
        }
    },
    gyro: {
        yaw: {
            num: document.getElementById('left-yaw-num'),
            range: document.getElementById('left-yaw-range')
        },
        pitch: {
            num: document.getElementById('left-pitch-num'),
            range: document.getElementById('left-pitch-range')
        },
        roll: {
            num: document.getElementById('left-roll-num'),
            range: document.getElementById('left-roll-range')
        }
    },
    accel: {
        x: {
            num: document.getElementById('left-accel-x-num'),
            range: document.getElementById('left-accel-x-range')
        },
        y: {
            num: document.getElementById('left-accel-y-num'),
            range: document.getElementById('left-accel-y-range')
        },
        z: {
            num: document.getElementById('left-accel-z-num'),
            range: document.getElementById('left-accel-z-range')
        }
    },
    rumble: {
        num: document.getElementById('left-rumble-num'),
        range: document.getElementById('left-rumble-range'),

        test: {
            low: document.getElementById('left-rumble-test-low-btn'),
            mid: document.getElementById('left-rumble-test-mid-btn'),
            high: document.getElementById('left-rumble-test-high-btn')
        }
    }
}

let RightControllerInfoElements = {
    buttons: {
        a: {
            touch: document.getElementById('right-a-btn-touch'), 
            pressed: document.getElementById('right-a-btn-pressed') 
        },
        b: {
            touch: document.getElementById('right-b-btn-touch'), 
            pressed: document.getElementById('right-b-btn-pressed')
        },
        system: {
            touch: document.getElementById('right-system-btn-touch'), 
            pressed: document.getElementById('right-system-btn-pressed')
        },
        stickClick: {
            touch: document.getElementById('right-stick-btn-touch'),
            pressed: document.getElementById('right-stick-btn-pressed')
        },
        surface: {
            touch: document.getElementById('right-surface-touch'), 
            pressed: document.getElementById('right-surface-pressed')
        },
        trigger: {
            touch: document.getElementById('right-trigger-touch'), 
            pressed: document.getElementById('right-trigger-pressed')
        }
    },
    axis: {
        stickX: {
            num: document.getElementById('right-stick-x-num'),
            range: document.getElementById('right-stick-x-range')
        },
        stickY: {
            num: document.getElementById('right-stick-y-num'),
            range: document.getElementById('right-stick-y-range')
        },
        trigger: {
            num: document.getElementById('right-trigger-num'),
            range: document.getElementById('right-trigger-range')
        },
        grip: {
            num: document.getElementById('right-grip-num'),
            range: document.getElementById('right-grip-range')
        }
    },
    gyro: {
        yaw: {
            num: document.getElementById('right-yaw-num'),
            range: document.getElementById('right-yaw-range')
        },
        pitch: {
            num: document.getElementById('right-pitch-num'),
            range: document.getElementById('right-pitch-range')
        },
        roll: {
            num: document.getElementById('right-roll-num'),
            range: document.getElementById('right-roll-range')
        }
    },
    accel: {
        x: {
            num: document.getElementById('right-accel-x-num'),
            range: document.getElementById('right-accel-x-range')
        },
        y: {
            num: document.getElementById('right-accel-y-num'),
            range: document.getElementById('right-accel-y-range')
        },
        z: {
            num: document.getElementById('right-accel-z-num'),
            range: document.getElementById('right-accel-z-range')
        }
    },
    rumble: {
        num: document.getElementById('right-rumble-num'),
        range: document.getElementById('right-rumble-range'),

        test: {
            low: document.getElementById('right-rumble-test-low-btn'),
            mid: document.getElementById('right-rumble-test-mid-btn'),
            high: document.getElementById('right-rumble-test-high-btn')
        }
    }
}

let TrackerElements = {};

// Switch from predefined to uploaded controller config
function InitializeControllerInfoDisplays() {
    const controllerConfig = getControllerConfig();
    if (!controllerConfig) return;

    const infoColumns = document.getElementById('info-columns');
    infoColumns.innerHTML = ''; // Clear existing elements

    Object.keys(controllerConfig.devices).forEach(deviceKey => {
        const device = controllerConfig.devices[deviceKey];
        let result = {};
        let deviceElement = makeDeviceElement();

        // Buttons
        if (device.buttons) {
            result.buttons = {};
            let buttonElement = makeGroupElement();

            Object.keys(device.buttons).forEach(buttonKey => {
                const buttonInputs = device.buttons[buttonKey];

                [rowElement, result.buttons[buttonKey]] = makeBoolElement(buttonKey, buttonInputs);
                buttonElement.appendChild(rowElement);
            });

            deviceElement.appendChild(buttonElement);
        }

        // Axis
        if (device.axis) {
            result.axis = {};
            let axisElement = makeGroupElement();

            Object.keys(device.axis).forEach(axisKey => {
                const axisInputs = device.axis[axisKey];

                [rowElement, result.axis[axisKey]] = makeRangeElement(axisKey, axisInputs);
                axisElement.appendChild(rowElement);
            });

            deviceElement.appendChild(axisElement);
        }
        // Gyro
        if (device.gyro) {
            let groupElement;
            [groupElement, result.gyro] = makeGyroGroup();
            deviceElement.appendChild(groupElement);
        }
        // Accel
        if (device.accel) {
            let groupElement;
            [groupElement, result.accel] = makeAccelGroup();
            deviceElement.appendChild(groupElement);
        }
        // Rumble
        if (device.rumble) {
            let groupElement;
            [groupElement, result.rumble] = makeRumbleGroup();
            deviceElement.appendChild(groupElement);
        }

        TrackerElements[deviceKey] = result;
        infoColumns.appendChild(deviceElement);
    });



}

function makeBoolElement(name, inputs) {
    let row = {};
    let rowElement = document.createElement('div');
    rowElement.className = "grid grid-cols-3 gap-2"
    rowElement.innerHTML = "<label>" + name + "</label>";

    Object.keys(inputs).forEach(inputKey => {
        const input = inputs[inputKey];
        let span = document.createElement('span');
        span.innerText = inputKey;
        span.className = "text-center btn-" + (input ? "notactive" : "unknown");

        rowElement.appendChild(span);
        row[inputKey] = span;
    });
    
    return [rowElement, row];
}

function makeRangeElement(name) {
    let row = {};
    let rowElement = document.createElement('div');
    rowElement.className = "flex items-center justify-between gap-3"
    rowElement.innerHTML = "<label class=\"w-16\">" + name + "</label>";

    let numSpan = document.createElement('span');
    numSpan.className = "w-10 text-right";
    numSpan.innerText = "0";
    rowElement.appendChild(numSpan);
    row.num = numSpan;

    let rangeInput = document.createElement('input');
    rangeInput.type = "range";
    rangeInput.min = "0";
    rangeInput.max = "255";
    rangeInput.value = "0";
    rangeInput.className = "flex-1";
    rangeInput.disabled = true;
    rowElement.appendChild(rangeInput);
    row.range = rangeInput;
    
    return [rowElement, row];
}

function makeButtonElement(name) {
    let buttonElement = document.createElement('button');
    buttonElement.className = "rounded-full bg-gray-700 px-2 py-1 hover:bg-gray-600 flex-1";
    buttonElement.innerText = name || "Button";

    return buttonElement;
}

function makeGroupElement() {
    let groupElement = document.createElement('div');
    groupElement.className = "bg-gray-800 bg-opacity-50 rounded-lg p-3 space-y-2";

    return groupElement;
}

function makeDeviceElement() {
    let deviceElement = document.createElement('div');
    deviceElement.className = "space-y-2 flex-1";

    return deviceElement;
}

function makeGyroGroup() {
    let groupElement = makeGroupElement();

    let yawElement, yawInfo;
    [ yawElement, yawInfo ] = makeRangeElement('yaw');
    groupElement.appendChild(yawElement);

    let pitchElement, pitchInfo;
    [ pitchElement, pitchInfo ] = makeRangeElement('pitch');
    groupElement.appendChild(pitchElement);

    let rollElement, rollInfo;
    [ rollElement, rollInfo ] = makeRangeElement('roll');
    groupElement.appendChild(rollElement);

    return [groupElement, { yaw: yawInfo, pitch: pitchInfo, roll: rollInfo }];
}

function makeAccelGroup() {
    let groupElement = makeGroupElement();

    let xElement, xInfo;
    [ xElement, xInfo ] = makeRangeElement('x');
    groupElement.appendChild(xElement);

    let yElement, yInfo;
    [ yElement, yInfo ] = makeRangeElement('y');
    groupElement.appendChild(yElement);

    let zElement, zInfo;
    [ zElement, zInfo ] = makeRangeElement('z');
    groupElement.appendChild(zElement);

    return [groupElement, { x: xInfo, y: yInfo, z: zInfo }];
}

const TEST_STRENGTHS = ['low', 'mid', 'high'];

function makeRumbleGroup() {
    let groupElement = makeGroupElement();

    let rumbleElement, rumbleInfo;
    [ rumbleElement, rumbleInfo ] = makeRangeElement('rumble');
    groupElement.appendChild(rumbleElement);

    let tests = {};
    let testRowElement = document.createElement('div');
    testRowElement.className = "flex items-center justify-between gap-3";
    testRowElement.innerHTML = "<label class=\"w-16\">Test</label><span class=\"w-10\"></span>";

    TEST_STRENGTHS.forEach(strength => {
        let button = makeButtonElement(strength);
        tests[strength] = button;
        testRowElement.appendChild(button);
    });

    groupElement.appendChild(testRowElement);

    return [groupElement, { ...rumbleInfo, test: tests }];
}