/**
 * Animation Management System
 * Handles CSS animations and transitions with JavaScript control
 *
 * Features:
 * - Predefined animations (fade, slide, scale etc)
 * - Custom animation support
 * - Animation queueing and chaining
 * - Performance optimization
 * - Cross-browser compatibility
 * - Cleanup and memory management
 */
const AnimationManager = {
  /**
   * Configuration
   */
  config: {
    debug: false,
    defaultDuration: 300,
    defaultEasing: 'ease',
    // Default animations
    animations: {
      fade: {
        in: {
          from: {opacity: 0},
          to: {opacity: 1}
        },
        out: {
          from: {opacity: 1},
          to: {opacity: 0}
        }
      },
      slideUp: {
        in: {
          from: {transform: 'translateY(20px)', opacity: 0},
          to: {transform: 'translateY(0)', opacity: 1}
        },
        out: {
          from: {transform: 'translateY(0)', opacity: 1},
          to: {transform: 'translateY(-20px)', opacity: 0}
        }
      },
      slideDown: {
        in: {
          from: {transform: 'translateY(-20px)', opacity: 0},
          to: {transform: 'translateY(0)', opacity: 1}
        },
        out: {
          from: {transform: 'translateY(0)', opacity: 1},
          to: {transform: 'translateY(20px)', opacity: 0}
        }
      },
      slideLeft: {
        in: {
          from: {transform: 'translateX(-20px)', opacity: 0},
          to: {transform: 'translateX(0)', opacity: 1}
        },
        out: {
          from: {transform: 'translateX(0)', opacity: 1},
          to: {transform: 'translateX(-20px)', opacity: 0}
        }
      },
      slideRight: {
        in: {
          from: {transform: 'translateX(20px)', opacity: 0},
          to: {transform: 'translateX(0)', opacity: 1}
        },
        out: {
          from: {transform: 'translateX(0)', opacity: 1},
          to: {transform: 'translateX(20px)', opacity: 0}
        }
      },
      scale: {
        in: {
          from: {transform: 'scale(0.95)', opacity: 0},
          to: {transform: 'scale(1)', opacity: 1}
        },
        out: {
          from: {transform: 'scale(1)', opacity: 1},
          to: {transform: 'scale(0.95)', opacity: 0}
        }
      },
      rotate: {
        in: {
          from: {transform: 'rotate(-180deg)', opacity: 0},
          to: {transform: 'rotate(0)', opacity: 1}
        },
        out: {
          from: {transform: 'rotate(0)', opacity: 1},
          to: {transform: 'rotate(180deg)', opacity: 0}
        }
      }
    },
    // Performance options
    performance: {
      useRAF: true,
      batchSize: 100,
      debounceInterval: 100
    }
  },

  /**
   * Animation state
   */
  state: {
    running: new Map(),
    queue: new Map(),
    cache: new Map()
  },

  /**
   * Initialize animation manager
   */
  async init(options = {}) {
    this.config = {...this.config, ...options};

    // Setup performance monitoring
    if (window.PerformanceObserver) {
      this.setupPerformanceObserver();
    }

    return this;
  },

  /**
   * Animate element
   * @param {HTMLElement} element Element to animate
   * @param {string} animation Animation name or custom keyframes
   * @param {Object} options Animation options
   * @returns {Promise} Animation promise
   */
  animate(element, animation, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!element) {
          throw new Error('Element is required');
        }

        // Get animation config
        const config = this.getAnimationConfig(animation, options);

        // Setup animation
        const animationId = Utils.generateUUID();
        const cleanup = () => {
          this.state.running.delete(animationId);
          element.style.animation = '';
        };

        // Create animation
        const keyframes = this.createKeyframes(config);
        const timing = this.createTiming(options);

        // Start animation
        const anim = element.animate(keyframes, timing);

        // Store running animation
        this.state.running.set(animationId, {
          element,
          animation: anim,
          cleanup
        });

        // Handle events
        anim.onfinish = () => {
          cleanup();
          resolve();
        };

        anim.oncancel = () => {
          cleanup();
          reject(new Error('Animation cancelled'));
        };

        // Handle errors
        anim.onerror = (error) => {
          cleanup();
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * Chain multiple animations
   * @param {HTMLElement} element Element to animate
   * @param {Array} animations Array of animations to chain
   * @returns {Promise} Animation chain promise
   */
  chain(element, animations) {
    return animations.reduce((promise, animation) => {
      return promise.then(() => {
        return this.animate(element, animation.name, animation.options);
      });
    }, Promise.resolve());
  },

  /**
   * Get animation configuration
   * @private
   */
  getAnimationConfig(animation, options) {
    // Handle predefined animations
    if (typeof animation === 'string') {
      const preset = this.config.animations[animation];
      if (!preset) {
        throw new Error(`Animation "${animation}" not found`);
      }
      return preset[options.direction || 'in'];
    }

    // Handle custom keyframes
    return animation;
  },

  /**
   * Create keyframes from config
   * @private
   */
  createKeyframes(config) {
    return [
      config.from || {},
      ...(config.steps || []),
      config.to || {}
    ];
  },

  /**
   * Create timing options
   * @private
   */
  createTiming(options) {
    return {
      duration: options.duration || this.config.defaultDuration,
      easing: options.easing || this.config.defaultEasing,
      delay: options.delay || 0,
      iterations: options.iterations || 1,
      direction: options.direction || 'normal',
      fill: options.fill || 'both'
    };
  },

  /**
   * Monitor animation performance
   * @private
   */
  setupPerformanceObserver() {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Report metrics
        if (window.EventManager?.emit) {
          EventManager.emit('animation:performance', {
            animation: entry.name,
            duration: entry.duration,
            startTime: entry.startTime
          });
        }
      }
    });

    observer.observe({entryTypes: ['animation']});
  },

  /**
   * Stop running animations
   * @param {HTMLElement} element Optional element to stop animations for
   */
  stop(element = null) {
    for (const [id, animation] of this.state.running) {
      if (!element || animation.element === element) {
        animation.animation.cancel();
        animation.cleanup();
        this.state.running.delete(id);
      }
    }
  },

  /**
   * Clear animation cache
   */
  clearCache() {
    this.state.cache.clear();
  },

  /**
   * Destroy animation manager
   */
  destroy() {
    this.stop();
    this.clearCache();
  }
};

