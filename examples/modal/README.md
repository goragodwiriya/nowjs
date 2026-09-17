# Modal Component Example

ตัวอย่างการใช้งาน Modal Component ใน Now.js Framework

## Features

ตัวอย่างนี้แสดงการใช้งาน Modal หลากหลายรูปแบบ:

- **Dynamic Modal** - สร้าง modal ด้วย JavaScript
- **Data Binding** - ผูกข้อมูลจาก HTML elements เข้ากับ modal
- **Gallery Mode** - แสดงแกลเลอรี่รูปภาพพร้อม navigation
- **Zero JavaScript** - เปิด modal โดยไม่ต้องเขียน JavaScript

## Usage

### 1. Zero JavaScript (Basic)

เปิด modal โดยใช้ `data-modal` attribute เท่านั้น:

```html
<!-- Trigger -->
<button class="btn" data-modal="my-modal">Open Modal</button>

<!-- Modal -->
<div id="my-modal" class="modal">
  <div class="modal-dialog">
    <div class="modal-header">
      <h4 class="modal-title">Modal Title</h4>
      <button type="button" class="modal-close btn-close"></button>
    </div>
    <div class="modal-body">
      <p>Modal content here...</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary modal-close">Close</button>
    </div>
  </div>
</div>
```

### 2. Dynamic Modal (JavaScript)

สร้าง modal แบบ programmatic:

```javascript
const modal = new Modal({
  title: 'Hello World',
  content: 'This is a dynamically created modal.',
  footer: true,
  closeButton: true
});
modal.show();
```

#### Confirmation Dialog

```javascript
const modal = new Modal({
  title: 'Confirm Action',
  content: 'Are you sure you want to proceed?',
  backdrop: 'static', // ป้องกันการปิดโดยคลิก backdrop
  width: '400px'
});
modal.show();
```

### 3. Data Binding

ผูกข้อมูลจาก element เข้ากับ modal:

```html
<!-- Trigger with data -->
<div data-name="John" data-email="john@example.com">
  <button data-modal="user-modal"
          data-modal-bind="name:name, email:email">
    View Profile
  </button>
</div>

<!-- Target Modal -->
<div id="user-modal" class="modal">
  <div class="modal-dialog">
    <div class="modal-body">
      <h2 data-modal-target="name"></h2>
      <p data-modal-target="email"></p>
    </div>
  </div>
</div>
```

### 4. Gallery Mode (Lightbox)

สร้าง image gallery พร้อม navigation และ transition effects:

```html
<!-- Gallery Items -->
<div class="gallery-item"
     data-modal="lightbox-modal"
     data-modal-bind="src:full, caption:caption"
     data-modal-gallery="true"
     data-modal-effect="slide"
     data-full="image-full.jpg"
     data-caption="Image description">
  <img src="thumbnail.jpg">
</div>

<!-- Lightbox Modal -->
<div class="modal modal-lightbox" id="lightbox-modal">
  <div class="modal-content">
    <button class="modal-close btn-close"></button>
    <div class="lightbox-body">
      <img data-modal-target="src" src="" alt="">
      <div class="lightbox-caption">
        <h3 data-modal-target="caption"></h3>
      </div>
    </div>
    <button class="modal-prev" data-modal-nav="prev">‹</button>
    <button class="modal-next" data-modal-nav="next">›</button>
  </div>
</div>
```

#### Available Effects

| Effect | Description |
|--------|-------------|
| `fade` | Smooth opacity transition (default) |
| `slide` | Slide horizontally based on direction |
| `slide-horizontal` | Same as `slide` |
| `slide-vertical` | Slide up/down based on direction |
| `slide-left` | Always slide from left |
| `slide-right` | Always slide from right |
| `slide-up` | Always slide from top |
| `slide-down` | Always slide from bottom |
| `zoom` | Scale in/out effect |

> **หมายเหตุ:** Effects จะมีผลเฉพาะเนื้อหาภายใน (รูปภาพ, ข้อความ) กรอบและปุ่มจะคงที่

#### Touch/Swipe Support

Gallery รองรับ touch gestures บนมือถือ:
- **Swipe ซ้าย** → ไปภาพถัดไป
- **Swipe ขวา** → ไปภาพก่อนหน้า

## Modal Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | - | หัวข้อ modal |
| `content` | string | - | เนื้อหา modal (HTML) |
| `footer` | boolean/string | false | แสดง footer หรือ HTML ของ footer |
| `closeButton` | boolean | true | แสดงปุ่มปิด |
| `backdrop` | string | - | `'static'` = ไม่ปิดเมื่อคลิก backdrop |
| `width` | string | - | ความกว้างของ dialog |

## Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-modal` | ID ของ modal ที่จะเปิด |
| `data-modal-bind` | ผูกข้อมูลจาก parent element |
| `data-modal-target` | รับข้อมูลจาก binding |
| `data-modal-gallery` | เปิดใช้งาน gallery mode |
| `data-modal-effect` | เอฟเฟกต์การเปลี่ยนภาพ (`fade`, `slide`, `zoom` ฯลฯ) |
| `data-modal-nav` | navigation (`prev` / `next`) |

## Files

| File | Description |
|------|-------------|
| `index.html` | หน้าแสดงตัวอย่าง Modal ทุกรูปแบบ |
| `main.js` | การตั้งค่า Now.js และ dynamic modal demos |
| `styles.css` | Custom styles สำหรับ lightbox และ gallery |

## Dependencies

- Now.js Framework (`now.core.min.css`, `now.core.min.js`)

## Live Demo

เปิดไฟล์ `index.html` ในเบราว์เซอร์เพื่อดูตัวอย่างการใช้งาน
