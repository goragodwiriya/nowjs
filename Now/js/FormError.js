class FormError {
  static config = {
    errorClass: 'invalid',
    errorMessageClass: 'error',
    autoFocus: true,
    autoScroll: true,
    scrollOffset: 100,
    debug: false,
    showErrorsInline: true,
    showErrorsInNotification: false,
    autoClearErrors: true,
    autoClearErrorsDelay: 5000,
    defaultErrorContainer: 'form-message',
    defaultSuccessContainer: 'form-message'
  };

  static state = {
    errors: new Map(),
    lastFocusedElement: null,
    originalMessages: new Map(),
    originalGeneralMessages: new Map(),
  };

  static configure(options = {}) {
    this.config = {
      ...this.config,
      ...options
    };
  }

  static getFormConfig(form) {
    const formInstance = FormManager.getInstanceByElement(form);
    if (formInstance) {
      return {
        ...this.config,
        ...formInstance.config
      };
    }
    return this.config;
  }

  static showSuccess(message, form = null, options = {}) {
    let config = this.config;
    let container = null;

    if (form instanceof HTMLElement) {
      config = this.getFormConfig(form);

      if (config.successContainer) {
        container = document.getElementById(config.successContainer);
      } else {
        container = form.querySelector('[data-success-container], .form-message, .success-message, .login-message');
      }
    } else if (typeof form === 'string') {
      container = document.getElementById(form);
    }

    if (!container) {
      container = document.getElementById(config.defaultSuccessContainer);
    }

    if (!container) return;

    const containerId = container.id || Utils.generateUUID();
    container.id = containerId;
    if (!this.state.originalGeneralMessages.get(containerId)) {
      // Store original content
      this.state.originalGeneralMessages.set(containerId, {
        html: container.innerHTML || '',
        className: container.className || ''
      });
    }

    container.textContent = Now.translate(message);
    container.classList.add('success');

    if (config.autoClearErrors && config.autoClearErrorsDelay > 0) {
      setTimeout(() => {
        // restore (clear) using container id
        this.clearGeneralError(containerId);
      }, config.autoClearErrorsDelay);
    }

    Now.emit('form:generalSuccess', {message, containerId, config});
  }

  static showGeneralError(message, form = null, options = {}) {
    let config = this.config;
    let container = null;

    if (form instanceof HTMLElement) {
      config = this.getFormConfig(form);

      if (config.errorContainer) {
        container = document.getElementById(config.errorContainer);
      } else {
        container = form.querySelector('[data-error-container], .form-message, .error-message, .login-message');
      }
    } else if (typeof form === 'string') {
      container = document.getElementById(form);
    }

    if (!container) {
      container = document.getElementById(config.defaultErrorContainer);
    }

    if (!container) return;

    const containerId = container.id || Utils.generateUUID();
    container.id = containerId;
    if (!this.state.originalGeneralMessages.get(containerId)) {
      // Store original content
      this.state.originalGeneralMessages.set(containerId, {
        html: container.innerHTML || '',
        className: container.className || ''
      });
    }

    const errorClass = config.errorMessageClass || 'error';
    container.classList.add(errorClass);
    container.textContent = Now.translate(message);

    if (config.autoClearErrors && config.autoClearErrorsDelay > 0) {
      setTimeout(() => {
        // restore (clear) using container id
        this.clearGeneralError(containerId);
      }, config.autoClearErrorsDelay);
    }

    Now.emit('form:generalError', {message, containerId, config});
  }

  static showFieldError(field, message, form = null, options = {}) {
    const element = document.getElementById(field) || document.querySelector(`[name="${field}"]`);
    if (!element) return;

    let config = this.config;
    if (form instanceof HTMLElement) {
      config = this.getFormConfig(form);
    }

    const messages = Array.isArray(message) ? message : [message];
    if (messages.length === 0) return;

    if (!this.state.errors.has(field)) {
      const comment = document.getElementById(`result_${field}`);
      if (comment && !this.state.originalMessages.has(field)) {
        this.state.originalMessages.set(field, comment.textContent);
      }
    }

    this.state.errors.set(field, {
      element,
      messages
    });

    element.classList.add(config.errorClass || 'invalid');
    element.container?.classList.add(config.errorClass || 'invalid');

    try {
      let formControlParent = null;
      if (element.parentElement && element.parentElement.classList && element.parentElement.classList.contains('form-control')) {
        formControlParent = element.parentElement;
      } else if (element.closest) {
        formControlParent = element.closest('.form-control');
      }

      if (formControlParent) {
        formControlParent.classList.add(config.errorClass || 'invalid');
      }
    } catch (e) {}

    const comment = document.getElementById(`result_${field}`);
    if (comment) {
      comment.textContent = messages[0];
      comment.classList.add(config.errorMessageClass || 'error');
    }

    element.setAttribute('aria-invalid', 'true');
    if (comment) {
      element.setAttribute('aria-errormessage', comment.id);
    }

    Now.emit('form:error', {field, messages, element, config});
  }

  static clearFieldError(field) {
    const element = typeof field === 'string'
      ? document.getElementById(field) || document.querySelector(`[name="${field}"]`)
      : field;

    if (!element) return;

    const elementId = element.id || element.name;

    // Always remove error styling, even if not tracked in state
    element.classList.remove(this.config.errorClass);
    element.container?.classList.remove(this.config.errorClass);

    try {
      let formControlParent = null;
      if (element.parentElement && element.parentElement.classList && element.parentElement.classList.contains('form-control')) {
        formControlParent = element.parentElement;
      } else if (element.closest) {
        formControlParent = element.closest('.form-control');
      }

      if (formControlParent) {
        formControlParent.classList.remove(this.config.errorClass);
      }
    } catch (e) {}

    const comment = document.getElementById(`result_${elementId}`);
    if (comment) {
      comment.classList.remove(this.config.errorMessageClass);
      // Only restore original message if we had stored one
      if (this.state.originalMessages.has(elementId)) {
        const originalMessage = this.state.originalMessages.get(elementId);
        comment.textContent = originalMessage;
        this.state.originalMessages.delete(elementId);
      }
    }

    element.removeAttribute('aria-invalid');
    element.removeAttribute('aria-errormessage');

    // Clean up state if error was tracked
    if (this.state.errors.has(elementId)) {
      this.state.errors.delete(elementId);
    }
    if (this.state.lastFocusedElement === element) {
      this.state.lastFocusedElement = null;
    }

    Now.emit('form:clearError', {field: elementId, element});
  }

  /**
   * Clear general error message
   * @param {string|HTMLElement} containerOrForm - Container ID, container element, or form element
   */
  static clearGeneralError(containerOrForm = null) {
    let container = null;
    let config = this.config;

    if (typeof containerOrForm === 'string') {
      container = document.getElementById(containerOrForm);
    } else if (containerOrForm instanceof HTMLElement) {
      if (containerOrForm.tagName === 'FORM') {
        config = this.getFormConfig(containerOrForm);

        if (config.errorContainer) {
          container = document.getElementById(config.errorContainer);
        }
      } else {
        container = document.getElementById(containerOrForm.id);
      }
    } else {
      container = document.getElementById(config.defaultErrorContainer);
    }

    if (!container) {
      const containers = document.querySelectorAll('[data-error-container], .form-message, .error-message, .login-message');
      if (containers.length > 0) {
        container = containers[0];
      }
    }

    if (!container) return false;

    const containerId = container.id || Utils.generateUUID();
    container.id = containerId;
    const original = this.state.originalGeneralMessages.get(containerId);
    if (original) {
      // Restore original content
      container.innerHTML = original.html || '';
      container.className = original.className || '';
    } else {
      // Store original content
      this.state.originalGeneralMessages.set(containerId, {
        html: container.innerHTML || '',
        className: container.className || ''
      });
    }

    container.classList.remove('show', 'visible', 'active');

    Now.emit('form:clearGeneralError', {containerId, config});

    return true;
  }

  /**
   * Clear success message (similar to clearGeneralError)
   * @param {string|HTMLElement} containerOrForm - Container ID, container element, or form element
   */
  static clearSuccess(containerOrForm = null) {
    let container = null;
    let config = this.config;

    if (typeof containerOrForm === 'string') {
      container = document.getElementById(containerOrForm);
    } else if (containerOrForm instanceof HTMLElement) {
      if (containerOrForm.tagName === 'FORM') {
        config = this.getFormConfig(containerOrForm);

        if (config.successContainer) {
          container = document.getElementById(config.successContainer);
        }
      } else {
        container = document.getElementById(containerOrForm.id);
      }
    } else {
      container = document.getElementById(config.defaultSuccessContainer);
    }

    if (!container) {
      const containers = document.querySelectorAll('[data-success-container], .form-message, .success-message, .login-message');
      if (containers.length > 0) {
        container = containers[0];
      }
    }

    if (!container) return false;

    const containerId = container.id || Utils.generateUUID();
    container.id = containerId;
    const original = this.state.originalGeneralMessages.get(containerId);
    if (original) {
      // Restore original content
      container.innerHTML = original.html || '';
      container.className = original.className || '';
    } else {
      // Store original content
      this.state.originalGeneralMessages.set(containerId, {
        html: container.innerHTML || '',
        className: container.className || ''
      });
    }

    container.classList.remove('show', 'visible', 'active');

    Now.emit('form:clearSuccess', {containerId, config});

    return true;
  }

  /**
   * Clear all messages (errors, success, and field errors)
   * @param {HTMLElement} form - Form element (optional)
   */
  static clearAll(form = null) {
    this.state.errors.forEach((error, field) => {
      this.clearFieldError(field);
    });
    this.state.lastFocusedElement = null;

    if (form instanceof HTMLElement) {
      this.clearGeneralError(form);
      this.clearSuccess(form);
    } else {
      this.clearGeneralError();
      this.clearSuccess();

      const allContainers = document.querySelectorAll('[data-error-container], [data-success-container], .form-message, .error-message, .success-message, .login-message');
      allContainers.forEach(container => {
        container.classList.remove('show', 'visible', 'active');
      });
    }

    Now.emit('form:clearAllErrors', {form});
  }

  /**
   * Clear all messages for a specific form
   * @param {HTMLElement|string} form - Form element or form ID
   */
  static clearFormMessages(form) {
    let formElement = form;

    if (typeof form === 'string') {
      formElement = document.getElementById(form) || document.querySelector(`[data-form="${form}"]`);
    }

    if (!formElement || formElement.tagName !== 'FORM') {
      console.warn('FormError.clearFormMessages: Invalid form element');
      return false;
    }

    const fields = formElement.querySelectorAll('[name], [id]');
    fields.forEach(field => {
      const fieldName = field.name || field.id;
      if (fieldName && this.state.errors.has(fieldName)) {
        this.clearFieldError(fieldName);
      }
    });

    this.clearGeneralError(formElement);
    this.clearSuccess(formElement);

    return true;
  }

  static showErrors(errors, options = {}) {
    this.clearAll();

    Object.entries(errors).forEach(([field, message], index) => {
      this.showFieldError(field, message, {
        focus: index === 0,
        scroll: index === 0,
        ...options
      });
    });

    Now.emit('form:errors', {errors});
  }

  static scrollToElement(element) {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;

    const visibleThreshold = rect.height * 0.3;
    const isPartiallyVisible =
      (rect.top + visibleThreshold >= 0 && rect.top < windowHeight) ||
      (rect.bottom > 0 && rect.bottom - visibleThreshold <= windowHeight);

    if (!isPartiallyVisible) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }

  static hasErrors() {
    return this.state.errors.size > 0;
  }

  static getErrors() {
    return Array.from(this.state.errors.entries()).map(([field, error]) => ({
      field,
      ...error
    }));
  }

  /**
   * Return number of current field errors
   */
  static getErrorsCount() {
    return this.state.errors.size;
  }

  static reset() {
    this.clearAll();
    this.state = {
      errors: new Map(),
      lastFocusedElement: null,
      originalMessages: new Map(),
      originalGeneralMessages: new Map()
    };
  }
}

window.FormError = FormError;
