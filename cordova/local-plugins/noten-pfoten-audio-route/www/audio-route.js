var exec = require("cordova/exec");
exports.watch = function(success, error) { exec(success, error, "NotenPfotenAudioRoute", "watch", []); };
exports.unwatch = function(success, error) { exec(success, error, "NotenPfotenAudioRoute", "unwatch", []); };
exports.getState = function(success, error) { exec(success, error, "NotenPfotenAudioRoute", "getState", []); };
