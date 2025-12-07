/**
 * Sortable - Drag and drop sorting component
 *
 * @class Sortable
 * @description Enables drag-and-drop sorting for lists and grids with optional API integration
 *
 * @example
 * // HTML-based initialization
 * <div data-component="sortable" data-group="tasks">
 *   <div draggable="true" data-id="1">Item 1</div>
 *   <div draggable="true" data-id="2">Item 2</div>
 * </div>
 *
 * @example
 * // JavaScript initialization
 * const sortable = new Sortable(element, {
 *   draggable: '.item',
 *   handle: '.drag-handle',
 *   group: 'shared-group',
 *   onEnd: (evt) => console.log('Dropped', evt)
 * });
 */
class Sortable {
  /**
   * Create a Sortable instance
   * @param {HTMLElement} element - Container element for sortable items
   * @param {Object} options - Configuration options
   * @param {string} [options.draggable='[draggable="true"]'] - Selector for draggable items
   * @param {string} [options.handle=null] - Selector for drag handle (if null, entire item is draggable)
   * @param {number} [options.animation=150] - Animation duration in ms
   * @param {string} [options.ghostClass='sortable-ghost'] - CSS class for ghost element
   * @param {string} [options.dragClass='sortable-drag'] - CSS class for dragging element
   * @param {string} [options.dataIdAttr='data-id'] - Attribute name for item ID
   * @param {string} [options.group=null] - Group name for cross-container dragging
   * @param {string} [options.apiEndpoint] - API endpoint for auto-save
   * @param {string} [options.apiMethod='PUT'] - HTTP method for API calls
   * @param {string} [options.apiIdAttr='data-id'] - Attribute to read item ID from
   * @param {string} [options.apiStageAttr='data-category'] - Attribute to read category/stage from container
   * @param {string} [options.apiUpdateField='category'] - Field name to send in API payload
   * @param {Object} [options.apiExtraData] - Additional data to send with API requests
   * @param {Function} [options.onStart] - Callback when drag starts
   * @param {Function} [options.onEnd] - Callback when drag ends
   */
  constructor(element, options = {}) {
    this.element = element;

    // Read declarative API configuration from data attributes
    const apiEndpoint = element.dataset.sortableApi || element.dataset.apiEndpoint;
    const apiMethod = element.dataset.sortableMethod || element.dataset.apiMethod || 'PUT';
    const apiIdAttr = element.dataset.sortableIdAttr || 'data-id';
    const apiStageAttr = element.dataset.sortableStageAttr || 'data-category';
    const apiUpdateField = element.dataset.sortableUpdateField || 'category';
    const apiExtraData = element.dataset.sortableExtraData;

    this.options = {
      draggable: '[draggable="true"]',
      handle: null,
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      dataIdAttr: 'data-id',
      forceFallback: false,
      fallbackTolerance: 0,
      scroll: true,
      scrollSensitivity: 30,
      scrollSpeed: 10,
      rtl: document.dir === 'rtl',
      disabled: false,
      group: null, // Support cross-container drag with shared group name
      // Declarative API configuration
      apiEndpoint: apiEndpoint,
      apiMethod: apiMethod,
      apiIdAttr: apiIdAttr,
      apiStageAttr: apiStageAttr,
      apiUpdateField: apiUpdateField,
      apiExtraData: apiExtraData ? JSON.parse(apiExtraData) : null,
      ...options
    };

    this.state = {
      dragging: null,
      ghost: null,
      placeholder: null,
      initialIndex: -1,
      scrollInterval: null,
      dragStartEvent: null,
      sourceContainer: null
    };

    // Register to group if specified
    if (this.options.group) {
      if (!Sortable.groups) {
        Sortable.groups = {};
      }
      if (!Sortable.groups[this.options.group]) {
        Sortable.groups[this.options.group] = [];
      }
      Sortable.groups[this.options.group].push(this);
    }

    this.init();
  }

  init() {
    if (this.options.disabled) return;

    this.handlers = {
      dragStart: this.handleDragStart.bind(this),
      dragOver: this.handleDragOver.bind(this),
      dragEnd: this.handleDragEnd.bind(this),
      keyDown: this.handleKeyDown.bind(this)
    };

    this.addEventListeners();
  }

