# Tabs Component Example

ตัวอย่างการใช้งาน Tabs Component ใน Now.js Framework

## Features

- **Auto-initialization** - เพิ่ม `data-component="tabs"` แล้วใช้งานได้ทันที
- **Full Accessibility** - รองรับ ARIA attributes และ screen readers
- **Keyboard Navigation** - นำทางด้วย Arrow keys, Home, End
- **Horizontal & Vertical** - รองรับทั้งแนวนอนและแนวตั้ง
- **Custom Styles** - ปรับแต่ง CSS ได้อิสระ (Wizard style)
- **Dynamic Management** - เพิ่ม/ลบ tabs ได้แบบ dynamic
- **Event System** - รองรับ events และ callbacks

## Usage

### Basic Tabs (HTML Only)

```html
<div data-component="tabs" data-default-tab="profile">
  <div class="tab-buttons" role="tablist">
    <button class="tab-button" data-tab="home" role="tab">
      <span class="icon-home">Home</span>
    </button>
    <button class="tab-button" data-tab="profile" role="tab">
      <span class="icon-user">Profile</span>
    </button>
    <button class="tab-button" data-tab="settings" role="tab">
      <span class="icon-cog">Settings</span>
    </button>
  </div>
  <div class="tab-content">
    <div class="tab-pane" data-tab="home" role="tabpanel">
      Home content...
    </div>
    <div class="tab-pane" data-tab="profile" role="tabpanel">
      Profile content...
    </div>
    <div class="tab-pane" data-tab="settings" role="tabpanel">
      Settings content...
    </div>
  </div>
</div>
```

### Vertical Tabs

```html
<div data-component="tabs" data-orientation="vertical">
  <div class="tab-buttons vertical" role="tablist">
    <button class="tab-button" data-tab="general">General</button>
    <button class="tab-button" data-tab="security">Security</button>
    <button class="tab-button" data-tab="privacy">Privacy</button>
  </div>
  <div class="tab-content">
    <div class="tab-pane" data-tab="general">...</div>
    <div class="tab-pane" data-tab="security">...</div>
    <div class="tab-pane" data-tab="privacy">...</div>
  </div>
</div>
```

### Custom Style (Wizard)

ใช้ `data-style` เพื่อปิด default CSS และใช้ custom selectors:

```html
<div data-component="tabs"
     data-style="wizard"
     data-button-selector=".wizard-step"
     data-panel-selector=".wizard-panel">
  <div class="wizard-nav" role="tablist">
    <button class="wizard-step" data-tab="step1">
      <span class="step-number">1</span>
      <span class="step-label">Account</span>
    </button>
    <!-- more steps -->
  </div>
  <div class="wizard-content">
    <div class="wizard-panel" data-tab="step1">...</div>
    <!-- more panels -->
  </div>
</div>
```

### JavaScript API

```javascript
// Initialize programmatically
const tabs = TabsComponent.create(element, {
  defaultTab: 'profile',
  keyboard: true,
  animation: true,
  animationDuration: 300,

  onTabChange(tabId, previousTab) {
    console.log(`Changed to: ${tabId}`);
  },

  beforeTabChange(tabId, previousTab) {
    // Return false to cancel
    return true;
  }
});

// Switch tab
tabs.switchTab('settings');

// Get active tab
const activeTab = tabs.getActiveTab();

// Refresh after DOM changes
tabs.refresh();
```

### Event Handling

```javascript
element.addEventListener('tabs:tabchange', (event) => {
  const { tabId, previousTab, button, panel } = event.detail;
  console.log(`Tab changed to: ${tabId}`);
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultTab` | string | null | Tab เริ่มต้น (null = tab แรก) |
| `keyboard` | boolean | true | เปิดใช้ keyboard navigation |
| `animation` | boolean | true | เปิดใช้ animations |
| `animationDuration` | number | 300 | ระยะเวลา animation (ms) |
| `orientation` | string | 'horizontal' | 'horizontal' หรือ 'vertical' |
| `ariaLabel` | string | 'Tabs' | ARIA label สำหรับ tablist |
| `lazy` | boolean | false | Lazy load เนื้อหา |

## Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-component="tabs"` | ระบุว่าเป็น tabs component |
| `data-default-tab` | ID ของ tab เริ่มต้น |
| `data-orientation` | 'horizontal' หรือ 'vertical' |
| `data-style` | ชื่อ style (เช่น 'wizard') ปิด default CSS |
| `data-button-selector` | CSS selector สำหรับ tab buttons |
| `data-panel-selector` | CSS selector สำหรับ tab panels |
| `data-tab` | ID ของแต่ละ tab |

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `←` / `→` | สลับ tab (horizontal) |
| `↑` / `↓` | สลับ tab (vertical) |
| `Home` | ไปยัง tab แรก |
| `End` | ไปยัง tab สุดท้าย |

## Files

| File | Description |
|------|-------------|
| `index.html` | หน้าแสดงตัวอย่าง Tabs ทุกรูปแบบ |
| `main.js` | การตั้งค่า Now.js Framework |
| `styles.css` | Custom styles สำหรับ vertical และ wizard tabs |

## Dependencies

- Now.js Framework (`now.core.min.css`, `now.core.min.js`)
- TabsComponent (built-in)

## Live Demo

เปิดไฟล์ `index.html` ในเบราว์เซอร์เพื่อดูตัวอย่างการใช้งาน
