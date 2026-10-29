# F-Droid-Aufnahme beantragt – Version 2.5.40

Der neue [Aufnahmeantrag !54845](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/54845) wurde am 29. Oktober 2026 eingereicht und ist offen. **Die App ist noch nicht im offiziellen F-Droid-Katalog verfügbar.** Prüfung, Annahme und offizieller Repository-Bau stehen aus.

Der Antrag enthält ausschließlich `metadata/de.nico.notenpfoten.yml`, Version **2.5.40 / 20540**, mit vollständigem Quellcommit `4cead571b92cef775e19e82965c55182719058da` und veröffentlichtem Tag `v2.5.40`. Der eigene Einreichungszweig lautet `codex/de.nico.notenpfoten`; sein Commit ist `d196c11c508b5f1271cf58ce6a45fa5c471c9eff`. Die vorherige Vorbereitungssperre wurde entfernt. Metadatenparser und strenger Lint bestehen.

Die bereits veröffentlichte [GitHub-APK](https://github.com/EinsNico/NotePaws-NotenPfoten/releases/tag/v2.5.40) bleibt unverändert. Der unabhängige lokale Linux-/Entwicklersignaturvergleich ist bestanden: Status 0 / „1 build succeeded“, Quellscan ohne Fehler und Warnungen, rekonstruierte APK bytegleich zum öffentlichen Download. Die tatsächliche historische Prüfbasis und ihre bytegleiche Zuordnung nach der Namensbereinigung sind im Antrag erläutert; siehe [Reproduktionsnachweis](REPRODUCIBILITY.md). In dieser Einreichungsetappe wurde keine neue APK gebaut oder signiert und kein neuer Linux-Bau gestartet.

## Noch offene Prüfung

GitLab markiert die Fork-/Antragspipelines vor dem ersten Job als fehlgeschlagen. Die Fork-Seite verlangt eine zusätzliche Identitätsprüfung des Kontos; es liefen keine Prüfjobs. Im Antrag wird F-Droid deshalb gemäß seiner Einreichungsvorlage um Start über die eigenen FOSS-Prüfsysteme gebeten. Das ist keine bereits bestandene F-Droid-CI. Die lokale Bauprüfung ersetzt F-Droids Prüfung und Annahme nicht.

Der Maintainer gibt ungefähr drei Monate aktive Entwicklung einschließlich früherer lokaler Arbeit an. Der öffentliche Verlauf ist jünger und belegt den gesamten Zeitraum nicht unabhängig; eine externe Nutzerzahl wird nicht behauptet. Die Bewertung der Aufnahmevoraussetzungen liegt bei F-Droid.

## Store-Inhalte und Signatur

Deutsche und englische Texte, Symbole und zehn Bilder je Sprache liegen unter `fastlane/metadata/android/de-DE/` und `fastlane/metadata/android/en-US/`, einschließlich Änderungstext 20540. Die Dateien werden aus dem App-Quellrepository bezogen und nicht im Antrag dupliziert.

`Binaries` und `AllowedAPKSigningKeys` sind auf die veröffentlichte Entwickler-APK und deren Zertifikat eingestellt. Damit sollen GitHub- und F-Droid-Versionen dieser neuen App-ID gemeinsam aktualisierbar bleiben, sofern F-Droids eigener Nachbau ebenfalls exakt übereinstimmt. Der private Signierschlüssel wird dafür nicht übertragen.

Der frühere [Antrag !54815](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/54815) bleibt geschlossen und wurde nicht übernommen. Sein alter Quellzweig ist entfernt; gespeicherte Antragshistorie und fremde Kopien werden dadurch nicht gelöscht. Die neue Einreichung verwendet ausschließlich die aktuelle Identität.

Die bisherige App bis zur bestätigten persönlichen Datenübernahme behalten; eigene Werkstattstücke separat sichern. Praktische Handy-/Tablet-/MIDI-Abnahme und persönliche Übernahme bleiben offen; siehe [Datenübernahme](PACKAGE_ID_MIGRATION.md) und [Prüfgrenzen](KNOWN_LIMITS.md).

[Einreichungsanleitung](https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/) · [Metadaten](https://f-droid.org/docs/Build_Metadata_Reference/) · [Reproduzierbare Builds](https://f-droid.org/docs/Reproducible_Builds/)
