<template>
  <div class="app-info-overlay" @click.self="$emit('close')">
    <section
      ref="dialog"
      class="app-info-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-info-title"
      tabindex="-1">
        <button
          type="button"
          class="app-info-close-icon"
          :aria-label="$t('APP_INFO_CLOSE')"
          @click="$emit('close')">
            ×
        </button>

        <header class="app-info-hero">
          <span class="app-info-logo-frame" aria-hidden="true">
            <img
              class="app-info-logo"
              src="static/icon-512.png"
              alt=""
            />
          </span>
          <div class="app-info-hero-copy">
            <span class="app-info-kicker">{{$t('HOME_APP_INFO')}}</span>
            <h2 id="app-info-title" :aria-label="$t('APP_BRAND_NAME')">
              <BrandWordmark />
            </h2>
            <p class="app-info-version">
              {{$t('APP_INFO_VERSION', { version: appVersion })}}
            </p>
          </div>
        </header>

        <section class="app-info-introduction">
          <p class="app-info-lead">{{$t('APP_INFO_DESCRIPTION')}}</p>
          <p class="app-info-maintained"><strong>{{$t('APP_INFO_MAINTAINED')}}</strong></p>
          <p class="app-info-origin">{{$t('APP_INFO_ORIGINAL_PROJECT')}}</p>
        </section>

        <section class="app-info-story" aria-labelledby="app-info-story-title">
          <h3 id="app-info-story-title">{{$t('APP_INFO_STORY_TITLE')}}</h3>
          <p>{{$t('APP_INFO_AI_DEVELOPMENT')}}</p>
          <p>{{$t('APP_INFO_LEARNING_PURPOSE')}}</p>
          <p class="app-info-principle">{{$t('APP_INFO_OPEN_ACCESS')}}</p>
        </section>

        <section class="app-info-sections" aria-labelledby="app-info-details-title">
          <header class="app-info-details-heading">
            <h3 id="app-info-details-title">{{$t('APP_INFO_DETAILS_TITLE')}}</h3>
            <p class="app-info-license-summary">{{$t('APP_INFO_LICENSE_SUMMARY')}}</p>
          </header>

        <button
          type="button"
          class="app-info-license-toggle app-info-section-toggle"
          :aria-expanded="showPrivacy ? 'true' : 'false'"
          aria-controls="app-info-privacy"
          @click="showPrivacy = !showPrivacy">
            {{showPrivacy
              ? $t('APP_INFO_PRIVACY_HIDE')
              : $t('APP_INFO_PRIVACY_SHOW')}}
        </button>

        <section
          v-show="showPrivacy"
          id="app-info-privacy"
          class="app-info-privacy"
          role="region"
          aria-labelledby="app-info-privacy-title">
            <h3 id="app-info-privacy-title">
              {{$t('APP_INFO_PRIVACY_TITLE')}}
            </h3>
            <ul>
              <li v-for="item in privacyItems" :key="item">{{item}}</li>
            </ul>
            <p>{{$t('APP_INFO_PRIVACY_EXPORT_NOTE')}}</p>
        </section>

        <button
          type="button"
          class="app-info-license-toggle app-info-section-toggle"
          :aria-expanded="showLegal ? 'true' : 'false'"
          aria-controls="app-info-legal"
          @click="showLegal = !showLegal">
            {{showLegal
              ? $t('APP_INFO_LEGAL_HIDE')
              : $t('APP_INFO_LEGAL_SHOW')}}
        </button>

        <section
          v-show="showLegal"
          id="app-info-legal"
          class="app-info-legal"
          role="region"
          aria-labelledby="app-info-legal-title">
            <h3 id="app-info-legal-title">
              {{$t('APP_INFO_LEGAL_TITLE')}}
            </h3>
            <p><strong>Note Paws / Noten Pfoten</strong></p>
            <p><strong>{{$t('APP_INFO_LEGAL_COPYRIGHT')}}</strong></p>
            <p>{{$t('APP_INFO_LEGAL_PROJECT_NAMES')}}</p>
            <p>{{$t('APP_INFO_LEGAL_BRAND_RIGHTS')}}</p>
            <p>{{$t('APP_INFO_LEGAL_CONTENT_RIGHTS')}}</p>
            <p>{{$t('APP_INFO_LEGAL_SOURCE_LICENSE')}}</p>
            <p>{{$t('APP_INFO_LEGAL_THIRD_PARTY')}}</p>
        </section>

        <button
          type="button"
          class="app-info-license-toggle app-info-section-toggle"
          :aria-expanded="showProjectLicense ? 'true' : 'false'"
          aria-controls="app-info-project-license"
          @click="showProjectLicense = !showProjectLicense">
            {{showProjectLicense
              ? $t('APP_INFO_AGPL_HIDE')
              : $t('APP_INFO_AGPL_SHOW')}}
        </button>

        <section
          v-show="showProjectLicense"
          id="app-info-project-license"
          class="app-info-license"
          role="region"
          :aria-label="$t('APP_INFO_AGPL_TITLE')">
            <h3>{{$t('APP_INFO_AGPL_TITLE')}}</h3>
            <pre class="app-info-project-license-text">{{projectLicenseText}}</pre>
        </section>

        <button
          type="button"
          class="app-info-license-toggle app-info-section-toggle"
          :aria-expanded="showLicense ? 'true' : 'false'"
          aria-controls="app-info-license"
          @click="showLicense = !showLicense">
            {{showLicense
              ? $t('APP_INFO_HIDE_LICENSE')
              : $t('APP_INFO_SHOW_LICENSE')}}
        </button>

        <div
          v-show="showLicense"
          id="app-info-license"
          class="app-info-license"
          role="region"
          :aria-label="$t('APP_INFO_LICENSE_TITLE')">
            <h3>{{$t('APP_INFO_LICENSE_TITLE')}}</h3>
            <p>Copyright 2018 MelvilQ</p>
            <p>
              Permission is hereby granted, free of charge, to any person obtaining
              a copy of this software and associated documentation files (the
              “Software”), to deal in the Software without restriction, including
              without limitation the rights to use, copy, modify, merge, publish,
              distribute, sublicense, and/or sell copies of the Software, and to
              permit persons to whom the Software is furnished to do so, subject to
              the following conditions:
            </p>
            <p>
              The above copyright notice and this permission notice shall be
              included in all copies or substantial portions of the Software.
            </p>
            <p>
              THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
              NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
              BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
              ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
              CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
              SOFTWARE.
            </p>
        </div>

        <button
          type="button"
          class="app-info-license-toggle app-info-section-toggle app-info-open-source-toggle"
          :aria-expanded="showOpenSource ? 'true' : 'false'"
          aria-controls="app-info-open-source"
          @click="showOpenSource = !showOpenSource">
            {{showOpenSource
              ? $t('APP_INFO_OPEN_SOURCE_HIDE')
              : $t('APP_INFO_OPEN_SOURCE_SHOW')}}
        </button>

        <section
          v-show="showOpenSource"
          id="app-info-open-source"
          class="app-info-open-source"
          role="region"
          aria-labelledby="app-info-open-source-title">
            <h3 id="app-info-open-source-title">
              {{$t('APP_INFO_OPEN_SOURCE_TITLE')}}
            </h3>
            <p>{{$t('APP_INFO_OPEN_SOURCE_DESCRIPTION')}}</p>

            <section
              v-for="group in componentGroups"
              :key="group.id"
              class="app-info-component-group">
                <h4>{{$t(group.labelKey)}}</h4>
                <article
                  v-for="component in group.components"
                  :key="component.id"
                  class="app-info-component">
                    <button
                      type="button"
                      class="app-info-component-toggle"
                      :aria-expanded="isComponentOpen(component.id) ? 'true' : 'false'"
                      :aria-controls="componentPanelId(component.id)"
                      :aria-label="$t('APP_INFO_COMPONENT_TOGGLE', { name: component.name })"
                      @click="toggleComponent(component.id)">
                        <span class="app-info-component-summary">
                          <strong>{{component.name}} {{component.version}}</strong>
                          <span>{{component.license}}</span>
                          <small v-if="component.copyright">{{component.copyright}}</small>
                        </span>
                        <span class="app-info-component-symbol" aria-hidden="true">
                          {{isComponentOpen(component.id) ? '−' : '+'}}
                        </span>
                    </button>
                    <div
                      v-show="isComponentOpen(component.id)"
                      :id="componentPanelId(component.id)"
                      class="app-info-component-license"
                      role="region"
                      :aria-label="$t('APP_INFO_COMPONENT_TOGGLE', { name: component.name })">
                        <h5>{{$t('APP_INFO_LICENSE_TEXT')}}</h5>
                        <pre>{{licenseText(component)}}</pre>
                        <template v-if="component.noticeTextId">
                          <h5>{{$t('APP_INFO_NOTICE_TITLE')}}</h5>
                          <pre>{{noticeText(component)}}</pre>
                        </template>
                    </div>
                </article>
            </section>
        </section>

        </section>

        <button
          type="button"
          class="app-info-close-button"
          @click="$emit('close')">
            {{$t('APP_INFO_CLOSE')}}
        </button>
    </section>
  </div>
