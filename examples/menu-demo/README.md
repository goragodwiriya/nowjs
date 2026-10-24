# MenuManager Demo

ตัวอย่างการใช้งาน MenuManager ใน Now.js Framework

## Features

ตัวอย่างนี้แสดงการสร้างเมนู:

- **Static Menu** - เมนูจาก HTML โดยตรง
- **Dynamic Menu** - Render จาก JavaScript data
- **API Menu** - โหลดจาก API แบบ declarative
- **Nested Menu** - รองรับ submenu 2 ระดับ
- **Icons & Badges** - รองรับ icon และ badge
- **Accessibility** - ARIA attributes อัตโนมัติ

## Usage

### 1. Static Menu (HTML)

```html
<nav class="topmenu" data-component="menu">
  <ul>
    <li>
      <a href="#dashboard" class="icon-dashboard">
        <span>Dashboard</span>
      </a>
    </li>
    <li>
      <!-- Parent with submenu uses button -->
      <button type="button" class="icon-grid">
        <span>Sales</span>
      </button>
      <ul>
        <li><a href="#pipeline"><span>Pipeline</span></a></li>
        <li><a href="#deals"><span>Deals</span></a></li>
      </ul>
    </li>
    <li>
      <a href="#customers" class="icon-users">
        <span>Customers</span>
      </a>
    </li>
  </ul>
</nav>
```

### 2. Dynamic Menu (JavaScript)

```javascript
const menuData = [
  { title: 'Dashboard', url: '/', icon: 'icon-dashboard' },
  {
    title: 'Sales',
    icon: 'icon-grid',
    children: [
      { title: 'Pipeline', url: '/pipeline', icon: 'icon-chart' },
      { title: 'Deals', url: '/deals', icon: 'icon-wallet' }
    ]
  },
  { title: 'Customers', url: '/customers', icon: 'icon-users' },
  { title: 'Settings', url: '/settings', icon: 'icon-settings' }
];

// Render menu from data
MenuManager.renderFromData('#dynamicMenu', menuData);
```

### 3. API Menu (Declarative)

```html
<div data-component="api" data-endpoint="api/menu.json" data-cache="true">
  <!-- Data binding -->
  <h3>App: <span data-text="data.app_name">Loading...</span></h3>

  <!-- Menu auto-renders from data.menus -->
  <nav class="sidemenu" data-component="menu" data-source="data.menus"></nav>
</div>
```

**API Response (api/menu.json):**
```json
{
  "app_name": "CRM System",
  "menus": [
    { "title": "Dashboard", "url": "/", "icon": "icon-dashboard" },
    {
      "title": "Sales",
      "icon": "icon-grid",
      "children": [
        { "title": "Pipeline", "url": "/pipeline" },
        { "title": "Deals", "url": "/deals" }
      ]
    },
    { "title": "Customers", "url": "/customers", "icon": "icon-users" }
  ]
}
```

## Menu Data Structure

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | string | Yes | ข้อความที่แสดง |
| `url` | string | No* | URL ปลายทาง (*จำเป็นถ้าไม่มี children) |
| `icon` | string | No | CSS class ของ icon |
| `children` | array | No | Submenu items (สูงสุด 2 ระดับ) |
| `badge` | string | No | Badge text เช่น "New", "5" |
| `badgeClass` | string | No | CSS class สำหรับ badge |
| `id` | string | No | ID ของ li element |
| `class` | string | No | CSS class ของ li element |

## Examples

### With Icons

```javascript
{ title: 'Dashboard', url: '/', icon: 'icon-dashboard' }
```

### With Badge

```javascript
{ title: 'Notifications', url: '/notifications', badge: '5', badgeClass: 'badge-danger' }
```

### Parent with Children

```javascript
{
  title: 'Sales',
  icon: 'icon-grid',
  children: [
    { title: 'Pipeline', url: '/pipeline' },
    { title: 'Deals', url: '/deals' }
  ]
}
```

### With Custom ID and Class

```javascript
{ title: 'Home', url: '/', id: 'menu-home', class: 'highlight' }
```

## MenuManager API

### renderFromData()

```javascript
MenuManager.renderFromData(container, data, options);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| container | Element \| string | Container element หรือ CSS selector |
| data | Array | Array ของ menu items |
| options | Object | Options เพิ่มเติม |

### setData()

Alias ของ `renderFromData()`:

```javascript
MenuManager.setData('#myMenu', menuData);
```

### createMenu()

Initialize เมนูที่มี HTML อยู่แล้ว:

```javascript
MenuManager.createMenu(document.querySelector('.sidemenu'));
```

### updateActiveMenu()

อัพเดท active state ตาม URL:

```javascript
MenuManager.updateActiveMenu('/customers');
```

## Menu Types

### Top Menu (Horizontal)

```html
<nav class="topmenu" data-component="menu">
  <ul>...</ul>
</nav>
```

### Side Menu (Vertical)

```html
<nav class="sidemenu" data-component="menu">
  <ul>...</ul>
</nav>
```

### Responsive Menu

```html
<nav class="topmenu responsive-menu" data-component="menu">
  <ul>...</ul>
</nav>

<button class="menu-toggle topmenu-toggle">☰</button>
```

## Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-component="menu"` | ระบุว่าเป็น menu component |
| `data-source` | Path ไปยัง menu data ใน API response |

## Styling

```css
/* Side Menu */
.sidemenu {
  background: var(--color-surface);
  border-radius: var(--border-radius);
}

.sidemenu li a {
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sidemenu li a:hover,
.sidemenu li a.active {
  background: var(--color-primary);
  color: white;
}

/* Submenu */
.sidemenu li ul {
  padding-left: 1rem;
}
```

## File Structure

```
menu-demo/
├── index.html      # Demo page
├── main.js         # JavaScript examples
├── styles.css      # Custom styles
└── api/
    └── menu.json   # Sample API response
```

## Dependencies

- `Now.js Framework` - Core framework with MenuManager
