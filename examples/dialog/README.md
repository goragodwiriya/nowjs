# DialogManager Example

ตัวอย่างการใช้งาน DialogManager ใน Now.js Framework

## Features

ตัวอย่างนี้แสดงการใช้งาน DialogManager หลากหลายรูปแบบ:

- **Alert Dialog** - แจ้งเตือนข้อความแบบธรรมดา
- **Confirm Dialog** - ยืนยันการกระทำ
- **Prompt Dialog** - รับข้อมูลจากผู้ใช้
- **Custom Dialog** - สร้าง dialog ที่กำหนดเองได้
- **Draggable** - ลากย้าย dialog ได้
- **Focus Trap** - จัดการ focus ภายใน dialog
- **Keyboard Support** - รองรับ ESC และ keyboard navigation

## Usage

### 1. Alert Dialog

แสดงข้อความแจ้งเตือนแบบธรรมดา:

```javascript
await DialogManager.alert('This is an alert message', 'Alert');
console.log('User clicked OK');
```

#### With Custom Options

```javascript
await DialogManager.alert('Operation completed successfully!', 'Success', {
  customClass: 'dialog-success',
  draggable: true
});
```

### 2. Confirm Dialog

ยืนยันการกระทำก่อนดำเนินการ:

```javascript
const confirmed = await DialogManager.confirm(
  'Are you sure you want to delete this item?',
  'Confirm Delete'
);

if (confirmed) {
  console.log('User confirmed');
} else {
  console.log('User cancelled');
}
```

#### With Custom Buttons

```javascript
const result = await DialogManager.confirm(
  'Do you want to save changes?',
  'Unsaved Changes',
  {
    buttons: {
      cancel: {
        text: 'Discard',
        class: 'text'
      },
      confirm: {
        text: 'Save Changes',
        class: 'btn-primary'
      }
    }
  }
);
```

### 3. Prompt Dialog

รับข้อมูลจากผู้ใช้:

```javascript
const username = await DialogManager.prompt('Enter your username:', 'Guest', 'Login');

if (username !== null) {
  console.log('Username:', username);
} else {
  console.log('User cancelled');
}
```

### 4. Custom Dialog

สร้าง dialog ที่กำหนดเองได้ทั้งหมด:

```javascript
const dialog = DialogManager.custom({
  title: 'Custom Dialog',
  message: '<p>This is a custom dialog with HTML content.</p>',
  customClass: 'my-custom-dialog',
  draggable: true,
  buttons: {
    action1: {
      text: 'Action 1',
      class: 'btn-secondary',
      callback: (dialog) => {
        console.log('Action 1 clicked');
      }
    },
    action2: {
      text: 'Action 2',
      class: 'btn-primary',
      callback: (dialog) => {
        console.log('Action 2 clicked');
      }
    }
  },
  onShow: (event) => {
    console.log('Dialog shown', event.detail.dialog);
  },
  onClose: (event) => {
    console.log('Dialog closed', event.detail.dialog);
  }
});
```

#### Custom Template

```javascript
// Register custom template
DialogManager.state.templates.set('mytemplate', `
  <div class="dialog-header">
    <h2 class="dialog-title"></h2>
    <button class="dialog-close" aria-label="Close"></button>
  </div>
  <div class="dialog-body"></div>
  <div class="dialog-actions">
    <div class="dialog-footer"></div>
  </div>
`);

// Use custom template
const dialog = DialogManager.custom({
  template: 'mytemplate',
  title: 'My Custom Template',
  message: 'Content here...'
});
```

### 5. Programmatic Control

ควบคุม dialog ด้วย API:

```javascript
// Show dialog
const dialog = DialogManager.custom({
  title: 'Loading...',
  message: 'Please wait...'
});

// Later, close it programmatically
setTimeout(() => {
  DialogManager.close(dialog);
}, 3000);

// Or close all dialogs
DialogManager.closeAll();

// Bring to front
DialogManager.bringToFront(dialog);
```

### 6. Configuration

ตั้งค่า DialogManager:

```javascript
await DialogManager.init({
  animation: true,
  duration: 200,
  draggable: true,
  modal: true,
  closeOnEscape: true,
  closeOnBackdrop: true,
  preventScroll: true,
  baseZIndex: 1000,
  focusTrap: true,
  keyboard: true
});
```