</template>

<script>
import packageMetadata from "../../package.json";
import thirdPartyLicenseData from "../resources/third-party-licenses.v1.json";
import projectLicenseText from "../resources/agpl-license";
import BrandWordmark from "./BrandWordmark";
import { createModalFocusGuard } from "../model/ModalFocus";

export default {
  name: "AppInfoDialog",
  components: {
    BrandWordmark
  },
  props: { returnFocus: { default: null } },
  data() {
    return {
      appVersion: packageMetadata.version,
      showPrivacy: false,
      showLegal: false,
      showProjectLicense: false,
      showLicense: false,
      showOpenSource: false,
      openComponents: {}
    };
  },
  computed: {
    projectLicenseText() {
      return projectLicenseText;
    },
    privacyItems() {
      return [
        "APP_INFO_PRIVACY_NO_ACCOUNTS",
        "APP_INFO_PRIVACY_NO_SERVERS",
        "APP_INFO_PRIVACY_NO_TRANSFER",
        "APP_INFO_PRIVACY_NO_ANALYTICS",
        "APP_INFO_PRIVACY_NO_ADS",
        "APP_INFO_PRIVACY_NO_IDENTIFIERS",
        "APP_INFO_PRIVACY_NO_CLOUD_BACKUP",
        "APP_INFO_PRIVACY_LOCAL_STORAGE"
      ].map(key => this.$t(key));
    },
    componentGroups() {
      return [
        {
          id: "web",
          labelKey: "APP_INFO_OPEN_SOURCE_WEB",
          components: thirdPartyLicenseData.components.filter(component =>
            !component.id.startsWith("native-") &&
            !component.id.startsWith("cordova-")
          )
        },
        {
          id: "android",
          labelKey: "APP_INFO_OPEN_SOURCE_ANDROID",
          components: thirdPartyLicenseData.components.filter(component =>
            component.id.startsWith("native-") ||
            component.id.startsWith("cordova-")
          )
        }
      ];
    }
  },
  methods: {
    isComponentOpen(componentId) {
      return Boolean(this.openComponents[componentId]);
    },
    toggleComponent(componentId) {
      this.$set(
        this.openComponents,
        componentId,
        !this.isComponentOpen(componentId)
      );
    },
    componentPanelId(componentId) {
      return `app-info-component-${componentId}`;
    },
    licenseText(component) {
      return thirdPartyLicenseData.licenseTexts[component.licenseTextId].join("\n");
    },
    noticeText(component) {
      return thirdPartyLicenseData.noticeTexts[component.noticeTextId].join("\n");
    },
    handleKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.$emit("close");
      }
    }
  },
  mounted() {
    document.addEventListener("keydown", this.handleKeydown);
    // Mounted runs after the focused opener's click/Enter has created the dialog.
    // Install containment immediately, before the next key can reach the page.
    this.modalFocusGuard = createModalFocusGuard(this.$refs.dialog, this.$el, document, this.returnFocus);
  },
  beforeDestroy() {
    document.removeEventListener("keydown", this.handleKeydown);
    if (this.modalFocusGuard) this.modalFocusGuard.release();
  }
};
</script>

