// Counter component
Now.getManager('component').define('reactivecounter', {
  reactive: true,
  debug: false,
  // Component state
  state: {
    title: 'Counter Component',
    count: 0
  },

  // Component methods
  methods: {
    increment() {
      this.state.count++;
      console.log('increment', this.state.count);
    },
    decrement() {
      this.state.count--;
      console.log('decrement', this.state.count);
    },
    reset() {
      this.state.count = 0;
      console.log('reset', this.state.count);
    },
  },

  // Lifecycle hooks
  mounted() {
    console.log('Counter component mounted');
  },

  // Event handlers - will be properly handled now
  events: {
    'app:cleanup:end': function() {
      this.state.count = 0;
      console.log('app:cleanup:end', this.state.count);
    }
  }
});
