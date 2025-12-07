/**
 * TagsElementFactory - Factory for creating tags/chips input elements
 *
 * Converts a text input into a tags input with:
 * - Multiple value support as visual tags/chips
 * - Keyboard navigation (Enter to add, Backspace to remove)
 * - Autocomplete integration
 * - Hidden inputs for form submission
 * - Click to focus behavior
 */

class TagsElementFactory extends ElementFactory {
  static config = {
    ...ElementFactory.config,
    type: 'text',
    placeholder: 'Add tags...',
    separator: ',', // Character to split pasted values
    maxTags: null, // Maximum number of tags (null = unlimited)
    duplicates: false, // Allow duplicate tags
    autocomplete: {
      enabled: false,
      source: null,
      minLength: 2,
      maxResults: 10,
      delay: 300
    },
    validationMessages: {
      maxTags: 'Maximum number of tags reached',
      duplicate: 'This tag already exists'
    }
  };

  static propertyHandlers = {
    value: {
      get(element) {
        // Read from hidden inputs container
        const wrapper = element.closest('.tags-input-wrapper');
        if (!wrapper) return [];

        const hiddenContainer = wrapper.querySelector('.tags-hidden-inputs');
        if (!hiddenContainer) return [];

        return Array.from(hiddenContainer.querySelectorAll('input[type="hidden"]')).map(input => input.value);
      },
      set(instance, newValue) {
        // Handle array values (e.g. from API)
        if (Array.isArray(newValue)) {
          this.clearTags(instance);
          newValue.forEach(val => {
            if (typeof val === 'object' && val.key && val.value) {
              this.addTag(instance, val.key, val.value);
            } else {
              this.addTag(instance, val, val);
            }
          });
        } else if (typeof newValue === 'string') {
          // Try to parse JSON array string
          try {
            const parsed = JSON.parse(newValue);
            if (Array.isArray(parsed)) {
              this.clearTags(instance);
              parsed.forEach(val => {
                if (typeof val === 'object' && val.key && val.value) {
                  this.addTag(instance, val.key, val.value);
                } else {
                  this.addTag(instance, val, val);
                }
              });
              return;
            }
          } catch (e) {
            // Not a JSON array, treat as single value or split by separator
          }

          // Treat as single value or split by separator
          const values = newValue.split(instance.config.separator).map(v => v.trim()).filter(v => v);
          this.clearTags(instance);
          values.forEach(val => this.addTag(instance, val, val));
        }
      }
    }
  };

  static extractCustomConfig(element, def, dataset) {
    return {
      separator: dataset.separator || def.separator,
      maxTags: dataset.maxTags ? parseInt(dataset.maxTags) : def.maxTags,
      duplicates: dataset.duplicates === 'true' || def.duplicates,
      autocomplete: {
        enabled: dataset.autocomplete !== undefined ? dataset.autocomplete === 'true' : def.autocomplete?.enabled,
        source: dataset.source || def.autocomplete?.source,
        minLength: this.parseNumeric('minLength', element, def.autocomplete, dataset) || def.autocomplete?.minLength,
        maxResults: this.parseNumeric('maxResults', element, def.autocomplete, dataset) || def.autocomplete?.maxResults,
        delay: this.parseNumeric('delay', element, def.autocomplete, dataset) || def.autocomplete?.delay
      }
    };
  }