<style scoped>
.app-info-overlay {
  position: fixed;
  z-index: 100;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 18px;
  background: rgba(17, 37, 45, 0.58);
}

.app-info-dialog {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: calc(100vh - 36px);
  box-sizing: border-box;
  overflow-y: auto;
  padding: 23px 24px 20px;
  border: 2px solid #e99270;
  border-radius: 18px;
  background: linear-gradient(145deg, #fffaf7 0%, #f6fbfd 75%);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.3);
  color: #334e59;
  text-align: center;
  outline: none;
}

.app-info-dialog::before {
  position: absolute;
  top: 0;
  left: 50%;
  width: 44px;
  height: 4px;
  border-radius: 0 0 4px 4px;
  background: #e85c2c;
  content: "";
  transform: translateX(-50%);
}

.app-info-logo {
  width: 82px;
  height: 82px;
  object-fit: contain;
}

.app-info-dialog h2 {
  margin: 3px 32px 0;
  font-size: 20pt;
}

.app-info-dialog p {
  margin: 10px 0 0;
  font-size: 10pt;
  line-height: 1.45;
}

.app-info-dialog .app-info-version {
  margin-top: 2px;
  color: #70838b;
  font-size: 9pt;
}

.app-info-close-icon {
  position: absolute;
  top: 9px;
  right: 10px;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: #526d78;
  font-size: 21pt;
  line-height: 1;
  cursor: pointer;
}

.app-info-close-icon:hover,
.app-info-close-icon:focus {
  border-color: #d8a08a;
  background: white;
  color: #a54120;
  outline: none;
}

.app-info-license-toggle,
.app-info-close-button {
  min-height: 42px;
  margin-top: 15px;
  padding: 8px 15px;
  border-radius: 9px;
  font-size: 10pt;
  font-weight: bold;
  cursor: pointer;
}

.app-info-license-toggle {
  border: 1px solid #d99276;
  background: white;
  color: #9c3b1a;
}

.app-info-section-toggle,
.app-info-open-source-toggle {
  width: 100%;
}

.app-info-close-button {
  width: 100%;
  border: 1px solid #7bafc2;
  background: lightblue;
  color: #173d4b;
}

.app-info-license-toggle:hover,
.app-info-license-toggle:focus,
.app-info-close-button:hover,
.app-info-close-button:focus {
  border-color: #39748b;
  outline: 2px solid #9fd1e1;
  outline-offset: 2px;
}

.app-info-license {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #d5e8ef;
  border-radius: 10px;
  background: white;
  text-align: left;
  user-select: text;
}

.app-info-privacy {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid #b9dce8;
  border-radius: 10px;
  background: #f4fbfd;
  text-align: left;
}

.app-info-privacy h3 {
  margin: 0;
  color: #315f72;
  font-size: 10pt;
}

.app-info-privacy ul {
  margin: 9px 0 0;
  padding-left: 20px;
  font-size: 9pt;
  line-height: 1.45;
}

.app-info-privacy li + li {
  margin-top: 3px;
}

.app-info-dialog .app-info-privacy p {
  margin-top: 10px;
  color: #59717b;
  font-size: 8.5pt;
}

.app-info-legal {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid #e5c7bb;
  border-radius: 10px;
  background: #fffaf7;
  text-align: left;
  user-select: text;
}

.app-info-legal h3 {
  margin: 0;
  color: #8b3c21;
  font-size: 10pt;
}

.app-info-dialog .app-info-legal p {
  margin-top: 8px;
  font-size: 8.5pt;
}

.app-info-license h3 {
  margin: 0;
  color: #315f72;
  font-size: 10pt;
}

.app-info-license p {
  font-size: 8.5pt;
}

.app-info-project-license-text {
  max-height: 55vh;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 8pt;
  line-height: 1.45;
}

.app-info-open-source {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #d5e8ef;
  border-radius: 10px;
  background: white;
  text-align: left;
}

.app-info-open-source > h3 {
  margin: 0;
  color: #315f72;
  font-size: 10pt;
}

.app-info-dialog .app-info-open-source > p {
  margin-top: 7px;
  color: #59717b;
  font-size: 8.5pt;
}

.app-info-component-group {
  margin-top: 14px;
}

.app-info-component-group > h4 {
  margin: 0 0 6px;
  color: #315f72;
  font-size: 9pt;
}

.app-info-component {
  margin-top: 6px;
  border: 1px solid #c9dfe7;
  border-radius: 8px;
  overflow: hidden;
}

.app-info-component-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  padding: 9px 11px;
  border: 0;
  background: #f5fbfd;
  color: #294d5b;
  text-align: left;
  cursor: pointer;
}

