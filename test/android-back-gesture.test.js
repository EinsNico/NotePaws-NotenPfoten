const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("cordova/package.json"));
const lock = JSON.parse(read("cordova/package-lock.json"));
const installed = JSON.parse(read("cordova/node_modules/cordova-android/package.json"));
const preparedVersion = read("cordova/platforms/android/CordovaLib/src/org/apache/cordova/CordovaWebView.java");

// Cordova 15.0.0 consumes Android 16 back gestures with an empty callback.
// Pin the upstream fix so rebuilding/restoring the platform cannot revive it.
assert.strictEqual(pkg.devDependencies["cordova-android"], "15.1.0");
assert.strictEqual(lock.packages[""].devDependencies["cordova-android"], "15.1.0");
assert.strictEqual(lock.packages["node_modules/cordova-android"].version, "15.1.0");
assert.strictEqual(lock.dependencies["cordova-android"].version, "15.1.0");
assert.strictEqual(installed.version, "15.1.0");
assert(preparedVersion.includes("15.1.0"));
assert(pkg.cordova.platforms.includes("android"));

const upstream = read("cordova/node_modules/cordova-android/framework/src/org/apache/cordova/CoreAndroid.java");
const prepared = read("cordova/platforms/android/CordovaLib/src/org/apache/cordova/CoreAndroid.java");
assert.strictEqual(prepared, upstream, "prepared Android back routing must match the pinned upstream fix");
assert(upstream.includes("import androidx.activity.OnBackPressedCallback;"));
assert(!upstream.includes("import android.window.OnBackInvokedCallback;"),
  "older Android devices must not resolve the Android 13-only callback class");
assert(/handleOnBackPressed\(\)\s*\{\s*dispatchBackKeyEvent\(\);\s*\}/.test(upstream),
  "system back gestures must reach Cordova's WebView backbutton event");
assert(upstream.includes("KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK"));
assert(upstream.includes("KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK"));
assert(upstream.includes("dispatchKeyEvent(downEvent)"));
assert(upstream.includes("dispatchKeyEvent(upEvent)"));
assert(/if \(handledDown \|\| handledUp\)\s*\{\s*return;\s*\}/.test(upstream),
  "a consumed app back action must not also exit the activity");
assert(/backCallback\.setEnabled\(false\);\s*try\s*\{[\s\S]*?getOnBackPressedDispatcher\(\)\.onBackPressed\(\);[\s\S]*?finally\s*\{\s*backCallback\.setEnabled\(true\);/.test(upstream),
  "default Android back fallback must not recursively call the app callback");
assert(upstream.includes("addCallback(backPressedDispatcherOwner, backCallback)"));
assert(upstream.includes("backCallback.remove();"));

const webView = read("cordova/platforms/android/CordovaLib/src/org/apache/cordova/CordovaWebViewImpl.java");
assert(/case KeyEvent\.KEYCODE_BACK:\s*eventName = "backbutton";/.test(webView));
assert(webView.includes("sendJavascriptEvent(eventName)"));
assert(!/enableOnBackInvokedCallback=["']false["']/.test(read("cordova/config.xml")),
  "the upstream gesture fix should work without disabling modern Android navigation");

const licenseData = JSON.parse(read("src/resources/third-party-licenses.v1.json"));
assert.strictEqual(licenseData.components.find(component => component.id === "cordova-android").version, installed.version);
process.stdout.write("Android back gesture upstream fix, persistent version pin and prepared native routing verified.\n");