  static setupElement(instance) {
    const {element, config} = instance;

    // Store original name before modifying
    const originalName = element.getAttribute('name') || '';
    instance.originalName = originalName;

    // Store parent before moving element
    const originalParent = element.parentNode;

    // Store reference to original input before modifications
    instance.originalInput = element;

    // Change original input name to {name}_text for typing
    element.setAttribute('name', `${originalName}_text`);
    element.className = 'tags-input';

    // Store reference to original input (now used for typing)
    instance.input = element;

    // Create wrapper container
    const wrapper = document.createElement('div');
    wrapper.className = 'tags-input-wrapper';

    // Create tags container (ul)
    const tagsContainer = document.createElement('ul');
    tagsContainer.className = 'tags-container';

    // Create input li wrapper and move element into it
    const inputLi = document.createElement('li');
    inputLi.className = 'tags-input-li';
    inputLi.appendChild(element);

    tagsContainer.appendChild(inputLi);
    wrapper.appendChild(tagsContainer);

    // Create hidden inputs container
    const hiddenInputsContainer = document.createElement('div');
    hiddenInputsContainer.className = 'tags-hidden-inputs';
    hiddenInputsContainer.style.display = 'none';
    wrapper.appendChild(hiddenInputsContainer);

    // Insert wrapper in place of original element
    originalParent.appendChild(wrapper);

    // Store references
    instance.wrapper = wrapper;
    instance.tagsContainer = tagsContainer;
    instance.inputLi = inputLi;
    instance.hiddenInputsContainer = hiddenInputsContainer;
    instance.tags = []; // Array of {key, value} objects
    instance.tagElements = new Map(); // Map of key -> li element

    // Setup autocomplete if enabled
    const acConfig = config.autocomplete;
    if (acConfig?.enabled || acConfig?.source) {
      acConfig.enabled = true;
      this.setupAutocomplete(instance);
    }

    // Setup event handlers
    this.setupEventHandlers(instance);

    // Load initial values from original input
    // Support both string and array values
    const initialValue = element.value; // Use 'element' which is now instance.input
    if (initialValue) {
      let values = [];

      // Try to parse as JSON array first
      try {
        const parsed = JSON.parse(initialValue);
        if (Array.isArray(parsed)) {
          values = parsed;
        } else {
          // Single value
          values = [initialValue];
        }
      } catch (e) {
        // Not JSON, split by separator
        values = initialValue.split(config.separator).map(v => v.trim()).filter(v => v);
      }

      values.forEach(value => {
        if (typeof value === 'object' && value.key && value.value) {
          // Object format: {key, value}
          this.addTag(instance, value.key, value.value);
        } else {
          // String format
          this.addTag(instance, value, value);
        }
      });
    }

    // Add instance methods
    instance.addTag = (key, value) => this.addTag(instance, key, value);
    instance.removeTag = (key) => this.removeTag(instance, key);
    instance.clear = () => this.clearTags(instance);
    instance.getTags = () => this.getTags(instance);
    instance.setTags = (tags) => this.setTags(instance, tags);
    instance.updateOptions = (options) => this.updateOptions(instance, options);

    // Add setValue for FormManager compatibility
    instance.setValue = (value) => {
      if (this.propertyHandlers && this.propertyHandlers.value && this.propertyHandlers.value.set) {
        this.propertyHandlers.value.set.call(this, instance, value);
      }
    };

    return instance;
  }

  static setupAutocomplete(instance) {
    const {input, config} = instance;
    const acConfig = config.autocomplete;

    // Use DropdownPanel
    instance.dropdownPanel = DropdownPanel.getInstance();
    instance.dropdown = document.createElement('ul');
    instance.dropdown.className = 'autocomplete-list';

    instance.list = [];
    instance.listIndex = 0;

    // Read from datalist if exists
    const dataFromDatalist = this.readFromDatalist(instance.originalInput);
    if (dataFromDatalist) {
      acConfig.source = dataFromDatalist;
    }

    instance.populate = (data) => {
      if (document.activeElement !== input && !instance._isActive) return;

      instance.dropdown.innerHTML = '';
      instance.list = [];
      const search = input.value.trim();
      const filter = new RegExp(`(${this.escapeRegExp(search)})`, 'gi');
      let count = 0;

      // Normalize data
      const normalized = TextElementFactory.normalizeSource(data);
      if (!normalized) return;

      // Filter and create list items
      for (const item of normalized) {
        if (count >= acConfig.maxResults) break;

        if (!search || filter.test(item.text)) {
          const li = this.createListItem(instance, item.value, item.text, search);
          instance.list.push(li);
          instance.dropdown.appendChild(li);
          count++;
        }
      }

      instance.highlightItem(0);
      if (instance.list.length) instance.show();
      else instance.hide();
    };

    instance.show = () => {
      instance.dropdownPanel.show(input, instance.dropdown, {
        align: 'left',
        offsetY: 2,
        onClose: () => {}
      });
    };

    instance.hide = () => {
      if (instance.dropdownPanel.isOpen() && instance.dropdownPanel.currentTarget === input) {
        instance.dropdownPanel.hide();
      }
    };

    instance.highlightItem = (index) => {
      instance.listIndex = Math.max(0, Math.min(instance.list.length - 1, index));
      instance.list.forEach((item, i) => item.classList.toggle('active', i === instance.listIndex));
      instance.scrollToItem();
    };

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

    instance.selectItem = (key, value) => {
      this.addTag(instance, key, value);
      input.value = '';
      instance.hide();
    };
  }

  static createListItem(instance, key, value, search) {
    const {config} = instance;
    const acConfig = config.autocomplete;

    const li = document.createElement('li');
    li.dataset.key = key;

    const span = document.createElement('span');
    if (!search) {
      span.textContent = value;
    } else {
      const splitRegex = new RegExp(this.escapeRegExp(search), 'gi');
      const parts = value.split(splitRegex);
      const matches = value.match(splitRegex) || [];

      parts.forEach((part, index) => {
        if (part) span.appendChild(document.createTextNode(part));
        if (index < matches.length) {
          const em = document.createElement('em');
          em.textContent = matches[index];
          span.appendChild(em);
        }
      });
    }

    li.appendChild(span);
    li.addEventListener('mousedown', () => instance.selectItem(key, value));
    li.addEventListener('mousemove', () => instance.highlightItem(instance.list.indexOf(li)));

    return li;
  }

