# Prüfgrenzen der Version 2.5.40

- Die neue Paketidentität benötigt eine separate Android-Installation und eine geprüfte Übernahme der Lernstände.
- Gezielte Prüfungen für Sicherungen, Import, native Brücken und Paketmetadaten bestehen. Die alte Sicherung wird nur über eine getrennte konvertierte Kopie übernommen; Originaldateien bleiben erhalten.
- Der frische Android-Bau, Signatur, Paketidentität, native Klassen und eingebettete Webdateien sind geprüft. Der unabhängige Linux-/Signaturvergleich ist bestanden. Native Geräte-/MIDI-Abnahme und persönliche Datenübernahme stehen aus.
- Die normale Lernstandssicherung übernimmt die getrennte Notenwerkstatt nicht vollständig. Eigene Stücke müssen zusätzlich exportiert und praktisch geprüft werden.
- Vue 2 und Webpack benötigen mit aktuellen Node-Versionen die OpenSSL-Option aus BUILDING.md. Für passende Abhängigkeiten pnpm und das vorhandene Lockfile verwenden.
- Die App ist noch nicht im offiziellen F-Droid-Katalog verfügbar. Der bisherige Antrag wurde geschlossen; ein neuer ist noch nicht eingereicht.
- Ältere GitHub-Veröffentlichungen wurden zurückgezogen und die erreichbare Git-Geschichte auf den aktuellen Namen umgestellt. Bereits verbreitete Kopien oder gespeicherte Plattformansichten können dadurch nicht vollständig entfernt werden; siehe HISTORY_CLEANUP.md.
