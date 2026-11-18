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
       data-action-url="api/action.php"
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

// Read the rows back (the instance holds them)
const table = TableManager.state.tables.get('table-id');
const allData = table.data;
const filteredData = TableManager.filterData(table, table.data);
const selectedIds = TableManager.getSelectedRowIds(table);

// Reload table
TableManager.loadTableData('table-id');

// Export data (client-side: the rows that pass the filters in use, in the current sort order)
TableManager.exportData('table-id', 'csv', {
  filename: 'export.csv'
});

// Row sorting
TableManager.enableRowSort('table-id');
TableManager.disableRowSort('table-id');
```

## Events

TableManager ส่ง event ผ่าน `EventManager` ไม่ได้ dispatch เป็น DOM event
จึงต้องรับด้วย `EventManager.on()` ไม่ใช่ `document.addEventListener()`
callback ได้ event object ข้อมูลอยู่ใน `.data` (`({data}) => data.tableId`)

```javascript
// เรนเดอร์เสร็จ ครอบคลุมทั้งโหลดใหม่ เรียงลำดับ กรอง และเปลี่ยนหน้า
EventManager.on('table:render', ({data: {tableId, data, totalRecords, filteredRecords, isServerSide}}) => {
});

// โหลดข้อมูลใหม่อัตโนมัติแต่ละรอบ
EventManager.on('table:refreshed', ({data: {tableId, automatic, timestamp}}) => {
});

// เลือกหรือยกเลิกเลือกแถว
EventManager.on('table:selectionChange', ({data: {tableId, selectedRows}}) => {
});

// แก้ค่าในเซลล์ที่แก้ไขได้
EventManager.on('table:fieldChange', ({data: {tableId, field, value, rowData, element}}) => {
});

// ส่ง action ไป endpoint แล้วได้ผลกลับ
EventManager.on('table:action', ({data: {tableId, action, success, response, timestamp}}) => {
});

// เกิดข้อผิดพลาดระหว่างทำ action
EventManager.on('table:error', ({data: {tableId, action, error, timestamp}}) => {
});
```

รายชื่อ event ครบทั้ง 17 ตัวอยู่ใน [เอกสาร TableManager](../../docs/th/TableManager.md#เหตุการณ์)

## API Response Format

### Standard Response (server-side table)

```json
{
  "success": true,
  "code": 200,
  "data": {
    "data": [{"id": 1, "name": "John", "status": 1}],
    "meta": {"page": 1, "pageSize": 10, "total": 100, "totalPages": 10},
    "filters": {"status": [{"value": "1", "text": "Active", "count": 40}]},
    "options": {"status": {"1": "Active"}},
    "columnGroups": {"months": [{"id": 1, "topic": "Jan"}]}
  }
}
```

`filters` = options of the column filters (a `count` shows on a tabs filter) · `options` = lookups and anything a `data-load-target` binds · `columnGroups` = lists that repeat a `data-column-group` header.

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
├── templates/      # Modal templates opened by api/action.php (user-detail, user-edit)
├── api/            # Mock API endpoints (no database)
│   ├── _common.php   # respond(), requestData(), tableQuery() (search/filter/sort/page), sendExport() (csv with BOM, json, real .xlsx)
│   ├── users.php     # Example 4 (api/v1/users): server-side paging, filters; ?format=csv|excel|json = export (data-export-url)
│   ├── sort.php      # Example 10: data-sort-url, receives {order: [{id, position}]}
│   ├── action.php    # data-action-url: row actions {action, id, row} and bulk {action, ids}
│   ├── export.php    # data-filter-actions: POST counts matches, GET downloads CSV
│   ├── orders.php    # Example 13: tabs with counts, select, date range, number filter, summary
│   └── sales.php     # Example 14: columnGroups per quarter
└── data/           # Sample JSON data
```

Every endpoint answers `{success, message, code, data, errors}` with the matching HTTP status (400 / 404 / 405 / 422).

## Dependencies

- `Now.js Framework` - Core framework
- `TableManager` - Table component
- `ElementManager` - Input/Select elements (optional)
- `Sortable` - Row drag support (optional)
