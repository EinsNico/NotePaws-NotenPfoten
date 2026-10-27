<template>
</template>

<script>
// German computer-keyboard shortcuts, grouped by their pitch class.
const NOTE_KEYS = [
  ['y', ',', 'q', 'i'],
  ['s', 'l', '2', '9'],
  ['x', '.', 'w', 'o'],
  ['d', 'ö', '3', '0'],
  ['c', '-', 'e', 'p'],
  ['v', 'r', 'ü'],
  ['g', '5'],
  ['b', 't', '+'],
  ['h', '6'],
  ['n', 'z'],
  ['j', '7'],
  ['m', 'u']
];

export default {
  name: 'MousetrapInput',
  methods: {
    initMousetrap(){
      NOTE_KEYS.forEach((keys, note) => {
        keys.forEach(key => this.$mousetrap.bind(key, () => this.solve(note)));
      });
    },
    solve(v){
      this.$emit('solved', v);
    }
  },
  mounted(){
    this.initMousetrap();
  },
  beforeDestroy(){
    NOTE_KEYS.forEach(keys => {
      keys.forEach(key => this.$mousetrap.unbind(key));
    });
  }
}
</script>
