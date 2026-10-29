# Reproduzierbarer Android-Bau 2.5.40 – bestanden

Version **2.5.40 / 20540**, App-ID `de.nico.notenpfoten`, wurde aus einem frischen öffentlichen GitHub-Checkout unter Linux nachgebaut. Der vollständige lokale F-Droid-Lauf endet mit Status 0 und „1 build succeeded“.

- Release-Quellcommit nach Bereinigung der Git-Geschichte: `4cead571b92cef775e19e82965c55182719058da`, Tag `v2.5.40`.
- Der Git-Dateibaum dieses Tags ist gegenüber der ursprünglich geprüften Veröffentlichung unverändert: `0e697bbd9bb5f2419d65943727f80c9d601dd414`. Alle 789 Quelldateien sind bytegleich; die spätere Aktualisierung dieser Dokumentation liegt auf main.
- Unsignierte Mac-/Linux-APKs bytegleich, SHA-256 `b2396cb5056c71d55e46cbb79df584277f0e36ce11c19c38f2871312cdc5a8cd`.
- Alle 542 APK-Inhaltsdateien und ihre Reihenfolge stimmen.
- Die aus dem Linux-Nachbau mit der öffentlichen Signatur rekonstruierte APK ist exakt bytegleich zum GitHub-Download: 23559535 Bytes, SHA-256 `af032787207a7366d3c1a32f80ef7abbed16edca5ef3d49a6bfbe7951a72f2d9`.
- Entwicklerzertifikat `CN=Noten Pfoten, O=EinsNico`, SHA-256 `0dbca2c72dac11a04d3ef64625272b5fcf77c94f534d9449f02128c3b9553f0f`; Signaturen v2/v3 und 16-KB-ZIP-Ausrichtung bestätigt.
- F-Droid-Quellscan einschließlich erzeugter Abhängigkeiten: 0 Fehler, 0 Warnungen. Der private Signierschlüssel wurde nicht nach Linux übertragen.

Umgebung: Debian bookworm amd64 unter Lima/VZ/Rosetta auf Apple Silicon, Node 24.19.0, pnpm 11.19.0, JDK 17.0.21, Gradle 8.14.2, Cordova-Android 15.1.0 und Android Build Tools 36.0.0. Die Werkzeug-/Download-Caches wurden wiederverwendet; der App-Quellordner war frisch. Der Test verwendete die öffentlichen Repo- und Binaries-Adressen. Der Android-Bau dauerte 1 Min. 36 Sek.

Die Namensbereinigung schreibt die historischen Git-Kennungen um, ohne die Dateiinhalte des Release-Tags oder die signierte APK zu ändern; siehe [Projektgeschichte](HISTORY_CLEANUP.md). Der gepackte Quellcode bleibt inhaltlich identisch, sein ZIP-Kommentar und deshalb seine Prüfsumme ändern sich mit der Git-Kennung.

Dies ist eine erfolgreiche lokale Prüfung, noch keine Annahme durch F-Droid. Praktische Handy-/Tablet-/MIDI-Abnahme und Übernahme persönlicher Daten bleiben offen. Siehe [Bauanleitung](BUILDING.md), [Datenübernahme](PACKAGE_ID_MIGRATION.md) und [F-Droid-Stand](FDROID.md).
