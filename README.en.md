# Note Paws

[Deutsch](README.md) | **English**

<img src="docs/images/app-icon.png" alt="Note Paws" width="96" />

Practice reading notes, playing melodies and keeping rhythm — using on-screen controls or a MIDI instrument.

**Version 2.5.37 · Android 7.0 or later · German and English**

## The app

- **Single notes:** Guided learning with personal progress tracking and free practice. Choose bass clef, treble clef or both; notes appear one at a time.
- **Note flow:** Practice melodies and chords with adjustable tempo, note range and note values.
- **Rhythm:** Rhythm exercises with feedback on the timing of your input.
- **Score workshop:** Edit, import and practice your own pieces. Select practice sections visually, jump to individual measures and repeat the selected section. Import notices identify unsupported symbols and affected measures.
- On-screen note buttons, an on-screen piano keyboard and MIDI input.
- Statistics, twelve time-of-day windows, daily tasks and local backups.
- A skippable introduction with animated examples appears automatically on first launch. Reopen it later under app settings, in the help and introduction section.
- Customize your practice: note range, accidentals, keys using the circle of fifths, tempo, note values and hands.
- On first launch, the app uses the system language, falling back to English if it is unsupported. You can select German or English manually later.

## Installation

The signed Android APK is provided in this repository’s **Releases** section: `Noten-Pfoten-2.5.37-release.apk`.

1. Download the APK to your Android device and open it.
2. If Android asks, allow installation from the app you used to open the file.
3. An existing installation signed with the same key can be updated with this APK.

The release includes source code and a SHA-256 checksum file. This version does not include a new Play Store bundle and has not been published on the Play Store.

## Development and building

The app uses Vue 2, Webpack and Cordova. The distributed build uses the web dependencies recorded in **pnpm-lock.yaml**. The retained older npm lockfile contains different versions; use pnpm to obtain the matching web dependencies.

See [docs/BUILDING.md](docs/BUILDING.md) for the full build guide and [docs/KNOWN_LIMITS.md](docs/KNOWN_LIMITS.md) for validation limits. These technical documents are currently in German.

## Code overview

| Directory | Contents |
| --- | --- |
| `src/components/` | Views and user interaction |
| `src/model/` | Training, MIDI, import, storage and statistics |
| `src/resources/` | Translations |
| `static/` | Images, piano samples and offline resources |
| `cordova/local-plugins/` | Custom Android integrations |
| `cordova/scripts/` | Android preparation and privacy configuration |
| `build/`, `config/` | Web build configuration |
| `test/` | Existing regression tests and fixtures |

## Feedback

Report bugs through this repository’s Issues. Please include the app version, device, Android version, input method and brief steps to reproduce the problem. Do not attach private learning-progress backups publicly.

## License and credits

This project was further developed with the help of AI. The models ChatGPT 5.5 Sol, 5.6 Sol, 6.1 Sol and Astra were used within the Codex harness. EinsNico provided the ideas, design decisions and review of the results.

Adapted and maintained by **EinsNico**, based on [noten-lernen by MelvilQ](https://github.com/MelvilQ/noten-lernen).

This project is licensed under **AGPL-3.0-only**; see [LICENSE](LICENSE). The original project’s MIT license and copyright notices are preserved in [LICENSE-MIT-ORIGINAL](LICENSE-MIT-ORIGINAL). Other components and their license texts are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Names and logos may be subject to separate trademark rights.

## Copyright in content

Images, texts, graphics, illustrations and other creative content in this project are protected by copyright to the extent that they meet the applicable legal requirements. Rights remain with the respective authors or rights holders.

Use, modification and redistribution are governed by the applicable license terms. This notice does not change the project's AGPL-3.0-only license or the separate license terms and copyright notices for third-party content, and does not restrict the permissions granted by those licenses.
