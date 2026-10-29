# Reproduzierbarkeit von Version 2.5.39

Am 29. Oktober 2026 bestand ein vollständiger lokaler Lauf mit fdroidserver 2.4.5: Status 0 / 1 build succeeded. Die App ist damit noch nicht bei F-Droid eingereicht oder aufgenommen.

## Ergebnis

- App-ID: de.nico.notenpfoten; Version 2.5.39; VersionCode 20539.
- Getesteter Quellcommit: `36b0a232141ce22c2ca91a9aad86f08ccdc4e536`. Die Veröffentlichung ergänzt danach ausschließlich Dokumentation; die Build-Eingaben bleiben unverändert.
- Signierte APK: `Noten-Pfoten-2.5.39-release.apk`, 23604787 Bytes.
- SHA-256 der signierten APK: `945999b0e0ec9ab5203dc638866e0ff2266aa75ef539d36839f7be05740080ff`.
- SHA-256 der identischen unsignierten Mac-/Linux-APKs: `c7fe3860ed2a3ba62f91b56a35602e348316d70140d8243f0608476c688c29e4`.
- Alle 542 Inhaltsdateien stimmen überein. F-Droids Signaturkopierer erzeugt aus dem Linux-Bau eine bytegleiche, gültig signierte APK. Der vollständige Lauf bestätigt das erlaubte bisherige Entwickler-Zertifikat.
- Zertifikat SHA-256: `184749a8d0e22759ff54f1560f658c0ebc6898c93427ac2463ac235810eff9e7`.
- F-Droid-Quellscan einschließlich erzeugter Abhängigkeiten: 0 Fehler, 0 Warnungen; sechs deklarierte, für die App unnötige Dateien aus Build-Abhängigkeiten entfernt.

## Umgebung und Vorgehen

Debian bookworm amd64 in einem Docker-Container unter einer Lima/VZ/Rosetta-VM auf Apple Silicon. Node 24.19.0, pnpm 11.19.0, OpenJDK 17.0.21, Gradle 8.14.2, Android-Plattform 36 Revision 2 und Build Tools 36.0.0. Der Android-Abschlussbau meldete 1h 49m 52s; dies ist keine allgemeine Laufzeitprognose.

Der saubere Quellstand wurde vor der Veröffentlichung als Git-Bundle übertragen. Im Test zeigte nur die Binaries-Adresse auf einen lokalen HTTP-Download derselben signierten APK. F-Droid muss später die öffentliche GitHub-Adresse verwenden. Der private Signierschlüssel wurde nicht in die Linux-Umgebung eingebunden.

Der reguläre Web-Build stabilisiert ausschließlich die synthetische Webpack-Bootstrap-Debug-Kennung. Quellen und Positionszuordnungen bleiben erhalten. Nach zipalign wird mit `apksigner sign --alignment-preserved true` signiert; siehe [BUILDING.md](BUILDING.md).

87 bestehende Modellprüfungen sowie Web-/Android-Bau, v2/v3-Signatur, 16-KB-Ausrichtung, Paketdaten, ZIP-CRC und 94 eingebettete Webdateien wurden geprüft. Praktische Geräteabnahme mit MIDI-Hardware und F-Droids eigene Aufnahmeprüfung stehen noch aus. Keine privaten Lernstände sind Bestandteil der Quellen oder Prüfpakete.
