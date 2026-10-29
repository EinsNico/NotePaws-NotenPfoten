# Änderungen

## 2.5.40 – 29. Oktober 2026

- Neue App-ID `de.nico.notenpfoten`; einheitliche technische Plugin-, Modul- und Sicherungskennungen sowie ein Zertifikat mit aktuellem App-Namen.
- Separate Android-Installation beim Wechsel von 2.5.39 oder älter. Bisherige App behalten; ältere Lernstandssicherungen über eine konvertierte Kopie übernehmen und eigene Werkstattstücke separat exportieren.
- Lernalgorithmus und Übungsabläufe durch diese technische Umstellung unverändert.
- Frischer Web-/Android-Bau und technische APK-Prüfungen bestanden. Persönliche Datenübernahme, praktische Geräte-/MIDI-Abnahme und unabhängiger Linux-/Signaturvergleich stehen noch aus.

## 2.5.39 – 29. Oktober 2026

- Wechselnde Webpack-Bootstrap-Kennung in Source-Maps stabilisiert, damit unabhängige Android-Bauten dieselbe Entwicklersignatur verwenden können. Debug-Quellen und Positionszuordnung bleiben erhalten.
- Bauanleitung für einen frischen Checkout ergänzt: lokale Cordova-Plugins ausdrücklich und in fester Reihenfolge installieren.
- Veraltete Namens-Erwartung in der vorhandenen Modellprüfung auf EinsNico berichtigt. Keine Änderung am Lernverhalten oder an der Oberfläche.
- Neue APK-Version 2.5.39 / 20539. F-Droid-Aufnahme und praktische Geräteabnahme bleiben getrennte Schritte.

## 2.5.38 – 28. Oktober 2026

- Notenbereich-Auswahl in Melodie und Akkorden an die Einzelnoten-Ansicht angeglichen: gemeinsame Gestaltung, Petrol für Bass und Gold für Violin, mit Notenschlüsseln an den Feldern.
- Bei Bass + Violin stehen die beiden Obergrenzen in der ersten Zeile und die Untergrenzen darunter. Alte Hand-Karten im Notenbereich entfallen; die eigentliche Handauswahl bleibt erhalten.
- Gemeinsame Klaviatur mit Bereichsgriffen und Feineinstellung bleibt in allen vier Einstellungsansichten verfügbar.
- pnpm-Lockfile an den bereits verwendeten Android-Stand 15.1.0 und das vorhandene Bildschirm-Wachhalte-Plugin angeglichen.
- 28 gezielte Prüfgruppen für Melodie-/Akkord-Menüs und Griffpräzision bestanden; kleine Handyansichten kontrolliert. Signierte APK 2.5.38 / 20538 mit passendem Quellcode. Praktische Geräteabnahme der neuen APK bleibt offen.

## 2.5.37 – 27. Oktober 2026

- Einführung für kleine Bildschirme überarbeitet: kompakte Navigation und animierte Vorschauen für Spielmodi, Eingabe und persönliche Einstellungen.
- Optionale schwarze Tasten mit Keine/♯/♭/♯ und ♭ sichtbar wählen; der Quintenzirkel betont die eigene Tonartauswahl. Die Übung erklärt Violin- und Bassschlüssel mit hervorgehobenen Bezugspunkten.
- Natürlichere Handrücken im Hände-Beispiel; angepasste Animationsgeschwindigkeiten.
- MusicXML-Importhinweise nennen konkrete nicht unterstützte Symbole und betroffene Takte.
- App-Info mit EinsNico, persönlichem Hintergrundtext und gemeinsamer kompakter Liste für Datenschutz und Lizenzen.
- Veröffentlichungspaket mit zusammenpassendem Quellcode und signierter APK, VersionCode 20537. Keine zusätzlichen Testsuiten für diese Paketvorbereitung; praktische Geräteabnahme bleibt offen.

## 2.5.36 – 27. Oktober 2026

- Zwischenstand als signierte APK mit Tutorial- und Importverbesserungen. Die anschließenden Textkorrekturen und der neue App-Info-Aufbau sind ab 2.5.37 enthalten.

## 2.5.35 – 23. Oktober 2026

- Untere zusätzliche Taktübersicht entfernt; die einfache Auswahl „Takt anzeigen“ ist wieder verfügbar. „Abschnitt wiederholen“ steht direkt beim gewählten Übungsabschnitt.

- Grafische Auswahl des Übungsabschnitts: Anfang und Ende an Miniaturtakten antippen, gewählten Bereich markieren und Achterblöcke direkt auswählen.
- Handauswahl auch in den Einstellungen des geöffneten Stücks: beide Hände, nur rechts oder nur links. Ein Wechsel pausiert die Übung und passt Übungsziele und Vorschau an.
- Signierte APK 2.5.35 gebaut; gleiche dauerhafte Signatur, VersionCode 20535 und passender Webstand geprüft. Keine zusätzliche Testsuite für diesen Build. Praktische Tablet-/Android-Abnahme bleibt offen.

## 2.5.34 – 22. Oktober 2026

- Taktübersicht direkt im Übebereich der Notenwerkstatt: antippbare Miniatur-Takte statt versteckter Takt-Zahleneingabe unter „Übungsposition“.
- „Abschnitt wiederholen“ als deutlich sichtbarer Schalter mit An-/Aus-Zustand und Durchgangszähler; Rücksprung zum gewählten Abschnittsanfang.
- Stark vereinfachte Notenverläufe, aktueller Takt und Seiten für längere Abschnitte. Ein Takt-Tipp springt an die richtige Position innerhalb des gewählten Abschnitts.
- Begrenzte Maße und eigener Platz oberhalb der Noten, auch bei Drehung und im Vollbild. Tastaturbedienung berücksichtigt die neuen Steuerelemente.
- Vorhandene Pausen-, MIDI-/Haltegriff- und Lernwertlogik bleibt erhalten. Praktische Tablet-Abnahme noch offen.

## 2.5.33 – 22. Oktober 2026

Erster für GitHub vorbereiteter Veröffentlichungsstand von Noten Pfoten / Note Paws.

- Grafische, überspringbare Einführung mit animierten Einblicken in Modi, Eingaben und persönliche Einstellungen.
- Einführung erneut unter **App-Einstellungen → Hilfe & Einstieg** aufrufbar.
- Notenbereich, Tonarten, Quintenzirkel, Tempo, Notenwerte und Hände im Tutorial anschaulich erklärt.
- Im Einzelnotenmodus nur noch Bass und Violin; frühere Klavier-Auswahlen werden unter Erhalt der Notenbereiche übernommen.
- Notenbereich immer sichtbar und über leicht/mittel/schwer als Vorlagen einstellbar.
- Einheitlichere Statistiken und Rundenabschlüsse, Reaktionszeit und zwölf Lernzeitfenster.
- Beim Erststart unterstützte Systemsprache, ansonsten Englisch; spätere manuelle Sprachwahl bleibt möglich.

Der Veröffentlichungsstand umfasst alle zuvor fertiggestellten Trainings-, MIDI-, Import-, Aufgaben- und Sicherungsfunktionen. Die tatsächliche Geräteabnahme von APK 2.5.33 ist noch offen; siehe `docs/KNOWN_LIMITS.md`.
