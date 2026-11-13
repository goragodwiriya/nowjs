# ScrollManager Example

ตัวอย่างการใช้งาน ScrollManager ใน Now.js Framework สำหรับ One-Page Scrolling

## Features

ตัวอย่างนี้แสดงการใช้งาน ScrollManager:

- **Smooth Scrolling** - เลื่อนหน้าแบบ smooth
- **Parallax Effects** - สร้าง depth ด้วย parallax layers
- **Waypoints** - trigger actions เมื่อ elements เข้า viewport
- **Scroll Progress** - แถบแสดง progress การเลื่อน
- **Section Navigation** - highlight nav ตาม section ที่ active
- **Scroll Reveal** - แสดง elements ด้วย animation
- **Back to Top** - ปุ่มกลับไปด้านบน
- **Mobile Support** - รองรับ touch gestures

## Usage

### 1. Basic Configuration

```javascript
await Now.init({
  scroll: {
    enabled: true,

    core: {
      offset: 80,           // Offset สำหรับ fixed header
      duration: 800,        // Animation duration (ms)
      easing: 'easeInOutCubic'
    },

    smoothScroll: {
      enabled: true,
      selector: 'a[href^="#"]',
      hashChangeEnabled: true
    },

    scroll: {
      progress: {
        enabled: true,
        color: 'var(--color-primary)',
        height: '3px'
      },

      parallax: {
        enabled: true,
        speed: 0.5
      },

      section: {
        highlight: true,
        threshold: 0.5,
        activeClass: 'active'
      }
    }
  }
});
```

### 2. HTML Structure

```html
<!-- Scroll Progress Bar -->
<div class="scroll-progress"></div>

<!-- Fixed Navigation -->
<nav data-scroll-nav>
  <a href="#hero" class="active">Home</a>
  <a href="#features">Features</a>
  <a href="#about">About</a>
  <a href="#contact">Contact</a>
</nav>

<!-- Sections -->
<section id="hero" data-scroll-section>...</section>
<section id="features" data-scroll-section>...</section>
<section id="about" data-scroll-section>...</section>
<section id="contact" data-scroll-section>...</section>

<!-- Back to Top -->
<button class="back-to-top" id="back-to-top">↑</button>
```

## Parallax Effects

### HTML

```html
<!-- Background parallax -->
<div class="parallax-bg" data-parallax data-parallax-speed="0.5"></div>

<!-- Multiple layers -->
<div class="layer-1" data-parallax data-parallax-speed="0.3"></div>
<div class="layer-2" data-parallax data-parallax-speed="0.6"></div>
<div class="layer-3" data-parallax data-parallax-speed="0.9"></div>
```

### Speed Values

| Speed | Effect |
|-------|--------|
| 0.0 | ไม่ขยับ (fixed) |
| 0.1 - 0.3 | ช้า (background layers) |
| 0.4 - 0.6 | ปานกลาง |
| 0.7 - 1.0 | เร็ว (foreground layers) |

## Waypoints

trigger actions เมื่อ element เข้า viewport:

### HTML

```html
<!-- Auto animation -->
<div data-scroll-waypoint data-waypoint-animation="fade-in-up">
  Content appears when scrolled into view
</div>

<!-- Reveal with delay -->
<div data-scroll-reveal data-scroll-reveal-delay="200">
  Revealed with delay
</div>
```

### JavaScript

```javascript
// Add waypoint programmatically
ScrollManager.addWaypoint('my-waypoint', element, {
  threshold: 0.3,
  once: true,
  callback: (entry) => {
    if (entry.isIntersecting) {
      element.classList.add('animated');
    }
  }
});
```

### Available Animations

- `fade-in-up` - Fade in from below
- `fade-in-left` - Fade in from left
- `fade-in-right` - Fade in from right
- `scale-in` - Scale up from center
- `rotate-in` - Rotate as it appears

## Scroll Progress

```html
<div class="scroll-progress"></div>
```

```css
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--color-primary);
  z-index: 9999;
  transition: width 0.1s;
}
```

```javascript
// Config
scroll: {
  progress: {
    enabled: true,
    color: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
    height: '3px',
    zIndex: 9999
  }
}
```

## Section Navigation

nav links จะ highlight ตาม section ที่ active:

