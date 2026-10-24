# Reactive Counter Example

ตัวอย่างการสร้าง Reactive Component ใน Now.js Framework

## Features

ตัวอย่างนี้สาธิตแนวคิดหลักของการสร้าง component:

- **Reactive State** - State ที่อัปเดต UI อัตโนมัติ
- **Component Definition** - การสร้าง component ด้วย `define()`
- **Data Binding** - ผูก state กับ DOM ผ่าน `data-text`
- **Event Binding** - ผูก events ผ่าน `data-on`
- **Lifecycle Hooks** - `mounted()` และ `destroyed()`
- **Global Events** - รับ events จากระบบ

## Creating a Component

### 1. Define Component

```javascript
Now.getManager('component').define('reactivecounter', {
  // Enable reactive state
  reactive: true,

  // Component state (reactive data)
  state: {
    title: 'Counter Component',
    count: 0
  },

  // Component methods
  methods: {
    increment() {
      this.state.count++;
    },
    decrement() {
      this.state.count--;
    },
    reset() {
      this.state.count = 0;
    }
  },

  // Lifecycle hook - called when component is mounted
  mounted() {
    console.log('Component mounted');
  },

  // Global event handlers
  events: {
    'app:cleanup:end': function() {
      this.state.count = 0;
    }
  }
});
```

### 2. Use in HTML

```html
<div data-component="reactivecounter">
  <!-- Display state value -->
  <span data-text="count">0</span>

  <!-- Bind click to method -->
  <button data-on="click:decrement">−</button>
  <button data-on="click:increment">+</button>
  <button data-on="click:reset">Reset</button>
</div>
```

## Reactive State

เมื่อเปิด `reactive: true` ทุกครั้งที่เปลี่ยนค่าใน `this.state` จะอัปเดต UI อัตโนมัติ

```javascript
// เปลี่ยน state → UI อัปเดตทันที
this.state.count++;      // UI แสดง 1
this.state.count = 100;  // UI แสดง 100
```

### ไม่ต้องทำ:
```javascript
// ❌ ไม่ต้องเขียนแบบนี้
document.querySelector('.count').textContent = this.state.count;

// ✅ Now.js ทำให้อัตโนมัติ
this.state.count++;
```

## Data Binding Directives

### data-text
แสดง text content จาก state

```html
<span data-text="count">0</span>
<h1 data-text="title"></h1>
```

### data-html
แสดง HTML content จาก state

```html
<div data-html="richContent"></div>
```

### data-value
Bind กับ input value (two-way)

```html
<input data-value="username">
```

### data-class
เพิ่ม/ลบ class ตาม condition

```html
<div data-class="active:isActive, error:hasError"></div>
```

### data-show / data-hide
แสดง/ซ่อน element ตาม condition

```html
<div data-show="isVisible">Visible when true</div>
<div data-hide="isHidden">Hidden when true</div>
```

## Event Binding

### data-on
ผูก DOM events กับ methods

```html
<!-- Single event -->
<button data-on="click:handleClick">Click</button>

<!-- Multiple events -->
<input data-on="input:onInput, blur:onBlur">

<!-- With modifier (prevent default) -->
<form data-on="submit.prevent:handleSubmit">
```

### Supported Events
- `click`, `dblclick`
- `input`, `change`, `blur`, `focus`
- `submit`
- `keydown`, `keyup`, `keypress`
- `mouseenter`, `mouseleave`

## Lifecycle Hooks

```javascript
Now.getManager('component').define('mycomponent', {
  reactive: true,
  state: { /* ... */ },

  // Called when component is mounted to DOM
  mounted() {
    console.log('Component is ready');
    // Good place to: fetch data, setup timers
  },

  // Called when component is destroyed
  destroyed() {
    console.log('Component removed');
    // Good place to: cleanup timers, remove listeners
  }
});
```

## Global Events

รับ events จากระบบหรือ components อื่น:

```javascript
events: {
  // Listen to framework events
  'app:cleanup:end': function() {
    this.reset();
  },

  // Listen to custom events
  'user:logout': function() {
    this.state.count = 0;
  }
}
```

### Emit Custom Events

```javascript
methods: {
  doSomething() {
    // Dispatch event for other components
    document.dispatchEvent(new CustomEvent('counter:changed', {
      detail: { count: this.state.count }
    }));
  }
}
```

## Component Options

```javascript
Now.getManager('component').define('name', {
  // Enable reactivity
  reactive: true,

  // Debug mode (logs state changes)
  debug: false,

  // Initial state
  state: {},

  // Methods accessible from template
  methods: {},

  // Lifecycle hooks
  mounted() {},
  destroyed() {},

  // Global event handlers
  events: {}
});
```

## Multiple Instances

Component สามารถมีหลาย instances ได้ แต่ละ instance มี state แยกกัน:

```html
<!-- Instance 1 -->
<div data-component="reactivecounter">
  <span data-text="count">0</span>
</div>

<!-- Instance 2 (separate state) -->
<div data-component="reactivecounter">
  <span data-text="count">0</span>
</div>
```

## File Structure

```
counter/
├── index.html           # Demo page
├── main.js              # Framework initialization
├── reactivecounter.js   # Component definition
└── styles.css           # Component styles
```

## Best Practices

### ✅ Do

```javascript
// Keep state flat
state: {
  count: 0,
  name: ''
}

// Use methods for logic
methods: {
  increment() {
    this.state.count++;
  }
}
```

### ❌ Don't

```javascript
// Avoid nested state
state: {
  user: {
    profile: {
      settings: {}
    }
  }
}

// Don't manipulate DOM directly
methods: {
  update() {
    document.querySelector('.count').textContent = this.state.count;
  }
}
```

## Dependencies

- `Now.js Framework` - Core framework with ComponentManager
