import Vue from "vue";
import "./styles/statistics-input-switch.css";
import "./styles/statistics-cards.css";
import VueI18n from "vue-i18n";
import VueMousetrap from "vue-mousetrap";
import strings from "./resources/strings";
import App from "./App";
import Options from "./model/Options";
import { shouldShowWelcome } from "./model/WelcomeTutorial";
import { normalizeEnabledLanguage } from "./model/LanguageOptions";
import { normalizeNoteNaming } from "./model/NoteNaming";
import { recoverPendingShadowImport } from "./model/SaveDataShadowCommit";

try {
  recoverPendingShadowImport();
} catch (error) {
  const app = document.getElementById("app");
  if (app) {
    app.textContent = "Die Sicherung konnte nicht sicher wiederhergestellt werden. Bitte die App nicht zurücksetzen und den Support kontaktieren.";
  }
  throw error;
}

Vue.config.productionTip = false;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

Vue.use(require("vue-chartist"));
Vue.use(VueI18n);
Vue.use(VueMousetrap);

const initialTutorial = shouldShowWelcome(localStorage, window.location.search);
Options.loadOptions();
const enabledLanguage = normalizeEnabledLanguage(
  Options.language,
  navigator.language
);
const enabledNoteNaming = normalizeNoteNaming(
  Options.noteNaming,
  enabledLanguage
);
if (
  Options.language !== enabledLanguage
  || Options.noteNaming !== enabledNoteNaming
) {
  Options.language = enabledLanguage;
  Options.noteNaming = enabledNoteNaming;
  Options.saveOptions();
}
const i18n = new VueI18n({
  locale: Options.language,
  fallbackLocale: "en",
  messages: strings
});

function updateExternalAppMetadata(language) {
  document.title = i18n.t("APP_EXTERNAL_NAME");
  document.documentElement.lang = language;
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    manifestLink.setAttribute(
      "href",
      language === "en"
        ? "/static/manifest-en.json"
        : "/static/manifest.json"
    );
  }
}

updateExternalAppMetadata(Options.language);
Vue.prototype.$updateExternalAppMetadata = updateExternalAppMetadata;

new Vue({
  i18n,
  el: "#app",
  components: { App },
  data: { initialTutorial },
  template: '<App :initial-tutorial="initialTutorial"/>'
});