```html
<nav data-scroll-nav>
  <a href="#section1">Section 1</a>
  <a href="#section2">Section 2</a>
</nav>

<section id="section1" data-scroll-section>...</section>
<section id="section2" data-scroll-section>...</section>
```

```css
/* Active link styling */
[data-scroll-nav] a.active {
  color: var(--color-primary);
  font-weight: bold;
}
```

## Programmatic Scrolling

```javascript
// Scroll to element
ScrollManager.scrollTo(element, {
  offset: 80,
  duration: 800,
  easing: 'easeInOutCubic'
});

// Scroll to top
ScrollManager.scrollToTop();

// Scroll to bottom
ScrollManager.scrollToBottom();

// Get current position
const position = ScrollManager.getScrollPosition();

// Get scroll percentage
const percent = ScrollManager.getScrollPercent();
```

## Events

```javascript
// Scroll start/end
ScrollManager.on('scroll:start', () => {
  console.log('Scrolling started');
});

ScrollManager.on('scroll:end', () => {
  console.log('Scrolling ended');
});

// Active section change
ScrollManager.on('section:active', ({ id }) => {
  console.log('Active section:', id);
});

// Waypoint triggered
ScrollManager.on('waypoint:trigger', ({ id, entry }) => {
  console.log('Waypoint triggered:', id);
});

// Scroll progress
ScrollManager.on('scroll:progress', ({ percent, position }) => {
  console.log(`Scrolled ${percent}%`);
});

// Scroll update (throttled)
ScrollManager.on('scroll:update', ({ position, direction, percent }) => {
  console.log('Direction:', direction); // 'up' or 'down'
});
```

## Configuration Options

```javascript
scroll: {
  enabled: true,

  // Core settings
  core: {
    offset: 80,           // Fixed header offset
    duration: 800,        // Animation duration
    easing: 'easeInOutCubic'  // Easing function
  },

  // Smooth scrolling
  smoothScroll: {
    enabled: true,
    selector: 'a[href^="#"]',
    excludeSelector: '.no-smooth',
    hashChangeEnabled: true,
    autoScroll: true
  },

  // Scroll features
  scroll: {
    progress: {
      enabled: true,
      color: 'var(--color-primary)',
      height: '3px',
      zIndex: 9999
    },

    parallax: {
      enabled: true,
      speed: 0.5
    },

    section: {
      highlight: true,
      threshold: 0.5,
      activeClass: 'active'
    },

    nav: {
      updateHash: true,
      highlightClass: 'active',
      smoothScroll: true
    }
  },

  // Waypoints
  waypoints: {
    offset: 0,
    threshold: 0.3,
    once: true,
    delay: 100
  },

  // Mobile
  mobile: {
    enabled: true,
    touchAction: 'pan-y',
    momentumScroll: true
  },

  // Performance
  performance: {
    throttle: 16,       // ~60fps
    debounce: 100,
    passive: true,
    observer: true      // Use Intersection Observer
  }
}
```

## Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-scroll-section` | กำหนด section สำหรับ navigation |
| `data-scroll-nav` | Navigation container |
| `data-parallax` | เปิด parallax effect |
| `data-parallax-speed` | ความเร็ว parallax (0-1) |
| `data-scroll-waypoint` | Waypoint element |
| `data-waypoint-animation` | Animation class |
| `data-scroll-reveal` | Reveal on scroll |
| `data-scroll-reveal-delay` | Delay ก่อน reveal (ms) |

## CSS Animations

```css
/* Fade in up */
.fade-in-up {
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.6s ease;
}
.fade-in-up.triggered {
  opacity: 1;
  transform: translateY(0);
}

/* Scale in */
.scale-in {
  opacity: 0;
  transform: scale(0.9);
  transition: all 0.5s ease;
}
.scale-in.triggered {
  opacity: 1;
  transform: scale(1);
}

/* Scroll reveal */
[data-scroll-reveal] {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.5s ease;
}
[data-scroll-reveal].revealed {
  opacity: 1;
  transform: translateY(0);
}
```

## File Structure

```
scrollmanager/
├── index.html      # Demo page
├── main.js         # Configuration and setup
└── styles.css      # Animations and styles
```

## Dependencies

- `Now.js Framework` - Core framework with ScrollManager
