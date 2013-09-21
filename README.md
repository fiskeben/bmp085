BMP085
======

A node.js module for reading [Adafruit's Bosch BMP085 barometer](http://www.adafruit.com/products/391) sensor using i2c.

Install
-------

```
$ npm install bmp085
```

Usage
-----

The module exports one function, `read` which takes a callback function as an argument. The callback will receive an object with the temperature (in degrees Celcius) and air pressure (in hPa).

Example:

```
var bmp085 = require('bmp085');
bmp085.read(function (data) {
    console.log("Temperature:", data.temperature);
    console.log("Pressure:", data.pressure);
});
```