  addEventListeners() {
    const options = {passive: false};

    this.element.addEventListener('mousedown', this.handlers.dragStart);
    this.element.addEventListener('touchstart', this.handlers.dragStart, options);
    this.element.addEventListener('keydown', this.handlers.keyDown);

    if (this.options.scroll) {
      window.addEventListener('scroll', this.handleScroll.bind(this), {passive: true});
    }
  }

  handleDragStart(e) {
    try {
      if (this.options.disabled || (e.button !== undefined && e.button !== 0)) {
        return;
      }

      const dragEl = this.getDragElement(e);
      if (!dragEl) return;

      e.preventDefault();

      this.state.dragging = dragEl;
      this.state.initialIndex = this.getIndex(dragEl);
      this.state.dragStartEvent = e;
      this.state.sourceContainer = this.element;

      this.createGhost(dragEl, e);
      this.createPlaceholder(dragEl);

      dragEl.classList.add(this.options.dragClass);

      // Hide the original element while dragging
      dragEl.style.opacity = '0';

      document.addEventListener('mousemove', this.handlers.dragOver);
      document.addEventListener('touchmove', this.handlers.dragOver);
      document.addEventListener('mouseup', this.handlers.dragEnd);
      document.addEventListener('touchend', this.handlers.dragEnd);

      if (typeof this.options.onStart === 'function') {
        this.options.onStart({
          item: dragEl,
          startIndex: this.state.initialIndex,
          event: e
        });
      }

      this.dispatchEvent('start', {
        item: dragEl,
        startIndex: this.state.initialIndex
      });

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'Sortable.dragStart',
        type: 'error:sortable',
      });
      this.handleDragEnd();
    }
  }

  handleDragOver(e) {
    if (!this.state.dragging) return;
    e.preventDefault();

    requestAnimationFrame(() => {
      try {
        const point = e.touches ? e.touches[0] : e;

        this.moveGhost(point.pageX, point.pageY);

        if (this.options.scroll) {
          this.handleScrolling(point);
        }

        // Find target container and element
        const targetInfo = this.findTargetContainer(point.pageX, point.pageY);

        if (targetInfo && targetInfo.element && targetInfo.element !== this.state.dragging && targetInfo.element !== this.state.placeholder) {
          const targetContainer = targetInfo.container;
          const overEl = targetInfo.element;

          // Move placeholder (not the actual element) to show drop position
          const rect = overEl.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const isAfter = point.pageY > rect.top + scrollTop + (rect.height / 2);

          if (isAfter) {
            targetContainer.insertBefore(this.state.placeholder, overEl.nextSibling);
          } else {
            targetContainer.insertBefore(this.state.placeholder, overEl);
          }

        } else if (targetInfo && targetInfo.container && !targetInfo.element) {
          // Empty container - show placeholder at end
          const targetContainer = targetInfo.container;
          if (targetContainer.children.length === 0 || !targetContainer.contains(this.state.placeholder)) {
            targetContainer.appendChild(this.state.placeholder);
          }
        }

      } catch (error) {
        ErrorManager.handle(error, {
          context: 'Sortable.dragOver',
          type: 'error:sortable',
        });
        this.handleDragEnd();
      }
    });
  }

  handleDragEnd() {
    if (!this.state.dragging) return;

    try {
      const dragEl = this.state.dragging;
      const oldIndex = this.state.initialIndex;
      const sourceContainer = this.state.sourceContainer;

      // Move the actual element to where the placeholder is
      if (this.state.placeholder && this.state.placeholder.parentNode) {
        const targetContainer = this.state.placeholder.parentNode;
        targetContainer.insertBefore(dragEl, this.state.placeholder);

        // Restore original element visibility
        dragEl.style.opacity = '';

        const newIndex = this.getIndex(dragEl);

        // Remove placeholder
        this.state.placeholder.remove();
        this.state.placeholder = null;

        if (typeof this.options.onEnd === 'function') {
          this.options.onEnd({
            item: dragEl,
            newIndex,
            oldIndex,
            to: targetContainer,
            from: sourceContainer,
            event: this.state.dragStartEvent
          });
        }

        this.dispatchEvent('end', {
          item: dragEl,
          newIndex,
          oldIndex,
          to: targetContainer,
          from: sourceContainer
        });

        // Trigger auto-save if configured
        if (this.options.apiEndpoint && (newIndex !== oldIndex || targetContainer !== sourceContainer)) {
          this.autoSavePosition(dragEl, targetContainer);
        }
      } else {
        // No placeholder - restore visibility
        dragEl.style.opacity = '';
      }

      dragEl.classList.remove(this.options.dragClass);

      if (this.state.ghost) {
        this.state.ghost.remove();
        this.state.ghost = null;
      }

      if (this.state.scrollInterval) {
        clearInterval(this.state.scrollInterval);
      }

      document.removeEventListener('mousemove', this.handlers.dragOver);
      document.removeEventListener('touchmove', this.handlers.dragOver);
      document.removeEventListener('mouseup', this.handlers.dragEnd);
      document.removeEventListener('touchend', this.handlers.dragEnd);

      this.state = {
        dragging: null,
        ghost: null,
        placeholder: null,
        initialIndex: -1,
        scrollInterval: null,
        dragStartEvent: null,
        sourceContainer: null
      };

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'Sortable.dragEnd',
        type: 'error:sortable',
      });
    }
  }

  handleKeyDown(e) {
    if (this.options.disabled) return;

    const target = e.target;
    if (!target.matches(this.options.draggable)) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.moveElement(target, -1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.moveElement(target, 1);
        break;
      case 'Space':
        e.preventDefault();
        this.toggleSelection(target);
        break;
    }
  }

  handleScrolling(point) {
    const sensitivity = this.options.scrollSensitivity;
    const speed = this.options.scrollSpeed;

    const scrollTop = window.pageYOffset;
    let scrolling = false;
    let direction = 0;

    if (point.pageY - scrollTop < sensitivity) {
      direction = -1;
      scrolling = true;
    } else if ((window.innerHeight + scrollTop) - point.pageY < sensitivity) {
      direction = 1;
      scrolling = true;
    }

    if (scrolling && !this.state.scrollInterval) {
      this.state.scrollInterval = setInterval(() => {
        window.scrollBy(0, speed * direction);
      }, 16);
    } else if (!scrolling && this.state.scrollInterval) {
      clearInterval(this.state.scrollInterval);
      this.state.scrollInterval = null;
    }
  }

  handleScroll(e) {
    if (!this.state.dragging) return;

    const point = e.touches ? e.touches[0] : e;
    const sensitivity = this.options.scrollSensitivity;
    const speed = this.options.scrollSpeed;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;

    let scrolling = false;
    let direction = 0;

    const topDist = point.pageY - scrollTop;
    const bottomDist = windowHeight - (point.pageY - scrollTop);

    if (topDist < sensitivity) {
      direction = -1;
      scrolling = true;
    } else if (bottomDist < sensitivity) {
      direction = 1;
      scrolling = true;
    }

    if (scrolling && !this.state.scrollInterval) {
      this.state.scrollInterval = setInterval(() => {
        window.scrollBy({
          top: speed * direction,
          behavior: 'smooth'
        });

        if (this.state.ghost) {
          this.moveGhost(
            point.pageX,
            point.pageY + (speed * direction)
          );
        }
      }, 16);
    }
    else if (!scrolling && this.state.scrollInterval) {
      clearInterval(this.state.scrollInterval);
      this.state.scrollInterval = null;
    }
  }

  getDragElement(e) {
    const target = e.target;

    if (this.options.handle) {
      const handle = target.closest(this.options.handle);
      return handle ? handle.closest(this.options.draggable) : null;
    }

    return target.closest(this.options.draggable);
  }

  createGhost(dragEl, e) {
    const ghost = dragEl.cloneNode(true);
    ghost.classList.add(this.options.ghostClass);

    const rect = dragEl.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    // Handle touch events
    const pageX = e.pageX || (e.touches && e.touches[0] ? e.touches[0].pageX : 0);
    const pageY = e.pageY || (e.touches && e.touches[0] ? e.touches[0].pageY : 0);

    this.state.mouseOffset = {
      x: pageX - (rect.left + scrollLeft),
      y: pageY - (rect.top + scrollTop)
    };

    Object.assign(ghost.style, {
      position: 'absolute',
      top: (pageY - this.state.mouseOffset.y) + 'px',
      left: (pageX - this.state.mouseOffset.x) + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      zIndex: '9999',
      pointerEvents: 'none',
      transition: 'none', // Prevent "floating" effect from inherited transitions
      transform: 'none'   // Prevent inherited transforms
    });

    document.body.appendChild(ghost);
    this.state.ghost = ghost;
  }

  createPlaceholder(dragEl) {
    const placeholder = document.createElement('div');
    placeholder.className = 'sortable-placeholder';

    // Copy dimensions from dragged element
    const rect = dragEl.getBoundingClientRect();
    placeholder.style.height = rect.height + 'px';
    placeholder.style.width = rect.width + 'px';

    // Insert placeholder in place of dragged element
    dragEl.parentNode.insertBefore(placeholder, dragEl.nextSibling);

    this.state.placeholder = placeholder;
  }

  moveGhost(pageX, pageY) {
    // Capture state needed for animation frame
    const ghost = this.state.ghost;
    const mouseOffset = this.state.mouseOffset;

    if (!ghost || !mouseOffset) return;

    requestAnimationFrame(() => {
      // Re-check if ghost still exists and matches current state
      // This prevents animating a ghost that has been removed or replaced
      if (!ghost || ghost !== this.state.ghost) return;

      // pageX/pageY already include scroll, so we just subtract the mouse offset
      let left = pageX - mouseOffset.x;
      let top = pageY - mouseOffset.y;

      if (this.options.rtl) {
        left = window.innerWidth - left - ghost.offsetWidth;
      }

      Object.assign(ghost.style, {
        top: top + 'px',
        left: left + 'px'
      });
    });
  }

  findElementUnderPoint(x, y) {
    const elements = Array.from(this.element.querySelectorAll(this.options.draggable));

    for (const el of elements) {
      if (el === this.state.dragging) continue;

      const rect = el.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      if (x >= rect.left + scrollLeft &&
        x <= rect.right + scrollLeft &&
        y >= rect.top + scrollTop &&
        y <= rect.bottom + scrollTop) {
        return el;
      }
    }

    return null;
  }

  findTargetContainer(x, y) {
    // If no group, only check current container
    if (!this.options.group) {
      const element = this.findElementUnderPoint(x, y);
      return element ? {container: this.element, element} : null;
    }

    // Check all containers in the group
    const groupContainers = Sortable.groups[this.options.group] || [];

    for (const sortableInstance of groupContainers) {
      const container = sortableInstance.element;
      const rect = container.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      // Check if point is inside container
      if (x >= rect.left + scrollLeft &&
        x <= rect.right + scrollLeft &&
        y >= rect.top + scrollTop &&
        y <= rect.bottom + scrollTop) {

        // Find element inside this container
        const elements = Array.from(container.querySelectorAll(sortableInstance.options.draggable));

        for (const el of elements) {
          if (el === this.state.dragging) continue;

          const elRect = el.getBoundingClientRect();
          if (x >= elRect.left + scrollLeft &&
            x <= elRect.right + scrollLeft &&
            y >= elRect.top + scrollTop &&
            y <= elRect.bottom + scrollTop) {
            return {container, element: el};
          }
        }

        // Point is in container but not on any element (empty area)
        return {container, element: null};
      }
    }

    return null;
  }

  getIndex(el) {
    return Array.from(this.element.querySelectorAll(this.options.draggable))
      .indexOf(el);
  }

  swapElements(el1, el2) {
    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();

    el1.style.transition = 'none';
    el2.style.transition = 'none';

    el1.style.transform = `translate(${rect2.left - rect1.left}px, ${rect2.top - rect1.top}px)`;
    el2.style.transform = `translate(${rect1.left - rect2.left}px, ${rect1.top - rect2.top}px)`;

    requestAnimationFrame(() => {
      el1.style.transform = '';
      el2.style.transform = '';

      el1.style.transition = '';
      el2.style.transition = '';

      const next2 = el2.nextSibling;
      const parent2 = el2.parentNode;

      el1.parentNode.insertBefore(el2, el1);
      parent2.insertBefore(el1, next2);
    });
  }

  moveElement(el, direction) {
    const elements = Array.from(this.element.querySelectorAll(this.options.draggable));
    const index = elements.indexOf(el);
    const newIndex = index + direction;

    if (newIndex >= 0 && newIndex < elements.length) {
      const target = elements[newIndex];
      this.swapElements(el, target);

      el.focus();

      this.dispatchEvent('change', {
        item: el,
        newIndex,
        oldIndex: index
      });
    }
  }

  toggleSelection(el) {
    el.classList.toggle('selected');

    this.dispatchEvent('select', {
      item: el,
      selected: el.classList.contains('selected')
    });
  }

  dispatchEvent(name, detail) {
    this.element.dispatchEvent(new CustomEvent('sortable:' + name, {
      bubbles: true,
      cancelable: true,
      detail
    }));
  }

  /**
   * Auto-save position using declarative API configuration
   *
   * This method is called automatically when an item is dropped in a different container
   * and API integration is enabled via data-sortable-api attribute.
   *
   * @param {HTMLElement} draggedItem - The item that was dragged
   * @param {HTMLElement} targetContainer - The container where item was dropped
   *
   * @example
   * // HTML setup for API integration
   * <div data-component="sortable"
   *      data-sortable-api="/api/items/update"
   *      data-sortable-id-attr="data-id"
   *      data-sortable-stage-attr="data-status"
   *      data-sortable-update-field="status">
   *   <!-- Items will auto-save when moved -->
   * </div>
   */
  async autoSavePosition(draggedItem, targetContainer) {
    try {
      // Extract item ID
      const itemId = draggedItem.getAttribute(this.options.apiIdAttr);
      if (!itemId) {
        console.warn('Sortable: No ID found on dragged item', this.options.apiIdAttr);
        return;
      }

      // Extract new value (e.g., stage) from target container
      const newValue = targetContainer.getAttribute(this.options.apiStageAttr);
      if (!newValue) {
        console.warn('Sortable: No value found on target container', this.options.apiStageAttr);
        return;
      }

      // Build request payload
      const payload = {
        id: itemId,
        [this.options.apiUpdateField]: newValue,
        update_stage_only: true, // Flag for minimal update
        ...(this.options.apiExtraData || {})
      };

      // Send API request
      const response = await fetch(this.options.apiEndpoint, {
        method: this.options.apiMethod,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      // Handle response
      if (result.success) {
        // Show success notification if NotificationManager available
        if (window.NotificationManager) {
          NotificationManager.success('Status update complete');
        }

        // Dispatch success event
        this.dispatchEvent('api-success', {
          item: draggedItem,
          response: result,
          payload: payload
        });
      } else {
        throw new Error(result.message || 'API request failed');
      }

    } catch (error) {
      console.error('Sortable: Auto-save failed', error);

      // Show error notification if NotificationManager available
      if (window.NotificationManager) {
        NotificationManager.error('Status update failed');
      }

      // Dispatch error event
      this.dispatchEvent('api-error', {
        item: draggedItem,
        error: error
      });

      // Optionally handle with ErrorManager
      if (window.ErrorManager) {
        ErrorManager.handle(error, {
          context: 'Sortable.autoSavePosition',
          type: 'error:api'
        });
      }
    }
  }

  enable() {
    this.options.disabled = false;
  }

  disable() {
    this.options.disabled = true;

    if (this.state.dragging) {
      this.handleDragEnd();
    }
  }

  destroy() {
    this.element.removeEventListener('mousedown', this.handlers.dragStart);
    this.element.removeEventListener('touchstart', this.handlers.dragStart);
    this.element.removeEventListener('keydown', this.handlers.keyDown);

    if (this.options.scroll) {
      window.removeEventListener('scroll', this.handleScroll);
    }

    // Remove from group
    if (this.options.group && Sortable.groups[this.options.group]) {
      const index = Sortable.groups[this.options.group].indexOf(this);
      if (index > -1) {
        Sortable.groups[this.options.group].splice(index, 1);
      }
    }

    this.state = {
      dragging: null,
      ghost: null,
      placeholder: null,
      initialIndex: -1,
      scrollInterval: null,
      dragStartEvent: null,
      sourceContainer: null
    };

    this.element = null;
    this.options = null;
    this.handlers = null;
  }
}

// Static property for groups
Sortable.groups = {};

// Component state for managing instances
Sortable.state = {
  instances: new Map(),
  initialized: false,
  observer: null
};

/**
 * Initialize Sortable component - scan DOM and create instances
 * @param {Object} options - Global configuration options
 */
Sortable.init = function(options = {}) {
  if (this.state.initialized) return;

  // Initialize all existing sortable elements
  this.initElements();

  // Set up MutationObserver to auto-initialize new sortable elements
  this.setupGlobalObserver();

  this.state.initialized = true;
};

/**
 * Set up global MutationObserver to watch for new sortable elements
 * This automatically initializes Sortable on dynamically added elements
 */
Sortable.setupGlobalObserver = function() {
  // Don't set up multiple observers
  if (this.state.observer) return;

  this.state.observer = new MutationObserver((mutations) => {
    let hasNewSortables = false;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return; // Only element nodes

        // Check if the added node is a sortable container
        if (node.matches && node.matches('[data-component="sortable"]')) {
          hasNewSortables = true;
        }
        // Check if the added node contains sortable containers
        else if (node.querySelectorAll) {
          const sortables = node.querySelectorAll('[data-component="sortable"]');
          if (sortables.length > 0) {
            hasNewSortables = true;
          }
        }
      });
    });

    // Initialize new sortable containers
    if (hasNewSortables) {
      // Small delay to ensure DOM is stable
      setTimeout(() => {
        this.initElements();
      }, 50);
    }
  });

  // Observe the entire document for changes
  this.state.observer.observe(document.body, {
    childList: true,
    subtree: true
  });
};

