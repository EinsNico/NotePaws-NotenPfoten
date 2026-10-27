<template>
  <div class="workshop-practice-statistics">
    <button ref="toggleButton" type="button" class="progress-circle" :aria-label="$t('WORKSHOP_PRACTICE_PROGRESS_LABEL',{title,percent})"
      :aria-expanded="isOpen ? 'true' : 'false'" :aria-controls="popoverId" @click.stop="togglePopover">
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle class="progress-track" cx="24" cy="24" r="19" />
        <circle class="progress-fill" cx="24" cy="24" r="19" :stroke-dasharray="circumference" :stroke-dashoffset="dashOffset" transform="rotate(-90 24 24)" />
        <text class="progress-number" x="24" y="28">{{percent}}%</text>
      </svg>
    </button>
    <section v-if="isOpen" :id="popoverId" ref="popover" class="practice-statistics-popover" :class="{'opens-above':popoverAbove}" role="region"
      :aria-labelledby="popoverId+'-title'" :style="{width:popoverWidth+'px',transform:'translateX('+popoverShift+'px)',maxHeight:popoverMaxHeight === null ? null : popoverMaxHeight+'px'}" @click.stop>
      <div class="statistics-heading">
        <div>
          <small class="statistics-eyebrow">{{$t('ROUND_STATS_OVERVIEW_LABEL')}}</small>
          <h3 :id="popoverId+'-title'">{{$t('WORKSHOP_PRACTICE_STATS_TITLE')}}</h3>
        </div>
        <button ref="closeButton" type="button" class="statistics-close" :aria-label="$t('APP_INFO_CLOSE')" @click="closePopover()">×</button>
      </div>
      <p v-if="title" class="statistics-piece-title">{{title}}</p>
      <dl class="statistics-counts">
        <div v-for="row in rows" :key="row.key" :class="'statistics-'+row.key">
          <dt>{{$t(row.label)}}</dt><dd>{{row.count}}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script>
const POPOVER_DURATION=60000;
const COUNT_ROWS=Object.freeze([
  {key:"correct",label:"WORKSHOP_PRACTICE_STATS_CORRECT"},
  {key:"early",label:"WORKSHOP_PRACTICE_STATS_EARLY"},
  {key:"late",label:"WORKSHOP_PRACTICE_STATS_LATE"},
  {key:"wrong",label:"WORKSHOP_PRACTICE_STATS_WRONG"},
  {key:"missed",label:"WORKSHOP_PRACTICE_STATS_MISSED"}
]);
function safeCount(value) { return Number.isFinite(value) ? Math.max(0,Math.floor(value)) : 0; }

