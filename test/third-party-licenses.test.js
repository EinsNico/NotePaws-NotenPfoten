const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const read = relativePath =>
  fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
const normalizeNewlines = value => value.replace(/\r\n/g, "\n");
const normalizeLicense = value =>
  normalizeNewlines(value)
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const sha256 = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const test = (name, action) => {
  action();
  console.log(`✓ ${name}`);
};

const dialog = read("src/components/AppInfoDialog.vue");
const german = read("src/resources/de.js");
const english = read("src/resources/en.js");
const originalLicense = read("LICENSE-MIT-ORIGINAL");
const projectLicense = read("LICENSE");
const bundledProjectLicense = read("src/resources/agpl-license.js");
const staticOriginalLicense = read("static/LICENSE.txt");
const notices = read("THIRD_PARTY_NOTICES.md");
const licenseData = require("../src/resources/third-party-licenses.v1.json");
const webComponents = licenseData.components.filter(component =>
  !component.id.startsWith("native-") && !component.id.startsWith("cordova-")
);
const webPackages = webComponents.filter(component => !component.parentComponentId);
const bundleDirectory = path.join(
  process.env.NOTEN_PFOTEN_LICENSE_DIST || path.join(projectRoot, "dist"),
  "static/js"
);
const readProductionMaps = () => {
  const mapFiles = fs.readdirSync(bundleDirectory)
    .filter(file => file.endsWith(".map"));
  assert(mapFiles.length > 0, "production source maps are required for the license audit");
  return mapFiles.map(file => JSON.parse(
    fs.readFileSync(path.join(bundleDirectory, file), "utf8")
  ));
};

test("keeps the complete original MelvilQ MIT license", () => {
  assert.strictEqual(
    normalizeNewlines(staticOriginalLicense).trimEnd(),
    normalizeNewlines(originalLicense).trimEnd()
  );
  assert(dialog.includes("Copyright 2018 MelvilQ"));
  const originalLicenseStart = dialog.indexOf("<p>Copyright 2018 MelvilQ</p>");
  const originalLicenseEnd = dialog.indexOf("</div>", originalLicenseStart);
  const renderedOriginalLicense = dialog
    .slice(originalLicenseStart, originalLicenseEnd)
    .replace(/<[^>]+>/g, " ");
  assert(
    normalizeLicense(renderedOriginalLicense).includes(normalizeLicense(originalLicense)),
    "AppInfoDialog must still contain the complete original MIT license"
  );
});

test("ships the complete AGPL-3.0 project license offline", () => {
  const match = bundledProjectLicense.match(/^export default (".*");$/m);
  assert(match, "bundled project license must export the full text");
  assert.strictEqual(JSON.parse(match[1]), projectLicense);
  assert.strictEqual(read("static/AGPL-3.0.txt"), projectLicense);
  assert(projectLicense.includes("GNU AFFERO GENERAL PUBLIC LICENSE"));
  assert(dialog.includes("showProjectLicense: false"));
  assert(dialog.includes("{{projectLicenseText}}"));
  assert.strictEqual(require("../package.json").license, "AGPL-3.0-only");
  assert.strictEqual(require("../package-lock.json").packages[""].license, "AGPL-3.0-only");
  assert.strictEqual(require("../cordova/package.json").license, "AGPL-3.0-only");
  assert.strictEqual(require("../cordova/package-lock.json").packages[""].license, "AGPL-3.0-only");
  assert.strictEqual(require("../cordova/local-plugins/noten-pfoten-save-data-file/package.json").license, "AGPL-3.0-only");
  assert(read("cordova/local-plugins/noten-pfoten-save-data-file/plugin.xml").includes("<license>AGPL-3.0-only</license>"));
});

test("contains the localized, initially collapsed open-source area", () => {
  assert(german.includes('APP_INFO_OPEN_SOURCE_TITLE: "OPEN-SOURCE-LIZENZEN"'));
  assert(english.includes('APP_INFO_OPEN_SOURCE_TITLE: "OPEN-SOURCE LICENSES"'));
  assert(dialog.includes("showOpenSource: false"));
  assert(dialog.includes("openComponents: {}"));
  assert(dialog.includes('aria-controls="app-info-open-source"'));
  assert(dialog.includes(":aria-expanded=\"showOpenSource ? 'true' : 'false'\""));
});

