/**
 * Helper functions for managing reactive updates and cleanup
 */
const ReactiveHelpers = {
  /**
   * Setup reactive update for an element
   * @param {HTMLElement} el - Target element
   * @param {Object} context - Component context
   * @param {string} updateType - Type of update (e.g., 'text', 'html', 'for')
   * @param {Function} updateFn - Update function to run
   */
  setupReactiveUpdate(el, context, updateType, updateFn) {
    if (!el || !context || !updateType || !updateFn) return;
    if (typeof updateFn !== 'function') {
      console.error(`Invalid update function for ${updateType}`);
      return;
    }

    // Remove existing update if any
    this.cleanupReactiveUpdate(el, updateType);

    if (context.reactive && context._updateQueue) {
      el[`_has${updateType}Update`] = true;

      const wrappedUpdate = async () => {
        try {
          await updateFn();
        } catch (error) {
          console.error(`Error in reactive update (${updateType}):`, error);
          EventManager.emit('reactive:error', {
            type: updateType,
            element: el,
            error
          });
        }
      };

      // Store reference to wrapped update for cleanup
      el[`_${updateType}UpdateFn`] = wrappedUpdate;
      context._updateQueue.add(wrappedUpdate);
    }
  },

  /**
   * Clean up reactive update for an element
   * @param {HTMLElement} el - Target element
   * @param {string} updateType - Type of update to clean
   */
  cleanupReactiveUpdate(el, updateType) {
    if (!el || !updateType) return;

    const updateKey = `_has${updateType}Update`;
    const updateFnKey = `_${updateType}UpdateFn`;

    if (el[updateKey]) {
      // Remove from update queue if exists
      if (el[updateFnKey] && el._context?._updateQueue) {
        el._context._updateQueue.delete(el[updateFnKey]);
      }
      delete el[updateKey];
      delete el[updateFnKey];
    }
  },

  /**
   * Clean up all reactive updates for an element
   * @param {HTMLElement} el - Target element
   */
  cleanupAllReactiveUpdates(el) {
    if (!el) return;

    // Find and remove all reactive update flags
    Object.keys(el).forEach(key => {
      if (key.startsWith('_has') && key.endsWith('Update')) {
        delete el[key];
      }
    });
  }
};

// Add to TemplateManager
Object.assign(TemplateManager, ReactiveHelpers);