  static readFromDatalist(element) {
    const listId = element.getAttribute('list');
    if (!listId) return null;

    const datalist = document.getElementById(listId);
    if (!datalist) return null;

    const options = Array.from(datalist.querySelectorAll('option'));
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

  static escapeRegExp(str) {
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  static setupEventHandlers(instance) {
    const {input, tagsContainer, config} = instance;
    const acConfig = config.autocomplete;

    // ป้องกันการ register event ซ้ำ
    if (instance._eventHandlersSetup) {
      return;
    }
    instance._eventHandlersSetup = true;

    // Click on container to focus input
    EventSystemManager.addHandler(tagsContainer, 'click', (e) => {
      if (e.target === tagsContainer || e.target.classList.contains('tags-container')) {
        input.focus();
      }
    });

    // Enter key to add tag
    // Enter key to add tag
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();

        // Check if autocomplete is open
        const currentAcConfig = instance.config.autocomplete;
        if (currentAcConfig?.enabled && instance.dropdownPanel?.isOpen() && instance.dropdownPanel.currentTarget === input) {
          const item = instance.list[instance.listIndex];
          if (item) {
            const text = item.textContent || item.innerText;
            const key = item.dataset.key;
            instance.selectItem(key, text);
          }
        } else {
          // Add tag from input value
          const value = input.value.trim();
          if (value) {
            this.addTag(instance, value, value);
            input.value = '';
          }
        }
      } else if (e.key === 'Backspace' && input.value === '') {
        // Remove last tag on backspace when input is empty
        e.preventDefault();
        if (instance.tags.length > 0 && !input.readOnly && !input.disabled) {
          const lastTag = instance.tags[instance.tags.length - 1];
          this.removeTag(instance, lastTag.key);
        }
      } else if (instance.config.autocomplete?.enabled && instance.dropdownPanel?.isOpen() && instance.dropdownPanel.currentTarget === input) {
        // Autocomplete keyboard navigation
        if (e.key === 'ArrowDown') {
          instance.highlightItem(instance.listIndex + 1);
          e.preventDefault();
        } else if (e.key === 'ArrowUp') {
          instance.highlightItem(instance.listIndex - 1);
          e.preventDefault();
        } else if (e.key === 'Escape') {
          instance.hide();
          e.preventDefault();
        }
      }
    });

    // Autocomplete support - Always bind events, check config dynamically
    const debounce = Utils.function.debounce((value) => {
      const currentAcConfig = instance.config.autocomplete;
      if (!currentAcConfig?.enabled || !currentAcConfig?.source) return;

      if (value.length < (currentAcConfig.minLength || 2)) {
        instance.hide();
        return;
      }
      instance.populate(currentAcConfig.source);
    }, acConfig?.delay || 300);

    input.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      const currentAcConfig = instance.config.autocomplete;

