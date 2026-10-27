<template>
  <img
    class="brand-wordmark"
    :src="wordmark.src"
    :width="wordmark.width"
    :height="wordmark.height"
    alt=""
    aria-hidden="true"
  />
</template>

<script>
// These transparent crops come directly from the approved local artwork. The
// surrounding components retain accessible names and the live translated text.
const WORDMARKS = {
  de: {
    src: "static/notenpfoten-wordmark-de-transparent.png",
    width: 1344,
    height: 190
  },
  en: {
    src: "static/notenpfoten-wordmark-en-transparent.png",
    width: 1120,
    height: 183
  }
};

export default {
  name: "BrandWordmark",
  computed: {
    wordmark() {
      const language = String(this.$i18n.locale).toLowerCase().split(/[-_]/)[0];
      return WORDMARKS[language] || WORDMARKS.de;
    }
  }
};
</script>

<style scoped>
.brand-wordmark {
  display: block;
  width: 100%;
  max-width: 11em;
  height: auto;
  margin: 0 auto;
}
</style>
