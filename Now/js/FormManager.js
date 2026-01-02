const FormManager = {
  config: {
    ajaxSubmit: true,
    autoValidate: true,
    resetAfterSubmit: false,
    autoEnhance: true,
    autoInitialize: true,
    autoGenerateFormId: true,
    submitButtonSelector: '[type="submit"]',
    resetButtonSelector: '[type="reset"]',
    fieldSelector: 'input, select, textarea, [data-element]',
    preventDoubleSubmit: true,
    doubleSubmitTimeout: 2000,
    showLoadingOnSubmit: true,
    autoClearErrors: true,
    autoClearErrorsDelay: 5000,
    validateOnInput: true,
    validateOnBlur: true,
    validateOnlyDirty: true,
    validatorRegistry: new Map(),
    formatterRegistry: new Map(),
    loadingClass: 'submitting',
    validClass: 'valid',
    invalidClass: 'invalid',
    dirtyClass: 'modified',
    successMessage: 'Form submitted successfully',
    errorMessage: 'There was an error submitting the form',
    actionAttribute: 'data-action',
    methodAttribute: 'data-method',
    redirectAttribute: 'data-redirect',
    showErrorsInline: true,
    showErrorsInNotification: true,
    uploadProgressTemplate: `
      <div class="upload-progress" style="display:none">
        <div class="progress">
          <div class="progress-bar" role="progressbar" style="width:0%"></div>
        </div>
        <div class="progress-text"></div>
      </div>
    `
  },

  // observer config defaults (can be overridden by options.observerConfig)
  observerConfig: {
    observerDelay: 40,
    observeRoot: null,
    autoStartObserver: true
  },

  state: {
    forms: new Map(),
    // element -> instance mapping (weak reference to avoid leaks)
    elementIndex: new WeakMap(),
    initialized: false,
    activeSubmit: null,
    validators: new Map()
  },

  async init(options = {}) {
    if (this.state.initialized) return this;

    this.config = {...this.config, ...options};
    if (options.observerConfig) this.observerConfig = {...this.observerConfig, ...options.observerConfig};

    if (window.SecurityManager && window.SecurityManager.state.initialized) {
      this.setupSecurityIntegration();
    }

    if (this.observerConfig.autoStartObserver) this.setupFormObserver();

    if (this.config.autoInitialize) {
      document.querySelectorAll('form[data-form]').forEach(form => {
        if (this.shouldEnhance(form)) this.initForm(form);
      });
    }

    this.registerStandardValidators();

    this.state.initialized = true;
    return this;
  },

  registerStandardValidators() {
    this.registerValidator('required', (value, element) => {
      if (element.type === 'checkbox' || element.type === 'radio') {
        return element.checked;
      }
      return value !== null && value !== undefined && value.toString().trim() !== '';
    }, 'Please fill in');

    this.registerValidator('email', (value) => {
      return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }, 'Please enter a valid email address');

    this.registerValidator('url', (value) => {
      return !value || /^(https?|ftp):\/\/[^\s\/$.?#].[^\s]*$/.test(value);
    }, 'Please enter a valid URL');

    this.registerValidator('number', (value) => {
      return !value || /^-?\d*\.?\d+$/.test(value);
    }, 'Please enter a valid number');

    this.registerValidator('integer', (value) => {
      return !value || /^-?\d+$/.test(value);
    }, 'Please enter a whole number');

    this.registerValidator('min', (value, element, param) => {
      return !value || parseFloat(value) >= parseFloat(param);
    }, 'Value must be at least {min}');

    this.registerValidator('max', (value, element, param) => {
      return !value || parseFloat(value) <= parseFloat(param);
    }, 'Value must be no more than {max}');

    this.registerValidator('minlength', (value, element, param) => {
      return !value || value.length >= parseInt(param);
    }, 'Please enter at least {minlength} characters');

    this.registerValidator('maxlength', (value, element, param) => {
      const maxLength = parseInt(param);
      return !value || isNaN(maxLength) || maxLength <= 0 || value.length <= maxLength;
    }, 'Please enter no more than {maxlength} characters');

    this.registerValidator('pattern', (value, element, param) => {
      return !value || new RegExp(param).test(value);
    }, 'Please match the requested format');

    this.registerValidator('match', (value, element, param) => {
      const target = document.getElementById(param) ||
        document.getElementsByName(param)[0] ||
        element.form.querySelector(`[name="${param}"]`);
      return !value || !target || value === target.value;
    }, 'Fields do not match');
  },

  registerValidator(name, fn, defaultMessage) {
    this.state.validators.set(name, {
      validate: fn,
      message: defaultMessage
    });
  },

  registerFormatter(name, fn) {
    this.config.formatterRegistry.set(name, fn);
  },

  async initForm(form) {
    if (!form) return null;

    // Require explicit opt-in: form must have data-form attribute
    if (!form.dataset || !form.dataset.form) return null;

    const formId = form.dataset.form;

    // Defensive: avoid double-initialization. Prefer element identity (WeakMap) lookup
    // to handle cases where templates are re-rendered and new DOM nodes replace
    // old ones. If an instance exists for this exact element, return it.
    try {
      const existingByElement = this.state.elementIndex.get(form);
      if (existingByElement) {
        return existingByElement;
      }

      // If there's an instance registered by id, ensure it's not stale. If the
      // mapped instance targets a different element or the element is no longer
      // connected, destroy it so we can re-init cleanly.
      const existingById = this.state.forms.get(formId);
      if (existingById) {
        // Check if existing element is still connected to DOM
        if (existingById.element && !existingById.element.isConnected) {
          // Old element disconnected - destroy stale instance
          try {
            this.destroyForm(existingById);
          } catch (e) {
            // swallow; we'll continue to init
          }
        } else if (existingById.element === form) {
          // Same element, already initialized
          return existingById;
        } else if (existingById.element && existingById.element.isConnected) {
          // Different element but old one still connected - this is unusual
          // Could be duplicate IDs in DOM (invalid) - destroy old instance
          try {
            this.destroyForm(existingById);
          } catch (e) {
            // swallow; we'll continue to init
          }
        }
      }
    } catch (e) {
      // Non-fatal - continue to init
    }

    try {
      const instance = {
        id: formId,
        element: form,
        elements: new Map(),
        state: {
          modified: false,
          valid: true,
          submitting: false,
          data: {},
          originalData: {},
          errors: {},
          submitCount: 0,
          lastSubmitTime: 0
        },
        resetTimeout: null
      };

      // Register in maps immediately to prevent double-initialization race condition
      this.state.forms.set(formId, instance);
      try {this.state.elementIndex.set(form, instance);} catch (e) {}

      const formConfig = this.extractFormConfig(form);
      instance.config = {...this.config, ...formConfig};

      if (form.dataset.autoFillIntendedUrl === 'true') {
        this.autoFillIntendedUrl(form);
      }

      // Restore persisted values for fields marked with data-persist
      try {
        this.restorePersistedValues && this.restorePersistedValues(instance);
      } catch (e) {}

      if (form.querySelector('input[type="file"]')) {
        form.enctype = 'multipart/form-data';
      }

      try {
        this.populateSelectsFromModalOptions(instance);
      } catch (e) {
        console.warn('FormManager: Failed to populate select options from modal:', e);
      }

      // Load form options BEFORE initFormElements so select elements have options
      try {
        await this.loadFormOptionsIfNeeded(instance);
      } catch (e) {
        console.warn('FormManager: Failed to load form options:', e);
      }

      // Load form data if data-load-api is specified
      // Errors (403, 401) are handled inside loadFormDataIfNeeded with redirects
      await this.loadFormDataIfNeeded(instance);


      // Initialize form elements AFTER options are loaded
      this.initFormElements(instance);

      // Initialize cascading selects if CascadingSelectManager is available
      if (window.CascadingSelectManager?.initInContainer) {
        CascadingSelectManager.initInContainer(form);
      }

      // Restore remembered username/email for login forms (localStorage only)
      try {
        this.restoreRememberedCredentials && this.restoreRememberedCredentials(instance);
      } catch (e) {}

      // Populate fields from URL query parameters (data-url-param attribute)
      try {
        this.populateFromUrlParams(instance);
      } catch (e) {
        console.warn('FormManager: Failed to populate from URL params:', e);
      }

      this.setupFormEvents(instance);

      instance.state.originalData = this.getFormData(instance, true);

      EventManager.emit('form:init', {formId, instance});

      return instance;

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'FormManager.initForm',
        type: 'error:form',
        data: {formId}
      });
      return null;
    }
  },

  /**
   * Load form data from API if data-load-api is specified
   * Supports URL query parameters if data-load-query-params="true"
   * @param {Object} instance - Form instance
   * @async
   */
  async loadFormDataIfNeeded(instance) {
    const {element} = instance;
    const loadApi = element.dataset.loadApi;

    if (!loadApi) return;

    try {
      let url = loadApi;
      let params = {};

      // Extract query params from URL if data-load-query-params="true"
      if (element.dataset.loadQueryParams === 'true') {
        const urlParams = new URLSearchParams(window.location.search);
        const paramObj = Object.fromEntries(urlParams);

        if (Object.keys(paramObj).length > 0) {
          params = paramObj;
        }
      }

      // Make API request
      let response;
      if (window.ApiService?.get) {
        response = await window.ApiService.get(url, params);
      } else if (window.simpleFetch?.get) {
        const queryStr = new URLSearchParams(params).toString();
        const fullUrl = queryStr ? `${url}?${queryStr}` : url;
        response = await window.simpleFetch.get(fullUrl);
      } else {
        console.warn('FormManager: ApiService or simpleFetch not available');
        return;
      }

      // Handle 403 Forbidden - redirect to 403 page
      if (response.status === 403) {
        console.warn('FormManager: Access forbidden (403) for form data API');

        // Use RouterManager if available (SPA mode)
        if (window.RouterManager?.navigate) {
          window.RouterManager.navigate('/403');
          return;
        }

        // Fallback to LocationManager
        if (window.LocationManager?.redirect) {
          window.LocationManager.redirect('/403');
          return;
        }

        // Last resort: direct navigation
        window.location.href = '/403';
        return;
      }

      // Handle 401 Unauthorized - let AuthErrorHandler handle it
      if (response.status === 401) {
        console.warn('FormManager: Unauthorized (401) for form data API');

        const error = new Error(response.statusText || 'Unauthorized');
        error.status = 401;
        error.response = response;

        await AuthErrorHandler.handleError(error, {
          currentPath: window.location.pathname
        });
        return;
      }


      // Extract options from standard format
      const data = response.data.data || response.data;
      instance.state.formOptions = data.options || null;

      // Check if API returned actions (e.g., redirect, notification)
      // This handles cases where data is not found or other error conditions
      if (data && data.actions && Array.isArray(data.actions)) {
        try {
          await ResponseHandler.process(data, {
            formId: instance.id,
            form: element,
            instance: instance,
            source: 'form-load-api'
          });
          // If actions were processed, stop further processing
          return response;
        } catch (error) {
          console.error('FormManager: Error processing load-api response actions', error);
        }
      }

      // Populate select options if available before setting form data
      if (instance.state.formOptions) {
        SelectElementFactory.populateFromOptionsInContainer(element, instance.state.formOptions);
        MultiSelectElementFactory.populateFromOptionsInContainer(element, instance.state.formOptions);
        TagsElementFactory.populateFromOptionsInContainer(element, instance.state.formOptions);
      }

      // Handle tags inputs with data-attr bindings BEFORE setFormData
      // This is needed because tags inputs need special handling for array values
      if (instance.state.formOptions && data) {
        const tagsInputs = element.querySelectorAll('input[type="text"][data-element="tags"][data-attr]');

        tagsInputs.forEach(input => {
          const attrValue = input.getAttribute('data-attr');
          const match = attrValue?.match(/value:([\w-]+)/);

          if (match && match[1]) {
            const fieldName = match[1];
            const value = data[fieldName];

            if (value !== undefined && value !== null && Array.isArray(value)) {
              const optionsKey = input.getAttribute('data-options-key');
              const options = instance.state.formOptions[optionsKey];

              // Get the ElementManager instance
              const tagsInstance = window.ElementManager?.getInstanceByElement(input);

              if (tagsInstance && typeof tagsInstance.setValue === 'function' && options && Array.isArray(options)) {
                // Map value IDs to their display text from options
                const tags = value.map(val => {
                  const option = options.find(opt =>
                    (typeof opt === 'object' ? opt.value : opt) == val
                  );
                  if (option) {
                    return typeof option === 'object'
                      ? {key: option.value, value: option.text}
                      : {key: option, value: option};
                  }
                  return {key: val, value: val};
                });

                tagsInstance.setValue(tags);
              }
            }
          }
        });
      }

      // Populate form fields with loaded data
      if (response.data) {
        this.setFormData(instance, data);
      }

      // Populate text input options if available after setting form data
      if (instance.state.formOptions) {
        TextElementFactory.populateFromOptionsInContainer(element, instance.state.formOptions);
      }

      return response;
    } catch (error) {
      // Handle 403 Forbidden - redirect to 403 page
      if (error.status === 403 || error.response?.status === 403) {
        console.warn('FormManager: Access forbidden (403) for form data API');

        // Use RouterManager if available (SPA mode)
        if (window.RouterManager?.navigate) {
          window.RouterManager.navigate('/403');
          return;
        }

        // Fallback to LocationManager
        if (window.LocationManager?.redirect) {
          window.LocationManager.redirect('/403');
          return;
        }

        // Last resort: direct navigation
        window.location.href = '/403';
        return;
      }

      // Handle 401 Unauthorized - let AuthErrorHandler handle it
      if (response.status === 401) {
        console.warn('FormManager: Unauthorized (401) for form data API');

        const error = new Error(response.statusText || 'Unauthorized');
        error.status = 401;
        error.response = response;

        await AuthErrorHandler.handleError(error, {
          currentPath: window.location.pathname
        });
        return;
      }

      console.error('FormManager: Error loading form data:', error);
      throw error;
    }
  },

  /**
   * Load form options from API if data-load-options-api is specified
   * Stores options in instance for later use
   * Standard format: {data: {data: {...}, options: {...}}}
   * @param {Object} instance - Form instance
   * @async
   */
  async loadFormOptionsIfNeeded(instance) {
    const {element} = instance;
    const loadOptionsApi = element.dataset.loadOptionsApi;

    if (!loadOptionsApi) return;

    try {
      // Wait for SecurityManager to be ready (CSRF token available)
      if (window.SecurityManager) {
        const maxWaitTime = 5000; // 5 seconds max
        const startTime = Date.now();

        while (!window.SecurityManager.state?.csrfToken && (Date.now() - startTime < maxWaitTime)) {
          // If SecurityManager is initializing, wait for it
          if (window.SecurityManager.state?.initialized === false) {
            await new Promise(resolve => setTimeout(resolve, 50));
          } else {
            // SecurityManager initialized but no token - try to refresh
            if (typeof window.SecurityManager.refreshCSRFToken === 'function') {
              try {
                await window.SecurityManager.refreshCSRFToken();
              } catch (e) {
                console.warn('FormManager: Failed to refresh CSRF token', e);
              }
            }
            break;
          }
        }
      }

      let response;
      if (window.ApiService?.get) {
        response = await window.ApiService.get(loadOptionsApi);
      } else if (window.simpleFetch?.get) {
        response = await window.simpleFetch.get(loadOptionsApi);
      } else {
        return;
      }

      // Extract options from standard format: response.data.data.options
      const responseData = response.data || response;
      const optionsData = responseData?.data?.options || null;

      if (!optionsData) {
        console.warn('FormManager: Invalid options format. Expected {data: {data: {...}, options: {...}}}');
        return;
      }

      // Store options in instance for use by options or datalist
      instance.state.formOptions = optionsData;

      // Populate options data into elements
      this.setFormOptions(element, instance.state.formOptions);
      return response;
    } catch (error) {
      console.error('FormManager: Error loading form options:', error);
      throw error;
    }
  },

  /**
   * Populate select elements with data-options-key from stored modal options
   * This is called after modal template is initialized with form data
   * @param {Object} instance - Form instance
   */
  populateSelectsFromModalOptions(instance) {
    const {element} = instance;

    // Get stored modal options from window scope (set by ResponseHandler)
    const storedOptions = window._currentModalOptions || element.dataset.modalOptions;
    const storedData = window._currentModalData || {};

    if (!storedOptions) return;

    const optionsData = typeof storedOptions === 'string' ? JSON.parse(storedOptions) : storedOptions;
    if (optionsData && typeof optionsData === 'object') {
      // Populate options data into elements
      this.setFormOptions(element, optionsData);

      // Set selected values from data if available
      if (storedData && typeof storedData === 'object') {
        // Find all select elements with data-options-key and data-attr
        const selects = element.querySelectorAll('select[data-options-key][data-attr]');
        selects.forEach(select => {
          const attrValue = select.getAttribute('data-attr');
          // Parse data-attr="value:provinceID" to get field name
          const match = attrValue?.match(/value:([\w-]+)/);
          if (match && match[1]) {
            const fieldName = match[1];
            let value = storedData[fieldName];

            if (value !== undefined && value !== null) {
              // Handle select multiple differently
              if (select.multiple) {
                // Convert to array if not already
                const values = Array.isArray(value) ? value : [value];
                // Convert to strings for comparison
                const valueStrings = values.map(v => String(v));

                // Set selected property on matching options
                Array.from(select.options).forEach(option => {
                  option.selected = valueStrings.includes(option.value);
                });
              } else {
                // Single select - use value property
                select.value = value;
              }
            }
          }
        });

        // Also handle text inputs with data-options-key (autocomplete)
        const textInputs = element.querySelectorAll('input[type="text"][data-options-key][data-attr]');
        textInputs.forEach(input => {
          const attrValue = input.getAttribute('data-attr');
          const match = attrValue?.match(/value:([\w-]+)/);
          if (match && match[1]) {
            const fieldName = match[1];
            const value = storedData[fieldName];
            if (value !== undefined && value !== null) {
              // Check if this is a tags input
              const isTagsInput = input.getAttribute('data-element') === 'tags';

              if (isTagsInput) {
                // For tags input, handle array values
                if (Array.isArray(value)) {
                  const optionsKey = input.getAttribute('data-options-key');
                  const options = optionsData[optionsKey];

                  // Get the ElementManager instance
                  const instance = window.ElementManager?.getInstanceByElement(input);

                  if (instance && typeof instance.setValue === 'function' && options && Array.isArray(options)) {
                    // Map value IDs to their display text from options
                    const tags = value.map(val => {
                      const option = options.find(opt =>
                        (typeof opt === 'object' ? opt.value : opt) == val
                      );
                      if (option) {
                        return typeof option === 'object'
                          ? {key: option.value, value: option.text}
                          : {key: option, value: option};
                      }
                      return {key: val, value: val};
                    });

                    instance.setValue(tags);
                  }
                }
              } else {
                // For text input with autocomplete, set the visible text
                // The hidden input will be set by TextElementFactory if needed
                const optionsKey = input.getAttribute('data-options-key');
                const options = optionsData[optionsKey];
                if (options && Array.isArray(options)) {
                  const selectedOption = options.find(opt =>
                    (typeof opt === 'object' ? opt.value : opt) == value
                  );
                  if (selectedOption) {
                    input.value = typeof selectedOption === 'object' ? selectedOption.text : selectedOption;

                    // Set hidden input if exists
                    const hiddenInput = element.querySelector(`input[type="hidden"][name="${input.name}"]`);
                    if (hiddenInput) {
                      hiddenInput.value = value;
                    }
                  }
                }
              }
            }
          }
        });
      }
    }
  },

  /**
   * Populate options data into elements
   *
   * @param {*} element
   * @param {*} optionsData
   */
  setFormOptions(element, optionsData) {
    SelectElementFactory.populateFromOptionsInContainer(element, optionsData);
    MultiSelectElementFactory.populateFromOptionsInContainer(element, optionsData);
    TextElementFactory.populateFromOptionsInContainer(element, optionsData);
  },

  /**
   * Populate form fields from URL query parameters
   * Uses setFormData() which handles data-attr="value:paramName" bindings
   * Same pattern as loading data from API
   *
   * @param {Object} instance - Form instance
   * @example
   * <input type="hidden" name="token" data-attr="value:token">
   * <input type="hidden" name="uid" data-attr="value:uid">
   *
   * URL: /reset-password?token=abc123&uid=1
   * Result: setFormData receives {token: 'abc123', uid: '1'}
   *         Fields with data-attr="value:token" get populated automatically
   */
  populateFromUrlParams(instance) {
    const {element} = instance;

    // Check if form wants URL params (data-load-url-params="true")
    if (element.dataset.loadUrlParams !== 'true') return;

    // Get URL search params from multiple sources (support SPA routing)
    const urlParams = new URLSearchParams(window.location.search);

    // Also check hash fragment for SPA hash-mode routing
    // e.g., /#/reset-password?token=abc becomes location.hash = "#/reset-password?token=abc"
    const hashPart = window.location.hash;
    const hashQueryIndex = hashPart.indexOf('?');
    if (hashQueryIndex !== -1) {
      const hashParams = new URLSearchParams(hashPart.substring(hashQueryIndex));
      // Merge hash params into urlParams (hash params take precedence)
      for (const [key, value] of hashParams.entries()) {
        urlParams.set(key, value);
      }
    }

    // Build data object from all URL params
    const data = Object.fromEntries(urlParams.entries());

    if (Object.keys(data).length === 0) {
      // No URL params found
      if (element.dataset.urlParamsRequired === 'true') {
        const errorMessage = Now.translate('Invalid or missing URL parameters');
        if (window.NotificationManager) {
          NotificationManager.error(errorMessage);
        }
        // Disable form submission
        const submitBtn = element.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
        }
      }
      return;
    }

    // Use setFormData to populate fields (handles data-attr bindings automatically)
    this.setFormData(instance, data);
    console.debug(`FormManager: Populated form from URL params:`, Object.keys(data));

    // Check for required params that are missing
    const requiredParams = element.dataset.urlParamsRequiredFields;
    if (requiredParams) {
      const required = requiredParams.split(',').map(p => p.trim());
      const missing = required.filter(p => !data[p]);

      if (missing.length > 0) {
        this.emitEvent('form:urlParamsMissing', {
          formId: instance.id,
          missingParams: missing
        });

        if (element.dataset.urlParamsRequired === 'true') {
          const errorMessage = Now.translate('Invalid or missing URL parameters');
          if (window.NotificationManager) {
            NotificationManager.error(errorMessage);
          }
          const submitBtn = element.querySelector('[type="submit"]');
          if (submitBtn) {
            submitBtn.disabled = true;
          }
        }
      }
    }
  },

  /**
   * Sets up the form observer to automatically initialize forms
   */
  setupSecurityIntegration() {
    document.addEventListener('security:error', (event) => {
      this.handleSecurityError(event.detail);
    });

    document.addEventListener('csrf:refreshed', (event) => {
      this.updateFormsWithNewCSRF(event.detail.token);
    });
  },

  /**
   * Handle security errors emitted by SecurityManager
   * @param {Object} detail
   */
  handleSecurityError(detail) {
    try {
      const info = detail || {};
      const message = info.message || info.error || 'A security error occurred';

      // Prefer centralized AuthManager.handleError when available
      const authManager = window.Now?.getManager ? Now.getManager('auth') : window.AuthManager;
      if (authManager && typeof authManager.handleError === 'function') {
        try {
          authManager.handleError('Security error', new Error(message), {detail: info});
        } catch (e) {
          // swallow errors from centralized handler to avoid cascading failures
          console.warn('FormManager: AuthManager.handleError threw an error', e);
        }
      } else if (window.ErrorManager && typeof ErrorManager.handle === 'function') {
        // Fallback to ErrorManager for logging if AuthManager isn't available
        try {
          ErrorManager.handle(new Error(message), {context: 'FormManager.handleSecurityError', data: info});
        } catch (e) {
          console.warn('FormManager: ErrorManager.handle threw an error', e);
        }
      } else {
        // Last-resort: show a user notification or console warning
        if (window.NotificationManager) {
          NotificationManager.error(message);
        } else {
          console.warn('FormManager security error:', message, info);
        }
      }

      // If this looks like an authentication/CSRF issue, clear form-related state
      if (info.status === 401 || info.code === 'unauthorized' || info.code === 'csrf_invalid') {
        // Clear any client-side tokens to avoid further failures
        try {localStorage.removeItem('auth_token');} catch (e) {}
        try {localStorage.removeItem(this.config.token?.storageKey || 'auth_user');} catch (e) {}

        // Optionally redirect to login if AuthManager is available
        if (authManager && typeof authManager.redirectTo === 'function') {
          authManager.redirectTo(authManager.config?.redirects?.unauthorized || '/login');
        }
      }
    } catch (err) {
      // If our new delegation fails, ensure we still surface something useful
      try {
        console.error('Error in FormManager.handleSecurityError', err);
      } catch (ee) {
        // swallow
      }
    }
  },

  /**
   * Handles security errors by showing a notification or redirecting
   * @param {Object} error - The security error object
   * @return {void}
   */
  handleRateLimitError(instance, rateLimitResult) {
    const message = Now.translate(`Too many requests. Please try again in {retryAfter} seconds.`, {retryAfter: rateLimitResult.retryAfter});

    FormError.showGeneralError(message, instance.element);

    this.emitEvent('form:rateLimit', {
      formId: instance.id,
      rateLimitResult
    });
  },

  /**
   * Updates all forms with the new CSRF token
   * @param {string} token - The new CSRF token to set
   * @return {void}
   */
  updateFormsWithNewCSRF(token) {
    this.state.forms.forEach((instance) => {
      const csrfInput = instance.element.querySelector('input[name="_token"]');
      if (csrfInput) {
        csrfInput.value = token;
      }
    });
  },

  /**
   * Handles security errors by showing a notification or redirecting
   * @param {Object} error - The security error object
   * @return {void}
   */
  extractFormConfig(form) {
    const config = {};
    const dataAttrs = form.dataset;

    if (dataAttrs.csrf !== undefined) {
      config.csrf = dataAttrs.csrf === 'true';
    }
    if (dataAttrs.rateLimit !== undefined) {
      config.rateLimit = dataAttrs.rateLimit === 'true';
    }
    if (dataAttrs.validation !== undefined) {
      config.validation = dataAttrs.validation === 'true';
    }

    if (dataAttrs.rateLimitEndpoint) {
      config.rateLimitEndpoint = dataAttrs.rateLimitEndpoint;
    }
    if (dataAttrs.rateLimitLimit) {
      config.rateLimitLimit = parseInt(dataAttrs.rateLimitLimit);
    }
    if (dataAttrs.rateLimitWindow) {
      config.rateLimitWindow = parseInt(dataAttrs.rateLimitWindow) * 1000;
    }

    if (dataAttrs.csrfToken) {
      config.csrfToken = dataAttrs.csrfToken;
    }
    if (dataAttrs.csrfHeader) {
      config.csrfHeader = dataAttrs.csrfHeader;
    }

    if (dataAttrs.validateOnSubmit !== undefined) {
      config.validateOnSubmit = dataAttrs.validateOnSubmit === 'true';
    }
    if (dataAttrs.sanitizeInput !== undefined) {
      config.sanitizeInput = dataAttrs.sanitizeInput === 'true';
    }

    ['ajaxSubmit', 'autoValidate', 'resetAfterSubmit', 'preventDoubleSubmit', 'showLoadingOnSubmit', 'showErrorsInline', 'showErrorsInNotification'].forEach(attr => {
      if (dataAttrs[attr] !== undefined) {
        config[attr] = dataAttrs[attr] === 'true';
      }
    });

    // Support data-validate as an alias for data-auto-validate
    if (dataAttrs.validate !== undefined) {
      config.autoValidate = dataAttrs.validate === 'true';
    }

    if (dataAttrs.errorContainer) {
      config.errorContainer = dataAttrs.errorContainer;
    }

    if (dataAttrs.showErrorsInline !== undefined) {
      config.showErrorsInline = dataAttrs.showErrorsInline === 'true';
    }

    if (dataAttrs.showErrorsInNotification !== undefined) {
      config.showErrorsInNotification = dataAttrs.showErrorsInNotification === 'true';
    }

    if (dataAttrs.errorClass) {
      config.errorClass = dataAttrs.errorClass;
    }

    if (dataAttrs.errorMessageClass) {
      config.errorMessageClass = dataAttrs.errorMessageClass;
    }

    if (dataAttrs.autoClearErrors !== undefined) {
      config.autoClearErrors = dataAttrs.autoClearErrors === 'true';
    }

    if (dataAttrs.autoClearErrorsDelay) {
      config.autoClearErrorsDelay = parseInt(dataAttrs.autoClearErrorsDelay);
    }

    if (dataAttrs.autoFocusError !== undefined) {
      config.autoFocusError = dataAttrs.autoFocusError === 'true';
    }

    if (dataAttrs.autoScrollToError !== undefined) {
      config.autoScrollToError = dataAttrs.autoScrollToError === 'true';
    }

    if (dataAttrs.successContainer) {
      config.successContainer = dataAttrs.successContainer;
    }

    if (dataAttrs.showSuccessInline !== undefined) {
      config.showSuccessInline = dataAttrs.showSuccessInline === 'true';
    }

    if (dataAttrs.showSuccessInNotification !== undefined) {
      config.showSuccessInNotification = dataAttrs.showSuccessInNotification === 'true';
    }

    // Extract success-specific data attributes
    if (dataAttrs.successRedirect) {
      config.successRedirect = dataAttrs.successRedirect;
    }

    if (dataAttrs.successMessage) {
      config.successMessage = dataAttrs.successMessage;
    }

    if (dataAttrs.loadingText) {
      config.loadingText = dataAttrs.loadingText;
    }

    return config;
  },

  initFormElements(instance) {
    const {element, elements} = instance;

    const fields = element.querySelectorAll(this.config.fieldSelector);

    fields.forEach(field => {
      if (!field.name && !field.id) {
        console.warn('FormManager: Field without name or id found:', field);
        return;
      }

      const fieldName = field.name || field.id;
      const fieldType = this.getFieldType(field);

      if (fieldType === 'radio') {
        if (!elements.has(fieldName)) {
          elements.set(fieldName, []);
        }
        elements.get(fieldName).push(field);

        if (field.checked) {
          instance.state.data[fieldName] = field.value;
        }
        return;
      }

      if (fieldType === 'checkbox' && !fieldName.endsWith('[]')) {
        elements.set(fieldName, field);
        instance.state.data[fieldName] = field.checked;
        return;
      }

      if (fieldType === 'checkbox' && fieldName.endsWith('[]')) {
        const baseName = fieldName.slice(0, -2);
        if (!elements.has(baseName)) {
          elements.set(baseName, []);
          instance.state.data[baseName] = [];
        }
        elements.get(baseName).push(field);
        if (field.checked) {
          instance.state.data[baseName].push(field.value);
        }
        return;
      }

      elements.set(fieldName, field);

      if (fieldType === 'file') {
        instance.state.data[fieldName] = null;
      } else if (fieldType === 'select-multiple' || field.tagName.toLowerCase() === 'select') {
        // Handle select-multiple with name[] format
        const baseName = fieldName.endsWith('[]') ? fieldName.slice(0, -2) : fieldName;

        // Store with base name for easier lookup
        if (baseName !== fieldName) {
          elements.set(baseName, field);
        }

        // For select elements, only store value if there's an explicitly selected option
        // or if the select has a value attribute set
        if (field.multiple) {
          // For multiple selects, check if any options have selected attribute
          const selectedOptions = field.querySelectorAll('option[selected]');
          if (selectedOptions.length > 0) {
            instance.state.data[baseName] = Array.from(selectedOptions).map(opt => opt.value);
          } else if (field.selectedOptions.length > 0) {
            // Fallback to selectedOptions property
            instance.state.data[baseName] = Array.from(field.selectedOptions).map(opt => opt.value);
          } else {
            instance.state.data[baseName] = [];
          }
        } else {
          // For single selects
          const selectedOption = field.querySelector('option[selected]');
          if (selectedOption) {
            instance.state.data[baseName] = selectedOption.value;
          } else if (field.value && field.options.length > 0) {
            // If no explicit selected attribute but has value, use it
            instance.state.data[baseName] = field.value;
          } else {
            instance.state.data[baseName] = '';
          }
        }
      } else {
        instance.state.data[fieldName] = field.value;
      }

      if (instance.config.autoEnhance && window.ElementManager) {
        window.ElementManager.enhance(field);
      }
    });

    return elements;
  },

  /**
   * Determines the type of a form field element
   * @param {HTMLElement} field - The form field element to check
   * @returns {string} The field type - either from data-element attribute, input type, or lowercase tag name
   */
  getFieldType(field) {
    if (field.dataset.element) {
      return field.dataset.element;
    }

    if (field.tagName.toLowerCase() === 'input') {
      return field.type || 'text';
    }

    return field.tagName.toLowerCase();
  },

  /**
   * Sets up event listeners for form submission and field changes
   * @param {Object} instance - The form instance to set up events for
   * @returns {void}
   */
  setupFormEvents(instance) {
    const {element} = instance;

    element.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Clear any previous errors before processing new submission
      FormError.clearFormMessages(element);
      instance.state.errors = {};

      // Check for confirmation dialog
      const confirmMessage = element.getAttribute('data-confirm');
      if (confirmMessage) {
        const confirmed = await DialogManager.confirm(Now.translate(confirmMessage));
        if (!confirmed) return;
      }

      if (window.SecurityManager) {
        if (instance.config.rateLimit !== false) {
          const endpoint = instance.config.rateLimitEndpoint ||
            element.action ||
            window.location.pathname;

          const rateLimitResult = SecurityManager.checkRateLimit(endpoint);
          if (!rateLimitResult.allowed) {
            this.handleRateLimitError(instance, rateLimitResult);
            return false;
          }
        }
      }

      if (instance.config.preventDoubleSubmit) {
        const now = Date.now();
        if (instance.state.submitting ||
          (now - instance.state.lastSubmitTime < instance.config.doubleSubmitTimeout)) {
          console.warn('FormManager: Double submit prevented');
          return false;
        }
        instance.state.lastSubmitTime = now;
      }

      try {
        instance.state.submitting = true;
        instance.state.submitCount++;

        if (instance.config.showLoadingOnSubmit) {
          element.classList.add(instance.config.loadingClass);
        }

        const submitButton = element.querySelector(instance.config.submitButtonSelector);
        if (submitButton) {
          submitButton.disabled = true;
          this.state.activeSubmit = submitButton;

          if (submitButton.textContent.trim()) {
            submitButton._originalText = submitButton.textContent;
            submitButton.textContent = instance.config.loadingText || 'Operating';
          }
        }

        this.emitEvent('form:submitting', {
          formId: instance.id,
          form: instance
        });

        if (instance.config.autoValidate) {
          const isValid = await this.validateForm(instance);
          if (!isValid) {
            this.handleInvalidSubmit(instance);
            return false;
          }
        }

        const data = this.getFormData(instance);

        // Check if CSRF token is present
        if (instance.config.csrf !== false && data.jsonData && !data.jsonData._token) {
          // Check if we're in development mode (suppress warnings for localhost/dev)
          const isDevelopment = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('dev') ||
            window.location.hostname.includes('local');

          if (!isDevelopment) {
            console.warn('CSRF token is missing from form data');
          }

          // Try to get CSRF token from meta tag or cookie
          const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
            document.cookie.split(';').find(c => c.trim().startsWith('XSRF-TOKEN='))?.split('=')[1];

          if (csrfToken) {
            data.jsonData._token = csrfToken;
            if (data.formData) {
              data.formData.append('_token', csrfToken);
            }
          } else if (!isDevelopment) {
            console.warn('No CSRF token found in meta tag or cookies');
          }
        }

        if (!data.jsonData || Object.keys(data.jsonData).length === 0) {
          throw new Error('No form data to submit');
        }

        let response;
        if (instance.config.ajaxSubmit) {
          response = await this.submitAjax(instance, data);
        } else {
          element.submit();
          response = {success: true};
        }

        // Enhanced success checking - NORMALIZED
        // After normalization, response structure is always:
        // { success: true/false, message: "...", data: {...}, status: 201 }
        const isSuccess = response && response.success === true;

        if (isSuccess) {
          this.handleSuccessfulSubmit(instance, response);
          // After successful submit, save any persisted fields (triggered on submit)
          try {
            this.savePersistedValues && this.savePersistedValues(instance);
          } catch (e) {}
        } else {
          this.handleFailedSubmit(instance, response);
        }

        return response;

      } catch (error) {
        this.handleSubmitError(instance, error);
        return false;
      } finally {
        const submitButton = element.querySelector(instance.config.submitButtonSelector);
        if (submitButton) {
          submitButton.disabled = false;

          if (submitButton._originalText) {
            submitButton.textContent = submitButton._originalText;
            delete submitButton._originalText;
          }
        }

        element.classList.remove(instance.config.loadingClass);

        clearTimeout(instance.resetTimeout);
        instance.resetTimeout = setTimeout(() => {
          instance.state.submitting = false;
          this.state.activeSubmit = null;
        }, 100);
      }
    });

    element.addEventListener('reset', (e) => {
      this.resetForm(instance);
    });

    element.addEventListener('change', async (e) => {
      const field = e.target;
      const name = field.name;

      if (!name) return;

      switch (field.type) {
        case 'checkbox':
          if (name.endsWith('[]')) {
            const baseName = name.slice(0, -2);
            instance.state.data[baseName] = this.getCheckboxGroupValues(element, name);
          } else {
            instance.state.data[name] = field.checked;
          }
          break;

        case 'radio':
          if (field.checked) {
            instance.state.data[name] = field.value;
          }
          break;

        case 'file':
          instance.state.data[name] = field.files.length > 0 ? true : null;
          break;

        default:
          instance.state.data[name] = field.value;
      }

      instance.state.modified = true;

      field.classList.add(instance.config.dirtyClass);

      this.emitEvent('form:field:change', {
        formId: instance.id,
        field: field,
        name: name,
        value: instance.state.data[name]
      });

      // Handle cascade if this field has data-cascade-source
      if (field.dataset.cascadeSource) {
        await this.handleCascade(instance, field);
      }
    });

    if (instance.config.validateOnInput) {
      element.addEventListener('input', Utils.function.debounce((e) => {
        const field = e.target;
        if (field.name) {
          this.validateField(instance, field);
        }
      }, 300));
    }

    if (instance.config.validateOnBlur) {
      element.addEventListener('blur', (e) => {
        const field = e.target;
        if (field.name) {
          this.validateField(instance, field);
        }
      }, true);
    }
  },

  async validateField(instance, field, forceValidate = false) {
    const fieldName = field.name;
    if (!fieldName) return true;

    // Skip validation for unmodified fields unless forced (e.g., on form submit)
    if (!forceValidate && instance.config.validateOnlyDirty &&
      !field.classList.contains(instance.config.dirtyClass)) {
      return true;
    }

    FormError.clearFieldError(fieldName);
    delete instance.state.errors[fieldName];

    // Prefer element identity lookup to avoid stale id-only matches when DOM nodes are recreated
    let elementInstance = null;
    try {
      const em = window.ElementManager;
      if (em && typeof em.getInstanceByElement === 'function') {
        elementInstance = em.getInstanceByElement(field) || null;
      }
      // fallback to id-based lookup if no instance found by element
      if (!elementInstance && field.id && em && typeof em.getInstance === 'function') {
        elementInstance = em.getInstance(field.id) || null;
        // if id-mapped instance is stale (element different or disconnected), ignore it
        if (elementInstance && elementInstance.element && elementInstance.element !== field) {
          if (!elementInstance.element.isConnected) {
            try {em.destroy(field.id);} catch (e) {}
            elementInstance = null;
          }
        }
      }
    } catch (e) {
      elementInstance = null;
    }
    if (elementInstance && typeof elementInstance.validate === 'function') {
      try {
        elementInstance.validate(field.value, true);
        return elementInstance.isValid();
      } catch (error) {
        FormError.showFieldError(fieldName, error.message || 'Validation error', instance.element);
        instance.state.errors[fieldName] = error.message || 'Validation error';
        return false;
      }
    }

    const value = this.getFieldValue(field);

    if (field.required && (value === null || value === undefined || value === '')) {
      const message = Now.translate(field.dataset.errorRequired || 'Please fill in');
      FormError.showFieldError(fieldName, message, instance.element);
      instance.state.errors[fieldName] = message;
      return false;
    }

    if (value === null || value === '' || value === undefined) {
      return true;
    }

    if (field.pattern) {
      const pattern = new RegExp(field.pattern);
      if (!pattern.test(value)) {
        const message = Now.translate(field.dataset.errorPattern || 'Please enter a valid format');
        FormError.showFieldError(fieldName, message, instance.element);
        instance.state.errors[fieldName] = message;
        return false;
      }
    }

    if (field.type === 'number' || field.type === 'range') {
      const numValue = parseFloat(value);

      if (!isNaN(numValue)) {
        if (field.min !== undefined && field.min !== '' && numValue < parseFloat(field.min)) {
          const message = Now.translate(field.dataset.errorMin || 'Value must be at least {min}', {min: field.min});
          FormError.showFieldError(fieldName, message, instance.element);
          instance.state.errors[fieldName] = message;
          return false;
        }

        if (field.max !== undefined && field.max !== '' && numValue > parseFloat(field.max)) {
          const message = Now.translate(field.dataset.errorMax || 'Value must be no more than {max}', {max: field.max});
          FormError.showFieldError(fieldName, message, instance.element);
          instance.state.errors[fieldName] = message;
          return false;
        }
      }
    }

    if (typeof value === 'string') {
      if (field.minLength && value.length < parseInt(field.minLength)) {
        const message = Now.translate(field.dataset.errorMinlength || 'Please enter at least {minlength} characters', {minlength: field.minLength});
        FormError.showFieldError(fieldName, message, instance.element);
        instance.state.errors[fieldName] = message;
        return false;
      }

      if (field.maxLength && field.maxLength > 0 && value.length > parseInt(field.maxLength)) {
        const message = Now.translate(field.dataset.errorMaxlength || 'Please enter no more than {maxlength} characters', {maxlength: field.maxLength});
        FormError.showFieldError(fieldName, message, instance.element);
        instance.state.errors[fieldName] = message;
        return false;
      }
    }

    for (const [name, validator] of this.state.validators) {
      if (field.dataset[`validate${name.charAt(0).toUpperCase() + name.slice(1)}`] !== undefined) {
        const param = field.dataset[`validate${name.charAt(0).toUpperCase() + name.slice(1)}`] || '';

        if (!validator.validate(value, field, param)) {
          let message = field.dataset[`error${name.charAt(0).toUpperCase() + name.slice(1)}`] ||
            validator.message;

          // Only replace parameter if it's valid (not empty and not NaN for numeric validators)
          if (param && param.trim() !== '') {
            if (name === 'maxlength' || name === 'minlength') {
              const numParam = parseInt(param);
              if (!isNaN(numParam) && numParam > 0) {
                message = message.replace('{0}', param);
              }
            } else {
              message = message.replace('{0}', param);
            }
          }

          FormError.showFieldError(fieldName, message, instance.element);
          instance.state.errors[fieldName] = message;
          return false;
        }
      }
    }

    if (field.dataset.validateFn && window[field.dataset.validateFn]) {
      const validationFn = window[field.dataset.validateFn];
      try {
        const result = await validationFn(value, field, instance);
        if (result !== true) {
          const message = typeof result === 'string' ? result : 'Validation failed';
          FormError.showFieldError(fieldName, message, instance.element);
          instance.state.errors[fieldName] = message;
          return false;
        }
      } catch (error) {
        FormError.showFieldError(fieldName, error.message || 'Validation error', instance.element);
        instance.state.errors[fieldName] = error.message || 'Validation error';
        return false;
      }
    }

    field.classList.add(instance.config.validClass);
    field.classList.remove(instance.config.invalidClass);
    return true;
  },

  async validateForm(instance) {
    FormError.clearAll();
    instance.state.errors = {};

    let isValid = true;
    const invalidFields = [];

    const promises = [];

    // Force validate all fields on form submit (bypass validateOnlyDirty)
    for (const [name, field] of instance.elements) {
      if (Array.isArray(field)) {
        if (field.length > 0) {
          promises.push(this.validateField(instance, field[0], true).then(
            valid => {
              if (!valid) {
                isValid = false;
                invalidFields.push(field[0]);
              }
            }
          ));
        }
      } else {
        promises.push(this.validateField(instance, field, true).then(
          valid => {
            if (!valid) {
              isValid = false;
              invalidFields.push(field);
            }
          }
        ));
      }
    }

    await Promise.all(promises);

    instance.state.valid = isValid;

    if (!isValid && invalidFields.length > 0) {
      invalidFields[0].focus();

      invalidFields[0].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }

    this.emitEvent('form:validate', {
      formId: instance.id,
      isValid,
      errors: instance.state.errors,
      invalidFields
    });

    return isValid;
  },

  getFieldValue(field) {
    switch (field.type) {
      case 'checkbox':
        if (field.name.endsWith('[]')) {
          return this.getCheckboxGroupValues(field.form, field.name);
        }
        return field.checked;

      case 'radio':
        const checkedRadio = field.form.querySelector(`input[name="${field.name}"]:checked`);
        return checkedRadio ? checkedRadio.value : null;

      case 'select-multiple':
        return Array.from(field.selectedOptions).map(opt => opt.value);

      case 'file':
        return field.files.length > 0 ? field.files : null;

      default:
        return field.value;
    }
  },

  getCheckboxGroupValues(form, name) {
    const checkboxes = form.querySelectorAll(`input[name="${name}"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
  },

  getFormData(instance, loading = false) {
    const {element} = instance;
    const formData = new FormData();
    const jsonData = {};

    // Read directly from native form.elements like a real form submit would.
    // This ensures AJAX submit matches native submit behavior exactly and
    // automatically handles dynamically created inputs without registration.
    const processedNames = new Set();

    try {
      const nativeElements = element.elements; // HTMLFormControlsCollection
      if (nativeElements && nativeElements.length) {
        for (const nativeEl of Array.from(nativeElements)) {
          const name = nativeEl.name;
          if (!name) continue; // Skip unnamed controls

          // Skip if we already processed this name (for radio/checkbox groups)
          if (processedNames.has(name)) continue;

          // Handle different input types
          if (nativeEl.type === 'radio') {
            // For radio groups, only include the checked one
            const checked = element.querySelector(`input[name="${name}"]:checked`);
            if (checked) {
              formData.append(name, checked.value || '');
              jsonData[name] = checked.value || '';
            }
            processedNames.add(name);
            continue;
          }

          if (nativeEl.type === 'checkbox') {
            // Handle checkbox groups (name[])
            if (name.endsWith('[]')) {
              const baseName = name.slice(0, -2);
              if (!processedNames.has(baseName)) {
                const checked = element.querySelectorAll(`input[name="${name}"]:checked`);
                const vals = Array.from(checked).map(cb => cb.value || '');
                vals.forEach(v => formData.append(name, v));
                jsonData[baseName] = vals;
                processedNames.add(baseName);
              }
            } else {
              // Single checkbox
              const val = nativeEl.checked ? '1' : '0';
              formData.append(name, val);
              jsonData[name] = nativeEl.checked;
              processedNames.add(name);
            }
            continue;
          }

          if (nativeEl.type === 'file') {
            // Handle file inputs
            if (nativeEl.multiple && nativeEl.files.length > 0) {
              Array.from(nativeEl.files).forEach(file => formData.append(`${name}[]`, file));
              jsonData[name] = Array.from(nativeEl.files).map(f => f.name);
            } else if (nativeEl.files.length > 0) {
              formData.append(name, nativeEl.files[0]);
              jsonData[name] = nativeEl.files[0].name;
            }
            processedNames.add(name);
            continue;
          }

          if (nativeEl.tagName.toLowerCase() === 'select' && nativeEl.multiple) {
            // Handle multi-select
            const values = Array.from(nativeEl.selectedOptions).map(opt => opt.value);
            values.forEach(v => formData.append(`${name}[]`, v));
            jsonData[name] = values;
            processedNames.add(name);
            continue;
          }

          // Handle other array inputs (e.g. hidden inputs with name="skills[]")
          if (name.endsWith('[]')) {
            if (!processedNames.has(name)) {
              const inputs = element.querySelectorAll(`[name="${name}"]`);
              const values = Array.from(inputs).map(input => input.value);

              values.forEach(v => formData.append(name, v));

              // For JSON, use the base name without [] to be consistent with checkboxes
              const baseName = name.slice(0, -2);
              jsonData[baseName] = values;

              processedNames.add(name);
            }
            continue;
          }

          // Default: text, hidden, textarea, select (single), etc.
          const value = nativeEl.value || '';
          formData.append(name, value);
          jsonData[name] = value;
          processedNames.add(name);
        }
      }
    } catch (e) {
      console.warn('FormManager: Error reading form.elements', e);
    }

    if (!loading && instance.config.csrf !== false) {
      // Check for existing CSRF token in the form
      const existingCsrfInput = element.querySelector('input[name="_token"]');
      let csrfToken = existingCsrfInput ? existingCsrfInput.value : null;

      // If not found in form, try meta tag
      if (!csrfToken) {
        csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      }

      // If still not found, try cookies
      if (!csrfToken) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'XSRF-TOKEN') {
            csrfToken = decodeURIComponent(value);
            break;
          }
        }
      }

      if (csrfToken) {
        // Only add if not already present in form data
        if (!jsonData._token) {
          formData.append('_token', csrfToken);
          jsonData._token = csrfToken;
        }
      } else {
        // Try to fetch a new CSRF token
        if (window.simpleFetch) {
          setTimeout(() => {
            const csrfEndpoint = window.SecurityManager?.config?.csrf?.tokenUrl ||
              window.Now?.config?.security?.csrf?.tokenUrl ||
              'api/auth/csrf-token';
            simpleFetch.get(csrfEndpoint)
              .then(response => {
                if (response.data && response.data.token) {
                  // Update meta tag
                  let metaToken = document.querySelector('meta[name="csrf-token"]');
                  if (!metaToken) {
                    metaToken = document.createElement('meta');
                    metaToken.name = 'csrf-token';
                    document.head.appendChild(metaToken);
                  }
                  metaToken.setAttribute('content', response.data.token);
                }
              })
              .catch(error => {
                console.error('Failed to fetch CSRF token:', error);
              });
          }, 0);
        }
      }
    }

    instance.state.data = jsonData;
    return {formData, jsonData};
  },

  /**
   * Get a plain values object for a form.
   * Identifier can be a formId (string), an HTMLFormElement, or an instance object.
   * Returns null if the form/instance cannot be found.
   */
  getValues(identifier) {
    let instance = null;
    if (!identifier) return null;

    if (typeof identifier === 'string') {
      instance = this.getInstance(identifier);
      if (!instance) {
        // try to resolve by DOM id or data-form attr
        const el = document.getElementById(identifier) || document.querySelector(`form[data-form="${identifier}"]`);
        if (el) instance = this.getInstanceByElement(el);
      }
    } else if (identifier instanceof HTMLFormElement) {
      instance = this.getInstanceByElement(identifier);
    } else if (identifier && identifier.element) {
      instance = identifier;
    }

    if (!instance) return null;

    // Ensure we have fresh values by rebuilding form data
    try {
      const {jsonData} = this.getFormData(instance);
      return jsonData;
    } catch (e) {
      // Fallback to stored state data
      return instance.state && instance.state.data ? instance.state.data : null;
    }
  },

  /**
   * Set form field values from a data object
   * @param {Object} instance - Form instance
   * @param {Object} data - Object with field values {fieldName: value}
   */
  setFormData(instance, data) {
    if (!instance || !data) return;

    const {element, elements} = instance;

    for (const [fieldName, value] of Object.entries(data.data || data)) {
      // Find the form field(s) by name
      const field = elements.get(fieldName);

      if (!field) {
        // Try to find by name in DOM if not in elements map
        const domField = element.querySelector(`[name="${fieldName}"], [name="${fieldName}[]"]`);
        if (domField) {
          this.setFieldValue(domField, value);
        }
        continue;
      }

      // Handle array of fields (radio buttons, checkbox groups)
      if (Array.isArray(field)) {
        field.forEach(f => {
          if (f.type === 'radio') {
            f.checked = (f.value === value || f.value === String(value));
          } else if (f.type === 'checkbox') {
            if (Array.isArray(value)) {
              f.checked = value.includes(f.value);
            } else {
              f.checked = (f.value === value || f.value === String(value));
            }
          }
        });
      } else {
        this.setFieldValue(field, value);
      }

      // Update instance state
      instance.state.data[fieldName] = value;
    }

    // Handle fields with data-attr bindings (e.g., data-attr="value:provinceID")
    // These fields may have different name attributes than the data field names
    const dataAttrFields = element.querySelectorAll('[data-attr]');
    dataAttrFields.forEach(field => {
      const attrValue = field.getAttribute('data-attr');
      const match = attrValue?.match(/value:([\w-]+)/);
      if (match && match[1]) {
        const dataFieldName = match[1];
        const value = (data.data || data)[dataFieldName];

        if (value !== undefined && value !== null) {
          // Check if this is a tags input
          if (field.getAttribute('data-element') === 'tags' && Array.isArray(value)) {
            // Get the ElementManager instance
            const tagsInstance = window.ElementManager?.getInstanceByElement(field);

            if (tagsInstance && typeof tagsInstance.setValue === 'function') {
              // Get options for mapping IDs to text
              const optionsKey = field.getAttribute('data-options-key');
              const options = instance.state.formOptions?.[optionsKey];

              if (options && Array.isArray(options)) {
                // Map value IDs to their display text from options
                const tags = value.map(val => {
                  const option = options.find(opt =>
                    (typeof opt === 'object' ? opt.value : opt) == val
                  );
                  if (option) {
                    return typeof option === 'object'
                      ? {key: option.value, value: option.text}
                      : {key: option, value: option};
                  }
                  return {key: val, value: val};
                });

                tagsInstance.setValue(tags);
              } else {
                // No options available, just use the values as-is
                const tags = value.map(val => ({key: val, value: val}));
                tagsInstance.setValue(tags);
              }
            }
          } else if (field.type === 'file' && (Array.isArray(value) || typeof value === 'object')) {
            // Handle file inputs with data-attr bindings
            this.setFieldValue(field, value);
          } else if (field.type === 'text' && field.getAttribute('data-options-key')) {
            // Handle text inputs with autocomplete (similar to tags)
            const optionsKey = field.getAttribute('data-options-key');
            const options = instance.state.formOptions?.[optionsKey];

            if (options && Array.isArray(options)) {
              // Find the option that matches the value (ID)
              const selectedOption = options.find(opt =>
                (typeof opt === 'object' ? opt.value : opt) == value
              );

              if (selectedOption) {
                // Set the display text in the visible input
                field.value = typeof selectedOption === 'object'
                  ? selectedOption.text
                  : selectedOption;

                // Set the ID in the hidden input (if exists)
                const hiddenName = field.name.replace('_text', '');
                const hiddenInput = element.querySelector(`input[type="hidden"][name="${hiddenName}"]`);
                if (hiddenInput) {
                  hiddenInput.value = value;
                }

                // Update ElementManager instance state
                const textInstance = window.ElementManager?.getInstanceByElement(field);
                if (textInstance) {
                  textInstance.selectedValue = value;
                }
              } else {
                // No matching option, set raw value
                this.setFieldValue(field, value);
              }
            } else {
              // No options available, set raw value
              this.setFieldValue(field, value);
            }
          } else if (!elements.get(field.name)) {
            // For other fields with data-attr, set value if not already set by name
            this.setFieldValue(field, value);
          }
        }
      }
    });

    // Handle file inputs with data-files attribute referencing a field name
    // e.g., data-files="avatar" should get its value from data.avatar
    const fileInputsWithDataFiles = element.querySelectorAll('input[type="file"][data-files]');
    fileInputsWithDataFiles.forEach(field => {
      const dataFilesAttr = field.getAttribute('data-files');
      if (!dataFilesAttr) return;

      // Check if it's a field name reference (not JSON)
      try {
        JSON.parse(dataFilesAttr);

        return;
      } catch (e) {
        // Not JSON - it's a field name reference
        const fieldData = data.data || data;
        // Handle double-nested data structure (e.g., data.data.data.avatar)
        let value = fieldData[dataFilesAttr];
        if (value === undefined && fieldData.data) {
          value = fieldData.data[dataFilesAttr];
        }

        if (value && (Array.isArray(value) || typeof value === 'object')) {
          this.setFieldValue(field, value);
        }
      }
    });

    // Handle tables with data-attr="data:fieldName" bindings
    // This allows nested array data to be bound to editable tables
    const tablesWithDataAttr = element.querySelectorAll('table[data-table][data-attr]');
    tablesWithDataAttr.forEach(table => {
      const attrValue = table.getAttribute('data-attr');
      const match = attrValue?.match(/data:(\w+)/);
      if (match && match[1]) {
        const dataFieldName = match[1];
        const fieldData = data.data || data;
        const tableData = fieldData[dataFieldName];

        if (tableData && window.TableManager) {
          const tableId = table.getAttribute('data-table');
          // Use setTimeout to ensure TableManager is initialized
          setTimeout(() => {
            // Support both nested structure {columns: [], data: []} and simple array
            if (tableData.columns && tableData.data) {
              // Nested structure with columns metadata
              TableManager.setData(tableId, tableData);
            } else if (Array.isArray(tableData)) {
              // Simple array (backward compatible)
              TableManager.setData(tableId, tableData);
            }
          }, 0);
        }
      }
    });

    // Use TemplateManager to process data-text, data-attr, data-if, etc. bindings
    // This provides full expression support, i18n integration, and reactive updates
    if (window.TemplateManager) {
      const fieldData = data.data || data;
      const context = {
        state: fieldData,
        data: fieldData,
        computed: {}
      };
      TemplateManager.processDataDirectives(element, context);
    }

    // Trigger change event to update any dependent elements
    this.emitEvent('form:data:set', {
      formId: instance.id,
      data
    });
  },

  /**
   * Set value for a single field element
   * @param {HTMLElement} field - Form field element
   * @param {*} value - Value to set
   * @param {Boolean} silent - If true, don't dispatch change event
   */
  setFieldValue(field, value, silent = false) {
    if (!field) return;

    switch (field.type) {
      case 'checkbox':
        field.checked = Boolean(value);
        break;

      case 'radio':
        field.checked = (field.value === value || field.value === String(value));
        break;

      case 'select-multiple':
        if (Array.isArray(value)) {
          // Convert values to strings for comparison (handles number/string mismatch)
          const valueStrings = value.map(v => String(v));

          Array.from(field.options).forEach(opt => {
            opt.selected = valueStrings.includes(opt.value);
          });
        }
        break;

      case 'file':
        // Cannot programmatically set file input value for security reasons
        // But we can update data-files attribute to show existing files
        if (value && (Array.isArray(value) || typeof value === 'object')) {
          const files = Array.isArray(value) ? value : [value];
          field.setAttribute('data-files', JSON.stringify(files));

          // Reinitialize FileElementFactory to show existing files
          if (window.ElementManager && window.FileElementFactory) {
            const instance = ElementManager.getInstanceByElement(field);
            if (instance) {
              // Update config with new existing files
              instance.config.existingFiles = files;

              // Clear and show existing files
              if (instance.previewContainer) {
                // Remove old existing files previews
                const oldPreviews = instance.previewContainer.querySelectorAll('.preview-item[data-existing="true"]');
                oldPreviews.forEach(preview => preview.remove());

                // Show new existing files
                FileElementFactory.showExistingFiles(instance, files);
              }
            }
          }
        }
        break;

      default:
        // For select-one, convert value to string to match option values
        // This handles cases where API sends numbers but options have string values
        if (field.tagName === 'SELECT' && !field.multiple) {
          field.value = value !== null && value !== undefined ? String(value) : '';
        } else {
          field.value = value ?? '';
        }

        // Trigger ElementManager update if available
        if (window.ElementManager) {
          const instance = ElementManager.getInstanceByElement(field);

          if (instance && typeof instance.setValue === 'function') {
            instance.setValue(value);
          }
        }
        break;
    }

    // Dispatch change event (unless silent mode)
    if (!silent) {
      field.dispatchEvent(new Event('change', {bubbles: true}));
    }
  },

  async submitAjax(instance, data) {
    const {element, config} = instance;
    const hasFiles = Array.from(element.elements).some(el => el.type === 'file' && el.files?.length > 0);
    try {
      const method = element.getAttribute('data-method') ||
        element.method ||
        config.method ||
        'POST';

      const url = element.getAttribute('data-action') ||
        element.action ||
        config.action ||
        window.location.href;

      let response;

      if (hasFiles) {
        response = await this.submitWithProgress(instance, url, data.formData);
      } else {
        const methodLower = method.toLowerCase();

        const buildHeaders = () => {
          if (instance.config.csrf === false) {
            return {'X-Skip-CSRF': 'true'};
          }
          return undefined;
        };

        // Use HttpClient (window.http) as primary client with CSRF protection
        const requestOptions = {
          throwOnError: false
        };

        const headers = buildHeaders();
        if (headers) {
          requestOptions.headers = headers;
        }

        response = await window.http[methodLower](url, data.jsonData, requestOptions);
      }

      // Check for success using response.success (unified standard)
      // Both HttpClient and XHR now return response.success
      if (response.success) {
        const apiResponse = response.data || {};

        return {
          success: true,  // Normalized success flag
          message: Now.translate(apiResponse.message || config.successMessage),
          data: apiResponse.data || apiResponse,  // Extract data field from API response
          status: response.status,
          code: apiResponse.code
        };
      } else {
        return {
          success: false,
          message: Now.translate(response.data?.message || response.statusText || config.errorMessage),
          errors: response.data?.errors || {},
          status: response.status,
          data: response.data
        };
      }

    } catch (error) {
      return {
        success: false,
        message: Now.translate(error.message || config.errorMessage),
        error: error
      };
    }
  },

  submitWithProgress(instance, url, formData) {
    return new Promise((resolve, reject) => {
      const {element, config} = instance;

      const xhr = new XMLHttpRequest();

      const progressContainer = this.createProgressElement(element);
      progressContainer.style.display = 'block';

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          this.updateProgress(progressContainer, e.loaded, e.total);
        }
      });

      xhr.addEventListener('load', () => {
        progressContainer.style.display = 'none';

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            // XHR gets full API response: { success: true, message: "...", code: 201, data: {...} }
            const apiResponse = JSON.parse(xhr.responseText);

            resolve({
              success: apiResponse.success !== false,  // Use API's success flag
              message: apiResponse.message,
              data: apiResponse.data || apiResponse,  // Extract data field from API response
              status: xhr.status,
              code: apiResponse.code
            });
          } catch (e) {
            resolve({
              success: true,
              message: Now.translate(config.successMessage),
              rawResponse: xhr.responseText,
              status: xhr.status
            });
          }
        } else {
          let result = {
            ok: false,
            success: false,
            message: Now.translate(config.errorMessage),
            statusCode: xhr.status,
            statusText: xhr.statusText
          };

          try {
            const errorData = JSON.parse(xhr.responseText);
            result = {
              ...result,
              ...errorData
            };
          } catch (e) {
          }

          resolve(result);
        }
      });

      xhr.addEventListener('error', () => {
        progressContainer.style.display = 'none';
        resolve({
          success: false,
          message: 'Network error occurred',
          statusCode: 0,
          statusText: 'Network Error'
        });
      });

      xhr.addEventListener('abort', () => {
        progressContainer.style.display = 'none';
        resolve({
          success: false,
          message: 'Request was aborted',
          statusCode: 0,
          statusText: 'Aborted'
        });
      });

      xhr.open('POST', url);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      if (csrfToken) {
        xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      }

      xhr.send(formData);
    });
  },

  createProgressElement(form) {
    let progress = form.querySelector('.upload-progress');

    if (!progress) {
      const template = document.createElement('div');
      template.innerHTML = this.config.uploadProgressTemplate.trim();
      progress = template.firstChild;
      form.appendChild(progress);
    }

    return progress;
  },

  updateProgress(container, loaded, total) {
    const percent = Math.round((loaded / total) * 100);

    const bar = container.querySelector('.progress-bar');
    if (bar) {
      bar.style.width = percent + '%';
      bar.setAttribute('aria-valuenow', percent);
    }

    const text = container.querySelector('.progress-text');
    if (text) {
      const loadedSize = this.formatFileSize(loaded);
      const totalSize = this.formatFileSize(total);
      text.textContent = `${percent}% (${loadedSize} / ${totalSize})`;
    }

    this.emitEvent('form:upload-progress', {
      loaded,
      total,
      percent
    });
  },

  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }

    return `${Math.round(size * 10) / 10} ${units[unit]}`;
  },

  autoFillIntendedUrl(form) {
    const urlParams = new URLSearchParams(window.location.search);
    // prefer explicit `redirect` or `return_to` in query
    const redirectParam = urlParams.get('redirect') || urlParams.get('return_to') || null;

    // prefer sessionStorage key set by RedirectManager (auth_intended_route)
    let sessionIntended = null;
    const normalizePath = (pathname) => {
      const routerBase = window.RouterManager?.config?.base || '';
      let normalized = pathname || '/';
      if (routerBase && normalized.startsWith(routerBase)) {
        normalized = normalized.slice(routerBase.length) || '/';
        if (!normalized.startsWith('/')) normalized = '/' + normalized;
      }
      return normalized;
    };

    try {
      const stored = sessionStorage.getItem('auth_intended_route');

      if (stored) {
        const parsed = JSON.parse(stored);

        if (parsed && parsed.path) {
          const normalizedPath = normalizePath(parsed.path);
          sessionIntended = normalizedPath + (parsed.query || '') + (parsed.hash || '');
        }
      }
    } catch (e) {
      sessionIntended = null;
    }

    let intendedUrl = null;

    if (redirectParam && this.isValidRedirectUrl(redirectParam)) {
      intendedUrl = redirectParam;
    } else if (sessionIntended) {
      const isValid = this.isValidRedirectUrl(sessionIntended);

      if (isValid) {
        intendedUrl = sessionIntended;
      }
    }

    // Find or create hidden input for intended_url
    let intendedInput = form.querySelector('input[name="intended_url"]');

    if (!intendedInput) {
      try {
        intendedInput = document.createElement('input');
        intendedInput.type = 'hidden';
        intendedInput.name = 'intended_url';
        form.appendChild(intendedInput);
      } catch (e) {
        return;
      }
    }

    // Set the value (empty string if no intended URL)
    if (intendedUrl) {
      intendedInput.value = intendedUrl;
      form.dataset.redirectAfterLogin = intendedUrl;
    } else {
      intendedInput.value = '';
    }
  },

  /**
   * Restore remembered username/email into the login form if present in localStorage.
   * This only restores the username/email and never stores passwords.
   */
  restoreRememberedCredentials(instance) {
    try {
      if (!instance || !instance.element) return;
      const form = instance.element;

      // Only restore for login forms
      const formType = form.dataset && form.dataset.form ? form.dataset.form : null;
      if (formType !== 'login') return;

      const stored = localStorage.getItem('remember_username');
      if (!stored) return;

      const usernameInput = form.querySelector('input[name="username"]') || form.querySelector('input[type="email"]') || form.querySelector('input[type="text"]');
      const rememberCheckbox = form.querySelector('input[name="remember"], input#remember');

      if (usernameInput) {
        usernameInput.value = stored;
        try {instance.state.data[usernameInput.name || 'username'] = stored;} catch (e) {}
      }

      if (rememberCheckbox) {
        rememberCheckbox.checked = true;
      }
    } catch (e) {}
  },

  /**
   * Restore persisted values for fields with data-persist attribute.
   * Supports localStorage (default) and cookie via data-persist="cookie".
   */
  restorePersistedValues(instance) {
    try {
      if (!instance || !instance.element) return;
      const form = instance.element;

      const items = form.querySelectorAll('[data-persist]');
      if (!items || items.length === 0) return;

      items.forEach(el => {
        try {
          const persistAttr = el.dataset.persist;
          if (!persistAttr || persistAttr === 'false') return;

          const storage = (persistAttr === 'cookie') ? 'cookie' : 'local';
          const key = el.dataset.persistKey || (`nowjs_persist:${form.dataset.form || window.location.pathname}:${el.name || el.id}`);

          // skip passwords unless explicitly allowed
          if ((el.type === 'password' || el.dataset.element === 'password') && el.dataset.persistAllowPassword !== 'true') return;

          let value = null;
          if (storage === 'cookie') {
            value = this._getCookie(key);
          } else {
            const raw = localStorage.getItem(key);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (!parsed || !parsed.value) return;
                if (parsed.expires && Date.now() > parsed.expires) {
                  localStorage.removeItem(key);
                  return;
                }
                value = parsed.value;
              } catch (e) {
                value = raw;
              }
            }
          }

          if (value === null || value === undefined) return;
          // Apply the value depending on field type
          if (el.type === 'checkbox') {
            el.checked = value === '1' || value === true || value === 'true';
          } else if (el.type === 'radio') {
            const radios = form.querySelectorAll(`input[name="${el.name}"]`);
            radios.forEach(r => {r.checked = (r.value === value);});
          } else if (el.tagName.toLowerCase() === 'select') {
            try {el.value = value;} catch (e) {}
          } else {
            el.value = value;
          }

          try {instance.state.data[el.name || el.id] = (el.type === 'checkbox' ? el.checked : el.value);} catch (e) {}
        } catch (e) {}
      });
    } catch (e) {}
  },

  /**
   * Save persisted values for fields with data-persist attribute. Called on successful submit.
   */
  savePersistedValues(instance) {
    try {
      if (!instance || !instance.element) return;
      const form = instance.element;
      const items = form.querySelectorAll('[data-persist]');
      if (!items || items.length === 0) return;

      items.forEach(el => {
        try {
          const persistAttr = el.dataset.persist;
          if (!persistAttr || persistAttr === 'false') return;
          const persistOn = el.dataset.persistOn || 'submit';
          if (persistOn !== 'submit') return; // currently only support submit-triggered saves

          const storage = (persistAttr === 'cookie') ? 'cookie' : 'local';
          const key = el.dataset.persistKey || (`nowjs_persist:${form.dataset.form || window.location.pathname}:${el.name || el.id}`);
          const ttlDays = parseInt(el.dataset.persistTtlDays || el.dataset.persistTtl || '0');

          // skip passwords unless explicitly allowed
          if ((el.type === 'password' || el.dataset.element === 'password') && el.dataset.persistAllowPassword !== 'true') return;

          let value = null;
          if (el.type === 'checkbox') {
            value = el.checked ? '1' : '0';
          } else if (el.type === 'radio') {
            if (el.checked) value = el.value;
            else return; // don't save if not the checked radio
          } else if (el.tagName.toLowerCase() === 'select') {
            value = el.value;
          } else {
            value = el.value;
          }

          if (storage === 'cookie') {
            const days = isNaN(ttlDays) ? 0 : ttlDays;
            this._setCookie(key, value, days);
          } else {
            const obj = {value: value};
            if (!isNaN(ttlDays) && ttlDays > 0) {
              obj.expires = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
            }
            try {localStorage.setItem(key, JSON.stringify(obj));} catch (e) {localStorage.setItem(key, value);}
          }
        } catch (e) {}
      });
    } catch (e) {}
  },

  // cookie helpers
  _setCookie(name, value, days) {
    try {
      if (!name || typeof name !== 'string') return;

      let expires = '';
      if (days && days > 0) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = '; expires=' + date.toUTCString();
      }
      document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value == null ? '' : value) + expires + '; path=/';
    } catch (e) {}
  },

  _getCookie(name) {
    try {
      const cookies = document.cookie ? document.cookie.split(';') : [];
      for (const c of cookies) {
        const [k, ...rest] = c.trim().split('=');
        if (decodeURIComponent(k) === name) return decodeURIComponent(rest.join('='));
      }
      return null;
    } catch (e) {return null;}
  },

  performRedirect(url) {
    // Try using RouterManager first if available and properly initialized
    if (window.RouterManager?.state?.initialized && typeof window.RouterManager.navigate === 'function') {
      try {
        RouterManager.navigate(url);
        return;
      } catch (error) {
        console.warn('RouterManager.navigate failed, falling back to window.location.href:', error);
      }
    }

    // Fallback to direct browser navigation
    window.location.href = url;
  },

  async handleSuccessfulSubmit(instance, response) {
    const {element, config} = instance;

    FormError.clearAll();

    if (config.resetAfterSubmit) {
      this.resetForm(instance);
    }

    const data = response.data.data || response.data;

    // Handle login form authentication OR register form with auto-login
    if (data && data.user && data.token &&
      (element.dataset.form === 'login' || element.dataset.form === 'register')) {
      const authManager = Now.getManager('auth');

      if (authManager && typeof authManager.setAuthenticatedUser === 'function') {
        // Use proper AuthManager method instead of direct state manipulation
        // Pass the standardized API response structure to setAuthenticatedUser
        try {
          const setUserResult = await authManager.setAuthenticatedUser(data, {
            preventRedirect: true // FormManager will handle redirect
          });

          if (!(setUserResult && setUserResult.success)) {
            console.warn('Failed to set authenticated user:', setUserResult?.message || 'Unknown error');
          }
        } catch (error) {
          console.error('Error setting authenticated user:', error);
        }
      } else {
        console.warn('AuthManager not available or setAuthenticatedUser method not found');
      }
      // Persist "remember me" username locally if requested on login forms
      try {
        const formEl = element;
        const formType = formEl.dataset && formEl.dataset.form ? formEl.dataset.form : null;
        if (formType === 'login') {
          const rememberCheckbox = formEl.querySelector('input[name="remember"], input#remember');
          const usernameInput = formEl.querySelector('input[name="username"]') || formEl.querySelector('input[type="email"]') || formEl.querySelector('input[type="text"]');

          if (rememberCheckbox && rememberCheckbox.checked && usernameInput && usernameInput.value) {
            try {localStorage.setItem('remember_username', usernameInput.value);} catch (e) {}
          } else {
            try {localStorage.removeItem('remember_username');} catch (e) {}
          }
        }
      } catch (e) {}
    }

    // For login forms, override redirect URL with intended URL if available
    if (element.dataset.form === 'login' && data && data.actions) {
      let intendedUrl = element.querySelector('input[name="intended_url"]')?.value
        || element.dataset.redirectAfterLogin
        || sessionStorage.getItem('intended_url');

      // Also check auth_intended_route from sessionStorage
      if (!intendedUrl) {
        try {
          const stored = sessionStorage.getItem('auth_intended_route');
          if (stored) {
            const route = JSON.parse(stored);
            if (route && route.path) {
              intendedUrl = route.path + (route.query || '') + (route.hash || '');
            }
          }
        } catch (e) {
          // ignore JSON parse errors
        }
      }

      if (intendedUrl && this.isValidRedirectUrl(intendedUrl)) {
        // Find and override redirect action
        const redirectAction = data.actions.find(a => a.type === 'redirect');
        if (redirectAction) {
          redirectAction.url = intendedUrl;
          sessionStorage.removeItem('intended_url');
          sessionStorage.removeItem('auth_intended_route');
        }
      }
    }

    // Process API response actions using ResponseHandler
    try {
      await ResponseHandler.process(data, {
        formId: instance.id,
        form: element,
        instance: instance
      });
    } catch (error) {
      console.error('FormManager: Error processing response actions', error);
    }

    // Show success message (if not handled by ResponseHandler actions)
    if (response.message && !(data && data.actions)) {
      if (config.showSuccessInline !== false) {
        FormError.showSuccess(response.message, element);
      }
      if (config.showSuccessInNotification !== false && window.NotificationManager) {
        NotificationManager.success(response.message);
      }
    }

    // Handle redirect (if not handled by ResponseHandler actions)
    if (!(data && data.actions && data.actions.some(a => a.type === 'redirect'))) {
      const redirectUrl = this.determineRedirectUrl(element, response, config);

      if (redirectUrl) {
        // Emit redirect start event
        this.emitEvent('redirect:start', {
          formId: instance.id,
          url: redirectUrl,
          delay: 1000
        });

        setTimeout(() => {
          this.performRedirect(redirectUrl);
        }, 1000);
      }
    }

    this.emitEvent('form:submitted', {
      formId: instance.id,
      response: response
    });
  },

  determineRedirectUrl(element, response, config) {
    // Check for intended URL first (for login forms or when explicitly requested)
    const isLoginForm = element.dataset.form === 'login';
    const shouldUseIntendedUrl = isLoginForm || element.dataset.useIntendedUrl === 'true';

    if (shouldUseIntendedUrl) {
      // Check hidden input, dataset, or sessionStorage
      let intendedUrl = element.querySelector('input[name="intended_url"]')?.value
        || element.dataset.redirectAfterLogin
        || sessionStorage.getItem('intended_url');

      // Also check auth_intended_route from sessionStorage
      if (!intendedUrl) {
        try {
          const stored = sessionStorage.getItem('auth_intended_route');
          if (stored) {
            const route = JSON.parse(stored);
            if (route && route.path) {
              intendedUrl = route.path + (route.query || '') + (route.hash || '');
            }
          }
        } catch (e) {
          // ignore JSON parse errors
        }
      }

      if (intendedUrl && this.isValidRedirectUrl(intendedUrl)) {
        sessionStorage.removeItem('intended_url');
        sessionStorage.removeItem('auth_intended_route');
        return intendedUrl;
      }
    }

    // Check response for redirect URL
    if (response.data?.redirectUrl || response.data?.redirect?.url) {
      const url = response.data.redirectUrl || response.data.redirect.url;
      return url;
    }

    // Check for role-based redirect
    if (response.data?.user?.role) {
      const role = response.data.user.role;
      const roleRedirect = element.dataset[`redirect${role.charAt(0).toUpperCase() + role.slice(1)}`];
      if (roleRedirect) {
        return roleRedirect;
      }
    }

    // Check for success-specific redirect first
    if (element.dataset.successRedirect) {
      return element.dataset.successRedirect;
    }

    // Fall back to general redirect
    if (element.dataset.redirect) {
      return element.dataset.redirect;
    }

    // Use config redirect (from extracted form config)
    if (config.successRedirect) {
      return config.successRedirect;
    }

    // Default redirect
    if (config.redirect) {
      return config.redirect;
    }

    return null;
  },

  isValidRedirectUrl(url) {
    if (!url || typeof url !== 'string') return false;

    try {

      if (url.startsWith('/') && !url.startsWith('//')) {
        return true;
      }

      const urlObj = new URL(url);
      return urlObj.origin === window.location.origin;
    } catch {
      return false;
    }
  },

  async handleFailedSubmit(instance, response) {
    const {element, config} = instance;

    // Process API response actions using ResponseHandler
    try {
      await ResponseHandler.process(response, {
        formId: instance.id,
        form: element,
        instance: instance
      });
    } catch (error) {
      console.error('FormManager: Error processing response actions', error);
    }

    // Show error message (if not handled by ResponseHandler actions)
    if (response.message && !response.actions) {
      if (config.showErrorsInline !== false) {
        FormError.showGeneralError(response.message, element);
      }

      if (config.showErrorsInNotification !== false && window.NotificationManager) {
        NotificationManager.error(response.message);
      }
    }

    // Show field errors (if not handled by ResponseHandler actions)
    if (response.errors && !response.actions) {
      const errorMessages = [];

      Object.entries(response.errors).forEach(([field, messages]) => {
        const message = Array.isArray(messages) ? messages[0] : messages;

        // Always highlight the field
        FormError.showFieldError(field, message, element);
        instance.state.errors[field] = message;

        // Collect error messages for notification
        errorMessages.push(message);
      });

      // Show all field errors in notification (combined)
      if (config.showErrorsInNotification !== false && window.NotificationManager && errorMessages.length > 0) {
        const combinedMessage = errorMessages.length === 1
          ? errorMessages[0]
          : errorMessages.map(m => `• ${m}`).join('\n');
        NotificationManager.error(combinedMessage);
      }
    }

    this.emitEvent('form:error', {
      formId: instance.id,
      response: response,
      errors: response.errors
    });
  },

  handleInvalidSubmit(instance) {
    if (window.NotificationManager) {
      // Show the first field's error message for better user experience
      const firstError = Object.values(instance.state.errors)[0];
      const message = firstError || Now.translate('Please correct the errors in the form before submitting');
      NotificationManager.error(message);
    }

    this.emitEvent('form:validation:failed', {
      formId: instance.id,
      errors: instance.state.errors
    });
  },

  handleSubmitError(instance, error) {
    if (window.NotificationManager) {
      NotificationManager.error(error.message || 'An unexpected error occurred');
    }

    ErrorManager.handle(error, {
      context: 'FormManager.submitForm',
      type: 'error:form',
      data: {
        formId: instance.id
      }
    });

    this.emitEvent('form:error', {
      formId: instance.id,
      error: error
    });
  },

  resetForm(instance) {
    const {element, elements} = instance;

    element.reset();

    FormError.clearAll();

    instance.state.errors = {};
    instance.state.valid = true;

    instance.state.data = {...instance.state.originalData};

    elements.forEach((field, name) => {
      if (Array.isArray(field)) {
        field.forEach(el => {
          el.classList.remove(instance.config.dirtyClass);
          el.classList.remove(instance.config.validClass);
          el.classList.remove(instance.config.invalidClass);
        });
      } else {
        field.classList.remove(instance.config.dirtyClass);
        field.classList.remove(instance.config.validClass);
        field.classList.remove(instance.config.invalidClass);
      }
    });

    this.emitEvent('form:reset', {
      formId: instance.id
    });
  },

  /**
   * Handle cascade when a field with data-cascade-source changes
   * @param {Object} instance - Form instance
   * @param {HTMLElement} sourceField - The field that triggered the cascade
   */
  async handleCascade(instance, sourceField) {
    const {element} = instance;
    const cascadeApi = element.dataset.cascadeApi;

    if (!cascadeApi) {
      console.warn('FormManager: data-cascade-api not found on form');
      return;
    }

    // Prevent cascade loop - check if we're already processing a cascade
    if (instance.state.cascading) return;

    try {
      // Mark as cascading to prevent loops
      instance.state.cascading = true;

      // Show loading state on source field
      sourceField.classList.add('loading');

      // Collect all fields with data-cascade-source
      const cascadeFields = Array.from(element.querySelectorAll('[data-cascade-source]'));

      // Build FormData with all cascade field values
      const formData = new FormData();
      cascadeFields.forEach(field => {
        const fieldName = field.name || field.id;
        const fieldValue = this.getFieldValue(field);
        if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
          formData.append(fieldName, fieldValue);
        }
      });

      // Add source parameter (which field triggered the change)
      const sourceName = sourceField.dataset.cascadeSource;
      formData.append('source', sourceName);

      // Call cascade API using framework's HTTP client (includes CSRF token)
      let response;
      if (window.ApiService && typeof window.ApiService.post === 'function') {
        response = await window.ApiService.post(cascadeApi, formData);
      } else if (window.simpleFetch && typeof window.simpleFetch.post === 'function') {
        response = await window.simpleFetch.post(cascadeApi, formData);
      } else {
        throw new Error('FormManager: No HTTP client available (ApiService or simpleFetch required)');
      }

      // Process response
      if (response && response.data) {
        this.processCascadeResponse(instance, response.data, sourceField);
      }

    } catch (error) {
      console.error('FormManager: Error handling cascade:', error);
    } finally {
      sourceField.classList.remove('loading');
      // Release cascade lock
      instance.state.cascading = false;
    }
  },

  /**
   * Process cascade API response
   * Format: {data: {...}, options: {...}}
   * @param {Object} instance - Form instance
   * @param {Object} responseData - Response data from cascade API
   * @param {HTMLElement} sourceField - The field that triggered the cascade (optional)
   */
  processCascadeResponse(instance, responseData, sourceField = null) {
    const {element} = instance;

    // Handle nested structure from API wrapper (e.g., {data: {data: {...}, options: {...}}})
    let actualData = responseData;
    if (responseData.data && responseData.data.data && responseData.data.options) {
      actualData = responseData.data;
    }

    // Process data fields (auto-fill)
    if (actualData.data) {
      Object.keys(actualData.data).forEach(fieldName => {
        const fieldValue = actualData.data[fieldName];

        // Find field by name or data-attr
        let field = element.querySelector(`[name="${fieldName}"]`);

        if (!field) {
          field = element.querySelector(`[data-attr*="${fieldName}"]`);
        }

        if (field) {
          // Use silent mode to prevent triggering cascade loop
          this.setFieldValue(field, fieldValue, true);
        } else {
          console.warn(`FormManager: Field "${fieldName}" not found in form`);
        }
      });
    }

    // Process options (populate selects)
    if (actualData.options) {
      Object.keys(actualData.options).forEach(optionsKey => {
        const optionsArray = actualData.options[optionsKey];

        // Find all fields with matching data-options-key
        const targetFields = element.querySelectorAll(`[data-options-key="${optionsKey}"]`);

        targetFields.forEach(field => {
          if (field.tagName === 'SELECT') {
            // Use appropriate factory based on select type
            if (field.multiple) {
              // For multiple selects, use MultiSelectElementFactory only
              MultiSelectElementFactory.updateOptions(field, optionsArray);
            } else {
              // For single selects, use SelectElementFactory only
              SelectElementFactory.updateOptions(field, optionsArray);
            }
          } else if (field.tagName === 'INPUT' && field.dataset.autocomplete) {
            // For autocomplete inputs, update via TextElementFactory if available
            const elementInstance = window.ElementManager?.getInstance(field);
            if (elementInstance && typeof elementInstance.updateOptions === 'function') {
              elementInstance.updateOptions(optionsArray);
            } else {
              // Store options in dataset for later use
              try {
                field.dataset.cachedOptions = JSON.stringify(optionsArray);
              } catch (e) {
                console.warn('FormManager: Failed to cache options for autocomplete', e);
              }
            }
          }
        });
      });
    }
  },

  /**
   * Fallback method to update select options manually
   * @param {HTMLSelectElement} select - Select element
   * @param {Array} options - Array of options
   */
  updateSelectOptions(select, options) {
    // Store current value
    const currentValue = select.value;
    const hasPlaceholder = select.querySelector('option[value=""]');

    // Clear options except placeholder
    if (hasPlaceholder) {
      const placeholderHTML = hasPlaceholder.outerHTML;
      select.innerHTML = placeholderHTML;
    } else {
      select.innerHTML = '';
    }

    // Add new options
    if (Array.isArray(options)) {
      options.forEach(opt => {
        const option = document.createElement('option');

        if (typeof opt === 'object') {
          option.value = opt.value || opt.id || '';
          option.textContent = opt.text || opt.label || opt.name || option.value;
        } else {
          option.value = opt;
          option.textContent = opt;
        }

        select.appendChild(option);
      });
    }

    // Restore value if still exists
    if (currentValue) {
      select.value = currentValue;
    }
  },

  // Cleanly destroy a form instance: remove from maps and perform any cleanup
  destroyForm(instance) {
    try {
      if (!instance) return;

      // Cleanup all form elements first
      if (instance.elements && window.ElementManager) {
        instance.elements.forEach((field, fieldName) => {
          if (Array.isArray(field)) {
            // Radio/checkbox groups
            field.forEach(f => {
              if (f.id) {
                try {
                  window.ElementManager.destroy(f.id);
                } catch (err) {
                  // Element might not be enhanced, ignore
                }
              }
            });
          } else {
            // Single field
            if (field.id) {
              try {
                window.ElementManager.destroy(field.id);
              } catch (err) {
                // Element might not be enhanced, ignore
              }
            }
          }
        });
      }

      // remove from elementIndex (WeakMap) and forms map
      try {this.state.elementIndex.delete(instance.element);} catch (e) {}
      try {this.state.forms.delete(instance.id);} catch (e) {}

      this.emitEvent('form:destroy', {formId: instance.id});
    } catch (e) {
      console.warn('FormManager.destroyForm error', e);
    }
  },

  // Determine whether an element should be enhanced by FormManager
  shouldEnhance(element) {
    if (!element) return false;
    // Opt-in only: must have data-form or data-element
    if (element.dataset && (element.dataset.form || element.dataset.element)) return true;
    return false;
  },

  // Destroy forms in a specific container
  destroyContainer(container) {
    if (!container) return;

    const forms = container.querySelectorAll('form');
    forms.forEach(form => {
      const instance = this.state.elementIndex.get(form);
      if (instance) {
        this.destroyForm(instance);
      }
    });
  },

  // Scan a container for forms (opt-in via data-form) and init them
  scan(container = document) {
    if (!container || !container.querySelectorAll) return [];
    const found = Array.from(container.querySelectorAll('form[data-form]'));
    found.forEach(f => {
      if (!this.state.elementIndex.has(f)) this.initForm(f);
    });
    return found;
  },

  // Destroy form by element reference (convenience wrapper)
  destroyFormByElement(el) {
    if (!el) return;
    const inst = this.state.elementIndex.get(el);
    if (inst) return this.destroyForm(inst);
    const id = el.dataset && el.dataset.form;
    if (id && this.state.forms.has(id)) this.destroyForm(this.state.forms.get(id));
  },

  // Start/stop observer control (wrappers around setup/stop functions)
  startObserver(root) {
    if (root) this.observerConfig.observeRoot = root;
    this.setupFormObserver();
  },

  stopObserver() {
    this._stopFormObserver && this._stopFormObserver();
  },

  // Setup a scoped, batched MutationObserver to auto-init/destroy forms when necessary.
  // This observer is selective: it only processes added/removed nodes that match
  // form[data-form] or contain such descendants. It batches processing to reduce CPU.
  setupFormObserver() {
    // If already created, do nothing
    if (this._formObserver) return;

    this._addedQueue = new Set();
    this._removedQueue = new Set();
    this._processTimeout = null;

    const processQueues = () => {
      // process removals first to avoid double-init on re-render
      if (this._removedQueue.size) {
        const removed = Array.from(this._removedQueue);
        this._removedQueue.clear();
        removed.forEach(node => {
          try {
            // direct lookup via WeakMap
            const inst = this.state.elementIndex.get(node);
            if (inst) {
              // if the instance element is no longer connected, destroy
              if (!inst.element.isConnected) this.destroyForm(inst);
            } else if (node.dataset && node.dataset.form) {
              const maybe = this.state.forms.get(node.dataset.form);
              if (maybe && !maybe.element.isConnected) this.destroyForm(maybe);
            }
          } catch (e) {
            console.warn('FormManager.process removed error', e);
          }
        });
      }

      if (this._addedQueue.size) {
        const added = Array.from(this._addedQueue);
        this._addedQueue.clear();
        added.forEach(node => {
          try {
            if (!node || node.nodeType !== 1) return;
            // Skip if node is not connected to DOM yet
            if (!node.isConnected) return;

            // if node itself is a form
            if (node.matches && node.matches('form[data-form]')) {
              // avoid double init
              if (!this.state.elementIndex.has(node)) this.initForm(node);
            } else if (node.querySelector) {
              const found = node.querySelectorAll('form[data-form]');
              found.forEach(f => {
                // Skip if form is not connected
                if (f.isConnected && !this.state.elementIndex.has(f)) this.initForm(f);
              });
            }
          } catch (e) {
            console.warn('FormManager.process added error', e);
          }
        });
      }

      // auto-stop observer if nothing to manage
      if (this.state.forms.size === 0) {
        this._stopFormObserver();
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.removedNodes && m.removedNodes.length) {
          for (const n of m.removedNodes) {
            if (!n || n.nodeType !== 1) continue;
            if (n.matches && n.matches('form[data-form]')) this._removedQueue.add(n);
            else if (n.querySelector) {
              const hit = n.querySelector('form[data-form]');
              if (hit) this._removedQueue.add(hit);
            }
          }
        }

        if (m.addedNodes && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (!n || n.nodeType !== 1) continue;
            if (n.matches && n.matches('form[data-form]')) this._addedQueue.add(n);
            else if (n.querySelector) {
              const hit = n.querySelector('form[data-form]');
              if (hit) this._addedQueue.add(hit);
            }
          }
        }
      }

      if (this._processTimeout) return;
      const delay = this.observerConfig?.observerDelay || 40;
      this._processTimeout = setTimeout(() => {
        this._processTimeout = null;
        processQueues();
      }, delay);
    });

    // choose root - prefer a managed mount point if available, else fallback to body
    const root = this.observerConfig?.observeRoot || document.body;
    observer.observe(root, {childList: true, subtree: true});

    this._formObserver = observer;
  },

  _stopFormObserver() {
    try {
      if (!this._formObserver) return;
      this._formObserver.disconnect();
      this._formObserver = null;
      this._addedQueue && this._addedQueue.clear();
      this._removedQueue && this._removedQueue.clear();
      if (this._processTimeout) {
        clearTimeout(this._processTimeout);
        this._processTimeout = null;
      }
    } catch (e) {
      console.warn('FormManager._stopFormObserver error', e);
    }
  },

  getInstance(id) {
    return this.state.forms.get(id);
  },

  getInstanceByElement(form) {
    for (const [id, instance] of this.state.forms.entries()) {
      if (instance.element === form) {
        return instance;
      }
    }

    if (form.dataset && form.dataset.form) {
      return this.state.forms.get(form.dataset.form);
    }

    return null;
  },

  emitEvent(eventName, data) {
    EventManager.emit(eventName, data);
  },

  destroy(formId) {
    const instance = this.state.forms.get(formId);
    if (!instance) return;

    instance.element.removeEventListener('submit', instance.handlers?.submit);
    instance.element.removeEventListener('reset', instance.handlers?.reset);
    instance.element.removeEventListener('change', instance.handlers?.change);
    instance.element.removeEventListener('input', instance.handlers?.input);
    instance.element.removeEventListener('blur', instance.handlers?.blur, true);

    clearTimeout(instance.resetTimeout);

    this.state.forms.delete(formId);

    this.emitEvent('form:destroy', {formId});
  },

  reset() {
    this.state.forms.forEach((instance, id) => {
      this.resetForm(instance);
    });
  },

  cleanup() {
    for (const [id] of this.state.forms) {
      this.destroy(id);
    }

    this.state.forms.clear();
    this.state.validators.clear();
    this.state.initialized = false;
  }
};

if (window.Now?.registerManager) {
  Now.registerManager('form', FormManager);
}

window.FormManager = FormManager;
