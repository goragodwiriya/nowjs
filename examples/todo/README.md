# Todo Application Example

ตัวอย่างการสร้าง Todo Application ด้วย Now.js Framework

## Features

ตัวอย่างนี้แสดงการใช้งานขั้นสูงของ reactive component:

- **Reactive State** - State ที่อัปเดต UI อัตโนมัติ
- **Computed Properties** - คำนวณค่าอัตโนมัติเมื่อ state เปลี่ยน
- **List Rendering** - แสดง list ด้วย `data-for`
- **Two-Way Binding** - ผูก input กับ state ด้วย `data-model`
- **Method Parameters** - ส่ง parameters ใน event handlers
- **Data Persistence** - บันทึกข้อมูลใน localStorage
- **Keyboard Events** - รองรับ Enter key

## Usage

### 1. Define Component

```javascript
Now.getManager('component').define('todo', {
  reactive: true,

  // State
  state: {
    todos: [],
    newTodo: '',
    filter: 'all',
    remaining: 0
  },

  // Computed properties
  computed: {
    filteredTodos() {
      const { todos, filter } = this.state;
      if (filter === 'all') return todos;
      return todos.filter(todo =>
        filter === 'completed' ? todo.completed : !todo.completed
      );
    }
  },

  // Methods
  methods: {
    addTodo() {
      if (!this.state.newTodo.trim()) return;
      this.state.todos.push({
        id: Utils.generateUUID(),
        text: this.state.newTodo,
        completed: false
      });
      this.state.newTodo = '';
    },

    toggleTodo(id) {
      const todo = this.state.todos.find(t => t.id === id);
      if (todo) todo.completed = !todo.completed;
    },

    removeTodo(id) {
      this.state.todos = this.state.todos.filter(t => t.id !== id);
    }
  }
});
```

### 2. HTML Template

```html
<div data-component="todo">
  <!-- Two-way input binding -->
  <input data-model="newTodo"
         data-on="keyup.enter:addTodo"
         placeholder="What needs to be done?">
  <button data-on="click:addTodo">Add</button>

  <!-- List rendering with computed property -->
  <div data-for="todo of filteredTodos">
    <template>
      <label class="todo-item">
        <input type="checkbox"
               data-checked="todo.completed"
               data-on="change:toggleTodo(todo.id)">
        <span data-text="todo.text"></span>
        <button data-on="click:removeTodo(todo.id)">Delete</button>
      </label>
    </template>
  </div>

  <!-- Dynamic text -->
  <span data-text="remaining + ' items left'"></span>
</div>
```

## Computed Properties

Computed properties คำนวณค่าอัตโนมัติเมื่อ dependencies เปลี่ยน:

```javascript
computed: {
  // คำนวณใหม่เมื่อ todos หรือ filter เปลี่ยน
  filteredTodos() {
    const { todos, filter } = this.state;
    if (filter === 'all') return todos;
    return todos.filter(todo =>
      filter === 'completed' ? todo.completed : !todo.completed
    );
  },

  // นับจำนวน active todos
  activeCount() {
    return this.state.todos.filter(t => !t.completed).length;
  },

  // ตรวจว่าทั้งหมด completed หรือไม่
  allCompleted() {
    return this.state.todos.every(t => t.completed);
  }
}
```

### ใช้ใน Template

```html
<!-- ใช้ชื่อ computed property ใน data-for -->
<div data-for="todo of filteredTodos">...</div>

<!-- ใช้ใน data-text -->
<span data-text="activeCount + ' items left'"></span>
```

## List Rendering (data-for)

แสดง list จาก array ใน state หรือ computed:

```html
<div data-for="item of items">
  <template>
    <div class="item">
      <span data-text="item.name"></span>
      <button data-on="click:removeItem(item.id)">×</button>
    </div>
  </template>
</div>
```

### สิ่งสำคัญ:
- ต้องมี `<template>` ข้างใน
- ใช้ `item.property` เข้าถึง properties
- ส่ง `item.id` ไปยัง methods ได้

## Two-Way Binding (data-model)

