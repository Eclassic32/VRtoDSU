export { setBoolValue, setRangeValue, testRumble, 
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

const HeadsetInfoElements = {
    battery: {
        level: document.getElementById('headset-battery-level'),
        charging: document.getElementById('headset-battery-charging'),
        state: document.getElementById('headset-battery-state')
    },
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

const LeftControllerInfoElements = {
    battery: {
        level: document.getElementById('left-battery-level'),
        charging: document.getElementById('left-battery-charging'),
        state: document.getElementById('left-battery-state')
    },
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
        side: {
            touch: document.getElementById('left-side-touch'), 
            pressed: document.getElementById('left-side-pressed')
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

const RightControllerInfoElements = {
    battery: {
        level: document.getElementById('right-battery-level'),
        charging: document.getElementById('right-battery-charging'),
        state: document.getElementById('right-battery-state')
    },
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
        side: {
            touch: document.getElementById('right-side-touch'), 
            pressed: document.getElementById('right-side-pressed')
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