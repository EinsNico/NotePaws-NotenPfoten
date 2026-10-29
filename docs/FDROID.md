# F-Droid-Vorbereitung nach Paketumstellung

Der bisherige [Aufnahmeantrag !54815](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/54815)
wurde am 29. Oktober 2026 auf Wunsch des Maintainers geschlossen und nicht übernommen.
Die App ist noch nicht im offiziellen F-Droid-Katalog verfügbar.

Der neue Arbeitsstand **2.5.40 / 20540** verwendet `de.nico.notenpfoten`.
Die neue APK ist lokal signiert und technisch geprüft. Ihr unabhängiger Linux-/Signaturvergleich steht aus. Der lokale Bauplan ist
während der Umstellung deaktiviert und darf noch nicht eingereicht werden.

Deutsche und englische Texte, Symbole und zehn Bilder je Sprache liegen unter
`fastlane/metadata/android/de-DE/` und `fastlane/metadata/android/en-US/`.
Die gezeigte Oberfläche bleibt bei dieser technischen Umstellung erhalten.

Gemeinsame Updates zwischen zukünftigen GitHub- und F-Droid-Installationen der neuen
Paketidentität sind weiterhin gewünscht. Der bisherige Signierschlüssel bleibt
erhalten. Eine Installation mit der vorherigen Kennung kann jedoch nicht direkt
aktualisiert werden; siehe [Datenübernahme](PACKAGE_ID_MIGRATION.md).

Vor einem neuen Antrag: Quellscan und reproduzierbaren
Linux-Bau mit Entwickler-Signaturvergleich bestehen, GitHub-Quellstand/Tag/APK/ZIP/
Prüfsummen abgleichen und öffentlich bereitstellen. Entwicklungshistorie und
Aufnahme werden weiterhin von den F-Droid-Maintainern geprüft.

[Einreichungsanleitung](https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/)
· [Metadaten](https://f-droid.org/docs/Build_Metadata_Reference/)
· [Reproduzierbare Builds](https://f-droid.org/docs/Reproducible_Builds/)
