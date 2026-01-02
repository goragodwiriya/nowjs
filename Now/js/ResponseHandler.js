/**
 * ResponseHandler - Centralized API Response Handler
 *
 * Handles API responses with standardized actions that can be controlled by the server.
 * Reduces the need for repetitive JavaScript code by allowing the API to send commands.
 *
 * @example API Response Format:
 * {
 *   "success": true,
 *   "message": "Operation completed",
 *   "data": {
 *     "data": {...}
 *     "actions": [
 *       {"type": "notification", "level": "success", "message": "Saved!"},
 *       {"type": "redirect", "url": "/dashboard", "delay": 1000},
 *       {"type": "modal", "action": "close"}
 *     ],
 *     "options": {
 *       "provinces": {...},
 *       "statuses": {...}
 *     }
 *   }
 * }
 */

const ResponseHandler = {
  config: {
    defaultRedirectDelay: 1000,
    defaultNotificationDuration: 5000,
    allowEval: false, // Security: disabled by default
    autoHandleFormResponses: true
  },

  state: {
    initialized: false,
    actionHandlers: new Map()
  },

  /**
   * Initialize ResponseHandler
   */
  init(options = {}) {
    if (this.state.initialized) return this;

    this.config = {...this.config, ...options};

    // Register standard action handlers
    this.registerStandardHandlers();

    this.state.initialized = true;

    return this;
  },

  /**
   * Register all standard action handlers
   */
  registerStandardHandlers() {
    // Notification handler
    this.registerHandler('notification', (action) => {
      const level = action.level || 'success'; // success, info, warning, error
      const message = action.message || '';
      const duration = action.duration || this.config.defaultNotificationDuration;

      if (window.NotificationManager) {
        NotificationManager[level](message, {duration});
      }
    });

    // Alert handler
    this.registerHandler('alert', (action) => {
      const message = action.message || action.text || '';
      if (message) alert(message);
    });

    // Confirm handler
    this.registerHandler('confirm', async (action) => {
      const message = action.message || action.text || '';
      const onConfirm = action.onConfirm || action.callback;

      const confirmed = await DialogManager.confirm(Now.translate(message));
      if (confirmed && onConfirm) {
        if (typeof onConfirm === 'string') {
          this.executeCallback(onConfirm);
        } else if (typeof onConfirm === 'function') {
          onConfirm();
        }
      }
    });

    // Modal handler with template support
    this.registerHandler('modal', async (action, context) => {
      const modalAction = action.action || 'show';

      if (modalAction === 'close' || modalAction === 'hide') {
        if (window.modal && typeof window.modal.hide === 'function') {
          window.modal.hide();
        }
        return;
      }

      if (modalAction === 'show' || modalAction === 'open') {
        await this.handleModalShow(action, context);
      }
    });

    // Redirect handler
    this.registerHandler('redirect', (action, context) => {
      const url = action.url || action.location || action.to;
      const delay = action.delay !== undefined ? action.delay : this.config.defaultRedirectDelay;
      const target = action.target || '_self';
      const params = action.params || {};

      if (!url) return;

      const performRedirect = () => {
        if (url === 'reload') {
          if (context && typeof context.reload === 'function') {
            context.reload();
          } else {
            window.location.reload();
          }
        } else if (url === 'refresh') {
          window.location.reload();
        } else if (url === 'back') {
          window.history.back();
        } else if (target !== '_self') {
          window.open(url, target);
        } else if (window.RouterManager?.state?.initialized) {
          try {
            RouterManager.navigate(url, params);
          } catch (e) {
            window.location.href = url;
          }
        } else {
          window.location.href = url;
        }
      };

      if (delay > 0) {
        setTimeout(performRedirect, delay);
      } else {
        performRedirect();
      }
    });

    // Update element content
    this.registerHandler('update', (action) => {
      const target = action.target || action.selector || action.element;
      const content = action.content || action.html || action.value || '';
      const method = action.method || 'html'; // html, text, value, append, prepend

      if (!target) return;

      const elements = typeof target === 'string'
        ? document.querySelectorAll(target)
        : [target];

      elements.forEach(el => {
        if (!el) return;

        switch (method) {
          case 'html':
            el.innerHTML = content;
            break;
          case 'text':
            el.textContent = content;
            break;
          case 'value':
            if ('value' in el) el.value = content;
            break;
          case 'append':
            el.insertAdjacentHTML('beforeend', content);
            break;
          case 'prepend':
            el.insertAdjacentHTML('afterbegin', content);
            break;
          case 'attr':
            // Set single attribute on element
            const attrName = action.attr || action.attribute;
            if (attrName) {
              el.setAttribute(attrName, content);
            }
            break;
          case 'attrs':
            // Set multiple attributes on element
            const attrs = action.attrs || action.attributes || {};
            Object.entries(attrs).forEach(([name, value]) => {
              // Handle special properties
              if (name === 'checked' || name === 'disabled' || name === 'selected') {
                el[name] = !!value;
              } else if (name === 'value') {
                el.value = value;
              } else if (name === 'class' || name === 'className') {
                el.className = value;
              } else if (name === 'text' || name === 'textContent') {
                el.textContent = value;
              } else if (name === 'html' || name === 'innerHTML') {
                el.innerHTML = value;
              } else {
                el.setAttribute(name, value);
              }
            });
            break;
        }

        // Execute scripts if present
        if (method === 'html' || method === 'append' || method === 'prepend') {
          const scripts = el.querySelectorAll('script');
          scripts.forEach(script => {
            try {
              const fn = new Function(script.textContent);
              fn();
            } catch (e) {
              console.error('Error executing script:', e);
            }
          });
        }
      });
    });

    // Render template with TemplateManager
    this.registerHandler('render', async (action, context) => {
      const target = action.target || action.selector || action.element;
      const template = action.template || action.templateUrl;
      const method = action.method || 'html'; // html, append, prepend

      if (!target || !template) {
        console.warn('ResponseHandler: render action requires target and template');
        return;
      }

      if (!window.TemplateManager) {
        console.error('ResponseHandler: TemplateManager is not available');
        return;
      }

      try {
        // Load template from server
        const templateContent = await window.TemplateManager.loadFromServer(template);

        // Create container for rendering
        const container = document.createElement('div');
        container.innerHTML = templateContent;

        // Prepare data for template
        // Priority: action.data > context.data > empty object
        let templateData = {};

        if (action.data) {
          templateData = action.data;
        } else if (context.data) {
          // Pass the full response context to template
          templateData = context.data;
        }

        // Create context for template
        const templateContext = {
          template: templateContent,
          state: templateData,
          reactive: false,
          debug: this.config.debug || false
        };

        // Process template with data
        window.TemplateManager.processTemplate(container, templateContext);

        // Get target element(s)
        const elements = typeof target === 'string'
          ? document.querySelectorAll(target)
          : [target];

        // Update each target element
        elements.forEach(el => {
          if (!el) return;

          switch (method) {
            case 'html':
              el.innerHTML = container.innerHTML;
              break;
            case 'append':
              el.insertAdjacentHTML('beforeend', container.innerHTML);
              break;
            case 'prepend':
              el.insertAdjacentHTML('afterbegin', container.innerHTML);
              break;
          }
        });

      } catch (error) {
        console.error('ResponseHandler: Error rendering template', error);

        if (window.ErrorManager) {
          window.ErrorManager.handle(error, {
            context: 'ResponseHandler.render',
            data: {action}
          });
        }
      }
    });

    // Remove element
    this.registerHandler('remove', (action) => {
      const target = action.target || action.selector || action.element;
      const animate = action.animate !== false;

      if (!target) return;

      const elements = typeof target === 'string'
        ? document.querySelectorAll(target)
        : [target];

      elements.forEach(el => {
        if (!el) return;

        if (animate && window.$G) {
          $G(el).fadeOut(() => el.remove());
        } else {
          el.remove();
        }
      });
    });

    // Add/Remove/Toggle CSS class
    this.registerHandler('class', (action) => {
      const target = action.target || action.selector || action.element;
      const className = action.class || action.className || '';
      const method = action.method || 'add'; // add, remove, toggle

      if (!target || !className) return;

      const elements = typeof target === 'string'
        ? document.querySelectorAll(target)
        : [target];

      elements.forEach(el => {
        if (!el) return;

        switch (method) {
          case 'add':
            el.classList.add(...className.split(' '));
            break;
          case 'remove':
            el.classList.remove(...className.split(' '));
            break;
          case 'toggle':
            className.split(' ').forEach(cls => el.classList.toggle(cls));
            break;
        }
      });
    });

    // Set element attribute
    this.registerHandler('attribute', (action) => {
      const target = action.target || action.selector || action.element;
      const name = action.name || action.attribute;
      const value = action.value;

      if (!target || !name) return;

      const elements = typeof target === 'string'
        ? document.querySelectorAll(target)
        : [target];

      elements.forEach(el => {
        if (!el) return;

        if (value === null || value === undefined) {
          el.removeAttribute(name);
        } else {
          el.setAttribute(name, value);
        }
      });
    });

    // Trigger event
    this.registerHandler('event', (action) => {
      const eventName = action.event || action.name;
      const data = action.data || {};
      const target = action.target || document;

      if (!eventName) return;

      const targetEl = typeof target === 'string'
        ? document.querySelector(target)
        : target;

      if (!targetEl) return;

      const event = new CustomEvent(eventName, {
        detail: data,
        bubbles: action.bubbles !== false,
        cancelable: action.cancelable !== false
      });

      targetEl.dispatchEvent(event);
    });

    // Execute callback function
    this.registerHandler('callback', (action) => {
      const fn = action.function || action.callback || action.fn;
      const args = action.args || action.arguments || [];

      this.executeCallback(fn, args);
    });

    // Eval code (disabled by default for security)
    this.registerHandler('eval', (action) => {
      if (!this.config.allowEval) {
        console.warn('ResponseHandler: eval is disabled for security. Set config.allowEval = true to enable.');
        return;
      }

      const code = action.code || action.script;
      if (!code) return;

      try {
        const fn = new Function(code);
        fn();
      } catch (e) {
        console.error('ResponseHandler: eval error', e);
      }
    });

    // Download file
    this.registerHandler('download', (action) => {
      const url = action.url || action.href;
      const filename = action.filename || action.name;

      if (!url) return;

      const a = document.createElement('a');
      a.href = url;
      if (filename) a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 100);
    });

    // Copy to clipboard
    this.registerHandler('clipboard', async (action) => {
      const text = action.text || action.content || action.value || '';

      if (!text) {
        console.warn('[ResponseHandler] No text provided for clipboard action');
        return;
      }

      try {
        // Use Utils.dom.copyToClipboard if available
        if (window.Utils?.dom?.copyToClipboard) {
          const success = await Utils.dom.copyToClipboard(text);

          if (success) {
            if (action.notify !== false && window.NotificationManager) {
              NotificationManager.success(action.message || 'Copied to clipboard');
            }
          } else {
            throw new Error('Failed to copy to clipboard');
          }
        } else {
          // Fallback to direct Clipboard API
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            if (action.notify !== false && window.NotificationManager) {
              NotificationManager.success(action.message || 'Copied to clipboard');
            }
          } else {
            console.error('[ResponseHandler] No clipboard method available');
            if (window.NotificationManager) {
              NotificationManager.error('Clipboard not supported in this browser');
            }
          }
        }
      } catch (error) {
        console.error('[ResponseHandler] Failed to copy to clipboard:', error);
        if (action.notify !== false && window.NotificationManager) {
          NotificationManager.error(action.errorMessage || 'Failed to copy to clipboard');
        }
      }
    });

    // Scroll to element
    this.registerHandler('scroll', (action) => {
      const target = action.target || action.selector || action.element;
      const behavior = action.behavior || 'smooth';
      const block = action.block || 'center';

      if (!target) return;

      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;

      if (element && element.scrollIntoView) {
        element.scrollIntoView({behavior, block});
      }
    });

    // Focus element
    this.registerHandler('focus', (action) => {
      const target = action.target || action.selector || action.element;

      if (!target) return;

      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;

      if (element && element.focus) {
        element.focus();
        if (action.select && element.select) {
          element.select();
        }
      }
    });

    // Form errors handler - highlight fields and optionally show notification
    this.registerHandler('formErrors', (action, context) => {
      const errors = action.errors || {};
      const form = context.form || null;
      const showNotification = action.notification !== false;
      const focusFirst = action.focusFirst !== false;

      if (!window.FormError) {
        console.warn('ResponseHandler: FormError is not available');
        return;
      }

      const errorMessages = [];
      let firstField = null;

      Object.entries(errors).forEach(([field, messages]) => {
        const message = Array.isArray(messages) ? messages[0] : messages;

        // Highlight the field
        FormError.showFieldError(field, message, form);

        // Collect error messages
        errorMessages.push(message);

        // Track first field for focus
        if (!firstField) {
          firstField = document.getElementById(field) || document.querySelector(`[name="${field}"]`);
        }
      });

      // Show combined notification if enabled
      if (showNotification && window.NotificationManager && errorMessages.length > 0) {
        const level = action.level || 'error';
        const combinedMessage = errorMessages.length === 1
          ? errorMessages[0]
          : errorMessages.map(m => `• ${m}`).join('\n');
        NotificationManager[level](combinedMessage);
      }

      // Focus first error field if enabled
      if (focusFirst && firstField && firstField.focus) {
        firstField.focus();
        if (firstField.select) {
          firstField.select();
        }
      }
    });

    // Reload/refresh specific component
    this.registerHandler('reload', async (action, context) => {
      const target = action.target || action.component;
      if (context && typeof context.reload === 'function') {
        await context.reload();
        return;
      } else if (!target) {
        window.location.reload();
        return;
      }

      // Emit event for component to reload itself
      this.executeAction({
        type: 'event',
        event: 'component:reload',
        target: target,
        data: action.data || {}
      });
    });
  },

  /**
   * Register a custom action handler
   */
  registerHandler(type, handler) {
    if (typeof handler !== 'function') {
      console.error('ResponseHandler: handler must be a function');
      return;
    }

    this.state.actionHandlers.set(type, handler);
  },

  /**
   * Process API response
   */
  async process(response, context = {}) {
    if (!response) return;

    // Ensure context.data is populated if not already present
    if (!context.data) {
      context.data = response;
    }

    if (response.actions) {
      // Handle actions array
      if (Array.isArray(response.actions)) {
        for (const action of response.actions) {
          await this.executeAction(action, context);
        }
      } else if (response.actions.type) {
        // Single action object
        await this.executeAction(response.actions, response);
      }
    }

    return response;
  },

  /**
   * Execute a single action
   */
  async executeAction(action, context = {}) {
    if (!action || !action.type) return;

    const handler = this.state.actionHandlers.get(action.type);

    if (!handler) {
      console.warn(`ResponseHandler: No handler registered for action type "${action.type}"`);
      return;
    }

    try {
      // Check condition if specified
      if (action.condition !== undefined) {
        const conditionMet = typeof action.condition === 'function'
          ? action.condition(context)
          : action.condition;

        if (!conditionMet) return;
      }

      await handler(action, context);
    } catch (error) {
      console.error(`ResponseHandler: Error executing action "${action.type}"`, error);

      if (window.ErrorManager) {
        ErrorManager.handle(error, {
          context: 'ResponseHandler.executeAction',
          data: {action, context}
        });
      }
    }
  },

  /**
   * Execute callback function by name or reference
   */
  executeCallback(fn, args = []) {
    if (!fn) return;

    try {
      if (typeof fn === 'function') {
        fn(...args);
      } else if (typeof fn === 'string') {
        // Try to resolve function from window scope
        const parts = fn.split('.');
        let func = window;

        for (const part of parts) {
          func = func[part];
          if (!func) break;
        }

        if (typeof func === 'function') {
          func(...args);
        } else {
          console.warn(`ResponseHandler: Function "${fn}" not found`);
        }
      }
    } catch (error) {
      console.error('ResponseHandler: Error executing callback', error);
    }
  },

  /**
   * Handle modal show with template/HTML support
   * Priority: API force > API suggest > Frontend default
   * @private
   */
  async handleModalShow(action, context) {
    try {
      let modalConfig = {};

      // Priority 1: Check if frontend defined modal config
      if (context.modalConfig && !action.force) {
        modalConfig = {...context.modalConfig};
      }

      // Priority 2: API can suggest or override
      if (action.template) {
        if (action.force) {
          // Force override frontend config
          modalConfig.template = action.template;
          modalConfig.title = action.title || modalConfig.title;
          modalConfig.className = action.className || modalConfig.className;
        } else if (!modalConfig.template) {
          // Only use API config if frontend didn't specify
          modalConfig.template = action.template;
          modalConfig.title = action.title;
          modalConfig.className = action.className;
        }
      }

      // Priority 3: Direct HTML (highest priority for content)
      if (action.html) {
        return await this.showModal(action.html, {
          title: action.title || modalConfig.title || '',
          className: action.className || modalConfig.className || '',
          width: action.width || modalConfig.width,
          maxWidth: action.maxWidth || modalConfig.maxWidth,
          buttons: action.button || action.buttons || modalConfig.buttons,
          onShown: action.onShown || modalConfig.onShown,
          onHide: action.onHide || modalConfig.onHide
        });
      }

      // Load template
      let content = '';
      if (modalConfig.template) {
        content = await this.loadModalTemplate({
          template: modalConfig.template,
          templateUrl: action.templateUrl
        }, context);
      } else if (action.templateUrl) {
        content = await this.loadTemplateFromUrl(action.templateUrl);
      } else if (action.content) {
        content = action.content;
      } else {
        throw new Error('No template, templateUrl, HTML, or content provided for modal');
      }

      // Extract data and options
      const modalData = this.extractModalData(action, context);
      const modalOptions = this.extractModalOptions(action, context);

      // Register state and render
      if (modalData && Object.keys(modalData).length > 0) {
        await this.registerModalState(modalData, modalOptions);
      }

      const renderedContent = await this.renderModalContent(
        content,
        modalData,
        modalOptions
      );

      // Show modal
      await this.showModal(renderedContent, {
        title: modalConfig.title || action.title || '',
        className: modalConfig.className || action.className || action.class || '',
        width: modalConfig.width || action.width,
        maxWidth: modalConfig.maxWidth || action.maxWidth,
        height: modalConfig.height || action.height,
        maxHeight: modalConfig.maxHeight || action.maxHeight,
        closeButton: modalConfig.closeButton !== false && action.closeButton !== false,
        backdrop: modalConfig.backdrop !== false && action.backdrop !== false,
        keyboard: modalConfig.keyboard !== false && action.keyboard !== false,
        buttons: action.button || action.buttons || modalConfig.buttons,
        data: modalData,
        options: modalOptions,
        onShown: action.onShown || modalConfig.onShown,
        onHide: action.onHide || modalConfig.onHide
      });

      // Emit event
      this.emit('modal:shown', {
        template: modalConfig.template || action.template,
        data: modalData,
        options: modalOptions
      });

    } catch (error) {
      console.error('ResponseHandler: Error showing modal', error);

      if (window.ErrorManager) {
        ErrorManager.handle(error, {
          context: 'ResponseHandler.handleModalShow',
          data: {action, context}
        });
      }

      // Show error modal
      this.showErrorModal(error.message);
    }
  },

  /**
   * Load template from TemplateManager
   * @private
   */
  async loadModalTemplate(action, context) {
    const templateName = action.template;

    if (!window.TemplateManager) {
      throw new Error('TemplateManager is not available');
    }

    // Load template content
    const templateContent = await TemplateManager.loadFromServer(templateName);

    return templateContent;
  },

  /**
   * Load template from URL
   * @private
   */
  async loadTemplateFromUrl(url) {
    if (!window.TemplateManager) {
      throw new Error('TemplateManager is not available');
    }

    return await TemplateManager.loadFromServer(url);
  },

  /**
   * Extract modal data from action and context
   * @private
   */
  extractModalData(action, context) {
    let data = context.data || action.data || {};

    // Helper to extract value by key path
    const getValue = (source, keyPath) => {
      const keys = keyPath.split('.');
      let value = source;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return undefined;
        }
      }
      return value;
    };

    // If dataKey is specified, get data from context/response
    if (action.dataKey) {
      let extractedValue = undefined;

      // 1. Try context.data
      if (context.data) {
        extractedValue = getValue(context.data, action.dataKey);
      }

      // 2. Try context.instance.state (Fallback as per user request)
      if (extractedValue === undefined && context.instance && context.instance.state) {
        extractedValue = getValue(context.instance.state, action.dataKey);

        // Special case: if dataKey is 'data' and we didn't find it in state,
        // maybe the user means state.data (form data)
        if (extractedValue === undefined && action.dataKey === 'data' && context.instance.state.data) {
          extractedValue = context.instance.state.data;
        }
      }

      if (extractedValue !== undefined) {
        data = {...data, ...extractedValue};
      }
    } else if (!action.dataKey && context.data && !action.data) {
      // Auto-extract from context.data if no dataKey and no explicit data
      data = context.data.data || context.data;
    }

    return data;
  },

  /**
   * Extract modal options (select options, etc.)
   * @private
   */
  extractModalOptions(action, context) {
    let options = {};

    if (context.options) {
      // Top-level options
      options = {...context.options};
    } else if (action.optionsKey && context) {
      // Custom optionsKey (Advanced usage)
      const keys = action.optionsKey.split('.');
      let value = context;

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          value = null;
          break;
        }
      }

      if (value !== null) {
        options = {...options, ...value};
      }
    }

    return options;
  },

  /**
   * Show modal with content
   * @private
   */
  async showModal(content, options = {}) {
    // Create or reuse modal instance
    if (!window.modal || !(window.modal instanceof Modal)) {
      window.modal = new Modal({
        closeButton: true,
        animation: true,
        backdrop: true,
        keyboard: true,
        ...options
      });
    }

    // Update modal options
    if (options.title) {
      window.modal.setTitle(options.title);
    }

    if (options.className) {
      window.modal.modal.className = `modal ${options.className}`.trim();
    }

    // Register state module for modal data
    if (options.data && Object.keys(options.data).length > 0) {
      await this.registerModalState(options.data, options.options);
    }

    // Set content - check if already rendered (Node/Fragment) or needs rendering
    if (content instanceof Node || content instanceof DocumentFragment) {
      // Already rendered (from handleModalShow), use directly
      window.modal.setContent(content);
    } else if (window.TemplateManager && options.data) {
      // String template with data - render it
      const container = await this.renderModalContent(content, options.data, options.options);
      window.modal.setContent(container);
    } else {
      // Plain string without data - use as is
      window.modal.setContent(content);
    }

    // Show modal
    window.modal.show();

    // Call onShown callback
    if (typeof options.onShown === 'function') {
      setTimeout(() => options.onShown.call(window.modal), 200);
    }
  },

  /**
   * Register modal state in StateManager
   * @private
   */
  async registerModalState(data, options = {}) {
    // Store data and options globally for FormManager to access in modal forms
    if (data && Object.keys(data).length > 0) {
      window._currentModalData = data;
    }

    if (options && Object.keys(options).length > 0) {
      window._currentModalOptions = options;
    }

    if (!window.StateManager) return;

    const modalState = {
      state: {
        formData: data,
        options: options,
        loading: false,
        errors: {}
      },
      getters: {
        formData: (state) => state.formData,
        options: (state) => state.options,
        isLoading: (state) => state.loading,
        hasErrors: (state) => Object.keys(state.errors).length > 0
      },
      mutations: {
        setFormData(state, data) {
          state.formData = {...state.formData, ...data};
        },
        setField(state, {field, value}) {
          state.formData[field] = value;
        },
        setLoading(state, loading) {
          state.loading = loading;
        },
        setError(state, {field, message}) {
          state.errors[field] = message;
        },
        clearErrors(state) {
          state.errors = {};
        }
      },
      actions: {
        async updateField({commit}, {field, value}) {
          commit('setField', {field, value});
        },
        async submitForm({state, commit}) {
          commit('setLoading', true);
          commit('clearErrors');

          // Form submission will be handled by form component
          return state.formData;
        }
      }
    };

    // Register or force-update module
    StateManager.registerModule('modal', modalState, {force: true});
  },

  /**
   * Render modal content with TemplateManager
   * @private
   */
  async renderModalContent(template, data, options = {}) {
    if (!window.TemplateManager) {
      return template;
    }

    // Create container for rendering
    const container = document.createElement('div');
    container.innerHTML = template;

    // Create context for template
    const context = {
      template: template,
      state: {
        ...data
      },
      reactive: true,
      debug: this.config.debug || false
    };

    // Process template with data
    TemplateManager.processTemplate(container, context);

    // Return DocumentFragment containing the processed nodes (without wrapper div)
    const fragment = document.createDocumentFragment();
    while (container.firstChild) {
      fragment.appendChild(container.firstChild);
    }
    return fragment;
  },

  /**
   * Show error modal
   * @private
   */
  showErrorModal(message) {
    const errorHtml = `
      <div class="error-modal">
        <div class="modal-body icon-warning">
          <div>
            <h3>Error</h3>
            <p>${message}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="window.modal?.hide()">Close</button>
        </div>
      </div>
    `;

    if (window.Modal) {
      if (!window.modal) {
        window.modal = new Modal({closeButton: true});
      }
      window.modal.setContent(errorHtml);
      window.modal.show();
    } else {
      alert('Error: ' + message);
    }
  },

  /**
   * Emit event
   */
  emit(eventName, data) {
    EventManager.emit(eventName, data);
  }
};

// Auto-initialize
if (typeof window !== 'undefined') {
  window.ResponseHandler = ResponseHandler;

  // Register with Now framework if available
  if (window.Now?.registerManager) {
    Now.registerManager('response', ResponseHandler);
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ResponseHandler.init();
    });
  } else {
    ResponseHandler.init();
  }
}

// Expose globally
window.ResponseHandler = ResponseHandler;
