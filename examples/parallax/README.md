# Parallax Example

ตัวอย่างการสร้างเว็บไซต์แบบ Parallax ด้วย Now.js ScrollManager

## Features

ตัวอย่างนี้แสดงความสามารถ:

- **Parallax Backgrounds** - พื้นหลังเลื่อนตาม scroll
- **Multi-Layer Parallax** - หลาย layers ที่ความเร็วต่างกัน
- **Scroll Reveal** - Elements ปรากฏเมื่อ scroll ถึง
- **Sticky Navigation** - เมนูติดด้านบน
- **Scroll Progress Bar** - แถบแสดง progress
- **Section Highlighting** - เมนู highlight ตาม section
- **Back to Top** - ปุ่มกลับด้านบน
- **Touch Support** - รองรับ mobile gestures

## Usage

### 1. Configuration

```javascript
await Now.init({
  scroll: {
    enabled: true,
    core: {
      offset: 60,
      duration: 800,
      easing: 'easeInOutCubic'
    },
    scroll: {
      reveal: {
        enabled: true,
        threshold: 0.1,
        rootMargin: '50px'
      },
      parallax: {
        enabled: true
      },
      section: {
        highlight: true
      }
    }
  }
});
```

### 2. HTML Structure

```html
<!-- Navigation (Sticky) -->
<nav class="nav-wrapper" data-scroll-sticky>
  <div class="nav-container">
    <a href="#" class="nav-logo">Creative</a>
    <div class="nav-links">
      <a href="#services" class="nav-link">Services</a>
      <a href="#portfolio" class="nav-link">Portfolio</a>
      <a href="#contact" class="nav-link">Contact</a>
    </div>
  </div>
</nav>

<!-- Scroll Progress Bar -->
<div class="scroll-progress">
  <div class="progress-bar"></div>
</div>

<!-- Hero with Parallax -->
<section class="hero" data-scroll-section>
  <div class="shapes" data-parallax>
    <div class="shape shape-1" data-parallax-speed="0.2"></div>
    <div class="shape shape-2" data-parallax-speed="0.3"></div>
  </div>
  <div class="hero-content">
    <h1>We Create Digital Experiences</h1>
  </div>
</section>

<!-- Content Sections -->
<section id="services" data-scroll-section>
  <div class="service-card" data-scroll-reveal>...</div>
</section>
```

## Parallax Effect

### HTML

```html
<!-- Container with parallax -->
<div data-parallax>
  <div class="layer-1" data-parallax-speed="0.2"></div>
  <div class="layer-2" data-parallax-speed="0.5"></div>
  <div class="layer-3" data-parallax-speed="0.8"></div>
</div>
```

### Speed Values

| Speed | Effect |
|-------|--------|
| 0.1 - 0.3 | ช้า (background) |
| 0.4 - 0.6 | ปานกลาง |
| 0.7 - 1.0 | เร็ว (foreground) |

### JavaScript Implementation

```javascript
// อ่าน parallax elements
const parallaxElements = document.querySelectorAll('[data-parallax]');

// ใช้กับ scroll progress event
ScrollManager.on('scroll:progress', position => {
  parallaxElements.forEach(el => {
    const speed = Number(el.dataset.parallaxSpeed) || 0.5;
    const yPos = -(position.y * speed);
    el.style.transform = `translate3d(0, ${yPos}px, 0)`;
  });
});
```

## Scroll Reveal

Elements ปรากฏเมื่อ scroll ถึง:

### HTML

```html
<div class="card" data-scroll-reveal>
  Card content appears on scroll
</div>
```

### JavaScript

```javascript
// Setup waypoints
document.querySelectorAll('[data-scroll-reveal]').forEach((el, index) => {
  ScrollManager.addWaypoint(`reveal-${index}`, el, {
    offset: 100,
    once: true,
    callback: (entry) => {
      if (entry?.isIntersecting) {
        el.classList.add('revealed');
      }
    }
  });
});
```

### CSS

```css
[data-scroll-reveal] {
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.6s ease;
}

[data-scroll-reveal].revealed {
  opacity: 1;
  transform: translateY(0);
}
```

## Sticky Navigation

```html
<nav class="nav-wrapper" data-scroll-sticky>...</nav>
```

```javascript
// เพิ่ม class เมื่อ scroll ลงมา
ScrollManager.on('scroll:progress', position => {
  const nav = document.querySelector('.nav-wrapper');
  nav?.classList.toggle('scrolled', position.y > 50);
});
```

```css
.nav-wrapper {
  position: fixed;
  top: 0;
  width: 100%;
  transition: all 0.3s ease;
}

.nav-wrapper.scrolled {
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}
```

## Scroll Progress Bar

```html
<div class="scroll-progress">
  <div class="progress-bar"></div>
</div>
```

```javascript
ScrollManager.on('scroll:progress', position => {
  const progressBar = document.querySelector('.progress-bar');
  if (progressBar) {
    const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (position.y / totalHeight) * 100;
    progressBar.style.width = `${progress}%`;
  }
});
```

```css
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  z-index: 1000;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  width: 0%;
  transition: width 0.1s;
}
```

## Section Highlighting

เมนู highlight อัตโนมัติตาม section:

```javascript
ScrollManager.on('section:active', ({ id }) => {
  if (!id) return;

  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href) {
      link.classList.toggle('active', href === `#${id}`);
    }
  });
});
```

```css
.nav-link {
  color: #666;
  transition: color 0.3s;
}

.nav-link.active {
  color: #6366f1;
  font-weight: 600;
}
```

## Back to Top Button

```html
<button class="back-to-top" aria-label="Back to top">↑</button>
```

```javascript
const backToTop = document.querySelector('.back-to-top');

// แสดง/ซ่อนตาม scroll position
ScrollManager.on('scroll:progress', position => {
  backToTop.classList.toggle('visible', position.y > 600);
});

// Scroll ไปด้านบน
backToTop.addEventListener('click', () => {
  ScrollManager.scrollToTop({ duration: 800 });
});
```

```css
.back-to-top {
  position: fixed;
  bottom: 30px;
  right: 30px;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s;
}

.back-to-top.visible {
  opacity: 1;
  visibility: visible;
}
```

## Touch Support

ป้องกัน overscroll บน iOS:

```javascript
let touchStartY = null;

document.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (!touchStartY) return;

  const touchY = e.touches[0].clientY;
  const diff = touchStartY - touchY;

  // ป้องกัน overscroll
  const isOverscrolling =
    (diff > 0 && window.scrollY >= document.documentElement.scrollHeight - window.innerHeight) ||
    (diff < 0 && window.scrollY <= 0);

  if (isOverscrolling) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  touchStartY = null;
}, { passive: true });
```

## ScrollManager Events

```javascript
// Scroll progress (position updated)
ScrollManager.on('scroll:progress', position => {
  console.log('Y:', position.y);
});

// Section changed
ScrollManager.on('section:active', ({ id }) => {
  console.log('Active section:', id);
});

// Scroll start/complete
ScrollManager.on('scroll:start', ({ element }) => {
  element?.classList?.add('scrolling');
});

ScrollManager.on('scroll:complete', ({ element }) => {
  element?.classList?.remove('scrolling');
});
```

## File Structure

```
parallax/
├── index.html      # Main HTML
├── main.js         # JavaScript with ScrollManager
├── style.css       # Styles และ animations
├── 1.jpeg          # Portfolio image
├── 2.jpeg          # Portfolio image
└── 3.jpeg          # Portfolio image
```

## Dependencies

- `Now.js Framework` - Core framework
- `ScrollManager` - Scroll management
