# TableManager Example

ตัวอย่างการใช้งาน TableManager Component ใน Now.js Framework

## Features

ตัวอย่างนี้แสดงการใช้งาน TableManager หลากหลายรูปแบบ:

- **Basic Table** - Sorting และ Filtering พร้อม Pagination
- **Checkboxes & Bulk Actions** - เลือกหลายแถวและทำ actions พร้อมกัน
- **Row Actions** - Dropdown menu สำหรับ actions ในแต่ละแถว
- **Server-Side Pagination** - โหลดข้อมูลจาก API พร้อม pagination
- **Date/Number Formatting** - จัดรูปแบบวันที่และตัวเลข
- **Footer Aggregates** - แสดงผลรวม, ค่าเฉลี่ย, การนับ
- **Client-Side Data** - จัดการข้อมูลฝั่ง client
- **Export Data** - Export เป็น CSV, Excel, JSON
- **Filter Actions** - ปุ่มที่ส่ง filter params ไปยัง API
- **Row Drag & Drop** - ลากแถวเพื่อเรียงลำดับ
- **Cell Elements** - Input/Select ในเซลล์
- **Dynamic Columns** - สร้าง columns อัตโนมัติจาก API

## Usage

### 1. Basic Table

```html
<table data-table="my-table"
       data-source="api/users"
       data-page-size="10">
  <thead>
    <tr>
      <th data-field="id" data-sort="id">ID</th>
      <th data-field="name" data-sort="name" data-filter="true">Name</th>
      <th data-field="status" data-format="lookup"
          data-filter="true" data-type="select"
          data-options='{"1":"Active","2":"Inactive"}'>Status</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>
```

### 2. Checkboxes & Bulk Actions

```html
<table data-table="bulk-table"
       data-source="api/users"
       data-show-checkbox="true"
       data-actions='{"delete":"Delete","activate":"Activate"}'
       data-action-url="api/bulk-action"
       data-action-button="Process Selected">
  <!-- thead/tbody -->
</table>
```

### 3. Row Actions with Dropdown

```html
<table data-table="actions-table"
       data-row-actions='{
         "view": {
           "label": "View",
           "className": "btn btn-info"
         },
         "actions": {
           "label": "Actions",
           "className": "btn btn-primary dropdown",
           "submenu": {
             "edit": {"label": "Edit", "className": "icon-edit"},
             "delete": {"label": "Delete", "className": "color-red"}
           }
         }
       }'>
  <!-- thead/tbody -->
</table>
```

### 4. Footer Aggregates

```html
<table data-table="footer-table"
       data-show-footer="true"
       data-footer-aggregates='{"salary":"sum","id":"count"}'>
  <!-- thead/tbody -->
  <tfoot></tfoot>
</table>
```

### 5. Dynamic Columns

```html
<table data-table="dynamic-table"
       data-source="api/languages"
       data-dynamic-columns="true">
  <!-- NO thead needed - generated from API response -->
  <tbody></tbody>
</table>
```

## Data Attributes

### Table Attributes

| Attribute | Description |
|-----------|-------------|
| `data-table` | Table ID (required) |
| `data-source` | API URL หรือ JSON file |
| `data-page-size` | จำนวนแถวต่อหน้า |
| `data-show-checkbox` | แสดง checkboxes |
| `data-show-footer` | แสดง footer |
| `data-editable-rows` | เปิดโหมดแก้ไขแถว |
| `data-row-sortable` | เปิดลากแถวเรียงลำดับ |
| `data-dynamic-columns` | สร้าง columns จาก API |
| `data-url-params` | บันทึก state ลง URL |

### Column Attributes

| Attribute | Description |
|-----------|-------------|
| `data-field` | ชื่อ field ในข้อมูล |
| `data-sort` | เปิด sorting (ระบุ field name) |
| `data-filter` | เปิด filtering |
| `data-type` | ประเภท filter: `text`, `select` |
| `data-format` | รูปแบบข้อมูล: `lookup`, `date`, `datetime`, `number` |
| `data-options` | JSON object สำหรับ lookup |
| `data-cell-element` | สร้าง input/select ในเซลล์ |

### Actions Attributes

| Attribute | Description |
|-----------|-------------|
| `data-actions` | Bulk actions สำหรับ checkboxes |
| `data-action-url` | API URL สำหรับ bulk actions |
| `data-row-actions` | Row-level actions (buttons/dropdown) |
| `data-filter-actions` | ปุ่มที่ส่ง filter params |

## JavaScript API

```javascript
// Initialize TableManager
await TableManager.init({
  urlParams: true,
  pageSizes: [10, 25, 50, 100],
  showCaption: true
});

// Set client-side data
TableManager.setData('table-id', dataArray);

// Get data
const allData = TableManager.getData('table-id');
const filteredData = TableManager.getData('table-id', true);

// Reload table
TableManager.loadTableData('table-id');

// Export data
TableManager.exportData('table-id', 'csv', {
  filename: 'export.csv',
  filtered: true
});

// Row sorting
TableManager.enableRowSort('table-id');
TableManager.disableRowSort('table-id');
```

## Events

```javascript
// Table loaded
document.addEventListener('table:loaded', (e) => {
  const { tableId, data, meta } = e.detail;
});

// Sorted
document.addEventListener('table:sorted', (e) => {
  const { tableId, field, direction } = e.detail;
});

// Filtered
document.addEventListener('table:filtered', (e) => {
  const { tableId, filters } = e.detail;
});

// Page changed
document.addEventListener('table:page-changed', (e) => {
  const { tableId, page, pageSize } = e.detail;
});

// Selection changed
document.addEventListener('table:selection-changed', (e) => {
  const { tableId, selected, count } = e.detail;
});

// Bulk action complete
document.addEventListener('table:action-complete', (e) => {
  const { tableId, action, items, response } = e.detail;
});
```

## API Response Format

### Standard Response

```json
{
  "success": true,
  "data": [
    {"id": 1, "name": "John", "status": 1}
  ],
  "meta": {
    "total": 100,
    "totalPages": 10,
    "currentPage": 1,
    "pageSize": 10
  }
}
```

### Dynamic Columns Response

```json
{
  "columns": [
    {"field": "id", "label": "ID", "sort": "id"},
    {"field": "name", "label": "Name", "sort": "name", "searchable": true}
  ],
  "data": [
    {"id": 1, "name": "John"}
  ]
}
```

## File Structure

```
data-table/
├── index.html      # ตัวอย่างทั้งหมด
├── main.js         # JavaScript initialization
├── styles.css      # Custom styles
├── api/            # Mock API endpoints
└── data/           # Sample JSON data
```

## Dependencies

- `Now.js Framework` - Core framework
- `TableManager` - Table component
- `ElementManager` - Input/Select elements (optional)
- `Sortable` - Row drag support (optional)
