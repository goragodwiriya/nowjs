# Typography Example

ตัวอย่างการใช้งาน Typography ใน Now.js Framework

## Features

- **Heading Levels** - H1-H6 headings
- **Paragraphs** - จัดวาง text alignment (left, center, right)
- **Code & Blockquote** - แสดงโค้ดและคำอ้างอิง
- **Text Colors** - สีตัวอักษรหลากหลาย
- **Background Colors** - สีพื้นหลัง
- **Inline Text** - Status marks, badges และ text formatting

## Usage

### Headings

```html
<h1>H1 Heading</h1>  <!-- Reserved for theme -->
<h2>H2 Heading</h2>  <!-- Reserved for section headers -->
<h3>H3 Heading</h3>  <!-- For form/table headers -->
<h4>H4 Heading</h4>
<h5>H5 Heading</h5>
<h6>H6 Heading</h6>
```

### Text Alignment

```html
<p class="left">Left aligned text</p>
<p class="center">Center aligned text</p>
<p class="right">Right aligned text</p>
```

### Code & Blockquote

```html
<code>Inline code snippet</code>
<blockquote>Quote text here</blockquote>
```

### Text Colors

```html
<p class="color-green">Green text</p>
<p class="color-blue">Blue text</p>
<p class="color-red">Red text</p>
<p class="color-orange">Orange text</p>
<p class="color-purple">Purple text</p>
<p class="color-cyan">Cyan text</p>
<p class="color-pink">Pink text</p>
<p class="color-gold">Gold text</p>
<p class="color-gray">Gray text</p>
<p class="color-black">Black text</p>
<p class="color-white">White text</p>
<p class="comment">Comment text (smaller, muted)</p>
```

### Background Colors

```html
<p class="bg-black">Black background</p>
<p class="bg-blue">Blue background</p>
<p class="bg-green">Green background</p>
<p class="bg-red">Red background</p>
<p class="bg-orange">Orange background</p>
<p class="bg-purple">Purple background</p>
<p class="bg-cyan">Cyan background</p>
<p class="bg-pink">Pink background</p>
<p class="bg-gold">Gold background</p>
<p class="bg-gray">Gray background</p>
<p class="bg-light">Light background</p>
<p class="bg-dark">Dark background</p>
<p class="bg-white">White background</p>
```

### Status Marks

```html
<mark class="status0">Status 0</mark>
<mark class="status1">Status 1</mark>
<mark class="status2">Status 2</mark>
<!-- ... up to status11 -->
```

### Badges

```html
<span class="badge-success" data-badge="10">Success</span>
<span class="badge-error" data-badge="-10">Error</span>
<span class="badge-warning" data-badge="+5">Warning</span>
<span class="badge-info" data-badge="1">Info</span>
```

### Inline Text Formatting

```html
<em>Emphasized text</em>
<strong>Bold text</strong>
<b>Bold text</b>
<i>Italic text</i>
<u>Underlined text</u>
<ins>Inserted text</ins>
<del>Deleted text</del>
<sub>Subscript</sub>
<sup>Superscript</sup>
<small>Small text</small>
<big>Large text</big>
```

## Available Colors

| Text Color | Background Color |
|------------|------------------|
| `color-green` | `bg-green` |
| `color-blue` | `bg-blue` |
| `color-red` | `bg-red` |
| `color-orange` | `bg-orange` |
| `color-purple` | `bg-purple` |
| `color-cyan` | `bg-cyan` |
| `color-pink` | `bg-pink` |
| `color-gold` | `bg-gold` |
| `color-gray` | `bg-gray` |
| `color-brown` | `bg-brown` |
| `color-magenta` | `bg-magenta` |
| `color-rosy` | `bg-rosy` |
| `color-silver` | - |
| `color-black` | `bg-black` |
| `color-white` | `bg-white` |
| `color-dark` | `bg-dark` |
| - | `bg-light` |

## Files

| File | Description |
|------|-------------|
| `index.html` | หน้าแสดงตัวอย่าง Typography ทั้งหมด |
| `main.js` | การตั้งค่า Now.js Framework |
| `styles.css` | Custom styles (ถ้ามี) |

## Dependencies

- Now.js Framework (`now.core.min.css`, `now.core.min.js`)
- Now.js Fonts (`fonts.css`)

## Live Demo

เปิดไฟล์ `index.html` ในเบราว์เซอร์เพื่อดูตัวอย่างการใช้งาน
