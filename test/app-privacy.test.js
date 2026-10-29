const assert = require("assert");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

test("uses Noten Pfoten and Note Paws as the complete visible app names", () => {
  const germanManifest = JSON.parse(read("static/manifest.json"));
  const englishManifest = JSON.parse(read("static/manifest-en.json"));
  const cordovaConfig = read("cordova/config.xml");
  const englishAndroidStrings = read(
    "cordova/locales/android/values-en/strings.xml"
  );

  assert.strictEqual(germanManifest.name, "Noten Pfoten");
  assert.strictEqual(germanManifest.short_name, "Noten Pfoten");
  assert.strictEqual(englishManifest.name, "Note Paws");
  assert.strictEqual(englishManifest.short_name, "Note Paws");
  assert(cordovaConfig.indexOf("<name>Noten Pfoten</name>") !== -1);
  assert(englishAndroidStrings.indexOf(">Note Paws<") !== -1);
});

test("keeps the active package metadata aligned", () => {
  const rootPackage = JSON.parse(read("package.json"));
  const rootLock = JSON.parse(read("package-lock.json"));
  const cordovaPackage = JSON.parse(read("cordova/package.json"));
  const cordovaLock = JSON.parse(read("cordova/package-lock.json"));
  const licenseData = JSON.parse(
    read("src/resources/third-party-licenses.v1.json")
  );
  const cordovaConfig = read("cordova/config.xml");

  assert(/^\d+\.\d+\.\d+$/.test(rootPackage.version));
  assert.strictEqual(rootLock.version, rootPackage.version);
  assert.strictEqual(rootLock.packages[""].version, rootPackage.version);
  assert.strictEqual(cordovaPackage.version, rootPackage.version);
  assert.strictEqual(cordovaLock.version, rootPackage.version);
  assert.strictEqual(cordovaLock.packages[""].version, rootPackage.version);
  assert(/^\d+\.\d+\.\d+$/.test(licenseData.generatedForAppVersion));
  assert(cordovaConfig.indexOf('id="de.nico.notenpfoten"') !== -1);
  assert(cordovaConfig.indexOf(`version="${rootPackage.version}"`) !== -1);
  const [major, minor, patch] = rootPackage.version.split(".").map(Number);
  assert(cordovaConfig.indexOf(
    `android-versionCode="${major * 10000 + minor * 100 + patch}"`
  ) !== -1);
});

test("uses the localized Noten Pfoten and Note Paws in-app wordmark", () => {
  const germanTranslations = read("src/resources/de.js");
  const englishTranslations = read("src/resources/en.js");
  const wordmark = read("src/components/BrandWordmark.vue");
  const homeMenu = read("src/components/HomeMenu.vue");
  const infoDialog = read("src/components/AppInfoDialog.vue");

  assert(germanTranslations.indexOf('APP_BRAND_NAME: "Noten Pfoten"') !== -1);
  assert(englishTranslations.indexOf('APP_BRAND_NAME: "Note Paws"') !== -1);
  const artwork = fs.readFileSync(path.join(projectRoot, "static/notenpfoten-wordmarks-v1.png"));
  assert.strictEqual(require("crypto").createHash("sha256").update(artwork).digest("hex"),
    "44912fd6c145ba8a0a6adb42adf3ef006feae459da16b5befb768d2f894e6e54");
  assert(fs.existsSync(path.join(projectRoot, "static/notenpfoten-wordmark-de-transparent.png")));
  assert(fs.existsSync(path.join(projectRoot, "static/notenpfoten-wordmark-en-transparent.png")));
  assert(wordmark.indexOf('src: "static/notenpfoten-wordmark-de-transparent.png"') !== -1);
  assert(wordmark.indexOf('src: "static/notenpfoten-wordmark-en-transparent.png"') !== -1);
  assert(wordmark.indexOf('this.$i18n.locale') !== -1);
  assert(wordmark.indexOf('WORDMARKS[language] || WORDMARKS.de') !== -1);
  assert(wordmark.indexOf("background: linear-gradient") === -1);
  assert(germanTranslations.indexOf('NOTEN_PFOTEN_TAGLINE: "Noten lesen. Schritt für Schritt."') !== -1);
  assert(homeMenu.indexOf('<BrandWordmark />') !== -1);
  assert(homeMenu.indexOf(':aria-label="$t(\'APP_BRAND_NAME\')"') !== -1);
  assert(infoDialog.indexOf('<BrandWordmark />') !== -1);
});

test("uses the current backup identity consistently for exports and merges", () => {
  const backup = read("src/model/SaveDataBackup.js");
  const merge = read("src/model/SaveDataMerge.js");

  assert(backup.indexOf('SAVE_DATA_BACKUP_FORMAT = "noten-pfoten-save-data"') !== -1);
  assert(backup.indexOf('name: "Noten Pfoten"') !== -1);
  assert(merge.indexOf('name: "Noten Pfoten"') !== -1);
});