.app-info-component-toggle:hover,
.app-info-component-toggle:focus {
  background: #eaf7fb;
  outline: 2px solid #7bafc2;
  outline-offset: -2px;
}

.app-info-component-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  overflow-wrap: anywhere;
}

.app-info-component-summary strong {
  font-size: 8.5pt;
}

.app-info-component-summary > span,
.app-info-component-summary small {
  color: #617780;
  font-size: 7.5pt;
  line-height: 1.3;
}

.app-info-component-symbol {
  flex: 0 0 auto;
  margin-left: 10px;
  color: #b74520;
  font-size: 15pt;
}

.app-info-component-license {
  padding: 10px;
  border-top: 1px solid #d5e8ef;
  background: #fffdfb;
}

.app-info-component-license h5 {
  margin: 0 0 6px;
  color: #315f72;
  font-size: 8pt;
}

.app-info-component-license h5:not(:first-child) {
  margin-top: 12px;
}

.app-info-component-license pre {
  max-height: 260px;
  margin: 0;
  overflow: auto;
  color: #3d5159;
  font-family: monospace;
  font-size: 7pt;
  line-height: 1.4;
  tab-size: 4;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

/* Version 1.3.0 information design */
.app-info-overlay {
  padding: 20px;
  background: rgba(24, 47, 53, 0.68);
  backdrop-filter: blur(5px);
}

.app-info-dialog {
  max-width: 560px;
  max-height: calc(100vh - 40px);
  padding: 0;
  overscroll-behavior: contain;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 28px;
  background:
    radial-gradient(circle at 8% 3%, rgba(231, 101, 48, 0.16), transparent 29%),
    radial-gradient(circle at 96% 34%, rgba(45, 110, 123, 0.13), transparent 35%),
    #f7f2e9;
  box-shadow: 0 24px 70px rgba(11, 29, 34, 0.38);
  color: #31474d;
  scrollbar-color: rgba(45, 110, 123, 0.42) transparent;
  scrollbar-width: thin;
}

.app-info-dialog::before {
  left: 24px;
  width: 72px;
  height: 5px;
  border-radius: 0 0 999px 999px;
  background: #e76530;
  transform: none;
}

.app-info-close-icon {
  position: sticky;
  z-index: 4;
  top: 12px;
  display: block;
  width: 40px;
  height: 40px;
  margin: 12px 12px -52px auto;
  border: 1px solid rgba(43, 70, 77, 0.13);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 6px 16px rgba(47, 55, 54, 0.12);
  color: #526a70;
  font-size: 24px;
  backdrop-filter: blur(4px);
}

.app-info-close-icon:hover,
.app-info-close-icon:focus-visible {
  border-color: rgba(231, 101, 48, 0.45);
  background: #fffaf6;
  color: #a74420;
  outline: 2px solid rgba(231, 101, 48, 0.24);
  outline-offset: 2px;
}

.app-info-hero {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: 17px;
  padding: 25px 64px 20px 22px;
  text-align: left;
}

.app-info-logo-frame {
  display: grid;
  width: 86px;
  height: 86px;
  place-items: center;
  border: 1px solid rgba(231, 101, 48, 0.18);
  border-radius: 25px;
  background: rgba(255, 250, 246, 0.82);
  box-shadow: 0 9px 22px rgba(83, 66, 51, 0.11);
}

.app-info-logo {
  width: 76px;
  height: 76px;
}

.app-info-hero-copy {
  min-width: 0;
}

.app-info-kicker {
  display: block;
  margin-bottom: 5px;
  color: #c65325;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}

.app-info-dialog h2 {
  width: min(100%, 276px);
  margin: 0;
  font-size: 18px;
}

.app-info-dialog .app-info-version {
  display: inline-flex;
  margin-top: 7px;
  padding: 4px 9px;
  border-radius: 999px;
  background: #dfeff1;
  color: #286a77;
  font-size: 11px;
  font-weight: 800;
}

.app-info-introduction {
  margin: 0 24px;
  text-align: left;
}

.app-info-dialog .app-info-introduction p {
  margin: 9px 0 0;
  color: #52686d;
  font-size: 13px;
  line-height: 1.6;
}

.app-info-dialog .app-info-introduction .app-info-lead {
  margin-top: 0;
  color: #253a40;
  font-size: 15px;
  font-weight: 800;
}

.app-info-dialog .app-info-maintained strong {
  color: #ba4c22;
}

.app-info-dialog .app-info-introduction .app-info-origin {
  font-size: 12px;
  color: #607579;
}

.app-info-story {
  margin: 20px 20px 0;
  padding: 20px;
  border: 1px solid #e0e6e1;
  border-radius: 18px;
  background: #fffdf9;
  text-align: left;
}

.app-info-story h3,
.app-info-details-heading h3 {
  margin: 0;
  color: #294b53;
  font-size: 15px;
  line-height: 1.4;
}

.app-info-dialog .app-info-story p {
  margin: 12px 0 0;
  color: #435c63;
  font-size: 14px;
  line-height: 1.65;
}

.app-info-dialog .app-info-story .app-info-principle {
  margin-top: 16px;
  padding-left: 12px;
  border-left: 3px solid #96b8b3;
  color: #305b59;
}

.app-info-sections {
  margin: 16px 20px 0;
  overflow: hidden;
  border: 1px solid #d5dfdc;
  border-radius: 18px;
  background: #fffdf9;
  text-align: left;
}

.app-info-details-heading {
  padding: 18px;
}

.app-info-dialog .app-info-license-summary {
  margin: 9px 0 0;
  color: #5b7075;
  font-size: 12px;
  line-height: 1.6;
}

.app-info-license-toggle,
.app-info-close-button {
  box-sizing: border-box;
  min-height: 48px;
  border-radius: 15px;
  font-size: 12px;
}

.app-info-license-toggle {
  position: relative;
  margin-top: 0;
  padding: 13px 44px 13px 18px;
  border: 0;
  border-top: 1px solid #e1e8e3;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #295f6b;
  font-size: 13px;
  text-align: left;
}

.app-info-license-toggle:first-child {
  margin-top: 0;
}

.app-info-section-toggle::after {
  position: absolute;
  top: 50%;
  right: 14px;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 50%;
  background: transparent;
  color: #286a77;
  content: "+";
  font-size: 20px;
  font-weight: 400;
  line-height: 1;
  transform: translateY(-50%);
}

.app-info-section-toggle[aria-expanded="true"]::after {
  content: "−";
}

.app-info-sections > .app-info-license-toggle:focus {
  border-color: #e1e8e3;
  outline: none;
}

.app-info-sections > .app-info-license-toggle:hover,
.app-info-sections > .app-info-license-toggle[aria-expanded="true"] {
  background: #eef5f2;
}

.app-info-sections > .app-info-license-toggle:focus-visible {
  outline: 2px solid #2d6e7b;
  outline-offset: -3px;
}

.app-info-privacy,
.app-info-legal,
.app-info-license,
.app-info-open-source {
  margin-top: 0;
  padding: 15px 18px 18px;
  border: 0;
  border-radius: 0;
  background: #f4f8f5;
  box-shadow: none;
}

.app-info-privacy {
  background: #f4f8f5;
}

.app-info-legal {
  background: #f4f8f5;
}

.app-info-license,
.app-info-open-source {
  background: #f4f8f5;
}

.app-info-privacy h3,
.app-info-license h3,
.app-info-open-source > h3,
.app-info-component-group > h4 {
  color: #286a77;
}

.app-info-legal h3 {
  color: #a84520;
}

.app-info-component {
  border-color: rgba(45, 110, 123, 0.2);
  border-radius: 12px;
}

.app-info-component-toggle {
  min-height: 48px;
  background: #f4faf9;
}

.app-info-component-toggle:hover,
.app-info-component-toggle:focus-visible {
  background: #e9f4f4;
  outline: 2px solid rgba(45, 110, 123, 0.32);
  outline-offset: -2px;
}

.app-info-close-button {
  width: calc(100% - 40px);
  margin: 16px 20px 20px;
  border: 1px solid #2d6e7b;
  background: #2d6e7b;
  box-shadow: 0 8px 18px rgba(45, 110, 123, 0.2);
  color: white;
}

.app-info-close-button:hover,
.app-info-close-button:focus-visible {
  border-color: #245964;
  background: #245f6a;
  outline: 2px solid rgba(45, 110, 123, 0.25);
  outline-offset: 2px;
}

@media (max-width: 420px) {
  .app-info-overlay {
    align-items: flex-start;
    padding: 8px;
  }

  .app-info-dialog {
    max-height: calc(100vh - 16px);
    padding: 0;
    border-radius: 22px;
  }

  .app-info-hero {
    grid-template-columns: 70px minmax(0, 1fr);
    gap: 13px;
    padding: 22px 52px 17px 15px;
  }

  .app-info-logo-frame {
    width: 68px;
    height: 68px;
    border-radius: 20px;
  }

  .app-info-logo {
    width: 61px;
    height: 61px;
  }

  .app-info-kicker {
    font-size: 9px;
  }

  .app-info-dialog h2 {
    font-size: 16px;
  }

  .app-info-introduction,
  .app-info-story,
  .app-info-sections {
    margin-right: 12px;
    margin-left: 12px;
  }

  .app-info-introduction {
    padding: 0 4px;
  }

  .app-info-story {
    padding: 17px;
  }

  .app-info-details-heading {
    padding: 16px;
  }

  .app-info-close-button {
    width: calc(100% - 24px);
    margin-right: 12px;
    margin-bottom: 14px;
    margin-left: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-info-close-icon,
  .app-info-license-toggle,
  .app-info-close-button,
  .app-info-component-toggle {
    scroll-behavior: auto;
  }
}
</style>