## DialogManager Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `init(options)` | Initialize DialogManager with options | Promise<DialogManager> |
| `alert(message, title, options)` | Show alert dialog | Promise<boolean> |
| `confirm(message, title, options)` | Show confirm dialog | Promise<boolean> |
| `prompt(message, defaultValue, title, options)` | Show prompt dialog | Promise<string\|null> |
| `custom(options)` | Create custom dialog | HTMLElement |
| `show(dialog)` | Show dialog element | HTMLElement |
| `close(dialog)` | Close specific dialog | void |
| `closeAll()` | Close all active dialogs | void |
| `bringToFront(dialog)` | Bring dialog to front | void |

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `animation` | boolean | true | Enable animations |
| `duration` | number | 200 | Animation duration (ms) |
| `draggable` | boolean | true | Allow dragging dialogs |
| `modal` | boolean | true | Show backdrop |
| `closeOnEscape` | boolean | true | Close on ESC key |
| `closeOnBackdrop` | boolean | true | Close when clicking backdrop |
| `preventScroll` | boolean | true | Prevent body scroll when open |
| `baseZIndex` | number | 1000 | Base z-index for dialogs |
| `focusTrap` | boolean | true | Trap focus inside dialog |
| `keyboard` | boolean | true | Enable keyboard support |
| `customClass` | string | - | Additional CSS class |
| `template` | string | 'alert' | Template name to use |

## Custom Dialog Options

| Option | Type | Description |
|--------|------|-------------|
| `title` | string | Dialog title |
| `message` | string\|HTMLElement | Dialog content |
| `customClass` | string | Additional CSS class |
| `draggable` | boolean | Override global draggable setting |
| `template` | string | Template name ('alert', 'confirm', 'prompt', or custom) |
| `buttons` | object | Custom buttons configuration |
| `onShow` | function | Callback when dialog is shown |
| `onClose` | function | Callback when dialog is closed |

## Button Configuration

```javascript
buttons: {
  buttonKey: {
    text: 'Button Text',      // Button label
    class: 'btn-primary',      // CSS class
    callback: (dialog) => {},  // Click handler
    attrs: {                   // Additional attributes
      'data-action': 'save'
    }
  }
}
```

## Events

| Event | Description | Detail |
|-------|-------------|--------|
| `dialog:shown` | Fired when dialog is shown | `{ dialog }` |
| `dialog:closed` | Fired when dialog is closed | `{ dialog }` |

### Event Usage

```javascript
const dialog = DialogManager.custom({
  title: 'My Dialog',
  message: 'Content...'
});

dialog.addEventListener('dialog:shown', (event) => {
  console.log('Dialog shown:', event.detail.dialog);
});

dialog.addEventListener('dialog:closed', (event) => {
  console.log('Dialog closed:', event.detail.dialog);
});
```

## Features

### Draggable

Dialogs can be dragged by their header:

```javascript
DialogManager.custom({
  title: 'Draggable Dialog',
  message: 'Try dragging me by the header!',
  draggable: true  // default
});
```

### Focus Trap

Focus is trapped inside the dialog for accessibility:

- **Tab**: Move to next focusable element
- **Shift+Tab**: Move to previous focusable element
- **ESC**: Close dialog (if enabled)

### Multiple Dialogs

Multiple dialogs can be open at the same time:

```javascript
// Each new dialog stacks on top
DialogManager.alert('First dialog');
DialogManager.confirm('Second dialog');
DialogManager.prompt('Third dialog');

// Bring specific dialog to front
DialogManager.bringToFront(dialog);
```

### Accessibility

- ARIA attributes (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`)
- Focus management (remember previous focus, restore on close)
- Keyboard navigation (ESC to close, Tab trap)
- Screen reader friendly

## Files

| File | Description |
|------|-------------|
| `index.html` | หน้าแสดงตัวอย่าง DialogManager ทุกรูปแบบ |
| `main.js` | การตั้งค่า Now.js และ dialog demonstrations |
| `styles.css` | Custom styles สำหรับ dialogs |

## Dependencies

- Now.js Framework (`now.core.min.css`, `now.core.min.js`)
- DialogManager.js
- BackdropManager.js

## Live Demo

เปิดไฟล์ `index.html` ในเบราว์เซอร์เพื่อดูตัวอย่างการใช้งาน

## Tips

1. **ใช้ async/await** - Methods ทั้งหมดคืนค่า Promise สามารถใช้ async/await ได้
2. **Sanitize HTML** - ถ้ามี DOMPurify จะทำ sanitize HTML อัตโนมัติ
3. **Custom Templates** - สร้าง template ของตัวเองได้โดยใช้ `state.templates.set()`
4. **Event Handlers** - ใช้ `onShow` และ `onClose` callbacks หรือ addEventListener
5. **Cleanup** - DialogManager จัดการ cleanup อัตโนมัติเมื่อปิด dialog
