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

- `index.html` - Main example page with all demonstrations
- `main.js` - JavaScript for event handlers and calculations
- `styles.css` - Custom styles for examples
- `data/products.json` - Sample product data
- `data/po-items.json` - Sample PO items data

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
