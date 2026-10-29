# Note Paws

> **Moving from 2.5.39 or earlier:** Version 2.5.40 uses a new application ID and installs as a separate app. Keep the previous app until your learning data and workshop pieces have been transferred and checked. See the [migration guide](docs/PACKAGE_ID_MIGRATION.md) (currently in German).

[Deutsch](README.md) | **English**

<img src="docs/images/app-icon.png" alt="Note Paws" width="96" />

Practice reading notes, playing melodies and keeping rhythm — using on-screen controls or a MIDI instrument.

**Version 2.5.40 · Android 7.0 or later · German and English**

[Downloads & releases](https://github.com/EinsNico/NotePaws-NotenPfoten/releases) · [Changelog](CHANGELOG.md) · [Report a bug](https://github.com/EinsNico/NotePaws-NotenPfoten/issues/new/choose)

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

The signed Android APK is available under **[Releases and downloads](https://github.com/EinsNico/NotePaws-NotenPfoten/releases)**: `Noten-Pfoten-2.5.40-release.apk`.

1. Download the APK to your Android device and open it.
2. If Android asks, allow installation from the app you used to open the file.
3. When moving from 2.5.39 or earlier, this installs as a separate app. Transfer learning data using a converted copy of your backup and export workshop pieces separately. Keep the previous app until the transfer is confirmed.

The release includes source code and a SHA-256 checksum file. This version does not include a new Play Store bundle and has not been published on the Play Store.

## F-Droid

Submission to F-Droid is in preparation. German and English store texts, the icon and screenshots are in `fastlane/metadata/android/`. The new local Android build and APK checks passed; an independent Linux rebuild and developer-signature comparison for 2.5.40 are still pending. See [docs/FDROID.md](docs/FDROID.md) for the current status and next steps (currently in German). The app has not yet been published in the official F-Droid repository.

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

Report bugs through this repository’s [Issues](https://github.com/EinsNico/NotePaws-NotenPfoten/issues/new/choose). Please include the app version, device, Android version, input method and brief steps to reproduce the problem. Do not attach private learning-progress backups publicly.

## License and credits

This project was further developed with the help of AI. The models ChatGPT 5.5 Sol, 5.6 Sol, 6.1 Sol and Astra were used within the Codex harness. EinsNico provided the ideas, design decisions and review of the results.

Adapted and maintained by **EinsNico**, based on [noten-lernen by MelvilQ](https://github.com/MelvilQ/noten-lernen).

This project is licensed under **AGPL-3.0-only**; see [LICENSE](LICENSE). The original project’s MIT license and copyright notices are preserved in [LICENSE-MIT-ORIGINAL](LICENSE-MIT-ORIGINAL). Other components and their license texts are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Names and logos may be subject to separate trademark rights.

## Copyright in content

Fox design by **Beeko** ([Telegram channel](https://t.me/yeoldejackalcoon)).

Images, texts, graphics, illustrations and other creative content in this project are protected by copyright to the extent that they meet the applicable legal requirements. Rights remain with the respective authors or rights holders.

Use, modification and redistribution are governed by the applicable license terms. This notice does not change the project's AGPL-3.0-only license or the separate license terms and copyright notices for third-party content, and does not restrict the permissions granted by those licenses.
