const fs = require("fs");
const path = require("path");

// Refresh the installed local plugin on every prepare, matching the audio bridge.
module.exports = function prepareAndroidScreenAwake(context) {
  const platforms = context.opts && context.opts.platforms || [];
  if (platforms.length && !platforms.includes("android")) return;
  const root = context.opts.projectRoot;
  const source = path.join(root, "local-plugins/noten-pfoten-screen-awake");
  const relative = "plugins/de.nico.notenpfoten.screenawake/www/screen-awake.js";
  const code = fs.readFileSync(path.join(source, "www/screen-awake.js"), "utf8");
  const wrapped = 'cordova.define("de.nico.notenpfoten.screenawake.NotenPfotenScreenAwake", function(require, exports, module) {\n' + code + '\n});\n';
  for (const base of ["platform_www", "app/src/main/assets/www"]) {
    const target = path.join(root, "platforms/android", base, relative);
    if (!fs.existsSync(target)) throw new Error("Android screen-awake plugin missing: " + target);
    fs.writeFileSync(target, wrapped);
  }
  const nativeTarget = path.join(root, "platforms/android/app/src/main/java/de/nico/notenpfoten/screen/ScreenAwakePlugin.java");
  if (!fs.existsSync(nativeTarget)) throw new Error("Android screen-awake native plugin missing.");
  fs.copyFileSync(path.join(source, "src/android/ScreenAwakePlugin.java"), nativeTarget);
};
