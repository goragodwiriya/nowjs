# EventCalendar Example

ตัวอย่างการใช้งาน EventCalendar Component ใน Now.js Framework

## Features

ตัวอย่างนี้แสดงการใช้งาน EventCalendar:

- **Multi-Day Events** - Event ที่กินเวลาหลายวัน
- **Month/Week/Day Views** - สลับมุมมองได้
- **Locale Support** - รองรับภาษาไทยและอังกฤษ
- **API Integration** - โหลด events จาก API
- **Programmatic Control** - ควบคุมผ่าน JavaScript
- **Event Callbacks** - รับ events เมื่อ click/navigate

## Usage

### 1. Basic Calendar (HTML)

```html
<div id="my-calendar"
     data-event-calendar
     data-view="month"
     data-locale="th"
     data-first-day="0">
</div>
```

### 2. API Integration

```html
<div id="api-calendar"
     data-event-calendar
     data-view="month"
     data-api="api/events.php"
     data-show-view-switcher="true"
     data-views="month,week,day">
</div>
```

### 3. JavaScript Initialization

```javascript
// Create calendar
const calendar = EventCalendar.create('#my-calendar', {
  defaultView: 'month',
  locale: 'th',
  showViewSwitcher: true,
  onDateClick: (date, instance) => {
    console.log('Date clicked:', date);
  },
  onEventClick: (event, instance) => {
    console.log('Event clicked:', event);
  }
});

// Set events
EventCalendar.setEvents(calendar, [
  {
    id: 'evt-1',
    title: 'Holiday Trip 🏖️',
    start: new Date(2024, 0, 15),
    end: new Date(2024, 0, 22),
    color: '#4CAF50',
    allDay: true,
    description: 'Family vacation'
  }
]);
```

## Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-event-calendar` | ระบุว่าเป็น calendar (required) |
| `data-view` | มุมมองเริ่มต้น: `month`, `week`, `day` |
| `data-locale` | ภาษา: `th`, `en` |
| `data-first-day` | วันเริ่มต้นสัปดาห์: `0`=อาทิตย์, `1`=จันทร์ |
| `data-api` | URL สำหรับโหลด events |
| `data-show-view-switcher` | แสดงปุ่มสลับมุมมอง |
| `data-views` | มุมมองที่แสดงใน switcher |

## Event Object

```javascript
{
  id: 'unique-id',        // รหัส event
  title: 'Event Title',   // ชื่อ event
  start: new Date(),      // วันเริ่มต้น
  end: new Date(),        // วันสิ้นสุด
  color: '#4CAF50',       // สี (hex)
  allDay: true,           // event ตลอดวัน
  description: 'Details'  // รายละเอียด (optional)
}
```

## JavaScript API

```javascript
// Create calendar
const calendar = EventCalendar.create('#calendar', options);

// Set events
EventCalendar.setEvents(calendar, eventsArray);

// Add single event
EventCalendar.addEvent(calendar, eventObject);

// Get all events
const events = EventCalendar.getEvents(calendar);

// Navigation
EventCalendar.goToToday(calendar);
EventCalendar.navigate(calendar, 1);   // next period (month/week/day of the current view)
EventCalendar.navigate(calendar, -1);  // previous period

// Change view
EventCalendar.changeView(calendar, 'week');

// Destroy calendar
EventCalendar.destroy(calendar);
```

## Options

```javascript
EventCalendar.create('#calendar', {
  defaultView: 'month',        // มุมมองเริ่มต้น
  locale: 'th',                // ภาษา
  firstDay: 0,                 // วันเริ่มต้นสัปดาห์
  showViewSwitcher: true,      // แสดง view switcher
  views: ['month', 'week', 'day'],

  // Callbacks
  onDateClick: (date, instance) => {},
  onEventClick: (event, instance) => {},
  onNavigate: (date, instance) => {},
  onViewChange: (view, instance) => {}
});
```

## Events

```javascript
// Date clicked
document.addEventListener('eventcalendar:dateClick', (e) => {
  const { date, calendarId } = e.detail;
});

// Event clicked
document.addEventListener('eventcalendar:eventClick', (e) => {
  const { event, calendarId } = e.detail;
});

// Navigation
document.addEventListener('eventcalendar:navigate', (e) => {
  const { date, calendarId } = e.detail;
});

// View changed
document.addEventListener('eventcalendar:viewChange', (e) => {
  const { view, calendarId } = e.detail;
});
```

## API Response Format

```json
{
  "success": true,
  "data": [
    {
      "id": "evt-1",
      "title": "Meeting",
      "start": "2024-01-15T09:00:00",
      "end": "2024-01-15T10:30:00",
      "color": "#2196F3",
      "allDay": false
    }
  ]
}
```

## File Structure

```
event-calendar/
├── index.html      # ตัวอย่างทั้งหมด
├── main.js         # JavaScript initialization
├── styles.css      # Custom styles
└── api/            # Mock API endpoints
```

## Dependencies

- `Now.js Framework` - Core framework
- `EventCalendar` - Calendar component
- `eventcalendar.min.css` - Calendar styles