test("gives every shipped component complete local license metadata", () => {
  assert.strictEqual(licenseData.schemaVersion, 1);
  assert(licenseData.components.length > 0);
  const ids = new Set();
  licenseData.components.forEach(component => {
    assert(component.id && component.name && component.version && component.license);
    assert(!ids.has(component.id), `duplicate component id: ${component.id}`);
    ids.add(component.id);
    const licenseLines = licenseData.licenseTexts[component.licenseTextId];
    assert(Array.isArray(licenseLines) && licenseLines.join("\n").trim().length > 100);
    if (component.noticeTextId) {
      const noticeLines = licenseData.noticeTexts[component.noticeTextId];
      assert(Array.isArray(noticeLines) && noticeLines.join("\n").trim().length > 0);
    }
    assert(notices.includes(`| ${component.name} | ${component.version} |`));
  });
});

test("matches the audited Cordova Android 15 API-36 runtime inventory", () => {
  const auditedCoordinates = read("cordova/runtime-components-api36.txt")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
  const recordedCoordinates = licenseData.components
    .filter(component => component.id.startsWith("native-"))
    .map(component => `${component.name}:${component.version}`);
  assert.deepStrictEqual(recordedCoordinates, auditedCoordinates);
  licenseData.components
    .filter(component => component.id.startsWith("cordova-"))
    .forEach(component => {
      const installed = require(path.join(
        projectRoot, "cordova/node_modules", component.name, "package.json"
      ));
      assert.strictEqual(component.version, installed.version, component.name);
    });
});

test("matches every package named by the production Webpack source maps", () => {
  const bundledPackages = new Set();
  readProductionMaps().forEach(sourceMap => {
    (sourceMap.sources || []).forEach(source => {
      const match = source.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
      if (match) bundledPackages.add(match[1]);
    });
  });
  assert.deepStrictEqual(
    Array.from(bundledPackages).sort(),
    webPackages.map(component =>
      component.id === "vue-loader-runtime" ? "vue-loader" : component.id
    ).sort(),
    "license entries must match the shipped packages, including indirect dependencies"
  );
});

test("records the installed versions of all shipped web packages", () => {
  webPackages.forEach(component => {
    const packageName = component.id === "vue-loader-runtime"
      ? "vue-loader"
      : component.id;
    const installed = require(require.resolve(`${packageName}/package.json`, {
      paths: [
        projectRoot,
        fs.realpathSync(path.join(projectRoot, "node_modules/babel-runtime")),
        fs.realpathSync(path.join(projectRoot, "node_modules/vue-mousetrap"))
      ]
    }));
    assert.strictEqual(component.version, installed.version, packageName);
  });
});

test("keeps embedded third-party notices tied to their shipped source", () => {
  const maps = readProductionMaps();
  webComponents.filter(component => component.parentComponentId).forEach(component => {
    const parent = webPackages.find(candidate => candidate.id === component.parentComponentId);
    assert(parent, `missing parent for ${component.id}`);
    assert(component.sourcePath, `missing source path for ${component.id}`);
    const shippedSource = maps.flatMap(map => map.sources.map((source, index) => ({
      path: source,
      content: (map.sourcesContent || [])[index]
    }))).find(source => source.path.endsWith(
      `/node_modules/${parent.id}/${component.sourcePath}`
    ));
    assert(shippedSource, `${component.id} is not in the production bundle`);
    const license = licenseData.licenseTexts[component.licenseTextId].join("\n");
    assert(normalizeLicense(shippedSource.content).includes(normalizeLicense(license)),
      `${component.id} license differs from its embedded source header`);
    assert(normalizeLicense(read(component.source)).includes(normalizeLicense(license)));
  });
  const sprintf = webComponents.find(component => component.id === "abcjs-sprintf");
  assert(sprintf, "abcjs embeds a separately licensed sprintf implementation");
  assert.strictEqual(sprintf.version, "0.4");
  assert.strictEqual(sprintf.license, "BSD-3-Clause");
  assert(sprintf.copyright.includes("Alexandru Mărășteanu"));
});

test("describes the project-owned storage plugin with its current license", () => {
  const ownedPlugin = require("../cordova/local-plugins/noten-pfoten-save-data-file/package.json");
  assert(licenseData.auditBasis.excluded.some(entry =>
    entry.includes(`${ownedPlugin.name} ${ownedPlugin.version}`) &&
    entry.includes(ownedPlugin.license)
  ));
  assert(notices.includes(`derselben ${ownedPlugin.license}-Lizenz wie die App`));
});

