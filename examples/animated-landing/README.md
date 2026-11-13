# Animated Landing Page Example

ตัวอย่าง Landing Page ที่มี animations สวยงาม สร้างด้วย Now.js AnimationManager

## Features

ตัวอย่างนี้สาธิต:

- **Zero JavaScript Animations** - ใช้ `data-animation-auto` ควบคุม
- **Scroll Reveal** - Elements ปรากฏเมื่อ scroll เข้า viewport
- **Gradient Orbs** - Animated background effects
- **Modern Design** - Dark theme, glassmorphism
- **Responsive Layout** - รองรับทุกขนาดหน้าจอ
- **Production Ready** - พร้อมใช้เป็น template

## Sections

1. **Hero** - Badge, Title, Subtitle, CTA, Stats
2. **Features** - 6 feature cards
3. **How It Works** - 3 steps with visuals
4. **Testimonials** - 3 testimonial cards
5. **Pricing** - 3 pricing tiers
6. **CTA** - Call to action
7. **Footer** - Links and branding

## Usage

### Minimal JavaScript

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  await Now.init({
    environment: 'production'
  });
});
```

### Enable Auto Animation

เพิ่ม `data-animation-auto` ที่ `<body>`:

```html
<body data-animation-auto>
  <!-- All data-enter elements animate automatically -->
</body>
```

### Add Scroll Reveal

```html
<!-- Fade in -->
<div data-enter="fade" data-enter-duration="600">
  Content fades in
</div>

<!-- Slide up -->
<div data-enter="slideUp" data-enter-duration="700">
  Content slides up
</div>

<!-- Scale in -->
<div data-enter="scale" data-enter-duration="500">
  Content scales in
</div>

<!-- Slide from sides -->
<div data-enter="slideRight" data-enter-duration="600">
  Content slides from right
</div>

<div data-enter="slideLeft" data-enter-duration="600">
  Content slides from left
</div>
```

## Animation Patterns Used

### Hero Section

```html
<!-- Badge with fade -->
<div class="hero-badge" data-enter="fade" data-enter-duration="600">
  <span>Introducing Nova</span>
</div>

<!-- Title lines with staggered slideUp -->
<h1 class="hero-title">
  <span data-enter="slideUp" data-enter-duration="700">Build faster.</span>
  <span data-enter="slideUp" data-enter-duration="700"
        style="animation-delay: 100ms">Scale smarter.</span>
  <span data-enter="slideUp" data-enter-duration="700"
        style="animation-delay: 200ms">Grow together.</span>
</h1>

<!-- CTA buttons -->
<div class="hero-cta" data-enter="slideUp" data-enter-duration="600">
  <a href="#" class="btn btn-primary">Get Started</a>
</div>
```

### Feature Cards

```html
<div class="features-grid">
  <div class="feature-card" data-enter="slideUp" data-enter-duration="500">
    <div class="feature-icon"><span class="icon-power"></span></div>
    <h3>Lightning Fast</h3>
    <p>Description text</p>
  </div>
  <!-- More cards... -->
</div>
```

### Steps (Alternating Directions)

```html
<!-- Step 1: Slide right -->
<div class="step" data-enter="slideRight" data-enter-duration="600">
  <div class="step-number">01</div>
  <div class="step-content">...</div>
</div>

<!-- Step 2: Slide left (reverse layout) -->
<div class="step reverse" data-enter="slideLeft" data-enter-duration="600">
  <div class="step-number">02</div>
  <div class="step-content">...</div>
</div>
```

### Testimonials

```html
<div class="testimonial-card" data-enter="scale" data-enter-duration="500">
  <p>"Quote text"</p>
  <div class="testimonial-author">...</div>
</div>
```

## Background Effects

### Gradient Orbs

```html
<div class="hero-bg">
  <div class="gradient-orb orb-1"></div>
  <div class="gradient-orb orb-2"></div>
  <div class="gradient-orb orb-3"></div>
</div>
```

```css
.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  animation: float 20s infinite ease-in-out;
}

.orb-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, #6366f1, transparent);
  top: -200px;
  right: -100px;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-30px, 30px); }
}
```

## Key CSS

### Gradient Text

```css
.gradient-text {
  background: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Glass Effect Cards

```css
.feature-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}
```

### Hover Effects

```css
.feature-card:hover {
  transform: translateY(-4px);
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}
```

## Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-animation-auto` | เปิดใช้ auto animation (ใส่ที่ body) |
| `data-enter` | Animation เมื่อเข้า viewport |
| `data-enter-duration` | ระยะเวลา animation (ms) |
| `style="animation-delay: Xms"` | Delay ก่อนเริ่ม animation |

## Available Animations

- `fade` - Fade in
- `slideUp` - เลื่อนขึ้นมา
- `slideDown` - เลื่อนลงมา
- `slideLeft` - เลื่อนจากขวาไปซ้าย
- `slideRight` - เลื่อนจากซ้ายไปขวา
- `scale` - ขยายจากเล็กไปใหญ่

## Design Patterns

### Section Header

```html
<div class="section-header" data-enter="slideUp" data-enter-duration="600">
  <span class="section-badge">Features</span>
  <h2>Everything you need<br><span class="gradient-text">in one place</span></h2>
  <p>Description text</p>
</div>
```

### Pricing Card (Popular)

```html
<div class="pricing-card popular" data-enter="slideUp">
  <div class="popular-badge">Most Popular</div>
  <div class="pricing-header">
    <h3>Pro</h3>
    <p>For growing teams</p>
  </div>
  <div class="pricing-price">
    <span class="price">$29</span>
    <span class="period">/month</span>
  </div>
  <ul class="pricing-features">...</ul>
  <a href="#" class="btn btn-primary btn-block">Start Free Trial</a>
</div>
```

## File Structure

```
animated-landing/
├── index.html      # Complete landing page
├── main.js         # Minimal JS (just init)
└── styles.css      # All styles and animations
```

## Why This Works

1. **`data-animation-auto`** บน body เปิดใช้ AnimationManager
2. **`data-enter`** บอกว่าใช้ animation อะไรเมื่อเข้า viewport
3. **Intersection Observer** ตรวจจับ elements เข้า viewport
4. **ไม่ต้องเขียน JavaScript** สำหรับ animations

## Dependencies

- `Now.js Framework` - Core + AnimationManager
- `Inter Font` - Google Fonts
