import { getControllerConfig } from "./controllerConfig.js";

export { setBoolValue, setRangeValue, testRumble, InitializeControllerInfoDisplays, TrackerElements};

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

        // Title
        let titleElement = makeTitleElement(deviceKey);
        deviceElement.appendChild(titleElement);

        // Buttons
        if (device.buttons) {
            result.buttons = {};
            let buttonElement = makeGroupElement();

            Object.keys(device.buttons).forEach(buttonKey => {
                const buttonInputs = device.buttons[buttonKey];

                let rowElement;
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

                let rowElement;
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

    console.log(TrackerElements);
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

function makeTitleElement(name) {
    let titleElement = makeGroupElement();
    titleElement.classList.add("font-bold", "text-center", "text-lg");
    titleElement.innerText = name || "Device";

    return titleElement;
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
    [ yawElement, yawInfo ] = makeRangeElement('Yaw');
    groupElement.appendChild(yawElement);

    let pitchElement, pitchInfo;
    [ pitchElement, pitchInfo ] = makeRangeElement('Pitch');
    groupElement.appendChild(pitchElement);

    let rollElement, rollInfo;
    [ rollElement, rollInfo ] = makeRangeElement('Roll');
    groupElement.appendChild(rollElement);

    return [groupElement, { Yaw: yawInfo, Pitch: pitchInfo, Roll: rollInfo }];
}

function makeAccelGroup() {
    let groupElement = makeGroupElement();

    let xElement, xInfo;
    [ xElement, xInfo ] = makeRangeElement('X');
    groupElement.appendChild(xElement);

    let yElement, yInfo;
    [ yElement, yInfo ] = makeRangeElement('Y');
    groupElement.appendChild(yElement);

    let zElement, zInfo;
    [ zElement, zInfo ] = makeRangeElement('Z');
    groupElement.appendChild(zElement);

    return [groupElement, { X: xInfo, Y: yInfo, Z: zInfo }];
}

const TEST_STRENGTHS = ['Low', 'Mid', 'High'];

function makeRumbleGroup() {
    let groupElement = makeGroupElement();

    let rumbleElement, rumbleInfo;
    [ rumbleElement, rumbleInfo ] = makeRangeElement('Rumble');
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