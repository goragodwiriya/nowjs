# Text Elements Example

Comprehensive examples of TextElement and its subclasses in the Now.js framework, demonstrating autocomplete, validation, masks, tags, and more.

## Features Demonstrated

### 1. TextElement with Autocomplete
- **Static Autocomplete**: From `<datalist>` or global JavaScript variables
- **API Autocomplete**: Load options from server endpoints
- **Custom Rendering**: Custom callback functions for rich dropdown items
- **Configurable Options**: min-length, max-results, delay

### 2. Validated Input Types
- **EmailElement**: Email validation with auto-lowercase
- **UrlElement**: URL format validation
- **UsernameElement**: Username or email format

### 3. MaskElement
- **Pre-defined Masks**: Phone, ID card, credit card, IP address, date, time
- **Custom Masks**: Define your own patterns

### 4. TagsElement
- **Basic Tags**: Type and press Enter to add
- **Tags with Autocomplete**: From static or API sources
- **Limited Tags**: Set maximum number of tags

### 5. SearchElement
- **Live Search**: Real-time filtering
- **Clear Button**: One-click clear

### 6. Hierarchical Text
- **Address Search**: Search across province, district, subdistrict
- **Auto-fill**: Select from any level to populate related fields

## File Structure

```
examples/text-elements/
├── index.html           # Demo page
├── main.js              # JavaScript initialization
├── styles.css           # Custom styles
├── save.php             # Form submission handler
├── api/
│   ├── products.php     # Products autocomplete API
│   ├── employees.php    # Employees autocomplete API
│   ├── customers.php    # Customers autocomplete API
│   ├── categories.php   # Categories for tags API
│   └── search-address.php  # Hierarchical address search API
└── README.md            # This file
```

## Quick Start

### Static Autocomplete from Datalist

```html
<input type="text" name="country"
       data-element="text"
       data-autocomplete="true"
       list="country-list">
<datalist id="country-list">
  <option value="TH" label="Thailand">Thailand</option>
  <option value="JP" label="Japan">Japan</option>
</datalist>
```

### Static Autocomplete from Global Variable

```html
<input type="text" name="language"
       data-element="text"
       data-autocomplete="true"
       data-source="PROGRAMMING_LANGUAGES"
       data-min-length="1">
```

```javascript
window.PROGRAMMING_LANGUAGES = [
  { value: 'js', text: 'JavaScript' },
  { value: 'py', text: 'Python' }
];
```

### API Autocomplete

```html
<input type="text" name="product"
       data-element="text"
       data-autocomplete="true"
       data-source="api/products.php"
       data-min-length="2"
       data-delay="300">
```

### Custom Render Callback

```html
<input type="text" name="fruit"
       data-element="text"
       data-autocomplete="true"
       data-source="FRUITS"
       data-callback="renderFruitItem">
```

```javascript
window.renderFruitItem = function({ key, value, search }) {
  const container = document.createElement('div');
  container.innerHTML = `<span>🍎</span> ${value}`;
  return container;
};
```

### Mask Input

```html
<!-- Phone -->
<input type="text" data-element="tel">

<!-- ID Card -->
<input type="text" data-element="mask" data-format="idcard">

<!-- Custom Pattern -->
<input type="text" data-element="mask" data-pattern="AAA-9999">
```

### Tags Input

```html
<!-- Basic -->
<input type="text" data-element="tags">

<!-- With Autocomplete -->
<input type="text" data-element="tags"
       data-autocomplete="true"
       data-source="SKILLS">

<!-- Limited Tags -->
<input type="text" data-element="tags" data-max-tags="5">
```

## API Response Format

All autocomplete APIs should return JSON:

```json
{
  "success": true,
  "data": [
    {"value": "1", "text": "Option 1"},
    {"value": "2", "text": "Option 2"}
  ]
}
```

Alternative formats are auto-detected:
- `[{"id": "1", "name": "Option 1"}]` → id→value, name→text
- `[{"key": "1", "label": "Option 1"}]` → key→value, label→text
- `{"1": "Option 1"}` → Object format

## Data Attributes Reference

| Attribute | Type | Description |
|-----------|------|-------------|
| `data-element` | string | Element type: text, email, url, username, search, mask, tags |
| `data-autocomplete` | boolean | Enable autocomplete |
| `data-source` | string | Global variable name or API URL |
| `data-min-length` | number | Min chars before autocomplete (default: 2) |
| `data-max-results` | number | Max dropdown items (default: 10) |
| `data-delay` | number | Debounce delay in ms (default: 300) |
| `data-callback` | string | Custom render function name |
| `data-format` | string | Mask format: tel, date, time, creditcard, ip, idcard |
| `data-pattern` | string | Custom mask pattern |
| `data-max-tags` | number | Max tags allowed |
| `data-search-api` | string | Hierarchical search API URL |
| `data-search-field` | string | Field for hierarchical search |

## Running the Example

```bash
cd examples/text-elements
php -S localhost:8000
```

Open `http://localhost:8000` in your browser.
