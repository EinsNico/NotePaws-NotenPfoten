# Bauvorbereitung 2.5.40 – noch keine neue APK veröffentlicht

Die neue Paketidentität ist `de.nico.notenpfoten`. Diese Anleitung beschreibt den nächsten, noch ausstehenden Android-Bau. Bestehende Installationen benötigen die in [PACKAGE_ID_MIGRATION.md](PACKAGE_ID_MIGRATION.md) beschriebene Datenübernahme.

# Entwicklung und Build

## Verwendeter Stand

Version **2.5.40**, Android-Paket **de.nico.notenpfoten**, VersionCode **20540**.

Für diese Version sind die folgenden Werkzeugstände vorgesehen:

- Node.js 24.19.0
- pnpm 11.19.0; Workspace und Web-Abhängigkeiten aus `pnpm-lock.yaml`
- Cordova CLI 13.0.0 und cordova-android 15.1.0
- JDK 17, Android SDK / Build Tools 36.0.0, Gradle 8.14.2

Die Befehle unten sind für eine macOS-/Linux-Shell angegeben. Für die neue Paketidentität stehen der Android-Bau und der lokale Linux-/Signaturabgleich zunächst aus; siehe [REPRODUCIBILITY.md](REPRODUCIBILITY.md). Frühere Prüfungen gelten ausschließlich für die frühere Paketidentität. Eine F-Droid-Aufnahme ist noch nicht erfolgt.

## Abhängigkeiten installieren

Nach Installation von Node.js 24.19.0 im Projektordner:

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile --ignore-scripts
```

Der Workspace umfasst das Web-Projekt und `cordova/`. Die drei lokalen Cordova-Plugins sind vollständig unter `cordova/local-plugins/` enthalten. Die `allowBuilds`-Einstellungen bleiben wie im ursprünglichen Workspace erhalten.

**Wichtig:** Das Root-`package-lock.json` ist ein älterer npm-Stand. Für den zum ausgelieferten Web-Build passenden Paketstand `pnpm-lock.yaml` verwenden; die Versionen nicht durch einen unbemerkten Wechsel zu `npm install` austauschen. `THIRD_PARTY_NOTICES.md` dokumentiert diese historische Abweichung.

## Web-App bauen und ansehen

```sh
NODE_OPTIONS=--openssl-legacy-provider pnpm run build
python3 -m http.server 8150 --bind 127.0.0.1 --directory dist
```

Dann `http://127.0.0.1:8150/` öffnen. Die OpenSSL-Option ist wegen des älteren Webpack-Unterbaus nötig. Der Entwicklungsserver kann entsprechend mit `NODE_OPTIONS=--openssl-legacy-provider pnpm start` gestartet werden.

Die Source-Maps bleiben enthalten. `build/build.js` entfernt ausschließlich die wechselnde Hash-Kennung aus dem synthetischen Webpack-Bootstrap-Quellnamen und dessen Debug-Fußzeile. Ausführbarer Code und die Zuordnung der Debug-Positionen bleiben erhalten. Dieser reguläre Build-Schritt läuft auf macOS und Linux gleich; er übernimmt keine Daten aus einer früheren APK.

## Android-APK bauen

JDK 17 sowie Android SDK inklusive Plattform 36 und Build Tools 36.0.0 installieren. `JAVA_HOME`, `ANDROID_HOME` und `ANDROID_SDK_ROOT` auf die eigenen Installationen setzen; Java, SDK-Tools und Gradle müssen über `PATH` erreichbar sein. Es sind keine lokalen Pfade des ursprünglichen Entwicklers erforderlich.

Nach dem Web-Build die generierten Dateien nach Cordova übernehmen:

```sh
node -e "const fs=require('fs');fs.rmSync('cordova/www',{recursive:true,force:true});fs.cpSync('dist','cordova/www',{recursive:true})"
pnpm --dir cordova exec cordova plugin add cordova-plugin-vibration@3.1.1 ./local-plugins/noten-pfoten-save-data-file ./local-plugins/noten-pfoten-audio-route ./local-plugins/noten-pfoten-screen-awake --nosave
pnpm --dir cordova exec cordova platform add android@15.1.0 --nosave
pnpm --dir cordova exec cordova build android --release -- --packageType apk
```

Die explizite Plugin-Installation ist bei einem frischen Checkout erforderlich. Vibration wird zuerst registriert, damit die erzeugte Plugin-Liste auf macOS und Linux dieselbe Reihenfolge hat. `platform add` ist nur beim ersten Anlegen der generierten Android-Plattform nötig. Die Locale-, Backup-, Bildschirm-, Audio- und Datei-Plugins werden durch die enthaltenen Konfigurationsdateien und Prepare-Hooks übernommen.

Die unsignierte Release-APK liegt anschließend unter `cordova/platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk`. Eine eigene signierte Veröffentlichung benötigt ein eigenes Signatursetup mit Android Build Tools. Hinweise dazu: [Android app signing](https://developer.android.com/studio/publish/app-signing).

Für einen reproduzierbaren Vergleich mit der Entwicklersignatur muss bei Android Build Tools ab 35 die vorhandene ZIP-Ausrichtung erhalten bleiben: vorab `zipalign -P 16 -f 4` ausführen und beim anschließenden `apksigner sign` ausdrücklich `--alignment-preserved true` setzen. Das ist die vom [Signaturkopierer dokumentierte Vorgehensweise](https://github.com/obfusk/apksigcopier#what-about-signatures-made-by-apksigner-from-build-tools--3500-rc1). Signatur und 16-KB-Ausrichtung anschließend prüfen.

Der private Originalschlüssel ist absichtlich nicht enthalten. Selbst signierte Fremdbuilds können die mit dem Originalschlüssel installierte App nicht regulär aktualisieren. Ein neuer signierter Download wird erst nach erfolgreichem Bau und Prüfung bereitgestellt.

## Vorhandene Prüfskripte

Im Projekt sind vorhandene Prüfungen enthalten, z. B. `pnpm test` und gezielt `node test/welcome-tutorial.test.js`. Sie sind keine Voraussetzung zum bloßen Lesen des Codes. Einzelne historische Audit-/Integrationsprüfungen können auf interne Auditdateien verweisen, die nicht Teil dieses bereinigten Quellpakets sind.

Für die Notenbereich-Korrektur wurden 28 gezielte Prüfgruppen aus den bestehenden Melodie-/Akkord-Menü- und Griffpräzisionsprüfungen ausgeführt. Die Oberfläche wurde auch bei 320 und 360 Pixel Breite kontrolliert. Es wurden keine neue Testdatei und kein Gesamttestlauf ergänzt. Diese früheren Paketprüfungen sind historische Belege; die neue Identität wird getrennt geprüft.

Für 2.5.40 bestanden bisher neun gezielte Prüfgruppen und der Web-Bau. Ein frischer Abhängigkeitsabgleich, Android-Bau sowie reproduzierbarer Linux-/Signaturvergleich werden getrennt protokolliert. Die Metadatenprüfung eines deaktivierten Bauplans ersetzt diese Prüfungen nicht.
