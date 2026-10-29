# Datenübernahme ab Version 2.5.40

Version **2.5.40 / 20540** verwendet `de.nico.notenpfoten`. Die signierte und technisch geprüfte APK steht im [Release v2.5.40](https://github.com/EinsNico/NotePaws-NotenPfoten/releases/tag/v2.5.40). Bei einer bisherigen Installation handelt es sich um einen Umzug in eine separate App.

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

## Technischer Stand und offene Prüfungen

- Die drei lokalen Cordova-Plugins und sämtliche Paket-/Modul-/Java-Kennungen sind umgestellt. Die neue APK wurde aus einem frischen Android-Aufbau erzeugt.
- Version, Paketkennung, Webdateien, Berechtigungen, native Plugins und Signatur sind geprüft. Die synthetische Backup-Konvertierung ist geprüft; die persönliche Datenübernahme auf einem echten Gerät bleibt offen.
- Der private Schlüssel wurde erhalten; das neue Zertifikat verwendet den aktuellen App-Namen. Die andere Paketidentität erfordert weiterhin eine separate Installation.
- Der unabhängige Linux-Bau und Entwickler-Signaturvergleich für 2.5.40 sind bestanden. Der neue F-Droid-Aufnahmeantrag bleibt ein eigener Schritt.
- GitHub-Quellstand, Beschreibungen, ZIP, Prüfsummen und APK sind als Veröffentlichungspaket aufeinander abgestimmt.
- Die historischen GitHub-Veröffentlichungen wurden getrennt zurückgezogen und die erreichbaren Git-Stände bereinigt. Plattformhistorie und fremde Kopien haben eigene Grenzen; siehe [Hinweise](HISTORY_CLEANUP.md).

Der bisherige F-Droid-Antrag wurde vorläufig geschlossen. Erst nach erfolgreicher
Prüfung der neuen Identität ist eine erneute Einreichung vorgesehen.
