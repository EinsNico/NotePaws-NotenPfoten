<template>
  <header class="flow-mode-header">
    <span class="flow-mode-icon" aria-hidden="true">{{icon}}</span>
    <div class="flow-mode-copy">
      <span class="flow-mode-kicker">{{$t('FLOW_HUB_KICKER')}}</span>
      <h1>{{title}}</h1>
      <p>{{description}}</p>
    </div>
  </header>
</template>

<script>
export default {
  name: "NoteFlowModeHeader",
  props: {
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true }
  }
};
</script>

<style scoped>
.flow-mode-header {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-top: 13px;
  padding: 13px 15px;
  border: 1px solid rgba(43, 70, 77, .11);
  border-radius: 21px;
  background: rgba(255, 255, 255, .8);
  box-shadow: 0 11px 25px rgba(72, 58, 45, .09);
}
.flow-mode-icon {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border-radius: 18px;
  background: #fff0e7;
  color: #d45324;
  font-size: 35px;
  line-height: 1;
}
.flow-mode-copy { min-width: 0; }
.flow-mode-kicker {
  color: #2d6e7b;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .16em;
}
.flow-mode-copy h1 {
  margin: 2px 0 0;
  color: #17262b;
  font-size: 24px;
  line-height: 1.05;
}
.flow-mode-copy p {
  margin: 4px 0 0;
  color: #64767a;
  font-size: 12px;
  line-height: 1.35;
}
</style>
