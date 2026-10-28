# Bekannte Grenzen von Version 2.5.37

- Web- und Android-Build sowie Paketversion, Signatur, ZIP-Ausrichtung und Übereinstimmung der eingebetteten Webdateien wurden bei der Paketvorbereitung geprüft.
- Die Tutorial- und App-Info-Änderungen wurden vor der Paketvorbereitung gezielt in der lokalen Browservorschau kontrolliert, einschließlich kleiner Handygrößen. Es wurde keine zusätzliche Testsuite für diesen Release-Build ausgeführt.
- Die praktische Abnahme der neuen APK auf einem echten Handy/Tablet mit MIDI-Hardware steht noch aus.
- Das Projekt verwendet einen älteren Vue-2-/Webpack-Unterbau. Moderne Node-Versionen benötigen die in BUILDING.md beschriebene OpenSSL-Option.
- Der tatsächliche Web-Abhängigkeitsstand folgt dem pnpm-Lockfile; das ältere npm-Lockfile weicht davon ab.
- Das bereinigte Quellpaket wurde nicht auf einem frischen Fremdrechner neu installiert und gebaut. Historische Tests können ausgeschlossene interne Auditbelege voraussetzen.
- Android 7.0 / API 24 ist die deklarierte Mindestversion. Es wurden nicht alle Geräte einzeln geprüft. Die Oberfläche unterstützt Deutsch und Englisch.
- Verfügbare Downloads und der Veröffentlichungsstatus stehen unter [GitHub-Releases](https://github.com/EinsNico/NotePaws-NotenPfoten/releases). Ein gespeicherter Release-Entwurf ist noch keine freigegebene Veröffentlichung. Kein neues AAB wurde gebaut.
