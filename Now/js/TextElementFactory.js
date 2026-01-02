/**
 * TextElementFactory - class to manage text inputs with autocomplete and hidden input support
 */
class TextElementFactory extends ElementFactory {
  static config = {
    type: 'text',
    autocomplete: {
      enabled: false,
      source: null,
      minLength: 2,
      maxResults: 10,
      delay: 300,
      level: null,
      dependent: null,
      callback: null
    },
    validationMessages: {
      email: 'Please enter a valid email address',
      url: 'Please enter a valid URL',
      number: 'Please enter a valid number',
      integer: 'Please enter a whole number',
      alpha: 'Only letters are allowed',
      alphanumeric: 'Only letters and numbers are allowed',
      usernameOrEmail: 'Please enter a valid username or email'
    },
    formatter: null
  };

  static validators = {
    email: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    url: value => /^(https?|ftp):\/\/[^\s\/$.?#].[^\s]*$|^www\.[^\s\/$.?#].[^\s]*$|^[^\s\/$.?#].[^\s]*\.[a-z]{2,}(\/[^\s]*)?$/.test(value),
    number: value => /^-?\d*\.?\d+$/.test(value),
    integer: value => /^-?\d+$/.test(value),
    alpha: value => /^[a-zA-Z]+$/.test(value),
    alphanumeric: value => /^[a-zA-Z0-9]+$/.test(value),
    usernameOrEmail: value => {
      const usernamePattern = /^[a-zA-Z0-9_]+$/;
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return usernamePattern.test(value) || emailPattern.test(value);
    }
  };

  static extractCustomConfig(element, def, dataset) {
    return {
      autocomplete: {
        enabled: dataset.autocomplete !== undefined ? dataset.autocomplete === 'true' : def.autocomplete?.enabled,
        source: dataset.source || def.autocomplete?.source,
        minLength: this.parseNumeric('minLength', element, def.autocomplete, dataset) || def.autocomplete?.minLength,
        maxResults: this.parseNumeric('maxResults', element, def.autocomplete, dataset) || def.autocomplete?.maxResults,
        delay: this.parseNumeric('delay', element, def.autocomplete, dataset) || def.autocomplete?.delay,
        level: dataset.hierarchy || dataset.level || def.autocomplete?.level,
        dependent: dataset.dependent || def.autocomplete?.dependent,
        callback: dataset.callback ? window[dataset.callback] : def.autocomplete?.callback
      },
      formatter: dataset.formatter ? window[dataset.formatter] : def.formatter,
      // Hierarchical search configuration
      searchApi: dataset.searchApi || null,
      searchField: dataset.searchField || null
    };
  }

  static setupElement(instance) {
    const {config, element} = instance;
    const acConfig = config.autocomplete;

    // Check for pending options (stored before element was enhanced)
    if (element.dataset.pendingOptions) {
      try {
        const pendingOptions = JSON.parse(element.dataset.pendingOptions);
        acConfig.source = pendingOptions;
        delete element.dataset.pendingOptions;
      } catch (e) {
        console.error('Failed to parse pending options:', e);
      }
    }

    // Read information from <Datalist> (if any)
    const dataFromDatalist = this.readFromDatalist(element);
    if (dataFromDatalist) {
      acConfig.source = dataFromDatalist;
    }

    // Auto-enable autocomplete if source is available
    if (acConfig.source) acConfig.enabled = true;

    // Auto-enable autocomplete for hierarchical inputs
    if (element.hasAttribute('data-hierarchy')) acConfig.enabled = true;

    // Auto-enable autocomplete for inputs with options-key (options loaded later)
    if (element.hasAttribute('data-options-key')) acConfig.enabled = true;

    // Save the original name and create a hidden input only when necessary
    const originalName = element.getAttribute('name') || '';
    const shouldCreateHidden = !!originalName && (acConfig.enabled || !!acConfig.source || !!dataFromDatalist || element.hasAttribute('data-hierarchy') || element.hasAttribute('data-options-key'));
    if (shouldCreateHidden) {
      instance.hiddenInput = document.createElement('input');
      instance.hiddenInput.type = 'hidden';
      instance.hiddenInput.setAttribute('name', originalName);
      element.parentNode.insertBefore(instance.hiddenInput, element.nextSibling);
      element.setAttribute('name', `${originalName}_text`);
      // If this input is inside a form that is managed by FormManager, register
      // the hidden input so FormManager will include it in form data collection.
      try {
        const formEl = element.form || element.closest && element.closest('form');
        if (formEl && window.FormManager && typeof FormManager.getInstanceByElement === 'function') {
          const formInstance = FormManager.getInstanceByElement(formEl);
          if (formInstance) {
            // Use the original name as the key so getFormData will append the hidden value
            try {
              formInstance.elements.set(originalName, instance.hiddenInput);
              formInstance.state.data[originalName] = instance.hiddenInput.value || '';
            } catch (e) {
              // best-effort: ignore if we cannot set
            }
          }
        }
      } catch (e) {}
    }

    // Initialize from existing value (if any)
    const initialValue = element.value;
    if (initialValue && acConfig.source) {
      this.setInitialValue(instance, initialValue);
    }

    // Default stubs for autocomplete methods (will be overwritten by setupAutocomplete)
    instance.hide = () => {};
    instance.highlightItem = () => {};
    instance.populate = () => {};
    instance.selectItem = () => {};
    instance.escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Initialize autocomplete if configured
    if (acConfig.enabled) {
      this.setupAutocomplete(instance);
    }

    // Validation
    instance.validateSpecific = function(value) {
      const validators = {
        ...TextElementFactory.validators,
        ...(window.validators || {}),
        ...(this.validators || {})
      };
      for (const rule of this.validationRules || []) {
        const ruleName = typeof rule === 'string' ? rule : rule.name;
        if (['minLength', 'maxLength', 'pattern', 'required'].includes(ruleName)) {
          console.warn(`"${ruleName}" should be set as a DOM property`);
          continue;
        }
        if (validators[ruleName] && !validators[ruleName](value)) {
          return config.validationMessages?.[ruleName] || 'Invalid value';
        }
      }
      return null;
    };

    // Formatter
    if (config.formatter) {
      EventSystemManager.addHandler(element, 'change', () => {
        element.value = config.formatter(element.value);
      });
    }

    // Register with HierarchicalTextFactory when applicable
    if (element.hasAttribute('data-hierarchy')) {
      HierarchicalTextFactory.register(instance);
    }

    this.setupEventListeners(instance);

    // Provide a destroy hook to clean up DOM nodes created by this factory
    const originalDestroy = instance.destroy;
    instance.destroy = function() {
      try {
        // Hide dropdown panel if open
        if (this.dropdownPanel?.isOpen() && this.dropdownPanel.currentTarget === element) {
          this.dropdownPanel.hide();
        }
        // Clean up dropdown element (no need to remove from DOM, it's in DropdownPanel)
        if (this.dropdown) {
          this.dropdown = null;
        }
        if (this.hiddenInput && this.hiddenInput.parentNode) {
          const hiddenName = this.hiddenInput.getAttribute('name');
          if (hiddenName && element.getAttribute('name') === `${hiddenName}_text`) {
            element.setAttribute('name', hiddenName);
          }
          // Try to unregister hidden input from FormManager if present
          try {
            const formEl = element.form || element.closest && element.closest('form');
            if (formEl && window.FormManager && typeof FormManager.getInstanceByElement === 'function') {
              const formInstance = FormManager.getInstanceByElement(formEl);
              if (formInstance && formInstance.elements && formInstance.elements.has(hiddenName)) {
                try {formInstance.elements.delete(hiddenName);} catch (e) {}
              }
            }
          } catch (e) {}

          this.hiddenInput.parentNode.removeChild(this.hiddenInput);
          this.hiddenInput = null;
        }
        // If HierarchicalTextFactory registered this instance, try to unregister
        try {if (window.HierarchicalTextFactory && typeof HierarchicalTextFactory.unregister === 'function') HierarchicalTextFactory.unregister(this);} catch (e) {}
      } catch (err) {
        console.warn('Error during TextElementFactory.destroy', err);
      }

      if (typeof originalDestroy === 'function') {
        try {originalDestroy.call(this);} catch (e) {console.warn('Original destroy threw', e);}
      }

      return this;
    };

    return instance;
  }

  static readFromDatalist(element) {
    const listId = element.getAttribute('list');
    if (!listId) return null;

    const datalist = document.getElementById(listId);
    if (!datalist) return null;

    const options = Array.from(datalist.querySelectorAll('option'));
    // Preserve DOM order by returning an array of entries: [{value: key, text: value}, ...]
    const data = [];
    options.forEach(option => {
      const text = option.label || option.textContent;
      const key = option.value || text;
      data.push({value: key, text});
    });

    element.removeAttribute('list');
    datalist.remove();
    return data.length > 0 ? data : null;
  }

  static setInitialValue(instance, initialValue) {
    const {config, element, hiddenInput} = instance;
    const acConfig = config.autocomplete;

    if (acConfig.source) {
      // Normalize source to standard format
      const normalized = this.normalizeSource(acConfig.source);
      if (!normalized) return;

      // Find matching entry by value or text
      for (const item of normalized) {
        if (item.value === initialValue || item.text === initialValue) {
          element.value = item.text;
          hiddenInput.value = item.value;
          instance.selectedValue = item.value;
          return;
        }
      }
    }

    // If not found in list, hidden will be empty (not selected)
    hiddenInput.value = '';
  }

  static setupAutocomplete(instance) {
    const {element, config, hiddenInput} = instance;
    const acConfig = config.autocomplete;

    instance.selectedValue = null;

    // Use DropdownPanel instead of creating dropdown element
    instance.dropdownPanel = DropdownPanel.getInstance();
    instance.dropdown = document.createElement('ul');
    instance.dropdown.className = 'autocomplete-list';

    instance.list = [];
    instance.listIndex = 0;

    instance.populate = (data) => {
      if (document.activeElement !== element && !instance._isActive) return;

      instance.dropdown.innerHTML = '';
      instance.list = [];
      const search = element.value.trim();
      const filter = new RegExp(`(${instance.escapeRegExp(search)})`, 'gi');
      let count = 0;

      // Normalize data to standard format
      const normalized = TextElementFactory.normalizeSource(data);
      if (!normalized) return;

      // Filter and create list items
      for (const item of normalized) {
        if (count >= acConfig.maxResults) break;

        // Apply search filter
        if (!search || filter.test(item.text)) {
          const li = instance.createListItem(item.value, item.text, search);
          instance.list.push(li);
          instance.dropdown.appendChild(li);
          count++;
        }
      }

      instance.highlightItem(0);
      if (instance.list.length) instance.show();
      else instance.hide();
    };

    // Show dropdown using DropdownPanel
    instance.show = () => {
      instance.dropdownPanel.show(element, instance.dropdown, {
        align: 'left',
        offsetY: 2,
        onClose: () => {
          // Cleanup when panel closes
        }
      });
    };

    // Hide dropdown
    instance.hide = () => {
      if (instance.dropdownPanel.isOpen() &&
        instance.dropdownPanel.currentTarget === element) {
        instance.dropdownPanel.hide();
      }
    };

    instance.escapeRegExp = (str) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    // Create list item with safe DOM construction (no innerHTML XSS risk)
    instance.createListItem = (key, value, search) => {
      const li = document.createElement('li');
      li.dataset.key = key;

      if (typeof acConfig.callback === 'function') {
        // If callback provided, accept a few return types safely:
        // - DOM Node -> append directly
        // - string -> if it contains HTML tags, set innerHTML, otherwise set textContent
        // - array -> append each item (string or Node)
        try {
          const result = acConfig.callback({key, value, search, level: acConfig.level});

          const appendStringSafely = (str) => {
            const wrapper = document.createElement('div');
            // If the string appears to contain HTML tags, allow innerHTML; otherwise use textContent
            if (/<[a-z][\s\S]*>/i.test(str)) wrapper.innerHTML = str;
            else wrapper.textContent = str;
            li.appendChild(wrapper);
          };

          if (result instanceof Node) {
            li.appendChild(result);
          } else if (Array.isArray(result)) {
            result.forEach(item => {
              if (item instanceof Node) li.appendChild(item);
              else appendStringSafely(String(item));
            });
          } else if (typeof result === 'string') {
            appendStringSafely(result);
          } else if (result != null) {
            // Fallback: stringify other types
            appendStringSafely(String(result));
          }
        } catch (cbErr) {
          console.warn('Autocomplete callback error:', cbErr);
          // Fallback to default rendering when callback fails
          const spanFallback = document.createElement('span');
          spanFallback.textContent = value;
          li.appendChild(spanFallback);
        }
      } else {
        // Safe rendering: create text nodes and <em> for highlights
        const span = document.createElement('span');

        if (!search) {
          // No search term: simple text node
          span.textContent = value;
        } else {
          // Highlight matches safely using DOM nodes
          // Use a non-capturing regex for splitting (remove capturing group)
          const splitRegex = new RegExp(instance.escapeRegExp(search), 'gi');
          const parts = value.split(splitRegex);
          const matches = value.match(splitRegex) || [];

          parts.forEach((part, index) => {
            if (part) {
              span.appendChild(document.createTextNode(part));
            }
            if (index < matches.length) {
              const em = document.createElement('em');
              em.textContent = matches[index];
              span.appendChild(em);
            }
          });
        }

        li.appendChild(span);
      }

      li.addEventListener('mousedown', () => instance.selectItem(key, value));
      li.addEventListener('mousemove', () => instance.highlightItem(instance.list.indexOf(li)));
      return li;
    };

    // Highlight item
    instance.highlightItem = (index) => {
      instance.listIndex = Math.max(0, Math.min(instance.list.length - 1, index));
      instance.list.forEach((item, i) => item.classList.toggle('active', i === instance.listIndex));
      instance.scrollToItem();
    };

    // Scroll to item
    instance.scrollToItem = () => {
      const item = instance.list[instance.listIndex];
      if (item) {
        const dropdownRect = instance.dropdown.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (itemRect.top < dropdownRect.top) {
          instance.dropdown.scrollTop = item.offsetTop;
        } else if (itemRect.bottom > dropdownRect.bottom) {
          instance.dropdown.scrollTop = item.offsetTop - dropdownRect.height + itemRect.height;
        }
      }
    };

    // Select item
    instance.selectItem = (key, value) => {
      // Check if this is a hierarchical selection
      const selectedLi = instance.list.find(li => li.dataset.key === key);
      if (selectedLi && selectedLi.dataset.hierarchicalData) {
        // Use hierarchical selection
        TextElementFactory.selectHierarchicalItem(instance, key, value);
        return;
      }

      // Check if this is a reverse search selection from HierarchicalTextFactory
      if (instance.manager && typeof instance.manager.isReverseSearchSelection === 'function' && instance.manager.isReverseSearchSelection(instance)) {
        instance.manager.handleReverseSelection(instance, key, value);
        instance.hide();
        // Dispatch change on visible input for UI listeners
        element.dispatchEvent(new Event('change', {bubbles: true}));
        try {
          instance.hiddenInput && instance.hiddenInput.dispatchEvent(new Event('change', {bubbles: true}));
        } catch (err) {}
        // Call onChange callback if provided
        try {
          if (config && typeof config.onChange === 'function') {
            config.onChange(element, value);
          }
        } catch (err) {
          console.warn('Error in onChange handler (selectItem):', err);
        }
        return;
      }

      // Normal selection
      element.value = value;
      hiddenInput.value = key;
      instance.selectedValue = key;
      instance.hide();
      // Dispatch change on visible input for UI listeners
      element.dispatchEvent(new Event('change', {bubbles: true}));
      // Also dispatch change on hidden input so FormManager detects the actual
      // submitted field name (the hidden input holds the real value/key)
      try {
        instance.hiddenInput && instance.hiddenInput.dispatchEvent(new Event('change', {bubbles: true}));
      } catch (err) {}
      if (instance.manager) instance.manager.onSelectionChange(instance);
      // Call onChange callback if provided
      try {
        if (config && typeof config.onChange === 'function') {
          config.onChange(element, value);
        }
      } catch (err) {
        console.warn('Error in onChange handler (selectItem):', err);
      }
    };
  }

  static loadFromAjax(instance, url, query = '') {
    // Use HttpClient only - no fallback
    if (!window.http || typeof window.http.get !== 'function') {
      console.error('[TextElementFactory] HttpClient (window.http) is required but not available');
      alert('System error: HttpClient not loaded. Please refresh the page.');
      return;
    }

    // Build URL with query parameter
    let requestUrl = url;
    if (query) {
      const separator = url.includes('?') ? '&' : '?';
      requestUrl = `${url}${separator}q=${encodeURIComponent(query)}`;
    }

    window.http.get(requestUrl, {throwOnError: false})
      .then(resp => {
        if (resp && resp.success) {
          instance.populate(resp.data);
        } else {
          console.error('[TextElementFactory] Failed to load data:', requestUrl, resp);
        }
      })
      .catch(err => {
        console.error('[TextElementFactory] Ajax error:', err);
      });
  }

  /**
   * Hierarchical search using API endpoint
   * Searches across all related hierarchical data and displays in format: "province => amphur => district"
   */
  static searchHierarchical(instance, query) {
    const {config, element} = instance;

    if (!config.searchApi || !config.searchField) {
      console.warn('[TextElementFactory] searchApi or searchField not configured');
      return;
    }

    if (!window.http || typeof window.http.post !== 'function') {
      console.error('[TextElementFactory] HttpClient (window.http) is required but not available');
      return;
    }

    // Call search API with query and field
    const formData = new FormData();
    formData.append('query', query);
    formData.append('field', config.searchField);

    window.http.post(config.searchApi, formData, {throwOnError: false})
      .then(resp => {
        if (resp && resp.success && resp.data) {
          // Handle nested API response structure: {success, message, code, data: {results: [...]}}
          const results = resp.data.data?.results || resp.data.results;

          if (results && results.length > 0) {
            // Store hierarchical data for later use
            instance._hierarchicalData = results;

            // Populate dropdown with formatted results
            TextElementFactory.populateHierarchical(instance, results);
          } else {
            instance.hide();
          }
        } else {
          instance.hide();
        }
      })
      .catch(err => {
        console.error('[TextElementFactory] Hierarchical search error:', err);
        instance.hide();
      });
  }

  /**
   * Populate dropdown with hierarchical search results
   */
  static populateHierarchical(instance, data) {
    const {element, config} = instance;
    const acConfig = config.autocomplete;

    if (document.activeElement !== element && !instance._isActive) return;

    instance.dropdown.innerHTML = '';
    instance.list = [];

    // Create list items without filtering (already filtered by API)
    data.forEach((item, index) => {
      if (index >= acConfig.maxResults) return;

      // Use province value as the key (first field in hierarchy)
      const key = item.data?.province?.value || index;
      const li = instance.createListItem(key, item.text, ''); // No search highlight (already formatted)
      li.dataset.hierarchicalData = JSON.stringify(item); // Store full item data
      instance.list.push(li);
      instance.dropdown.appendChild(li);
    });

    instance.highlightItem(0);
    if (instance.list.length) instance.show();
    else instance.hide();
  }

  /**
   * Override selectItem for hierarchical selection
   * Populates all related fields (province, amphur, district, zipcode) at once
   */
  static selectHierarchicalItem(instance, value, text) {
    const {element, config, hiddenInput} = instance;

    // Find the hierarchical data from the selected item
    const selectedItem = instance.list.find(li => li.dataset.key === value);
    if (!selectedItem || !selectedItem.dataset.hierarchicalData) {
      console.warn('[TextElementFactory] No hierarchical data found for selection');
      return;
    }

    try {
      const item = JSON.parse(selectedItem.dataset.hierarchicalData);
      const data = item.data; // Extract nested data object

      // Extract field name from element name (remove "_text" suffix if present)
      const fieldName = element.getAttribute('name').replace('_text', '');

      // Set current field value and text from {value, text} structure
      if (data[fieldName]) {
        element.value = data[fieldName].text || text;
        hiddenInput.value = data[fieldName].value || value;
        instance.selectedValue = data[fieldName].value || value;
      }

      // Find form and populate all related fields
      const form = element.closest('form');
      if (form) {
        // Find all other hierarchical search inputs in the same form
        const relatedInputs = form.querySelectorAll('input[data-search-api][data-autocomplete="true"]');

        relatedInputs.forEach(input => {
          if (input === element) return; // Skip current field

          const relatedFieldName = input.getAttribute('name').replace('_text', '');
          const relatedData = data[relatedFieldName];

          if (relatedData && relatedData.value && relatedData.text) {
            // Set visible text
            input.value = relatedData.text;

            // Set hidden value if exists
            const relatedHiddenName = input.getAttribute('name').includes('_text')
              ? relatedFieldName
              : relatedFieldName;
            const relatedHidden = form.querySelector(`input[type="hidden"][name="${relatedHiddenName}"]`);
            if (relatedHidden) {
              relatedHidden.value = relatedData.value;
            }
          }
        });

        // Populate zipcode (readonly field)
        if (data.zipcode) {
          const zipcodeInput = form.querySelector('input[name="zipcode"]');
          if (zipcodeInput) {
            zipcodeInput.value = data.zipcode.value || data.zipcode.text;
          }
        }
      }

      instance.hide();

      // Dispatch change event
      element.dispatchEvent(new Event('change', {bubbles: true}));
      hiddenInput && hiddenInput.dispatchEvent(new Event('change', {bubbles: true}));

    } catch (err) {
      console.error('[TextElementFactory] Error parsing hierarchical data:', err);
    }
  }

  static setupEventListeners(instance) {
    const {element, config, hiddenInput} = instance;
    const acConfig = config.autocomplete;

    super.setupEventListeners(instance);

    // Prevent duplicate event registration
    if (instance._autocompleteListenersSetup) return;
    instance._autocompleteListenersSetup = true;

    const debounce = Utils.function.debounce((value) => {
      if (!acConfig.enabled) return;
      if (value.length < acConfig.minLength) {
        instance.hide();
        return;
      }

      // Check if this is a hierarchical search field
      if (config.searchApi && config.searchField) {
        // Use hierarchical search API
        TextElementFactory.searchHierarchical(instance, value);
      } else if (instance.manager) {
        // Use HierarchicalTextFactory manager
        instance.manager.search(instance, value);
      } else if (typeof acConfig.source === 'string' && (acConfig.source.startsWith('http') || acConfig.source.startsWith('/') || acConfig.source.startsWith('api/'))) {
        // URL source - load from API with query parameter
        TextElementFactory.loadFromAjax(instance, acConfig.source, value);
      } else {
        // Normal populate from static source (array/object/global variable)
        instance.populate(acConfig.source);
      }
    }, acConfig.delay);

    EventSystemManager.addHandler(element, 'input', (e) => {
      const value = e.target.value.trim();

      // When user types (not selected from list), set hidden input to text value
      // This allows fallback to text if no selection is made
      if (hiddenInput) {
        hiddenInput.value = value;
      }
      instance.selectedValue = null;

      debounce(value);

      // If autocomplete is not enabled, call onChange to notify listeners
      try {
        if (!acConfig.enabled && config && typeof config.onChange === 'function') {
          config.onChange(element, value);
        }
      } catch (err) {
        console.warn('Error in onChange handler (input):', err);
      }
    });

    // Focus event - show dropdown when input gets focus (if autocomplete enabled)
    EventSystemManager.addHandler(element, 'focus', () => {
      // Mark this instance as active
      instance._isActive = true;

      // Only populate if autocomplete is enabled
      if (!acConfig.enabled) return;

      // For hierarchical inputs, use HierarchicalTextFactory manager
      if (instance.manager && typeof instance.manager.search === 'function') {
        instance.manager.search(instance, element.value.trim());
        return;
      }

      if (acConfig.source) {
        if (typeof acConfig.source === 'string' && window[acConfig.source]) {
          // Global variable reference
          instance.populate(window[acConfig.source]);
        } else if (typeof acConfig.source === 'string' && (acConfig.source.startsWith('http') || acConfig.source.startsWith('/') || acConfig.source.startsWith('api/'))) {
          // URL (absolute, root-relative, or relative path starting with 'api/')
          // Only load on focus if there's already a value to search for
          const currentValue = element.value.trim();
          if (currentValue.length >= acConfig.minLength) {
            this.loadFromAjax(instance, acConfig.source, currentValue);
          }
          // Otherwise wait for user to type (handled by input event)
        } else {
          // Populate from existing array/object
          instance.populate(acConfig.source);
        }
      }
    });

    // Keydown event - navigate dropdown list
    EventSystemManager.addHandler(element, 'keydown', (e) => {
      if (!instance.dropdownPanel?.isOpen() ||
        instance.dropdownPanel.currentTarget !== element) return;

      switch (e.key) {
        case 'ArrowDown':
          instance.highlightItem(instance.listIndex + 1);
          e.preventDefault();
          e.stopPropagation();
          break;
        case 'ArrowUp':
          instance.highlightItem(instance.listIndex - 1);
          e.preventDefault();
          e.stopPropagation();
          break;
        case 'Enter':
          const item = instance.list[instance.listIndex];
          if (item) {
            // Get text from item (remove HTML tags)
            const text = item.textContent || item.innerText;
            const key = item.dataset.key;
            instance.selectItem(key, text);
          }
          e.preventDefault();
          e.stopPropagation();
          break;
        case 'Escape':
          if (typeof instance.hide === 'function') {
            instance.hide();
          }
          e.preventDefault();
          e.stopPropagation();
          break;
      }
    });

    // Blur event - hide dropdown with delay to allow click events
    EventSystemManager.addHandler(element, 'blur', (e) => {
      // Mark as not active
      instance._isActive = false;

      setTimeout(() => {
        // Only hide if not clicking inside DropdownPanel and still not active
        const panel = instance.dropdownPanel?.panel;
        if (!instance._isActive && (!panel || !panel.contains(document.activeElement))) {
          if (typeof instance.hide === 'function') {
            instance.hide();
          }
        }
      }, 200);
    });
  }

  static updateOptions(element, options) {
    // Get element instance from ElementManager
    const instance = ElementManager?.getInstanceByElement(element);

    if (!instance || !instance.config) {
      // Element not yet enhanced - store options in dataset for later use
      element.dataset.pendingOptions = JSON.stringify(options);
      return;
    }

    const acConfig = instance.config.autocomplete;

    // Set options as autocomplete source directly (no datalist needed!)
    acConfig.source = options;

    // Auto-enable autocomplete if not already enabled
    if (!acConfig.enabled) {
      acConfig.enabled = true;
      // Need to setup autocomplete UI
      this.setupAutocomplete(instance);
    }
  }

  static populateFromOptions(element, optionsData, optionsKey) {
    if (!element || !optionsData || !optionsKey) return;

    let options = optionsData[optionsKey];
    if (!options) return;

    // Validate options format (must be Array of {value: string, text: string})
    if (!Array.isArray(options)) {
      console.warn('[TextElementFactory] Options must be an Array. Expected format: [{value: "1", text: "Option 1"}, ...]');
      return;
    }

    // Validate array items have correct format
    const hasInvalidItems = options.some(opt =>
      typeof opt !== 'object' || !('value' in opt) || !('text' in opt)
    );

    if (hasInvalidItems) {
      console.warn('[TextElementFactory] Invalid option format. Each item must have {value: string, text: string}');
      return;
    }

    // Save current value before updating options
    const currentValue = element.value;

    // Update element's options using existing updateOptions method
    this.updateOptions(element, options);

    // Restore value after populating options (important for modal forms)
    if (currentValue) {
      // Find the option that matches the current value (could be ID/key or display text)
      // Check both value and text fields to handle cases where setFormData already converted ID to text
      // Use loose equality (==) to handle type coercion (e.g., 10 == "10")
      const matchedOption = options.find(opt =>
        opt.value == currentValue || opt.text == currentValue ||
        String(opt.value) === String(currentValue) || String(opt.text) === String(currentValue)
      );

      if (matchedOption) {
        // Set the display text in the visible input
        element.value = matchedOption.text;

        // Also update hidden input with the ID value (not currentValue!)
        const instance = ElementManager?.getInstanceByElement(element);
        if (instance?.hiddenInput) {
          instance.hiddenInput.value = matchedOption.value;
          instance.selectedValue = matchedOption.value;
        }
      } else {
        // If no match found, keep the original value
        element.value = currentValue;
      }
    }
  }

  static populateFromOptionsInContainer(container, optionsData) {
    if (!container || !optionsData) return;

    const inputsWithOptionsKey = container.querySelectorAll('input[data-options-key]');

    inputsWithOptionsKey.forEach(input => {
      const optionsKey = input.dataset.optionsKey;
      this.populateFromOptions(input, optionsData, optionsKey);
    });
  }

  /**
   * After form data is loaded (values set from server), convert any inputs
   * that have an ID value into display text by looking up the source.
   * This is needed because options may have been set before form data was
   * applied, or vice-versa.
   * @param {HTMLElement} container - form or container element
   */
  static applyInitialValuesInContainer(container) {
    if (!container) return;
    const inputsWithOptionsKey = container.querySelectorAll('input[data-options-key], select[data-options-key]');
    inputsWithOptionsKey.forEach(input => {
      const instance = ElementManager?.getInstanceByElement(input);
      if (instance && instance.config && instance.config.autocomplete && instance.config.autocomplete.source) {
        const val = input.value;
        if (val) {
          this.setInitialValue(instance, val);
        }
      }
    });
  }

  /**
   * Normalize source data into standard format: Array<{value: string, text: string}>
   * Accepts: Array (objects or primitives), Map, plain Object, or null
   * Returns: Array<{value: string, text: string}> or null
   */
  static normalizeSource(source) {
    if (!source) return null;

    // If source is a string, attempt to resolve it to actual data.
    // Acceptable string forms:
    // - A global variable name (e.g. 'PROVINCES') -> resolve window[NAME]
    // - A JSON string -> parse it
    // - A URL (starts with http, /, or api/) -> leave for AJAX loader (return null)
    if (typeof source === 'string') {
      // URL -> nothing to normalize here (will be loaded via AJAX elsewhere)
      if (/^(https?:\/\/|\/|api\/)/i.test(source)) return null;

      // Try resolving a global variable reference
      try {
        if (typeof window !== 'undefined' && window[source]) {
          source = window[source];
        } else {
          // Try parsing as JSON string
          try {
            const parsed = JSON.parse(source);
            source = parsed;
          } catch (e) {
            // leave as-is (will fall through to final invalid warning)
          }
        }
      } catch (e) {
        // ignore and proceed to validation below
      }
    }

    // Array format (most common)
    if (Array.isArray(source)) {
      return source.map(item => {
        // Support arrays of [key, text]
        if (Array.isArray(item) && item.length >= 2) {
          return {value: String(item[0]), text: String(item[1])};
        }

        // Object format: {value, text} or {id, name} etc.
        if (item && typeof item === 'object') {
          const value = item.value !== undefined ? item.value : (item.id ?? item.key ?? item.name ?? '');
          const text = item.text ?? item.label ?? item.name ?? value;
          return {value: String(value), text: String(text)};
        }

        // Primitive: use same value for both
        const str = String(item);
        return {value: str, text: str};
      });
    }

    // Map format
    if (source instanceof Map) {
      const result = [];
      for (const [k, v] of source.entries()) {
        const value = String(k);
        const text = (v && typeof v === 'object')
          ? String(v.text || v.label || v.name || k)
          : String(v);
        result.push({value, text});
      }
      return result;
    }

    // Plain object format {key: value, ...}
    // But first check if it's an API response format {success, data}
    if (typeof source === 'object' && source !== null) {
      // Check for API response format: {success: true, data: [...]}
      if (source.success !== undefined && Array.isArray(source.data)) {
        // Recursively normalize the data array
        return TextElementFactory.normalizeSource(source.data);
      }

      // Regular object format {key: value, ...}
      return Object.entries(source).map(([k, v]) => {
        const value = String(k);
        const text = (v && typeof v === 'object')
          ? String(v.text || v.label || v.name || k)
          : String(v);
        return {value, text};
      });
    }

    console.warn('[TextElementFactory] Invalid source format. Expected Array, Map, or Object.');
    return null;
  }
}

/**
 * TextElementFactory Export
 */
window.TextElementFactory = TextElementFactory;

/**
 * HierarchicalTextFactory
 * Manages hierarchical/cascading inputs grouped by form
 */
class HierarchicalTextFactory extends ElementFactory {
  static groups = new Map(); // form -> { instances: [], dataCache: null }
  static dataCache = null;   // Shared data cache (same source)

