BMP085
======

A node.js module for reading [Adafruit's Bosch BMP085 barometer](http://www.adafruit.com/products/391) sensor using i2c.

Install
-------

```
$ npm install bmp085
```

Raspberry Pi users: Remember to [enable i2c on your Pi](https://github.com/kelly/node-i2c#raspberry-pi-setup) if you haven't done already.

Also remember to use `sudo` when running your program if you haven't exported your GPIO pins to user space.

Usage
-----

The module's `read` function takes a callback function as an argument. The callback will receive an object with the temperature (in degrees Celcius) and air pressure (in hPa).

Example:

```
var BMP085 = require('bmp085'),
    barometer = new BMP085();

barometer.read(function (data) {
    if (data !== null) {
        console.log("Temperature:", data.temperature);
        console.log("Pressure:", data.pressure);
    }
});
```

Configuration
-------------

Optionnaly configure the sensor by supplying an options object to the constructor:

```
new BMP085(
    {
        'mode': 1,
        'address': 0x77,
        'device': '/dev/i2c-1'
    }
);

```

Resources
---------

* https://github.com/fiskeben/bmp085
* https://www.npmjs.com/package/bmp085
* https://www.openhub.net/p/bmp085
* https://github.com/rzr/generic-sensors-lite
