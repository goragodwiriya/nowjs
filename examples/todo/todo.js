// Register 'todo' component with reactive state management
Now.getManager('component').define('todo', {
  // Enable reactive data binding
  reactive: true,

  // Initial component state
  state: {
    title: 'Todo Application', // Application title
    todos: [], // Array to store todo items
    remaining: 0, // Number of uncompleted todos
    newTodo: '', // Input field for new todo text
    filter: 'all' // Current filter state (all/active/completed)
  },

  // Computed properties - automatically update when dependencies change
  computed: {
    // Filter todos based on current filter selection
    filteredTodos() {
      const {todos, filter} = this.state;
      if (filter === 'all') {
        return todos;
      }

      // Return completed or active todos based on filter
      return todos.filter(todo => (filter === 'completed' ? todo.completed : !todo.completed));
    }
  },

  // Component methods
  methods: {
    // Add new todo item
    addTodo() {
      // Skip if input is empty or only whitespace
      if (!this.state.newTodo.trim()) return;

      // Create and add new todo object
      this.state.todos.push({
        id: Utils.generateUUID(), // Generate unique ID
        text: this.state.newTodo, // Todo text
        completed: false // Initial completion status
      });

      // Clear input field
      this.state.newTodo = '';

      // Persist to localStorage
      this.methods.saveTodos();
    },

    // Toggle completion status of a todo
    toggleTodo(id) {
      const todo = this.state.todos.find(t => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
        this.methods.saveTodos();
      }
    },

    // Remove a todo item
    removeTodo(id) {
      this.state.todos = this.state.todos.filter(t => t.id !== id);
      this.methods.saveTodos();
    },

    // Remove all completed todos
    clearCompleted() {
      this.state.todos = this.state.todos.filter(t => !t.completed);
      this.methods.saveTodos();
    },

    // Update current filter
    setFilter(filter) {
      this.state.filter = filter;
    },

    // Load todos from localStorage
    loadTodos() {
      const stored = localStorage.getItem('todos');
      if (stored) {
        this.state.todos = JSON.parse(stored);
        this.methods.updateRemaining();
      }
    },

    // Save todos to localStorage
    saveTodos() {
      localStorage.setItem('todos', JSON.stringify(this.state.todos));
      this.methods.updateRemaining();
    },

    // Update number of uncompleted todos
    updateRemaining() {
      this.state.remaining = this.state.todos.filter(todo => !todo.completed).length;
    }
  },

  // Lifecycle hook - called after component is mounted to DOM
  mounted() {
    // Load saved todos when component is mounted
    this.methods.loadTodos();
  },

  // Event handlers
  events: {
    // Save todos when application cleanup occurs
    'app:cleanup:end': function() {
      this.methods.saveTodos();
    }
  }
});