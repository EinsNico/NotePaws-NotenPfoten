const fs = require("fs");
const path = require("path");

// Cordova can keep an older plugin web asset in platform_www after a local
// plugin update. Its loader also requires a cordova.define module, not the
// bare CommonJS file from the local plugin directory.
module.exports = function prepareAndroidSaveDataPlugin(context) {
  const platforms = context.opts && Array.isArray(context.opts.platforms)
    ? context.opts.platforms : [];
  if (platforms.length > 0 && platforms.indexOf("android") === -1) return;

  const root = context.opts.projectRoot;
  const pluginFile = "plugins/de.nico.notenpfoten.savedatafile/www/save-data-file.js";
  const source = path.join(root, "local-plugins/noten-pfoten-save-data-file/www/save-data-file.js");
  const destinations = [
    path.join(root, "platforms/android/platform_www", pluginFile),
    path.join(root, "platforms/android/app/src/main/assets/www", pluginFile)
  ];
  const moduleId = "de.nico.notenpfoten.savedatafile.NotenPfotenSaveDataFile";
  const sourceCode = fs.readFileSync(source, "utf8");
  const current = `cordova.define(${JSON.stringify(moduleId)}, function(require, exports, module) {\n${sourceCode}\n});\n`;
  for (const destination of destinations) {
    if (!fs.existsSync(destination)) {
      throw new Error(`Android save-data plugin asset is missing: ${destination}`);
    }
    fs.writeFileSync(destination, current);
    if (fs.readFileSync(destination, "utf8") !== current) {
      throw new Error(`Android save-data plugin asset is stale: ${destination}`);
    }
  }
  const nativeDirectory = path.join(root,
    "platforms/android/app/src/main/java/de/nico/notenpfoten/savedata");
  if (!fs.existsSync(path.join(nativeDirectory, "SaveDataFilePlugin.java"))) {
    throw new Error("Android save-data native plugin is missing.");
  }
  for (const filename of ["SaveDataFilePlugin.java", "BackupFileSizeVerifier.java"]) {
    fs.copyFileSync(path.join(root,
      "local-plugins/noten-pfoten-save-data-file/src/android", filename),
    path.join(nativeDirectory, filename));
  }
};