      if (currentAcConfig?.enabled) {
        debounce(value);
      }
    });

    EventSystemManager.addHandler(input, 'focus', () => {
      instance._isActive = true;
      const currentAcConfig = instance.config.autocomplete;
      const value = input.value.trim();

      if (currentAcConfig?.enabled && currentAcConfig?.source && value.length >= (currentAcConfig.minLength || 2)) {
        instance.populate(currentAcConfig.source);
      }
    });

    EventSystemManager.addHandler(input, 'blur', () => {
      instance._isActive = false;
      setTimeout(() => {
        const panel = instance.dropdownPanel?.panel;
        if (!instance._isActive && (!panel || !panel.contains(document.activeElement))) {
          instance.hide();
        }
      }, 200);
    });

    // Handle paste with separator
    EventSystemManager.addHandler(input, 'paste', (e) => {
      setTimeout(() => {
        const value = input.value;
        if (value.includes(config.separator)) {
          const values = value.split(config.separator).map(v => v.trim()).filter(v => v);
          values.forEach(v => this.addTag(instance, v, v));
          input.value = '';
        }
      }, 0);
    });

    return super.setupEventListeners?.(instance) || {};
  }

  static addTag(instance, key, value) {
    const {config, tags, tagElements, tagsContainer, inputLi, hiddenInputsContainer, originalName} = instance;

    // Check max tags
    if (config.maxTags && tags.length >= config.maxTags) {
      console.warn(Now.translate(config.validationMessages.maxTags));
      return false;
    }

    // Check duplicates
    if (!config.duplicates && tags.some(tag => tag.key === key)) {
      console.warn(Now.translate(config.validationMessages.duplicate));
      return false;
    }

    // Check readonly/disabled
    if (instance.input.readOnly || instance.input.disabled) {
      return false;
    }

    // Create tag element
    const li = document.createElement('li');
    li.className = 'tag-item';
    li.dataset.key = key;

    const span = document.createElement('span');
    span.className = 'tag-text';
    span.textContent = value;
    li.appendChild(span);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-remove';
    button.innerHTML = '×';
    button.setAttribute('aria-label', `Remove ${value}`);
    li.appendChild(button);

    // Create hidden input in hiddenInputsContainer
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = `${originalName}[]`;
    hidden.value = key;
    hidden.dataset.tagKey = key;
    hiddenInputsContainer.appendChild(hidden);

    // Add tag to container before input
    tagsContainer.insertBefore(li, inputLi);

    // Store references
    tags.push({key, value});
    tagElements.set(key, li);

    // Add remove handler
    EventSystemManager.addHandler(button, 'click', (e) => {
      e.stopPropagation();
      this.removeTag(instance, key);
    });

    // Dispatch change event
    instance.input.dispatchEvent(new Event('change', {bubbles: true}));

    return true;
  }

  static removeTag(instance, key) {
    const {tags, tagElements, hiddenInputsContainer, input} = instance;

    // Check readonly/disabled
    if (input.readOnly || input.disabled) {
      return false;
    }

    const index = tags.findIndex(tag => tag.key === key);
    if (index === -1) return false;

    // Remove tag element
    const li = tagElements.get(key);
    if (li && li.parentNode) {
      li.parentNode.removeChild(li);
    }

    // Remove hidden input
    const hidden = hiddenInputsContainer.querySelector(`[data-tag-key="${key}"]`);
    if (hidden) {
      hidden.remove();
    }

    tags.splice(index, 1);
    tagElements.delete(key);

    // Dispatch change event
    input.dispatchEvent(new Event('change', {bubbles: true}));

    return true;
  }

  static clearTags(instance) {
    const {tags} = instance;
    const keys = tags.map(tag => tag.key);
    keys.forEach(key => this.removeTag(instance, key));
  }

  static getTags(instance) {
    return instance.tags.map(tag => ({...tag}));
  }

  static setTags(instance, tags) {
    this.clearTags(instance);
    if (Array.isArray(tags)) {
      tags.forEach(tag => {
        if (typeof tag === 'string') {
          this.addTag(instance, tag, tag);
        } else if (tag.key && tag.value) {
          this.addTag(instance, tag.key, tag.value);
        }
      });
    }
  }

  static updateOptions(instance, options) {
    const {config} = instance;

    // Update autocomplete source
    if (config.autocomplete) {
      config.autocomplete.source = options;
      config.autocomplete.enabled = true;

      // If autocomplete not setup yet, set it up
      if (!instance.dropdownPanel) {
        this.setupAutocomplete(instance);
      }
    }
  }

  /**
   * Populate tags input from provided options object
   * @param {HTMLElement} element - Input element
   * @param {Object} optionsData - Options data object
   * @param {String} optionsKey - Key to extract from optionsData
   */
  static populateFromOptions(element, optionsData, optionsKey) {
    if (!element || !optionsData || !optionsKey) return;

    const options = optionsData[optionsKey];

    if (!options || !Array.isArray(options)) return;

    // Get instance
    let instance = ElementManager?.getInstanceByElement(element);

    // If not enhanced yet, try to enhance it
    if (!instance && window.ElementManager) {
      instance = ElementManager.enhance(element);
    }

    if (!instance) {
      console.warn('[TagsElementFactory] Element not enhanced yet');
      return;
    }

    // Update autocomplete options
    this.updateOptions(instance, options);
  }

  /**
   * Populate all tags inputs with data-options-key attribute
   * @param {HTMLElement} container - Container element
   * @param {Object} optionsData - Options data object
   */
  static populateFromOptionsInContainer(container, optionsData) {
    if (!container || !optionsData) return;

    const inputsWithOptionsKey = container.querySelectorAll('input[data-options-key][data-element="tags"]');

    inputsWithOptionsKey.forEach(input => {
      const optionsKey = input.dataset.optionsKey;
      this.populateFromOptions(input, optionsData, optionsKey);
    });
  }

  static cleanup(instance) {
    if (!instance) return;

    // Hide dropdown if open
    if (instance.dropdownPanel?.isOpen() && instance.dropdownPanel.currentTarget === instance.input) {
      instance.dropdownPanel.hide();
    }

    // Remove wrapper and restore original input
    if (instance.wrapper && instance.wrapper.parentNode) {
      instance.wrapper.parentNode.removeChild(instance.wrapper);
    }

    if (instance.originalInput) {
      instance.originalInput.style.display = '';
      instance.originalInput.removeAttribute('aria-hidden');
    }

    super.cleanup?.(instance);
  }
}

// Register with ElementManager
ElementManager.registerElement('tags', TagsElementFactory);

// Expose globally
window.TagsElementFactory = TagsElementFactory;