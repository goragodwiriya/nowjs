/**
 * LineItemsManager Example
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize framework
    await Now.init({
      environment: 'production',
      i18n: {
        enabled: true,
        availableLocales: ['en', 'th']
      },
      config: {
        enabled: true
      },
      syntaxhighlighter: {
        display: {
          lineNumbers: true,
          copyButton: true
        }
      }
    }).then(() => {
      // Load components
      const scripts = [
        '../header.js',
        '../../js/components/footer.js',
        '../../js/components/SyntaxHighlighterComponent.js'
      ];

      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        document.head.appendChild(script);
      });
    });

    // Create app
    const app = await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

    // Initialize LineItemsManager
    await LineItemsManager.init({
      debug: false,
      deleteConfirm: true
    });

    console.log('LineItemsManager initialized successfully');

    // Setup event listeners
    setupEventListeners();

    // Setup Example 4: JavaScript API
    setupJavaScriptAPIExample();

    // Setup form handlers
    setupFormHandlers();

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

/**
 * Setup global event listeners for LineItemsManager
 */
function setupEventListeners() {

  // Item added
  document.addEventListener('lineitems:add', (e) => {
    const {row, rowIndex, instance} = e.detail;
    console.log('✓ Item added:', row, 'at index:', rowIndex);
  });

  // Item updated
  document.addEventListener('lineitems:update', (e) => {
    const {row, rowIndex} = e.detail;
    console.log('↻ Item updated:', row, 'at index:', rowIndex);
  });

  // Item removed
  document.addEventListener('lineitems:remove', (e) => {
    const {rowIndex} = e.detail;
    console.log('✗ Item removed at index:', rowIndex);
  });

  // Duplicate merged
  document.addEventListener('lineitems:merge', (e) => {
    const {row, rowIndex} = e.detail;
    console.log('⇄ Duplicate merged:', row, 'at index:', rowIndex);
  });

  // Calculation complete
  document.addEventListener('lineitems:calculate', (e) => {
    const {rows} = e.detail;
    console.log('∑ Calculation complete, rows:', rows);
  });

  // Source loaded
  document.addEventListener('lineitems:sourceLoaded', (e) => {
    const {source, items, count} = e.detail;
    console.log('⬇ Loaded from source:', source, 'items:', count);
  });

  // Custom action (button click)
  document.addEventListener('lineitems:action', (e) => {
    const {action, field, rowIndex, rowData} = e.detail;
    console.log('⚡ Action:', action, 'on field:', field, 'row:', rowIndex);
  });
}

/**
 * Calculation Functions
 */

// Example 1: Basic PO
function calculatePO({items}) {
  let total = 0;

  const updatedItems = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const subtotal = qty * price;
    total += subtotal;

    return {subtotal: subtotal.toFixed(2)};
  });

  return {
    items: updatedItems,
    '#po_total': total.toFixed(2)
  };
}

// Example 2: Invoice with VAT and Discount
function calculateInvoice({items}) {
  let subtotal = 0;

  const updatedItems = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const itemSubtotal = qty * price;
    subtotal += itemSubtotal;

    return {subtotal: itemSubtotal.toFixed(2)};
  });

  const discountPercent = parseFloat(document.getElementById('inv_discount_percent')?.value) || 0;
  const discount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discount;
  const vat = afterDiscount * 0.07;
  const total = afterDiscount + vat;

  return {
    items: updatedItems,
    '#inv_subtotal': subtotal.toFixed(2),
    '#inv_discount_amount': discount.toFixed(2),
    '#inv_after_discount': afterDiscount.toFixed(2),
    '#inv_vat': vat.toFixed(2),
    '#inv_total': total.toFixed(2)
  };
}

// Example 3: Goods Receipt
function calculateGR({items}) {
  let totalOrdered = 0;
  let totalReceived = 0;

  items.forEach(item => {
    totalOrdered += parseFloat(item.quantity) || 0;
    totalReceived += parseFloat(item.received_qty) || 0;
  });

  return {
    items: [],
    '#gr_total_ordered': totalOrdered.toFixed(0),
    '#gr_total_received': totalReceived.toFixed(0)
  };
}

// Example 4: Merge Duplicates
function calculateMerge({items}) {
  let total = 0;
  const count = items.length;

  const updatedItems = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const subtotal = qty * price;
    total += subtotal;

    return {subtotal: subtotal.toFixed(2)};
  });

  return {
    items: updatedItems,
    '#merge_count': count,
    '#merge_total': total.toFixed(2)
  };
}

// Example 5: JavaScript API
function calculateAPI({items}) {
  let total = 0;

  const updatedItems = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const subtotal = qty * price;
    total += subtotal;

    return {subtotal: subtotal.toFixed(2)};
  });

  return {
    items: updatedItems,
    '#api_total': total.toFixed(2)
  };
}

