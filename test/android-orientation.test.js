const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { ConfigParser } = require("../cordova/node_modules/cordova-common");
const AndroidManifest = require("../cordova/node_modules/cordova-android/lib/AndroidManifest");
const root = path.resolve(__dirname, "..");
let groups = 0;
function test(name, run) { run(); groups++; console.log("✓ orientation: " + name); }

test("Android preference requests all four sensor orientations in every app view", () => {
  const config = new ConfigParser(path.join(root, "cordova/config.xml"));
  assert.strictEqual(config.getPreference("Orientation", "android"), "fullSensor",
    "sensorPortrait, sensor and user can exclude reverse portrait; fullSensor permits all four");
});

test("Cordova prepare carries the orientation through to the actual main activity", () => {
  const manifest = new AndroidManifest(path.join(root,
    "cordova/platforms/android/app/src/main/AndroidManifest.xml"));
  assert.strictEqual(manifest.getActivity().getOrientation(), "fullSensor");
  const activity = manifest.doc.getroot().find("application/activity");
  const handled = new Set(activity.attrib["android:configChanges"].split("|"));
  for (const name of ["orientation", "screenSize", "screenLayout", "smallestScreenSize"])
    assert(handled.has(name), "rotation must retain Cordova's live WebView and its current exercise: " + name);
});

test("German and English installed web apps no longer request a portrait lock", () => {
  for (const file of ["static/manifest.json", "static/manifest-en.json"])
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).orientation, "any");
});

console.log("All " + groups + " orientation configuration groups passed; physical rotation needs Android verification.");
