# Cascading Select Example

This example demonstrates **cascading dropdown selects** using the Now.js framework's `CascadingSelectManager`. Cascading selects are commonly used for address selection (Province → District → Subdistrict) or hierarchical category selection.

## Features

- **Auto-Discovery**: Just add data attributes - FormManager auto-initializes cascading relationships
- **No JavaScript Required**: Works with `data-form` and data attributes only
- **Dynamic Option Loading**: Load options from API on demand
- **Parent-Child Relationships**: Child select depends on parent selection
- **Auto-Clear Descendants**: Changing parent clears all descendant selects
- **Disabled State Management**: Child selects are disabled until parent is selected
- **Single API Endpoint**: One URL handles all cascade levels

## Quick Start (Data Attributes Only)

### HTML Structure

```html
<form data-form="addressForm" data-validate="true" data-csrf="false">
  <!-- Province (root) - has cascade URL -->
  <select name="province"
          data-cascade-url="get-address.php"
          data-cascade-method="GET">
    <option value="" disabled selected>-- เลือกจังหวัด --</option>
    <option value="10">กรุงเทพมหานคร</option>
    <option value="11">สมุทรปราการ</option>
  </select>

  <!-- District (child of province) -->
  <select name="district" data-cascade-parent="province">
    <option value="" disabled selected>-- เลือกอำเภอ --</option>
  </select>

  <!-- Subdistrict (child of district) -->
  <select name="subdistrict" data-cascade-parent="district">
    <option value="" disabled selected>-- เลือกตำบล --</option>
  </select>
</form>
```

**That's it!** No JavaScript setup required. FormManager automatically discovers and initializes cascading relationships.

### Data Attributes Reference

| Attribute | Location | Description |
|-----------|----------|-------------|
| `data-cascade-url` | Root or any select | API endpoint URL |
| `data-cascade-method` | Root or any select | HTTP method: `GET` or `POST` (default: POST) |
| `data-cascade-parent` | Child selects | Name of parent select element |
| `data-cascade-group` | All selects | Group identifier for complex relationships |

### How Auto-Discovery Works

1. When `data-form` is processed, FormManager initializes the form
2. After form elements init, `CascadingSelectManager.initInContainer()` is called
3. It finds all selects with `data-cascade-parent` attribute
4. Builds parent → child → grandchild chains automatically
5. Inherits `data-cascade-url` from root parent if not specified on child
6. Sets up change event listeners on all parents

### API Request Format

CascadingSelectManager sends all previous select values plus a `target` parameter:

```
GET get-address.php?province=10&target=district
GET get-address.php?province=10&district=1001&target=subdistrict
```

### API Response Format

Return a simple array of options:

```json
[
  {"value": "1001", "text": "เขตพระนคร"},
  {"value": "1002", "text": "เขตดุสิต"},
  {"value": "1003", "text": "เขตหนองจอก"}
]
```

Or an object keyed by select ID/name:

```json
{
  "district": [
    {"value": "1001", "text": "เขตพระนคร"},
    {"value": "1002", "text": "เขตดุสิต"}
  ]
}
```

## Files Structure

```
examples/cascading-select/
├── index.html          # Main demo page
├── main.js             # Minimal app initialization (no cascading setup needed!)
├── styles.css          # Custom styles
├── get-address.php     # Single API endpoint for all cascade levels
├── save-address.php    # API: Save address form
├── README.md           # This file
```

## JavaScript API (Optional)

For advanced use cases, you can programmatically control cascading selects:

```javascript
// Create cascade group manually
CascadingSelectManager.create({
  selects: [
    { element: '#province', children: ['#district'] },
    { element: '#district', children: ['#subdistrict'] }
  ],
  url: 'get-address.php',
  method: 'GET'
});

// Get instance and trigger reload
const manager = CascadingSelectManager.getInstance('province');
manager.triggerChange();

// Initialize in specific container
CascadingSelectManager.initInContainer(document.querySelector('.my-form'));
```

## Events

CascadingSelectManager emits these events:

| Event | Description |
|-------|-------------|
| `cascade:change` | When any select value changes |
| `cascade:loaded` | When options are loaded for a select |
| `cascade:clear` | When a select is cleared |
| `cascade:error` | When an error occurs loading options |

```javascript
document.addEventListener('cascade:loaded', (e) => {
  console.log('Options loaded for:', e.detail.element.name);
  console.log('Options:', e.detail.options);
});
```

## Comparison: Cascading Select vs Hierarchical Text

| Feature | Cascading Select | Hierarchical Text |
|---------|------------------|-------------------|
| Input Type | Native `<select>` dropdowns | Text inputs with autocomplete |
| Data Loading | Load per-level from API | Load all data once |
| Search | Select from list | Type to search (reverse lookup) |
| Best For | Strict selection, large datasets | Quick input, known values |
| User Experience | Clear hierarchy, step-by-step | Fast typing, flexible |

## Running the Example

1. Start a local PHP server:
   ```bash
   cd examples/cascading-select
   php -S localhost:8000
   ```

2. Open in browser:
   ```
   http://localhost:8000/index.html
   ```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Related Examples

- [Hierarchical Address](../hierarchical-address/) - Text-based hierarchical input
- [Multi-Select](../multi-select/) - Multiple selection with tags
- [Form](../form/) - Basic form handling
