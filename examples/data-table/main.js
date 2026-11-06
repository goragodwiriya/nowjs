/**
 * TableManager Example
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize framework
    await Now.init({
      // Environment mode: 'development' or 'production'
      environment: 'production',

      // Internationalization settings
      i18n: {
        enabled: true,
        availableLocales: ['en', 'th']
      },

      // Dark/Light mode
      config: {
        enabled: true
      },

      // Syntax highlighter configuration for code examples
      syntaxhighlighter: {
        display: {
          lineNumbers: true,    // Show line numbers in code blocks
          copyButton: true      // Show copy button for code blocks
        }
      }
    }).then(() => {
      // Load application components after framework initialization
      const scripts = [
        '../header.js',                                      // Navigation header
        '../../js/components/footer.js',                    // Footer component
        '../../js/components/SyntaxHighlighterComponent.js' // Code syntax highlighting
      ];

      // Dynamically load all component scripts
      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        document.head.appendChild(script);
      });
    });

    // Create application instance
    const app = await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

    // Initialize TableManager with global configuration
    await TableManager.init({
      debug: false,                    // เปิด debug logging
      urlParams: true,                 // บันทึก state ลง URL parameters
      pageSizes: [10, 25, 50, 100],   // ตัวเลือก page sizes
      showCaption: true,              // แสดง table caption
      showCheckbox: false,            // แสดง checkboxes (default)
      showFooter: false,              // แสดง footer (default)
      persistColumnWidths: true,      // บันทึกความกว้าง columns
      confirmDelete: true             // ยืนยันก่อนลบ
    });

    console.log('TableManager initialized successfully');

    // Setup event listeners for all tables
    setupTableEventListeners();

    // Setup Example 10: Row sort toggle demo
    setupRowSortExample();

    // Setup Example 7: Client-Side Data controls
    setupClientSideExample();

    // Setup Example 8: Export controls
    setupExportExample();

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

/**
 * Setup global event listeners for TableManager
 *
 * TableManager ส่ง event ผ่าน EventManager ไม่ได้ dispatch เป็น DOM event
 * จึงต้องรับด้วย EventManager.on() ไม่ใช่ document.addEventListener()
 */
function setupTableEventListeners() {

  // เรนเดอร์ตารางเสร็จแต่ละรอบ ครอบคลุมทั้งโหลดใหม่ เรียงลำดับ กรอง และเปลี่ยนหน้า
  EventManager.on('table:render', ({tableId, data, totalRecords, filteredRecords, isServerSide}) => {
    console.log(`✓ Table '${tableId}' rendered ${data.length} of ${filteredRecords} rows`);
    console.log(`  Total: ${totalRecords} records · server-side: ${isServerSide}`);
  });

  // โหลดข้อมูลใหม่อัตโนมัติแต่ละรอบ
  EventManager.on('table:refreshed', ({tableId, automatic}) => {
    console.log(`↻ Table '${tableId}' refreshed${automatic ? ' (auto)' : ''}`);
  });

  // เลือกหรือยกเลิกเลือกแถว
  EventManager.on('table:selectionChange', ({tableId, selectedRows}) => {
    const count = selectedRows?.length || 0;
    console.log(`☑ Table '${tableId}' selection: ${count} rows selected`);

    // เปิดหรือปิดปุ่ม bulk action ตามจำนวนที่เลือก
    const actionButtons = document.querySelectorAll(`[data-table="${tableId}"] ~ .action-buttons button`);
    actionButtons.forEach(btn => {
      btn.disabled = count === 0;
    });
  });

  // แก้ค่าในเซลล์ที่แก้ไขได้
  EventManager.on('table:fieldChange', ({tableId, field, value, rowData}) => {
    console.log(`✓ Table '${tableId}' field '${field}' updated:`, {
      value,
      row: rowData?.id
    });
  });

  // ส่ง action ไป endpoint แล้วได้ผลกลับ
  EventManager.on('table:action', ({tableId, action, success, response}) => {
    if (!success) {
      console.error(`✗ Action '${action}' failed for table '${tableId}'`, response);
      return;
    }

    console.log(`✓ Action '${action}' completed for table '${tableId}'`);

    // ล้างการเลือกแล้วโหลดข้อมูลใหม่
    const table = TableManager.state.tables.get(tableId);
    if (table) {
      TableManager.clearSelection(table, tableId);
    }
    TableManager.loadTableData(tableId, {force: true});
  });

  // เกิดข้อผิดพลาดระหว่างทำ action
  EventManager.on('table:error', ({tableId, action, error}) => {
    console.error(`✗ Table '${tableId}' error during '${action}':`, error);
  });
}

/**
 * Setup Example 10: Row drag toggle
 */
function setupRowSortExample() {
  const tableId = 'row-sortable-table';

  const enableBtn = document.getElementById('enableRowSort');
  const disableBtn = document.getElementById('disableRowSort');
  const resetBtn = document.getElementById('resetRowOrder');

  if (enableBtn) {
    enableBtn.addEventListener('click', () => {
      TableManager.enableRowSort(tableId);
      console.log(`Row drag enabled for ${tableId}`);
    });
  }

  if (disableBtn) {
    disableBtn.addEventListener('click', () => {
      TableManager.disableRowSort(tableId);
      console.log(`Row drag disabled for ${tableId}`);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      TableManager.loadTableData(tableId);
      console.log(`Reloaded data for ${tableId}`);
    });
  }
}