// Auto-register with Now framework
if (window.Now?.registerManager) {
  Now.registerManager('animation', AnimationManager);
}

// Make globally available
window.AnimationManager = AnimationManager;

/**
 * Animation directive system
 * Adds animation support via data attributes and properties
 */
Object.assign(TemplateManager, {
  /**
   * Process animation directives
   * @param {HTMLElement} element Element to process
   * @param {Object} context Component context
   */
  processDataAnimation(element, context) {
    if (!element || !context) return;

    // Store initial animation binding if not exists
    if (!element._animBinding) {
      element._animBinding = {
        animations: new Map(),
        originalState: this.deepClone(context.state),
        originalContext: {...context},
        originalDisplay: element.style.display
      };
    }

    // Process animation directives
    this.processAnimationShow(element, context);
    this.processAnimationEnter(element, context);
    this.processAnimationLeave(element, context);
    this.processAnimationTransition(element, context);
  },

  /**
   * Process data-show animation
   * Shows/hides element with animation
   */
  processAnimationShow(element, context) {
    const value = element.dataset.show;
    if (!value) return;

    try {
      const updateShow = () => {
        // Get current value
        let isVisible = ExpressionEvaluator.evaluate(value, {...context.state, ...context.computed}, context);

        // Default to original state if undefined
        if (isVisible === undefined && element._animBinding.originalState) {
          isVisible = ExpressionEvaluator.evaluate(value, element._animBinding.originalState, context);
        }

        // Get animation options
        const animation = element.dataset.showAnimation || 'fade';
        const duration = parseInt(element.dataset.showDuration) || 300;

        // Stop any running animations on this element
        AnimationManager.stop(element);

        if (isVisible) {
          // Show: Remove display: none first
          if (element.style.display === 'none') {
            element.style.display = element._animBinding.originalDisplay || '';
          }

          // Animate in
          AnimationManager.animate(element, animation, {
            direction: 'in',
            duration
          });
        } else {
          // Hide: Animate out, then set display: none
          AnimationManager.animate(element, animation, {
            direction: 'out',
            duration
          }).then(() => {
            element.style.display = 'none';
          }).catch(() => {
            // If cancelled (e.g. by quick toggle), don't hide
          });
        }
      };

      // Initial check - if false, hide immediately without animation
      let initialVisible = ExpressionEvaluator.evaluate(value, {...context.state, ...context.computed}, context);
      if (initialVisible === undefined && element._animBinding.originalState) {
        initialVisible = ExpressionEvaluator.evaluate(value, element._animBinding.originalState, context);
      }

      if (!initialVisible) {
        element.style.display = 'none';
      }

      // Setup reactive update
      this.setupReactiveUpdate(element, context, 'Show', updateShow);

    } catch (error) {
      console.error('Error processing animation show:', error);
    }
  },

  /**
   * Process data-enter animation
   * Animates element when entering view
   */
  processAnimationEnter(element, context) {
    const animation = element.dataset.enter;
    if (!animation) return;

    try {
      // Create intersection observer
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Animate when entering view
            AnimationManager.animate(element, animation, {
              duration: parseInt(element.dataset.enterDuration) || 300
            });
            // Only animate once
            observer.unobserve(element);
          }
        });
      });

      // Start observing
      observer.observe(element);

      // Store for cleanup
      element._animBinding.observers = element._animBinding.observers || new Set();
      element._animBinding.observers.add(observer);

    } catch (error) {
      console.error('Error processing animation enter:', error);
    }
  },

  /**
   * Process data-leave animation
   * Animates element when leaving view
   */
  processAnimationLeave(element, context) {
    const animation = element.dataset.leave;
    if (!animation) return;

    try {
      // Create intersection observer
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) {
            // Animate when leaving view
            AnimationManager.animate(element, animation, {
              duration: parseInt(element.dataset.leaveDuration) || 300
            });
          }
        });
      });

      // Start observing
      observer.observe(element);

      // Store for cleanup
      element._animBinding.observers = element._animBinding.observers || new Set();
      element._animBinding.observers.add(observer);

    } catch (error) {
      console.error('Error processing animation leave:', error);
    }
  },

  /**
   * Process data-transition animation
   * Animates between states
   */
  processAnimationTransition(element, context) {
    const value = element.dataset.transition;
    if (!value) return;

    try {
      const updateTransition = () => {
        // Get new value
        let newValue = ExpressionEvaluator.evaluate(value, {...context.state, ...context.computed}, context);

        // Use original state if undefined
        if (newValue === undefined && element._animBinding.originalState) {
          newValue = ExpressionEvaluator.evaluate(value, element._animBinding.originalState, context);
        }

        // Get previous value
        const prevValue = element._animBinding.prevValue;

        // Skip if no change
        if (newValue === prevValue) return;

        // Get animation options
        const animation = element.dataset.transitionAnimation || 'fade';
        const duration = parseInt(element.dataset.transitionDuration) || 300;

        // Animate transition
        AnimationManager.animate(element, animation, {
          duration,
          onComplete: () => {
            // Update previous value
            element._animBinding.prevValue = newValue;
          }
        });
      };

      // Initial update
      updateTransition();

      // Setup reactive update
      this.setupReactiveUpdate(element, context, 'Transition', updateTransition);

    } catch (error) {
      console.error('Error processing animation transition:', error);
    }
  },

  /**
   * Clean up animation bindings
   */
  cleanupAnimationBinding(element) {
    if (!element._animBinding) return;

    // Stop running animations
    element._animBinding.animations.forEach(animation => {
      AnimationManager.stop(animation);
    });

    // Disconnect observers
    element._animBinding.observers?.forEach(observer => {
      observer.disconnect();
    });

    // Remove binding
    delete element._animBinding;
  }
});
