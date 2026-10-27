var exec = require("cordova/exec");
exports.setEnabled = function(enabled, success, error) {
  exec(success, error, "NotenPfotenScreenAwake", "setEnabled", [enabled === true]);
};
