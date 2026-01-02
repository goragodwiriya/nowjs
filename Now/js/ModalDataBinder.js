/**
 * ModalDataBinder
 * Extends Modal functionality with data binding from template loops
 *
 * Features:
 * - Bind dynamic data to modal elements
 * - Support for data-modal-bind attribute
 * - Gallery mode with prev/next navigation
 * - Safe content sanitization
 * - Works with TemplateManager
 *
 * @requires Modal
 * @requires DialogManager
 */
const ModalDataBinder = {
  config: {
    galleryClass: 'modal-gallery',
    bindAttribute: 'data-modal-bind',
    targetAttribute: 'data-modal-target',
    contentAttribute: 'data-gallery-content', // Mark which element should animate
    sanitize: true,
    defaultEffect: 'fade',
    effectDuration: 300,
    swipeThreshold: 50 // Minimum swipe distance in pixels
  },

  state: {
    initialized: false,
    modalInstances: new Map(), // modalId => Modal instance
    galleryData: new Map()      // modalId => gallery config
  },

  /**
   * Initialize ModalDataBinder
   */
  init() {
    if (this.state.initialized) return;

    this.bindModalTriggers();
    this.bindGalleryNavigation();
    this.bindTouchNavigation();
    this.state.initialized = true;
  },

  /**
   * Bind modal trigger elements
   */
  bindModalTriggers() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-modal]');
      if (!trigger) return;

      e.preventDefault();
      this.handleModalTrigger(trigger);
    });
  },

  /**
   * Bind gallery navigation
   */
  bindGalleryNavigation() {
    document.addEventListener('click', (e) => {
      const navBtn = e.target.closest('[data-modal-nav]');
      if (!navBtn) return;

      e.preventDefault();
      const direction = navBtn.dataset.modalNav;
      const modal = navBtn.closest('.modal');

      if (modal && direction) {
        this.navigateGallery(modal.id, direction);
      }
    });
  },

  /**
   * Bind touch/swipe navigation for galleries
   */
  bindTouchNavigation() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let currentModal = null;

    document.addEventListener('touchstart', (e) => {
      const modal = e.target.closest('.modal.show');
      if (!modal) return;

      // Only enable swipe for galleries
      if (!this.state.galleryData.has(modal.id)) return;

      currentModal = modal;
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, {passive: true});

    document.addEventListener('touchend', (e) => {
      if (!currentModal) return;

      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;

      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Check if horizontal swipe is dominant
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.config.swipeThreshold) {
        if (deltaX < 0) {
          // Swipe left = next
          this.navigateGallery(currentModal.id, 'next');
        } else {
          // Swipe right = prev
          this.navigateGallery(currentModal.id, 'prev');
        }
      }

      currentModal = null;
    }, {passive: true});
  },

  /**
   * Handle modal trigger click
   */
  handleModalTrigger(trigger) {
    const modalId = trigger.dataset.modal;
    if (!modalId) return;

    // Parse bind data
    const bindData = this.parseBindData(trigger.dataset.modalBind);

    // Evaluate expressions in current context
    const data = this.evaluateBindData(bindData, trigger);

    // Check if gallery mode
    const isGallery = trigger.dataset.modalGallery === 'true';

    if (isGallery) {
      this.setupGallery(modalId, trigger, data);
    }

    // Open modal with data
    this.openModalWithData(modalId, data, {
      gallery: isGallery,
      trigger
    });
  },

  /**
   * Parse bind data string
   */
  parseBindData(bindStr) {
    if (!bindStr) return {};

    const pairs = bindStr.split(',').map(s => s.trim());
    const data = {};

    pairs.forEach(pair => {
      const [key, expr] = pair.split(':').map(s => s.trim());
      if (key && expr) {
        data[key] = expr;
      }
    });

    return data;
  },

  /**
   * Evaluate bind data expressions
   */
  evaluateBindData(bindData, trigger) {
    const result = {};

    // Find template context (data-for loop)
    const templateContext = this.findTemplateContext(trigger);

    for (const [key, expr] of Object.entries(bindData)) {
      try {
        const value = this.evaluateExpression(expr, templateContext, trigger);
        result[key] = value;
      } catch (error) {
        result[key] = '';
      }
    }

    return result;
  },

  /**
   * Find template context for element
   */
  findTemplateContext(element) {
    // Look for closest element with data attributes from template
    let current = element;

    while (current && current !== document.body) {
      // Check if element has data attributes that look like template bindings
      const dataset = current.dataset;

      // Common template data attributes
      if (dataset.category || dataset.title || dataset.id || dataset.index) {
        return current;
      }

      current = current.parentElement;
    }

    return element;
  },

  /**
   * Evaluate expression in context
   */
  evaluateExpression(expr, context, trigger) {
    // Handle special variables
    if (expr === '$index') {
      return this.getElementIndex(context);
    }

    if (expr === '$item') {
      return context.dataset;
    }

    // Handle simple data attribute access: item.property
    if (expr.startsWith('item.')) {
      const prop = expr.substring(5); // Remove 'item.'
      const attrName = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      return context.dataset[prop] || context.getAttribute(`data-${attrName}`) || '';
    }

    // Handle direct values
    if (expr.startsWith('"') || expr.startsWith("'")) {
      return expr.slice(1, -1);
    }

    // Try to get from dataset
    const value = context.dataset[expr] || context.getAttribute(`data-${expr}`);
    if (value !== null) {
      return value;
    }

    // Return as-is if can't evaluate
    return expr;
  },

  /**
   * Get element index in parent
   */
  getElementIndex(element) {
    if (!element.parentElement) return 0;

    const siblings = Array.from(element.parentElement.children);
    return siblings.indexOf(element);
  },

  /**
   * Setup gallery mode
   */
  setupGallery(modalId, trigger, data) {
    // Find all gallery items in same container
    const container = trigger.closest('[data-for]')?.parentElement || trigger.parentElement;
    const items = Array.from(container.querySelectorAll('[data-modal="' + modalId + '"]'));

    const currentIndex = items.indexOf(trigger);

    this.state.galleryData.set(modalId, {
      items,
      currentIndex,
      loop: trigger.dataset.modalGalleryLoop !== 'false',
      effect: trigger.dataset.modalEffect || this.config.defaultEffect
    });
  },

  /**
   * Navigate gallery
   */
  navigateGallery(modalId, direction) {
    const gallery = this.state.galleryData.get(modalId);
    if (!gallery) return;

    const {items, currentIndex, loop, effect} = gallery;
    let newIndex = currentIndex;

    if (direction === 'prev') {
      newIndex = currentIndex - 1;
      if (newIndex < 0) {
        newIndex = loop ? items.length - 1 : 0;
      }
    } else if (direction === 'next') {
      newIndex = currentIndex + 1;
      if (newIndex >= items.length) {
        newIndex = loop ? 0 : items.length - 1;
      }
    }

    if (newIndex !== currentIndex) {
      gallery.currentIndex = newIndex;
      const trigger = items[newIndex];

      // Get new data
      const bindData = this.parseBindData(trigger.dataset.modalBind);
      const data = this.evaluateBindData(bindData, trigger);

      // Apply transition effect
      this.applyGalleryEffect(modalId, data, effect, direction);
    }
  },

  /**
   * Apply gallery transition effect
   * @param {string} modalId Modal ID
   * @param {Object} data New data to display
   * @param {string} effect Effect type (fade, slide-left, slide-right, slide-up, slide-down, zoom)
   * @param {string} direction Navigation direction (prev, next)
   */
  applyGalleryEffect(modalId, data, effect, direction) {
    const modalRef = this.state.modalInstances.get(modalId);
    if (!modalRef) return;

    const modalElement = modalRef.isPreExisting ? modalRef.element : modalRef.modal;
    if (!modalElement) return;

    // Find the content element to animate (not the whole modal)
    // Priority: 1. [data-gallery-content] 2. .lightbox-body 3. .modal-body 4. first data-modal-target img
    let content = modalElement.querySelector(`[${this.config.contentAttribute}]`);
    if (!content) {
      content = modalElement.querySelector('.lightbox-body, .modal-body');
    }
    if (!content) {
      // Fallback: find the first image with data-modal-target
      content = modalElement.querySelector('img[data-modal-target]');
    }
    if (!content) {
      // No content wrapper, just update data
      this.updateModalData(modalId, data);
      return;
    }

    // Determine animation classes based on effect and direction
    let exitClass, enterClass;

    switch (effect) {
      case 'slide':
      case 'slide-horizontal':
        exitClass = direction === 'next' ? 'gallery-slide-out-left' : 'gallery-slide-out-right';
        enterClass = direction === 'next' ? 'gallery-slide-in-right' : 'gallery-slide-in-left';
        break;
      case 'slide-left':
        exitClass = 'gallery-slide-out-left';
        enterClass = 'gallery-slide-in-left';
        break;
      case 'slide-right':
        exitClass = 'gallery-slide-out-right';
        enterClass = 'gallery-slide-in-right';
        break;
      case 'slide-up':
      case 'slide-vertical':
        exitClass = direction === 'next' ? 'gallery-slide-out-up' : 'gallery-slide-out-down';
        enterClass = direction === 'next' ? 'gallery-slide-in-up' : 'gallery-slide-in-down';
        break;
      case 'slide-down':
        exitClass = 'gallery-slide-out-down';
        enterClass = 'gallery-slide-in-down';
        break;
      case 'zoom':
        exitClass = 'gallery-zoom-out';
        enterClass = 'gallery-zoom-in';
        break;
      case 'fade':
      default:
        exitClass = 'gallery-fade-out';
        enterClass = 'gallery-fade-in';
        break;
    }

    // Apply exit animation
    content.classList.add(exitClass);

    // Wait for exit animation to complete
    setTimeout(() => {
      content.classList.remove(exitClass);

      // Update data
      this.updateModalData(modalId, data);

      // Apply enter animation
      content.classList.add(enterClass);

      // Clean up enter animation
      setTimeout(() => {
        content.classList.remove(enterClass);
      }, this.config.effectDuration);
    }, this.config.effectDuration / 2);
  },

  /**
   * Open modal with data
   */
  openModalWithData(modalId, data, options = {}) {
    const modalElement = document.getElementById(modalId);
    if (!modalElement) {
      console.warn(`Modal element with id "${modalId}" not found`);
      return;
    }

    // Check if this is a pre-existing modal element (has modal class already)
    const isPreExistingModal = modalElement.classList.contains('modal');

    if (isPreExistingModal) {
      // Bind data directly to the existing modal
      this._bindDataToElement(modalElement, data);

      // Show the modal using simple class toggle
      this._showPreExistingModal(modalElement);

      // Store reference
      this.state.modalInstances.set(modalId, {element: modalElement, isPreExisting: true});
    } else {
      // Get or create Modal instance for dynamic modals
      let modal = this.state.modalInstances.get(modalId);

      if (!modal || modal.isPreExisting) {
        // Extract existing content if any
        const existingContent = modalElement.innerHTML;
        const existingTitle = modalElement.querySelector('.modal-title')?.textContent || '';

        // Remove existing element
        modalElement.remove();

        // Create Modal instance
        modal = new Modal({
          id: modalId,
          title: existingTitle,
          content: existingContent,
          closeButton: true,
          backdrop: true,
          keyboard: true,
          animation: true
        });

        // Store instance
        this.state.modalInstances.set(modalId, modal);
      }

      // Bind data to modal
      modal.bindData(data);

      // Show modal
      modal.show();
    }
  },

  /**
   * Bind data to a modal element (for pre-existing modals)
   * @private
   */
  _bindDataToElement(modalElement, data) {
    for (const [key, value] of Object.entries(data)) {
      const targets = modalElement.querySelectorAll(`[${this.config.targetAttribute}="${key}"]`);
      targets.forEach(target => {
        this._setElementContent(target, value, key);
      });
    }
  },

  /**
   * Set element content (for pre-existing modals)
   * @private
   */
  _setElementContent(element, value, key) {
    const tagName = element.tagName.toLowerCase();

    // Image elements
    if (tagName === 'img') {
      element.src = value || '';
      if (!element.alt) element.alt = key;
      return;
    }

    // Link elements
    if (tagName === 'a') {
      element.href = value || '#';
      return;
    }

    // Input elements
    if (tagName === 'input' || tagName === 'textarea') {
      element.value = value || '';
      return;
    }

    // Default: set text content
    element.textContent = value || '';
  },

  /**
   * Show pre-existing modal element
   * @private
   */
  _showPreExistingModal(modalElement) {
    // Initialize events if not already done
    if (!modalElement.dataset.modalInitialized) {
      this._bindPreExistingModalEvents(modalElement);
      modalElement.dataset.modalInitialized = 'true';
    }

    // Show backdrop
    if (window.BackdropManager) {
      modalElement._backdropId = BackdropManager.show(() => this.closeModal(modalElement.id), {
        zIndex: 1040
      });
    }

    // Show modal
    modalElement.classList.add('show');
    modalElement.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    // Focus management
    requestAnimationFrame(() => {
      const focusable = modalElement.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable) {
        focusable.focus();
      }
    });
  },

  /**
   * Bind events for pre-existing modal
   * @private
   */
  _bindPreExistingModalEvents(modalElement) {
    // Close buttons
    const closeBtns = modalElement.querySelectorAll('.modal-close, [data-close], [data-dismiss="modal"]');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeModal(modalElement.id);
      });
    });

    // Backdrop click
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        this.closeModal(modalElement.id);
      }
    });

    // ESC key
    const escHandler = (e) => {
      if (e.key === 'Escape' && modalElement.classList.contains('show')) {
        this.closeModal(modalElement.id);
      }
    };
    document.addEventListener('keydown', escHandler);
    modalElement._escHandler = escHandler;
  },



  /**
   * Update modal data
   */
  updateModalData(modalId, data) {
    const modalRef = this.state.modalInstances.get(modalId);
    if (!modalRef) {
      console.warn(`Modal "${modalId}" not found`);
      return;
    }

    if (modalRef.isPreExisting) {
      // Update pre-existing modal element
      this._bindDataToElement(modalRef.element, data);
    } else {
      // Update Modal instance
      modalRef.updateData(data);
    }
  },



  /**
   * Close modal
   */
  closeModal(modalId) {
    const modalRef = this.state.modalInstances.get(modalId);

    if (modalRef) {
      if (modalRef.isPreExisting) {
        // Hide pre-existing modal element
        const modalElement = modalRef.element;

        // Hide backdrop
        if (modalElement._backdropId && window.BackdropManager) {
          BackdropManager.hide(modalElement._backdropId);
          modalElement._backdropId = null;
        }

        // Hide modal
        modalElement.classList.remove('show');
        modalElement.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
      } else {
        // Hide Modal instance
        modalRef.hide();
      }
    }

    // Clean up gallery data
    this.state.galleryData.delete(modalId);
  },

  /**
   * Get modal data
   */
  getModalData(modalId) {
    const modalRef = this.state.modalInstances.get(modalId);
    if (!modalRef) return null;

    if (modalRef.isPreExisting) {
      // For pre-existing modals, we don't track data
      return null;
    }

    return modalRef.getData();
  },

  /**
   * Destroy binder
   */
  destroy() {
    // Destroy all modal instances
    this.state.modalInstances.forEach(modal => modal.destroy());
    this.state.modalInstances.clear();
    this.state.galleryData.clear();
    this.state.initialized = false;
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ModalDataBinder.init());
} else {
  ModalDataBinder.init();
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModalDataBinder;
}
