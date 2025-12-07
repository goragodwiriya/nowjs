const EditInPlaceManager = {
  config: {
    className: 'edit-in-place',
    activeClass: 'editing',
    focusOnEdit: true,
    selectOnEdit: true,
    saveOnBlur: true,
    cancelOnEscape: true,
    saveOnEnter: true,
    defaultEditor: 'input',  // 'input', 'textarea', 'select'
    ajaxSave: false,
    ajaxUrl: null,
    ajaxMethod: 'POST',
    callbacks: {},
    validationMessages: {
      required: 'This field is required',
      min: 'Value must be at least {min}',
      max: 'Value must be at most {max}',
      pattern: 'Invalid format',
      type: 'Invalid type'
    }
  },

  state: {
    instances: new Map(),
    activeEditor: null,
    initialized: false
  },

  init(options = {}) {
    if (this.state.initialized) return this;

    this.config = {...this.config, ...options};
    this.setupGlobalEvents();

    // Initialize any existing elements with data-edit-in-place attribute
    document.querySelectorAll('[data-edit-in-place]').forEach(element => {
      this.create(element);
    });

    this.state.initialized = true;
    return this;
  },

  create(element, options = {}) {
    // Allow both element reference and ID string
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }

    if (!element) return null;

    // Skip if already initialized
    if (element.editInPlace) {
      return element.editInPlace;
    }

    // Extract config from data attributes
    const dataOptions = this.extractDataOptions(element);

    // Combine configs: default < data attributes < options parameter
    const config = {...this.config, ...dataOptions, ...options};

    // Initialize the instance
    const instance = {
      element,
      config,
      originalValue: element.textContent.trim(),
      editor: null,
      isEditing: false
    };

    // Store on element for easy access
    element.editInPlace = instance;

    // Store in manager
    this.state.instances.set(element, instance);

    // Setup element styling and events
    this.setupElement(instance);

    return instance;
  },

  extractDataOptions(element) {
    const options = {};
    const dataset = element.dataset;

    if (dataset.editInPlace !== '') {
      options.editor = dataset.editInPlace;
    }

    if (dataset.editSaveOnBlur !== undefined) {
      options.saveOnBlur = dataset.editSaveOnBlur === 'true';
    }

    if (dataset.editSelectOnEdit !== undefined) {
      options.selectOnEdit = dataset.editSelectOnEdit === 'true';
    }

    if (dataset.editFocusOnEdit !== undefined) {
      options.focusOnEdit = dataset.editFocusOnEdit === 'true';
    }

    if (dataset.editAjaxSave !== undefined) {
      options.ajaxSave = dataset.editAjaxSave === 'true';
    }

    if (dataset.editAjaxUrl) {
      options.ajaxUrl = dataset.editAjaxUrl;
    }

    if (dataset.editCallback) {
      if (typeof window[dataset.editCallback] === 'function') {
        options.onSave = window[dataset.editCallback];
      }
    }

    // New options
    if (dataset.type) options.type = dataset.type;
    if (dataset.required !== undefined) options.required = dataset.required === 'true' || dataset.required === '';
    if (dataset.min) options.min = dataset.min;
    if (dataset.max) options.max = dataset.max;
    if (dataset.step) options.step = dataset.step;
    if (dataset.pattern) options.pattern = dataset.pattern;

    return options;
  },

  setupElement(instance) {
    const {element, config} = instance;

    // Add styling
    element.classList.add(config.className);
    element.style.cursor = 'pointer';
    element.tabIndex = 0;

    // Add events
    element.addEventListener('click', () => this.startEdit(instance));
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.startEdit(instance);
      }
    });

    // Make accessible
    if (!element.getAttribute('role')) {
      element.setAttribute('role', 'button');
    }
    if (!element.getAttribute('aria-label')) {
      element.setAttribute('aria-label', `Edit ${element.textContent.trim()}`);
    }
  },

  startEdit(instance) {
    if (instance.isEditing) return;

    // Cancel any active editing
    if (this.state.activeEditor) {
      this.cancelEdit(this.state.activeEditor);
    }

    const {element, config} = instance;

    // Create editor
    const editorElement = this.createEditor(instance);

    // Insert editor
    element.parentNode.insertBefore(editorElement, element);

    // Hide original element
    instance.originalDisplay = element.style.display;
    element.style.display = 'none';

    // Set editing state
    instance.isEditing = true;
    instance.editor = editorElement;
    this.state.activeEditor = instance;

    // Focus and select
    if (config.focusOnEdit) {
      editorElement.focus();
    }

    if (config.selectOnEdit && editorElement.select) {
      editorElement.select();
    }

    // Add event listeners
    if (config.saveOnBlur) {
      editorElement.addEventListener('blur', () => this.saveEdit(instance));
    }

    editorElement.addEventListener('keydown', (e) => {
      if (config.cancelOnEscape && e.key === 'Escape') {
        e.preventDefault();
        this.cancelEdit(instance);
      } else if (config.saveOnEnter && e.key === 'Enter' &&
        editorElement.tagName.toLowerCase() !== 'textarea') {
        e.preventDefault();
        this.saveEdit(instance);
      }
    });

    // Emit event
    this.emitEvent('edit:start', {
      instance,
      element: element,
      editor: editorElement
    });
  },

  createEditor(instance) {
    const {element, config} = instance;
    let editorElement;

    const value = element.textContent.trim();

    // Create editor based on type
    switch (config.editor || config.defaultEditor) {
      case 'textarea':
        editorElement = document.createElement('textarea');
        editorElement.value = value;
        editorElement.rows = 3;
        break;

      case 'select':
        editorElement = document.createElement('select');

        // Create options from data-options attribute
        if (element.dataset.options) {
          const options = element.dataset.options.split(',');
          options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option.trim();
            optElement.textContent = option.trim();
            if (option.trim() === value) {
              optElement.selected = true;
            }
            editorElement.appendChild(optElement);
          });
        }
        break;

      default:
        editorElement = document.createElement('input');
        editorElement.type = config.type || 'text';
        editorElement.value = value;

        // Apply validation attributes
        if (config.required) editorElement.required = true;
        if (config.min) editorElement.min = config.min;
        if (config.max) editorElement.max = config.max;
        if (config.step) editorElement.step = config.step;
        if (config.pattern) editorElement.pattern = config.pattern;
    }

    // Copy attributes that should be preserved
    ['data-id', 'name', 'data-name', 'data-field'].forEach(attr => {
      if (element.hasAttribute(attr)) {
        editorElement.setAttribute(attr, element.getAttribute(attr));
      }
    });

    // Style the editor
    editorElement.className = `${config.className}-editor`;

    // Add validation class if needed
    if (config.required || config.min || config.max || config.pattern) {
      editorElement.classList.add('validate');
    }

    return editorElement;
  },

  validate(value, instance) {
    const {config} = instance;
    const result = {valid: true, message: null};

    if (config.required && !value) {
      result.valid = false;
      result.message = config.validationMessages.required;
      return result;
    }

    if (value) {
      if (config.type === 'number') {
        const num = parseFloat(value);
        if (config.min !== undefined && num < parseFloat(config.min)) {
          result.valid = false;
          result.message = config.validationMessages.min.replace('{min}', config.min);
          return result;
        }
        if (config.max !== undefined && num > parseFloat(config.max)) {
          result.valid = false;
          result.message = config.validationMessages.max.replace('{max}', config.max);
          return result;
        }
      }

      if (config.pattern) {
        const regex = new RegExp(config.pattern);
        if (!regex.test(value)) {
          result.valid = false;
          result.message = config.validationMessages.pattern;
          return result;
        }
      }
    }

    return result;
  },

  async saveEdit(instance) {
    if (!instance.isEditing) return;

    const {element, config, editor} = instance;
    let newValue = editor.value;
    let success = true;

    // Validate
    const validation = this.validate(newValue, instance);
    if (!validation.valid) {
      if (window.NotificationManager) {
        NotificationManager.error(validation.message);
      } else {
        alert(validation.message);
      }
      // Highlight error
      editor.classList.add('error');
      editor.focus();
      return;
    }
    editor.classList.remove('error');

    // Call onBeforeSave callback if exists
    if (typeof config.onBeforeSave === 'function') {
      const result = config.onBeforeSave.call(element, newValue, instance);
      if (result === false) {
        return; // Cancel save if callback returns false
      }

      // Allow callback to modify the value
      if (result !== undefined && result !== true) {
        newValue = result;
      }
    }

    // Handle AJAX save
    if (config.ajaxSave && config.ajaxUrl) {
      try {
        // Prepare data
        const formData = new FormData();
        formData.append('value', newValue);
        formData.append('field', element.dataset.field || element.id);
        formData.append('id', element.dataset.id || '');

        const apiService = window.ApiService || window.Now?.getManager?.('api');
        const requestHeaders = {
          'X-Requested-With': 'XMLHttpRequest'
        };

        let response;
        if (apiService?.post) {
          response = await apiService.post(config.ajaxUrl, formData, {headers: requestHeaders});
        } else if (window.simpleFetch?.post) {
          response = await simpleFetch.post(config.ajaxUrl, formData, {headers: requestHeaders});
        } else {
          throw new Error('ApiService is not available');
        }

        if (!response.success) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const result = response.data || {};

        // Check server response
        if (result.error) {
          if (window.NotificationManager) {
            NotificationManager.error(result.message || 'Error saving data');
          }
          success = false;
        } else {
          // If server returns a value, use that instead
          if (result.value !== undefined) {
            newValue = result.value;
          }
        }
      } catch (error) {
        console.error('Error saving data:', error);
        if (window.NotificationManager) {
          NotificationManager.error('Error saving data');
        }
        success = false;
      }
    }

    // Call onSave callback if exists
    if (success && typeof config.onSave === 'function') {
      const result = config.onSave.call(element, newValue, instance);
      if (result === false) {
        success = false;
      }
    }

    // Update original element if successful
    if (success) {
      // Format value if needed
      let displayValue = newValue;
      if (typeof config.format === 'function') {
        displayValue = config.format(newValue);
      }

      element.textContent = displayValue;
      // Update originalValue for next edit
      instance.originalValue = displayValue;

      this.cancelEdit(instance);

      // Emit event
      this.emitEvent('edit:save', {
        instance,
        element: element,
        value: newValue,
        displayValue: displayValue,
        previousValue: instance.originalValue
      });
    }
  },

  cancelEdit(instance) {
    if (!instance.isEditing) return;

    const {element, editor, originalDisplay} = instance;

    // Restore original element
    element.style.display = originalDisplay;

    // Remove editor
    if (editor && editor.parentNode) {
      editor.parentNode.removeChild(editor);
    }

    // Reset state
    instance.isEditing = false;
    instance.editor = null;

    if (this.state.activeEditor === instance) {
      this.state.activeEditor = null;
    }

    // Focus back on element
    element.focus();

    // Emit event
    this.emitEvent('edit:cancel', {
      instance,
      element: element
    });
  },

  setupGlobalEvents() {
    // Handle clicks outside of active editor
    document.addEventListener('click', (e) => {
      const activeInstance = this.state.activeEditor;
      if (!activeInstance) return;

      const {element, editor} = activeInstance;

      // If click is outside the editor and the original element
      if (!editor.contains(e.target) && !element.contains(e.target)) {
        this.saveEdit(activeInstance);
      }
    });
  },

  emitEvent(eventName, data) {
    // Use EventManager if available
    if (window.EventManager?.emit) {
      EventManager.emit(eventName, data);
    }
    // Use Now.emit if available
    else if (window.Now?.emit) {
      Now.emit(eventName, data);
    }
    // Fall back to native CustomEvent
    else {
      const event = new CustomEvent(eventName, {
        detail: data,
        bubbles: true
      });
      document.dispatchEvent(event);
    }
  },

  getInstance(element) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }

    if (!element) return null;

    return this.state.instances.get(element) || null;
  },

  destroy(instance) {
    if (typeof instance === 'string') {
      instance = this.getInstance(instance);
    }

    if (!instance) return;

    const {element} = instance;

    // Cancel editing if active
    if (instance.isEditing) {
      this.cancelEdit(instance);
    }

    // Remove class and styling
    element.classList.remove(this.config.className);
    element.style.cursor = '';
    element.removeAttribute('tabIndex');

    // Remove event listeners
    element.removeEventListener('click', this.startEdit);
    element.removeEventListener('keydown', this.handleKeyDown);

    // Remove references
    delete element.editInPlace;
    this.state.instances.delete(element);
  }
};

// Register with Now framework if available
if (window.Now?.registerManager) {
  Now.registerManager('editInPlace', EditInPlaceManager);
}

window.EditInPlaceManager = EditInPlaceManager;