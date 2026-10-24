# NotificationManager Example

ตัวอย่างการใช้งาน NotificationManager (Toast Notifications) ใน Now.js Framework

## Features

- **Multiple Types** - success, error, warning, info, loading
- **Smart Auto-dismiss** - ระยะเวลาแสดงผลที่เหมาะสมตามประเภท
- **Smart Replacement** - แทนที่ notification ประเภทเดียวกันอัตโนมัติ
- **Progress Bar** - แสดง progress bar countdown
- **Position Control** - เลือกตำแหน่งแสดงผล 4 มุม
- **Loading State** - สำหรับ async operations

## Usage

### Basic Notifications

```javascript
// Success - auto-dismiss 3 seconds
NotificationManager.success('Data saved successfully!');

// Error - auto-dismiss 8 seconds
NotificationManager.error('An error occurred');

// Warning - auto-dismiss 8 seconds
NotificationManager.warning('You have unsaved changes');

// Info - auto-dismiss 3 seconds
NotificationManager.info('You have 3 new messages');
```

### Loading State

```javascript
async function saveData() {
  // Show loading (no auto-dismiss)
  const loadingId = NotificationManager.loading('Saving...');

  try {
    await api.save(data);

    // Dismiss loading
    NotificationManager.dismiss(loadingId);

    // Show success
    NotificationManager.success('Saved successfully!');
  } catch (error) {
    NotificationManager.dismiss(loadingId);
    NotificationManager.error(error.message);
  }
}
```

### Custom Duration & Progress Bar

```javascript
// Short duration
NotificationManager.success('Saved', { duration: 2000 });

// Long duration
NotificationManager.success('10 files uploaded', { duration: 10000 });

// With progress bar
NotificationManager.success('Upload complete!', {
  duration: 5000,
  progressBar: true
});

// Permanent (must close manually)
NotificationManager.error('Critical error', { duration: 0 });
```

### Position Control

```javascript
// Change position globally
NotificationManager.setPosition('top-left');
NotificationManager.setPosition('top-right');
NotificationManager.setPosition('bottom-left');
NotificationManager.setPosition('bottom-right');

// Or via init
await Now.init({
  notification: {
    position: 'top-left'
  }
});
```

### Clear All

```javascript
// Clear all visible notifications
NotificationManager.clear();
```

## Default Durations

| Type | Duration | Reason |
|------|----------|--------|
| `success` | 3000ms (3s) | Confirms action, no further action needed |
| `error` | 8000ms (8s) | More time to read and understand |
| `warning` | 8000ms (8s) | Important information to notice |
| `info` | 3000ms (3s) | General info, not critical |
| `loading` | 0 (permanent) | Shows ongoing operation status |

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | number | varies | ระยะเวลาแสดง (ms), 0 = ไม่ปิดอัตโนมัติ |
| `progressBar` | boolean | false | แสดง progress bar |
| `position` | string | 'top-right' | ตำแหน่งแสดงผล |

## Smart Replacement

ระบบจะแทนที่ notification ประเภทเดียวกันอัตโนมัติเพื่อป้องกันการแสดงซ้ำซ้อน:

```javascript
NotificationManager.error('Error 1');
NotificationManager.error('Error 2'); // แทนที่ Error 1
NotificationManager.error('Error 3'); // แทนที่ Error 2
// ผลลัพธ์: แสดงเฉพาะ "Error 3"
```

## Files

| File | Description |
|------|-------------|
| `index.html` | หน้าแสดงตัวอย่าง Notification ทุกรูปแบบ |
| `main.js` | Demo functions และการตั้งค่า |
| `styles.css` | Custom styles สำหรับ demo |

## Dependencies

- Now.js Framework (`now.core.min.css`, `now.core.min.js`)
- NotificationManager (built-in)

## Live Demo

เปิดไฟล์ `index.html` ในเบราว์เซอร์เพื่อดูตัวอย่างการใช้งาน