ผูก input กับ state แบบ two-way:

```html
<!-- text input -->
<input data-model="newTodo">

<!-- checkbox -->
<input type="checkbox" data-model="isChecked">

<!-- select -->
<select data-model="selectedOption">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</select>
```

### เปรียบเทียบ:
```html
<!-- data-model: two-way (อัปเดตทั้งสองทาง) -->
<input data-model="name">

<!-- data-value: one-way (state → input เท่านั้น) -->
<input data-value="name">
```

## Method Parameters

ส่ง parameters ไปยัง methods:

```html
<!-- ส่งค่าคงที่ -->
<button data-on="click:setFilter('all')">All</button>
<button data-on="click:setFilter('active')">Active</button>

<!-- ส่งค่าจาก loop item -->
<button data-on="click:toggleTodo(todo.id)">Toggle</button>
<button data-on="click:removeTodo(todo.id)">Delete</button>

<!-- ส่งหลาย parameters -->
<button data-on="click:updateItem(item.id, 'newValue')">Update</button>
```

### รับ Parameters:
```javascript
methods: {
  setFilter(filter) {
    this.state.filter = filter;
  },

  toggleTodo(id) {
    const todo = this.state.todos.find(t => t.id === id);
    if (todo) todo.completed = !todo.completed;
  },

  updateItem(id, newValue) {
    // ...
  }
}
```

## Keyboard Events

รองรับ keyboard modifiers:

```html
<!-- Enter key -->
<input data-on="keyup.enter:addTodo">

<!-- Escape key -->
<input data-on="keyup.escape:cancelEdit">

<!-- Multiple keys -->
<input data-on="keyup.enter:submit, keyup.escape:cancel">

<!-- Ctrl/Cmd + Enter -->
<textarea data-on="keydown.ctrl.enter:submitForm">
```

## Dynamic Classes (data-class)

เพิ่ม class ตาม condition:

```html
<!-- เพิ่ม 'active' class เมื่อ filter === 'all' -->
<button data-class="active:filter === 'all'">All</button>

<!-- หลาย conditions -->
<div data-class="completed:todo.completed, urgent:todo.priority === 'high'">
```

## Data Persistence

บันทึก/โหลดข้อมูลจาก localStorage:

```javascript
methods: {
  loadTodos() {
    const stored = localStorage.getItem('todos');
    if (stored) {
      this.state.todos = JSON.parse(stored);
    }
  },

  saveTodos() {
    localStorage.setItem('todos', JSON.stringify(this.state.todos));
  }
},

mounted() {
  this.methods.loadTodos();
},

events: {
  'app:cleanup:end': function() {
    this.methods.saveTodos();
  }
}
```

## Component Structure

```javascript
Now.getManager('component').define('todo', {
  reactive: true,

  // Initial state
  state: {
    todos: [],
    newTodo: '',
    filter: 'all'
  },

  // Computed properties (auto-update)
  computed: {
    filteredTodos() { /* ... */ }
  },

  // Methods (callable from template)
  methods: {
    addTodo() { /* ... */ },
    toggleTodo(id) { /* ... */ },
    removeTodo(id) { /* ... */ }
  },

  // Lifecycle
  mounted() {
    this.methods.loadTodos();
  },

  // Global events
  events: {
    'app:cleanup:end': function() {
      this.methods.saveTodos();
    }
  }
});
```

## File Structure

```
todo/
├── index.html      # Demo page
├── main.js         # Framework initialization
├── todo.js         # Todo component
└── styles.css      # Component styles
```

## Key Directives Summary

| Directive | Description |
|-----------|-------------|
| `data-model` | Two-way binding สำหรับ input |
| `data-text` | แสดง text จาก state/expression |
| `data-for` | Render list จาก array |
| `data-on` | Bind events กับ methods |
| `data-class` | เพิ่ม/ลบ class ตาม condition |
| `data-checked` | Bind checkbox state |

## Dependencies

- `Now.js Framework` - Core framework with ComponentManager
- `Utils.generateUUID()` - สร้าง unique ID
