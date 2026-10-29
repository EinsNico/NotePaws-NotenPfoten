# Lokale APK-Prüfung 2.5.40 und offene Linux-Prüfung

- App-ID `de.nico.notenpfoten`, Version 2.5.40 / 20540, Android API 24–36.
- Exakt gebauter Quellcommit: `91638a72c8ce7869ccccb864c8f254d59ac8f2c2`; spätere Änderungen betreffen nur Dokumentation.
- Signierte APK: `Noten-Pfoten-2.5.40-release.apk`, 23559535 Bytes.
- SHA-256: `af032787207a7366d3c1a32f80ef7abbed16edca5ef3d49a6bfbe7951a72f2d9`.
- Zertifikat SHA-256: `0dbca2c72dac11a04d3ef64625272b5fcf77c94f534d9449f02128c3b9553f0f`; Betreff `CN=Noten Pfoten, O=EinsNico`.
- Der bestehende private Schlüssel bleibt erhalten. Für die neue Paketidentität wurde ein neues Zertifikat verwendet; frühere Signierdateien bleiben unverändert archiviert.

Frischer Bau mit Node 24.19.0, pnpm 11.19.0, JDK 17, Gradle 8.14.2,
Cordova-Android 15.1.0 und Build Tools 36.0.0 bestanden. 87 Modellprüfungen,
Paketdaten, v2/v3-Signatur, 16-KB-Ausrichtung, ZIP-CRC, native Klassen und 94
bytegleiche eingebettete Webdateien geprüft. Der beanstandete frühere Name wurde
weder im Zertifikat noch im gesamten neuen APK-Inhalt gefunden.

F-Droids Signaturkopierer rekonstruiert aus der lokalen unsignierten APK exakt
dieselbe signierte APK. **Das ist ein lokaler Selbstvergleich; der unabhängige
Linux-Bau und F-Droid-Quellscan sind für die neue Identität noch offen.** Der
frühere erfolgreiche Linux-Vergleich einer anderen Paketidentität ersetzt ihn nicht.

Die praktische Android-/MIDI-Abnahme und Übernahme persönlicher Lernstände stehen
aus. Die Konvertierung einer synthetischen älteren Sicherung erhält deren komplette
Lern-/Statistikdaten und wurde vom aktuellen Importvalidator akzeptiert.

Siehe [Bauanleitung](BUILDING.md), [Datenübernahme](PACKAGE_ID_MIGRATION.md)
und [F-Droid-Stand](FDROID.md). Die geprüfte APK und ihre Quellen gehören zum [Release v2.5.40](https://github.com/EinsNico/NotePaws-NotenPfoten/releases/tag/v2.5.40); der unabhängige Linux-Vergleich bleibt offen.