test("copies installed package license and NOTICE files byte-for-byte apart from line endings", () => {
  const sources = {
    abcjsMit: "node_modules/.pnpm/abcjs@6.7.0/node_modules/abcjs/LICENSE.md",
    chartistMit: "node_modules/.pnpm/chartist@0.11.4/node_modules/chartist/LICENSE-MIT",
    coreJsMit: "node_modules/.pnpm/core-js@2.6.12/node_modules/core-js/LICENSE",
    lockrMit: "node_modules/.pnpm/lockr@0.8.5/node_modules/lockr/LICENSE",
    lodashMit: "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/LICENSE",
    mousetrapApacheWithExceptions: "node_modules/.pnpm/mousetrap@1.6.5/node_modules/mousetrap/LICENSE",
    vueMit: "node_modules/.pnpm/vue@2.7.16/node_modules/vue/LICENSE",
    vueChartistWtfpl: "node_modules/.pnpm/vue-chartist@2.3.1/node_modules/vue-chartist/LICENSE",
    vueI18nMit: "node_modules/.pnpm/vue-i18n@8.28.2_vue@2.7.16/node_modules/vue-i18n/LICENSE",
    vueLoaderMit: "node_modules/.pnpm/vue-loader@13.7.3_babel-core@6.26.3_supports-color@5.5.0__css-loader@0.28.11_lodash@4.1_0004031204185124cc9a23fc8dd66e54/node_modules/vue-loader/LICENSE",
    vueMousetrapMit: "node_modules/.pnpm/vue-mousetrap@1.0.1/node_modules/vue-mousetrap/LICENSE",
    webmidiMit: "node_modules/.pnpm/webmidi@2.5.3/node_modules/webmidi/LICENSE.txt",
    apache2: "cordova/node_modules/cordova-plugin-vibration/LICENSE",
    cordovaAndroidApache2: "cordova/node_modules/cordova-android/LICENSE"
  };
  Object.keys(sources).forEach(id => {
    assert.strictEqual(
      licenseData.licenseTexts[id].join("\n"),
      normalizeNewlines(read(sources[id])),
      `${id} differs from its installed source`
    );
  });
  assert.strictEqual(
    licenseData.noticeTexts.cordovaAndroid.join("\n"),
    normalizeNewlines(read("cordova/node_modules/cordova-android/NOTICE"))
  );
  assert.strictEqual(
    licenseData.noticeTexts.cordovaPluginVibration.join("\n"),
    normalizeNewlines(read("cordova/node_modules/cordova-plugin-vibration/NOTICE"))
  );
});

test("pins the two upstream license texts missing from installed npm packages", () => {
  assert.strictEqual(
    sha256(licenseData.licenseTexts.babelRuntimeMit.join("\n")),
    "f533455c5981c9213689ee68bcc54fb717d8396739781b7e30c344e94323d752"
  );
  assert.strictEqual(
    sha256(licenseData.licenseTexts.regeneratorRuntimeMit.join("\n")),
    "51887a3d47051ac2fce1210562e5b9fe0830a8a8fabeb272c2d586eeb18a05fd"
  );
});

test("renders one accessible disclosure per component without network access", () => {
  assert(dialog.includes('v-for="component in group.components"'));
  assert(dialog.includes(":aria-controls=\"componentPanelId(component.id)\""));
  assert(dialog.includes(":aria-expanded=\"isComponentOpen(component.id) ? 'true' : 'false'\""));
  assert(dialog.includes('import thirdPartyLicenseData from "../resources/third-party-licenses.v1.json"'));
  assert(!/\bfetch\s*\(|XMLHttpRequest|axios\s*[.(]/.test(dialog));
  assert(dialog.includes("overflow-y: auto"));
  assert(dialog.includes("overflow: auto"));
});

test("preserves the approved privacy text", () => {
  assert(german.includes('APP_INFO_PRIVACY_NO_ACCOUNTS: "Keine Konten oder Anmeldung"'));
  assert(german.includes('APP_INFO_PRIVACY_NO_CLOUD_BACKUP: "Keine automatische Android-Cloud-Sicherung"'));
  assert(english.includes('APP_INFO_PRIVACY_NO_ACCOUNTS: "No accounts or sign-in"'));
  assert(english.includes('APP_INFO_PRIVACY_NO_CLOUD_BACKUP: "No automatic Android cloud backup"'));
  assert(dialog.includes("APP_INFO_PRIVACY_EXPORT_NOTE"));
});

console.log("Third-party license tests passed.");
