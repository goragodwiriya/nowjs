const TableManager = {
  config: {
    debug: false, // Enable debug logging to troubleshoot URL issues
    urlParams: true, // Enable URL parameter persistence
    pageSizes: [10, 25, 50, 100],
    showCaption: true,
    showCheckbox: false,
    showFooter: false,
    footerAggregates: {}, // e.g. {price: 'sum', quantity: 'sum', rating: 'avg'}
    searchColumns: [],
    persistColumnWidths: true,
    allowRowModification: false,
    confirmDelete: true,
    source: '',
    method: 'GET', // HTTP method for API calls (GET or POST)
    actions: {}, // e.g. {delete:"Delete",activate:"Activate"}
    actionUrl: '',
    actionButton: 'Process',
    rowActions: {}, // e.g. {print:"Print",edit:{label:"Edit",submenu:{inline:"Inline Edit",page:"Open Editor"}},delete:"Delete"}
    params: {
      search: '',
      pageSize: 0,
      page: 1,
    }
  },

  state: {
    initialized: false,
    tables: new Map()
  },

  async init(options = {}) {
    if (this.state.initialized) return this;

    this.config = {...this.config, ...options};

    this.setupDynamicTableObserver();

    document.querySelectorAll('table[data-table]').forEach(table => {
      this.initTable(table);
    });

    const event = Now.getManager('event');
    if (event) {
      event.on('locale:changed', () => {
        this.state.tables.forEach((table, tableId) => {
          this.renderTable(tableId);
        });
      });
    }

    // Also listen to global Now.emit locale change as a fallback in case
    // the Event manager is not available. This ensures captions and other
    // localized fragments are updated immediately when the locale changes.
    try {
      if (window.Now && typeof window.Now.on === 'function') {
        Now.on?.('locale:changed', (data) => {
          this.state.tables.forEach((table, tableId) => {
            try {
              // Only update caption to avoid unnecessary full re-renders
              this.updateTableCaption(table, (table.meta && table.meta.totalRecords) || 0, (table.meta && table.meta.totalPages) || 0);
            } catch (err) {
              // fallback to full render if caption update fails
              this.renderTable(tableId);
            }
          });
        });
      }
    } catch (e) {
      // ignore listener setup errors
    }

    this.state.initialized = true;
    return this;
  },

  /**
   * URL Parameter Management for State Persistence
   */
  getUrlParams(tableId) {
    const table = this.state.tables.get(tableId);
    const urlParamsEnabled = table?.config?.urlParams !== undefined ? table.config.urlParams : this.config.urlParams;

    if (!urlParamsEnabled) return {};

    // Get URL parameters from current location, supporting both history and hash modes
    let searchParams = '';
    const currentUrl = window.location.href;

    if (currentUrl.includes('#')) {
      // Hash mode: extract query params from hash fragment
      const hashPart = window.location.hash;
      const queryIndex = hashPart.indexOf('?');
      if (queryIndex !== -1) {
        searchParams = hashPart.substring(queryIndex + 1);
      }
    } else {
      // History mode: use standard search params
      searchParams = window.location.search.substring(1);
    }

    const urlParams = new URLSearchParams(searchParams);
    const params = {};

    // Parse URL parameters (simple format without table prefix)
    for (const [key, value] of urlParams.entries()) {
      // Parse numeric parameters
      if (key === 'page' || key === 'pageSize') {
        params[key] = parseInt(value) || (key === 'page' ? 1 : 10);
      }
      // Handle sort parameter in compact format (e.g., 'name asc,status desc')
      else if (key === 'sort') {
        params[key] = value;
      }
      // Handle other filter parameters
      else {
        params[key] = value;
      }
    }

    return params;
  },

  updateUrlParams(tableId, newParams = {}) {
    const table = this.state.tables.get(tableId);
    const urlParamsEnabled = table?.config?.urlParams !== undefined ? table.config.urlParams : this.config.urlParams;

    if (!urlParamsEnabled) return;

    // Get current URL parameters, supporting both history and hash modes
    let searchParams = '';
    const currentUrl = window.location.href;
    const isHashMode = currentUrl.includes('#');

    if (isHashMode) {
      // Hash mode: extract query params from hash fragment
      const hashPart = window.location.hash;
      const queryIndex = hashPart.indexOf('?');
      if (queryIndex !== -1) {
        searchParams = hashPart.substring(queryIndex + 1);
      }
    } else {
      // History mode: use standard search params
      searchParams = window.location.search.substring(1);
    }

    const urlParams = new URLSearchParams(searchParams);

    // Clear all existing table-related parameters
    const commonTableParams = ['page', 'pageSize', 'search', 'sort'];

    // Internal parameters that should NOT be synced to URL
    const internalParams = ['total', 'totalPages', 'totalRecords', 'loading', 'error'];

    // Get all column field names for filtering
    const columnFields = [];
    if (table.columns && table.columns.size > 0) {
      for (const [field] of table.columns) {
        columnFields.push(field);
      }
    }

    // Remove all table-related parameters (but not internal ones - they shouldn't be there anyway)
    const keysToRemove = [...commonTableParams, ...columnFields];
    keysToRemove.forEach(key => {
      // Remove all instances of the key (important for array params like sort[])
      while (urlParams.has(key)) {
        urlParams.delete(key);
      }
    });

    // Add new parameters (simple format without table prefix)
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;

      // Skip internal parameters that shouldn't appear in URLs
      if (internalParams.includes(key)) return;

      if (Array.isArray(value)) {
        // Handle array parameters (for multi-sort)
        value.forEach(v => {
          if (v !== undefined && v !== null && v !== '') {
            urlParams.append(key, v);
          }
        });
      } else {
        urlParams.set(key, value);
      }
    });

    // Build new URL supporting both modes
    let newUrl;
    const queryString = urlParams.toString();

    if (isHashMode) {
      // Hash mode: put params in hash fragment
      const hashBase = window.location.hash.split('?')[0] || '#/';
      newUrl = `${window.location.pathname}${hashBase}${queryString ? '?' + queryString : ''}`;
    } else {
      // History mode: standard query params
      newUrl = `${window.location.pathname}${queryString ? '?' + queryString : ''}${window.location.hash}`;
    }

    try {
      window.history.replaceState({}, '', newUrl);
    } catch (e) {
      console.warn('Failed to update URL parameters:', e);
    }
  },

  syncStateToUrl(tableId) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    // Check if URL params are enabled for this table
    const urlParamsEnabled = table.config.urlParams !== undefined ? table.config.urlParams : this.config.urlParams;
    if (!urlParamsEnabled) return;

    // Internal parameters that should NOT be synced to URL
    const internalParams = ['total', 'totalPages', 'totalRecords', 'loading', 'error'];

    const params = {};
    // Only include user-facing parameters, exclude internal ones
    Object.entries(table.config.params).forEach(([key, value]) => {
      if (!internalParams.includes(key)) {
        params[key] = value;
      }
    });

    // Add sort state in compact format (e.g., 'name asc,status desc')
    if (table.sortState && Object.keys(table.sortState).length > 0) {
      const sortPairs = Object.entries(table.sortState).map(([field, direction]) => `${field} ${direction}`);

      if (sortPairs.length > 0) {
        params.sort = sortPairs.join(',');
      }
    }

    // Clean up empty values
    Object.keys(params).forEach(key => {
      const value = params[key];

      // Handle regular parameters
      if (value === '' || value === undefined || value === null) {
        delete params[key];
      }

      // Remove default page value
      if (key === 'page' && value === 1) {
        delete params[key];
      }
    });

    this.updateUrlParams(tableId, params);
  },

  loadStateFromUrl(tableId) {
    const urlParams = this.getUrlParams(tableId);
    const table = this.state.tables.get(tableId);
    if (!table || Object.keys(urlParams).length === 0) return false;

    // Update table config params
    Object.keys(urlParams).forEach(key => {
      if (['sort', 'order'].includes(key)) return; // Handle separately
      table.config.params[key] = urlParams[key];
    });

    // Restore sort state from compact format (e.g., 'name asc,status desc')
    if (urlParams.sort) {
      table.sortState = {};

      // Parse compact sort format: 'name asc,status desc'
      const sortPairs = urlParams.sort.split(',').map(pair => pair.trim());

      sortPairs.forEach(pair => {
        const parts = pair.split(/\s+/); // Split by whitespace
        if (parts.length >= 2) {
          const field = parts[0];
          const direction = parts[1].toLowerCase();

          if (['asc', 'desc'].includes(direction)) {
            table.sortState[field] = direction;
          }
        } else if (parts.length === 1) {
          // Default to 'asc' if no direction specified
          table.sortState[parts[0]] = 'asc';
        }
      });
    }

    return true;
  },

  restoreFilterUIFromState(tableId) {
    const table = this.state.tables.get(tableId);
    if (!table || !table.filterElements) return;

    // Update filter element values to match loaded state
    Object.entries(table.config.params).forEach(([key, value]) => {
      const filterElement = table.filterElements.get(key);
      if (filterElement && filterElement.element && value !== undefined && value !== null && value !== '') {
        try {
          // Update the element value
          if (filterElement.element.type === 'checkbox') {
            filterElement.element.checked = !!value;
          } else {
            filterElement.element.value = value;
          }

          // For select elements, ensure the option exists
          if (filterElement.element.tagName === 'SELECT') {
            const options = Array.from(filterElement.element.options);
            const hasOption = options.some(opt => opt.value === String(value));
            if (hasOption) {
              filterElement.element.value = value;
            }
          }
        } catch (error) {
          console.warn('Failed to restore filter UI value:', {key, value, error});
        }
      }
    });
  },

  initTable(table, options = {}) {
    if (!table) {
      return this.handleError('Table element is required', null, 'init');
    }

    const tableId = table.dataset.table;
    if (!tableId) {
      return this.handleError('Table ID is required', null, 'init');
    }

    if (this.state.tables.has(tableId)) {
      this.handleError('Table already exists', null, 'init');
      return;
    }

    try {
      const config = {
        ...this.config,
        ...options,
        ...this.extractDataAttributes(table, this.config),
        params: {
          ...this.config.params,
          ...this.extractDataAttributes(table, this.config.params)
        }
      };

      this.state.tables.set(tableId, {
        id: tableId,
        element: table,
        config,
        data: [],
        sortState: {},
        filterWrapper: null,
        actionWrapper: null,
        paginationWrapper: null,
        filterElements: new Map(),
        filterData: new Map(),
        columns: new Map(),
        filterOptions: new Map(),
        elementInstances: new Map(),
        initializing: true // Flag to prevent redundant renders during setup
      });

      if (config.source) {
        this.bindToState(tableId, config.source);
      }

      this.setupTableStructure(tableId);
      this.setupAccessibility(table, tableId, config);
      this.setupEventListeners(tableId);

      // Load state from URL after setup so filter elements exist
      const urlStateLoaded = this.loadStateFromUrl(tableId);
      if (urlStateLoaded) {
        // Restore filter UI values from loaded URL state
        this.restoreFilterUIFromState(tableId);

        if (this.config.debug) {
          const tableObj = this.state.tables.get(tableId);
        }
      }

      // Load table data once (preventing redundant renders during init)
      // Only load if not already bound to state
      try {
        const tableObj = this.state.tables.get(tableId);
        const needsDataLoad = !config.source || !config.source.startsWith('state.');

        if (needsDataLoad) {
          const loadPromise = this.loadTableData(tableId);

          // Handle async completion
          if (loadPromise && typeof loadPromise.then === 'function') {
            loadPromise.finally(() => {
              const currentTableObj = this.state.tables.get(tableId);
              if (currentTableObj) {
                currentTableObj.initializing = false;
                this.renderTable(tableId);
              }
            });
          } else {
            // Synchronous completion
            if (tableObj) {
              tableObj.initializing = false;
              this.renderTable(tableId);
            }
          }
        } else {
          // For state-bound tables, just finish initialization
          if (tableObj) {
            tableObj.initializing = false;
          }
        }
      } catch (err) {
        console.warn(`TableManager: failed to load initial data for table ${tableId}:`, err);

        // Ensure initialization completes even on error
        const tableObj = this.state.tables.get(tableId);
        if (tableObj) {
          tableObj.initializing = false;
          this.renderTable(tableId);
        }
      }

      return tableId;

    } catch (error) {
      return this.handleError('Failed to initialize table', error, 'init');
    }
  },

  extractDataAttributes(element, defaultConfig) {
    const config = {};
    Object.keys(element.dataset).forEach(key => {
      const defaultValue = defaultConfig[key];

      if (defaultValue === undefined) return;

      try {
        if (Array.isArray(defaultValue)) {
          config[key] = element.dataset[key].split(',').map(item => item.trim());
        } else if (typeof defaultValue === 'object' && defaultValue !== null) {
          config[key] = JSON.parse(element.dataset[key]);
        } else if (typeof defaultValue === 'boolean') {
          config[key] = element.dataset[key] === 'true';
        } else if (typeof defaultValue === 'number') {
          config[key] = parseInt(element.dataset[key]);
        } else {
          config[key] = element.dataset[key];
        }
      } catch (error) {
        console.warn(`Unable to parse value for ${key}:`, error);
      }
    });
    return {...defaultConfig, ...config};
  },

  setupCheckboxes(table, tableId) {
    if (!table.config.showCheckbox) return;

    ['thead', 'tfoot'].forEach(section => {
      const tr = table.element.querySelector(`${section} tr:first-child`);
      if (tr) {
        let checkboxId = `select-all-${tableId}-${section}`;
        let checkbox = tr.querySelector('.select-all');
        if (!checkbox) {
          const label = document.createElement('label');
          label.htmlFor = checkboxId;

          checkbox = document.createElement('input');
          checkbox.type = 'checkbox';

          const cell = document.createElement(section === 'thead' ? 'th' : 'td');
          const rowspan = table.element.querySelectorAll(`${section} tr:first-child`).length;
          if (rowspan > 1) {
            cell.setAttribute('rowspan', rowspan);
          }
          cell.className = 'check-column';

          label.appendChild(checkbox);
          cell.appendChild(label);
          tr.insertBefore(cell, tr.firstChild);
        } else {
          if (checkbox.id) {
            checkboxId = checkbox.id;
          }
          const label = checkbox.closest('label');
          if (label) {
            label.htmlFor = checkboxId;
          }
          checkbox.closest('th, td').classList.add('check-column');
        }
        checkbox.className = 'select-all';
        checkbox.id = checkboxId;
        checkbox.setAttribute('aria-label', Now.translate('Select all'));
        checkbox.addEventListener('change', (e) => {
          this.handleSelectAll(table, tableId, e.target.checked);
        });
      }
    });
  },

  handleSelectAll(table, tableId, checked) {
    if (!table?.element) return;

    const checkboxes = table.element.querySelectorAll('tbody .select-row');
    checkboxes.forEach(cb => {
      cb.checked = checked;
    });

    const allCheckboxes = table.element.querySelectorAll('.select-all');
    allCheckboxes.forEach(cb => {
      cb.checked = checked;
    });

    this.handleRowSelection(table, tableId);
  },

  handleRowSelection(table, tableId) {
    const checkboxes = table.element.querySelectorAll('tbody .select-row');
    const checkedBoxes = table.element.querySelectorAll('tbody .select-row:checked');

    const allChecked = checkboxes.length > 0 && checkboxes.length === checkedBoxes.length;
    const someChecked = checkedBoxes.length > 0 && checkedBoxes.length < checkboxes.length;

    const allCheckboxes = table.element.querySelectorAll('.select-all');
    allCheckboxes.forEach(cb => {
      cb.checked = allChecked;
      cb.indeterminate = someChecked;
    });

    table.selectedRows = Array.from(checkedBoxes).map(cb => cb.value);

    if (table.config.onSelectionChange) {
      table.config.onSelectionChange(table.selectedRows);
    }

    Now.emit('table:selectionChange', {
      tableId: tableId,
      selectedRows: table.selectedRows
    });
  },

  clearSelection(table, tableId, options = {}) {
    if (!table?.element || !table.config.showCheckbox) return;

    const {emit = true} = options;

    const rowCheckboxes = table.element.querySelectorAll('tbody .select-row');
    rowCheckboxes.forEach(cb => {
      cb.checked = false;
      cb.closest('tr')?.classList.remove('selected-row');
    });

    const masterCheckboxes = table.element.querySelectorAll('.select-all');
    masterCheckboxes.forEach(cb => {
      cb.checked = false;
      cb.indeterminate = false;
    });

    const hadSelection = Array.isArray(table.selectedRows) && table.selectedRows.length > 0;
    table.selectedRows = [];

    if (table.actionElements?.submit?.element) {
      table.actionElements.submit.element.disabled = true;
    }

    if (typeof this.updateSelectedCount === 'function') {
      this.updateSelectedCount(table.element, 0);
    }

    if (emit && hadSelection) {
      if (typeof table.config.onSelectionChange === 'function') {
        table.config.onSelectionChange([]);
      }

      Now.emit('table:selectionChange', {
        tableId,
        selectedRows: []
      });
    }
  },

  setupTableStructure(tableId) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    const {element: tableEl, config} = table;
    const thead = tableEl.querySelector('thead');

    // Create tfoot if showFooter is enabled and tfoot doesn't exist
    let tfoot = tableEl.querySelector('tfoot');
    if (config.showFooter && !tfoot) {
      tfoot = document.createElement('tfoot');
      tableEl.appendChild(tfoot);

      // Create a default footer row matching thead structure
      if (thead) {
        const tr = document.createElement('tr');
        const thCount = thead.querySelector('tr')?.querySelectorAll('th').length || 0;

        for (let i = 0; i < thCount; i++) {
          const td = document.createElement('td');
          tr.appendChild(td);
        }

        tfoot.appendChild(tr);
      }
    }

    if (thead) {
      thead.querySelectorAll('th[data-sort]').forEach(th => {
        th.classList.add('sortable');
        th.setAttribute('role', 'columnheader');
        th.setAttribute('tabindex', '0');
      });

      // If row modification is enabled, ensure header has an actions column
      if (config.allowRowModification) {
        thead.querySelectorAll('tr').forEach(tr => {
          if (tr.querySelector('th.icons')) return;
          const th = document.createElement('th');
          th.className = 'icons';
          tr.appendChild(th);
        });

        if (tfoot) {
          tfoot.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('td.icons')) return;
            const td = document.createElement('td');
            td.className = 'icons';
            tr.appendChild(td);
          });
        }
      }

      const rowActionsRaw = tableEl.dataset.rowActions || tableEl.dataset.rowActionsJson;
      if (rowActionsRaw) {
        thead.querySelectorAll('tr').forEach(tr => {
          if (tr.querySelector('th.row-actions')) return;
          const th = document.createElement('th');
          th.className = 'row-actions';
          th.textContent = tableEl.dataset.rowActionsLabel || Now.translate('Actions');
          tr.appendChild(th);
        });

        if (tfoot) {
          tfoot.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('td.row-actions')) return;
            const td = document.createElement('td');
            td.className = 'row-actions';
            tr.appendChild(td);
          });
        }
      }
    }

    table.filterWrapper = document.createElement('div');
    table.filterWrapper.className = 'table_nav';
    tableEl.parentNode.insertBefore(table.filterWrapper, tableEl);

    table.actionWrapper = document.createElement('div');
    table.actionWrapper.className = 'table_nav';
    tableEl.parentNode.appendChild(table.actionWrapper);

    table.paginationWrapper = document.createElement('div');
    table.paginationWrapper.className = 'splitpage';
    tableEl.parentNode.appendChild(table.paginationWrapper);

    this.setupFilter(table, tableId);
    this.setupFooter(table);
    this.setupCheckboxes(table, tableId);
    this.setupActions(table, tableId);
    if (config?.pageSize > 0) {
      this.setupPagination(table, tableId);
    }
  },

  setupEventListeners(tableId) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    const {element: tableEl, config} = table;

    // Setup handler registry used by delegation and sort setup
    const handlers = {
      sort: new Map(),
      filter: new Map(),
      keyboard: null
    };

    // ensure table.eventHandlers exists for delegation code to append into
    if (!table.eventHandlers) table.eventHandlers = {};

    if (config.touchEnabled) {
      this.setupTouchEvents(table);
    }

    // Delegated event handlers on tbody to avoid per-element listeners
    try {
      const tbody = table.element.querySelector('tbody');
      if (tbody) {
        const delegatedClick = (e) => this._handleDelegatedClick(e, tableId);
        const delegatedChange = (e) => this._handleDelegatedChange(e, tableId);

        tbody.addEventListener('click', delegatedClick);
        tbody.addEventListener('change', delegatedChange);

        // store references for cleanup
        table.eventHandlers.delegation = {
          click: delegatedClick,
          change: delegatedChange
        };
      }

      // delegate filter controls (pageSize, selects, search) from filterWrapper
      if (table.filterWrapper) {
        const fwChange = (e) => {
          // rely on existing data-field or element ids from elementFactory
          const target = e.target;
          if (!target) return;
          // pageSize handled by attribute 'pageSize' name or element id starting with pageSize_
          const id = target.id || '';
          if (id.startsWith(`pageSize_${tableId}`) || target.dataset.field === 'pageSize') {
            const value = parseInt(target.value);
            this.handleFilterChange(table, tableId, 'pageSize', value, target);
            return;
          }

          // generic field-based filters
          const field = target.dataset.name || target.dataset.field || target.name;
          if (field) {
            const value = (target.type === 'checkbox') ? target.checked : target.value;
            this.handleFilterChange(table, tableId, field, value, target);
          }
        };

        table.filterWrapper.addEventListener('change', fwChange);
        table.eventHandlers.filterWrapperChange = fwChange;
      }
    } catch (err) {
      console.warn('Delegation setup failed', err);
    }

    // Setup column resizing if enabled
    this.setupColumnResizing(tableId);

    // Hook up actionWrapper button behavior (only button triggers action)
    if (table.actionWrapper && table.actionElements && table.actionElements.submit && table.actionElements.select) {
      const submitBtn = table.actionElements.submit.element;
      const selectEl = table.actionElements.select.element;
      if (submitBtn) {
        const onActionButtonClick = async (e) => {
          e.preventDefault();

          // Validate action selection first
          if (!selectEl.value || selectEl.value === '') {
            if (window.NotificationManager) {
              NotificationManager.warning(Now.translate('Please select an action'));
            } else {
              alert(Now.translate('Please select an action'));
            }
            return;
          }

          // Validate row selection
          const selectedCount = this.getSelectedRowIds(table)?.length || 0;
          if (selectedCount === 0) {
            if (window.NotificationManager) {
              NotificationManager.warning(Now.translate('Please select at least one row'));
            } else {
              alert(Now.translate('Please select at least one row'));
            }
            return;
          }

          // Show confirmation dialog with action name
          const message = Now.translate('You want to {action} the selected items ?', {action: selectEl.options[selectEl.selectedIndex].textContent});
          const confirmed = await DialogManager.confirm(message);
          if (confirmed) {
            this._performActionWrapperSubmission(tableId);
          }
        };
        submitBtn.addEventListener('click', onActionButtonClick);

        // store for cleanup
        table.eventHandlers.actionButton = onActionButtonClick;
      }
    }


    tableEl.querySelectorAll('thead th[data-sort]').forEach(th => {
      const sortHandler = (e) => {
        e.preventDefault();
        this.handleSort(table, tableId, th, e);
      };

      const keyHandler = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleSort(table, tableId, th, e);
        }
      };

      th.addEventListener('click', sortHandler);
      th.addEventListener('keydown', keyHandler);

      handlers.sort.set(th, {
        sort: sortHandler,
        key: keyHandler
      });

      th.setAttribute('role', 'columnheader');
      th.setAttribute('tabindex', '0');
      th.setAttribute('aria-sort', 'none');
    });

    // finalize event handler registry
    table.eventHandlers = handlers;
  },

  cleanupFilterEvents(table) {
    if (!table.filterElements) return;

    table.filterElements.forEach((element, elementId) => {
      if (elementId) {
        ElementManager.destroy(elementId);
      }
    });

    table.filterElements.clear();
  },

  handleSort(table, tableId, th, event = null) {
    if (!table || !tableId || !(th instanceof HTMLElement)) {
      throw new Error('Invalid parameters');
    }

    const {config} = table;
    const column = th.dataset.sort;

    const currentSort = table.sortState[column] || 'none';

    const newSort = currentSort === 'asc' ? 'desc' :
      currentSort === 'desc' ? 'none' : 'asc';

    // Check if multi-sort is enabled (either via config or Shift key)
    const isMultiSort = config.multiSort || (event && event.shiftKey);

    if (!isMultiSort) {
      // Single sort: clear other columns
      Object.keys(table.sortState).forEach(key => {
        if (key !== column) {
          delete table.sortState[key];
          const otherTh = table.element.querySelector(`th[data-sort="${key}"]`);
          if (otherTh) {
            otherTh.classList.remove('sort_asc', 'sort_desc');
            otherTh.setAttribute('aria-sort', 'none');
          }
        }
      });
    }

    if (newSort === 'none') {
      delete table.sortState[column];
      th.classList.remove('sort_asc', 'sort_desc');
      th.setAttribute('aria-sort', 'none');
      // Remove sort order indicator
      const sortOrder = th.querySelector('.sort-order');
      if (sortOrder) sortOrder.remove();
    } else {
      table.sortState[column] = newSort;
      th.classList.remove('sort_asc', 'sort_desc');
      th.classList.add(newSort === 'asc' ? 'sort_asc' : 'sort_desc');
      th.setAttribute('aria-sort', newSort === 'asc' ? 'ascending' : 'descending');

      // Add sort order indicator for multi-column sort
      if (isMultiSort && Object.keys(table.sortState).length > 1) {
        const sortIndex = Object.keys(table.sortState).indexOf(column) + 1;
        let sortOrder = th.querySelector('.sort-order');
        if (!sortOrder) {
          sortOrder = document.createElement('span');
          sortOrder.className = 'sort-order';
          th.appendChild(sortOrder);
        }
        sortOrder.textContent = sortIndex;
        sortOrder.setAttribute('aria-label', `Sort priority ${sortIndex}`);
      } else {
        // Remove sort order indicator for single sort
        const sortOrder = th.querySelector('.sort-order');
        if (sortOrder) sortOrder.remove();
      }
    }

    this.syncStateToUrl(tableId);

    this.clearSelection(table, tableId);

    // If table source is remote (api/... or http), reload from API with sort params
    const source = table.element.dataset.source || table.config.source || '';
    if (source && (source.startsWith('api/') || source.startsWith('http'))) {
      // Reset to page 1 when sorting changes
      table.config.params.page = 1;

      // Reload data from API using current sort and filter params
      this.loadFromApi(table, tableId, source).catch(err => {
        console.error('Sort load error', err);
        // On error, still render with client-side sort
        this.renderTable(tableId);
      });
      return;
    }

    // Local data: re-render using client-side sorting
    this.renderTable(tableId);
  },

  handleFieldChange(table, tableId, field, value, rowData, element, options = {send: true}) {
    try {
      if (options.send !== false) {
        if (rowData && typeof rowData === 'object') {
          try {rowData[field] = value;} catch (e) { /* ignore */}
        }
      }

      // If there's no action URL, or caller asked not to send, just update the local data
      const actionUrl = table?.element?.dataset?.actionUrl || table?.config?.actionUrl;
      if (!actionUrl || options.send === false) {
        // Emit event for local handling
        Now.emit('table:fieldChange', {
          tableId,
          field,
          value,
          rowData,
          element
        });
        return;
      }

      // Prepare data for server update
      const data = {
        action: 'update',
        field,
        ids: [rowData?.id],
        value
      };

      // Add loading state (guarding for missing element)
      const submitEl = (element && element.classList) ? element : (table?.element || null);
      if (submitEl && submitEl.classList) {
        submitEl.classList.add('loading');
      }

      // Send the update to the server
      this.sendAction(actionUrl, data, tableId, submitEl)
        .then(success => {
          if (success) {
            // Highlight success if element present
            if (element && element.classList) {
              element.classList.add('update-success');
              setTimeout(() => {
                if (element && element.classList) element.classList.remove('update-success');
              }, 1000);
            }
          } else {
            // Revert changes on error
            this.renderTable(tableId);
          }
        })
        .catch(error => {
          console.error('Field update error:', error);
          // Revert changes on error
          this.renderTable(tableId);
        })
        .finally(() => {
          // Remove loading state (guarded)
          if (submitEl && submitEl.classList) {
            submitEl.classList.remove('loading');
          }
          if (element && element.wrapper && element.wrapper.classList) {
            element.wrapper.classList.remove('loading');
          }
        });
    } catch (error) {
      this.handleError('Error updating field', error, 'handleFieldChange');

      // Remove loading state
      if (element) {
        element.classList.remove('loading');
        if (element.wrapper) {
          element.wrapper.classList.remove('loading');
        }
      }
    }
  },

  setupFilter(table, tableId) {
    if (!table?.filterWrapper) return;

    // Clear existing filters
    table.filterWrapper.innerHTML = '';
    table.filterElements = new Map();
    table.filterData = new Map();

    const {config} = table;
    const elementManager = Now.getManager('element');
    if (!elementManager) return;

    // Create a debounced filter change handler
    const debouncedFilterChange = Utils.function.debounce((table, tableId, key, value, element) => {
      this.handleFilterChange(table, tableId, key, value, element);
    }, 300);

    // Add page size selector if configured
    if (config.params.pageSize > 0 && Array.isArray(config.pageSizes) && config.pageSizes.length > 0) {
      const pageSizeOptions = {};
      config.pageSizes.forEach(size => {
        pageSizeOptions[size] = `${size} ${Now.translate('entries')}`;
      });

      const select = elementManager.create('select', {
        id: `pageSize_${tableId}`,
        options: pageSizeOptions,
        value: config.params.pageSize,
        label: Now.translate('Show'),
        wrapper: 'div',
        onChange: (element, value) => {
          debouncedFilterChange(table, tableId, 'pageSize', parseInt(value), element);
        }
      });

      if (select?.element) {
        table.filterWrapper.appendChild(select.wrapper);
        table.filterElements.set('pageSize', select);
        table.filterData.set('pageSize', select);
      }
    }

    // Get column definitions for filter setup
    table.columns = this.getColumnDefinitions(table);

    // Add column-specific filters
    table.columns.forEach((attributes, field) => {
      if (!attributes.filter) return;

      // Set initial filter value if defined
      if (attributes.value !== '') {
        config.params[field] = attributes.value;
      }

      // Configure element based on column attributes
      let elementConfig = {
        id: `filter_${field}_${tableId}`,
        name: field,
        label: attributes.label || field,
        placeholder: attributes.placeholder,
        value: config.params[field] || attributes.value || '',
        // Prepare options - if showAll is enabled, ensure an "All" option is present at the start
        options: (() => {
          const opts = attributes.options || {};
          if (attributes.showAll) {
            const allValue = attributes.allValue !== undefined ? attributes.allValue : '';
            const allLabel = attributes.allLabel || Now.translate('All');

            if (Array.isArray(opts)) {
              // Assume array of {value,text} or similar - insert at front
              return [{value: allValue, text: allLabel}, ...opts];
            }

            if (opts && typeof opts === 'object') {
              // Create a new object with the all option first (object property order preserved in most engines)
              return Object.assign({[allValue]: allLabel}, opts);
            }

            // Fallback: return as-is
            return opts;
          }
          return opts;
        })(),
        datalist: attributes.datalist || null,
        autocomplete: attributes.autocomplete || null,
        wrapper: 'div',
        wrapperClass: 'filter-control',
        onChange: (element, value) => {
          debouncedFilterChange(table, tableId, field, value, element);
        }
      };

      const elementObj = elementManager.create(attributes.type, elementConfig);

      if (elementObj?.element) {
        table.filterWrapper.appendChild(elementObj.wrapper);
        table.filterElements.set(field, elementObj);
        table.filterData.set(field, elementObj);
      }
    });

    // Add search box if search columns defined
    if (config.searchColumns?.length > 0) {
      const search = elementManager.create('search', {
        id: `search_${tableId}`,
        itemClass: 'search',
        value: config.params.search || '',
        placeholder: `${Now.translate('Search in')}: ${config.searchColumns.join(', ')}`,
        minLength: 2,
        onChange: (element, value) => {
          debouncedFilterChange(table, tableId, 'search', value, element);
        }
      });

      if (search?.element) {
        table.filterWrapper.appendChild(search.wrapper || search.element);
        table.filterElements.set('search', search);
        table.filterData.set('search', search);
      }
    }

    // If data arrived before filter setup and derived filters were stored, apply them now
    if (table.pendingDerivedFilters && Object.keys(table.pendingDerivedFilters).length) {
      try {
        this.setFilters(tableId, table.pendingDerivedFilters);
      } catch (err) {
        console.warn('Failed to apply pending derived filters:', err);
      }
      // clear pending
      table.pendingDerivedFilters = null;
    }
  },

  handleFilterChange(table, tableId, filterKey, value, element) {
    // Update filter data, reset to page 1
    table.config.params['page'] = 1;
    table.config.params[filterKey] = value;

    this.clearSelection(table, tableId);

    // Update URL with new parameters
    this.syncStateToUrl(tableId);

    // If table source is remote (api/... or http), reload from API with params
    const source = table.element.dataset.source || table.config.source || '';
    if (source && (source.startsWith('api/') || source.startsWith('http'))) {
      // reload data from API using current params
      this.loadFromApi(table, tableId, source).catch(err => console.error('Filter load error', err));
      return;
    }

    // local data: re-render using client-side filtering
    this.renderTable(tableId);
  },

  setupAccessibility(table, tableId, config) {
    if (!table) return;

    try {
      table.setAttribute('role', 'grid');
      table.setAttribute('aria-label', config?.label || table.dataset.label || 'Data Table');

      const thead = table.querySelector('thead');
      if (thead) {
        thead.setAttribute('role', 'rowgroup');

        thead.querySelectorAll('th[data-sort]').forEach(th => {
          th.setAttribute('role', 'columnheader');
          th.setAttribute('tabindex', '0');
          th.setAttribute('aria-sort', 'none');
          th.setAttribute('aria-label', `${th.textContent.trim()}, sortable column`);
        });

        thead.querySelectorAll('th:not([data-sort])').forEach(th => {
          th.setAttribute('role', 'columnheader');
        });
      }

      const tbody = table.querySelector('tbody');
      if (tbody) {
        tbody.setAttribute('role', 'rowgroup');

        tbody.querySelectorAll('tr').forEach((tr, index) => {
          tr.setAttribute('role', 'row');
          tr.setAttribute('tabindex', '0');
          tr.setAttribute('aria-rowindex', index + 1);

          tr.querySelectorAll('td').forEach((td, cellIndex) => {
            td.setAttribute('role', 'gridcell');
            td.setAttribute('aria-colindex', cellIndex + 1);
          });
        });
      }

      this.setupKeyboardNavigation(table, tableId);

      const announcer = document.createElement('div');
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.className = 'sr-only';
      table.parentNode.insertBefore(announcer, table.nextSibling);

      table.dataset.announcer = announcer.id = `table-announcer-${Date.now()}`;

    } catch (error) {
      this.handleError('Error setting up table accessibility', error, 'setupAccessibility');
    }
  },

  setupSortableRows(tableId) {
    const instance = this.state.tables.get(tableId);
    if (!instance?.element) return;

    const tbody = instance.element.querySelector('tbody');
    if (!tbody) return;

    instance.sortable = new Sortable(tbody, {
      handle: '.drag-handle',
      animation: 150,
      onStart: () => {
        tbody.classList.add('sorting');
      },
      onEnd: async (evt) => {
        tbody.classList.remove('sorting');

        const rows = Array.from(tbody.children);

        // Get new order
        const order = rows.map((row, index) => ({
          id: row.dataset.id,
          position: index
        }));

        const newData = [];
        order.forEach(item => {
          const data = instance.data.find(d => d.id === item.id);
          if (data) {
            newData.push(data);
          }
        });
        instance.data = newData;

        const sortUrl = instance.element.dataset.sortUrl;
        if (!sortUrl) return;

        try {
          const resp = await http.post(sortUrl, {order});

          if (resp && resp.success !== false) {
            if (window.NotificationManager) {
              NotificationManager.success(Now.translate('Sort order saved'));
            }
          } else {
            throw new Error('Failed to save sort order');
          }

        } catch (error) {
          console.error('Sort error:', error);
          if (window.NotificationManager) {
            NotificationManager.error(Now.translate('Failed to save sort order'));
          }
          this.renderTable(tableId); // Revert to original order
        }
      }
    });

    return instance.sortable;
  },

  enableRowSort(tableId) {
    const instance = this.state.tables.get(tableId);
    if (!instance?.element) return;

    instance.element.querySelectorAll('tbody tr').forEach(row => {
      if (!row.querySelector('.drag-handle')) {
        const handle = document.createElement('td');
        handle.className = 'drag-handle';
        handle.innerHTML = '⋮⋮';
        handle.style.cursor = 'move';
        handle.style.width = '2rem';
        handle.style.textAlign = 'center';
        row.insertBefore(handle, row.firstChild);
      }
    });

    if (!instance.sortable) {
      this.setupSortableRows(tableId);
    }
  },

  disableRowSort(tableId) {
    const instance = this.state.tables.get(tableId);
    if (!instance?.element) return;

    // Remove drag handles
    instance.element.querySelectorAll('.drag-handle').forEach(handle => {
      handle.remove();
    });

    if (instance.sortable) {
      instance.sortable.destroy();
      instance.sortable = null;
    }
  },

  async loadTableData(tableId) {
    const table = this.state.tables.get(tableId);
    if (!table?.element) return;

    this.clearSelection(table, tableId);

    try {
      const source = table.element.dataset.source;

      if (!source) {
        this.loadFromHtml(table);
        return;
      }

      this.showLoading(table);

      if (source.startsWith('api/') || source.startsWith('http')) {
        await this.loadFromApi(table, tableId, source);
      } else if (source.endsWith('.json')) {
        await this.loadFromJson(tableId, source);
      } else {
        this.loadFromState(tableId, source);
      }

    } catch (error) {
      this.handleError(`Error loading table data`, error, 'loadData');
    }
  },

  async loadFromApi(table, tableId, source) {
    const params = {
      ...this.getFilterParams(table),
      ...this.getSortParams(table),
      ...this.getPaginationParams(table)
    };

    await this.fetchAndSet(tableId, source, {
      method: table.config.method || 'GET',
      headers: {
        'Accept': 'application/json'
      },
      params
    });
  },

  async loadFromJson(tableId, source) {
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    await this.fetchAndSet(tableId, source, options);
  },

  async fetchAndSet(tableId, url, options = {}) {
    try {
      const {
        method = 'GET',
        headers = {},
        params,
        body,
        data,
        credentials,
        ...restOptions
      } = options;

      const upperMethod = method.toUpperCase();
      const payload = typeof body !== 'undefined' ? body : data;
      const defaultCredentials = credentials || (window.ApiService?.config?.security?.sendCredentials ? 'include' : 'same-origin');
      const apiCache = ApiService.config.cache;
      apiCache.enabled = false; // disable caching for table data fetches
      let response;

      const apiOptions = {
        ...restOptions,
        headers,
        credentials: defaultCredentials,
        cache: apiCache
      };

      const methodName = upperMethod.toLowerCase();

      if (upperMethod === 'GET') {
        response = await ApiService.get(url, params || {}, apiOptions);
      } else if (typeof ApiService[methodName] === 'function') {
        response = await ApiService[methodName](url, payload, {
          ...apiOptions,
          params
        });
      } else {
        throw new Error(`Unsupported request method: ${upperMethod}`);
      }

      if (response?.success === false) {
        throw new Error(response?.message || response?.statusText || `Request failed (${response?.status || 'unknown'})`);
      }

      const responseData = response?.data?.data ?? response?.data ?? response;

      const table = this.state.tables.get(tableId);
      if (table && responseData && responseData.meta && typeof responseData.meta === 'object') {
        table.serverSide = true;
      }

      this.setData(tableId, responseData);
    } catch (error) {
      this.handleError('Fetch error', error, 'fetchAndSet');
    }
  },

  loadFromHtml(table, tableId) {
    // Support being passed either the internal table state object or a DOM element.
    let tableObj = null;
    let tableEl = null;
    let finalTableId = tableId;

    if (!table) return;

    if (table.element) {
      // table is the internal state object
      tableObj = table;
      tableEl = table.element;
      finalTableId = finalTableId || tableObj.id || (tableEl && tableEl.dataset && tableEl.dataset.table);
    } else if (table instanceof Element) {
      // table is a DOM element
      tableEl = table;
      finalTableId = finalTableId || (tableEl.dataset && tableEl.dataset.table);
      tableObj = this.state.tables.get(finalTableId) || {element: tableEl, id: finalTableId};
    } else {
      // unknown input
      return;
    }

    if (!tableEl) return;

    const headers = [...tableEl.querySelectorAll('th')]
      .map(th => ({
        field: th.dataset.field || th.textContent.trim().toLowerCase(),
        sort: th.dataset.sort,
        formatter: th.dataset.formatter
      }));

    const rawRows = [...tableEl.querySelectorAll('tbody tr')]
      .map(tr => {
        const row = {};
        [...tr.cells].forEach((cell, index) => {
          const header = headers[index] || {field: `col_${index}`};
          row[header.field] = {
            text: cell.textContent.trim(),
            html: cell.innerHTML
          };
        });
        return row;
      });

    // Build normalized rows where each cell is a primitive (string) for filtering/sorting
    const normalizedRows = rawRows.map(r => {
      const nr = {};
      Object.entries(r).forEach(([k, v]) => {
        if (v === null || v === undefined) {
          nr[k] = v;
        } else if (typeof v === 'object') {
          nr[k] = v.text !== undefined ? v.text : (v.html !== undefined ? v.html : JSON.stringify(v));
        } else {
          nr[k] = v;
        }
      });
      return nr;
    });

    // store originalData on the internal table object if available
    try {
      if (tableObj) tableObj.originalData = rawRows;
    } catch (e) {
      // ignore
    }

    // Ensure we pass a valid tableId into setData using normalized primitive data
    if (finalTableId) {
      this.setData(finalTableId, normalizedRows);
    } else {
      // fallback: attempt to find tableId by matching element reference
      for (const [tid, t] of this.state.tables.entries()) {
        if (t.element === tableEl) {
          this.setData(tid, normalizedRows);
          return;
        }
      }
      // If still not found, log and skip
      console.warn('TableManager: unable to determine tableId for HTML data load');
    }
  },

  loadFromState(tableId, stateKey) {
    // Prefer using the registered state manager if available
    const stateManager = Now.getManager ? Now.getManager('state') : null;
    if (!stateManager || typeof stateManager.get !== 'function') {
      throw new Error('Now.js state manager not available');
    }

    // Try to read current value first
    const data = stateManager.get(stateKey);
    if (data) {
      this.setData(tableId, data);
      return;
    }

    // If no data yet, try to subscribe for future updates (StateManager should provide subscribe)
    if (typeof stateManager.subscribe === 'function') {
      const handler = (newValue) => {
        if (!newValue) return;
        try {
          this.setData(tableId, newValue);
        } catch (err) {
          console.error('Error applying state update to table:', err);
        } finally {
          // Unsubscribe after first successful set if possible
          if (typeof stateManager.unsubscribe === 'function') {
            stateManager.unsubscribe(stateKey, handler);
          } else if (typeof stateManager.off === 'function') {
            stateManager.off(stateKey, handler);
          }
        }
      };

      try {
        stateManager.subscribe(stateKey, handler);
      } catch (err) {
        console.warn(`Unable to subscribe to state key ${stateKey}:`, err);
      }
      return;
    }

    // Fallback: no data and no subscribe method — leave table empty but do not throw
    console.warn(`State key ${stateKey} not found and state manager has no subscribe; table ${tableId} will remain empty until data is set`);
  },

  setData(tableId, data) {
    if (!tableId) {
      throw new Error('Invalid parameters');
    }

    let normalized = null;
    if (Array.isArray(data)) {
      normalized = {
        data,
        meta: (data && data.meta) ? {...data.meta} : {total: data.length},
        filters: (data && data.filters) ? data.filters : {},
        options: (data && data.options) ? data.options : {}
      };
    } else if (data && Array.isArray(data.data)) {
      normalized = {
        data: data.data,
        meta: data.meta ? {...data.meta} : {total: data.data.length},
        filters: data.filters || {},
        options: data.options || {}
      };
    } else {
      throw new Error('Invalid data payload: expected canonical schema {data:[], meta:{page: 1, pageSize: 20, total: 0}, filters:{}, options:{}}');
    }

    const table = this.state.tables.get(tableId);
    if (!table) return;

    try {
      // Store options from API response for data formatting (e.g., lookup)
      if (normalized.options && Object.keys(normalized.options).length) {
        if (!table.dataOptions) table.dataOptions = {};
        Object.assign(table.dataOptions, normalized.options);
      }

      // Also check if filters contain option arrays and store them as dataOptions
      if (normalized.filters && Object.keys(normalized.filters).length) {
        this.setFilters(tableId, normalized.filters);

        // Extract options from filters for data formatting
        if (!table.dataOptions) table.dataOptions = {};
        Object.entries(normalized.filters).forEach(([key, value]) => {
          if (Array.isArray(value) && value.length > 0) {
            // Convert array to object for lookup
            const optionsMap = {};
            value.forEach(item => {
              if (item && typeof item === 'object') {
                const val = item.value !== undefined ? item.value : (item.key !== undefined ? item.key : item);
                const label = item.label || item.text || String(item);
                optionsMap[val] = label;
              } else {
                optionsMap[item] = String(item);
              }
            });
            table.dataOptions[key] = optionsMap;
          }
        });
      }

      table.config.params = {
        ...table.config.params,
        ...normalized.meta,
        page: parseInt(normalized.meta.page || table.config.params.page),
        pageSize: parseInt(normalized.meta.pageSize || table.config.params.pageSize),
        total: parseInt(normalized.meta.total || 0)
      };

      const tableContent = normalized.data || [];
      if (!Array.isArray(tableContent)) {
        throw new Error('Invalid data format: expected array');
      }
      table.data = tableContent;

      // If API/state did not provide filter option lists, derive them from data for select filters
      try {
        const derived = this.deriveFiltersFromData(table);
        if (derived && Object.keys(derived).length) {
          // If filter elements already exist, apply immediately; otherwise store for setupFilter to apply
          if (table.filterElements && (typeof table.filterElements.size === 'number' ? table.filterElements.size > 0 : Object.keys(table.filterElements).length > 0)) {
            this.setFilters(tableId, derived);
          } else {
            table.pendingDerivedFilters = derived;
          }
        }
      } catch (err) {
        console.warn('Failed to derive filter options from data:', err);
      }

      // Don't reset sortState - preserve user's sort selection
      // Only reset if explicitly requested via options
      if (normalized.resetSort === true) {
        table.sortState = {};
      }

      // Only render if not initializing to prevent redundant renders
      if (!table.initializing) {
        this.renderTable(tableId);
      }
    } catch (error) {
      this.handleError('Setting table data', error, 'setData');
      table.data = [];

      // Only render if not initializing
      if (!table.initializing) {
        this.renderTable(tableId);
      }
    }
  },

  setFilters(tableId, filters) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    try {
      table.filterOptions = filters;
      Object.entries(filters).forEach(([key, values]) => {
        const filterElement = table.filterData.get(key);
        const attributes = table.columns.get(key);
        if (filterElement && filterElement.element) {
          // Build ordered array of options: [{value, text}, ...]
          const optionsArray = [];

          // If configured to show an "All" option, add it first
          if (attributes && attributes.showAll) {
            optionsArray.push({
              value: attributes.allValue || '',
              text: Now.translate(attributes.allLabel || 'All')
            });
          }

          // Normalize values (can be Map, Array, or plain object)
          if (values instanceof Map) {
            for (const [v, label] of values.entries()) {
              optionsArray.push({value: v, text: label});
            }
          } else if (Array.isArray(values)) {
            values.forEach(item => {
              if (item && typeof item === 'object') {
                const val = item.value !== undefined ? item.value : (item.key !== undefined ? item.key : item);
                const txt = item.text || item.label || String(item);
                optionsArray.push({value: val, text: txt});
              } else {
                optionsArray.push({value: item, text: String(item)});
              }
            });
          } else if (typeof values === 'object' && values !== null) {
            // plain object: iterate entries in insertion order
            Object.entries(values).forEach(([v, label]) => {
              optionsArray.push({value: v, text: label});
            });
          }

          // Prefer element-based lookup to avoid stale id-only instances
          let emInstance = null;
          try {
            if (ElementManager && typeof ElementManager.getInstanceByElement === 'function') {
              emInstance = ElementManager.getInstanceByElement(filterElement.element) || null;
            }
            if (!emInstance && filterElement.element?.id && typeof ElementManager.getInstance === 'function') {
              emInstance = ElementManager.getInstance(filterElement.element.id) || null;
              if (emInstance && emInstance.element && emInstance.element !== filterElement.element && !emInstance.element.isConnected) {
                try {ElementManager.destroy(filterElement.element.id);} catch (e) {}
                emInstance = null;
              }
            }
          } catch (e) {
            emInstance = null;
          }

          if (emInstance?.updateOptions && typeof emInstance.updateOptions === 'function') {
            emInstance.updateOptions(optionsArray);

            // Restore selected value from config params (URL state) after updating options
            let valueToRestore = null;
            if (table.config.params[key] !== undefined && table.config.params[key] !== null && table.config.params[key] !== '') {
              valueToRestore = table.config.params[key];
            } else if (filterElement.element.value !== undefined) {
              valueToRestore = filterElement.element.value;
            }

            if (valueToRestore !== null) {
              // Set value through instance if available
              if (emInstance.setValue && typeof emInstance.setValue === 'function') {
                emInstance.setValue(valueToRestore);
              } else if (filterElement.element) {
                filterElement.element.value = valueToRestore;
              }
            }
          } else {
            // Fallback: try to update DOM select element directly
            try {
              const el = filterElement.element;
              // If wrapper contains select, prefer that
              const selectEl = (el && el.tagName === 'SELECT') ? el : (el && el.querySelector ? el.querySelector('select') : null);
              if (selectEl) {
                selectEl.innerHTML = '';
                optionsArray.forEach(opt => {
                  const option = document.createElement('option');
                  option.value = opt.value;
                  option.textContent = opt.text;
                  selectEl.appendChild(option);
                });

                // Restore selected value from config params (URL state) or current element value
                let valueToRestore = null;
                if (table.config.params[key] !== undefined && table.config.params[key] !== null && table.config.params[key] !== '') {
                  // Prioritize URL/config params
                  valueToRestore = table.config.params[key];
                } else if (filterElement.element.value !== undefined) {
                  // Fallback to current element value
                  valueToRestore = filterElement.element.value;
                }

                if (valueToRestore !== null) {
                  // Check if the value exists in options
                  const hasOption = Array.from(selectEl.options).some(opt => opt.value === String(valueToRestore));
                  if (hasOption) {
                    selectEl.value = valueToRestore;
                  }
                }
              } else if (el && el.updateOptions && typeof el.updateOptions === 'function') {
                el.updateOptions(optionsArray);
              } else {
                console.warn('No method found to update filter element options for', key);
              }
            } catch (err) {
              console.warn('Failed DOM fallback for updating filter options', err);
            }
          }
        }
      });

      // After updating all filter options, restore UI state from config params
      // This ensures URL parameters are applied after API options are loaded
      this.restoreFilterUIFromState(tableId);

    } catch (error) {
      console.error('Error setting filters:', error);
    }
  },

  deriveFiltersFromData(table) {
    if (!table || !Array.isArray(table.data)) return {};

    const result = {};
    // Only derive for columns configured as filterable and of select type
    table.columns.forEach((attributes, field) => {
      if (!attributes.filter) return;
      // If options already provided via attributes or filterOptions, skip deriving
      if ((attributes.options && Object.keys(attributes.options).length) || (table.filterOptions && table.filterOptions[field])) return;

      const values = new Map();
      table.data.forEach(row => {
        const val = row[field];
        if (val === undefined || val === null) return;
        const key = typeof val === 'object' ? (val.value !== undefined ? val.value : (val.text !== undefined ? val.text : JSON.stringify(val))) : val;
        if (!values.has(key)) values.set(key, String(key));
      });

      // Convert Map to array of {value,text} for deterministic ordering
      if (values.size > 0) {
        result[field] = Array.from(values.entries()).map(([value, text]) => ({value, text}));
      }
    });

    return result;
  },

  renderTable(tableId) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    const {element: tableEl, data, config} = table;

    const tbody = tableEl.querySelector('tbody');
    if (!tbody) return;

    try {
      tbody.innerHTML = '';

      // Check if data comes from API (server-side)
      const source = tableEl.dataset.source || config.source || '';
      const isServerSide = source && (source.startsWith('api/') || source.startsWith('http'));

      let filteredData = data;
      let pageData = data;
      let totalPages = 1;
      let totalRecords = data.length;

      if (isServerSide) {
        // Server-side: API already filtered, sorted, and paginated
        // Just display the data as-is
        pageData = data;
        totalRecords = config.params.total || data.length;
        totalPages = config.params.totalPages || Math.ceil(totalRecords / (config.params.pageSize || data.length));
      } else {
        // Client-side: apply filtering, sorting, and pagination
        filteredData = this.filterData(table, data);
        filteredData = this.sortData(table, filteredData);
        const paginationResult = this.paginateData(table, filteredData);
        pageData = paginationResult.pageData;
        totalPages = paginationResult.totalPages;
        totalRecords = paginationResult.totalRecords;
      }

      if (pageData.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = tableEl.querySelectorAll('thead th').length;
        td.className = 'empty-table';
        td.textContent = Now.translate('No data available');
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        pageData.forEach((item, index) => {
          const tr = this.renderRow(table, tableId, item, index);
          tbody.appendChild(tr);
        });
      }

      // Restore sort UI state on headers
      this.restoreSortUI(table);

      this.setupFooter(table);

      if (config.params.pageSize > 0) {
        this.updatePagination(table, tableId, totalRecords, totalPages);
      }

      Now.emit('table:render', {
        tableId,
        data: pageData,
        totalRecords: isServerSide ? totalRecords : data.length,
        filteredRecords: isServerSide ? totalRecords : filteredData.length,
        isServerSide
      });
    } catch (error) {
      this.handleError('Rendering table', error, 'render');
    }
  },

  restoreSortUI(table) {
    if (!table || !table.element) return;

    // First, clear all sort classes, aria-sort, and sort order indicators
    table.element.querySelectorAll('th[data-sort]').forEach(th => {
      th.classList.remove('sort_asc', 'sort_desc');
      th.setAttribute('aria-sort', 'none');
      const sortOrder = th.querySelector('.sort-order');
      if (sortOrder) sortOrder.remove();
    });

    // Then, apply current sort state
    if (table.sortState && Object.keys(table.sortState).length > 0) {
      const sortKeys = Object.keys(table.sortState);
      const isMultiSort = sortKeys.length > 1;

      Object.entries(table.sortState).forEach(([column, direction], index) => {
        const th = table.element.querySelector(`th[data-sort="${column}"]`);
        if (th) {
          th.classList.add(direction === 'asc' ? 'sort_asc' : 'sort_desc');
          th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');

          // Add sort order indicator for multi-column sort
          if (isMultiSort) {
            let sortOrder = th.querySelector('.sort-order');
            if (!sortOrder) {
              sortOrder = document.createElement('span');
              sortOrder.className = 'sort-order';
              th.appendChild(sortOrder);
            }
            sortOrder.textContent = index + 1;
            sortOrder.setAttribute('aria-label', `Sort priority ${index + 1}`);
          }
        }
      });
    }
  },

  renderRow(table, tableId, item, index) {
    const tr = document.createElement('tr');

    if (item.id) {
      tr.dataset.id = item.id;
    }

    if (table.config.showCheckbox) {
      const td = document.createElement('td');
      td.className = 'check-column';

      const checkboxId = `select-row-${tableId}-${item.id || index}`;

      const label = document.createElement('label');
      label.htmlFor = checkboxId;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'select-row';
      checkbox.id = checkboxId;
      checkbox.value = item.id || index;
      checkbox.addEventListener('change', () => {
        this.handleRowSelection(table, tableId);
      });

      label.appendChild(checkbox);
      td.appendChild(label);
      tr.appendChild(td);
    }

    table.columns.forEach((attributes, field) => {
      this.renderCell(table, tableId, tr, field, attributes, item, index);
    });

    if (table.config.allowRowModification) {
      const td = document.createElement('td');
      td.className = 'icons';
      const div = document.createElement('div');
      const buttons = [
        {
          action: 'copy',
          title: Now.translate('Copy'),
          text: '+',
          className: 'plus',
          handler: () => this.handleCopyRow(table, tableId, item)
        },
        {
          action: 'delete',
          title: Now.translate('Delete'),
          text: '-',
          className: 'minus',
          handler: () => this.handleDeleteRow(table, tableId, item)
        }
      ];

      buttons.forEach(btn => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = btn.className;
        button.title = btn.title;
        button.innerText = btn.text;
        button.setAttribute('aria-label', btn.title);

        button.addEventListener('click', (e) => {
          e.preventDefault();
          btn.handler();
        });

        div.appendChild(button);
      });

      td.appendChild(div);
      tr.appendChild(td);
    }

    // If table defines data-row-actions, render action cell (uses data-row-actions JSON)
    const rowActionsRaw = table.element.dataset.rowActions || table.element.dataset.rowActionsJson;
    if (rowActionsRaw) {
      try {
        const actions = this.parseRowActions(rowActionsRaw);
        const actionCell = this.createActionCell(table, tableId, item, actions);
        tr.appendChild(actionCell);
      } catch (err) {
        console.warn('Invalid data-row-actions for table', tableId, err);
      }
    }

    return tr;
  },

  handleCopyRow(table, tableId, item) {
    try {
      const newItem = {...item};
      delete newItem.id;

      table.data.push(newItem);

      this.renderTable(tableId);

      Now.emit('table:rowCopied', {
        tableId,
        originalItem: item,
        newItem
      });
    } catch (error) {
      this.handleError('Copy row', error, 'copyRow');
    }
  },

  async handleDeleteRow(table, tableId, item) {
    try {
      if (window.DialogManager && table.config.confirmDelete !== false) {
        const confirmed = await DialogManager.confirm(
          Now.translate('Are you sure you want to delete this item?'),
          Now.translate('Confirm Delete')
        );

        if (confirmed) {
          this.deleteRow(table, tableId, item);
        }
      } else {
        this.deleteRow(table, tableId, item);
      }

    } catch (error) {
      this.handleError('Delete row', error, 'deleteRow');
    }
  },

  deleteRow(table, tableId, item) {
    try {
      if (table.data.length > 1) {
        const index = table.data.findIndex(row => row.id === item.id);
        if (index !== -1) {
          table.data.splice(index, 1);
        }

        this.renderTable(tableId);

        if (window.NotificationManager) {
          NotificationManager.success(Now.translate('Row deleted successfully'));
        }

        Now.emit('table:rowDeleted', {
          tableId,
          item
        });
      }
    } catch (error) {
      this.handleError('Delete row', error, 'deleteRow');
    }
  },

  getColumnDefinitions(table) {
    const columns = new Map();
    const mergeInfo = new Map();
    const thead = table.element.querySelector('thead');

    thead.querySelectorAll('tr').forEach((tr, rowIndex) => {
      let currentCol = 0;
      tr.querySelectorAll('th').forEach((th, colIndex) => {
        const field = th.dataset.field;
        const rowspan = parseInt(th.getAttribute('rowspan') || 1);
        const colspan = parseInt(th.getAttribute('colspan') || 1);

        while (mergeInfo.has(`${rowIndex}-${currentCol}`)) {
          currentCol++;
        }

        if (rowspan > 1 || colspan > 1) {
          for (let r = 0; r < rowspan; r++) {
            for (let c = 0; c < colspan; c++) {
              mergeInfo.set(`${rowIndex + r}-${currentCol + c}`, {
                field,
                rowspan,
                colspan,
                startRow: rowIndex,
                startCol: currentCol
              });
            }
          }
        }

        if ((rowspan === thead.rows.length || rowIndex === thead.rows.length - 1) && field) {
          const attributes = this.extractDataAttributes(th, {
            field: '',
            filter: '',
            value: '',
            type: '',
            placeholder: '',
            options: {},
            datalist: {},
            label: '',
            min: '',
            max: '',
            step: '',
            pattern: '',
            maxLength: 0,
            showAll: true,
            allLabel: 'All items',
            allValue: '',
            formatter: '',
            format: '',
            class: '',
            element: '',
            autocomplete: 'off',
            template: ''
          });

          columns.set(field, {
            ...attributes,
            index: currentCol,
            mergeInfo: mergeInfo.get(`${rowIndex}-${currentCol}`) || null
          });
        }

        currentCol += colspan;
      });
    });

    return new Map([...columns.entries()].sort((a, b) => a[1].index - b[1].index));
  },

  setupFooter(table) {
    const tfoot = table.element.querySelector('tfoot');
    if (!tfoot) return;

    const columns = this.getColumnGroups(table);

    // Reset processed flags to allow re-calculation on each render
    tfoot.querySelectorAll('td[data-processed]').forEach(td => {
      delete td.dataset.processed;
    });

    // Add checkbox column to footer if enabled
    if (table.config.showCheckbox) {
      tfoot.querySelectorAll('tr').forEach(tr => {
        // Check if checkbox column already exists
        if (!tr.querySelector('.check-column')) {
          const td = document.createElement('td');
          td.className = 'check-column';

          // Add checkbox if specified
          if (tr.dataset.showCheckbox === 'true') {
            const checkboxId = `select-all-${table.id}-footer`;
            const label = document.createElement('label');
            label.htmlFor = checkboxId;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'select-all';
            checkbox.id = checkboxId;
            checkbox.setAttribute('aria-label', Now.translate('Select all'));
            checkbox.addEventListener('change', (e) => {
              this.handleSelectAll(table, table.id, e.target.checked);
            });

            label.appendChild(checkbox);
            td.appendChild(label);
          }

          tr.insertBefore(td, tr.firstChild);
        }
      });
    }

    // Process each footer row
    tfoot.querySelectorAll('tr').forEach(tr => {
      tr.querySelectorAll('td').forEach((td, index) => {
        // Skip if already processed (has data-processed attribute)
        if (td.dataset.processed === 'true') return;

        // Check for aggregate functions
        const aggregateType = Object.keys(td.dataset)
          .find(key => ['sum', 'avg', 'count', 'min', 'max', 'custom'].includes(key));

        if (!aggregateType) return;

        // Handle custom aggregate function
        if (aggregateType === 'custom') {
          const customFn = td.dataset.custom;
          if (customFn && window[customFn] && typeof window[customFn] === 'function') {
            try {
              const value = window[customFn](table.data, td, table);
              td.textContent = value;
            } catch (error) {
              console.error(`Error executing custom footer function ${customFn}:`, error);
            }
          }
          td.dataset.processed = 'true';
          return;
        }

        const field = td.dataset[aggregateType];
        if (!field) return;

        // Calculate aggregate value
        const value = this.calculateAggregate(
          table.data,
          field,
          aggregateType
        );

        // Format the value
        const format = td.dataset.format || columns[index]?.format;
        const formattedValue = this.formatValue(value, format);

        // Add prefix/suffix if specified
        const prefix = td.dataset.prefix || '';
        const suffix = td.dataset.suffix || '';
        td.textContent = prefix + formattedValue + suffix;

        // Apply CSS class
        if (td.dataset.class || columns[index]?.class) {
          td.className = (td.dataset.class || columns[index].class) + ' aggregate-cell';
        } else {
          td.className = 'aggregate-cell';
        }

        // Mark as processed
        td.dataset.processed = 'true';
      });
    });

    // Emit event for custom processing
    Now.emit('table:footerSetup', {
      tableId: table.id,
      tfoot: tfoot,
      data: table.data
    });
  },

  calculateAggregate(data, field, type) {
    if (!data?.length || !field) return 0;

    const values = data
      .map(row => parseFloat(row[field]))
      .filter(val => !isNaN(val));

    if (!values.length) return 0;

    switch (type) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'count':
        return values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default:
        return 0;
    }
  },

  calculateGroupAggregate(data, fields, type) {
    if (!data?.length || !fields?.length) return 0;

    const values = data.map(row =>
      fields.reduce((sum, field) => {
        const val = parseFloat(row[field]);
        return sum + (isNaN(val) ? 0 : val);
      }, 0)
    );

    return this.calculateAggregate(values, 'value', type);
  },

  getColumnGroups(table) {
    const groups = [];
    const thead = table.element.querySelector('thead');
    if (!thead || !thead.rows.length) return groups;

    const lastRow = thead.rows[thead.rows.length - 1];
    if (!lastRow) return groups;

    const columns = Array.from(lastRow.cells).map(th => ({
      field: th.dataset.field || null,
      format: th.dataset.format || null,
      class: th.dataset.class || null
    }));

    return columns;
  },

  updateTableCaption(table, totalRecords, totalPages) {
    if (!table?.element || !table.config.showCaption) return;

    const {pageSize, page, search} = table.config.params;

    let caption = table.element.querySelector('caption');

    if (!caption) {
      caption = document.createElement('caption');
      table.element.appendChild(caption);
    }

    let searchText = '';
    if (search && search.length > 0) {
      searchText = "Search <strong>{search}</strong> found {count} entries, displayed {start} to {end}, page {page} of {total} pages";
    } else {
      searchText = "All {count} entries, displayed {start} to {end}, page {page} of {total} pages";
    }

    const params = {
      count: totalRecords,
      start: (page - 1) * pageSize + 1,
      end: Math.min(page * pageSize, totalRecords),
      page: page,
      total: totalPages,
      search: search
    };

    let translated = Now.translate(searchText, params);

    if (typeof translated === 'string' && /\{[^}]+\}/.test(translated)) {
      try {
        const i18n = Now.getManager ? Now.getManager('i18n') : window.I18nManager;
        if (i18n && typeof i18n.interpolate === 'function') {
          translated = i18n.interpolate(translated, params, i18n.getTranslations?.());
        } else {
          // Fallback simple interpolation
          translated = String(translated).replace(/\{([^}]+)\}/g, (m, k) => {
            return params[k] !== undefined ? params[k] : m;
          });
        }
      } catch (err) {}
    }

    caption.innerHTML = translated;
  },

  filterData(table, data) {
    if (!table || !table.config.params || Object.keys(table.config.params).length === 0) {
      return data;
    }

    const filters = table.config.params;
    const searchColumns = table.config.searchColumns || [];

    return data.filter(item => {
      const generalFilters = Object.entries(filters).every(([field, filterValue]) => {
        if (['search', 'pageSize', 'page', 'total', 'summary'].includes(field)) return true;

        if (filterValue === '') return true;

        const value = item[field];
        if (value === undefined || value === null) return false;

        const attributes = table.columns.get(field);
        if (attributes.showAll && filterValue.toString() === attributes.allValue.toString()) return true;

        const filterFn = table.element.querySelector(`th[data-field="${field}"]`)?.dataset.filterFn;
        if (filterFn && typeof window[filterFn] === 'function') {
          return window[filterFn](value, filterValue, item);
        }

        return value.toString() === filterValue.toString();
      });

      const searchFilter = !filters.search || searchColumns.some(column => {
        const value = item[column];
        if (value === undefined || value === null) return false;

        return value.toString().toLowerCase()
          .includes(filters.search.toLowerCase());
      });

      return generalFilters && searchFilter;
    });
  },

  sortData(table, data) {
    if (!table || !table.sortState || Object.keys(table.sortState).length === 0) {
      return data;
    }

    return [...data].sort((a, b) => {
      for (const [field, direction] of Object.entries(table.sortState)) {
        const aVal = a[field];
        const bVal = b[field];

        const sorter = table.element.querySelector(`th[data-field="${field}"]`)?.dataset.sorter;
        if (sorter && typeof window[sorter] === 'function') {
          const result = window[sorter](aVal, bVal, a, b);
          if (result !== 0) return direction === 'asc' ? result : -result;
          continue;
        }

        if (aVal === bVal) continue;

        const result = aVal > bVal ? 1 : -1;
        return direction === 'asc' ? result : -result;
      }
      return 0;
    });
  },

  paginateData(table, data) {
    if (!table || table.config.params.pageSize <= 0) {
      return {pageData: data, totalPages: 1, totalRecords: data.length};
    }

    const {pageSize, page} = table.config.params;
    const start = (page - 1) * pageSize;
    let pageData;
    if (table.serverSide) {
      // Assume server returned the page's rows already
      pageData = data;
    } else {
      pageData = data.slice(start, start + pageSize);
    }

    // If server provided a total (via meta), use it; otherwise derive from data length
    const totalRecords = parseInt(table.config.params.total || data.length || 0);
    const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalRecords / pageSize)) : 1;

    return {pageData, totalPages, totalRecords};
  },

  updatePagination(table, tableId, totalRecords, totalPages) {
    if (!table) return;

    table.paginationWrapper.innerHTML = '';

    if (totalPages > 1) {
      let startPage = Math.max(1, table.config.params.page - 2);
      let endPage = Math.min(totalPages, startPage + 4);

      if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
      }

      if (startPage > 1) {
        this.addPaginationButton(table, tableId, 1, '1', table.config.params.page);
      }

      for (let i = startPage; i <= endPage; i++) {
        this.addPaginationButton(table, tableId, i, i, table.config.params.page);
      }

      if (endPage < totalPages) {
        this.addPaginationButton(table, tableId, totalPages, totalPages, table.config.params.page);
      }
    }

    this.updateTableCaption(table, totalRecords, totalPages);
  },

  addPaginationButton(table, tableId, page, text, currentPage) {
    const button = document.createElement('button');
    button.textContent = text;
    button.setAttribute('type', 'button');

    if (page !== currentPage) {
      button.classList.add('pagination-button');
      button.setAttribute('aria-label', Now.translate('Go to page {page}', {page}));
      button.onclick = (e) => {
        e.preventDefault();
        this.handleFilterChange(table, tableId, 'page', parseInt(page));
      };
    } else {
      button.disabled = true;
      button.setAttribute('aria-current', 'page');
    }

    table.paginationWrapper.appendChild(button);
  },

  renderCell(table, tableId, row, field, attributes, rowData, index) {
    const cell = document.createElement('td');
    let value = rowData[field];

    const normalizeValue = (v) => {
      if (v === null || v === undefined) return v;
      if (typeof v === 'object') {
        if (v.text !== undefined) return v.text;
        if (v.html !== undefined) return v.html;
        if (v.value !== undefined) return v.value;
        return JSON.stringify(v);
      }
      return v;
    };

    const rawValue = value;
    const primValue = normalizeValue(value);

    try {
      // Setup cell attributes
      if (attributes.class) {
        cell.className = attributes.class;
      }

      if (attributes.align) {
        cell.style.textAlign = attributes.align;
      }

      // Handle null or undefined values
      if (primValue === null || primValue === undefined) {
        cell.textContent = attributes.emptyText || '';
        row.appendChild(cell);
        return;
      }

      // Handle different render types
      if (attributes.element && attributes.element !== '') {
        // Render as interactive element
        this.renderElementCell(cell, table, tableId, field, attributes, rowData, index);
      } else if (attributes.formatter && typeof window[attributes.formatter] === 'function') {
        // Custom formatter function - pass rawValue and primValue for flexibility
        window[attributes.formatter](cell, rawValue, rowData, attributes);
      } else if (attributes.format) {
        // Built-in formatter - look up options in priority order:
        // 1. API response options (table.dataOptions)
        // 2. Filter options (table.filterOptions)
        // 3. HTML data-options (attributes.options)
        const lookupOptions = table.dataOptions?.[field] || table.filterOptions?.[field] || attributes.options;
        cell.textContent = this.formatValue(primValue, attributes.format, lookupOptions);
      } else if (attributes.template) {
        // Template-based rendering
        const template = attributes.template.replace(/\${(\w+)}/g, (match, key) => {
          const v = rowData[key];
          return v !== undefined ? normalizeValue(v) : match;
        });
        cell.innerHTML = template;
      } else {
        // Default rendering - prefer HTML when original value had an html property
        if (rawValue && typeof rawValue === 'object' && rawValue.html !== undefined) {
          cell.innerHTML = rawValue.html;
        } else {
          cell.textContent = primValue;
        }
      }

      // Add any data attributes
      if (attributes.dataAttributes) {
        Object.entries(attributes.dataAttributes).forEach(([attr, val]) => {
          const attrValue = typeof val === 'function' ? val(rowData) : val;
          cell.dataset[attr] = attrValue;
        });
      }

      // Add any event handlers directly to the cell
      if (attributes.events) {
        Object.entries(attributes.events).forEach(([event, handler]) => {
          cell.addEventListener(event, (e) => handler(e, rowData, cell, table));
        });
      }

      row.appendChild(cell);
    } catch (error) {
      this.handleError('Rendering cell failed', error, 'renderCell');
      // Fallback to simple text rendering
      cell.textContent = value !== undefined ? value : '';
      row.appendChild(cell);
    }
  },

  renderElementCell(cell, table, tableId, field, attributes, rowData, index) {
    const elementManager = Now.getManager('element');
    if (!elementManager) {
      cell.textContent = rowData[field] || '';
      return;
    }

    const value = rowData[field];
    let elementType = attributes.element;
    let config = this.getElementConfig(table, tableId, field, attributes, rowData, index);

    if (!config) {
      cell.textContent = value;
      return;
    }

    try {
      // Create the element using ElementManager
      const element = elementManager.create(elementType, config);

      if (element && element.element) {
        // Store element ID for later reference
        cell.dataset.elementId = element.element.id;

        // Append the element or its wrapper to the cell
        if (element.wrapper) {
          cell.appendChild(element.wrapper);
        } else {
          cell.appendChild(element.element);
        }

        // Track the element in table state for cleanup
        if (!table.elementInstances) {
          table.elementInstances = new Map();
        }
        table.elementInstances.set(element.element.id, element);
      } else {
        // Fallback if element creation failed
        cell.textContent = value;
      }
    } catch (error) {
      console.error('Failed to create element in cell:', error);
      cell.textContent = value;
    }
  },

  getElementConfig(table, tableId, field, attributes, rowData, index) {
    // Allow using data-type as a shorthand for data-element.
    if (!attributes.element && attributes.type) {
      attributes.element = attributes.type;
    }
    if (!attributes.element) return null;

    // Base configuration common to all elements
    const rawValue = rowData[field];
    const normalizeValue = (v) => {
      if (v === null || v === undefined) return v;
      if (typeof v === 'object') {
        if (v.value !== undefined) return v.value;
        if (v.text !== undefined) return v.text;
        if (v.html !== undefined) return v.html;
        return JSON.stringify(v);
      }
      return v;
    };
    const value = normalizeValue(rawValue);
    const config = {
      type: attributes.element,
      name: `${field}[${rowData.id || index}]`,
      id: `${field}_${rowData.id || index}_${Date.now()}`, // Ensure unique ID
      wrapper: attributes.wrapper || 'div',
      value: value,
      autocomplete: attributes.autocomplete || 'off',
      className: attributes.class,
      readOnly: attributes.readOnly,
      disabled: attributes.disabled,
      required: attributes.required,
      placeholder: attributes.placeholder || attributes.label
    };

    // Element-specific configurations
    switch (attributes.element) {
      case 'select':
        // Handle select element. options can come from several places:
        config.options = (table.filterOptions && table.filterOptions[field]) || attributes.options || {};
        if (typeof config.options === 'string' && window[config.options]) {
          config.options = window[config.options];
        }
        config.multiple = attributes.multiple;
        config.allowEmpty = attributes.allowEmpty !== false;
        break;

      case 'text':
      case 'email':
      case 'url':
      case 'password':
        // Text-like elements
        config.minLength = attributes.minLength;
        config.maxLength = attributes.maxLength;
        config.pattern = attributes.pattern;
        config.autocomplete = attributes.autocomplete || config.type;
        // Add datalist if provided
        if (attributes.datalist) {
          config.datalist = attributes.datalist;
        }
        break;

      case 'number':
        // Number input
        config.min = attributes.min;
        config.max = attributes.max;
        config.step = attributes.step || 1;
        break;

      case 'textarea':
        // Textarea
        config.rows = attributes.rows || 3;
        config.cols = attributes.cols;
        config.resizable = attributes.resizable !== false;
        break;

      case 'date':
      case 'time':
      case 'datetime-local':
        // Date/time inputs
        config.min = attributes.min;
        config.max = attributes.max;
        config.format = attributes.format;
        break;

      case 'file':
        // File upload
        config.accept = attributes.accept;
        config.multiple = attributes.multiple;
        config.maxFileSize = attributes.maxFileSize;
        config.preview = attributes.preview;
        break;

      case 'checkbox':
      case 'radio':
        // Checkbox/radio
        config.checked = value === true || value === '1' || value === 'true';
        if (attributes.options) {
          config.options = attributes.options;
        }
        break;

      case 'search':
        // Search element
        config.minLength = attributes.minLength || 2;
        config.delay = attributes.delay || 300;
        if (attributes.source) {
          config.source = attributes.source;
        }
        config.onSearch = attributes.onSearch;
        break;
    }

    // Add validators if specified
    if (attributes.validate) {
      config.validate = attributes.validate;
    }

    // Add formatter if specified
    if (attributes.formatter) {
      config.formatter = attributes.formatter;
    }

    return config;
  },

  cleanupTableResources(tableId) {
    try {
      const table = this.state.tables.get(tableId);
      if (!table) return;

      // Cleanup event handlers
      if (table.eventHandlers) {
        // Cleanup sort handlers
        if (table.eventHandlers.sort instanceof Map) {
          table.eventHandlers.sort.forEach((handlers, th) => {
            th.removeEventListener('click', handlers.sort);
            th.removeEventListener('keydown', handlers.key);
          });
        }

        // Cleanup other handlers
        if (table.eventHandlers.keyboard) {
          table.element.removeEventListener('keydown', table.eventHandlers.keyboard);
        }

        // Remove delegation listeners if present
        if (table.eventHandlers.delegation && table.element) {
          const tbody = table.element.querySelector('tbody');
          if (tbody) {
            tbody.removeEventListener('click', table.eventHandlers.delegation.click);
            tbody.removeEventListener('change', table.eventHandlers.delegation.change);
          }
        }

        if (table.eventHandlers.filterWrapperChange && table.filterWrapper) {
          table.filterWrapper.removeEventListener('change', table.eventHandlers.filterWrapperChange);
        }

        // Remove action button handler if present
        if (table.eventHandlers.actionButton && table.actionElements && table.actionElements.submit && table.actionElements.submit.element) {
          table.actionElements.submit.element.removeEventListener('click', table.eventHandlers.actionButton);
          delete table.eventHandlers.actionButton;
        }

        table.eventHandlers = {};
      }

      // Cleanup elements created by the table
      if (table.elementInstances) {
        if (table.elementInstances instanceof Map) {
          table.elementInstances.forEach((instance, id) => {
            const elementManager = Now.getManager('element');
            if (elementManager) {
              elementManager.destroy(id);
            }
          });
          table.elementInstances.clear();
        }
      }

      // Cleanup filter elements
      if (table.filterElements) {
        if (table.filterElements instanceof Map) {
          table.filterElements.forEach((element) => {
            if (element && element.element && element.element.id) {
              const elementManager = Now.getManager('element');
              if (elementManager) {
                elementManager.destroy(element.element.id);
              }
            }
          });
          table.filterElements.clear();
        }
      }

      // Remove DOM elements
      ['filterWrapper', 'actionWrapper', 'paginationWrapper'].forEach(wrapper => {
        if (table[wrapper]) {
          table[wrapper].remove();
          table[wrapper] = null;
        }
      });

      // Clear data
      table.data = null;
      if (table.columns && table.columns.clear) table.columns.clear();
      if (table.filterData && table.filterData.clear) table.filterData.clear();

      // Clear filterOptions (can be Map or Object)
      if (table.filterOptions) {
        if (table.filterOptions instanceof Map) {
          table.filterOptions.clear();
        } else {
          table.filterOptions = {};
        }
      }

      // Clear dataOptions (Object)
      if (table.dataOptions) {
        table.dataOptions = {};
      }

      // Clear sort state
      table.sortable = null;

      // Clear cache
      this.clearTableCache(tableId);

      // Remove table attributes
      if (table.element) {
        table.element.removeAttribute('data-table-initialized');
        table.element.classList.remove('table-initialized');
      }

      // Remove table state binding
      if (table.unsubscribe) {
        table.unsubscribe();
        table.unsubscribe = null;
      }

    } catch (error) {
      this.handleError('Failed to cleanup table resources', error, 'cleanup');
    }
  },

  // Delegated event handlers
  _handleDelegatedClick(e, tableId) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    const btn = e.target.closest('[data-action]');
    if (btn && table.element.contains(btn)) {
      e.preventDefault();
      const action = btn.dataset.action;
      const params = btn.dataset.params ? JSON.parse(btn.dataset.params) : null;
      const tr = btn.closest('tr');
      const id = tr?.dataset?.id;
      const row = id ? this.getRowObjectById(tableId, id) : null;
      const actionUrl = table.element.dataset.actionUrl || table.config.actionUrl;

      // always route data operations to table actionUrl
      this._executeRowAction(tableId, actionUrl, row || {}, action, {...(params || {})});
      return;
    }

    // handle buttons inside action cell without data-action (icons etc.)
    const iconBtn = e.target.closest('button, a');
    if (iconBtn && table.element.contains(iconBtn)) {
      // if it has data-field or data-action via other attrs, treat accordingly
      const action = iconBtn.dataset.action;
      if (action) {
        e.preventDefault();
        const tr = iconBtn.closest('tr');
        const id = tr?.dataset?.id;
        const row = id ? this.getRowObjectById(tableId, id) : null;
        const actionUrl = table.element.dataset.actionUrl || table.config.actionUrl;
        this._executeRowAction(tableId, actionUrl, row || {}, action, {});
      }
    }
  },

  _handleDelegatedChange(e, tableId) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    const target = e.target;
    if (!table.element.contains(target)) return;

    // Find field attribute
    const fieldEl = target.closest('[data-field]') || target;
    const field = fieldEl.dataset.field || fieldEl.name || fieldEl.dataset.name;

    if (field) {
      const tr = target.closest('tr');
      const id = tr?.dataset?.id;
      const row = id ? this.getRowObjectById(tableId, id) : null;

      // Do not treat header/select-all checkboxes as row-level field updates
      if (target.classList && target.classList.contains('select-all')) return;

      let value;
      if (target.type === 'checkbox') value = target.checked ? '1' : '0';
      else if (target.type === 'radio') {
        const checked = target.closest('tr')?.querySelector(`input[name="${target.name}"]:checked`);
        value = checked ? checked.value : null;
      } else {
        value = target.value;
      }

      const shouldSend = true;

      this.handleFieldChange(table, tableId, field, value, row, target, {send: shouldSend});
    }
  },

  // Helper to get selected row ids (from tbody .select-row checkboxes)
  getSelectedRowIds(table) {
    if (!table || !table.element) return [];
    const checked = table.element.querySelectorAll('tbody .select-row:checked');
    return Array.from(checked).map(cb => cb.value);
  },

  _performActionWrapperSubmission(tableId) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    const selectInfo = table.actionElements?.select;
    const submitInfo = table.actionElements?.submit;
    const actionUrl = table.element.dataset.actionUrl || table.config.actionUrl;

    if (!selectInfo || !submitInfo) return;

    const selectEl = selectInfo.element;
    const selectedAction = selectEl ? selectEl.value : null;

    // Validate that an action is selected (not empty value)
    if (!selectedAction || selectedAction === '') {
      if (window.NotificationManager) {
        NotificationManager.warning(Now.translate('Please select an action'));
      } else {
        alert(Now.translate('Please select an action'));
      }
      return;
    }

    const ids = this.getSelectedRowIds(table);
    if (!ids || ids.length === 0) {
      if (window.NotificationManager) {
        NotificationManager.warning(Now.translate('Please select at least one row'));
      } else {
        alert(Now.translate('Please select at least one row'));
      }
      return;
    }

    const data = {
      action: selectedAction,
      ids: ids
    };

    // sendAction will handle UI feedback
    this.sendAction(actionUrl, data, tableId, submitInfo.element).catch(err => console.error('Action submit error', err));
  },

  setupColumnResizing(tableId) {
    const tableObj = this.state.tables.get(tableId);
    if (!tableObj || !tableObj.element) return;
    if (!tableObj.config.persistColumnWidths) return;

    const tableEl = tableObj.element;
    const thead = tableEl.querySelector('thead');
    if (!thead) return;

    // Load saved widths if present
    try {
      const saved = localStorage.getItem(`table_${tableId}_columns`);
      if (saved) {
        const widths = JSON.parse(saved);
        const cols = thead.querySelectorAll('th');
        cols.forEach((th, idx) => {
          if (widths[idx]) th.style.width = widths[idx];
        });
      }
    } catch (err) {
      // ignore
    }

    // Add simple resizer handles to last row headers
    const headers = thead.querySelectorAll('th');
    headers.forEach((th, idx) => {
      // Skip if already has resizer
      if (th.querySelector('.col-resizer')) return;

      const resizer = document.createElement('div');
      resizer.className = 'col-resizer';
      resizer.setAttribute('role', 'separator');
      resizer.style.position = 'absolute';
      resizer.style.top = '0';
      resizer.style.right = '0';
      resizer.style.width = '6px';
      resizer.style.cursor = 'col-resize';
      resizer.style.userSelect = 'none';
      resizer.style.height = '100%';
      resizer.style.zIndex = '5';

      th.style.position = 'relative';
      th.appendChild(resizer);

      let startX = 0;
      let startWidth = 0;

      const onMouseDown = (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = th.offsetWidth;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
        const dx = e.clientX - startX;
        const newWidth = Math.max(30, startWidth + dx);
        th.style.width = `${newWidth}px`;
      };

      const onMouseUp = (e) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // save widths
        try {
          const cols = Array.from(thead.querySelectorAll('th'));
          const widths = cols.map(c => c.style.width || window.getComputedStyle(c).width);
          localStorage.setItem(`table_${tableId}_columns`, JSON.stringify(widths));
        } catch (err) {
          console.warn('Failed to persist column widths', err);
        }
      };

      resizer.addEventListener('mousedown', onMouseDown);
    });
  },

  getRowObjectById(tableId, id) {
    const table = this.state.tables.get(tableId);
    if (!table || !table.data) return null;
    return table.data.find(r => String(r.id) === String(id)) || null;
  },

  clearTableCache(tableId) {
    try {
      const table = this.state.tables.get(tableId);
      if (!table) return;

      if (table.config.persistColumnWidths) {
        localStorage.removeItem(`table_${tableId}_columns`);
      }

      localStorage.removeItem(`table_${tableId}_filters`);

      localStorage.removeItem(`table_${tableId}_sort`);

      localStorage.removeItem(`table_${tableId}_page`);

    } catch (error) {
      this.handleError('Clear table cache', error, 'clearCache');
    }
  },

  destroyTable(tableId) {
    try {
      this.cleanupTableResources(tableId);

      this.state.tables.delete(tableId);

      Now.emit('table:destroyed', {
        tableId,
        timestamp: Date.now()
      });
    } catch (error) {
      this.handleError('Destroy table', error, 'destroy');
    }
  },

  destroy() {
    try {
      this.state.tables.forEach((_, tableId) => {
        this.destroyTable(tableId);
      });

      this.state.tables.clear();

      if (this.dynamicObserver) {
        this.dynamicObserver.disconnect();
        this.dynamicObserver = null;
      }

      if (window.EventManager?.off) {
        EventManager.off('locale:changed');
      }

      if (this.globalEventHandlers) {
        Object.entries(this.globalEventHandlers).forEach(([event, handler]) => {
          window.removeEventListener(event, handler);
        });
        this.globalEventHandlers = null;
      }

      this.resetState();

      Now.emit('tablemanager:destroyed', {
        timestamp: Date.now()
      });
    } catch (error) {
      this.handleError('Error during TableManager destruction', error, 'destroy');
    }
  },

  bindToState(tableId, statePath) {
    if (!tableId || !statePath) {
      return this.handleError('Invalid parameters for bindToState', null, 'bindToState');
    }

    try {
      const table = this.state.tables.get(tableId);
      if (!table) {
        return this.handleError(`Table ${tableId} not found`, null, 'bindToState');
      }

      if (!statePath.startsWith('state.')) {
        // Skip loading data during initialization - will be handled by initTable
        if (!table.initializing) {
          this.loadTableData(tableId);
        }
        return true;
      }

      const stateManager = Now.getManager('state');
      if (!stateManager) {
        console.warn('[TableManager] StateManager not found, loading data from other source');
        // Skip loading data during initialization - will be handled by initTable
        if (!table.initializing) {
          this.loadTableData(tableId);
        }
        return true;
      }

      if (!stateManager.get(statePath)) {
        console.warn(`[TableManager] Data not found at path "${statePath}"`);
      }

      if (table.unsubscribe) {
        table.unsubscribe();
        table.unsubscribe = null;
      }

      const unsubscribe = stateManager.subscribe(statePath, (newData) => {
        const data = Array.isArray(newData) ? newData : [];
        this.setData(tableId, data);
        Now.emit('table:stateUpdate', {
          tableId,
          statePath,
          recordCount: data.length,
          timestamp: Date.now()
        });
      });

      table.unsubscribe = unsubscribe;
      table.statePath = statePath;

      const initialData = stateManager.get(statePath);
      if (initialData) {
        this.setData(tableId, Array.isArray(initialData) ? initialData : []);
      }

      Now.emit('table:bound', {
        tableId,
        statePath,
        timestamp: Date.now()
      });

      return true;

    } catch (error) {
      return this.handleError(`Error binding table ${tableId}`, error, 'bindToState');
    }
  },

  setupDynamicTableObserver() {
    if (!window.MutationObserver) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.matches('table[data-table]')) {
              this.initTable(node);
            }
            if (node.querySelectorAll) {
              node.querySelectorAll('table[data-table]').forEach(table => {
                this.initTable(table);
              });
            }
          }
        });

        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.matches('table[data-table]')) {
              const tableId = node.dataset.table;
              if (tableId) {
                this.destroyTable(tableId);
              }
            }
            if (node.querySelectorAll) {
              node.querySelectorAll('table[data-table]').forEach(table => {
                const tableId = table.dataset.table;
                if (tableId) {
                  this.destroyTable(tableId);
                }
              });
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.dynamicObserver = observer;
  },

  handleError(message, error, type) {
    const errorObj = error || new Error(message);

    return ErrorManager.handle(errorObj, {
      context: `TableManager.${type}`,
      type: 'error:table',
      data: {
        message,
        error: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : null,
        tableId: this.currentTableId
      },
      notify: true
    });
  },

  setupTouchEvents(table) {
    if (!('ontouchstart' in window)) return;

    let startX, startY, touchStartTime;
    let longPressTimer;

    table.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      touchStartTime = Date.now();

      longPressTimer = setTimeout(() => {
        const row = e.target.closest('tr');
        if (row) {
          const checkbox = row.querySelector('.select-all');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            this.updateSelectedRows(table);
          }
        }
      }, 500);
    });

    table.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);

      if (deltaX > 10 || deltaY > 10) {
        clearTimeout(longPressTimer);
      }
    });

    table.addEventListener('touchend', (e) => {
      clearTimeout(longPressTimer);

      const touchDuration = Date.now() - touchStartTime;
      const touch = e.changedTouches[0];
      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);

      if (touchDuration < 300 && deltaX < 10 && deltaY < 10) {
        const row = e.target.closest('tr');
        if (row && !e.target.closest('.select-all')) {
          const checkbox = row.querySelector('.select-all');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            this.updateSelectedRows(table);
          }
        }
      }
    });

    table.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
    });
  },

  setupActions(table, tableId) {
    if (!table?.actionWrapper) return;

    // Clear existing actions
    table.actionWrapper.innerHTML = '';

    const elementManager = Now.getManager('element');
    if (!elementManager) return;

    // If no actions defined, return
    if (table.config.actionUrl === '' || Object.keys(table.config.actions).length === 0) {
      return;
    }

    // Create the action select dropdown with placeholder as first option
    const selectLabel = table.element.dataset.actionSelectLabel || table.config.actionSelectLabel || 'Please select';
    const actionOptions = {
      '': Now.translate(selectLabel), // Empty value with translatable label
      ...table.config.actions
    };

    const select = elementManager.create('select', {
      id: `select_action_${tableId}`,
      options: actionOptions,
      value: '', // Set default to empty
      wrapper: 'div'
    });

    // Create the action button data-action-button="Process|btn-success" (Text|Class)
    let actionButtonConfig = table.element.dataset.actionButton || table.config.actionButton || 'Process';
    if (typeof actionButtonConfig === 'string') {
      const parsed = actionButtonConfig.split('|');
      if (parsed.length) {
        actionButtonConfig = {
          value: parsed[0],
          className: parsed[1] || 'btn-info'
        };
      }
    }

    const button = elementManager.create('button', {
      id: `action_button_${tableId}`,
      type: 'button',
      value: Now.translate(actionButtonConfig.value || 'Process'),
      className: `btn ${actionButtonConfig.className || 'btn-info'}`,
      wrapper: 'div',
      disabled: true
    });

    // Add elements to action wrapper
    if (select && button) {
      table.actionWrapper.appendChild(select.wrapper);
      table.actionWrapper.appendChild(button.wrapper);

      // Store references to action elements
      table.actionElements = {
        select: {
          element: select.element,
          id: select.element.id
        },
        submit: {
          element: button.element,
          id: button.element.id
        }
      };

      // Disable button when no rows selected
      if (window.EventManager?.on) {
        EventManager.on('table:selectionChange', (event) => {
          if (event.data.tableId === tableId) {
            button.element.disabled = !event.data.selectedRows || event.data.selectedRows.length === 0;
          }
        });
      }
    }
  },

  async sendAction(actionUrl, data, tableId, submitEl, context = {}) {
    try {
      if (!actionUrl) {
        throw new Error('Action URL is required');
      }

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid action data');
      }

      const table = this.state.tables.get(tableId);
      if (!table) {
        throw new Error(`Table ${tableId} not found`);
      }

      submitEl.classList.add('loading');

      const requestData = {
        ...data,
        tableId
      };

      // Use HttpClient (window.http) with CSRF protection, fallback to simpleFetch
      const resp = await window.http.post(actionUrl, requestData);
      const responseData = resp?.data?.data ?? resp?.data ?? resp;

      // Use ResponseHandler to process API response
      if (window.ResponseHandler?.state?.initialized) {
        try {
          // Merge actions properly - preserve Array structure
          if (context.modalConfig && responseData.actions) {
            // If both are arrays, concatenate them
            if (Array.isArray(responseData.actions)) {
              responseData.actions = [
                ...(Array.isArray(context.modalConfig) ? context.modalConfig : [context.modalConfig]),
                ...responseData.actions
              ];
            } else {
              // If actions is object, merge as objects
              responseData.actions = {...context.modalConfig, ...responseData.actions};
            }
          } else if (context.modalConfig) {
            responseData.actions = context.modalConfig;
          }

          await ResponseHandler.process(responseData, {
            ...context,
            data: responseData,
            reload: async () => {
              await this.loadTableData(tableId);
            }
          });
        } catch (error) {
          console.error('[TableManager] ResponseHandler error:', error);
        }
      } else {
        console.warn('[TableManager] ResponseHandler not initialized, actions will not be processed');
      }

      // Determine success from response
      const success = responseData.success !== false;

      Now.emit('table:action', {
        tableId,
        action: data.action,
        success,
        response: responseData,
        timestamp: Date.now()
      });

      submitEl.classList.remove('loading');

      return success;

    } catch (error) {
      console.error('Table action error:', error);

      submitEl.classList.remove('loading');

      if (window.NotificationManager) {
        NotificationManager.clear();
        NotificationManager.error(
          Now.translate(error.message) ||
          Now.translate('An error occurred')
        );
      }

      Now.emit('table:error', {
        tableId,
        action: data.action,
        error,
        timestamp: Date.now()
      });

      return false;
    }
  },

  removeTableRows(table, ids) {
    if (!table?.element || !ids?.length) return;

    ids.forEach(id => {
      const row = table.element.querySelector(`tr[data-id="${id}"]`);
      if (!row) return;

      row.style.transition = 'opacity 0.3s';
      row.style.opacity = '0';

      setTimeout(() => {
        row.remove();

        this.updateTableInfo(table);

        Now.emit('table:rowRemoved', {
          tableId: table.id,
          rowId: id
        });
      }, 300);
    });
  },

  updateTableInfo(table) {
    const rowCount = table.element.querySelectorAll('tbody tr').length;

    if (rowCount === 0) {
      const tbody = table.element.querySelector('tbody');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = table.element.querySelectorAll('thead th').length;
      td.className = 'empty-table';
      td.textContent = Now.translate('No data available');
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    if (table.config.pagination) {
      const total = parseInt(table.config.params.total) - 1;
      table.config.params.total = total;

      if (table.paginationWrapper) {
        this.updatePagination(table, table.id, total,
          Math.ceil(total / table.config.params.pageSize));
      }
    }
  },

  setupKeyboardNavigation(table, tableId) {
    if (!table) return;

    const tableData = this.state.tables.get(tableId);
    if (!tableData) return;

    const handleKeydown = (event) => {
      const target = event.target;

      if (target.matches('th[data-sort]')) {
        switch (event.key) {
          case 'Enter':
          case ' ':
            event.preventDefault();
            this.handleSort(tableData, tableId, target);
            break;
          case 'ArrowLeft':
          case 'ArrowRight':
            event.preventDefault();
            this.navigateHeaders(table, target, event.key === 'ArrowRight');
            break;
        }
      }

      if (target.matches('tbody tr')) {
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const currentIndex = rows.indexOf(target);

        switch (event.key) {
          case 'ArrowUp':
            event.preventDefault();
            if (currentIndex > 0) {
              rows[currentIndex - 1].focus();
              this.announceRowChange(table, currentIndex - 1);
            }
            break;

          case 'ArrowDown':
            event.preventDefault();
            if (currentIndex < rows.length - 1) {
              rows[currentIndex + 1].focus();
              this.announceRowChange(table, currentIndex + 1);
            }
            break;

          case 'Home':
            event.preventDefault();
            rows[0].focus();
            this.announceRowChange(table, 0);
            break;

          case 'End':
            event.preventDefault();
            rows[rows.length - 1].focus();
            this.announceRowChange(table, rows.length - 1);
            break;
        }
      }
    };

    table.addEventListener('keydown', handleKeydown);

    if (!table.eventHandlers) table.eventHandlers = {};
    table.eventHandlers.keyboard = handleKeydown;
  },

  navigateHeaders(table, currentHeader, forward) {
    const headers = Array.from(table.querySelectorAll('th[data-sort]'));
    const currentIndex = headers.indexOf(currentHeader);
    let nextIndex;

    if (forward) {
      nextIndex = currentIndex < headers.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : headers.length - 1;
    }

    headers[nextIndex].focus();
  },

  announceRowChange(table, rowIndex) {
    const announcer = document.getElementById(table.dataset.announcer);
    if (announcer) {
      const row = table.querySelectorAll('tbody tr')[rowIndex];
      const firstCell = row.querySelector('td');
      announcer.textContent = Now.translate('Row') + ` ${rowIndex + 1}: ${firstCell?.textContent || ''}`;
    }
  },

  async loadData(tableId, source, params = {}) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    if (table.isLoading) return;
    table.isLoading = true;

    try {
      this.showLoading(table);

      const queryParams = new URLSearchParams({
        ...table.config.params,
        ...this.getSortParams(table),
        ...this.getPaginationParams(table),
        ...params
      });

      const finalUrl = `${source}?${queryParams}`;
      const resp = await http.get(finalUrl, {headers: {'Accept': 'application/json'}});
      const data = resp?.data || resp;


      this.setData(tableId, data.data);

      if (data.meta?.total) {
        this.updatePagination(table, tableId, data.meta);
      }

    } catch (error) {
      return this.handleError('Error loading table data', error, 'loadData');
    } finally {
      table.isLoading = false;
    }
  },

  showLoading(table) {
    const tbody = table.element.querySelector('tbody');
    tbody.innerHTML = `<tr><td colspan="100%" class="center">${Now.translate('Loading')}...</td></tr>`;
  },

  updateSelectedRows(table) {
    const checkboxes = table.querySelectorAll('.select-all');

    const selectedRows = [];

    checkboxes.forEach((checkbox, index) => {
      const row = checkbox.closest('tr');

      if (checkbox.checked) {
        selectedRows.push({
          index: index,
          row: row,
          data: this.getRowData(row)
        });

        row.classList.add('selected-row');
      } else {
        row.classList.remove('selected-row');
      }
    });

    this.updateSelectedCount(table, selectedRows.length);

    if (this.onSelectionChange) {
      this.onSelectionChange(selectedRows);
    }

    return selectedRows;
  },

  getRowData(row) {
    const cells = row.querySelectorAll('td');
    return Array.from(cells).map(cell => cell.textContent.trim());
  },

  // Parse data-row-actions attribute. Accepts JSON object or shorthand string 'print,edit,delete'
  parseRowActions(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      // Try JSON first
      if (/^[\s]*\{/.test(raw) || /^[\s]*\[/.test(raw)) {
        return JSON.parse(raw);
      }
    } catch (e) {
      // fallthrough to shorthand
    }

    // Shorthand comma separated: 'print,edit,delete'
    return raw.split(',').map(s => s.trim()).reduce((acc, key) => {
      acc[key] = key.charAt(0).toUpperCase() + key.slice(1);
      return acc;
    }, {});
  },

  // Create action cell for a row. actions can be:
  // { key: "Label" }
  // { key: { label: "Label", params: { id: "{id}" }, method: 'POST', submenu: { ... } } }
  createActionCell(table, tableId, item, actions) {
    const td = document.createElement('td');
    td.className = 'row-actions-cell';

    const wrapper = document.createElement('div');
    wrapper.className = 'btn-group';

    const actionUrl = table.element.dataset.actionUrl || table.config.actionUrl;

    const elementManager = Now.getManager('element');

    Object.entries(actions).forEach(([key, cfg]) => {
      // normalize cfg to object
      cfg = (typeof cfg === 'string') ? {label: cfg} : (cfg || {});
      let label = cfg.label || key;

      // If submenu is provided, create a dropdown
      if (cfg && typeof cfg === 'object' && cfg.submenu) {
        const dropdown = document.createElement('div');
        dropdown.className = 'action-dropdown';

        const mainBtn = document.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = cfg.className || `action-btn action-${key}`;
        mainBtn.textContent = label;

        dropdown.appendChild(mainBtn);

        const menu = document.createElement('div');
        menu.className = 'action-submenu';
        Object.entries(cfg.submenu).forEach(([subKey, subCfg]) => {
          // submenu value can be string or object
          const subObj = (typeof subCfg === 'string') ? {label: subCfg} : subCfg || {};
          let m;
          if (elementManager && subObj.element) {
            m = elementManager.create(subObj.element, {
              id: subObj.id || `row_action_${subKey}_${item.id || ''}`,
              type: subObj.type || 'button',
              value: Now.translate(subObj.label || subKey),
              className: subObj.className || `action-sub action-${subKey}`,
              wrapper: null,
              attrs: subObj.attrs || {}
            }).element;
          } else {
            m = document.createElement('button');
            m.type = 'button';
            m.className = subObj.className || `action-sub action-${subKey}`;
            m.textContent = subObj.label || subKey;
          }
          m.addEventListener('click', (e) => {
            e.preventDefault();
            this._executeRowAction(tableId, actionUrl, item, subKey, subObj);
          });
          menu.appendChild(m);
        });

        dropdown.appendChild(menu);
        wrapper.appendChild(dropdown);
      } else {
        // Single action button
        let btnEl;
        if (elementManager && (cfg.element || cfg.className || cfg.attrs)) {
          // use ElementManager to create a richer element
          const cfgEl = {
            id: cfg.id || `row_action_${key}_${item.id || ''}`,
            type: cfg.type || 'button',
            value: Now.translate(cfg.label || key),
            className: cfg.className || `action-btn action-${key}`,
            wrapper: null,
            attrs: cfg.attrs || {}
          };
          btnEl = elementManager.create(cfg.element || 'button', cfgEl).element;
        } else {
          btnEl = document.createElement('button');
          btnEl.type = 'button';
          btnEl.className = cfg.className || `action-btn action-${key}`;
          btnEl.textContent = label;
        }
        btnEl.addEventListener('click', (e) => {
          e.preventDefault();
          this._executeRowAction(tableId, actionUrl, item, key, cfg);
        });
        wrapper.appendChild(btnEl);
      }
    });

    td.appendChild(wrapper);
    return td;
  },

  // Internal executor for per-row actions
  async _executeRowAction(tableId, actionUrl, item, actionKey, cfg = null) {
    const table = this.state.tables.get(tableId);
    if (!table) return;

    // Extract modal config if defined
    const modalConfig = (cfg && cfg.modal) ? cfg.modal : null;

    try {
      let confirmMsg = null;
      if (cfg && cfg.confirm) {
        confirmMsg = typeof cfg.confirm === 'string' ? cfg.confirm : Now.translate('Are you sure you want to perform this action?');
      } else if (actionKey === 'delete' && table.config.confirmDelete !== false) {
        confirmMsg = Now.translate('Are you sure you want to delete this item?');
      }

      if (confirmMsg) {
        let confirmed = false;
        if (window.DialogManager && typeof DialogManager.confirm === 'function') {
          try {
            confirmed = await DialogManager.confirm(confirmMsg, Now.translate('Confirm'));
          } catch (err) {
            confirmed = false;
          }
        } else if (window.Modal) {
          // Use Modal as a nicer fallback for confirmation when DialogManager isn't available
          try {
            const modal = new Modal({
              title: Now.translate('Confirm'),
              content: `<div class="confirm-body">${confirmMsg}</div><div style="margin-top:1rem;text-align:right"><button class="modal-cancel">${Now.translate('Cancel')}</button> <button class="modal-confirm primary">${Now.translate('Confirm')}</button></div>`,
              width: '420px',
              backdrop: true
            });

            modal.show();

            confirmed = await new Promise(resolve => {
              const listener = (e) => {
                if (e.target.classList.contains('modal-confirm')) {
                  cleanup();
                  resolve(true);
                } else if (e.target.classList.contains('modal-cancel')) {
                  cleanup();
                  resolve(false);
                }
              };

              function cleanup() {
                try {modal.hide();} catch (err) { /* ignore */}
                setTimeout(() => {try {modal.modal?.remove();} catch (_) {} }, 300);
                document.removeEventListener('click', listener);
              }

              document.addEventListener('click', listener);
            });
          } catch (err) {
            console.error('Modal confirm error', err);
            confirmed = false;
          }
        } else {
          confirmed = confirm(confirmMsg);
        }

        if (!confirmed) return; // user canceled
      }
    } catch (err) {
      console.error('Confirmation error:', err);
      return;
    }

    // Build base payload
    let payload = {action: actionKey, id: item.id, row: item};

    // If action config provides params, interpolate templates against row data
    if (cfg && cfg.params && typeof cfg.params === 'object') {
      const interpolate = (val) => {
        if (typeof val !== 'string') return val;
        return val.replace(/\{([^}]+)\}/g, (m, key) => {
          // support nested keys like user.id
          const parts = key.split('.');
          let cur = item;
          for (let p of parts) {
            if (cur == null) return '';
            cur = cur[p];
          }
          return cur != null ? cur : '';
        });
      };

      const resolved = {};
      Object.entries(cfg.params).forEach(([k, v]) => {
        if (typeof v === 'object') {
          resolved[k] = JSON.stringify(v); // simple fallback
        } else {
          resolved[k] = interpolate(v);
        }
      });

      payload = {...payload, ...resolved};
    }

    // Allow overriding method (GET will perform navigation with query string)
    const method = (cfg && cfg.method) ? cfg.method.toUpperCase() : 'POST';

    if (actionUrl) {
      if (method === 'GET') {
        const params = new URLSearchParams();
        Object.entries(payload).forEach(([k, v]) => {
          if (typeof v === 'object') params.append(k, JSON.stringify(v));
          else params.append(k, v == null ? '' : v);
        });
        const dest = actionUrl + (actionUrl.indexOf('?') === -1 ? '?' : '&') + params.toString();
        window.location.href = dest;
        return;
      }

      // use existing sendAction helper which handles response (POST)
      try {
        const fakeButton = document.createElement('button');
        fakeButton.className = 'loading';
        await this.sendAction(actionUrl, payload, tableId, fakeButton, {
          modalConfig: modalConfig,
          table: table,
          row: item,
          action: actionKey
        });
      } catch (err) {
        console.error('Row action error:', err);
      }
    } else {
      // No actionUrl: emit an event for external handling, include payload
      Now.emit('table:rowAction', {tableId, action: actionKey, payload, row: item});
    }
  },

  updateSelectedCount(table, count) {
    const selectedCountElement = table.closest('.table-container')
      ?.querySelector('.selected-count');

    if (selectedCountElement) {
      selectedCountElement.textContent = Now.translate('Selected {count} rows', {count: count});

      selectedCountElement.style.display = count > 0 ? 'block' : 'none';
    }
  },

  formatValue(value, format, options = {}) {
    if (value === null || value === undefined) {
      return options.emptyText || '';
    }

    if (!format) return value;

    // If format is a function, use it
    if (typeof format === 'function') {
      return format(value, options);
    }

    try {
      switch (format) {
        case 'text':
          return String(value);

        case 'html':
          // Be cautious with HTML content - ensure it's sanitized
          return value;

        case 'boolean':
          return value ? (options.trueText || 'Yes') : (options.falseText || 'No');

        case 'lookup':
          // For select options display - support multiple formats
          // options can be: object {value: label}, array [{value, text/label}], or Map
          if (!options) {
            return value; // No options provided, return raw value
          }

          // Handle array format from API: [{value: "active", label: "Active"}, ...]
          if (Array.isArray(options)) {
            const found = options.find(opt => {
              if (opt && typeof opt === 'object') {
                const optVal = opt.value !== undefined ? opt.value : opt.key;
                return String(optVal) === String(value);
              }
              return String(opt) === String(value);
            });
            if (found) {
              return found.label || found.text || String(found.value || found);
            }
            return value; // Not found, return raw value
          }

          // Handle Map format
          if (options instanceof Map) {
            return options.get(value) || value;
          }

          // Handle object format: {value: label, ...}
          if (typeof options === 'object') {
            return options[value] !== undefined ? options[value] : value;
          }

          return value;

        case 'number':
          return new Intl.NumberFormat(options.locale, {
            minimumFractionDigits: options.decimals || 0,
            maximumFractionDigits: options.decimals || 0,
            useGrouping: options.useGrouping !== false
          }).format(value);

        case 'currency':
          return new Intl.NumberFormat(options.locale || 'en-US', {
            style: 'currency',
            currency: options.currency || 'USD',
            minimumFractionDigits: options.decimals || 2,
            maximumFractionDigits: options.decimals || 2
          }).format(value);

        case 'percent':
          return new Intl.NumberFormat(options.locale, {
            style: 'percent',
            minimumFractionDigits: options.decimals || 0,
            maximumFractionDigits: options.decimals || 0
          }).format(value / (options.base || 100));

        case 'date':
          // Format as date
          const date = new Date(value);
          if (isNaN(date.getTime())) return value;

          const dateOptions = {
            year: options.year || 'numeric',
            month: options.month || 'short',
            day: options.day || 'numeric'
          };
          return new Intl.DateTimeFormat(options.locale, dateOptions).format(date);

        case 'time':
          // Format as time
          const time = new Date(value);
          if (isNaN(time.getTime())) return value;

          const timeOptions = {
            hour: options.hour || 'numeric',
            minute: options.minute || 'numeric',
            second: options.second || undefined,
            hour12: options.hour12 !== undefined ? options.hour12 : true
          };
          return new Intl.DateTimeFormat(options.locale, timeOptions).format(time);

        case 'datetime':
          // Format as datetime
          const datetime = new Date(value);
          if (isNaN(datetime.getTime())) return value;

          const datetimeOptions = {
            year: options.year || 'numeric',
            month: options.month || 'short',
            day: options.day || 'numeric',
            hour: options.hour || 'numeric',
            minute: options.minute || 'numeric',
            second: options.second || undefined,
            hour12: options.hour12 !== undefined ? options.hour12 : true
          };
          return new Intl.DateTimeFormat(options.locale, datetimeOptions).format(datetime);

        case 'bytes':
          // Format file size
          const units = ['B', 'KB', 'MB', 'GB', 'TB'];
          let bytes = Math.abs(Number(value));
          if (isNaN(bytes)) return value;

          let i = 0;
          while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
          }
          return `${bytes.toFixed(options.decimals || 0)} ${units[i]}`;

        case 'duration':
          // Format duration in seconds to readable format
          const seconds = Number(value);
          if (isNaN(seconds)) return value;

          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          const s = Math.floor(seconds % 60);

          const parts = [];
          if (h > 0) parts.push(`${h}${options.hourLabel || 'h'}`);
          if (m > 0 || h > 0) parts.push(`${m}${options.minuteLabel || 'm'}`);
          parts.push(`${s}${options.secondLabel || 's'}`);

          return parts.join(' ');

        case 'truncate':
          // Truncate text
          const str = String(value);
          const limit = options.length || 50;
          const end = options.end || '...';
          return str.length > limit ? str.slice(0, limit - end.length) + end : str;

        default:
          // Try to use a global formatter if available
          if (window.formatters && typeof window.formatters[format] === 'function') {
            return window.formatters[format](value, options);
          }
          return value;
      }
    } catch (error) {
      console.warn('Format error:', error);
      return value;
    }
  },

  // Get sort parameters for API
  getSortParams(table) {
    const params = {};

    if (table.sortState && Object.keys(table.sortState).length > 0) {
      // Use compact format for API consistency with URL parameters
      // Convert to 'name asc,status desc' format
      const sortPairs = Object.entries(table.sortState).map(([field, direction]) => `${field} ${direction}`);

      if (sortPairs.length > 0) {
        params.sort = sortPairs.join(',');
      }
    }

    return params;
  },

  // Get pagination parameters for API
  getPaginationParams(table) {
    const params = {};

    if (table.config.params.page) {
      params.page = table.config.params.page;
    }

    if (table.config.params.pageSize) {
      params.pageSize = table.config.params.pageSize;
    }

    if (table.config.params.search) {
      params.search = table.config.params.search;
    }

    return params;
  },

  getFilterParams(table) {
    const params = {};
    const excludeKeys = ['page', 'pageSize', 'search', 'total', 'totalPages'];

    // Include all filter parameters from config.params except pagination/meta keys
    Object.keys(table.config.params).forEach(key => {
      if (!excludeKeys.includes(key)) {
        const value = table.config.params[key];
        // Only include non-empty values
        if (value !== null && value !== undefined && value !== '') {
          params[key] = value;
        }
      }
    });

    return params;
  },

  async exportData(tableId, format = 'csv', options = {}) {
    const table = this.state.tables.get(tableId);
    if (!table) {
      return this.handleError('Table not found for export', null, 'exportData');
    }

    format = (format || 'csv').toLowerCase();

    // If server-side and an export URL is provided, delegate to the server
    const exportUrl = table.element.dataset.exportUrl || table.element.dataset.export || table.config.exportUrl;
    if (table.serverSide && exportUrl) {
      try {
        const params = new URLSearchParams({
          ...table.config.params,
          format
        });
        const url = exportUrl.indexOf('?') === -1 ? `${exportUrl}?${params}` : `${exportUrl}&${params}`;
        const resp = await http.get(url, {method: 'GET'});
        // http.get returns parsed response, but for blobs we need to check response type
        if (resp?.data instanceof Blob) {
          const blob = resp.data;
          const disposition = resp.headers['content-disposition'] || '';
          let filename = options.filename || `${tableId}.${format}`;
          const m = disposition.match(/filename\*=UTF-8''([^;\n\r]+)/i) || disposition.match(/filename="?([^";\n\r]+)"?/i);
          if (m && m[1]) filename = decodeURIComponent(m[1]);
          this.downloadBlob(blob, filename);
          Now.emit('table:export', {tableId, format, success: true});
          return true;
        }

        // If http.get didn't return blob, request again with explicit blob handling
        if (!window.http || typeof window.http.get !== 'function') {
          throw new Error('HttpClient (window.http) is required but not available');
        }

        const blobResp = await window.http.get(url, {
          throwOnError: false,
          headers: {'Accept': 'application/octet-stream'}
        });

        if (!blobResp.success) throw new Error('Export request failed');
        const blob = blobResp.data instanceof Blob ? blobResp.data : new Blob([blobResp.data]);
        const disposition = blobResp.headers['content-disposition'] || '';
        let filename = options.filename || `${tableId}.${format}`;
        const m = disposition.match(/filename\*=UTF-8''([^;\n\r]+)/i) || disposition.match(/filename="?([^";\n\r]+)"?/i);
        if (m && m[1]) filename = decodeURIComponent(m[1]);
        this.downloadBlob(blob, filename);
        Now.emit('table:export', {tableId, format, success: true});
        return true;
      } catch (err) {
        console.error('Export error (server):', err);
        Now.emit('table:export', {tableId, format, success: false, error: err});
        return false;
      }
    }

    // Client-side export from current table data
    const data = Array.isArray(table.data) ? table.data : [];

    try {
      if (format === 'json') {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], {type: 'application/json;charset=utf-8'});
        this.downloadBlob(blob, options.filename || `${tableId}.json`);
        Now.emit('table:export', {tableId, format, success: true});
        return true;
      }

      // default: csv
      // determine columns order
      let columns = [];
      try {
        if (table.columns && table.columns.size) {
          columns = Array.from(table.columns.keys());
        }
      } catch (e) {
        columns = [];
      }

      if (!columns.length && data.length) {
        columns = Object.keys(data[0]);
      }

      // Build CSV string
      const escape = (v) => {
        if (v === null || v === undefined) return '';
        let s = v;
        if (typeof s === 'object') s = JSON.stringify(s);
        s = String(s);
        if (s.indexOf('"') !== -1) s = s.replace(/"/g, '""');
        if (/[",\n\r]/.test(s)) s = `"${s}"`;
        return s;
      };

      const header = columns.map(c => escape(c)).join(',');
      const rows = data.map(row => columns.map(col => escape(row[col])).join(','));
      const csv = [header, ...rows].join('\r\n');
      const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
      this.downloadBlob(blob, options.filename || `${tableId}.csv`);
      Now.emit('table:export', {tableId, format: 'csv', success: true});
      return true;
    } catch (err) {
      console.error('Export error (client):', err);
      Now.emit('table:export', {tableId, format, success: false, error: err});
      return false;
    }
  },

  downloadBlob(blob, filename) {
    try {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error('Failed to initiate download:', err);
    }
  },

  resetState() {
    this.state = {
      initialized: false,
      tables: new Map()
    };
    this.config = {};
  }
};

if (window.Now?.registerManager) {
  Now.registerManager('table', TableManager);
}

// Expose globally
window.TableManager = TableManager;