test("keeps Android app data out of automatic backups and transfers", () => {
  const cordovaConfig = read("cordova/config.xml");
  const legacyRules = read("cordova/resources/android/xml/backup_rules.xml");
  const extractionRules = read(
    "cordova/resources/android/xml/data_extraction_rules.xml"
  );

  assert(cordovaConfig.indexOf('android:allowBackup="false"') !== -1);
  assert(cordovaConfig.indexOf('android:fullBackupContent="@xml/backup_rules"') !== -1);
  assert(cordovaConfig.indexOf('android:dataExtractionRules="@xml/data_extraction_rules"') !== -1);
  assert(legacyRules.indexOf('<exclude domain="sharedpref" path="."') !== -1);
  assert(extractionRules.indexOf("<cloud-backup>") !== -1);
  assert(extractionRules.indexOf("<device-transfer>") !== -1);
  assert(extractionRules.indexOf('<exclude domain="sharedpref" path="."') !== -1);
  assert(extractionRules.indexOf('<exclude domain="device_') === -1);
});

test("removes Android network permission in the final manifest merge", () => {
  const cordovaConfig = read("cordova/config.xml");
  const privacyHook = read("cordova/scripts/prepare-android-privacy.js");
  assert(cordovaConfig.indexOf('src="scripts/prepare-android-privacy.js"') !== -1);
  assert(privacyHook.indexOf("android.permission.INTERNET") !== -1);
  assert(privacyHook.indexOf("could not be removed") !== -1);
});

test("shows the verified privacy summary inside the existing info dialog", () => {
  const infoDialog = read("src/components/AppInfoDialog.vue");
  assert(infoDialog.indexOf('class="app-info-hero"') !== -1);
  assert(infoDialog.indexOf('class="app-info-introduction"') !== -1);
  assert(infoDialog.indexOf('class="app-info-sections"') !== -1);
  assert(infoDialog.indexOf("Version 1.3.0 information design") !== -1);
  assert(infoDialog.indexOf("showPrivacy: false") !== -1);
  assert(infoDialog.indexOf('aria-controls="app-info-privacy"') !== -1);
  assert(infoDialog.indexOf("APP_INFO_PRIVACY_NO_ACCOUNTS") !== -1);
  assert(infoDialog.indexOf("APP_INFO_PRIVACY_NO_TRANSFER") !== -1);
  assert(infoDialog.indexOf("APP_INFO_PRIVACY_NO_CLOUD_BACKUP") !== -1);
  assert(infoDialog.indexOf("APP_INFO_PRIVACY_EXPORT_NOTE") !== -1);
});

test("shows separate, initially collapsed legal information in both languages", () => {
  const infoDialog = read("src/components/AppInfoDialog.vue");
  const germanTranslations = read("src/resources/de.js");
  const englishTranslations = read("src/resources/en.js");

  assert(infoDialog.indexOf("showLegal: false") !== -1);
  assert(infoDialog.indexOf('aria-controls="app-info-legal"') !== -1);
  assert(infoDialog.indexOf("APP_INFO_LEGAL_PROJECT_NAMES") !== -1);
  assert(germanTranslations.indexOf('APP_INFO_LEGAL_COPYRIGHT: "© 2026 NicronTheFox"') !== -1);
  assert(germanTranslations.indexOf('APP_INFO_LEGAL_SOURCE_LICENSE: "Das Gesamtprojekt steht unter AGPL-3.0; der ursprüngliche Projektcode behält seinen MIT-Lizenzhinweis."') !== -1);
  assert(englishTranslations.indexOf('APP_INFO_LEGAL_SOURCE_LICENSE: "The combined project is under AGPL-3.0; the original project code retains its MIT license notice."') !== -1);
});

test("offers a clearly labeled app information button on the home screen", () => {
  const menu = read("src/components/HomeMenu.vue");
  const germanTranslations = read("src/resources/de.js");
  const englishTranslations = read("src/resources/en.js");

  assert(menu.indexOf('class="home-info-button"') !== -1);
  assert(menu.indexOf('@click="showAppInfo = true"') !== -1);
  assert(menu.indexOf("this.$refs.appInfoTrigger") !== -1);
  assert(germanTranslations.indexOf('HOME_APP_INFO: "App-Info"') !== -1);
  assert(germanTranslations.indexOf('HOME_APP_INFO_DESCRIPTION: "Datenschutz, Rechtliches und Lizenzen"') !== -1);
  assert(englishTranslations.indexOf('HOME_APP_INFO: "App Info"') !== -1);
  assert(englishTranslations.indexOf('HOME_APP_INFO_DESCRIPTION: "Privacy, legal information and licenses"') !== -1);
});

process.stdout.write("App identity and privacy configuration tests passed.\n");