  static getGroup(instance) {
    const form = instance.element.closest('form') || document.body;
    if (!this.groups.has(form)) {
      this.groups.set(form, {instances: [], dataCache: null});
    }
    return this.groups.get(form);
  }

  static register(instance) {
    instance.manager = this;
    const group = this.getGroup(instance);
    group.instances.push(instance);

    // Load data if this is the first instance with a source
    const source = instance.config.autocomplete.source;
    if (source && !this.dataCache) {
      this.loadData(source);
    } else if (this.dataCache) {
      // Data already loaded, share it
      group.dataCache = this.dataCache;
    }
  }

  static loadData(source) {
    // Check if source is a global variable
    if (typeof source === 'string' && window[source]) {
      this.dataCache = window[source];
      this.syncDataToGroups();
      return;
    }

    // Check if source is a URL (http/https or relative path like .json)
    const isUrl = typeof source === 'string' && (
      source.startsWith('http') ||
      source.startsWith('/') ||
      source.endsWith('.json') ||
      source.includes('/')
    );

    if (isUrl) {
      // Use HttpClient if available
      if (window.http && typeof window.http.get === 'function') {
        window.http.get(source, {throwOnError: false})
          .then(resp => {
            if (resp && resp.success) {
              this.dataCache = resp.data;
              this.syncDataToGroups();
            } else if (resp && !resp.success && resp.data) {
              // Sometimes response is direct data
              this.dataCache = resp.data;
              this.syncDataToGroups();
            } else {
              console.error('[HierarchicalTextFactory] Failed to load hierarchical data:', source, resp);
            }
          })
          .catch(err => {
            console.error('[HierarchicalTextFactory] Error loading hierarchical data:', err);
          });
      } else {
        // Fallback to fetch API
        fetch(source)
          .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          })
          .then(data => {
            this.dataCache = data;
            this.syncDataToGroups();
          })
          .catch(err => {
            console.error('[HierarchicalTextFactory] Error loading hierarchical data:', err);
          });
      }
    }
  }

  static syncDataToGroups() {
    // Share data cache to all groups
    this.groups.forEach(group => {
      group.dataCache = this.dataCache;
    });
  }

  static getInstancesInGroup(instance) {
    const group = this.getGroup(instance);
    return group.instances;
  }

  static getLevelInGroup(instance) {
    const instances = this.getInstancesInGroup(instance);
    return instances.findIndex(inst => inst === instance);
  }

  static getInstanceByLevelInGroup(instance, level) {
    const instances = this.getInstancesInGroup(instance);
    return instances[level];
  }

  static onSelectionChange(changedInstance) {
    const instances = this.getInstancesInGroup(changedInstance);
    const level = instances.findIndex(inst => inst === changedInstance);
    if (level === -1) return;

    // Clear all instances after this level
    for (let i = level + 1; i < instances.length; i++) {
      instances[i].element.value = '';
      instances[i].selectedValue = null;
      if (instances[i].hiddenInput) {
        instances[i].hiddenInput.value = '';
      }
    }
  }

  /**
   * Generic search for any level
   * Supports any number of hierarchical levels (2, 3, 4, etc.)
   */
  static search(instance, query) {
    const instances = this.getInstancesInGroup(instance);
    const level = instances.findIndex(inst => inst === instance);
    const totalLevels = instances.length;
    if (!this.dataCache) return;

    if (level === 0) {
      // First level - show all top-level items
      instance.populate(this.dataCache);
    } else {
      // Get data based on parent selections
      let data = this.dataCache;
      let allParentsSelected = true;

      for (let i = 0; i < level; i++) {
        const parentValue = instances[i]?.selectedValue;
        if (parentValue && data && data[parentValue]) {
          data = data[parentValue];
        } else {
          allParentsSelected = false;
          break;
        }
      }

      if (allParentsSelected && data) {
        instance.populate(data);
      } else if (query && query.length >= 1) {
        // Reverse search when parent levels not selected
        this.reverseSearch(instance, query, level, totalLevels);
      } else {
        instance.populate({});
      }
    }
  }

  /**
   * Generic reverse search for any level
   * @param {Object} instance - The input instance
   * @param {string} query - Search query
   * @param {number} targetLevel - The level to search at (1, 2, 3, etc.)
   * @param {number} totalLevels - Total number of levels in hierarchy
   */
  static reverseSearch(instance, query, targetLevel, totalLevels) {
    if (!query || !this.dataCache) return;

    const filter = new RegExp(instance.escapeRegExp(query), 'gi');
    const results = [];

    // Recursive function to traverse data at any depth
    const traverse = (data, path = [], depth = 0) => {
      if (depth === targetLevel) {
        // At target level - search keys or leaf values
        for (let key in data) {
          const value = data[key];
          // Check if this is the last level (leaf nodes have non-object values)
          const isLeaf = typeof value !== 'object' || value === null;

          if (isLeaf) {
            // Leaf level - search in values
            if (filter.test(value)) {
              results.push({
                path: [...path],
                key: key,
                value: value,
                isLeaf: true
              });
            }
          } else {
            // Non-leaf level - search in keys
            if (filter.test(key)) {
              results.push({
                path: [...path],
                key: key,
                value: key,
                isLeaf: false,
                children: value
              });
            }
          }
        }
      } else if (depth < targetLevel && typeof data === 'object' && data !== null) {
        // Continue traversing
        for (let key in data) {
          traverse(data[key], [...path, key], depth + 1);
        }
      }
    };

    traverse(this.dataCache);

    // Build flattened results for dropdown
    const flatResults = {};
    results.forEach(item => {
      // Build display text: "value (parent1, parent2, ...)"
      const parents = item.path.slice().reverse().join(', ');
      const displayValue = item.isLeaf ? item.value : item.key;

      // Build unique key
      let uniqueKey;
      if (item.isLeaf) {
        uniqueKey = item.key;
      } else {
        // For non-leaf, use path separator
        uniqueKey = [...item.path, item.key].join('||');
      }

      flatResults[uniqueKey] = parents ? `${displayValue} (${parents})` : displayValue;
    });

    // Store pending data for auto-fill on selection
    instance._pendingReverseData = results;
    instance._pendingReverseLevel = targetLevel;
    instance._pendingReverseTotalLevels = totalLevels;

    instance.populate(flatResults);
  }

  /**
   * Handle selection from reverse search results
   * Auto-fill parent levels based on selection
   */
  static handleReverseSelection(instance, key, value) {
    const instances = this.getInstancesInGroup(instance);
    const results = instance._pendingReverseData;
    const level = instance._pendingReverseLevel;

    if (!results || !Array.isArray(results)) return;

    // Find the matching result
    let matchedResult = null;
    for (const item of results) {
      let itemKey;
      if (item.isLeaf) {
        itemKey = item.key;
      } else {
        itemKey = [...item.path, item.key].join('||');
      }

      if (itemKey === key) {
        matchedResult = item;
        break;
      }
    }

    if (!matchedResult) return;

    // Auto-fill parent levels from path
    matchedResult.path.forEach((pathValue, i) => {
      if (instances[i]) {
        instances[i].element.value = pathValue;
        instances[i].selectedValue = pathValue;
        if (instances[i].hiddenInput) {
          instances[i].hiddenInput.value = pathValue;
        }
      }
    });

    // Set current field value
    if (matchedResult.isLeaf) {
      instance.element.value = matchedResult.value;
      instance.selectedValue = matchedResult.key;
      if (instance.hiddenInput) {
        instance.hiddenInput.value = matchedResult.key;
      }
    } else {
      instance.element.value = matchedResult.key;
      instance.selectedValue = matchedResult.key;
      if (instance.hiddenInput) {
        instance.hiddenInput.value = matchedResult.key;
      }
    }

    // Clear all child levels after current level
    const currentLevel = instances.findIndex(inst => inst === instance);
    for (let i = currentLevel + 1; i < instances.length; i++) {
      if (instances[i]) {
        instances[i].element.value = '';
        instances[i].selectedValue = null;
        if (instances[i].hiddenInput) {
          instances[i].hiddenInput.value = '';
        }
      }
    }

    // Clear pending data
    instance._pendingReverseData = null;
    instance._pendingReverseLevel = null;
    instance._pendingReverseTotalLevels = null;
  }

  /**
   * Check if selection is from reverse search
   */
  static isReverseSearchSelection(instance) {
    return instance._pendingReverseData != null;
  }
}

class EmailElementFactory extends TextElementFactory {
  static config = {
    ...TextElementFactory.config,
    type: 'text',
    inputMode: 'email',
    validation: ['email'],
    formatter: (value) => {
      return value.toLowerCase();
    }
  };
}

class UrlElementFactory extends TextElementFactory {
  static config = {
    ...TextElementFactory.config,
    type: 'text',
    inputMode: 'url',
    validation: ['url']
  };
}

class UsernameElementFactory extends TextElementFactory {
  static config = {
    ...TextElementFactory.config,
    type: 'text',
    inputMode: 'text',
    validation: ['usernameOrEmail'],
    formatter: (value) => {
      return value.toLowerCase();
    }
  };
}

ElementManager.registerElement('text', TextElementFactory);
ElementManager.registerElement('email', EmailElementFactory);
ElementManager.registerElement('url', UrlElementFactory);
ElementManager.registerElement('username', UsernameElementFactory);
