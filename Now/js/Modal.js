/**
 * Modal Component
 * A reusable modal dialog component
 *
 * Features:
 * - Show/hide with animation
 * - Custom header, body and footer
 * - Close button
 * - Event handling
 * - Backdrop click to close
 * - ESC key to close
 * - Focus trap
 * - Accessibility
 *
 * @requires DialogManager
 */
class Modal {
  /**
   * Create modal instance
   * @param {Object} options Modal options
   */
  constructor(options = {}) {
    this.options = {
      id: null, // Modal ID
      title: '', // Modal title
      content: '', // Modal content
      width: 'auto',
      maxWidth: '90%',
      height: 'auto',
      maxHeight: '90vh',
      closeButton: true,
      animation: true,
      backdrop: true,
      keyboard: true,
      focus: true,
      className: '',
      onShow: null,
      onShown: null,
      onHide: null,
      onHidden: null,
      backdropOpacity: 0.5,
      backdropColor: 'rgba(0,0,0,0.5)',
      ...options
    };

    this.id = this.options.id || 'modal_' + Math.random().toString(36).substr(2, 9);
    this.backdropId = null; // Store backdrop ID
    this.visible = false;
    this.createModal();
    this.bindEvents();
  }

  /**
   * Create modal DOM structure
   * @private
   */
  createModal() {
    // Create modal elements
    this.modal = document.createElement('div');
    this.modal.id = this.id;
    this.modal.className = `modal ${this.options.className}`.trim();
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-hidden', 'true');
    this.modal.inert = true; // Initially inert (prevent focus and interactions)

    // Modal dialog
    this.dialog = document.createElement('div');
    this.dialog.className = 'modal-dialog';
    this.dialog.style.width = this.options.width;
    this.dialog.style.maxWidth = this.options.maxWidth;
    this.dialog.style.height = this.options.height;
    this.dialog.style.maxHeight = this.options.maxHeight;

    // Modal header
    if (this.options.title) {
      this.header = document.createElement('div');
      this.header.className = 'modal-header';
      this.header.innerHTML = `
        <h4 class="modal-title">${this.options.title}</h4>
        ${this.options.closeButton ? '<button type="button" class="modal-close" aria-label="Close">&times;</button>' : ''}
      `;
      this.dialog.appendChild(this.header);
    }

    // Modal body
    this.body = document.createElement('div');
    this.body.className = 'modal-body';
    this.body.innerHTML = this.options.content;
    this.dialog.appendChild(this.body);

    // Add dialog to modal
    this.modal.appendChild(this.dialog);

    // Add to document
    document.body.appendChild(this.modal);
  }

  /**
   * Bind modal events
   * @private
   */
  bindEvents() {
    // Close button click
    if (this.options.closeButton) {
      const closeBtn = this.modal.querySelector('.modal-close');
      closeBtn?.addEventListener('click', () => this.hide());
    }

    // Backdrop click
    if (this.options.backdrop) {
      this.backdrop?.addEventListener('click', () => this.hide());
    }

    // ESC key
    if (this.options.keyboard) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.visible) {
          this.hide();
        }
      });
    }

    // Focus trap
    if (this.options.focus) {
      this.modal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          const focusable = this.modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          const firstFocusable = focusable[0];
          const lastFocusable = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
              lastFocusable.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastFocusable) {
              firstFocusable.focus();
              e.preventDefault();
            }
          }
        }
      });
    }
  }

  /**
   * Show modal
   */
  show() {
    if (this.visible) return;

    // Show backdrop first
    this.backdropId = BackdropManager.show(() => {
      // Close on backdrop click if enabled
      if (this.options.backdrop) {
        this.hide();
      }
    }, {
      opacity: this.options.backdropOpacity,
      background: this.options.backdropColor
    });

    // Call onShow callback
    if (typeof this.options.onShow === 'function') {
      this.options.onShow.call(this);
    }

    // Show modal and remove inert
    this.modal.setAttribute('aria-hidden', 'false');
    this.modal.inert = false; // Allow interactions
    document.body.classList.add('modal-open');

    if (this.options.animation) {
      this.modal.classList.add('fade-in');
      setTimeout(() => {
        this.modal.classList.add('show');

        // Call onShown callback
        if (typeof this.options.onShown === 'function') {
          this.options.onShown.call(this);
        }
      }, 150);
    } else {
      this.modal.classList.add('show');
      if (typeof this.options.onShown === 'function') {
        this.options.onShown.call(this);
      }
    }

    this.visible = true;

    // Focus first focusable element
    if (this.options.focus) {
      const focusable = this.modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }
  }

  /**
   * Hide modal
   */
  hide() {
    if (!this.visible) return;

    // Hide backdrop
    if (this.backdropId !== null) {
      BackdropManager.hide(this.backdropId);
      this.backdropId = null;
    }

    // Call onHide callback
    if (typeof this.options.onHide === 'function') {
      this.options.onHide.call(this);
    }

    // Remove focus from any element inside modal before hiding
    const focusedElement = this.modal.querySelector(':focus');
    if (focusedElement) {
      focusedElement.blur();
    }

    // Hide modal and make it inert
    this.modal.setAttribute('aria-hidden', 'true');
    this.modal.inert = true; // Prevent all interactions
    document.body.classList.remove('modal-open');

    if (this.options.animation) {
      this.modal.classList.remove('fade-in');
      this.modal.classList.add('fade-out');
    } else {
      this.modal.classList.remove('show');
      if (typeof this.options.onHidden === 'function') {
        this.options.onHidden.call(this);
      }
    }

    this.visible = false;

    // Cleanup elements and clear content after hide animation
    setTimeout(() => {
      this._cleanupModalElements();
      this.body.innerHTML = '';

      if (this.options.animation) {
        this.modal.classList.remove('show', 'fade-out');

        // Call onHidden callback
        if (typeof this.options.onHidden === 'function') {
          this.options.onHidden.call(this);
        }
      }
    }, 150);
  }

  /**
   * Cleanup modal elements before clearing content
   * @private
   */
  _cleanupModalElements() {
    // Phase 1: Cleanup forms (form will cleanup its elements)
    if (window.FormManager && typeof window.FormManager.destroyContainer === 'function') {
      window.FormManager.destroyContainer(this.body);
    }

    // Phase 2: Cleanup any standalone elements (not in forms)
    if (window.ElementManager && typeof window.ElementManager.destroyContainer === 'function') {
      window.ElementManager.destroyContainer(this.body);
    }
  }

  /**
   * Update modal content
   * @param {string} content New content
   */
  setContent(content) {
    // Cleanup existing elements only if there's existing content
    if (this.body.children.length > 0) {
      this._cleanupModalElements();
      this.body.innerHTML = '';
    }

    // Handle different content types
    if (content instanceof DocumentFragment) {
      // DocumentFragment: append it directly
      this.body.appendChild(content);
    } else if (content instanceof Node) {
      // DOM Node: append it directly
      this.body.appendChild(content);
    } else {
      // String: set as innerHTML
      this.body.innerHTML = content;
    }
  }

  /**
   * Update modal title
   * @param {string} title New title
   */
  setTitle(title) {
    const titleEl = this.modal.querySelector('.modal-title');
    if (titleEl) {
      titleEl.innerHTML = title;
    }
  }

  /**
   * Remove modal from DOM
   */
  destroy() {
    this.modal.remove();
  }
}

// Register with framework
if (window.Now?.registerManager) {
  Now.registerManager('modal', Modal);
}

// Make globally available
window.Modal = Modal;
