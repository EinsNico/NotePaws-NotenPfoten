# Noten Pfoten

**Deutsch** | [English](README.en.md)

<img src="docs/images/app-icon.png" alt="Noten Pfoten" width="96" />

Noten lesen, Melodien spielen und Rhythmus üben – auf dem Bildschirm oder mit einem MIDI-Instrument.

**Version 2.5.37 · Android 7.0 oder neuer · Deutsch und Englisch**

## Die App

- **Einzelnoten:** Lernmodus mit persönlichem Lernstand und freies Training. Bass und Violin sind einzeln oder gemeinsam auswählbar; die Noten erscheinen nacheinander.
- **Notenfluss:** Melodien und Akkorde mit einstellbarem Tempo, Notenbereich und Notenwerten.
- **Taktgefühl:** Rhythmusübungen mit Rückmeldung zum Zeitpunkt der Eingaben.
- **Notenwerkstatt:** Eigene Stücke bearbeiten, importieren und üben. Übungsabschnitte grafisch auswählen, einzelne Takte direkt anzeigen und den gewählten Abschnitt wiederholen. Importhinweise nennen nicht unterstützte Zeichen und die betroffenen Takte.
- Bildschirmtasten, Bildschirmklaviatur und MIDI-Eingabe.
- Statistiken, zwölf Lernzeitfenster, tägliche Aufgaben und lokale Sicherungen.
- Eine beim ersten Start automatisch gezeigte, überspringbare Einführung mit animierten Beispielen; später unter **App-Einstellungen → Hilfe & Einstieg** erneut aufrufbar.
- Training selbst anpassen: Notenbereich, Vorzeichen, Tonarten im Quintenzirkel, Tempo, Notenwerte und Hände.
- Die Systemsprache wird beim ersten Start übernommen; bei nicht unterstützter Sprache startet die App auf Englisch. Deutsch und Englisch sind später manuell auswählbar.

## Installation

Die signierte Android-APK wird im Bereich **Releases** dieses Repositorys bereitgestellt: `Noten-Pfoten-2.5.37-release.apk`.

1. APK auf das Android-Gerät laden und öffnen.
2. Falls Android danach fragt, die Installation für die zum Öffnen verwendete App erlauben.
3. Eine vorhandene Noten-Pfoten-Installation mit derselben Signatur kann damit aktualisiert werden.

Der Quellcode und eine SHA-256-Prüfsummendatei gehören zum Release. Es gibt für diese Version kein neues Play-Store-Bundle und keine behauptete Play-Store-Veröffentlichung.

## Entwicklung und Nachbauen

Die App verwendet Vue 2, Webpack und Cordova. Der ausgelieferte Build wurde mit den in **pnpm-lock.yaml** festgehaltenen Web-Abhängigkeiten erstellt. Das zusätzlich erhaltene ältere npm-Lockfile enthält abweichende Versionen; für den passenden Web-Abhängigkeitsstand bitte pnpm verwenden.

Die vollständige Anleitung steht in [docs/BUILDING.md](docs/BUILDING.md). Bekannte Prüfgrenzen stehen in [docs/KNOWN_LIMITS.md](docs/KNOWN_LIMITS.md).

## Orientierung im Code

| Ordner | Inhalt |
| --- | --- |
| `src/components/` | Ansichten und Bedienung |
| `src/model/` | Training, MIDI, Import, Speicherung und Auswertungen |
| `src/resources/` | Übersetzungen |
| `static/` | Bilder, Klaviersamples und Offline-Ressourcen |
| `cordova/local-plugins/` | Eigene Android-Anbindungen |
| `cordova/scripts/` | Android-Vorbereitung und Datenschutz-Konfiguration |
| `build/`, `config/` | Web-Build-Konfiguration |
| `test/` | Vorhandene Regressionstests und Fixtures |

## Rückmeldungen

Fehler können über die Issues des Repositorys gemeldet werden. Hilfreich sind App-Version, Gerät, Android-Version, Eingabeart und kurze Schritte zum Nachstellen. Bitte keine privaten Lernstandsicherungen öffentlich anhängen.

## Lizenz und Herkunft

Dieses Projekt wurde mithilfe von KI weiterentwickelt. Dabei kamen die Modelle ChatGPT 5.5 Sol, 5.6 Sol, 6.1 Sol und Astra im Codex-Harness zum Einsatz. Ideen, Gestaltung, Entscheidungen und die Prüfung der Ergebnisse lagen bei EinsNico.

Angepasst und gepflegt von **EinsNico**. Grundlage ist [noten-lernen von MelvilQ](https://github.com/MelvilQ/noten-lernen).

Dieses Projekt steht unter **AGPL-3.0-only**; siehe [LICENSE](LICENSE). Der MIT-Lizenztext und die Urheberhinweise des ursprünglichen Projekts bleiben in [LICENSE-MIT-ORIGINAL](LICENSE-MIT-ORIGINAL) erhalten. Weitere Komponenten und deren Lizenztexte sind in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dokumentiert. Namen und Logos können eigenen Markenrechten unterliegen.

## Urheberrecht an Inhalten

Urheber des Fuchsdesigns: **Beeko** ([Telegram-Kanal](https://t.me/yeoldejackalcoon)).

Bilder, Texte, Grafiken, Illustrationen und andere kreative Inhalte dieses Projekts sind urheberrechtlich geschützt, soweit sie die gesetzlichen Schutzvoraussetzungen erfüllen. Die Rechte verbleiben bei den jeweiligen Urhebern beziehungsweise Rechteinhabern.

Nutzung, Bearbeitung und Weitergabe richten sich nach den jeweils geltenden Lizenzbedingungen. Dieser Hinweis ändert weder die AGPL-3.0-only-Lizenz des Projekts noch die gesonderten Lizenzbedingungen und Urheberhinweise für Inhalte Dritter und schränkt die dort gewährten Nutzungsrechte nicht ein.