export default {
  name:"WorkshopPracticeStatistics",
  props:{progressPercent:{type:Number,default:0},statistics:{type:Object,default:()=>({})},title:{type:String,default:""}},
  data() { return {isOpen:false,popoverId:"workshop-practice-statistics-"+this._uid,popoverWidth:280,popoverShift:0,popoverAbove:false,popoverMaxHeight:null}; },
  computed:{
    percent() { return Number.isFinite(this.progressPercent) ? Math.max(0,Math.min(100,Math.round(this.progressPercent))) : 0; },
    circumference() { return 2*Math.PI*19; },
    dashOffset() { return this.circumference*(1-this.percent/100); },
    rows() { return COUNT_ROWS.map(row=>Object.assign({},row,{count:safeCount(this.statistics && this.statistics[row.key])})); }
  },
  created() { this._closeTimer=null;this._popoverRequest=0; },
  mounted() {
    document.addEventListener("click",this.outsideClick,true);
    document.addEventListener("keydown",this.handleKeydown,true);
    document.addEventListener("scroll",this.positionPopover,true);
    window.addEventListener("resize",this.positionPopover);
    if (window.visualViewport) window.visualViewport.addEventListener("resize",this.positionPopover);
  },
  beforeDestroy() {
    this.clearCloseTimer();this._popoverRequest++;this.isOpen=false;
    if (typeof document !== "undefined") {
      document.removeEventListener("click",this.outsideClick,true);
      document.removeEventListener("keydown",this.handleKeydown,true);
      document.removeEventListener("scroll",this.positionPopover,true);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("resize",this.positionPopover);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize",this.positionPopover);
    }
  },
  methods:{
    clearCloseTimer() {
      if (this._closeTimer !== null) {clearTimeout(this._closeTimer);this._closeTimer=null;}
    },
    togglePopover() {
      if (this.isOpen) {this.closePopover();return;}
      this.clearCloseTimer();this.isOpen=true;this.popoverShift=0;this.popoverAbove=false;this.popoverMaxHeight=null;
      this._closeTimer=setTimeout(()=>{
        this._closeTimer=null;
        const focused=typeof document !== "undefined" && this.$refs.popover && this.$refs.popover.contains(document.activeElement);
        this.closePopover(!!focused);
      },POPOVER_DURATION);
      this.$nextTick(()=>{
        if (!this.isOpen) return;
        this.positionPopover();
        if (this.$refs.closeButton) this.$refs.closeButton.focus({preventScroll:true});
      });
    },
    closePopover(restoreFocus=true) {
      this.clearCloseTimer();this._popoverRequest++;
      const wasOpen=this.isOpen;this.isOpen=false;
      if (wasOpen && restoreFocus && this.$refs.toggleButton) this.$refs.toggleButton.focus({preventScroll:true});
    },
    outsideClick(event) {
      if (this.isOpen && this.$el && !this.$el.contains(event.target)) this.closePopover(false);
    },
    handleKeydown(event) {
      if (!this.isOpen || event.key !== "Escape") return;
      event.preventDefault();event.stopPropagation();this.closePopover();
    },
    positionPopover() {
      if (!this.isOpen || typeof window === "undefined") return;
      const viewport=window.visualViewport,width=viewport ? viewport.width : window.innerWidth;
      if (!(width > 0)) return;
      this.popoverWidth=Math.max(0,Math.min(280,width-24));
      const request=++this._popoverRequest;
      this.$nextTick(()=>{
        if (!this.isOpen || request !== this._popoverRequest || !this.$refs.popover) return;
        const rect=this.$refs.popover.getBoundingClientRect(),left=(viewport ? viewport.offsetLeft : 0)+12,right=left+width-24;
        const baseLeft=rect.left-this.popoverShift,baseRight=rect.right-this.popoverShift;
        this.popoverShift=baseLeft < left ? left-baseLeft : baseRight > right ? right-baseRight : 0;
        const button=this.$refs.toggleButton;
        if (button && button.getBoundingClientRect) {
          const anchor=button.getBoundingClientRect(),top=(viewport ? viewport.offsetTop : 0)+12,height=viewport ? viewport.height : window.innerHeight;
          if (height > 0 && rect.height > 0) {
            const below=top+height-24-anchor.bottom-8,above=anchor.top-top-8;
            this.popoverAbove=rect.height > below && above > below;
            this.popoverMaxHeight=Math.max(0,this.popoverAbove ? above : below);
          }
        }
      });
    }
  }
};
</script>

<style scoped>
.workshop-practice-statistics {position:relative;display:inline-flex;flex:0 0 auto;align-self:flex-start;}
.progress-circle {display:block;width:48px;height:48px;min-width:48px;min-height:48px;padding:0;border:0;border-radius:50%;background:transparent;color:#29464d;cursor:pointer;}
.progress-circle svg {display:block;width:48px;height:48px;}.progress-track,.progress-fill {fill:none;stroke-width:4;}
.progress-track {stroke:#e1e9e6;}.progress-fill {stroke:#2c8290;stroke-linecap:round;}
.progress-number {fill:currentColor;text-anchor:middle;font:700 10px sans-serif;}
.progress-circle:focus-visible,.statistics-close:focus-visible {outline:2px solid #2c8290;outline-offset:3px;}
.practice-statistics-popover {position:absolute;top:calc(100% + 8px);right:0;z-index:20;box-sizing:border-box;max-width:calc(100vw - 24px);overflow-y:auto;padding:12px 16px 16px;border:1px solid #d2dfdc;border-radius:14px;background:#fffdf7;color:#29464d;box-shadow:0 8px 24px #29464d24;}
.practice-statistics-popover.opens-above {top:auto;bottom:calc(100% + 8px);}
.statistics-heading {display:flex;align-items:center;gap:8px;justify-content:space-between;}.statistics-heading h3 {margin:0;font-size:15px;line-height:1.3;}
.statistics-close {flex:0 0 auto;width:44px;height:44px;min-width:44px;min-height:44px;border:0;border-radius:8px;background:transparent;color:#526d73;font-size:26px;cursor:pointer;}
.statistics-piece-title {margin:0 0 10px;color:#668084;font-size:12px;line-height:1.4;overflow-wrap:anywhere;}
.statistics-counts {margin:0;font-size:13px;line-height:1.4;}.statistics-counts > div {display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 0;}
.statistics-counts dt {min-width:0;}.statistics-counts dd {margin:0;flex:0 0 auto;font-weight:700;font-variant-numeric:tabular-nums;}
.statistics-correct dd {color:#2c8290;}.statistics-early dd,.statistics-late dd {color:#a76820;}.statistics-wrong dd,.statistics-missed dd {color:#b45437;}
</style>
