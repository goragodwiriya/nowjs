# AnimationManager Example

ตัวอย่างการใช้งาน AnimationManager ใน Now.js Framework

## Features

ตัวอย่างนี้แสดงการใช้งาน animations:

- **Data Attribute Animations** - ใช้ HTML attributes ควบคุม
- **Show/Hide Animation** - แสดง/ซ่อน พร้อม animation
- **Enter Animation** - Scroll reveal เมื่อเข้า viewport
- **Stagger Animation** - Animate หลาย elements ตามลำดับ
- **Parallel Animation** - รัน animations พร้อมกัน
- **Chain Animation** - รัน animations ต่อเนื่อง
- **Pause/Resume** - หยุดและเล่นต่อ
- **Animation Queue** - คิว animations
- **Easing Presets** - หลากหลาย easing functions
- **Custom Animations** - สร้าง animation เอง

## Usage

### 1. Basic Animation (Data Attributes)

```html
<!-- Target element -->
<div class="box" id="myBox">Animate Me</div>

<!-- Trigger button -->
<button data-animate="myBox" data-animation="fade">Animate</button>
<button data-animate="myBox" data-animation="bounce">Bounce</button>
<button data-animate="myBox" data-animation="shake">Shake</button>
```

### 2. JavaScript API

```javascript
// Basic animate
AnimationManager.animate(element, 'fade', {
  duration: 500
});

// With callbacks
AnimationManager.animate(element, 'bounce', {
  duration: 600,
  onComplete: () => console.log('Done!')
});
```

## Available Animations

| Animation | Description |
|-----------|-------------|
| `fade` | Fade in/out |
| `slideUp` | เลื่อนขึ้น |
| `slideDown` | เลื่อนลง |
| `slideLeft` | เลื่อนซ้าย |
| `slideRight` | เลื่อนขวา |
| `scale` | ขยาย/ย่อ |
| `scaleUp` | ขยายจากเล็กไปใหญ่ |
| `rotate` | หมุน 360° |
| `bounce` | กระเด้ง |
| `shake` | เขย่า |
| `pulse` | กระพริบ |
| `flip` | พลิก Y-axis |
| `flipX` | พลิก X-axis |
| `zoomIn` | ซูมเข้า |
| `swing` | โยกไปมา |

## Show/Hide Animation

```html
<div id="panel"
     data-show="isVisible"
     data-show-animation="fade"
     data-show-duration="300">
  Panel content
</div>

<button id="toggleBtn">Toggle</button>
```

```javascript
let isVisible = true;
document.getElementById('toggleBtn').addEventListener('click', () => {
  isVisible = !isVisible;
  const panel = document.getElementById('panel');

  if (isVisible) {
    panel.style.display = '';
    AnimationManager.animate(panel, 'fade', { direction: 'in' });
  } else {
    AnimationManager.animate(panel, 'fade', {
      direction: 'out',
      onComplete: () => panel.style.display = 'none'
    });
  }
});
```

## Enter Animation (Scroll Reveal)

เมื่อ element เข้า viewport:

```html
<div data-enter="slideUp"
     data-enter-duration="500"
     data-enter-threshold="0.2">
  Card appears on scroll
</div>

<div data-enter="bounce" data-enter-duration="700">
  Bounces into view
</div>
```

## Stagger Animation

Animate หลาย elements ตามลำดับ:

```javascript
const items = document.querySelectorAll('.list-item');

AnimationManager.stagger(items, 'slideRight', {
  stagger: 100,  // delay ระหว่าง items (ms)
  duration: 400
});
```

```html
<ul class="list">
  <li class="list-item">Item 1</li>
  <li class="list-item">Item 2</li>
  <li class="list-item">Item 3</li>
</ul>
```

## Parallel Animation

รัน animations หลายตัวพร้อมกัน:

```javascript
AnimationManager.parallel(element, ['scale', 'rotate'], {
  duration: 800
});
```

## Chain Animation

รัน animations ต่อเนื่องตามลำดับ:

```javascript
await AnimationManager.chain(element, [
  { name: 'slideUp', options: { duration: 400 } },
  { name: 'shake', options: { duration: 500 } },
  { name: 'scale', options: { duration: 300 } },
  { name: 'pulse', options: { duration: 400, iterations: 2 } }
]);

console.log('Chain complete!');
```

