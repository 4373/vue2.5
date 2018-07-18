const vm =  new Vue({
  el: '#app',
  data() {
    return {
      count: 8
    }
  },
  watch: {
    'count': {
      handler(b) {
        console.log(b)
      },
      deep: true
    }
  },
  mounted() {
    this.count = 9
  }
})