# SPA (Single Page Application) Example

ตัวอย่างการสร้าง Single Page Application ด้วย Now.js Framework

## Features

ตัวอย่างนี้แสดงการสร้าง SPA:

- **Client-Side Routing** - เปลี่ยนหน้าโดยไม่ reload
- **History Mode** - URL สะอาด ไม่มี hash (#)
- **Template Loading** - โหลด template จากไฟล์แยก
- **Navigation** - data-route สำหรับ link
- **Responsive Menu** - เมนูที่รองรับ mobile
- **Page Transitions** - animation เมื่อเปลี่ยนหน้า

## Usage

### 1. HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="now.core.min.css">
</head>
<body>
  <!-- Navigation -->
  <nav>
    <a href="/" data-route="/">Home</a>
    <a href="/about" data-route="/about">About</a>
    <a href="/portfolio" data-route="/portfolio">Portfolio</a>
    <a href="/contact" data-route="/contact">Contact</a>
  </nav>

  <!-- Router injects content here -->
  <main id="main" role="main"></main>

  <!-- Footer (stays static) -->
  <footer>...</footer>

  <script src="now.core.min.js"></script>
  <script src="main.js"></script>
</body>
</html>
```

### 2. Router Configuration

```javascript
await Now.init({
  environment: 'production',

  paths: {
    templates: './templates'
  },

  router: {
    enabled: true,
    mode: 'history',  // 'hash' or 'history'
    base: '/examples/spa/',
    autoDetectBase: true,

    routes: {
      '/': {
        template: 'index.html'
      },
      '/about': {
        template: 'about.html'
      },
      '/portfolio': {
        template: 'portfolio.html'
      },
      '/contact': {
        template: 'contact.html'
      }
    }
  }
});
```

### 3. Template Files

สร้างไฟล์ใน `templates/` folder:

**templates/index.html:**
```html
<div class="hero">
  <h1>Welcome to My SPA</h1>
  <p>Built with Now.js Framework</p>
  <a href="/about" data-route="/about" class="btn">Learn More</a>
</div>
```

**templates/about.html:**
```html
<section class="page">
  <h1>About Me</h1>
  <p>This is the about page content.</p>
</section>
```

## Router Options

```javascript
router: {
  enabled: true,           // เปิด/ปิด router
  mode: 'history',         // 'history' (clean URLs) หรือ 'hash' (#/path)
  base: '/',               // Base path ของ application
  autoDetectBase: true,    // ตรวจจับ base path อัตโนมัติ

  routes: {
    '/path': {
      template: 'file.html',   // Template file
      title: 'Page Title',     // ชื่อหน้า (optional)
      data: {}                 // ข้อมูลที่ส่งให้ template (optional)
    }
  }
}
```

## Navigation

### data-route Attribute

ใช้ `data-route` แทน JavaScript onclick:

```html
<!-- Navigation links -->
<a href="/about" data-route="/about">About</a>
<a href="/contact" data-route="/contact">Contact</a>

<!-- Buttons -->
<button data-route="/portfolio">View Portfolio</button>
```

### Programmatic Navigation

```javascript
// Navigate to route
Now.router.navigate('/about');

// Navigate with replace (no history entry)
Now.router.navigate('/about', { replace: true });

// Go back
Now.router.back();

// Go forward
Now.router.forward();
```

## Active Link Styling

Router เพิ่ม class `active` ให้ link ที่ตรงกับ route ปัจจุบัน:

```css
.nav-link {
  color: var(--color-text);
}

.nav-link.active {
  color: var(--color-primary);
  font-weight: bold;
}
```

## Page Transitions

เพิ่ม animation เมื่อเปลี่ยนหน้า:

```css
/* Fade in animation */
.fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Slide animations */
.slide-in-left {
  animation: slideInLeft 0.4s ease-out;
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}
```

ใช้ใน template:
```html
<div class="hero fade-in">
  <h1>Welcome</h1>
</div>

<div class="card slide-in-left">
  <h3>Feature 1</h3>
</div>
```

## Server Configuration

สำหรับ history mode ต้อง config server ให้ redirect ทุก path ไป index.html:

### Apache (.htaccess)

```apache
RewriteEngine On
RewriteBase /examples/spa/

# If not a file or directory, redirect to index.html
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.html [L,QSA]
```

### Nginx

```nginx
location /examples/spa/ {
  try_files $uri $uri/ /examples/spa/index.html;
}
```

## Hash Mode (Alternative)

ถ้าไม่สามารถ config server ได้ ใช้ hash mode:

```javascript
router: {
  mode: 'hash'  // URLs จะเป็น /#/about, /#/contact
}
```

## Router Events

RouterManager ส่ง event ผ่าน `EventManager` ไม่ได้ dispatch เป็น DOM event
จึงต้องรับด้วย `EventManager.on()` ไม่ใช่ `document.addEventListener()`

```javascript
// ก่อนเริ่มเปลี่ยน route
EventManager.on('route:before', ({path, params}) => {
  console.log('About to navigate:', path);
});

// เปลี่ยน route สำเร็จ
EventManager.on('route:changed', ({path, params, query, route, previous}) => {
  console.log('Navigated to:', path);
});

// เนื้อหาใหม่ถูกวางลง DOM แล้ว
EventManager.on('content:rendered', ({path, main}) => {
  console.log('Route rendered:', path);
});

// ไม่พบ route ที่ตรงกับ path
EventManager.on('route:notFound', ({path, redirectTo}) => {
  console.warn('No route for', path);
});
```

ยกเลิกการเปลี่ยน route ทำผ่าน navigation guard ไม่ใช่ `preventDefault()`

```javascript
RouterManager.beforeEach((to, from) => {
  if (!AuthManager.isAuthenticated()) return '/login';
  return true;
});
```

## File Structure

```
spa/
├── index.html          # Main HTML (shell)
├── main.js             # Router configuration
├── styles.css          # Styles
├── .htaccess           # Apache redirect config
└── templates/          # Page templates
    ├── index.html      # Home page
    ├── about.html      # About page
    ├── portfolio.html  # Portfolio page
    └── contact.html    # Contact page
```

## SEO Considerations

```html
<!-- Main index.html -->
<head>
  <title>My SPA - Now.js</title>
  <meta name="description" content="Description for SEO">
  <meta property="og:title" content="My SPA">
  <meta property="og:description" content="Built with Now.js">
</head>
```

## Responsive Navigation

```html
<nav class="topmenu responsive-menu" data-component="menu">
  <ul>
    <li><a href="/" data-route="/">Home</a></li>
    <li><a href="/about" data-route="/about">About</a></li>
  </ul>
</nav>

<!-- Mobile toggle button -->
<button class="menu-toggle topmenu-toggle">
  <span class="toggle-bar"></span>
  <span class="toggle-bar"></span>
  <span class="toggle-bar"></span>
</button>
```

## Dependencies

- `Now.js Framework` - Core framework with Router
- No additional routing library required
