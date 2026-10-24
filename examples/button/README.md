# Button Gallery Example

ตัวอย่างการใช้งานปุ่มรูปแบบต่างๆ ใน Now.js Framework

## Features

ตัวอย่างนี้แสดงการใช้งานปุ่มประเภทต่างๆ:

- **Basic Buttons** - ปุ่มพื้นฐาน (primary, secondary, success, warning, danger, info)
- **Text Buttons** - ปุ่มแบบข้อความ
- **Outlined Buttons** - ปุ่มแบบมีกรอบ
- **Rounded & Circle** - ปุ่มแบบกลม
- **Size Variants** - ขนาดต่างๆ (small, normal, large)
- **Button Groups** - ปุ่มกลุ่ม (horizontal/vertical)
- **Dropdown Buttons** - ปุ่มแบบ dropdown
- **Icon Buttons** - ปุ่มไอคอน
- **Loading & Disabled States** - สถานะ loading และ disabled
- **Toggle Buttons** - ปุ่มสลับ
- **Gradient Buttons** - ปุ่มไล่สี
- **Social Media Buttons** - ปุ่มโซเชียลมีเดีย
- **Floating Action Buttons** - ปุ่มลอย (FAB)

## Usage

### Basic Button

```html
<button class="btn">Default</button>
<button class="btn btn-primary">Primary</button>
<button class="btn btn-success">Success</button>
<button class="btn btn-danger">Danger</button>
```

### Button Variants

```html
<!-- Text button -->
<button class="btn text btn-primary">Text Primary</button>

<!-- Outlined button -->
<button class="btn outline btn-primary">Outline Primary</button>

<!-- Rounded button -->
<button class="btn btn-primary rounded">Rounded</button>

<!-- Pill button -->
<button class="btn btn-success pill">Pill</button>

<!-- Circle button with icon -->
<button class="btn circle btn-primary icon-heart"></button>
```

### Button Sizes

```html
<button class="btn btn-primary small">Small</button>
<button class="btn btn-primary">Normal</button>
<button class="btn btn-primary large">Large</button>
```

### Button with Icon

```html
<button class="btn btn-primary icon-download">Download</button>
<button class="btn btn-success icon-save">Save</button>
```

### Loading State

```html
<button class="btn btn-primary loading">Loading...</button>
```

### Button Groups

```html
<div class="btn-group">
  <button class="btn btn-primary">Left</button>
  <button class="btn btn-primary">Center</button>
  <button class="btn btn-primary">Right</button>
</div>

<!-- Vertical group -->
<div class="btn-group vertical">
  <button class="btn">Top</button>
  <button class="btn">Middle</button>
  <button class="btn">Bottom</button>
</div>
```

### Dropdown Button

```html
<button class="btn btn-primary dropdown icon-print">Print
  <ul>
    <li><a href="#">Edit</a></li>
    <li><a href="#">Copy</a></li>
    <li><hr class="divider"></li>
    <li><a href="#" class="color-red">Delete</a></li>
  </ul>
</button>
```

### Toggle Button

```html
<div class="btn-toggle">
  <input type="checkbox" id="toggle1" class="toggle-input">
  <label for="toggle1" class="btn">
    <span class="toggle-off">Off</span>
    <span class="toggle-on">On</span>
  </label>
</div>
```

### Gradient Buttons

```html
<button class="btn btn-gradient btn-gradient-blue">Blue</button>
<button class="btn btn-gradient btn-gradient-purple">Purple</button>
<button class="btn btn-gradient btn-gradient-pink">Pink</button>
```

### Social Media Buttons

```html
<button class="btn btn-facebook icon-facebook">Facebook</button>
<button class="btn btn-twitter icon-twitter">Twitter</button>
<button class="btn btn-line icon-line">Line</button>
```

### Floating Action Button

```html
<button class="btn float btn-primary circle icon-new"></button>
```

## Files

| File | Description |
|------|-------------|
| `index.html` | หน้าแสดงตัวอย่างปุ่มทุกรูปแบบ |
| `main.js` | การตั้งค่า Now.js Framework |
| `styles.css` | Custom styles สำหรับตัวอย่าง |

## Dependencies

- Now.js Framework (`now.core.min.css`, `now.core.min.js`)
- Now.js Fonts (`fonts.css`)
- SyntaxHighlighter Component

## Live Demo

เปิดไฟล์ `index.html` ในเบราว์เซอร์เพื่อดูตัวอย่างการใช้งาน
