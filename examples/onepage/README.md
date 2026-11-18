# TechVision - Modern Single-Page Website

เว็บไซต์หน้าเดียวสำหรับบริษัทดิจิทัลเอเจนซี่ ที่สร้างด้วย Now.js Framework

![TechVision Website](https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=400&fit=crop)

## 🌟 ภาพรวม

TechVision เป็นเว็บไซต์หน้าเดียว (Single-Page Application) ที่ออกแบบมาเพื่อแสดงความสามารถทั้งหมดของ Now.js Framework พร้อมด้วยการออกแบบที่ทันสมัยและสวยงาม

**Live Demo:** `http://localhost/Now/examples/onepage/`

## ✨ ฟีเจอร์หลัก

### 🎬 Hero Slideshow
- สไลด์โชว์อัตโนมัติ 3 สไลด์
- เอฟเฟกต์ Fade transition
- Parallax scrolling effect
- ปุ่ม Call-to-Action

### 📊 About Section
- ตัวนับสถิติแบบ Animated (Counter Component)
- เริ่มนับเมื่อเลื่อนเข้ามาในหน้าจอ
- แสดงข้อมูลบริษัท 500+ โปรเจค, 350+ ลูกค้า

### 🛠️ Services Section
- แสดง 8 บริการหลัก
- ระบบกรองตามหมวดหมู่ (Filter System)
- โหลดข้อมูลจาก API
- Fade animation เมื่อกรอง

### 🖼️ Portfolio Gallery
- แสดง 9 ผลงาน
- Lightbox Modal พร้อม Gallery Navigation
- กรองตามประเภทงาน
- Scale animation

### 👥 Team Section
- แสดงทีมงาน 6 คน
- โหลดข้อมูลจาก API
- Social media links
- Hover effects

### 💬 Testimonials
- Carousel แสดงความคิดเห็นลูกค้า
- Auto-play slideshow
- 5-star ratings

### 📧 Contact Form
- ฟอร์มติดต่อพร้อม Validation
- ข้อมูลติดต่อครบถ้วน
- Responsive design

### 🌐 Multi-language (i18n)
- รองรับภาษาไทยและอังกฤษ
- สลับภาษาได้ที่ปุ่มบน Header
- แปลทุก UI elements

## 🎨 การออกแบบ

### สีสัน
- **Primary:** Vibrant Blue `hsl(220, 90%, 56%)`
- **Secondary:** Purple `hsl(280, 70%, 60%)`
- **Background:** Dark Blue-Gray `hsl(220, 20%, 10%)`
- **Gradients:** Blue to Purple overlays

### ฟอนต์
- **Noto Sans Thai** - ฟอนต์ไทยที่สวยงามและอ่านง่าย
- **Sarabun** - ฟอนต์ไทยสำรอง
- น้ำหนัก: 300-800

### เอฟเฟกต์
- ✨ Gradient text effects
- 🌊 Smooth transitions (0.3s-0.5s)
- 🎭 Glassmorphism on sticky header
- 💫 Scroll reveal animations
- 🎨 Hover transformations
- 📦 Box shadows with glow

## 🚀 เทคโนโลยีที่ใช้

- **Now.js Framework** - Core framework
- **HTML5** - Semantic markup
- **CSS3** - Modern styling with variables
- **JavaScript ES6+** - Modern JavaScript
- **Google Fonts** - Noto Sans Thai, Sarabun
- **Unsplash API** - High-quality images

## 📦 โครงสร้างไฟล์

```
onepage/
├── index.html              # หน้าเว็บหลัก
├── main.js                 # JavaScript configuration
├── styles.css              # CSS styling (1000+ lines)
├── api/
│   ├── services.json       # ข้อมูลบริการ (8 items)
│   ├── portfolio.json      # ข้อมูลผลงาน (9 items)
│   └── team.json          # ข้อมูลทีมงาน (6 members)
└── README.md              # เอกสารนี้
```

## 🔧 Now.js Components ที่ใช้

| Component | ใช้งาน | ตำแหน่ง |
|-----------|--------|---------|
| `slideshow` | Hero, Testimonials | Hero section, Testimonials |
| `counter` | Animated statistics | About section |
| `api` | Dynamic content | Services, Portfolio, Team |
| `filter` | Category filtering | Services, Portfolio |
| `modal` | Lightbox gallery | Portfolio |
| `scroll-reveal` | Scroll animations | All sections |
| `i18n` | Multi-language | Entire site |
| `form` | Contact form | Contact section |

## 📱 Responsive Breakpoints

- **Desktop:** 1200px+
- **Tablet:** 768px - 1024px
- **Mobile:** < 768px
- **Small Mobile:** < 480px

## 🎯 ฟีเจอร์ Now.js ที่ใช้

### Data Binding
```html
<div data-for="item of data">
  <h3 data-text="item.title"></h3>
  <img data-attr="src:item.image,alt:item.title">
</div>
```

### Filtering
```html
<div data-filter-scope=".grid"
     data-filter-attr="data-category"
     data-filter-animation="fade">
  <button data-filter-value="web">Web</button>
</div>
```

