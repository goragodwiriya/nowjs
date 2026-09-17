# Multi Select Example - Now.js Framework

This example demonstrates the MultiSelectElementFactory functionality in Now.js, including custom UI, keyboard navigation, form integration, and dynamic options loading.

## 🎯 Features

- **Custom UI**: Beautiful dropdown with check/uncheck icons
- **Keyboard Navigation**: Full keyboard support (Arrow keys, Space, Tab, Escape)
- **Accessible**: ARIA attributes for screen readers
- **Smart Display**: Shows selected items with "+n items" overflow
- **Form Integration**: Seamless integration with FormManager
- **Dynamic Options**: Load options from API or JavaScript

## 📁 File Structure

```
multi-select/
├── index.html              # Main example page with documentation
├── main.js                 # Application initialization
├── styles.css              # Custom styles for the example
├── get-options.php         # API endpoint to load dropdown options
├── save-address.php        # API endpoint to process form submission
├── README.md               # This file
└── templates/
    └── address-result.html # Template for displaying submission results
```

## 🚀 Quick Start

### Basic Multi Select

```html
<select name="colors" multiple data-placeholder="Select colors...">
  <option value="red">Red</option>
  <option value="green">Green</option>
  <option value="blue">Blue</option>
</select>
```

### With Form Validation

```html
<form data-form="myForm" data-validate="true">
  <select name="categories" multiple required
          data-placeholder="Choose categories...">
    <option value="tech">Technology</option>
    <option value="health">Health</option>
    <option value="sports">Sports</option>
  </select>
  <button type="submit">Submit</button>
</form>
```

### Dynamic Options from API

```html
<form data-form="locationForm" data-load-api="get-options.php">
  <select name="provinces" multiple
          data-options-key="provinces"
          data-placeholder="Select provinces...">
  </select>
</form>
```

## 📖 API Reference

### HTML Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `multiple` | boolean | - | Required. Enables multiple selection |
| `data-placeholder` | string | - | Placeholder text when empty |
| `data-max-display` | number | 2 | Max items before "+n items" |
| `data-options-key` | string | - | Key for API options |
| `data-attr` | string | - | Data binding expression |
| `required` | boolean | false | Require at least one selection |
| `disabled` | boolean | false | Disable the select |

### JavaScript API

```javascript
// Get instance
const selectEl = document.querySelector('select[name="colors"]');
const instance = ElementManager.getInstanceByElement(selectEl);

// Set values (array)
instance.setValue(['red', 'blue']);

// Get selected values
const values = instance.getValue(); // ['red', 'blue']

// Update options dynamically
instance.updateOptions([
  { value: 'purple', text: 'Purple' },
  { value: 'orange', text: 'Orange' }
]);

// Clear all selections
instance.clear();
```

## ⌨️ Keyboard Navigation

| Key | Action |
|-----|--------|
| `Enter` / `Space` | Open dropdown (when trigger focused) |
| `↓` Arrow Down | Move to next item |
| `↑` Arrow Up | Move to previous item |
| `Space` | Toggle selection of highlighted item |
| `Tab` / `Escape` | Close dropdown |

## 🔄 Data Flow

### 1. Loading Options (get-options.php)

**Response Format:**
```json
{
  "data": {
    "provinces": ["10", "11"],
    "options": {
      "provinces": [
        { "value": "10", "text": "กรุงเทพมหานคร" },
        { "value": "11", "text": "สมุทรปราการ" }
      ]
    }
  }
}
```

### 2. Form Submission (save-address.php)

**Request:**
```
POST save-address.php
provinces[]=10&provinces[]=11&districts[]=1001
```

**Response:**
```json
{
  "success": true,
  "message": "Address selection saved successfully",
  "data": {
    "provinces": ["10", "11"],
    "districts": ["1001"],
    "subdistricts": [],
    "actions": [
      {
        "type": "notification",
        "message": "Saved: 2 province(s)..."
      }
    ]
  }
}
```

## 🎨 Styling

The multi-select component uses these CSS classes:

```css
/* Trigger button */
.dropdown-button { }
.dropdown-button.disabled { }

/* Display area */
.dropdown-display { }
.dropdown-display.placeholder { }

/* Dropdown arrow */
.dropdown-arrow { }

/* Options list */
.autocomplete-list { }
.autocomplete-list li { }
.autocomplete-list li.active { }

/* Check icons */
.icon-check { }
.icon-uncheck { }
```

## 💡 Tips

1. **Always use `multiple` attribute** - Required for MultiSelectElementFactory
2. **Use `data-options-key`** - To auto-populate from API response
3. **Combine with FormManager** - For validation and AJAX submission
4. **Handle empty state** - Provide meaningful placeholder text
5. **Test keyboard navigation** - Ensure accessibility

## 🔗 Related Examples

- [Form Validation](../form/) - Form validation examples
- [API Integration](../api-integration/) - AJAX data loading
- [Select Element](../select/) - Single select dropdown

## 📄 License

This example is part of the Now.js framework.
