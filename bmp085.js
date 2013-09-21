var Wire = require('i2c'),
    EventEmitter = require('events').EventEmitter,
    events = new EventEmitter(),
    debug = false,
    address = 0x77,
    device = '/dev/i2c-1',
    mode = 1,
    wire = new Wire(address),
    calibrationRegisters = [
        {
            'name': 'ac1',
            'location': 0xAA
        },
        {
            'name': 'ac2',
            'location': 0xAC
        },
        {
            'name': 'ac3',
            'location': 0xAE
        },
        {
            'name': 'ac4',
            'location': 0xB0,
            'type': 'uint16'
        },
        {
            'name': 'ac5',
            'location': 0xB2,
            'type': 'uint16'
        },
        {
            'name': 'ac6',
            'location': 0xB4,
            'type': 'uint16'
        },
        {
            'name': 'b1',
            'location': 0xB6
        },
        {
            'name': 'b2',
            'location': 0xB8
        },
        {
            'name': 'mb',
            'location': 0xBA
        },
        {
            'name': 'mc',
            'location': 0xBC
        },
        {
            'name': 'md',
            'location': 0xBE
        }
    ],
    registers = {
        'control': {
            'location': 0xF4,
        },
        'tempData': {
            'location': 0xF6,
            'type': 'uint16'
        },
        'pressureData': {
            'location': 0xF6,
        }
    },
    commands = {
        'readTemp':  0x2E,
        'readPressure':  0x34
    },
    calibrationData = {};

var unsigned = function(number) {
    if (number > 127) {
        number -= 256;
    }
    return number;
};

var readWord = function (register, length, callback) {
    if (typeof length == 'function') {
        callback = length;
        length = 2;
    }

    wire.readBytes(register.location, length, function(err, bytes) {
        if (err) {
            throw(err);
        }

        var hi = bytes.readUInt8(0),
            lo = bytes.readUInt8(1),
            value;

        if (register.type !== 'uint16') {
            hi = unsigned(hi);
        }

        value = (hi << 8) + lo;
        callback(register, value);
    });
};

var calibrate = function () {
    waitForCalibrationData();
    calibrationData = {};
    calibrationRegisters.forEach(function(register) {
        readWord(register, function(reg, value) {
            calibrationData[reg.name] = value;
        });
    });
};

var waitForCalibrationData = function () {
    var register,
        i,
        ready = true;
    for (i = 0; i < calibrationRegisters.length; i++) {
        register = calibrationRegisters[i];
        if (typeof calibrationData[register.name] === 'undefined') {
            ready = false;
        }
    }
    if (ready) {
        events.emit('calibrated');
    } else {
        setTimeout(function () {
            waitForCalibrationData();
        }, 50);
    }
};

var readData = function (callback) {
    readTemperature(function (rawTemperature) {
        readPressure(function (rawPressure) {
            var temperature = convertTemperature(rawTemperature),
                pressure = convertPressure(rawPressure);
            callback({'temperature': temperature, 'pressure': pressure});
        });
    });
};

var readTemperature = function (callback) {
    log("Read temp", registers.control.location, commands.readTemp);
    wire.writeBytes(registers.control.location, new Buffer([commands.readTemp]), function(err) {
        if (err) {
            throw(err);
        }
        setTimeout(function() {
            readWord(registers.tempData, function(reg, value) {
                callback(value);
            });
        }, 5);
    });
};

var convertTemperature = function (raw) {
    var x1 = ((raw - calibrationData.ac6) * calibrationData.ac5) >> 15,
        x2 = (calibrationData.mc << 11) / (x1 + calibrationData.md),
        temperature;

    calibrationData.b5 = x1 + x2;
    temperature = ((calibrationData.b5 + 8) >> 4) / 10.0;
    return temperature;
};

var readPressure = function (callback) {
    wire.writeBytes(registers.control.location, new Buffer([commands.readPressure + (mode << 6)]), function(err) {
        if (err) {
            throw(err);
        }
        setTimeout(function() {
            wire.readBytes(registers.pressureData.location, 3, function(err, bytes) {
                if (err) {
                    throw(err);
                }
                var msb = bytes.readUInt8(0),
                    lsb = bytes.readUInt8(1),
                    xlsb = bytes.readUInt8(2),
                    value = ((msb << 16) + (lsb << 8) + xlsb) >> (8 - mode);
                callback(value);
            });
        }, 8);
    });
};

var convertPressure = function (raw) {
    var b6 = calibrationData.b5 - 4000;
    var x1 = (calibrationData.b2 * (b6 * b6) >> 12) >> 11;
    var x2 = (calibrationData.ac2 * b6) >> 11;
    var x3 = x1 + x2;
    var b3 = (((calibrationData.ac1 * 4 + x3) << mode) + 2) / 4;

    x1 = (calibrationData.ac3 * b6) >> 13;
    x2 = (calibrationData.b1 * ((b6 * b6) >> 12)) >> 16;
    x3 = ((x1 + x2) + 2) >> 2;
    var b4 = (calibrationData.ac4 * (x3 + 32768)) >> 15;
    var b7 = (raw - b3) * (50000 >> mode);
    var p;

    if (b7 < 0x80000000) {
        p = (b7 * 2) / b4;
    } else {
        p = (b7 / b4) * 2;
    }

    x1 = (p >> 8) * (p >> 8);
    x1 = (x1 * 3038) >> 16;
    x2 = (-7375 * p) >> 16;

    p = p + ((x1 + x2 + 3791) >> 4);
    p = p / 100; // hPa
    
    return p;
};

var log = function () {
    if (debug) {
        console.log.apply("DBG", arguments);
    }
};

exports.readBarometer = function (callback) {
    events.on('calibrated', function () {
        readData(callback);
    });
    calibrate();
};
