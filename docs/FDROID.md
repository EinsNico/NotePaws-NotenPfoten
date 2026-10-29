# F-Droid-Vorbereitung

Noten Pfoten / Note Paws wird für eine Einreichung im offiziellen F-Droid-Repository vorbereitet. Eine Aufnahme oder Veröffentlichung bei F-Droid ist noch nicht erfolgt.

## Store-Eintrag und Bilder

Es gibt einen App-Eintrag mit zwei Sprachfassungen:

- `fastlane/metadata/android/de-DE/`: Noten Pfoten, deutsche Beschreibung und Bilder.
- `fastlane/metadata/android/en-US/`: Note Paws, englische Beschreibung und Bilder.

Jede Sprachfassung enthält Titel, Kurzbeschreibung, Langbeschreibung, Versionshinweise, das vorhandene 512-Pixel-Symbol und zehn Screenshots. Die Bilder zeigen die aktuelle Web-Oberfläche im Handyformat; es sind keine neu aufgenommenen nativen Android-Gerätebilder. Die Aufnahmen enthalten keine Handy-Statusleisten oder persönlichen Lernwerte. Die englische Fassung nutzt internationale Notennamen.

Die App-ID bleibt `de.nico.notenpfoten`. Sie unterscheidet sich von der ursprünglichen App von MelvilQ. Bestehende Lernstände und Paketidentität werden für diese Store-Vorbereitung nicht geändert.

## Build-Rezept

F-Droid baut die APK aus dem Quellcode. Ein passender YAML-Entwurf für `metadata/de.nico.notenpfoten.yml` wird für eine Einreichung bei `fdroid/fdroiddata` vorbereitet. Die Bauanleitung dieses Projekts steht in [BUILDING.md](BUILDING.md).

Die vorgesehenen Schritte sind:

1. Den festgelegten Quellcommit auschecken.
2. Die festgelegten Node-/pnpm-Versionen und das Android-/Gradle-Werkzeugset verwenden.
3. Web-Abhängigkeiten aus `pnpm-lock.yaml` installieren und den Produktions-Web-Build erstellen.
4. `dist/` nach `cordova/www/` kopieren und Android 15.1.0 samt den drei lokalen Plugins vorbereiten.
5. Die Quellen mit F-Droids Scanner prüfen und die unsignierte Release-APK mit Gradle bauen.
6. Das Paket auf App-ID `de.nico.notenpfoten`, Version `2.5.39` und VersionCode `20539` prüfen.

Die Versionsinformationen für spätere Updates stehen in `cordova/config.xml`. Ein vollständiger lokaler Linux-Bau mit fdroidserver 2.4.5 in einem Debian-amd64-Container unter Lima/VZ/Rosetta ist bestanden (Status 0). Die unsignierten Mac-/Linux-APKs und die mit der Entwicklersignatur rekonstruierte APK sind bytegleich. Das ist eine lokale Bauprüfung; die Aufnahmeprüfung durch das F-Droid-Team bleibt offen. Einzelheiten: [REPRODUCIBILITY.md](REPRODUCIBILITY.md).

## Signierung und Updates

Für dieses Projekt wurde die Übernahme der bisherigen Entwickler-Signatur gewählt, damit GitHub- und F-Droid-Installationen sich gegenseitig aktualisieren können. Der lokale reproduzierbare Vergleich zur GitHub-APK 2.5.39 ist bestanden. F-Droid muss den Bau und die Signatur vor einer Aufnahme selbst prüfen. Der private Schlüssel und das Passwort gehören niemals in das Repository oder zu F-Droid.

Die veröffentlichte GitHub-APK und die bestehenden Release-Tags werden durch das Hinzufügen der Store-Metadaten nicht ersetzt. F-Droid muss für den ersten Build einen Commit verwenden, der die Metadaten bereits enthält; ältere veröffentlichte Tags bleiben unverändert.

## Noch offen

- Die Einreichung ist noch nicht abgesendet; der Bauplan muss beim F-Droid-Projekt eingereicht werden.
- Aufnahmeprüfung durch das F-Droid-Team, einschließlich Wartungshistorie und freier Abhängigkeiten.
- Angaben zur Entwicklungshistorie und externen Nutzung vervollständigen und Einreichung über einen GitLab-Merge-Request vornehmen.

## Offizielle Dokumentation

- [Einreichung](https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/)
- [Metadaten und Build-Rezepte](https://f-droid.org/docs/Build_Metadata_Reference/)
- [Beschreibungen, Bilder und Sprachordner](https://f-droid.org/docs/All_About_Descriptions_Graphics_and_Screenshots/)
- [Reproduzierbare Builds und Signierung](https://f-droid.org/docs/Reproducible_Builds/)
