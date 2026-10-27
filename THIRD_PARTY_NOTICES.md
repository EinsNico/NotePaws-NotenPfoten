# Third-Party Notices

Diese Datei dokumentiert die Open-Source-Komponenten, deren Code in der Web-App oder Android-Laufzeit von Noten Pfoten beziehungsweise Note Paws enthalten ist. Die Lizenztexte bleiben in ihrer englischen Originalfassung.

Erneut geprüft am 2. Oktober 2026 für App-Version 2.4.19. Prüfbasis: frische Produktions-Source-Maps des mit den installierten pnpm-Paketen erzeugten Webpack-Bundles sowie die binären AAR-/JAR-Artefakte der von Gradle aufgelösten Android-Konfigurationen `debugRuntimeClasspath` und `releaseRuntimeClasspath`. Beide Android-Inventare sind identisch. Die Infokarte enthält 62 Hinweise: 14 Web-Pakete, den eingebetteten `sprintf()`-Helfer, zwei Cordova-Komponenten und 45 Android-Bibliotheken.

Das lokale Plugin `cordova-plugin-noten-pfoten-save-data-file` 1.0.0 wurde für dieses Projekt erstellt und steht unter derselben AGPL-3.0-only-Lizenz wie die App. Es wird deshalb nicht als fremde Drittanbieter-Komponente geführt. Die Cordova-CLI ist ein reines Build-Werkzeug und wird nicht ausgeliefert.


Ergänzung vom 17. Oktober 2026: pako 1.0.11 wird zur verlustfreien Komprimierung großer Musikbibliotheken ausgeliefert. Vollständige MIT-/Zlib-Lizenz unten; dadurch 63 Hinweise und 15 Web-Pakete. Die übrige obige Bestandsaufnahme bleibt historisch unverändert.

## Komponenten

