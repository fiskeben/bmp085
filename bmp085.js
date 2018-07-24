var Wire = require('i2c'),
    EventEmitter = require('events').EventEmitter,
    debug,
    defaultOptions = {
        'debug' : false,
        'address' : 0x77,
        'device' : '/dev/i2c-1',
        'mode' : 1
    };

var BMP085 = function (opts) {
    var self = this;
    self.options = Object.assign(defaultOptions, opts);
    self.events = new EventEmitter();
    self.wire = new Wire(this.options.address, {device: this.options.device, debug: this.options.debug});
    self.calibrationData = {};

    self.events.on('calibrated', function () {
        self.readData(self.userCallback);
    });

    debug = self.options.debug;
};

BMP085.prototype.modes = {
    'ULTRA_LOW_POWER' : 0,
    'STANDARD' : 1,
    'HIGHRES' : 2,
    'ULTRA_HIGHRES' : 3
};

BMP085.prototype.getTimeToWait = function () {
    var timeToWait = 8;
    switch (this.options.mode) {
        case this.modes.ULTRA_LOW_POWER:
            timeToWait = 5;
            break;
        case this.modes.HIGHRES:
            timeToWait = 14;
            break;
        case this.modes.ULTRA_HIGHRES:
            timeToWait = 26;
            break;
    }
    return timeToWait;
};

BMP085.prototype.calibrationRegisters = [
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
];

BMP085.prototype.registers = {
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
};

BMP085.prototype.commands = {
    'readTemp':  0x2E,
    'readPressure':  0x34
};

BMP085.prototype.unsigned = function(number) {
    if (number > 127) {
        number -= 256;
    }
    return number;
};

BMP085.prototype.readWord = function (register, length, callback) {
    var self = this;

    if (typeof length == 'function') {
        callback = length;
        length = 2;
    }

    self.wire.readBytes(register.location, length, function(err, bytes) {
        if (err) {
            return callback(err, null, null);
        }

        var hi = bytes.readUInt8(0),
            lo = bytes.readUInt8(1),
            value;

        if (register.type !== 'uint16') {
            hi = self.unsigned(hi);
        }

        value = (hi << 8) + lo;
        callback(null, register, value);
    });
};

BMP085.prototype.calibrate = function (callback) {
    var register,
        i,
        ready = true,
        self = this;
     this.calibrationRegisters.forEach(function(register) {
        if (typeof self.calibrationData[register.name] === 'undefined') {
            ready = false;
            self.readWord(register, function(err, reg, value) {
                if (!err) {
                    self.calibrationData[reg.name] = value;
                }
            });
        }
    });

    if (ready) {
      callback && callback(null);
      return self.events.emit('calibrated');
    }

    self.calibrationAttempts = self.calibrationAttempts || 0;
    if (42 * self.calibrationRegisters.length >= ++self.calibrationAttempts) {
        setTimeout(function () {
            self.calibrate(callback);
        }, self.getTimeToWait());
    } else {
        callback && callback("error: Calibration failed " + self.calibrationAttempts);
    }

};

BMP085.prototype.readData = function (callback) {
    var self = this;

    self.readTemperature(function (err, rawTemperature) {
        if (err && callback) {
            return callback(null);
        }
        self.readPressure(function (err, rawPressure) {
            if (err && callback) {
                 return callback(null);
            }
            var temperature = self.convertTemperature(rawTemperature),
                pressure = self.convertPressure(rawPressure);
            if (callback) {
                callback({'temperature': temperature, 'pressure': pressure});
            }
        });
    });
};

BMP085.prototype.readTemperature = function (callback) {
    var self = this;

    log("Read temp", self.registers.control.location, self.commands.readTemp);
    self.wire.writeBytes(self.registers.control.location, new Buffer([self.commands.readTemp]), function(err) {
        if (err && callback) {
            return callback(err);
        }
        setTimeout(function() {
            self.readWord(self.registers.tempData, function(err, reg, value) {
                callback(err, value);
            });
        }, 5);
    });
};

BMP085.prototype.convertTemperature = function (raw) {
    var calibrationData = this.calibrationData;

    var x1 = ((raw - calibrationData.ac6) * calibrationData.ac5) >> 15,
        x2 = (calibrationData.mc << 11) / (x1 + calibrationData.md),
        temperature;

    calibrationData.b5 = x1 + x2;
    temperature = ((calibrationData.b5 + 8) >> 4) / 10.0;
    return temperature;
};

BMP085.prototype.readPressure = function (callback) {
    var self = this;

    self.wire.writeBytes(self.registers.control.location, new Buffer([self.commands.readPressure + (self.options.mode << 6)]), function(err) {
        if (err && callback) {
            return callback(err);
        }
        var timeToWait = self.getTimeToWait();
        setTimeout(function() {
            self.wire.readBytes(self.registers.pressureData.location, 3, function(err, bytes) {
                if (err && callback) {
                    return callback(err, null);
                }
                var msb = bytes.readUInt8(0),
                    lsb = bytes.readUInt8(1),
                    xlsb = bytes.readUInt8(2),
                    value = ((msb << 16) + (lsb << 8) + xlsb) >> (8 - self.options.mode);
                callback && callback(err, value);
            });
        }, timeToWait);
    });
};

BMP085.prototype.convertPressure = function (raw) {
    var calibrationData = this.calibrationData;

    var b6 = calibrationData.b5 - 4000;
    var x1 = (calibrationData.b2 * (b6 * b6) >> 12) >> 11;
    var x2 = (calibrationData.ac2 * b6) >> 11;
    var x3 = x1 + x2;
    var b3 = (((calibrationData.ac1 * 4 + x3) << this.options.mode) + 2) / 4;

    x1 = (calibrationData.ac3 * b6) >> 13;
    x2 = (calibrationData.b1 * ((b6 * b6) >> 12)) >> 16;
    x3 = ((x1 + x2) + 2) >> 2;
    var b4 = (calibrationData.ac4 * (x3 + 32768)) >> 15;
    var b7 = (raw - b3) * (50000 >> this.options.mode);
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

BMP085.prototype.read = function (callback) {
    var self = this;
    this.userCallback = callback;
    this.calibrate(function(err) {
        if (err && callback) {
            log("bmp085: " + err);
            callback(null);
        }
    });
};

var log = function () {
    if (debug) {
        console.log.apply("DBG", arguments);
    }
};

module.exports = BMP085;
