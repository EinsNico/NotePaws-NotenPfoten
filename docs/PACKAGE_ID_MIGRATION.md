# Neue Paketidentität vorbereiten

Der Arbeitsstand für **2.5.40 / 20540** verwendet `de.nico.notenpfoten`.
Die neue APK ist lokal gebaut, signiert und technisch geprüft; sie ist noch nicht veröffentlicht. Die bisherigen
Veröffentlichungen sind noch nicht durch einen neuen geprüften Build ersetzt.

## Bestehende Installationen und Lernstände

Android behandelt die neue Paketidentität als separate App. Eine vorhandene
Installation kann damit nicht direkt aktualisiert werden. Die bisherige App und
ihre Daten müssen erhalten bleiben, bis die Übernahme praktisch geprüft ist.

1. In der bisherigen App die Lernstände vollständig in eine JSON-Datei exportieren.
2. Die originale Datei unverändert aufbewahren.
3. Für ältere Sicherungen eine getrennte Kopie mit neuer Formatkennung erstellen:

   ```sh
   python3 scripts/convert-backup-identity.py ORIGINAL.json KOPIE.json --confirm-own-backup
   ```

   Dieser lokale Helfer verändert ausschließlich `format` und `app.name` in der
   neuen Datei. Alle Nutzdaten und ihre Version bleiben erhalten. Er ist nur für
   eigene Sicherungen früherer Versionen dieser App vorgesehen. Eine vorhandene
   Zieldatei wird nicht überschrieben. Die App prüft den gesamten Inhalt beim Import.
4. Nach Installation der neuen APK die konvertierte Kopie importieren und
   Lernstände, Statistik und Einstellungen vergleichen.
5. Die Notenwerkstatt besitzt einen getrennten Dateiaustausch: eigene Stücke
   zusätzlich exportieren und ihre Übernahme separat prüfen. Die normale
   Lernstandssicherung übernimmt die Werkstatt nicht vollständig.

## Vor der nächsten Veröffentlichung

- Die drei lokalen Cordova-Plugins und sämtliche Paket-/Modul-/Java-Kennungen sind
  auf den aktuellen Namen umzustellen. Einen sauberen Android-Aufbau verwenden;
  den alten generierten Plattformordner nicht als Veröffentlichungsquelle nutzen.
- Neue signierte APK bauen, Version, Paketkennung, Webdateien, Berechtigungen,
  native Plugins und Lernstandsimport prüfen. Den bisherigen Signierschlüssel
  behalten; allein dieser ermöglicht bei geänderter Paketidentität kein direktes Update.
- F-Droid-Rezept, reproduzierbaren Linux-Bau und Signaturvergleich neu prüfen.
  Der Vergleich der vorherigen Version belegt die neue Paketidentität nicht.
- GitHub-Quellstand, Beschreibungen, ZIP, Prüfsummen und APK gemeinsam abgleichen.
- Alte öffentliche Releases, Tags, Commits, GitLab-Zweige und frühere Antragstexte
  getrennt behandeln. Das Umschreiben oder Entfernen historischer Veröffentlichungen
  ist nicht durch eine Quellcode-Umbenennung erledigt.

Der bisherige F-Droid-Antrag wurde vorläufig geschlossen. Erst nach erfolgreicher
Prüfung der neuen Identität ist eine erneute Einreichung vorgesehen.
