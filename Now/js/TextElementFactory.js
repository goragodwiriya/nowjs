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
        level: dataset.level || def.autocomplete?.level,
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

    // Save the original name and create a hidden input only when necessary
    const originalName = element.getAttribute('name') || '';
    const shouldCreateHidden = !!originalName && (acConfig.enabled || !!acConfig.source || !!dataFromDatalist || element.hasAttribute('data-hierarchy'));
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

  static loadFromAjax(instance, url) {
    // Use HttpClient only - no fallback
    if (!window.http || typeof window.http.get !== 'function') {
      console.error('[TextElementFactory] HttpClient (window.http) is required but not available');
      alert('System error: HttpClient not loaded. Please refresh the page.');
      return;
    }

    window.http.get(url, {throwOnError: false})
      .then(resp => {
        if (resp && resp.ok) {
          instance.populate(resp.data);
        } else {
          console.error('[TextElementFactory] Failed to load data:', url, resp);
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
        if (resp && resp.ok && resp.data) {
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

    // ป้องกันการ register event ซ้ำ
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
      } else {
        // Normal populate from source
        instance.populate(acConfig.source);
      }
    }, acConfig.delay);

    EventSystemManager.addHandler(element, 'input', (e) => {
      const value = e.target.value.trim();

      // Clear hidden input when user types (not selected from list)
      if (hiddenInput) {
        hiddenInput.value = '';
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

    if (acConfig.enabled) {
      EventSystemManager.addHandler(element, 'focus', () => {
        // Mark this instance as active
        instance._isActive = true;

        if (acConfig.source) {
          if (typeof acConfig.source === 'string' && window[acConfig.source]) {
            // Global variable reference
            instance.populate(window[acConfig.source]);
          } else if (typeof acConfig.source === 'string' && (acConfig.source.startsWith('http') || acConfig.source.startsWith('/') || acConfig.source.startsWith('api/'))) {
            // URL (absolute, root-relative, or relative path starting with 'api/')
            if (!instance._ajaxLoaded) {
              this.loadFromAjax(instance, acConfig.source);
              instance._ajaxLoaded = true;
            }
          } else {
            // Populate จาก array/object ที่มีอยู่แล้ว
            instance.populate(acConfig.source);
          }
        }
      });


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
            instance.hide();
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
            instance.hide();
          }
        }, 200);
      });
    }
  }

  static updateOptions(element, options) {
    // Get element instance from ElementManager
    const instance = ElementManager?.getInstance(element);

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

    const initialValue = element.value;
    if (initialValue && acConfig.source) {
      this.setInitialValue(instance, initialValue);
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
      // Find the option that matches the current value (which is the ID/key)
      const matchedOption = options.find(opt => opt.value === currentValue);
      if (matchedOption) {
        element.value = matchedOption.text;
        // Also update hidden input with the ID
        const instance = ElementManager?.getInstance(element);
        if (instance?.hiddenInput) {
          instance.hiddenInput.value = currentValue;
          instance.selectedValue = currentValue;
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
      const instance = ElementManager?.getInstance(input);
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
    if (typeof source === 'object' && source !== null) {
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
 */
class HierarchicalTextFactory extends ElementFactory {
  static instances = [];
  static dataCache = null;

  static register(instance) {
    instance.manager = this;
    this.instances.push(instance);

    if (this.instances.length === 1) {
      const source = instance.config.autocomplete.source;
      if (source) this.loadData(source);
    }
  }

  static loadData(source) {
    if (typeof source === 'string' && window[source]) {
      this.dataCache = window[source];
      this.updateLevel(0);
    } else if (typeof source === 'string' && source.startsWith('http')) {
      // Use HttpClient only - no fallback
      if (!window.http || typeof window.http.get !== 'function') {
        console.error('[HierarchicalTextFactory] HttpClient (window.http) is required but not available');
        alert('System error: HttpClient not loaded. Please refresh the page.');
        return;
      }

      window.http.get(source, {throwOnError: false})
        .then(resp => {
          if (resp && resp.ok) {
            this.dataCache = resp.data;
            this.updateLevel(0);
          } else {
            console.error('[HierarchicalTextFactory] Failed to load hierarchical data:', source, resp);
          }
        })
        .catch(err => {
          console.error('[HierarchicalTextFactory] Error loading hierarchical data:', err);
        });
    }
  }

  static updateLevel(level) {
    const instance = this.instances.find(inst => inst.config.autocomplete.level === ['province', 'district', 'subdistrict'][level]);
    if (!instance || !this.dataCache) return;

    let data = this.dataCache;
    for (let i = 0; i < level; i++) {
      const prevInstance = this.instances[i];
      const prevValue = prevInstance.selectedValue;
      if (prevValue && data[prevValue]) data = data[prevValue];
      else return;
    }
    instance.populate(data);
  }

  static onSelectionChange(changedInstance) {
    const level = this.instances.findIndex(inst => inst === changedInstance);
    if (level === -1) return;

    for (let i = level + 1; i < this.instances.length; i++) {
      this.instances[i].element.value = '';
      this.instances[i].selectedValue = null;
      this.instances[i].hiddenInput.value = '';
      this.updateLevel(i);
    }
  }

  static search(instance, query) {
    const level = this.instances.findIndex(inst => inst === instance);
    if (!this.dataCache) return;

    if (level === 0) {
      instance.populate(this.dataCache);
    } else if (level === 1) {
      const province = this.instances[0].selectedValue;
      if (province) instance.populate(this.dataCache[province] || {});
    } else if (level === 2) {
      const province = this.instances[0].selectedValue;
      const district = this.instances[1].selectedValue;
      if (province && district) {
        instance.populate(this.dataCache[province][district] || {});
      } else {
        this.reverseSearch(query);
      }
    }
  }

  static reverseSearch(query) {
    const results = {};
    const filter = new RegExp(this.instances[2].escapeRegExp(query), 'gi');

    for (let province in this.dataCache) {
      for (let district in this.dataCache[province]) {
        for (let subdistrict in this.dataCache[province][district]) {
          if (filter.test(this.dataCache[province][district][subdistrict])) {
            if (!results[province]) results[province] = {};
            if (!results[province][district]) results[province][district] = {};
            results[province][district][subdistrict] = this.dataCache[province][district][subdistrict];
          }
        }
      }
    }

    if (Object.keys(results).length === 1) {
      const province = Object.keys(results)[0];
      this.instances[0].element.value = province;
      this.instances[0].hiddenInput.value = province;
      this.instances[0].selectedValue = province;
      this.updateLevel(1);

      const district = Object.keys(results[province])[0];
      this.instances[1].element.value = district;
      this.instances[1].hiddenInput.value = district;
      this.instances[1].selectedValue = district;
      this.updateLevel(2);
    } else {
      this.instances[2].populate(results);
    }
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
