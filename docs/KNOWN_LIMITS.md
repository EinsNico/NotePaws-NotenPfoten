# Prüfgrenzen der Version 2.5.40

- Die neue Paketidentität benötigt eine separate Android-Installation und eine geprüfte Übernahme der Lernstände.
- Gezielte Prüfungen für Sicherungen, Import, native Brücken und Paketmetadaten bestehen. Die alte Sicherung wird nur über eine getrennte konvertierte Kopie übernommen; Originaldateien bleiben erhalten.
- Der frische Android-Bau, Signatur, Paketidentität, native Klassen und eingebettete Webdateien sind geprüft. Native Geräte-/MIDI-Abnahme und unabhängiger Linux-/Signaturvergleich stehen aus.
- Die normale Lernstandssicherung übernimmt die getrennte Notenwerkstatt nicht vollständig. Eigene Stücke müssen zusätzlich exportiert und praktisch geprüft werden.
- Vue 2 und Webpack benötigen mit aktuellen Node-Versionen die OpenSSL-Option aus BUILDING.md. Für passende Abhängigkeiten pnpm und das vorhandene Lockfile verwenden.
- Die App ist noch nicht im offiziellen F-Droid-Katalog verfügbar. Der bisherige Antrag wurde geschlossen; ein neuer ist noch nicht eingereicht.
- Version 2.5.40 ist die neue Veröffentlichung. Ältere öffentliche GitHub-Veröffentlichungen und ihre Historie wurden dadurch noch nicht bereinigt; deren gesonderte Behandlung steht aus.