### Modal with Gallery
```html
<button data-modal="portfolio-modal"
        data-modal-bind="image:item.image,title:item.title"
        data-modal-gallery="true">
  View
</button>
```

### Counter Animation
```html
<div data-component="counter"
     data-scroll-trigger="true"
     data-end="500"
     data-suffix="+">
  0
</div>
```

### Slideshow
```html
<div data-component="slideshow"
     data-effect="fade"
     data-autoplay="true"
     data-duration="5000">
  <!-- slides -->
</div>
```

## 🌐 i18n Configuration

```javascript
i18n: {
  enabled: true,
  defaultLanguage: 'th',
  availableLocales: ['th', 'en'],
  translations: {
    th: { /* Thai translations */ },
    en: { /* English translations */ }
  }
}
```

## 🎬 การใช้งาน

### 1. เปิดเว็บไซต์
```
http://localhost/Now/examples/onepage/
```

### 2. ทดสอบฟีเจอร์
- **Slideshow:** รอดูสไลด์เปลี่ยนอัตโนมัติ (5 วินาที)
- **Counters:** เลื่อนลงมาที่ About section
- **Filtering:** คลิกปุ่มกรองใน Services/Portfolio
- **Modal:** คลิกที่ผลงานเพื่อเปิด Modal
- **Language:** คลิกปุ่ม EN/TH ที่ Header
- **Mobile Menu:** ลดขนาดหน้าจอเพื่อดูเมนูมือถือ

### 3. แก้ไขเนื้อหา

#### เปลี่ยนข้อมูลบริการ
แก้ไขไฟล์ `api/services.json`:
```json
{
  "id": 1,
  "title": "ชื่อบริการ",
  "icon": "💻",
  "category": "development",
  "description": "รายละเอียด",
  "features": ["ฟีเจอร์ 1", "ฟีเจอร์ 2"]
}
```

#### เปลี่ยนข้อมูลผลงาน
แก้ไขไฟล์ `api/portfolio.json`:
```json
{
  "id": 1,
  "title": "ชื่อโปรเจค",
  "category": "web",
  "image": "URL รูปภาพ",
  "description": "รายละเอียด",
  "client": "ชื่อลูกค้า",
  "year": "2024"
}
```

## 🎨 ปรับแต่งสี

แก้ไขใน `styles.css`:
```css
:root {
  --color-primary: hsl(220, 90%, 56%);
  --color-secondary: hsl(280, 70%, 60%);
  --color-background: hsl(220, 20%, 10%);
}
```

## 📝 ปรับแต่งฟอนต์

แก้ไขใน `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=YourFont&display=swap" rel="stylesheet">
```

แก้ไขใน `styles.css`:
```css
--font-primary: 'YourFont', sans-serif;
```

## 🐛 แก้ไขปัญหา

### ปัญหา: Slideshow ไม่เปลี่ยน
**วิธีแก้:** ตรวจสอบว่า Now.js core loaded แล้ว และ `data-autoplay="true"`

### ปัญหา: Counter ไม่นับ
**วิธีแก้:** ตรวจสอบ `data-scroll-trigger="true"` และเลื่อนหน้าจอลงมา

### ปัญหา: Filter ไม่ทำงาน
**วิธีแก้:** ตรวจสอบ `data-filter-scope` ชี้ไปที่ container ที่ถูกต้อง

### ปัญหา: Modal ไม่เปิด
**วิธีแก้:** ตรวจสอบ `id` ของ modal ตรงกับ `data-modal` attribute

## 📚 เอกสารเพิ่มเติม

- [Now.js Documentation](../../README.md)
- [Design Specification](../../DESIGN_SPEC.md)
- [Walkthrough](../../../.gemini/antigravity/brain/d7c5763e-8f32-49e4-93c3-3a2ff26f6bb7/walkthrough.md)

## 🤝 การพัฒนาต่อ

### เพิ่มส่วนใหม่
1. เพิ่ม HTML section ใน `index.html`
2. เพิ่ม CSS styling ใน `styles.css`
3. เพิ่ม navigation link ใน header
4. เพิ่ม scroll reveal animation

### เพิ่ม API Endpoint
1. สร้างไฟล์ JSON ใน `api/`
2. เพิ่ม `data-component="api"` ใน HTML
3. ใช้ `data-for` loop เพื่อ render ข้อมูล

## 📄 License

MIT License - ใช้งานได้อย่างอิสระ

## 👨‍💻 ผู้พัฒนา

สร้างด้วย ❤️ โดยใช้ Now.js Framework

---

## 🎯 Quick Start

```bash
# เปิดเว็บไซต์
http://localhost/Now/examples/onepage/

# แก้ไขเนื้อหา
nano api/services.json

# แก้ไขสไตล์
nano styles.css

# แก้ไข JavaScript
nano main.js
```

## 📸 Screenshots

### Hero Section
![Hero](https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop)

### Services
![Services](https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop)

### Portfolio
![Portfolio](https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=400&fit=crop)