/**
 * Initialize all elements with data-component="sortable"
 */
Sortable.initElements = function() {
  const elements = document.querySelectorAll('[data-component="sortable"]');

  elements.forEach(element => {
    if (!this.state.instances.has(element)) {
      this.create(element);
    }
  });
};

/**
 * Create a new Sortable instance
 * @param {HTMLElement} element - The sortable container element
 * @param {Object} options - Instance-specific options
 * @returns {Sortable} The sortable instance
 */
Sortable.create = function(element, options = {}) {
  if (!element) {
    console.error('[Sortable] Element is required');
    return null;
  }

  // Check if already initialized
  if (this.state.instances.has(element)) {
    return this.state.instances.get(element);
  }

  // Extract options from data attributes
  const dataOptions = {
    group: element.dataset.group,
    animation: parseInt(element.dataset.animation) || 150,
    draggable: element.dataset.draggable || '[draggable="true"]',
    handle: element.dataset.handle,
    ghostClass: element.dataset.ghostClass || 'sortable-ghost',
    chosenClass: element.dataset.chosenClass || 'sortable-chosen',
    dragClass: element.dataset.dragClass || 'sortable-drag',
    disabled: element.dataset.disabled === 'true',

    // API options
    apiUrl: element.dataset.apiUrl,
    apiMethod: element.dataset.apiMethod || 'POST',
    apiIdAttr: element.dataset.sortableIdAttr || 'data-id',
    apiStageAttr: element.dataset.sortableStageAttr || 'data-category',
    apiUpdateField: element.dataset.sortableUpdateField || 'category'
  };

  // Merge options: data attributes override passed options
  const mergedOptions = {...options, ...dataOptions};

  // Create new Sortable instance
  const instance = new Sortable(element, mergedOptions);

  // Store instance
  this.state.instances.set(element, instance);
  element._sortableInstance = instance;

  return instance;
};

/**
 * Get instance from element
 * @param {HTMLElement} element - The sortable container element
 * @returns {Sortable|null} The sortable instance or null
 */
Sortable.getInstance = function(element) {
  return this.state.instances.get(element) || null;
};

/**
 * Destroy all instances
 */
Sortable.destroyAll = function() {
  this.state.instances.forEach((instance, element) => {
    instance.destroy();
  });
  this.state.instances.clear();
  this.state.initialized = false;
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    Sortable.init();
  });
} else {
  // DOM already loaded, initialize immediately
  Sortable.init();
}

// Expose globally
window.Sortable = Sortable;