/**
 * Setup Example 7: Client-Side Data Management
 */
function setupClientSideExample() {
  const tableId = 'client-side-table';

  // Sample data for client-side table
  const sampleData = [
    {id: 1, product: 'Laptop Dell XPS 15', category: 'Electronics', price: 1299, stock: 45},
    {id: 2, product: 'Wireless Mouse Logitech', category: 'Accessories', price: 29, stock: 200},
    {id: 3, product: 'Mechanical Keyboard', category: 'Accessories', price: 89, stock: 150},
    {id: 4, product: 'Monitor 27" 4K', category: 'Electronics', price: 499, stock: 80},
    {id: 5, product: 'USB-C Hub', category: 'Accessories', price: 49, stock: 120},
    {id: 6, product: 'Webcam HD', category: 'Electronics', price: 79, stock: 95},
    {id: 7, product: 'Laptop Stand', category: 'Accessories', price: 35, stock: 180},
    {id: 8, product: 'External SSD 1TB', category: 'Storage', price: 149, stock: 110},
    {id: 9, product: 'Headphones Noise-Canceling', category: 'Audio', price: 299, stock: 65},
    {id: 10, product: 'Desk Lamp LED', category: 'Office', price: 45, stock: 140}
  ];

  let currentData = [];

  // Load Sample Data button
  const loadBtn = document.getElementById('loadClientData');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      currentData = [...sampleData];
      TableManager.setData(tableId, currentData);
      console.log(`Loaded ${currentData.length} items to ${tableId}`);
    });
  }

  // Add Row button
  const addBtn = document.getElementById('addRow');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const newId = currentData.length > 0
        ? Math.max(...currentData.map(item => item.id)) + 1
        : 1;

      const newRow = {
        id: newId,
        product: `New Product ${newId}`,
        category: 'Electronics',
        price: Math.floor(Math.random() * 500) + 50,
        stock: Math.floor(Math.random() * 200) + 10
      };

      currentData.push(newRow);
      TableManager.setData(tableId, currentData);
      console.log('Added new row:', newRow);
    });
  }

  // Clear Data button
  const clearBtn = document.getElementById('clearData');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      currentData = [];
      TableManager.setData(tableId, currentData);
      console.log('Cleared all data');
    });
  }
}

/**
 * Setup Example 8: Export Functionality
 */
function setupExportExample() {
  const tableId = 'export-table';

  // Export CSV button
  const csvBtn = document.getElementById('exportCSV');
  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      TableManager.exportData(tableId, 'csv', {
        filename: `employees_${new Date().toISOString().split('T')[0]}.csv`
      });
      console.log('Exporting to CSV...');
    });
  }

  // Export Excel button (server-side)
  const excelBtn = document.getElementById('exportExcel');
  if (excelBtn) {
    excelBtn.addEventListener('click', () => {
      TableManager.exportData(tableId, 'excel', {
        filename: `employees_${new Date().toISOString().split('T')[0]}.xlsx`
      });
      console.log('Exporting to Excel (requires server-side support)...');
    });
  }

  // Export JSON button
  const jsonBtn = document.getElementById('exportJSON');
  if (jsonBtn) {
    jsonBtn.addEventListener('click', () => {
      TableManager.exportData(tableId, 'json', {
        filename: `employees_${new Date().toISOString().split('T')[0]}.json`
      });
      console.log('Exporting to JSON...');
    });
  }

  // Export Filtered Data button
  const filteredBtn = document.getElementById('exportFiltered');
  if (filteredBtn) {
    filteredBtn.addEventListener('click', () => {
      const filteredData = TableManager.getData(tableId, true);

      TableManager.exportData(tableId, 'csv', {
        filename: `filtered_employees_${new Date().toISOString().split('T')[0]}.csv`,
        filtered: true
      });

      console.log(`Exporting ${filteredData.length} filtered records...`);
    });
  }
}

/**
 * Helper: Get Table Statistics
 */
function getTableStats(tableId) {
  const table = TableManager.state.tables.get(tableId);
  if (!table) {
    console.warn(`Table '${tableId}' not found`);
    return null;
  }

  const allData = TableManager.getData(tableId, false);
  const filteredData = TableManager.getData(tableId, true);
  const selected = TableManager.getSelectedRows ? TableManager.getSelectedRows(tableId) : [];

  return {
    tableId,
    total: allData.length,
    filtered: filteredData.length,
    selected: selected.length,
    currentPage: table.config.params.page,
    pageSize: table.config.params.pageSize,
    sortState: table.sortState
  };
}

// Expose helper to window for console debugging
window.getTableStats = getTableStats;
window.TableManager = TableManager;

console.log('TableManager example loaded. Try: getTableStats("basic-table")');
