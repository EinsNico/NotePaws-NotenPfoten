# Grenzen der Vorbereitung 2.5.40

- Die neue Paketidentität benötigt eine separate Android-Installation und eine geprüfte Übernahme der Lernstände.
- Gezielte Prüfungen für Sicherungen, Import, native Brücken und Paketmetadaten bestehen. Die alte Sicherung wird nur über eine getrennte konvertierte Kopie übernommen; Originaldateien bleiben erhalten.
- Ein neuer Android-Bau, native Geräte-/MIDI-Abnahme und der reproduzierbare Linux-/Signaturvergleich stehen aus. Vorherige Prüfergebnisse ersetzen diese Prüfungen nicht.
- Die normale Lernstandssicherung übernimmt die getrennte Notenwerkstatt nicht vollständig. Eigene Stücke müssen zusätzlich exportiert und praktisch geprüft werden.
- Vue 2 und Webpack benötigen mit aktuellen Node-Versionen die OpenSSL-Option aus BUILDING.md. Für passende Abhängigkeiten pnpm und das vorhandene Lockfile verwenden.
- Die App ist noch nicht im offiziellen F-Droid-Katalog verfügbar. Der bisherige Antrag wurde geschlossen; ein neuer ist noch nicht eingereicht.
- Ältere öffentliche GitHub-Veröffentlichungen und ihre Historie sind durch diesen vorbereiteten Quellstand noch nicht bereinigt. Es wurde noch keine neue APK veröffentlicht.
