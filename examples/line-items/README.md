# LineItemsManager Example

Complete examples demonstrating all features of Now.js LineItemsManager component.

## Examples Included

1. **Basic Purchase Order** - Simple PO with autocomplete and automatic calculation
2. **Invoice with VAT and Discount** - Advanced invoice with discount percentage and VAT calculation
3. **Goods Receipt - Load from PO** - Auto-load items from Purchase Order
4. **Auto-Merge Duplicates** - Automatically merge duplicate items by SKU
5. **JavaScript API** - Programmatic control of LineItemsManager

## Features Demonstrated

- ✅ Event-driven product selection
- ✅ Autocomplete integration
- ✅ Multiple input types (number, currency, text)
- ✅ Display-only and readonly fields
- ✅ Custom cell buttons (VAT calculation)
- ✅ External calculation callbacks
- ✅ Auto-merge duplicates
- ✅ Load from external source
- ✅ JavaScript API methods
- ✅ Event system

## Files

- `index.html` - Main example page with all demonstrations (each form is a `data-form`)
- `main.js` - Calculation callbacks and the JavaScript API demo
- `styles.css` - Custom styles for examples
- `data/products.json` - Sample products (read by the API below, no database)
- `api/products.php` - `GET ?q=` product search for the autocomplete → `[{value, text}]`
- `api/product.php` - `GET ?product=P001&qty=2` detail of the picked product (`data-detail-api`); `400` / `404`
- `api/po-items.php` - `GET ?po_id=1` items of a purchase order (`data-load-from` + `data-load-api`); `400` / `404`
- `api/save.php` - `POST` a form; rows arrive as `items[0][quantity]` (FormManager sends JSON with these flat keys); `422` with no rows

All endpoints answer `{success, message, code, data, errors}` with the matching HTTP status.

## Notes

- Calculation callbacks (`data-on-calculate`, `data-button-click`) get number and currency columns as numbers.
- The search input is `name="product"`: the picked id is in the hidden input of that name, and `data-role="product"` sends it to the detail API as `product=`.
- The discount input is bound in `main.js` because this static page is not rendered by TemplateManager; a router page can write `data-on="input:LineItemsManager.recalculate"`.
- `LineItemsManager.init({deleteConfirm: true})` makes the delete button ask with a dialog.

## How to Use

1. Open `index.html` in a browser
2. Try each example:
   - **Example 1**: Search and add products
   - **Example 2**: Test VAT button and discount
   - **Example 3**: Select PO to auto-load items
   - **Example 4**: Add same product twice to see merge
   - **Example 5**: Use JavaScript buttons to manipulate data

## API Examples

```javascript
// Get instance
const instance = LineItemsManager.getInstance('#my-table');

// Add item
instance.addItem({
  sku: 'P001',
  name: 'Product A',
  quantity: 1,
  unit_price: 100
});

// Get all data
const data = instance.getData();

// Clear all
instance.clear();
```

## Documentation

See full documentation at:
- Thai: `docs/th/LineItemsManager.md`
- English: `docs/en/LineItemsManager.md`
