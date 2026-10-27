const fs = require("fs");
const path = require("path");

// Refresh local plugin sources even when Cordova reuses an installed copy.
module.exports = function prepareAndroidAudioRoute(context) {
  const platforms = context.opts && context.opts.platforms || [];
  if (platforms.length && !platforms.includes("android")) return;
  const root = context.opts.projectRoot;
  const source = path.join(root, "local-plugins/noten-pfoten-audio-route");
  const relative = "plugins/de.nico.notenpfoten.audioroute/www/audio-route.js";
  const code = fs.readFileSync(path.join(source, "www/audio-route.js"), "utf8");
  const wrapped = 'cordova.define("de.nico.notenpfoten.audioroute.NotenPfotenAudioRoute", function(require, exports, module) {\n' + code + '\n});\n';
  for (const base of ["platform_www", "app/src/main/assets/www"]) {
    const target = path.join(root, "platforms/android", base, relative);
    if (!fs.existsSync(target)) throw new Error("Android audio-route plugin missing: " + target);
    fs.writeFileSync(target, wrapped);
  }
  const nativeTarget = path.join(root, "platforms/android/app/src/main/java/de/nico/notenpfoten/audio/AudioRoutePlugin.java");
  if (!fs.existsSync(nativeTarget)) throw new Error("Android audio-route native plugin missing.");
  fs.copyFileSync(path.join(source, "src/android/AudioRoutePlugin.java"), nativeTarget);
};
