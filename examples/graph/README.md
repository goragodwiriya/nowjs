# Graph Component Example

ตัวอย่างการใช้งาน GraphComponent ใน Now.js Framework — กราฟ SVG 5 แบบ ไม่ต้องเขียน JavaScript เลยก็ใช้ได้

## Features

- **5 Chart Types** - Line, Bar, Pie, Donut, Gauge วาดด้วย SVG
- **Zero Configuration** - เพิ่ม `data-component="graph"` แล้วใช้งานได้ทันที
- **Multiple Data Sources** - Inline data (`data-props`), HTML table (`data-table`) หรือ API (`data-url`)
- **Auto Refresh** - Polling ตามเวลา และ refresh ด้วย EventManager event
- **Responsive** - วาดใหม่อัตโนมัติเมื่อ container เปลี่ยนขนาด
- **Export** - บันทึกกราฟเป็นไฟล์ PNG, JPEG หรือ SVG
- **Interactive** - Tooltips, legends และ click handlers
- **Event System** - Event ครบวงจรผ่าน DOM events และ EventManager

## Bundle

GraphComponent อยู่ใน bundle แยกต่างหาก (ไม่ได้อยู่ใน core) ต้องโหลดหลัง core:

```html
<script src="../Now/dist/now.core.min.js"></script>
<script src="../Now/dist/now.graph.min.js"></script>
```

## Usage

### Line Chart (Inline Data)

```html
<div data-component="graph"
     data-props='{
       "type": "line",
       "curve": true,
       "fillArea": true,
       "data": [
         {"name": "2025", "color": "#3b82f6", "data": [
           {"label": "Jan", "value": 65}, {"label": "Feb", "value": 59}
         ]}
       ]
     }'
     style="height: 320px;">
</div>
```

### Bar Chart จาก HTML Table

```html
<table id="quarterly-table">
  <thead>
    <tr><th></th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr>
  </thead>
  <tbody>
    <tr><th>Sales</th><td>120</td><td>150</td><td>135</td><td>180</td></tr>
    <tr><th>Expenses</th><td>80</td><td>90</td><td>85</td><td>95</td></tr>
  </tbody>
</table>

<div data-component="graph"
     data-type="bar"
     data-table="quarterly-table"
     style="height: 320px;">
</div>
```

### โหลดจาก API + Polling

```html
<!-- โหลดครั้งเดียว -->
<div data-component="graph"
     data-type="line"
     data-url="api/sales.php"
     style="height: 320px;">
</div>

<!-- โหลดใหม่อัตโนมัติทุก 5 วินาที -->
<div data-component="graph"
     data-type="bar"
     data-url="api/sales.php"
     data-polling-interval="5000"
     style="height: 320px;">
</div>

<!-- Refresh พร้อมกันด้วย EventManager event -->
<div data-component="graph"
     data-url="api/sales.php"
     data-refresh-event="graph:refresh-demo">
</div>
<script>
  EventManager.emit('graph:refresh-demo');
</script>
```

### Donut / Gauge

```html
<div data-component="graph"
     data-type="donut"
     data-donut-thickness="40"
     data-center-text="Budget"
     data-props='{...}'>
</div>

<div data-component="graph"
     data-type="gauge"
     data-max-gauge-value="100"
     data-props='{"data": [{"name": "Score", "data": [{"label": "Performance", "value": 78}]}]}'>
</div>
```

### JavaScript API

```javascript
// สร้างจาก JavaScript ทั้งหมด
const instance = await GraphComponent.create('#my-graph', {
  type: 'line',
  animation: true,
  data: [{name: 'Sales', data: [{label: 'Jan', value: 100}]}],
  onClick(dataPoint, seriesIndex) { /* ... */ }
});

// เปลี่ยนข้อมูล / เพิ่มจุดข้อมูล / เปลี่ยนชนิดกราฟ
instance.setData(newData);
instance.addDataPoint({label: 'Feb', value: 120}, 0);
instance.setType('bar');

// Export เป็นรูปภาพ
instance.exportToImage('my-chart', 'png');

// ดึง instance จาก element ที่ประกาศผ่าน HTML
const fromHtml = GraphComponent.getInstance(document.querySelector('#url-graph'));
```

### Events

```javascript
element.addEventListener('graph:loaded', e => console.log(e.detail.data));
element.addEventListener('graph:data-changed', e => console.log(e.detail.data));
element.addEventListener('graph:type-changed', e => console.log(e.detail.type));
element.addEventListener('graph:error', e => console.error(e.detail.error));

// หรือผ่าน EventManager
EventManager.on('graph:loaded', payload => console.log(payload.data));
```

## Data Format

รูปแบบมาตรฐานคือ array ของ series:

```javascript
[
  {
    name: 'Sales',
    data: [
      {label: 'Q1', value: 100},
      {label: 'Q2', value: 120}
    ]
  }
]
```

- **Pie/Donut** ใช้ series แรกเท่านั้น
- **Gauge** ใช้ series แรก จุดเดียว (`data[0].data[0].value` เทียบกับ `maxGaugeValue`)
- **HTML table** คอลัมน์แรกเป็น label, แถวแรกเป็นชื่อ series, `th` แรกของแถวเป็นชื่อ series

## Files

| File | Description |
|------|-------------|
| `index.html` | หน้าแสดงตัวอย่าง Graph ทุกความสามารถ พร้อมโค้ดประกอบทุกตัวอย่าง |
| `main.js` | การตั้งค่า Now.js Framework + JavaScript API playground + event log |
| `styles.css` | Custom styles สำหรับ chart containers (รองรับ dark mode) |
| `api/sales.php` | API endpoint ส่งข้อมูลแบบสุ่ม สำหรับ demo data-url / polling |

## Dependencies

- Now.js Framework (`now.core.min.css`, `now.core.min.js`)
- GraphComponent bundle (`now.graph.min.js`)
- PHP (สำหรับ `api/sales.php` เท่านั้น)

## Live Demo

เปิดไฟล์ `index.html` ในเบราว์เซอร์เพื่อดูตัวอย่างการใช้งาน
