var Bmp085 = require('./bmp085'),
    testStandardMode = function () {
        var barometer = new Bmp085();
        barometer.read(function (data) {
            console.log("Standard mode", data);
            testHighresMode();
        });
    },
    testHighresMode = function () {
        var barometer = new Bmp085({'mode':2});
        barometer.read(function (data) {
            console.log("Highres mode", data);
            testUltraHighresMode();
        });

    },
    testUltraHighresMode = function () {
        var barometer = new Bmp085({'mode':3});
        barometer.read(function (data) {
            console.log("Ultra highres mode", data);
        });
    },
    startTest = function () {
        testStandardMode();
    };

startTest();
