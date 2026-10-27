const fs = require("fs");
const path = require("path");

module.exports = function removeAndroidInternetPermission(context) {
  const platforms = context.opts && Array.isArray(context.opts.platforms)
    ? context.opts.platforms
    : [];
  if (platforms.length > 0 && platforms.indexOf("android") === -1) {
    return;
  }

  const manifestPath = path.join(
    context.opts.projectRoot,
    "platforms/android/app/src/main/AndroidManifest.xml"
  );
  if (!fs.existsSync(manifestPath)) {
    throw new Error("AndroidManifest.xml was not found after Cordova prepare.");
  }

  const manifest = fs.readFileSync(manifestPath, "utf8");
  const sanitizedManifest = manifest.replace(
    /\s*<uses-permission\b[^>]*android:name=["']android\.permission\.INTERNET["'][^>]*\/?>/g,
    ""
  );
  if (sanitizedManifest.indexOf("android.permission.INTERNET") !== -1) {
    throw new Error("Android INTERNET permission could not be removed.");
  }
  fs.writeFileSync(manifestPath, sanitizedManifest, "utf8");
};