## Pause/Resume/Stop

```javascript
// Start infinite animation
AnimationManager.animate(element, 'rotate', {
  duration: 3000,
  iterations: Infinity
});

// Pause
AnimationManager.pause(element);

// Resume
AnimationManager.resume(element);

// Stop completely
AnimationManager.stop(element);
```

## Animation Queue

เพิ่ม animations เข้าคิว:

```javascript
// Add to queue (จะรันตามลำดับ)
AnimationManager.queue(element, 'bounce', { duration: 500 })
  .then(() => console.log('Bounce done'));

AnimationManager.queue(element, 'shake', { duration: 600 })
  .then(() => console.log('Shake done'));

// Clear queue
AnimationManager.clearQueue(element);
```

## Easing Presets

```javascript
AnimationManager.animate(element, 'slideUp', {
  duration: 1000,
  easing: 'easeOutBounce'
});
```

### Available Easings:

- `ease` - Default
- `easeIn`, `easeOut`, `easeInOut`
- `easeInQuad`, `easeOutQuad`, `easeInOutQuad`
- `easeInCubic`, `easeOutCubic`, `easeInOutCubic`
- `easeInBack`, `easeOutBack`, `easeInOutBack`
- `easeOutBounce`
- `spring`

## Custom Animation

### Inline Custom:

```javascript
AnimationManager.animate(element, {
  from: {
    transform: 'rotate(0) scale(1)',
    backgroundColor: '#3498db',
    borderRadius: '0'
  },
  steps: [
    {
      transform: 'rotate(180deg) scale(1.2)',
      backgroundColor: '#e74c3c',
      borderRadius: '50%',
      offset: 0.5
    }
  ],
  to: {
    transform: 'rotate(360deg) scale(1)',
    backgroundColor: '#2ecc71',
    borderRadius: '0'
  }
}, {
  duration: 1500
});
```

### Register Custom Animation:

```javascript
// Register
AnimationManager.registerAnimation('myCustomAnim', {
  in: {
    from: { transform: 'translateY(-100%) rotate(-45deg)', opacity: 0 },
    to: { transform: 'translateY(0) rotate(0)', opacity: 1 }
  },
  out: {
    from: { transform: 'translateY(0) rotate(0)', opacity: 1 },
    to: { transform: 'translateY(100%) rotate(45deg)', opacity: 0 }
  }
});

// Use
AnimationManager.animate(element, 'myCustomAnim', {
  direction: 'in',
  duration: 600
});
```

## Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-animate` | Target element ID |
| `data-animation` | Animation name |
| `data-show` | Show/hide based on expression |
| `data-show-animation` | Animation for show/hide |
| `data-show-duration` | Duration (ms) |
| `data-enter` | Animation when entering viewport |
| `data-enter-duration` | Enter animation duration |
| `data-enter-threshold` | Intersection threshold (0-1) |
| `data-leave` | Animation when leaving viewport |

## API Reference

| Method | Description |
|--------|-------------|
| `animate(el, anim, opts)` | Animate element |
| `chain(el, anims)` | Run sequentially |
| `parallel(el, anims)` | Run simultaneously |
| `stagger(els, anim, opts)` | Animate list with delay |
| `queue(el, anim)` | Add to queue |
| `clearQueue(el)` | Clear element queue |
| `pause(el)` | Pause animation |
| `resume(el)` | Resume animation |
| `stop(el)` | Cancel animation |
| `registerAnimation(name, def)` | Register custom |

## Animation Options

```javascript
AnimationManager.animate(element, 'bounce', {
  duration: 500,       // Duration in ms
  delay: 0,            // Delay before start
  easing: 'ease',      // Easing function
  direction: 'in',     // 'in' or 'out'
  iterations: 1,       // Number of times (or Infinity)
  fill: 'forwards',    // Animation fill mode
  onStart: () => {},   // Callback on start
  onComplete: () => {} // Callback on complete
});
```

## File Structure

```
animation/
├── index.html      # Demo with all examples
├── main.js         # JavaScript implementations
└── styles.css      # Animation demo styles
```

## Dependencies

- `Now.js Framework` - Core framework with AnimationManager
