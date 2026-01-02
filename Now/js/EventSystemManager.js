const EventSystemManager = {
  config: {
    cleanupInterval: 600000,
    maxMemoryUsage: 50 * 1024 * 1024,
    delegation: {
      enabled: true,
      matchingStrategy: 'closestFirst',
      maxDelegationDepth: 10,
      optimizeSelectors: true,
      rootElement: document
    },
    memoryManagement: {
      checkInterval: 30000,
      maxHandlersPerElement: 100,
      maxCacheSize: 1000,
      gcThreshold: 0.8,
      detailedTracking: true
    },
    filtering: {
      enabled: true,
      maxThrottleRate: 60, // events per second
      debounceWait: 100, // ms
      highFrequencyEvents: null
    }
  },

  state: {
    handlers: new Map(),
    elementHandlers: new Map(),
    idCounter: 0,
    initialized: false,
    memoryUsage: 0,
    eventPaths: new WeakMap(),
    cleanupTimer: null,
    delegationCache: new WeakMap(),
    selectorCache: new Map(),
    delegatedEvents: new Map(),
    selectorsByType: new Map(),
    selectorMatchCache: new WeakMap(),
    uiEventQueue: new Map(),
    rafScheduled: false,
    memoryStats: {
      handlerCount: 0,
      cacheSize: 0,
      weakMapSize: 0,
      lastGC: Date.now(),
      peakMemoryUsage: 0,
      memoryWarnings: 0
    },
    elementStats: new WeakMap(),
    gcTimer: null,
    filtering: {
      throttleTimers: new Map(),
      debounceTimers: new Map(),
      lastEventTimes: new Map(),
      filteredCount: 0
    }
  },

  windowEvents: new Set([
    'popstate',
    'hashchange',
    'resize',
    'scroll',
    'load',
    'pagehide',
    'visibilitychange',
    'beforeunload',
    'online',
    'offline',
    'message',
    'storage'
  ]),

  // Define events that don't use passive mode and can call preventDefault
  nonPassiveEvents: new Set([
    'click',
    'submit',
    'dragstart',
    'dragenter',
    'dragleave',
    'dragover',
    'drop',
    'touchstart',
    'touchmove',
    'wheel',
    'keydown',
    'paste'
  ]),

  supportedEvents: [
    'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
    'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
    'submit', 'change', 'input', 'focus', 'blur',
    'keydown', 'keyup', 'keypress', 'paste',
    'touchstart', 'touchend', 'touchmove', 'touchcancel',
    'dragstart', 'dragend', 'dragenter', 'dragleave', 'dragover', 'drop',
    'scroll', 'resize', 'contextmenu', 'wheel',
    'popstate', 'hashchange'
  ],

  uiEvents: new Set([
    'resize',
    'scroll',
    'mousemove',
    'touchmove',
    'drag',
    'dragover'
  ]),

  init() {
    if (this.state.initialized) return this;

    this.config.filtering.highFrequencyEvents = new Set([
      'mousemove',
      'scroll',
      'resize',
      'touchmove',
      'pointermove'
    ]);

    this.state.filtering = {
      throttleTimers: new Map(),
      debounceTimers: new Map(),
      lastEventTimes: new Map(),
      filteredCount: 0
    };

    this.setupGlobalHandlers();
    this.setupCleanup();
    this.observeDOM();
    this.setupMemoryMonitoring();

    this.state.initialized = true;
    return this;
  },

  setupGlobalHandlers() {
    this.supportedEvents.forEach(type => {
      this.config.delegation.rootElement.addEventListener(type, e => this.handleEvent(e), {
        capture: true,
        passive: !this.nonPassiveEvents.has(type)
      });
    });

    this.windowEvents.forEach(type => {
      window.addEventListener(type, e => this.handleWindowEvent(e), {
        capture: true,
        passive: !this.nonPassiveEvents.has(type)
      });
    });
  },

  addHandler(element, type, handler, options = {}) {
    // Lazy init: ensure global listeners are installed before registering any handler
    if (!this.state.initialized) {
      this.init();
    }

    if (!type || !this.supportedEvents.includes(type)) {
      throw new Error(`Unsupported event: ${type}`);
    }

    const isWindowEvent = this.windowEvents.has(type);
    if (isWindowEvent) {
      element = window;
    }

    const isDocumentEvent = element === document;

    if (!element || !(element instanceof Element || element === window || element === document)) {
      throw new Error('Invalid element provided');
    }

    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    const id = ++this.state.idCounter;
    const entry = {
      id,
      type,
      handler,
      element,
      isWindowEvent,
      isDocumentEvent,
      timestamp: Date.now(),
      options: {
        capture: Boolean(options.capture),
        once: Boolean(options.once),
        passive: Boolean(options.passive),
        priority: Number(options.priority) || 0,
        componentId: options.componentId,
        selector: options.selector
      }
    };

    this.state.handlers.set(id, entry);
    if (!isWindowEvent) {
      if (!this.state.elementHandlers.has(element)) {
        this.state.elementHandlers.set(element, new Map());
      }

      const elementHandlers = this.state.elementHandlers.get(element);
      if (!elementHandlers.has(type)) {
        elementHandlers.set(type, new Set());
      }

      elementHandlers.get(type).add(id);

      if (this.config.delegation.enabled && options.selector) {
        if (!this.state.delegatedEvents.has(type)) {
          this.state.delegatedEvents.set(type, new Map());
        }
        const typeSelectors = this.state.delegatedEvents.get(type);
        if (!typeSelectors.has(options.selector)) {
          typeSelectors.set(options.selector, new Set());
        }
        typeSelectors.get(options.selector).add(id);
      }
    }

    return id;
  },

  removeHandler(id) {
    const entry = this.state.handlers.get(id);
    if (!entry) return false;

    const {element, type} = entry;
    const elementHandlers = this.state.elementHandlers.get(element);
    if (elementHandlers) {
      const typeHandlers = elementHandlers.get(type);
      if (typeHandlers) {
        typeHandlers.delete(id);
        if (typeHandlers.size === 0) {
          elementHandlers.delete(type);
        }
      }
      if (elementHandlers.size === 0) {
        this.state.elementHandlers.delete(element);
      }
    }

    return this.state.handlers.delete(id);
  },

  handleEvent(event) {
    if (!this.shouldProcessEvent(event)) return;

    try {
      if (event.type === 'keydown' || event.type === 'keyup' || event.type === 'keypress') {
        const enhancedKeyEvent = this.handleKeyboardEvent(event);
        event._enhanced = enhancedKeyEvent;
      }

      if (this.uiEvents.has(event.type)) {
        this.queueUIEvent(event);
        return;
      }

      this.processEvent(event);
    } catch (error) {
      ErrorManager.handle(error, {
        context: 'EventSystemManager.handleEvent',
        data: {event}
      });
    }
  },

  handleKeyboardEvent(event) {
    const enhancedEvent = {
      originalEvent: event,
      key: event.key,
      code: event.code,
      keyCode: event.keyCode,

      ctrlKey: event.ctrlKey || false,
      altKey: event.altKey || false,
      shiftKey: event.shiftKey || false,
      metaKey: event.metaKey || false,

      isEnter: event.key === 'Enter',
      isShiftEnter: event.key === 'Enter' && event.shiftKey,
      isCtrlEnter: event.key === 'Enter' && event.ctrlKey,
      isAltEnter: event.key === 'Enter' && event.altKey,

      isTab: event.key === 'Tab',
      isShiftTab: event.key === 'Tab' && event.shiftKey,

      isArrowKey: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key),

      preventDefault() {
        event.preventDefault();
      },
      stopPropagation() {
        event.stopPropagation();
      }
    };

    return enhancedEvent;
  },

  handleWindowEvent(event) {
    if (!this.shouldProcessEvent(event)) {
      return;
    }

    try {
      const context = {
        stopped: false,
        immediateStopped: false,
        path: [window],
        type: event.type,
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        originalEvent: event,
        target: window,
        currentTarget: window,
        processedHandlers: new Set()
      };

      const handlers = Array.from(this.state.handlers.entries())
        .filter(([_, entry]) =>
          entry.isWindowEvent &&
          entry.type === event.type
        )
        .sort((a, b) =>
          (b[1].options.priority || 0) - (a[1].options.priority || 0)
        );

      for (const [id, entry] of handlers) {
        if (context.immediateStopped) break;

        if (!context.processedHandlers.has(id)) {
          context.processedHandlers.add(id);
          this.executeHandler(entry, context);
        }
      }

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'EventSystemManager.handleWindowEvent',
        data: {event}
      });
    }
  },

  queueUIEvent(event) {
    const type = event.type;
    this.state.uiEventQueue.set(type, event);

    if (!this.state.rafScheduled) {
      this.state.rafScheduled = true;
      requestAnimationFrame(() => {
        this.processUIEventQueue();
      });
    }
  },

  processUIEventQueue() {
    this.state.rafScheduled = false;

    for (const [type, event] of this.state.uiEventQueue) {
      this.processEvent(event);
    }

    this.state.uiEventQueue.clear();
  },

  processEvent(event) {
    const path = this.getEventPath(event);
    const type = event.type;

    const context = {
      stopped: false,
      immediateStopped: false,
      path: path,
      type: type,
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      originalEvent: event,
      target: event.target,
      currentTarget: null,
      processedHandlers: new Set()
    };

    for (let i = path.length - 1; i >= 0; i--) {
      if (context.stopped) break;
      context.currentTarget = path[i];
      this.processElementHandlers(context, true);
    }

    if (!context.stopped) {
      for (let i = 0; i < path.length; i++) {
        if (context.stopped) break;
        context.currentTarget = path[i];
        this.processElementHandlers(context, false);
      }
    }
  },

  processElementHandlers(context, capture) {
    const elementHandlers = this.state.elementHandlers.get(context.currentTarget);
    if (!elementHandlers) return;

    const typeHandlers = elementHandlers.get(context.type);

    if (!typeHandlers || typeHandlers.size === 0) return;

    // Collect stale IDs for cleanup
    const staleIds = [];

    const handlers = Array.from(typeHandlers)
      .map(id => {
        const entry = this.state.handlers.get(id);
        // Track stale IDs for cleanup
        if (!entry) {
          staleIds.push(id);
        }
        return entry;
      })
      .filter(entry => {
        // Check if entry exists first
        if (!entry) {
          return false;
        }
        if (context.processedHandlers.has(entry.id)) {
          return false;
        }
        const captureMatch = entry.options.capture === capture;
        return captureMatch;
      })
      .sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0));

    // Clean up stale IDs from typeHandlers to prevent future lookup failures
    if (staleIds.length > 0) {
      staleIds.forEach(id => typeHandlers.delete(id));
    }

    for (const entry of handlers) {
      if (context.immediateStopped) break;

      const shouldHandle = this.shouldHandleEvent(entry, context);
      if (shouldHandle) {
        context.processedHandlers.add(entry.id);
        this.executeHandler(entry, context);
      }
    }
  },

  shouldHandleEvent(entry, event) {
    if (entry.options.selector) {
      const delegateTarget = this.findDelegateTarget(event.target, entry.options.selector);
      if (!delegateTarget) return false;
      event.delegateTarget = delegateTarget;
    }
    return true;
  },

  findDelegateTarget(target, selector) {
    const cacheKey = target;
    const cache = this.state.selectorMatchCache;

    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, new Map());
    }

    const targetCache = cache.get(cacheKey);
    if (targetCache.has(selector)) {
      return targetCache.get(selector);
    }

    try {
      const closest = target.closest(selector);
      const result = closest && this.config.delegation.rootElement.contains(closest)
        ? closest
        : null;

      targetCache.set(selector, result);
      return result;
    } catch (error) {
      ErrorManager.handle(`Invalid selector: ${selector}`, {
        context: 'EventSystemManager.findDelegateTarget',
        data: {target, selector, error}
      });
      targetCache.set(selector, null);
      return null;
    }
  },

  executeHandler(entry, context) {
    try {
      const wrappedEvent = {
        type: context.type,
        key: context.key,
        shiftKey: context.shiftKey,
        ctrlKey: context.ctrlKey,
        altKey: context.altKey,
        metaKey: context.metaKey,
        target: context.target,
        currentTarget: context.currentTarget,
        delegateTarget: context.delegateTarget,
        timestamp: Date.now(),
        originalEvent: context.originalEvent,

        preventDefault() {
          context.originalEvent.preventDefault();
        },

        stopPropagation() {
          context.stopped = true;
          context.originalEvent.stopPropagation();
        },

        stopImmediatePropagation() {
          context.stopped = true;
          context.immediateStopped = true;
          context.originalEvent.stopImmediatePropagation();
        },

        matches(selector) {
          return context.target.matches?.(selector) || false;
        }
      };

      let handlerContext;
      if (entry.isWindowEvent) {
        handlerContext = window;
      } else if (entry.isDocumentEvent) {
        handlerContext = document;
      } else if (entry.options.selector && context.delegateTarget) {
        handlerContext = context.delegateTarget;
      } else {
        handlerContext = entry.element;
      }

      const boundHandler = entry.handler.bind(handlerContext);
      return boundHandler(wrappedEvent);

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'EventSystemManager.executeHandler',
        data: {
          handlerId: entry.id,
          type: context.type,
          target: context.target
        }
      });
    }
  },

  getEventPath(event) {
    if (event && typeof event.composedPath === 'function') {
      return event.composedPath();
    }

    // Fallback for event.target-based path construction
    const target = event?.target || event;

    if (this.state.eventPaths.has(target)) {
      return this.state.eventPaths.get(target);
    }

    const path = [];
    let current = target;

    while (current && current !== window) {
      path.push(current);
      current = current.parentElement || current.parentNode;
    }

    if (document) path.push(document);
    if (window) path.push(window);

    this.state.eventPaths.set(target, path);
    return path;
  },

  setupCleanup() {
    if (this.state.cleanupTimer) {
      clearInterval(this.state.cleanupTimer);
    }

    this.state.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  },

  observeDOM() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.removedNodes.forEach(node => {
          if (node.nodeType === 1) {
            setTimeout(() => {
              if (!node.isConnected) {
                this.removeElementHandlers(node);
              }
            }, 0);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  },

  removeElementHandlers(element) {
    const handlers = this.state.elementHandlers.get(element);
    if (handlers) {
      handlers.forEach((typeHandlers, type) => {
        typeHandlers.forEach(id => {
          this.removeHandler(id);
        });
      });
      this.state.elementHandlers.delete(element);
    }
  },

  removeComponentHandlers(componentId) {
    const handlersToRemove = [];
    this.state.handlers.forEach((entry, id) => {
      if (entry.options.componentId === componentId) {
        handlersToRemove.push(id);
      }
    });
    handlersToRemove.forEach(id => this.removeHandler(id));
  },

  cleanup() {
    const now = Date.now();

    this.state.handlers.forEach((entry, id) => {
      if (entry.element === window || entry.element === document) {
        return;
      }

      if (!document.contains(entry.element)) {
        this.removeHandler(id);
      }
    });

    this.state.eventPaths = new WeakMap();
    this.state.delegationCache = new WeakMap();
    this.state.selectorMatchCache = new WeakMap();

    this.state.uiEventQueue.clear();

    this.state.filtering = {
      throttleTimers: new Map(),
      debounceTimers: new Map(),
      lastEventTimes: new Map(),
      filteredCount: 0
    };

    if (this.state.memoryUsage > this.config.maxMemoryUsage) {
      this.performGC();
    }
  },

  setupMemoryMonitoring() {
    this.state.gcTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.memoryManagement.checkInterval);
  },

  checkMemoryUsage() {
    const stats = this.gatherMemoryStats();
    this.updateMemoryStats(stats);

    if (this.shouldTriggerGC(stats)) {
      this.performGC();
    }

    if (this.config.memoryManagement.detailedTracking) {
      this.logMemoryWarnings(stats);
    }
  },

  gatherMemoryStats() {
    const stats = {
      handlerCount: this.state.handlers.size,
      cacheSize: this.state.selectorCache.size,
      weakMapSize: this.estimateWeakMapSize(),
      timestamp: Date.now(),
      elementHandlers: new Map()
    };

    this.state.elementHandlers.forEach((handlers, element) => {
      let count = 0;
      handlers.forEach(typeHandlers => {
        count += typeHandlers.size;
      });
      if (count > 0) {
        stats.elementHandlers.set(element, count);
      }
    });

    return stats;
  },

  estimateWeakMapSize() {
    const sampleSize = Math.min(100, Math.max(20, Math.floor(document.querySelectorAll('*').length * 0.1)));

    const start = performance.now();

    const elements = Array.from(document.querySelectorAll('*'));

    const sample = [];
    const step = Math.floor(elements.length / sampleSize);

    for (let i = 0; i < elements.length && sample.length < sampleSize; i += step) {
      sample.push(elements[i]);
    }

    let sampleCount = 0;
    sample.forEach(element => {
      if (this.state.elementHandlers.has(element)) sampleCount++;
      if (this.state.eventPaths.has(element)) sampleCount++;
      if (this.state.delegationCache.has(element)) sampleCount++;
      if (this.state.selectorMatchCache.has(element)) sampleCount++;
    });

    const estimatedSize = Math.round(
      (sampleCount / sample.length) * elements.length
    );

    const duration = performance.now() - start;

    return estimatedSize;
  },

  updateMemoryStats(stats) {
    const memoryStats = this.state.memoryStats;
    memoryStats.handlerCount = stats.handlerCount;
    memoryStats.cacheSize = stats.cacheSize;
    memoryStats.weakMapSize = stats.weakMapSize;
    memoryStats.peakMemoryUsage = Math.max(
      memoryStats.peakMemoryUsage,
      stats.handlerCount + stats.cacheSize
    );
  },

  shouldTriggerGC(stats) {
    const threshold = this.config.memoryManagement.gcThreshold;
    const maxHandlers = this.config.memoryManagement.maxHandlersPerElement;

    return (
      stats.handlerCount > (this.config.maxMemoryUsage * threshold) ||
      stats.cacheSize > this.config.memoryManagement.maxCacheSize ||
      Array.from(stats.elementHandlers.values()).some(count => count > maxHandlers)
    );
  },

  performGC() {
    const now = Date.now();
    const stats = {
      handlersRemoved: 0,
      cachesCleared: 0
    };

    this.state.handlers.forEach((entry, id) => {
      if (this.isHandlerStale(entry, now)) {
        this.removeHandler(id);
        stats.handlersRemoved++;
      }
    });

    this.clearUnusedCaches();
    stats.cachesCleared = this.state.selectorCache.size;

    this.state.memoryStats.lastGC = now;

    if (this.config.memoryManagement.detailedTracking) {
      console.info('GC Stats:', stats);
    }
  },

  isHandlerStale(entry, now) {
    if (!entry.timestamp) return false;

    const age = now - entry.timestamp;
    const element = entry.element;

    return (
      age > this.config.cleanupInterval * 2 ||
      !document.contains(element) ||
      !this.isElementVisible(element)
    );
  },

  clearUnusedCaches() {
    for (const [selector, timestamp] of this.state.selectorCache) {
      if (Date.now() - timestamp > this.config.cleanupInterval) {
        this.state.selectorCache.delete(selector);
      }
    }

    if (this.state.memoryStats.weakMapSize > this.config.memoryManagement.maxCacheSize) {
      this.state.eventPaths = new WeakMap();
      this.state.delegationCache = new WeakMap();
      this.state.selectorMatchCache = new WeakMap();
    }
  },

  logMemoryWarnings(stats) {
    const warnings = [];
    const maxHandlers = this.config.memoryManagement.maxHandlersPerElement;

    stats.elementHandlers.forEach((count, element) => {
      if (count > maxHandlers) {
        warnings.push(`Element has too many handlers (${count}): ${element.tagName}`);
      }
    });

    if (warnings.length > 0) {
      this.state.memoryStats.memoryWarnings++;
      console.warn('Memory warnings:', warnings);
    }
  },

  destroy() {
    if (this.state.cleanupTimer) {
      clearInterval(this.state.cleanupTimer);
    }

    this.state.handlers.clear();
    this.state.elementHandlers = new WeakMap();
    this.state.eventPaths = new WeakMap();
    this.state.delegationCache = new WeakMap();
    this.state.selectorCache.clear();
    this.state.selectorMatchCache = new WeakMap();
    this.state.uiEventQueue.clear();
    this.state.initialized = false;

    if (this.state.gcTimer) {
      clearInterval(this.state.gcTimer);
    }
    this.state.memoryStats = {
      handlerCount: 0,
      cacheSize: 0,
      weakMapSize: 0,
      lastGC: 0,
      peakMemoryUsage: 0,
      memoryWarnings: 0
    };
  },

  shouldProcessEvent(event) {
    if (!this.config.filtering.enabled) return true;

    const type = event.type;

    if (!this.config.filtering.highFrequencyEvents?.has(type)) {
      const now = performance.now();
      const lastTime = this.state.filtering.lastEventTimes.get(type) || 0;
      const minInterval = 1000 / this.config.filtering.maxThrottleRate;

      if (now - lastTime < minInterval) {
        this.state.filtering.filteredCount++;
        return false;
      }

      this.state.filtering.lastEventTimes.set(type, now);
    }

    return true;
  },

  isRapidFire(event) {
    const now = performance.now();
    const type = event.type;

    const lastTime = this.state.filtering.lastEventTimes.get(type) || 0;
    const minInterval = 1000 / this.config.filtering.maxThrottleRate;

    if (now - lastTime < minInterval) {
      return true;
    }

    this.state.filtering.lastEventTimes.set(type, now);
    return false;
  },

  throttle(event, handler) {
    const type = event.type;
    const now = Date.now();
    const lastTime = this.state.filtering.throttleTimers.get(type) || 0;
    const threshold = 1000 / this.config.filtering.maxThrottleRate;

    if (now - lastTime >= threshold) {
      handler(event);
      this.state.filtering.throttleTimers.set(type, now);
    }
  },

  debounce(event, handler) {
    const type = event.type;
    clearTimeout(this.state.filtering.debounceTimers.get(type));

    this.state.filtering.debounceTimers.set(type,
      setTimeout(() => {
        handler(event);
        this.state.filtering.debounceTimers.delete(type);
      }, this.config.filtering.debounceWait)
    );
  }
};

if (window.Now?.registerManager) {
  Now.registerManager('eventsystem', EventSystemManager);
}

window.EventSystemManager = EventSystemManager;