/**
 * Button Action Handlers
 */

// Add VAT 7%
function addVat(currentValue) {
  const price = parseFloat(currentValue) || 0;
  return (price * 1.07).toFixed(2);
}

/**
 * Clear Functions
 */
function clearPO() {
  const table = document.querySelector('[data-line-items="items"]');
  const instance = LineItemsManager.getInstance(table);
  if (instance) {
    instance.clear();
  }
}

function clearInvoice() {
  const table = document.querySelector('[data-line-items="invoice_items"]');
  const instance = LineItemsManager.getInstance(table);
  if (instance) {
    instance.clear();
  }
}

/**
 * Example 5: JavaScript API Demo
 */
function setupJavaScriptAPIExample() {
  const table = document.querySelector('[data-line-items="api_items"]');
  const instance = LineItemsManager.getInstance(table);

  if (!instance) {
    console.warn('API items table not found');
    return;
  }

  // Add Item button
  document.getElementById('addItem')?.addEventListener('click', () => {
    const newId = Math.floor(Math.random() * 1000);
    instance.addItem({
      sku: `P${String(newId).padStart(3, '0')}`,
      name: `Product ${newId}`,
      quantity: 1,
      unit_price: Math.floor(Math.random() * 5000) + 500
    });
    console.log('Added new item');
  });

  // Update Item button
  document.getElementById('updateItem')?.addEventListener('click', () => {
    if (instance.rows.length > 0) {
      const firstRow = instance.rows[0];
      instance.updateRow(firstRow.index, {
        quantity: 10,
        unit_price: 9999
      });
      console.log('Updated first item');
    } else {
      console.log('No items to update');
    }
  });

  // Remove Item button
  document.getElementById('removeItem')?.addEventListener('click', () => {
    if (instance.rows.length > 0) {
      const firstRow = instance.rows[0];
      instance.removeRow(firstRow.index);
      console.log('Removed first item');
    } else {
      console.log('No items to remove');
    }
  });

  // Get Data button
  document.getElementById('getData')?.addEventListener('click', () => {
    const data = instance.getData();
    console.log('All data:', data);
    alert(`Found ${data.length} items. Check console for details.`);
  });

  // Set Data button
  document.getElementById('setData')?.addEventListener('click', () => {
    const sampleData = [
      {sku: 'P001', name: 'Laptop', quantity: 2, unit_price: 45000},
      {sku: 'P002', name: 'Mouse', quantity: 5, unit_price: 890},
      {sku: 'P003', name: 'Keyboard', quantity: 3, unit_price: 2890}
    ];
    instance.setData(sampleData);
    console.log('Set sample data');
  });

  // Clear Data button
  document.getElementById('clearData')?.addEventListener('click', () => {
    instance.clear();
    console.log('Cleared all data');
  });
}

/**
 * Setup form submission handlers
 */
function setupFormHandlers() {
  // PO Form
  document.getElementById('po-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const table = document.querySelector('[data-line-items="items"]');
    const instance = LineItemsManager.getInstance(table);
    const data = instance ? instance.getData() : [];

    console.log('PO Form submitted:', {
      items: data,
      total: document.getElementById('po_total').value
    });

    alert(`PO saved with ${data.length} items. Check console for details.`);
  });

  // Invoice Form
  document.getElementById('invoice-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const table = document.querySelector('[data-line-items="invoice_items"]');
    const instance = LineItemsManager.getInstance(table);
    const data = instance ? instance.getData() : [];

    console.log('Invoice submitted:', {
      items: data,
      subtotal: document.getElementById('inv_subtotal').value,
      discount: document.getElementById('inv_discount_amount').value,
      vat: document.getElementById('inv_vat').value,
      total: document.getElementById('inv_total').value
    });

    alert(`Invoice saved with ${data.length} items. Check console for details.`);
  });

  // GR Form
  document.getElementById('gr-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const table = document.querySelector('[data-line-items="gr_items"]');
    const instance = LineItemsManager.getInstance(table);
    const data = instance ? instance.getData() : [];

    console.log('Goods Receipt submitted:', {
      po_id: document.getElementById('po_id').value,
      items: data
    });

    alert(`Goods Receipt saved. Check console for details.`);
  });
}

// Expose functions to window for inline event handlers
window.calculatePO = calculatePO;
window.calculateInvoice = calculateInvoice;
window.calculateGR = calculateGR;
window.calculateMerge = calculateMerge;
window.calculateAPI = calculateAPI;
window.addVat = addVat;
window.clearPO = clearPO;
window.clearInvoice = clearInvoice;
window.LineItemsManager = LineItemsManager;

console.log('LineItemsManager example loaded successfully');