| Komponente | Version | Lizenz | Urheber/Copyright | Lizenztext | Quelle |
| --- | --- | --- | --- | --- | --- |
| pako | 1.0.11 | MIT AND Zlib | Vitaly Puzrin, Andrei Tuputcyn, Jean-loup Gailly und Mark Adler | [pakoMitZlib](#pakomitzlib) | node_modules/.pnpm/pako@1.0.11/node_modules/pako/LICENSE; lib/zlib/deflate.js |
| abcjs | 6.7.0 | MIT | Copyright (c) 2009-2026 Paul Rosen and Gregory Dyke | [abcjsMit](#abcjsmit) | node_modules/.pnpm/abcjs@6.7.0/node_modules/abcjs/LICENSE.md |
| sprintf() (in abcjs) | 0.4 | BSD-3-Clause | Copyright (c) 2007-present, Alexandru Mărășteanu <hello@alexei.ro> | [sprintfBsd3](#sprintfbsd3) | node_modules/.pnpm/abcjs@6.7.0/node_modules/abcjs/src/write/draw/sprintf.js |
| babel-runtime | 6.26.0 | MIT | Copyright (c) 2014-2017 Sebastian McKenzie <sebmck@gmail.com> | [babelRuntimeMit](#babelruntimemit) | https://github.com/babel/babel/blob/v6.26.0/LICENSE (the installed package contains no LICENSE file) |
| chartist | 0.11.4 | MIT | Copyright (c) 2013 Gion Kunz <gion.kunz@gmail.com> | [chartistMit](#chartistmit) | node_modules/.pnpm/chartist@0.11.4/node_modules/chartist/LICENSE-MIT |
| core-js | 2.6.12 | MIT | Copyright (c) 2014-2020 Denis Pushkarev | [coreJsMit](#corejsmit) | node_modules/.pnpm/core-js@2.6.12/node_modules/core-js/LICENSE |
| lockr | 0.8.5 | MIT | Copyright (c) 2014 Dimitris Tsironis | [lockrMit](#lockrmit) | node_modules/.pnpm/lockr@0.8.5/node_modules/lockr/LICENSE |
| lodash | 4.18.1 | MIT | Copyright OpenJS Foundation and other contributors | [lodashMit](#lodashmit) | node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/LICENSE |
| mousetrap | 1.6.5 | Apache-2.0 WITH LLVM-exception | Craig Campbell | [mousetrapApacheWithExceptions](#mousetrapapachewithexceptions) | node_modules/.pnpm/mousetrap@1.6.5/node_modules/mousetrap/LICENSE |
| regenerator-runtime | 0.11.1 | MIT | Copyright (c) 2014-present, Facebook, Inc. | [regeneratorRuntimeMit](#regeneratorruntimemit) | https://github.com/facebook/regenerator/blob/regenerator-runtime@0.11.1/LICENSE (the installed package contains no LICENSE file) |
| Vue | 2.7.16 | MIT | Copyright (c) 2013-present, Yuxi (Evan) You | [vueMit](#vuemit) | node_modules/.pnpm/vue@2.7.16/node_modules/vue/LICENSE |
| vue-chartist | 2.3.1 | WTFPL-2.0 | Copyright (C) 2004 Sam Hocevar <sam@hocevar.net> | [vueChartistWtfpl](#vuechartistwtfpl) | node_modules/.pnpm/vue-chartist@2.3.1/node_modules/vue-chartist/LICENSE |
| vue-i18n | 8.28.2 | MIT | Copyright (c) 2016 kazuya kawaguchi | [vueI18nMit](#vuei18nmit) | node_modules/.pnpm/vue-i18n@8.28.2_vue@2.7.16/node_modules/vue-i18n/LICENSE |
| vue-loader runtime helper | 13.7.3 | MIT | Copyright (c) 2015-present Yuxi (Evan) You | [vueLoaderMit](#vueloadermit) | node_modules/.pnpm/vue-loader@13.7.3_.../node_modules/vue-loader/LICENSE |
| vue-mousetrap | 1.0.1 | MIT | Copyright (c) 2018 Mark Lewis | [vueMousetrapMit](#vuemousetrapmit) | node_modules/.pnpm/vue-mousetrap@1.0.1/node_modules/vue-mousetrap/LICENSE |
| webmidi | 2.5.3 | MIT | Copyright (c) 2015-2019, Jean-Philippe Côté | [webmidiMit](#webmidimit) | node_modules/.pnpm/webmidi@2.5.3/node_modules/webmidi/LICENSE.txt |
| cordova-android | 15.1.0 | Apache-2.0 | Copyright 2015-2020 The Apache Software Foundation | [cordovaAndroidApache2](#cordovaandroidapache2) | cordova/node_modules/cordova-android/LICENSE and NOTICE |
| cordova-plugin-vibration | 3.1.1 | Apache-2.0 | Copyright 2012 The Apache Software Foundation | [apache2](#apache2) | cordova/node_modules/cordova-plugin-vibration/LICENSE and NOTICE |
| androidx.activity:activity | 1.8.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.activity/activity/1.8.0/…/activity-1.8.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.annotation:annotation-experimental | 1.4.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.annotation/annotation-experimental/1.4.1/…/annotation-experimental-1.4.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.annotation:annotation-jvm | 1.8.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.annotation/annotation-jvm/1.8.1/…/annotation-jvm-1.8.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.appcompat:appcompat-resources | 1.7.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.appcompat/appcompat-resources/1.7.1/…/appcompat-resources-1.7.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.appcompat:appcompat | 1.7.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.appcompat/appcompat/1.7.1/…/appcompat-1.7.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.arch.core:core-common | 2.2.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.arch.core/core-common/2.2.0/…/core-common-2.2.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.arch.core:core-runtime | 2.2.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.arch.core/core-runtime/2.2.0/…/core-runtime-2.2.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.collection:collection | 1.1.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.collection/collection/1.1.0/…/collection-1.1.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.concurrent:concurrent-futures | 1.1.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.concurrent/concurrent-futures/1.1.0/…/concurrent-futures-1.1.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.core:core-ktx | 1.13.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.core/core-ktx/1.13.0/…/core-ktx-1.13.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.core:core-splashscreen | 1.0.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.core/core-splashscreen/1.0.1/…/core-splashscreen-1.0.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.core:core | 1.13.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.core/core/1.13.0/…/core-1.13.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.cursoradapter:cursoradapter | 1.0.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.cursoradapter/cursoradapter/1.0.0/…/cursoradapter-1.0.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.customview:customview | 1.0.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.customview/customview/1.0.0/…/customview-1.0.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.drawerlayout:drawerlayout | 1.0.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.drawerlayout/drawerlayout/1.0.0/…/drawerlayout-1.0.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.emoji2:emoji2-views-helper | 1.3.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.emoji2/emoji2-views-helper/1.3.0/…/emoji2-views-helper-1.3.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.emoji2:emoji2 | 1.3.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.emoji2/emoji2/1.3.0/…/emoji2-1.3.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.fragment:fragment | 1.5.4 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.fragment/fragment/1.5.4/…/fragment-1.5.4.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.interpolator:interpolator | 1.0.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.interpolator/interpolator/1.0.0/…/interpolator-1.0.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.lifecycle:lifecycle-common | 2.6.2 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.lifecycle/lifecycle-common/2.6.2/…/lifecycle-common-2.6.2.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.lifecycle:lifecycle-livedata-core | 2.6.2 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.lifecycle/lifecycle-livedata-core/2.6.2/…/lifecycle-livedata-core-2.6.2.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.lifecycle:lifecycle-livedata | 2.6.2 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.lifecycle/lifecycle-livedata/2.6.2/…/lifecycle-livedata-2.6.2.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.lifecycle:lifecycle-process | 2.6.2 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.lifecycle/lifecycle-process/2.6.2/…/lifecycle-process-2.6.2.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.lifecycle:lifecycle-runtime | 2.6.2 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.lifecycle/lifecycle-runtime/2.6.2/…/lifecycle-runtime-2.6.2.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.lifecycle:lifecycle-viewmodel-savedstate | 2.6.2 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.lifecycle/lifecycle-viewmodel-savedstate/2.6.2/…/lifecycle-viewmodel-savedstate-2.6.2.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.lifecycle:lifecycle-viewmodel | 2.6.2 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.lifecycle/lifecycle-viewmodel/2.6.2/…/lifecycle-viewmodel-2.6.2.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.loader:loader | 1.0.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.loader/loader/1.0.0/…/loader-1.0.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.profileinstaller:profileinstaller | 1.3.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.profileinstaller/profileinstaller/1.3.1/…/profileinstaller-1.3.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.resourceinspection:resourceinspection-annotation | 1.0.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.resourceinspection/resourceinspection-annotation/1.0.1/…/resourceinspection-annotation-1.0.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.savedstate:savedstate | 1.2.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.savedstate/savedstate/1.2.1/…/savedstate-1.2.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.startup:startup-runtime | 1.1.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.startup/startup-runtime/1.1.1/…/startup-runtime-1.1.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.tracing:tracing | 1.0.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.tracing/tracing/1.0.0/…/tracing-1.0.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.vectordrawable:vectordrawable-animated | 1.1.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.vectordrawable/vectordrawable-animated/1.1.0/…/vectordrawable-animated-1.1.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.vectordrawable:vectordrawable | 1.1.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.vectordrawable/vectordrawable/1.1.0/…/vectordrawable-1.1.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.versionedparcelable:versionedparcelable | 1.1.1 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.versionedparcelable/versionedparcelable/1.1.1/…/versionedparcelable-1.1.1.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.viewpager:viewpager | 1.0.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.viewpager/viewpager/1.0.0/…/viewpager-1.0.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| androidx.webkit:webkit | 1.14.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/androidx.webkit/webkit/1.14.0/…/webkit-1.14.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| com.google.guava:listenablefuture | 1.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/com.google.guava/guava-parent/26.0-android/…/guava-parent-26.0-android.pom (inherited license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| org.jetbrains.kotlin:kotlin-stdlib-jdk7 | 2.1.21 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib-jdk7/2.1.21/…/kotlin-stdlib-jdk7-2.1.21.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| org.jetbrains.kotlin:kotlin-stdlib-jdk8 | 2.1.21 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib-jdk8/2.1.21/…/kotlin-stdlib-jdk8-2.1.21.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| org.jetbrains.kotlin:kotlin-stdlib | 2.1.21 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib/2.1.21/…/kotlin-stdlib-2.1.21.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| org.jetbrains.kotlinx:kotlinx-coroutines-android | 1.6.4 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlinx/kotlinx-coroutines-android/1.6.4/…/kotlinx-coroutines-android-1.6.4.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm | 1.6.4 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.6.4/…/kotlinx-coroutines-core-jvm-1.6.4.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| org.jetbrains:annotations | 13.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/org.jetbrains/annotations/13.0/…/annotations-13.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |
| org.jspecify:jspecify | 1.0.0 | Apache-2.0 | — | [apache2](#apache2) | ~/.gradle/caches/modules-2/files-2.1/org.jspecify/jspecify/1.0.0/…/jspecify-1.0.0.pom (license declaration); common full text from cordova/node_modules/cordova-plugin-vibration/LICENSE |


Der eingebettete Helfer `sprintf()` 0.4 aus `abcjs` besitzt einen eigenen BSD-3-Clause-Lizenzhinweis in `src/write/draw/sprintf.js`. Er ist im Produktions-Bundle enthalten und wird beim Zeichnen von Notenlinien aufgerufen. Sein Copyright und vollständiger Lizenztext werden deshalb zusätzlich zur MIT-Lizenz von `abcjs` geführt.

## Festgestellte Lockfile-Abweichungen

Die aktiven Root-`node_modules` sind pnpm-Verknüpfungen und die vorhandenen Produktions-Source-Maps nennen die pnpm-Versionen. Das ältere `package-lock.json` weicht bei mehreren ausgelieferten Paketen ab und wurde im Rahmen dieser Aufgabe nicht verändert.

| Komponente | package-lock.json | tatsächlich installiert/gebündelt |
| --- | ---: | ---: |
| chartist | 0.11.0 | 0.11.4 |
| core-js | 2.5.7 | 2.6.12 |
| lodash | 4.17.11 | 4.18.1 |
| mousetrap | 1.6.2 | 1.6.5 |
| Vue | 2.7.10 | 2.7.16 |
| vue-chartist | 2.1.2 | 2.3.1 |
| vue-i18n | 8.2.1 | 8.28.2 |
| webmidi | 2.5.1 | 2.5.3 |

`abcjs`, `babel-runtime`, `lockr`, `regenerator-runtime`, `vue-loader` und `vue-mousetrap` stimmen zwischen dem älteren npm-Lockfile und dem aktiven Bundle überein. Die Cordova-CLI 13.0.0, `cordova-android` 15.1.0 und `cordova-plugin-vibration` 3.1.1 stimmen mit den aktuellen Cordova-Lockfiles überein.


## Vollständige Lizenztexte

### abcjsMit

Zugeordnet zu: abcjs 6.7.0

```text
Copyright (c) 2009-2026 Paul Rosen and Gregory Dyke

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

**This text is from: http://opensource.org/licenses/MIT**

```

### sprintfBsd3

```text
Copyright (c) 2007-present, Alexandru Mărășteanu <hello@alexei.ro>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
* Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.
* Neither the name of this software nor the names of its contributors may be
used to endorse or promote products derived from this software without
specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### babelRuntimeMit

Zugeordnet zu: babel-runtime 6.26.0

```text
MIT License

Copyright (c) 2014-2017 Sebastian McKenzie <sebmck@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

```

### chartistMit

Zugeordnet zu: chartist 0.11.4

```text
Copyright (c) 2013 Gion Kunz <gion.kunz@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

```

### coreJsMit

Zugeordnet zu: core-js 2.6.12

```text
Copyright (c) 2014-2020 Denis Pushkarev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

```

### lockrMit

Zugeordnet zu: lockr 0.8.5

```text
The MIT License (MIT)

Copyright (c) 2014 Dimitris Tsironis

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

```

### lodashMit

Zugeordnet zu: lodash 4.18.1

```text
Copyright OpenJS Foundation and other contributors <https://openjsf.org/>

Based on Underscore.js, copyright Jeremy Ashkenas,
DocumentCloud and Investigative Reporters & Editors <http://underscorejs.org/>

This software consists of voluntary contributions made by many
individuals. For exact contribution history, see the revision history
available at https://github.com/lodash/lodash

The following license applies to all parts of this software except as
documented below:

====

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

====

Copyright and related rights for sample code are waived via CC0. Sample
code is defined as all source code displayed within the prose of the
documentation.

CC0: http://creativecommons.org/publicdomain/zero/1.0/

====

Files located in the node_modules and vendor directories are externally
maintained libraries used by this software which have their own
licenses; we recommend you read them, as their terms may differ from the
terms above.

```

### mousetrapApacheWithExceptions

Zugeordnet zu: mousetrap 1.6.5

```text

                              Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

--- Exceptions to the Apache 2.0 License ----

As an exception, if, as a result of your compiling your source code, portions
of this Software are embedded into an Object form of such source code, you
may redistribute such embedded portions in such Object form without complying
with the conditions of Sections 4(a), 4(b) and 4(d) of the License.

In addition, if you combine or link compiled forms of this Software with
software that is licensed under the GPLv2 ("Combined Software") and if a
court of competent jurisdiction determines that the patent provision (Section
3), the indemnity provision (Section 9) or other Section of the License
conflicts with the conditions of the GPLv2, you may retroactively and
prospectively choose to deem waived or otherwise exclude such Section(s) of
the License, but only in their entirety and only with respect to the Combined
Software.

```

### regeneratorRuntimeMit

Zugeordnet zu: regenerator-runtime 0.11.1

```text
MIT License

Copyright (c) 2014-present, Facebook, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

### vueMit

Zugeordnet zu: Vue 2.7.16

```text
The MIT License (MIT)

Copyright (c) 2013-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

```

### vueChartistWtfpl

Zugeordnet zu: vue-chartist 2.3.1

```text
DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
Version 2, December 2004
Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>

Everyone is permitted to copy and distribute verbatim or modified copies of this license document, and changing it is allowed as long as the name is changed.

DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

0. You just DO WHAT THE FUCK YOU WANT TO.

```

### vueI18nMit

Zugeordnet zu: vue-i18n 8.28.2

```text
The MIT License (MIT)

Copyright (c) 2016 kazuya kawaguchi

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

```

### vueLoaderMit

Zugeordnet zu: vue-loader runtime helper 13.7.3

```text
The MIT License (MIT)

Copyright (c) 2015-present Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

### vueMousetrapMit

Zugeordnet zu: vue-mousetrap 1.0.1

```text
MIT License

Copyright (c) 2018 Mark Lewis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

### webmidiMit

Zugeordnet zu: webmidi 2.5.3

```text
The MIT License (MIT)

Copyright (c) 2015-2019, Jean-Philippe Côté

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


```

### apache2

Zugeordnet zu: cordova-plugin-vibration 3.1.1, androidx.activity:activity 1.8.0, androidx.annotation:annotation-experimental 1.4.1, androidx.annotation:annotation-jvm 1.8.1, androidx.appcompat:appcompat-resources 1.7.1, androidx.appcompat:appcompat 1.7.1, androidx.arch.core:core-common 2.2.0, androidx.arch.core:core-runtime 2.2.0, androidx.collection:collection 1.1.0, androidx.concurrent:concurrent-futures 1.1.0, androidx.core:core-ktx 1.13.0, androidx.core:core-splashscreen 1.0.1, androidx.core:core 1.13.0, androidx.cursoradapter:cursoradapter 1.0.0, androidx.customview:customview 1.0.0, androidx.drawerlayout:drawerlayout 1.0.0, androidx.emoji2:emoji2-views-helper 1.3.0, androidx.emoji2:emoji2 1.3.0, androidx.fragment:fragment 1.5.4, androidx.interpolator:interpolator 1.0.0, androidx.lifecycle:lifecycle-common 2.6.2, androidx.lifecycle:lifecycle-livedata-core 2.6.2, androidx.lifecycle:lifecycle-livedata 2.6.2, androidx.lifecycle:lifecycle-process 2.6.2, androidx.lifecycle:lifecycle-runtime 2.6.2, androidx.lifecycle:lifecycle-viewmodel-savedstate 2.6.2, androidx.lifecycle:lifecycle-viewmodel 2.6.2, androidx.loader:loader 1.0.0, androidx.profileinstaller:profileinstaller 1.3.1, androidx.resourceinspection:resourceinspection-annotation 1.0.1, androidx.savedstate:savedstate 1.2.1, androidx.startup:startup-runtime 1.1.1, androidx.tracing:tracing 1.0.0, androidx.vectordrawable:vectordrawable-animated 1.1.0, androidx.vectordrawable:vectordrawable 1.1.0, androidx.versionedparcelable:versionedparcelable 1.1.1, androidx.viewpager:viewpager 1.0.0, androidx.webkit:webkit 1.14.0, com.google.guava:listenablefuture 1.0, org.jetbrains.kotlin:kotlin-stdlib-jdk7 2.1.21, org.jetbrains.kotlin:kotlin-stdlib-jdk8 2.1.21, org.jetbrains.kotlin:kotlin-stdlib 2.1.21, org.jetbrains.kotlinx:kotlinx-coroutines-android 1.6.4, org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm 1.6.4, org.jetbrains:annotations 13.0, org.jspecify:jspecify 1.0.0

```text

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### cordovaAndroidApache2

Zugeordnet zu: cordova-android 15.1.0

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

```

## NOTICE-Texte

### cordovaAndroid

Zugeordnet zu: cordova-android 15.1.0

```text
Apache Cordova
Copyright 2015-2020 The Apache Software Foundation

This product includes software developed at
The Apache Software Foundation (http://www.apache.org/).

```

### cordovaPluginVibration

Zugeordnet zu: cordova-plugin-vibration 3.1.1

```text
Apache Cordova
Copyright 2012 The Apache Software Foundation

This product includes software developed at
The Apache Software Foundation (http://www.apache.org/).

This product includes software developed by Joerg Wiedenmann under the zlib license (http://www.gzip.org/zlib/zlib_license.html)

```


## pakoMitZlib

(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

(C) 1995-2013 Jean-loup Gailly and Mark Adler
(C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
  claim that you wrote the original software. If you use this software
  in a product, an acknowledgment in the product documentation would be
  appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
  misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.
