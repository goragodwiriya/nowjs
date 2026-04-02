# HierarchicalTextFactory Example - Cascading Address Selection

ตัวอย่างการใช้งาน HierarchicalTextFactory สำหรับสร้างฟอร์มที่อยู่แบบ Cascading (จังหวัด → อำเภอ → ตำบล)

## 📁 Files Structure

```
hierarchical-address/
├── index.html              # Main example page
├── main.js                 # JavaScript initialization
├── styles.css              # Custom styles
├── address.json            # Hierarchical address data
├── save-address.php        # Form submit handler
├── templates/
│   └── address-result.html # Result template
└── README.md               # Documentation
```

## 🚀 Quick Start

### 1. Basic HTML Setup

```html
<!-- Form must have data-form attribute for FormManager to enhance inputs -->
<form data-form="addressForm" data-validate="true" data-csrf="false">

  <!-- Province Input (first level - includes data source) -->
  <input type="text"
         name="province"
         data-hierarchy="province"
         data-source="address.json"
         autocomplete="off"
         placeholder="จังหวัด">

  <!-- District Input (second level) -->
  <input type="text"
         name="district"
         data-hierarchy="district"
         autocomplete="off"
         placeholder="อำเภอ/เขต">

  <!-- Subdistrict Input (third level) -->
  <input type="text"
         name="subdistrict"
         data-hierarchy="subdistrict"
         autocomplete="off"
         placeholder="ตำบล/แขวง">

</form>
```

### 2. JavaScript Initialization

No manual initialization required! HierarchicalTextFactory automatically registers inputs with `data-hierarchy` attribute when FormManager enhances the form.

```javascript
// Now.js handles everything automatically
await Now.init({
  environment: 'production'
});
```

## ⚙️ Configuration Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `data-hierarchy` | string | Yes | Level in hierarchy: `province`, `district`, or `subdistrict` |
| `data-source` | string | First input only | URL to JSON data or global variable name |
| `data-form` | string | On form | Required for FormManager to enhance inputs |
| `autocomplete` | string | Recommended | Set to `"off"` to prevent browser autocomplete |

## 🎯 Features

### 1. Forward Cascading
เมื่อเลือกจังหวัด → แสดงเฉพาะอำเภอในจังหวัดนั้น → แสดงเฉพาะตำบลในอำเภอนั้น

### 2. Reverse Search
พิมพ์ชื่อตำบล → ระบบจะ auto-fill อำเภอและจังหวัดให้อัตโนมัติ (เมื่อพบผลลัพธ์เดียว)

### 3. Clear Cascade
เมื่อเปลี่ยนจังหวัด → ล้างค่าอำเภอและตำบลที่เลือกไว้

### 4. Autocomplete Dropdown
- แสดง dropdown เมื่อ focus หรือพิมพ์
- กรองผลลัพธ์แบบ regex search
- Keyboard navigation (Arrow Up/Down, Enter, Escape)

### 5. Multiple Forms Support
- แต่ละ form จะมี group แยกกัน
- สามารถมีหลาย form ในหน้าเดียวกันได้
- ข้อมูลที่โหลดจะ share ระหว่าง groups

## 📝 Data Structure

### JSON Format (Nested Object)

```json
{
  "กรุงเทพมหานคร": {
    "เขตพระนคร": {
      "100101": "แขวงพระบรมมหาราชวัง",
      "100102": "แขวงวังบูรพาภิรมย์",
      "100103": "แขวงวัดราชบพิธ"
    },
    "เขตดุสิต": {
      "100201": "แขวงดุสิต",
      "100202": "แขวงวชิรพยาบาล"
    }
  },
  "นนทบุรี": {
    "อำเภอเมืองนนทบุรี": {
      "120101": "ตำบลสวนใหญ่",
      "120102": "ตำบลตลาดขวัญ"
    }
  }
}
```

Structure: `Province → District → { ZipCode: SubdistrictName }`

## 🔗 Integration with FormManager

```html
<form data-form="addressForm"
      data-validate="true"
      data-csrf="false"
      data-ajax-submit="true"
      action="save-address.php">
    <!-- Address inputs with data-hierarchy -->
    <button type="submit">Save Address</button>
</form>
```

### API Response Format

```json
{
    "status": 200,
    "success": true,
    "data": {
        "province": "กรุงเทพมหานคร",
        "district": "เขตพระนคร",
        "subdistrict": "แขวงพระบรมมหาราชวัง",
        "zipcode": "10200",
        "actions": [
            {
                "type": "notification",
                "message": "บันทึกที่อยู่สำเร็จ",
                "notificationType": "success"
            },
            {
                "type": "render",
                "target": "#address-output",
                "template": "address-result.html"
            }
        ]
    }
}
```

## 🎨 Styling

Custom CSS classes for hierarchical inputs:

```css
/* Autocomplete dropdown */
.now-dropdown { /* dropdown container */ }
.now-dropdown-item { /* dropdown item */ }
.now-dropdown-item.selected { /* selected/hover item */ }

/* Input wrapper */
.now-text-wrapper { /* wrapper around input */ }
```

## 🔧 Advanced Usage

### Loading from Global Variable

```html
<script>
// Pre-load address data
window.thaiAddressData = {
  "กรุงเทพมหานคร": { ... },
  "นนทบุรี": { ... }
};
</script>

<input type="text" name="province"
       data-hierarchy="province"
       data-source="thaiAddressData"
       placeholder="จังหวัด">
```

### Programmatic Access

```javascript
// Get instance by input element
const provinceInput = document.querySelector('[data-hierarchy="province"]');
const instance = ElementManager.getInstanceByElement(provinceInput);

// Get selected value
console.log(instance.selectedValue);

// Get element value
console.log(instance.element.value);
```

## 📚 Related Documentation

- [TextElementFactory](/docs/en/TextElementFactory.md)
- [ElementManager](/docs/en/ElementManager.md)
- [FormManager](/docs/en/FormManager.md)

## 🐛 Troubleshooting

### Dropdown not showing
1. Check if `data-hierarchy` attribute is set
2. Ensure form has `data-form` attribute
3. Verify JSON data file is accessible
4. Check browser console for errors

### Cascading not working
1. Ensure all hierarchical inputs are in the same form
2. Check that `data-hierarchy` values are: `province`, `district`, `subdistrict`
3. Verify JSON data structure matches the nested format

### Multiple forms not working
1. Each form must have unique `data-form` value
2. First input in each form should have `data-source`

### Values not clearing
1. HierarchicalTextFactory auto-clears child levels when parent changes
2. Check browser console for JavaScript errors
