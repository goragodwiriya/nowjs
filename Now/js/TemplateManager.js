const TemplateManager = {
  config: {
    debug: false,
    cache: true,
    cacheDuration: 5 * 60 * 1000,
    security: {
      allowedOrigins: [],
      allowedExtensions: ['.html', '.htm'],
      maxContentSize: 2 * 1024 * 1024,
      sanitize: true,
      validateMarkup: true,
      allowedTags: [
        'html', 'head', 'body', 'title', 'meta', 'link', 'style', 'base',
        'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'pre',
        'blockquote', 'ol', 'ul', 'li', 'dl', 'dt', 'dd', 'a', 'em',
        'strong', 'small', 's', 'cite', 'code', 'sub', 'sup', 'span',
        'mark', 'b', 'i', 'u', 'var', 'time', 'img', 'figure',
        'figcaption', 'audio', 'video', 'source', 'track', 'iframe',
        'embed', 'object', 'param', 'picture',
        'template', 'canvas', 'svg', 'math', 'table', 'caption',
        'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup',
        'col', 'summary', 'form', 'input', 'textarea', 'button',
        'select', 'option', 'label', 'fieldset', 'legend', 'datalist',
        'output', 'div', 'details', 'dialog', 'meter', 'progress',
        'ruby', 'rt', 'rp', 'abbr', 'kbd', 'samp', 'font', 'center',
        'big', 'strike', 'marquee'
      ],

      allowedAttributes: {
        'all': [
          'id', 'class', 'title', 'lang', 'dir', 'hidden', 'tabindex', 'translate',
          'draggable', 'aria-*', 'role', 'data-*', 'accesskey', 'contenteditable',
          'contextmenu'
        ],
        'img': [
          'src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes',
          'decoding', 'referrerpolicy', 'crossorigin'
        ],
        'a': [
          'href', 'target', 'rel', 'download', 'hreflang', 'type'
        ],
        'input': [
          'type', 'value', 'placeholder', 'required', 'checked', 'disabled',
          'readonly', 'maxlength', 'minlength', 'pattern', 'size', 'step', 'multiple',
          'min', 'max', 'list', 'inputmode', 'autocomplete', 'autofocus', 'name'
        ],
        'select': ['value', 'placeholder', 'multiple', 'required', 'size', 'autofocus', 'name'],
        'option': ['value', 'selected', 'disabled', 'label'],
        'textarea': [
          'placeholder', 'required', 'rows', 'cols', 'maxlength', 'minlength', 'readonly', 'autofocus', 'name'
        ],
        'button': [
          'type', 'disabled', 'name', 'value', 'autofocus', 'form'
        ],
        'form': [
          'action', 'method', 'enctype', 'autocomplete', 'novalidate', 'target', 'name', 'accept-charset'
        ],
        'label': ['for'],
        'time': ['datetime'],
        'iframe': [
          'src', 'width', 'height', 'allow', 'loading', 'sandbox', 'referrerpolicy', 'name'
        ],
        'meta': ['name', 'content', 'http-equiv', 'charset']
      }
    },

    events: {
      cleanupInterval: 60000
    },

    cleanup: {
      interval: 60 * 1000,
      maxCacheAge: 30 * 60 * 1000,
      maxHandlerAge: 5 * 60 * 1000,
      batchSize: 100
    }
  },

  state: {
    cache: new Map(),
    initialized: false,
    serverPaths: new Set(),
    handlers: new Map(),
    cleanupInterval: null,
    lastCleanup: Date.now(),
    itemTimestamps: new Map(),
    performanceObserver: null,
    activeScripts: new Map()
  },

  async init(options = {}) {
    if (this.state.initialized) return this;

    if (this.config.security.allowedOrigins.length === 0) {
      this.config.security.allowedOrigins.push(window.location.origin);
    }

    this.config = Now.mergeConfig(this.config, options);

    if (options.serverPaths) {
      this.state.serverPaths = new Set(options.serverPaths);
    }

    this.setupPerformanceMonitoring();

    this.state.initialized = true;

    this.state.cleanupInterval = setInterval(() => {
      this.cleanupHandlers();
      this.cleanupCache();
    }, this.config.events.cleanupInterval);

    window.Now.handleEvent = (handlerId, element, event) => {
      const handler = this.state.handlers.get(handlerId);
      if (handler) {
        handler.call(event);
      } else {
        ErrorManager.handle(`Handler with ID ${handlerId} not found`, {
          context: 'TemplateManager.window.Now.handleEvent',
          data: {handlerId, element, event}
        });
      }
    };

    this.startCleanupInterval();

    // Cleanup data-scripts before route navigation
    EventManager.on('route:before', () => {
      this.cleanupScripts();
    }, {priority: -100}); // Run early to cleanup before navigation

    return this;
  },

  async loadFromServer(path) {
    if (!this.state.initialized) {
      throw new Error('TemplateManager is not initialized')
    }

    // Prefer using Now.resolvePath to build canonical template URLs when available
    try {
      if (window.Now && typeof window.Now.resolvePath === 'function' && !path.trim().startsWith('<') && !/^(https?:)?\/\//i.test(path)) {
        path = window.Now.resolvePath(path, 'templates');
      } else if (Now.config?.paths?.templates && !path.trim().startsWith('<') && !path.startsWith(Now.config.paths.templates)) {
        path = Now.config.paths.templates + path;
      }
    } catch (e) {
      if (Now.config?.paths?.templates && !path.trim().startsWith('<') && !path.startsWith(Now.config.paths.templates)) {
        path = Now.config.paths.templates + path;
      }
    }

    const startTime = performance.now();

    if (!this.isValidPath(path)) {
      throw new Error(`Invalid template path format: ${path}`);
    }

    const cacheKey = `template:${path}`;
    if (this.config.cache) {
      const cached = this.state.cache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.content;
      }
    }

    const url = new URL(path, window.location.origin);

    await this.validateRequest(url);

    // Use HttpClient only - no fallback
    if (!window.http || typeof window.http.get !== 'function') {
      throw new Error('HttpClient (window.http) is required but not available');
    }

    const response = await window.http.get(url.toString(), {
      throwOnError: false,
      headers: {
        'Accept': 'text/html'
      }
    });

    if (!response.success) {
      throw new Error(`Failed to fetch template: ${path}`);
    }

    const contentType = response.headers['content-type'];
    if (!contentType?.includes('text/html')) {
      throw new Error('Invalid content type: Expected HTML');
    }

    const contentLength = response.headers['content-length'];
    if (contentLength && parseInt(contentLength) > this.config.security.maxContentSize) {
      throw new Error('Template size exceeds limit');
    }

    const content = typeof response.data === 'string' ? response.data : await response.data.text();

    const processedContent = await this.processContent(content, path);

    if (this.config.cache) {
      this.state.cache.set(cacheKey, {
        content: processedContent,
        expires: Date.now() + this.config.cacheDuration
      });
      this.state.itemTimestamps.set(cacheKey, Date.now());
    }

    const endTime = performance.now();
    this.recordPerformance('template-load', {
      path,
      duration: endTime - startTime,
      size: content.length
    });

    return processedContent;
  },

  async validateRequest(url) {
    if (!this.config.security.allowedOrigins.includes(url.origin)) {
      throw new Error('Invalid origin');
    }

    if (!url.pathname.toLowerCase().endsWith('.html')) {
      throw new Error('Invalid file type');
    }

    return true;
  },

  async processContent(content, path) {
    try {
      const container = document.createElement('div');
      container.innerHTML = content.trim();

      const componentManager = Now.getManager('component');
      const context = componentManager?.getContextForPath(path);

      if (context) {
        this.processDataDirectives(container, context);
        this.processInterpolation(container, context);
      }

      if (this.config.security.sanitize) {
        this.sanitizeElement(container);
      }

      if (this.config.security.validateMarkup) {
        await this.validateMarkup(container);
      }

      return container.innerHTML;

    } catch (error) {
      throw ErrorManager.handle(error, {
        context: 'TemplateManager.processContent',
        data: {content, path}
      });
    }
  },

  sanitizeElement(element) {
    try {
      // Accept both HTMLElement and raw HTML string; normalize to element for traversal
      let root = element;
      if (typeof element === 'string') {
        const container = document.createElement('div');
        container.innerHTML = element;
        root = container;
      }

      if (window.DOMPurify) {
        DOMPurify.sanitize(root, {
          ALLOWED_TAGS: this.config.security.allowedTags,
          ALLOWED_ATTR: Object.values(this.config.security.allowedAttributes).flat(),
          IN_PLACE: true
        });
      } else {
        // Collect elements to remove and attributes to clean BEFORE modifying DOM
        // This prevents TreeWalker issues when removing nodes during traversal
        const elementsToRemove = [];
        const attributesToRemove = [];

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
        let el = walker.currentNode;
        while (el) {
          const tagName = el.tagName.toLowerCase();

          if (!this.config.security.allowedTags.includes(tagName)) {
            elementsToRemove.push(el);
          } else if (el.attributes) {
            Array.from(el.attributes).forEach(attr => {
              const attrName = attr.name.toLowerCase();

              const isGlobalAllowed = this.config.security.allowedAttributes.all
                .some(pattern => {
                  if (pattern.endsWith('*')) {
                    return attrName.startsWith(pattern.slice(0, -1));
                  }
                  return pattern === attrName;
                });

              const isTagAllowed = this.config.security.allowedAttributes[tagName]?.includes(attrName);

              const isUrlAttr = ['href', 'src', 'action', 'formaction', 'poster'].includes(attrName);
              const isStyleAttr = attrName === 'style';

              // Remove if not allowed by config
              if (!isGlobalAllowed && !isTagAllowed) {
                attributesToRemove.push({el, attrName});
                return;
              }

              // Value-level sanitization for URL attributes
              if (isUrlAttr) {
                const safe = this.sanitizeUrlAttribute(attr.value);
                if (!safe) {
                  attributesToRemove.push({el, attrName});
                  return;
                }
                if (safe !== attr.value) {
                  el.setAttribute(attrName, safe);
                }
              }

              // Inline style sanitization (manual path only)
              if (isStyleAttr) {
                const safeStyle = this.sanitizeInlineStyle(attr.value);
                if (safeStyle === null) {
                  attributesToRemove.push({el, attrName});
                  return;
                }
                el.setAttribute('style', safeStyle);
              }
            });
          }
          el = walker.nextNode();
        }

        // Now safely remove elements after traversal is complete
        elementsToRemove.forEach(el => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });

        // Remove disallowed attributes
        attributesToRemove.forEach(({el, attrName}) => {
          if (el.isConnected) {
            el.removeAttribute(attrName);
          }
        });
      }

      // Return sanitized HTML when caller passed a string
      if (typeof element === 'string') {
        return root.innerHTML;
      }
    } catch (error) {
      throw ErrorManager.handle(error, {
        context: 'TemplateManager.sanitizeElement',
        data: {element}
      });
    }
  },

  sanitizeUrlAttribute(value) {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();

    const blockedProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
    if (blockedProtocols.some(proto => lower.startsWith(proto))) {
      ErrorManager.handle('Blocked dangerous protocol in attribute URL', {
        context: 'TemplateManager.sanitizeUrlAttribute',
        data: {value: trimmed},
        logLevel: 'warn'
      });
      return null;
    }

    // Allow http/https absolute URLs
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      try {
        const urlObj = new URL(trimmed, window.location.origin);
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          return urlObj.toString();
        }
      } catch (e) {
        return null;
      }
      return null;
    }

    // Allow relative URLs without traversal
    if (!lower.includes(':')) {
      if (trimmed.includes('../') || trimmed.includes('..\\')) {
        return null;
      }
      return trimmed;
    }

    return null;
  },

  sanitizeInlineStyle(styleText) {
    if (typeof styleText !== 'string' || !styleText.trim()) return null;

    const styles = styleText.split(';').reduce((acc, style) => {
      // Split only on first colon to preserve URLs (e.g., http://)
      const colonIndex = style.indexOf(':');
      if (colonIndex === -1) return acc;
      const prop = style.substring(0, colonIndex).trim();
      const val = style.substring(colonIndex + 1).trim();
      if (prop && val) {
        const camelProp = prop.replace(/-([a-z])/g, m => m[1].toUpperCase());
        acc[camelProp] = val;
      }
      return acc;
    }, {});

    const safe = this.sanitizeStyles(styles);
    const safeEntries = Object.entries(safe)
      .filter(([, v]) => v !== undefined && v !== null && v !== '');

    if (safeEntries.length === 0) return '';

    return safeEntries.map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ');
  },

  async validateMarkup(content) {
    return new Promise((resolve, reject) => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');

        const parseError = doc.querySelector('parsererror');
        if (parseError) {
          reject(new Error('HTML parsing error: ' + parseError.textContent));
          return;
        }

        resolve(true);

      } catch (error) {
        ErrorManager.handle(error, {
          context: 'TemplateManager.validateMarkup',
          data: {content}
        });
        reject(error);
      }
    });
  },

  isValidPath(path) {
    if (typeof path !== 'string' || !path) return false;

    if (!path.startsWith('/')) return false;

    const pathLower = path.toLowerCase();
    if (!this.config.security.allowedExtensions.some(ext => pathLower.endsWith(ext))) {
      return false;
    }

    if (pathLower.includes('../') || pathLower.includes('./')) {
      return false;
    }

    if (this.state.serverPaths.size > 0) {
      return this.state.serverPaths.has(this.normalizePath(path));
    }

    return true;
  },

  isValidUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },

  normalizePath(path) {
    return path.replace(/^\/+|\/+$/g, '');
  },

  setupPerformanceMonitoring() {
    if (!window.PerformanceObserver) return;

    this.state.performanceObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach(entry => {
        if (entry.entryType === 'measure' && entry.name.startsWith('template-')) {
          this.recordPerformance(entry.name, {
            duration: entry.duration,
            startTime: entry.startTime,
            detail: entry.detail
          });
        }
      });
    });

    this.state.performanceObserver.observe({
      entryTypes: ['measure']
    });

    performance.getEntriesByType('measure').forEach(entry => {
      if (entry.name.startsWith('template-')) {
        this.recordPerformance(entry.name, {
          duration: entry.duration,
          startTime: entry.startTime,
          detail: entry.detail
        });
      }
    });
  },

  recordPerformance(name, data) {
    const event = Now.getManager('event');
    if (event) {
      event.emit('template:performance', {
        name,
        ...data,
        timestamp: Date.now()
      });
    }
  },

  recordError(error, path) {
    const event = Now.getManager('event');
    if (event) {
      event.emit('template:error', {
        error,
        path,
        timestamp: Date.now()
      });
    }
  },

  clearCache() {
    this.state.cache.clear();
  },

  /**
   * Process data-script directive
   * Calls a global function after template processing is complete
   * @param {HTMLElement} element - Element with data-script attribute
   * @param {Object} context - Template context with state/data
   */
  processDataScript(element, context) {
    const scriptFn = element.dataset.script;
    if (!scriptFn) return;

    if (typeof window[scriptFn] !== 'function') {
      console.warn(`TemplateManager: Function "${scriptFn}" not found in global scope`);
      return;
    }

    // Store for cleanup
    this.state.activeScripts.set(element, {fn: scriptFn});

    // Call the function with element and context data
    try {
      const data = context.state?.data || context.data || {};
      const result = window[scriptFn](element, data);

      // If function returns a cleanup function, store it
      if (typeof result === 'function') {
        this.state.activeScripts.get(element).cleanupFn = result;
      }
    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataScript',
        data: {scriptFn, element}
      });
    }
  },

  /**
   * Cleanup all active scripts before page navigation
   * Calls cleanup functions if provided by the script
   */
  cleanupScripts() {
    for (const [element, scriptInfo] of this.state.activeScripts) {
      // Call cleanup function if exists
      if (typeof scriptInfo.cleanupFn === 'function') {
        try {
          scriptInfo.cleanupFn();
        } catch (e) {
          console.warn('TemplateManager: Script cleanup error for', scriptInfo.fn, e);
        }
      }
    }
    this.state.activeScripts.clear();
  },

  processTemplate(element, context) {
    if (!element || !context) return;

    // Check if element has ApiComponent with existing data - preserve it for SPA navigation
    if (element._apiComponent && element._apiComponent.data && !context.state?.data) {
      context = {
        ...context,
        state: {
          ...context.state,
          data: element._apiComponent.data
        },
        data: element._apiComponent.data
      };
    }

    this.config.reactive = context.reactive;
    this.config.debug = context.debug;

    try {
      if (this.config.security.validateMarkup) {
        this.validateMarkup(element.innerHTML);
      }

      if (this.config.security.sanitize) {
        this.sanitizeElement(element);
      }

      this.processDataDirectives(element, context);
      this.processInterpolation(element, context);

      // After processing template directives, scan the element subtree so element/form managers can enhance
      // Skip scan if element is not connected to DOM (e.g., in DocumentFragment or temporary container)
      // This prevents MutationObserver from triggering premature cleanup when nodes are moved
      const shouldScan = context.skipScan !== true && element.isConnected;

      if (shouldScan) {
        try {
          const elementManager = Now.getManager('element');
          const formManager = Now.getManager('form');

          if (elementManager && typeof elementManager.scan === 'function') {
            elementManager.scan(element);
          }

          if (formManager && typeof formManager.scan === 'function') {
            formManager.scan(element);
          }
        } catch (err) {
          ErrorManager.handle('TemplateManager.postProcessScan failed', {
            context: 'TemplateManager.processTemplate',
            data: {error: err}
          });
        }
      }

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processTemplate',
        data: {element, context}
      });
      return this.renderError(error);
    }
  },

  processTemplateString(template, context, container) {
    try {
      if (!container) {
        container = document.createElement('div');
      }

      container.innerHTML = template;

      this.processDataDirectives(container, context);
      this.processInterpolation(container, context);

      // After creating DOM from template string, run element/form scans for the new nodes
      try {
        const elementManager = Now.getManager('element');
        const formManager = Now.getManager('form');

        if (elementManager && typeof elementManager.scan === 'function') {
          elementManager.scan(container);
        }

        if (formManager && typeof formManager.scan === 'function') {
          formManager.scan(container);
        }
      } catch (err) {
        ErrorManager.handle('TemplateManager.processTemplateString.postScan', {
          context: 'TemplateManager.processTemplateString',
          data: {error: err}
        });
      }

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processTemplateString',
        data: {template, context, container}
      });
      container.innerHTML = this.renderError(error);
    }
  },

  processInterpolation(element, context) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let node = walker.currentNode;
    while (node) {
      if (node.textContent) {
        const matches = node.textContent.match(/\{\{(.+?)\}\}/g);
        if (matches) {
          matches.forEach(match => {
            const expr = match.slice(2, -2).trim();
            const value = ExpressionEvaluator.evaluate(expr, {...context.state, ...context.methods}, context);
            node.textContent = node.textContent.replace(match, value ?? '');
          });
        }
      }
      node = walker.nextNode();
    }
  },

  hasOperators(str) {
    return /[\+\-\*\/\(\)\[\]\{\}\!\?\:\<\>\&\|\=\,]/.test(str);
  },

  renderError(error) {
    return `
        <div class="error-boundary">
          <p>Template Error: ${error.message}</p>
          <button class="button close-modal">Close</button>
        </div>
      `;
  },

  processDataDirectives(element, context) {
    if (!context || !context.state) {
      ErrorManager.handle('Invalid context for data directives processing', {
        context: 'TemplateManager.processDataDirectives',
        data: {element, context}
      });
      return;
    }

    if (context.reactive && !context._updateQueue) {
      context._updateQueue = new Set();
    }

    if (context.parentId) {
      this.cleanupComponentHandlers(context.parentId);
    }

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT, null, false);
    let el = walker.currentNode;

    // Collect data-for elements to process after other directives
    const dataForElements = [];

    while (el) {
      if (el.attributes && this.config.security.allowedTags.includes(el.tagName.toLowerCase())) {
        Array.from(el.attributes).forEach(attr => {
          if (!attr.name.startsWith('data-')) return;

          const directive = attr.name.substring(5);
          const value = attr.value;

          // Collect data-for elements for later processing
          if (directive === 'for') {
            dataForElements.push({el, value});
            return;
          }

          // Skip directives inside template tags (they will be processed by data-for)
          if (el.closest && el.closest('template')) {
            return;
          }

          switch (directive) {
            case 'text':
              this.processDataText(el, value, context);
              break;
            case 'html':
              this.processDataHtml(el, value, context);
              break;
            case 'if':
              this.processDataIf(el, value, context);
              break;
            case 'class':
              this.processDataClass(el, value, context);
              break;
            case 'attr':
              this.processDataAttr(el, value, context);
              break;
            case 'style':
              this.processDataStyle(el, value, context);
              break;
            case 'on':
              this.processDataOn(el, value, context);
              break;
            case 'container':
              this.processDataContainer(el, value, context);
              break;
            case 'model':
              this.processDataModel(el, value, context);
              break;
            case 'checked':
              this.processDataChecked(el, value, context);
              break;
            // Animation directives
            case 'show':
            case 'enter':
            case 'leave':
            case 'transition':
              // Process all animation directives together
              if (typeof this.processDataAnimation === 'function') {
                this.processDataAnimation(el, context);
              }
              break;
          }
        });
      }
      el = walker.nextNode();
    }

    // Process data-for elements AFTER other directives
    // This ensures template content is not pre-processed with wrong context
    dataForElements.forEach(({el, value}) => {
      this.processDataFor(el, value, context);
    });

    if (context.id && element.dataset?.parentContext) {
      element.dataset.parentContext = context.id;
    }
  },

  processDataText(el, expression, context) {
    if (!el || !expression || !context) return;

    try {
      if (!el._textBinding) {
        el._textBinding = {
          expression,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
          formatters: [],
          lastValue: null
        };

        const parts = expression.split('|').map(p => p.trim());
        if (parts.length > 1) {
          el._textBinding.expression = parts[0];
          el._textBinding.formatters = parts.slice(1);
        }
      } else {
        // Only update binding if new context has data, otherwise preserve existing binding
        // This prevents SPA navigation from clearing data that ApiComponent loaded
        const existingHasData = el._textBinding.originalState?.data;
        const newHasData = context.state?.data;

        if (newHasData || !existingHasData) {
          el._textBinding.originalState = this.deepClone(context.state);
          el._textBinding.originalContext = {...context};
        }
      }

      const updateText = () => {
        if (!el) return;

        try {
          const currentText = el.textContent?.trim();

          // Use originalState from binding (captured at creation time with correct item context)
          const state = el._textBinding.originalState || context.state;
          const ctx = el._textBinding.originalContext || context;

          let value = ExpressionEvaluator.evaluate(el._textBinding.expression, {...state, ...ctx.computed}, ctx);

          if (el._textBinding.formatters.length > 0) {
            value = Utils.string.applyFormatters(value, el._textBinding.formatters, ctx);
          }

          const newText = this.valueToString(value);

          if (newText === currentText) {
            return;
          }

          el.textContent = newText;
          el._textBinding.lastValue = newText;

        } catch (error) {
          ErrorManager.handle(error, {
            context: 'TemplateManager.processDataText',
            data: {el, expression, context}
          });
          el.textContent = '';
        }
      };

      updateText();

      this.setupReactiveUpdate(el, context, 'Text', updateText);

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataText',
        data: {el, expression, context}
      });
      el.textContent = '';
    }
  },

  processDataHtml(el, value, context) {
    if (!el || !value || !context) return;

    try {
      if (!el._htmlBinding) {
        el._htmlBinding = {
          value,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
          lastHtml: null
        };
      } else {
        // Only update binding if new context has data, otherwise preserve existing binding
        const existingHasData = el._htmlBinding.originalState?.data;
        const newHasData = context.state?.data;

        if (newHasData || !existingHasData) {
          el._htmlBinding.originalState = this.deepClone(context.state);
          el._htmlBinding.originalContext = {...context};
        }
      }
      const updateDataHtml = () => {
        const getHtmlContent = () => {
          const state = el._htmlBinding.originalState || context.state;
          const ctx = el._htmlBinding.originalContext || context;
          let content = ExpressionEvaluator.evaluate(el._htmlBinding.value, {...state, ...ctx.computed}, ctx);

          if (content === undefined && el._htmlBinding) {
            content = ExpressionEvaluator.evaluate(el._htmlBinding.value, {...el._htmlBinding.originalState, ...el._htmlBinding.originalContext.computed}, context);
          }

          return content;
        };

        const updateHtml = (content) => {
          if (content === null || content === undefined) {
            el.innerHTML = '';
            return;
          }

          content = String(content);

          if (content === el._htmlBinding.lastHtml) return;

          if (this.config.security.sanitize) {
            const sanitized = this.sanitizeElement(content);
            if (typeof sanitized === 'string') {
              content = sanitized;
            }
          }

          el.innerHTML = content;
          el._htmlBinding.lastHtml = content;

          this.processDataDirectives(el, context);
          this.processInterpolation(el, context);
        };

        updateHtml(getHtmlContent());
      };

      updateDataHtml();

      this.setupReactiveUpdate(el, context, 'Html', updateDataHtml);

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataHtml',
        data: {el, value, context}
      });
      el.innerHTML = '';
    }
  },

  processDataIf(el, expression, context) {
    if (!el || !expression || !context) return;

    try {
      if (!el._ifBinding) {
        el._ifBinding = {
          expression,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
          parent: el.parentNode,
          nextSibling: el.nextSibling,
          comment: document.createComment(`if: ${expression}`),
          condition: true,
          isAnimating: false,
          listeners: new Set(),
          cleanup: null
        };

        el._ifBinding.originalStyles = {
          display: window.getComputedStyle(el).display,
          animationName: window.getComputedStyle(el).animationName
        };

        if (el.classList.contains('animated')) {
          el._ifBinding.animated = true;
        }
      } else {
        // Only update binding if new context has data, otherwise preserve existing binding
        const existingHasData = el._ifBinding.originalState?.data;
        const newHasData = context.state?.data;

        if (newHasData || !existingHasData) {
          el._ifBinding.originalState = this.deepClone(context.state);
          el._ifBinding.originalContext = {...context};
        }
      }

      const binding = el._ifBinding;

      const evaluateCondition = () => {
        const state = binding.originalState || context.state;
        const ctx = binding.originalContext || context;
        let result = ExpressionEvaluator.evaluate(binding.expression, {...state, ...ctx.computed}, ctx);
        return !!result;
      };

      const cleanupElement = (element) => {
        if (element._eventBinding) {
          element._eventBinding.handlers.forEach(handlerId => {
            EventSystemManager.removeHandler(handlerId);
          });
        }

        ['text', 'html', 'class', 'attr', 'model'].forEach(type => {
          this.cleanupReactiveUpdate(element, type);
        });

        const componentManager = Now.getManager('component');
        if (componentManager) {
          const componentId = element.dataset?.componentId;
          if (componentId) {
            componentManager.destroyComponent(componentId);
          }
        }

        Array.from(element.children).forEach(child => {
          cleanupElement(child);
        });

        Object.keys(element).forEach(key => {
          if (key.startsWith('_')) {
            delete element[key];
          }
        });
      };

      const handleAnimation = (element, showing) => {
        return new Promise(resolve => {
          if (!binding.animated) {
            resolve();
            return;
          }

          binding.isAnimating = true;

          const animationClasses = showing ?
            ['fade-in', 'animate-in'] :
            ['fade-out', 'animate-out'];

          element.classList.add(...animationClasses);

          const cleanup = () => {
            element.classList.remove(...animationClasses);
            element.removeEventListener('animationend', onAnimationEnd);
            binding.isAnimating = false;
            resolve();
          };

          const onAnimationEnd = (e) => {
            if (e.target === element) {
              cleanup();
            }
          };

          element.addEventListener('animationend', onAnimationEnd);

          setTimeout(cleanup, 1000);
        });
      };

      const updateVisibility = async () => {
        const shouldShow = evaluateCondition();

        if (shouldShow === binding.condition && !binding.isAnimating) {
          return;
        }

        try {
          if (shouldShow) {
            if (!el.parentNode) {
              if (!binding.parent) {
                binding.parent = document.body;
              }

              if (binding.comment && binding.nextSibling) {
                binding.parent.insertBefore(binding.comment, binding.nextSibling);
              } else {
                binding.parent.appendChild(binding.comment);
              }

              if (binding.nextSibling) {
                binding.parent.insertBefore(el, binding.comment);
              } else {
                binding.parent.appendChild(el);
              }

              await handleAnimation(el, true);

              el.style.display = binding.originalStyles.display;

              this.processDataDirectives(el, context);
              this.processInterpolation(el, context);

              const componentManager = Now.getManager('component');
              if (componentManager) {
                componentManager.initializeExistingElements();
              }

              // Scan newly inserted node subtree for element/form enhancements
              try {
                const elementManager = Now.getManager('element');
                const formManager = Now.getManager('form');

                if (elementManager && typeof elementManager.scan === 'function') {
                  elementManager.scan(el);
                }

                if (formManager && typeof formManager.scan === 'function') {
                  formManager.scan(el);
                }
              } catch (err) {
                ErrorManager.handle('processDataIf.postInsertScan failed', {
                  context: 'TemplateManager.processDataIf',
                  data: {error: err}
                });
              }

              if (binding.comment && binding.comment.parentNode) {
                binding.comment.parentNode.removeChild(binding.comment);
              }
            }
          } else {
            if (el.parentNode) {
              await handleAnimation(el, false);

              cleanupElement(el);

              binding.parent = el.parentNode;
              binding.nextSibling = el.nextSibling;

              if (binding.parent) {
                if (binding.comment) {
                  try {
                    binding.parent.insertBefore(binding.comment, el.nextSibling);
                  } catch (err) {
                    binding.parent.appendChild(binding.comment);
                  }
                }
                el.remove();
              }
            }
          }

          binding.condition = shouldShow;
          EventManager.emit('if:updated', {
            element: el,
            condition: shouldShow,
            expression: expression
          });

        } catch (error) {
          ErrorManager.handle(error, {
            context: 'TemplateManager.processDataIf',
            type: 'error:template',
            data: {expression, el}
          });
        }
      };

      updateVisibility();

      this.setupReactiveUpdate(el, context, 'If', updateVisibility);

      binding.cleanup = () => {
        cleanupElement(el);
        this.cleanupReactiveUpdate(el, 'If');
        binding.comment.remove();
        binding.listeners.clear();
        try {
          delete el._ifBinding;
        } catch (e) {
          el._ifBinding = null;
        }
      };

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataIf',
        type: 'error:template',
        data: {expression, el}
      });
    }
  },

  processDataClass(el, value, context) {
    if (!el || !value || !context) return;

    try {
      if (!el._classBinding) {
        el._classBinding = {
          value,
          originalState: this.deepClone(context.state),
          originalContext: {...context}
        };
      } else {
        // Only update binding if new context has data, otherwise preserve existing binding
        const existingHasData = el._classBinding.originalState?.data;
        const newHasData = context.state?.data;

        if (newHasData || !existingHasData) {
          el._classBinding.originalState = this.deepClone(context.state);
          el._classBinding.originalContext = {...context};
        }
      }

      // Detect mode based on value format:
      // 1. Ternary mode: "condition ? 'classA' : 'classB'" - switch between two classes
      // 2. Binding mode: "className:expression" - toggle class based on condition
      // 3. Expression mode: "data.icon" or "data.icon + ' extra'" - add class from expression

      const hasTernaryClassSwitch = /[\s]+\?[\s]*['"][^'"]+['"][\s]*:[\s]*['"][^'"]+['"]/.test(value);
      const hasBindingColon = value.includes(':') && !hasTernaryClassSwitch;

      // Mode 1: Ternary class switch - "condition ? 'classTrue' : 'classFalse'"
      if (hasTernaryClassSwitch) {
        const ternary = /(.+?)[\s]+\?[\s]*['"]([^'"]+)['"][\s]*:[\s]*['"]([^'"]+)['"]/.exec(value);
        if (ternary) {
          const updateClassTernary = () => {
            try {
              const state = el._classBinding.originalState || context.state;
              const ctx = el._classBinding.originalContext || context;
              let shouldApply = ExpressionEvaluator.evaluate(ternary[1].trim(), {...state, ...ctx.computed}, ctx);

              if (shouldApply) {
                el.classList.add(ternary[2]);
                el.classList.remove(ternary[3]);
              } else {
                el.classList.remove(ternary[2]);
                el.classList.add(ternary[3]);
              }

            } catch (error) {
              ErrorManager.handle(`Error evaluating class ternary "${value}"`, {
                context: 'TemplateManager.processDataClass',
                data: {el, value, context}
              });
            }
          };

          updateClassTernary();
          this.setupReactiveUpdate(el, context, 'Class', updateClassTernary);
          return;
        }
      }

      // Mode 2: Binding mode - "className:expression, className2:expression2"
      if (hasBindingColon) {
        const bindings = value.split(',').map(binding => binding.trim());

        bindings.forEach(binding => {
          try {
            const updateClass = () => {
              const colonIndex = binding.indexOf(':');
              if (colonIndex === -1) return;

              const className = binding.substring(0, colonIndex).trim();
              const expression = binding.substring(colonIndex + 1).trim();

              if (!className || !expression) {
                ErrorManager.handle(`Invalid data-class binding: '${binding}'. Expected format "className:expression"`, {
                  context: 'TemplateManager.processDataClass',
                  data: {el, value, context},
                  logLevel: 'warn'
                });
                return;
              }

              const state = el._classBinding.originalState || context.state;
              const ctx = el._classBinding.originalContext || context;
              let shouldApply = ExpressionEvaluator.evaluate(expression, {...state, ...ctx.computed}, ctx);

              if (shouldApply) {
                el.classList.add(className);
              } else {
                el.classList.remove(className);
              }
            };

            updateClass();
            this.setupReactiveUpdate(el, context, 'Class', updateClass);

          } catch (error) {
            ErrorManager.handle(error, {
              context: 'TemplateManager.processDataClass',
              data: {el, value, context, binding}
            });
          }
        });
        return;
      }

      // Mode 3: Expression mode - "data.icon" or "data.icon + ' extra-class'"
      // Evaluates expression and adds resulting class(es) to element
      const updateClassExpression = () => {
        try {
          const state = el._classBinding.originalState || context.state;
          const ctx = el._classBinding.originalContext || context;
          let classValue = ExpressionEvaluator.evaluate(value, {...state, ...ctx.computed}, ctx);

          // Remove previously added classes from this expression
          if (el._classBinding.addedClasses) {
            el._classBinding.addedClasses.forEach(cls => {
              if (cls) el.classList.remove(cls);
            });
          }

          // Add new classes if value exists
          if (classValue) {
            const classes = String(classValue).split(/\s+/).filter(cls => cls);
            classes.forEach(cls => el.classList.add(cls));
            el._classBinding.addedClasses = classes;
          } else {
            el._classBinding.addedClasses = [];
          }

        } catch (error) {
          ErrorManager.handle(`Error evaluating class expression "${value}"`, {
            context: 'TemplateManager.processDataClass',
            data: {el, value, context}
          });
        }
      };

      updateClassExpression();
      this.setupReactiveUpdate(el, context, 'Class', updateClassExpression);

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataClass',
        data: {el, value, context},
      });
    }
  },

  processDataAttr(el, value, context) {
    if (!el || !value || !context) return;

    try {
      if (!el._Binding) {
        el._Binding = {
          value,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
        };
      } else {
        // Only update binding if new context has data, otherwise preserve existing binding
        const existingHasData = el._Binding.originalState?.data;
        const newHasData = context.state?.data;

        if (newHasData || !existingHasData) {
          el._Binding.originalState = this.deepClone(context.state);
          el._Binding.originalContext = {...context};
        }
      }

      const bindings = value.split(',').map(binding => binding.trim());
      bindings.forEach(binding => {
        try {
          const updateAttr = () => {
            const [attrName, expression] = binding.split(':').map(s => s.trim());

            if (!attrName || !expression) {
              ErrorManager.handle(`Invalid attribute binding: ${binding}`, {
                context: 'TemplateManager.processDataAttr',
                data: {el, value, context},
                logLevel: 'warn'
              });
              return;
            }

            if (!/^[a-zA-Z0-9\-_]+$/.test(attrName)) {
              ErrorManager.handle(`Invalid attribute name: ${attrName}`, {
                context: 'TemplateManager.processDataAttr',
                data: {el, value, context},
                logLevel: 'warn'
              });
              return;
            }

            // Use originalState from binding (captured at creation time with correct item context)
            const state = el._Binding.originalState || context.state;
            const ctx = el._Binding.originalContext || context;

            let attrValue = ExpressionEvaluator.evaluate(expression, {...state, ...ctx.computed}, ctx);

            // Check if element has ElementFactory instance with property handlers
            const elementManager = Now.getManager('element');
            const instance = elementManager?.getInstanceByElement(el);

            if (instance && instance.constructor.propertyHandlers && instance.constructor.propertyHandlers[attrName]) {
              // Use ElementFactory property handler
              const handler = instance.constructor.propertyHandlers[attrName];
              if (handler.set) {
                handler.set.call(instance.constructor, instance, attrValue);
              } else {
                console.error(`Property handler for '${attrName}' has no setter`);
              }
            } else {
              // Fallback to standard attribute setting
              const booleanAttrs = [
                'disabled', 'checked', 'readonly', 'required', 'autofocus', 'multiple',
                'novalidate', 'formnovalidate', 'selected', 'hidden', 'open', 'controls',
                'loop', 'muted', 'playsinline', 'reversed', 'scoped', 'async', 'defer'
              ];
              const isBooleanAttr = booleanAttrs.includes(attrName.toLowerCase());

              // Handle 'value' attribute specially for form elements
              if (attrName === 'value' && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
                // Skip file inputs - browser security prohibits setting value
                // Use data-files attribute instead for existing files
                if (el.type === 'file') {
                  ErrorManager.handle('Cannot set value on file input. Use data-files attribute for existing files.', {
                    context: 'TemplateManager.processDataAttr',
                    data: {el, attrName, expression},
                    logLevel: 'warn'
                  });
                  return;
                }
                if (el.tagName === 'SELECT') {
                  // For select, set value after options are ready
                  if (attrValue != null) {
                    el.value = String(attrValue);
                  }
                } else {
                  el.value = attrValue ?? '';
                }
              } else if (isBooleanAttr && attrValue) {
                el.setAttribute(attrName, attrName);
              } else if (!isBooleanAttr && attrValue != null) {
                el.setAttribute(attrName, attrValue);
              } else {
                el.removeAttribute(attrName);
              }
            }
          };

          updateAttr();

          this.setupReactiveUpdate(el, context, 'Attr', updateAttr);

        } catch (error) {
          ErrorManager.handle(error, {
            context: 'TemplateManager.processDataAttr',
            data: {el, value, context, binding}
          });
        }
      });

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataAttr',
        data: {el, value, context}
      });
    }
  },

  processDataStyle(el, value, context) {
    if (!el || !value || !context) return;
    try {
      if (!el._styleBinding) {
        el._styleBinding = {
          value,
          originalState: this.cloneState(context.state),
          originalContext: {...context},
          lastStyles: null
        };
      } else {
        // Update binding with new context
        el._styleBinding.originalState = this.cloneState(context.state);
        el._styleBinding.originalContext = {...context};
      }

      const updateStyles = () => {
        try {
          let styles = {};

          if (value.startsWith('{') && value.endsWith('}')) {
            const styleObj = ExpressionEvaluator.evaluate(value, {...context.state, ...context.computed}, context);
            if (typeof styleObj === 'object') {
              styles = styleObj;
            }
          } else {
            const styleStr = value.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
              const val = ExpressionEvaluator.evaluate(expr, {...context.state, ...context.computed}, context);
              return val != null ? val : '';
            });

            styles = styleStr.split(';').reduce((acc, style) => {
              // Split only on first colon to preserve URLs (e.g., http://)
              const colonIndex = style.indexOf(':');
              if (colonIndex === -1) return acc;
              const prop = style.substring(0, colonIndex).trim();
              const val = style.substring(colonIndex + 1).trim();
              if (prop && val) {
                const camelProp = prop.replace(/-([a-z])/g, m => m[1].toUpperCase());
                acc[camelProp] = val;
              }
              return acc;
            }, {});
          }

          if (JSON.stringify(styles) === el._styleBinding.lastStyles) {
            return;
          }

          const safeStyles = this.sanitizeStyles(styles);

          Object.assign(el.style, safeStyles);

          el._styleBinding.lastStyles = JSON.stringify(styles);
        } catch (error) {
          ErrorManager.handle(error, {
            context: 'TemplateManager.processDataStyle',
            data: {el, value, context, binding}
          });
        }
      };

      updateStyles();

      if (context.reactive && context._updateQueue) {
        context._updateQueue.add(updateStyles);
      }

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataStyle',
        data: {el, value, context}
      });
    }
  },

  sanitizeStyles(styles) {
    const allowedProperties = [
      'display', 'position', 'top', 'right', 'bottom', 'left', 'float', 'clear',
      'visibility', 'opacity', 'zIndex', 'overflow', 'clip',
      'width', 'height', 'margin', 'padding', 'border',
      'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
      'boxShadow', 'boxSizing',
      'textOverflow', 'whiteSpace',
      'maxWidth', 'maxHeight', 'minWidth', 'minHeight',
      'color', 'background', 'backgroundColor', 'backgroundImage',
      'fontSize', 'fontFamily', 'fontWeight', 'textAlign', 'lineHeight',
      'letterSpacing', 'textTransform', 'textDecoration', 'textIndent',
      'flex', 'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis',
      'justifyContent', 'alignItems', 'alignContent', 'gap',
      'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow',
      'transform', 'transformOrigin', 'perspective',
      'transition', 'animation',
      'cursor', 'pointerEvents'
    ];

    const safeStyles = {};
    for (const [key, value] of Object.entries(styles)) {
      if (allowedProperties.includes(key)) {
        if (typeof value === 'string' && value.includes('url(')) {
          const urlValue = this.sanitizeUrlValue(value);
          if (urlValue) {
            safeStyles[key] = urlValue;
          }
        } else {
          safeStyles[key] = value;
        }
      }
    }

    return safeStyles;
  },

  /**
   * Sanitize URL values in CSS to prevent XSS attacks
   * Supports: http://, https://, relative paths, and data:image/* (including base64)
   * Blocks: javascript:, data:text/html, and other dangerous protocols
   */
  sanitizeUrlValue(value) {
    if (!value || typeof value !== 'string') return null;

    // Extract URL from url() function
    const urlMatch = /url\(['"]?([^'"]*)['"]?\)/.exec(value);
    if (!urlMatch || !urlMatch[1]) return null;

    const url = urlMatch[1].trim();
    if (!url) return null;

    // Check for dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:text/', 'vbscript:', 'file:', 'about:'];
    const lowerUrl = url.toLowerCase();

    for (const protocol of dangerousProtocols) {
      if (lowerUrl.startsWith(protocol)) {
        ErrorManager.handle(`Blocked dangerous protocol in URL: ${protocol}`, {
          context: 'TemplateManager.sanitizeUrlValue',
          data: {url},
          logLevel: 'warn'
        });
        return null;
      }
    }

    // Allow data:image/* URLs (including base64)
    if (lowerUrl.startsWith('data:')) {
      // Validate that it's an image mime type
      const imageMimeTypes = ['data:image/png', 'data:image/jpeg', 'data:image/jpg',
        'data:image/gif', 'data:image/svg+xml', 'data:image/webp',
        'data:image/bmp', 'data:image/ico', 'data:image/x-icon'];

      const isValidImage = imageMimeTypes.some(mime => lowerUrl.startsWith(mime));

      if (!isValidImage) {
        ErrorManager.handle('Blocked non-image data URL', {
          context: 'TemplateManager.sanitizeUrlValue',
          data: {url: url.substring(0, 50) + '...'},
          logLevel: 'warn'
        });
        return null;
      }

      // Validate base64 encoding if present
      if (lowerUrl.includes(';base64,')) {
        const base64Part = url.split(';base64,')[1];
        if (base64Part) {
          // Basic validation: check if it looks like valid base64
          if (!/^[A-Za-z0-9+/]+=*$/.test(base64Part.substring(0, Math.min(100, base64Part.length)))) {
            ErrorManager.handle('Invalid base64 encoding in data URL', {
              context: 'TemplateManager.sanitizeUrlValue',
              data: {url: url.substring(0, 50) + '...'},
              logLevel: 'warn'
            });
            return null;
          }
        }
      }

      return `url(${url})`;
    }

    // Allow http:// and https:// URLs
    if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
      try {
        const urlObj = new URL(url);
        // Additional validation: ensure it's really http/https
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          return null;
        }
        return `url(${url})`;
      } catch (e) {
        ErrorManager.handle('Invalid absolute URL', {
          context: 'TemplateManager.sanitizeUrlValue',
          data: {url},
          logLevel: 'warn'
        });
        return null;
      }
    }

    // Allow relative URLs (no protocol)
    if (!lowerUrl.includes(':')) {
      // Block path traversal attempts
      if (url.includes('../') || url.includes('..\\')) {
        ErrorManager.handle('Blocked path traversal in URL', {
          context: 'TemplateManager.sanitizeUrlValue',
          data: {url},
          logLevel: 'warn'
        });
        return null;
      }

      // Basic validation: should look like a valid path
      if (!/^[a-zA-Z0-9\/_\-\.]+(\?[a-zA-Z0-9=&_\-]*)?$/.test(url)) {
        ErrorManager.handle('Invalid relative URL format', {
          context: 'TemplateManager.sanitizeUrlValue',
          data: {url},
          logLevel: 'warn'
        });
        return null;
      }

      return `url(${url})`;
    }

    // Block everything else
    ErrorManager.handle('Blocked unrecognized URL format', {
      context: 'TemplateManager.sanitizeUrlValue',
      data: {url},
      logLevel: 'warn'
    });
    return null;
  },

  processDataFor(el, value, context) {
    if (!el || !value || !context) return;

    const matches = value.match(/(\w+)\s+(?:in|of)\s+(.+)/);
    if (!matches) {
      ErrorManager.handle(`Invalid data-for expression: ${value}`, {
        context: 'TemplateManager.processDataFor',
        data: {el, value, context},
        logLevel: 'warn'
      });
      return;
    }

    try {
      const [_, itemName, arrayExpr] = matches;

      if (!el._forBinding) {
        el._forBinding = {
          value,
          itemName,
          arrayExpr,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
          lastHash: null
        };
      } else {
        // Update binding with new context when re-processing
        el._forBinding.originalState = this.deepClone(context.state);
        el._forBinding.originalContext = {...context};
      }

      const updateList = () => {
        try {
          let array = ExpressionEvaluator.evaluate(arrayExpr, {...context.state, ...context.computed}, context);

          if (!array && el._forBinding.originalState) {
            array = ExpressionEvaluator.evaluate(arrayExpr, {...el._forBinding.originalState, ...el._forBinding.originalContext.computed}, context);
          }

          if (!Array.isArray(array)) return;

          const currentHash = JSON.stringify(array);
          if (el._forBinding.lastHash === currentHash) {
            return;
          }

          const templateElement = el.querySelector('template');
          if (!templateElement) {
            ErrorManager.handle('No template found in data-for element', {
              context: 'TemplateManager.processDataFor',
              data: {el, value, context},
              logLevel: 'warn'
            });
            return;
          }

          Array.from(el.childNodes).forEach(child => {
            if (child !== templateElement) {
              el.removeChild(child);
            }
          });

          array.forEach((item, index) => {
            const childContext = {
              ...context,
              state: {
                ...context.state,
                [itemName]: item,
                index
              },
              computed: context.computed,
              methods: context.methods,
              reactive: context.reactive,
              _updateQueue: context._updateQueue
            };

            const clone = templateElement.content.cloneNode(true);

            this.processDataDirectives(clone, childContext);
            this.processInterpolation(clone, childContext);

            el.appendChild(clone);
          });

          el._forBinding.lastHash = currentHash;
        } catch (error) {
          ErrorManager.handle(error, {
            context: 'TemplateManager.processDataFor',
            type: 'error:template',
            data: {el, value}
          });
        }
      };

      updateList();

      this.setupReactiveUpdate(el, context, 'For', updateList);

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataFor',
        type: 'error:template',
        data: {el, value}
      });
    }
  },

  processDataOn(el, value, context) {
    if (!el || !value || !context) return;

    const modifiers = {
      prevent: (e) => {e.preventDefault(); return true;},
      stop: (e) => {e.stopPropagation(); return true;},
      once: () => true,
      capture: () => true,
      self: (e, el) => e.target === el,
      trusted: (e) => e.isTrusted,
      enter: (e) => e.key === 'Enter',
      tab: (e) => e.key === 'Tab',
      esc: (e) => e.key === 'Escape',
      space: (e) => e.key === ' ',
      left: (e) => e.button === 0,
      right: (e) => e.button === 2,
      middle: (e) => e.button === 1,
      ctrl: (e) => e.ctrlKey,
      alt: (e) => e.altKey,
      shift: (e) => e.shiftKey,
      meta: (e) => e.metaKey
    };

    try {
      if (!el._eventBinding) {
        el._eventBinding = {
          value,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
          handlers: new Map(),
          lastTriggered: {}
        };
      } else {
        // Update binding with new context when re-processing
        el._eventBinding.originalState = this.deepClone(context.state);
        el._eventBinding.originalContext = {...context};
      }

      const bindings = value.split(',').map(b => b.trim());

      bindings.forEach(binding => {
        const [eventInfo, handlerExpr] = binding.split(':').map(s => s.trim());
        if (!eventInfo || !handlerExpr) {
          ErrorManager.handle(`Invalid event binding: ${binding}`, {
            context: 'TemplateManager.processDataOn',
            data: {el, value, context},
            logLevel: 'warn'
          });
          return;
        }

        const [eventType, ...modifierList] = eventInfo.split('.');

        if (el.tagName === 'BUTTON' && eventType === 'click') {
          if (!modifierList.includes('stop')) {
            modifierList.push('stop');
          }
        }

        const oldHandler = el._eventBinding.handlers.get(eventType);
        if (oldHandler) {
          EventSystemManager.removeHandler(oldHandler);
        }

        const methodMatch = handlerExpr.match(/(\w+)(?:\((.*?)\))?/);
        if (!methodMatch) {
          ErrorManager.handle(`Invalid method expression: ${handlerExpr}`, {
            context: 'TemplateManager.processDataOn',
            data: {el, value, context},
            logLevel: 'warn'
          });
          return;
        }

        const [_, methodName, argsStr] = methodMatch;

        // Try to find method in component first, then fallback to global scope
        let method = context.methods?.[methodName];
        let isGlobalFunction = false;

        if (typeof method !== 'function') {
          // Fallback to global function
          if (typeof window[methodName] === 'function') {
            method = window[methodName];
            isGlobalFunction = true;
          } else {
            ErrorManager.handle(`Method "${methodName}" not found in component or global scope`, {
              context: 'TemplateManager.processDataOn',
              data: {el, value, context},
              logLevel: 'warn'
            });
            return;
          }
        }

        const parseArgument = (arg) => {
          arg = arg?.trim();
          if (!arg) return null;

          if (arg.startsWith("'") || arg.startsWith('"')) {
            return arg.slice(1, -1);
          }

          return () => {
            let value = ExpressionEvaluator.evaluate(arg, {...context.state, ...context.computed, $event: null}, context);

            if (value === undefined && el._eventBinding.originalState) {
              value = ExpressionEvaluator.evaluate(arg, {...el._eventBinding.originalState, ...el._eventBinding.originalContext.computed}, context);
            }

            return value;
          };
        };

        const args = argsStr ? argsStr.split(',').map(parseArgument).filter(Boolean) : [];

        const handler = (event) => {
          try {
            const now = Date.now();
            const lastTrigger = el._eventBinding.lastTriggered[eventType] || 0;
            const minInterval = 100;

            if (now - lastTrigger < minInterval) {
              return;
            }

            if (!el.contains(event.target) && el !== event.target) {
              return;
            }

            const modifiersPassed = modifierList.every(modifier => {
              const modifierFn = modifiers[modifier];
              return modifierFn ? modifierFn(event, el) : true;
            });

            if (!modifiersPassed) return;

            el._eventBinding.lastTriggered[eventType] = now;

            const evaluatedArgs = args.map(arg =>
              typeof arg === 'function' ? arg() : arg
            );

            method.apply(isGlobalFunction ? null : context, [...evaluatedArgs, event]);

            if (modifierList.includes('once')) {
              EventSystemManager.removeHandler(handlerId);
            }

          } catch (error) {
            ErrorManager.handle(error, {
              context: 'TemplateManager.processDataOn',
              type: 'template:error',
              data: {methodName, el, value, context}
            });
          }
        };

        const handlerId = EventSystemManager.addHandler(
          el,
          eventType,
          handler,
          {
            componentId: context.id,
            capture: modifierList.includes('capture'),
            passive: eventType === 'scroll' || eventType === 'touchmove'
          }
        );

        el._eventBinding.handlers.set(eventType, handlerId);

      });

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataOn',
        type: 'template:error',
        data: {el, value, context}
      });
    }
  },

  processDataContainer(el, value, context) {
    if (!el || !value || !context) return;

    try {
      if (!el._containerBinding) {
        el._containerBinding = {
          value,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
          currentPath: null
        };
      } else {
        // Update binding with new context when re-processing
        el._containerBinding.originalState = this.deepClone(context.state);
        el._containerBinding.originalContext = {...context};
      }
      const updateContainer = () => {
        const loadComponent = async (componentRef) => {
          try {
            if (typeof componentRef === 'string') {
              const template = await this.loadFromServer(componentRef);
              if (!template) throw new Error(`Failed to load template: ${componentRef}`);

              const childContext = {
                ...context,
                parentId: context.id,
                state: {...context.state},
                path: componentRef
              };

              return {template, context: childContext};

            } else if (componentRef && typeof componentRef === 'object') {
              if (!componentRef.template) {
                throw new Error('Component definition missing template');
              }

              const childContext = {
                ...context,
                ...componentRef,
                parentId: context.id,
                state: {...context.state, ...componentRef.state}
              };

              return {template: componentRef.template, context: childContext};
            }

            throw new Error('Invalid component reference');

          } catch (error) {
            ErrorManager.handle('Component load failed', {
              context: 'TemplateManager.processDataContainer',
              data: {el, value, context, error}
            });
            return null;
          }
        };

        const renderComponent = async (componentRef) => {
          try {
            const component = await loadComponent(componentRef);
            if (!component) return;

            el.innerHTML = '';

            const container = document.createElement('div');
            container.innerHTML = component.template;

            this.processDataDirectives(container, component.context);
            this.processInterpolation(container, component.context);

            el.appendChild(container);

            el._containerBinding.currentPath = typeof componentRef === 'string' ?
              componentRef : null;

          } catch (error) {
            ErrorManager.handle('Component render failed', {
              context: 'TemplateManager.processDataContainer',
              data: {el, value, context, error}
            });
            el.innerHTML = this.renderError(error);
          }
        };

        const componentRef = ExpressionEvaluator.evaluate(value, {...context.state, ...context.methods}, context);
        if (!componentRef) return;

        renderComponent(componentRef);
      };

      updateContainer();

      this.setupReactiveUpdate(el, context, 'Container', updateContainer);

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataContainer',
        data: {el, value, context}
      });
      el.innerHTML = this.renderError(error);
    }
  },

  processDataModel(el, value, context) {
    if (!el || !value || !context) return;

    try {
      if (!el._modelBinding) {
        el._modelBinding = {
          value,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
          lastValue: null,
          initialValue: null,
          isActive: false,
          selectionStart: null,
          selectionEnd: null,
          modifiers: {
            lazy: false,
            number: false,
            trim: false
          }
        };

        el.addEventListener('focus', () => {
          el._modelBinding.isActive = true;
          el._modelBinding.selectionStart = el.selectionStart;
          el._modelBinding.selectionEnd = el.selectionEnd;
        });

        el.addEventListener('blur', () => {
          el._modelBinding.isActive = false;
          el._modelBinding.selectionStart = null;
          el._modelBinding.selectionEnd = null;
        });

        const parts = value.split('.');
        parts.slice(1).forEach(mod => {
          if (mod in el._modelBinding.modifiers) {
            el._modelBinding.modifiers[mod] = true;
          }
        });
        el._modelBinding.value = parts[0];
      } else {
        // Update binding with new context when re-processing
        el._modelBinding.originalState = this.deepClone(context.state);
        el._modelBinding.originalContext = {...context};
      }

      const updateModel = () => {
        const binding = el._modelBinding;

        const getModelValue = () => {
          let modelValue = ExpressionEvaluator.evaluate(binding.value, {...context.state, ...context.computed}, context);

          if (modelValue === undefined && el._modelBinding.originalState) {
            modelValue = ExpressionEvaluator.evaluate(binding.value, {...el._modelBinding.originalState, ...el._modelBinding.originalContext.computed}, context);
          }

          if (binding.modifiers.number) {
            modelValue = modelValue === '' ? null : Number(modelValue);
          }

          if (binding.modifiers.trim && typeof modelValue === 'string') {
            modelValue = modelValue.trim();
          }

          return modelValue;
        };

        const updateModel = (newValue) => {
          try {
            const parts = binding.value.split('.');
            const prop = parts.pop();
            const target = parts.length ?
              parts.reduce((obj, key) => obj[key], context.state) :
              context.state;

            if (!target || typeof prop !== 'string') return;

            if (binding.modifiers.number) {
              newValue = newValue === '' ? null : Number(newValue);
            }
            if (binding.modifiers.trim && typeof newValue === 'string') {
              newValue = newValue.trim();
            }

            if (newValue !== binding.lastValue) {
              binding.lastValue = newValue;
              target[prop] = newValue;
            }
          } catch (error) {
            ErrorManager.handle(error, {
              context: 'TemplateManager.processDataModel',
              data: {el, value, context}
            });
          }
        };

        if (el._modelHandlers) {
          Object.entries(el._modelHandlers).forEach(([event, handler]) => {
            el.removeEventListener(event, handler);
          });
        }

        el.addEventListener('focus', () => {
          binding.isActive = true;
          binding.selectionStart = el.selectionStart;
          binding.selectionEnd = el.selectionEnd;
        });

        el.addEventListener('blur', () => {
          binding.isActive = false;
          binding.selectionStart = null;
          binding.selectionEnd = null;
        });

        el._modelHandlers = {};

        switch (el.type) {
          case 'checkbox':
            el._modelHandlers.change = e => updateModel(e.target.checked);
            break;

          case 'radio':
            el._modelHandlers.change = e => {
              if (e.target.checked) {
                updateModel(e.target.value);
              }
            };
            break;

          case 'file':
            el._modelHandlers.change = e => updateModel(e.target.files);
            break;

          case 'select-multiple':
            el._modelHandlers.change = e => {
              const selected = Array.from(e.target.selectedOptions)
                .map(opt => opt.value);
              updateModel(selected);
            };
            break;

          default:
            const eventType = binding.modifiers.lazy ? 'change' : 'input';
            el._modelHandlers[eventType] = e => updateModel(e.target.value);

            el._modelHandlers.keydown = e => {
              if (e.key === 'Enter') {
                updateModel(e.target.value);
              }
            };
        }

        Object.entries(el._modelHandlers).forEach(([event, handler]) => {
          el.addEventListener(event, handler);
        });

        const initialValue = getModelValue();
        binding.initialValue = initialValue;

        if (el.type === 'checkbox') {
          el.checked = !!initialValue;
        } else if (el.type === 'radio') {
          el.checked = el.value === String(initialValue);
        } else if (el.type === 'select-multiple' && Array.isArray(initialValue)) {
          Array.from(el.options).forEach(option => {
            option.selected = initialValue.includes(option.value);
          });
        } else if (el.tagName === 'SELECT') {
          el.value = initialValue ?? '';
          if (el.value !== String(initialValue)) {
            Array.from(el.options).forEach(option => {
              option.selected = option.value === String(initialValue);
            });
          }
        } else {
          el.value = initialValue ?? '';
        }
      };

      updateModel();

      this.setupReactiveUpdate(el, context, 'Model', updateModel);

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataModel',
        data: {el, value, context}
      });
    }
  },

  processDataChecked(el, expression, context) {
    if (!el || !expression || !context) return;

    if (!['checkbox', 'radio'].includes(el.type)) {
      ErrorManager.handle('data-checked only works with checkbox/radio inputs', {
        context: 'TemplateManager.processDataChecked',
        data: {el, expression, context},
        logLevel: 'warn'
      });
      return;
    }

    try {
      if (!el._checkedBinding) {
        el._checkedBinding = {
          expression,
          originalState: this.deepClone(context.state),
          originalContext: {...context},
          lastValue: null
        };
      } else {
        // Update binding with new context when re-processing
        el._checkedBinding.originalState = this.deepClone(context.state);
        el._checkedBinding.originalContext = {...context};
      }

      const updateChecked = () => {
        if (!el) return;

        try {
          const currentChecked = el.checked;

          let isChecked = ExpressionEvaluator.evaluate(el._checkedBinding.expression, {...context.state, ...context.computed}, context);

          if (isChecked === undefined && el._checkedBinding) {
            isChecked = ExpressionEvaluator.evaluate(el._checkedBinding.expression, {...el._checkedBinding.originalState, ...el._checkedBinding.originalContext.computed}, context);
          }

          if (isChecked === currentChecked) {
            return;
          }

          el.checked = !!isChecked;
          el._checkedBinding.lastValue = !!isChecked;

        } catch (error) {
          ErrorManager.handle(error, {
            context: 'TemplateManager.processDataChecked',
            data: {el, expression, context}
          });
          el.checked = false;
        }
      };

      updateChecked();

      this.setupReactiveUpdate(el, context, 'Checked', updateChecked);

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.processDataChecked',
        data: {el, expression, context}
      });
      el.checked = false;
    }
  },

  deepClone(obj, seen = new WeakMap()) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (seen.has(obj)) {
      return seen.get(obj);
    }

    const clone = Array.isArray(obj) ? [] : {};
    seen.set(obj, clone);

    Object.entries(obj).forEach(([key, value]) => {
      clone[key] = this.deepClone(value, seen);
    });

    return clone;
  },

  cloneState(state) {
    if (!state || typeof state !== 'object') return state;
    const clone = Array.isArray(state) ? [] : {};

    for (const key in state) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        const value = state[key];
        clone[key] = typeof value === 'object' ? this.cloneState(value) : value;
      }
    }

    return clone;
  },

  cleanupElement(element) {
    if (!element) return;

    try {
      if (element._eventBinding) {
        element._eventBinding.handlers.forEach(handlerId => {
          EventSystemManager.removeHandler(handlerId);
        });
        delete element._eventBinding;
      }

      const bindingTypes = [
        '_textBinding',
        '_htmlBinding',
        '_ifBinding',
        '_forBinding',
        '_classBinding',
        '_attrBinding',
        '_styleBinding',
        '_modelBinding',
        '_containerBinding',
        '_checkedBinding'
      ];

      bindingTypes.forEach(type => {
        if (element[type]) {
          if (element[type].cleanup) {
            element[type].cleanup();
          }
          delete element[type];
        }
      });

      if (element._updateQueue) {
        element._updateQueue.clear();
        delete element._updateQueue;
      }

      const componentId = element.dataset?.componentId;
      if (componentId) {
        delete element.dataset.componentId;
        delete element.dataset.parentContext;
      }

      Array.from(element.children).forEach(child => {
        this.cleanupElement(child);
      });

      Object.keys(element).forEach(key => {
        if (key.startsWith('_')) {
          delete element[key];
        }
      });

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.cleanupElement',
        data: {element}
      });
    }
  },

  cleanupComponent(componentId) {
    if (!componentId) return;

    try {
      this.cleanupComponentHandlers(componentId);

      const cacheKey = `template:${componentId}`;
      if (this.state.cache.has(cacheKey)) {
        this.state.cache.delete(cacheKey);
        this.state.itemTimestamps.delete(cacheKey);
      }

      const elements = document.querySelectorAll(`[data-component-id="${componentId}"]`);
      elements.forEach(element => {
        this.cleanupElement(element);
      });

      EventManager.emit('template:cleanup', {
        componentId,
      });

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.cleanupComponent',
        data: {componentId}
      });
    }
  },

  cleanup() {
    try {
      this.state.cache.clear();
      this.state.itemTimestamps.clear();

      this.cleanupHandlers();

      const root = document.querySelector(Now.config.mainSelector);
      if (root) {
        this.cleanupElement(root);
      }

      this.state.currentComputation = null;
      this.state.handlers = new Map();
      this.state.pendingUpdates = new Set();

      EventManager.emit('template:cleanup:all');

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'TemplateManager.cleanup'
      });
    }
  },

  valueToString(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  },

  setStateValue(path, value, state) {
    const parts = path.split('.');
    const key = parts.pop();
    const target = parts.reduce((obj, k) => obj[k] = obj[k] || {}, state);
    target[key] = value;
  },

  processTemplateContent(element, context) {
    this.processDataDirectives(element, context);
    this.processInterpolation(element, context);
  },

  render(context, container) {
    if (!context || typeof context !== 'object') {
      ErrorManager.handle('Invalid context provided to render.', {
        context: 'TemplateManager.render',
        data: {context, container}
      });
      return;
    }

    if (!(container instanceof HTMLElement)) {
      ErrorManager.handle('Container must be a valid DOM element.', {
        context: 'TemplateManager.render',
        data: {context, container}
      });
      return;
    }

    container.innerHTML = '';

    const processedTemplate = this.processTemplate(context.template, context);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processedTemplate;

    while (tempDiv.firstChild) {
      container.appendChild(tempDiv.firstChild);
    }

    const eventManager = Now.getManager('event');
    if (eventManager) {
      eventManager.emit('template:render', {
        componentId: context.id,
        timestamp: Date.now(),
        container: container
      });
    }
  },

  cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.state.cache) {
      if (entry.expires < now) {
        this.state.cache.delete(key);
        this.state.itemTimestamps.delete(key);
      }
    }
  },

  registerEventHandler(handlerExpr, context) {
    const handlerId = `evt_${Utils.generateUUID()}`;
    const [methodName, argsString] = handlerExpr.split('(');
    const args = argsString ? argsString.replace(')', '').split(',').map(arg => arg.trim()) : [];
    this.state.handlers = this.state.handlers || new Map();
    this.state.handlers.set(handlerId, (event) => {
      const method = context.methods[methodName.trim()];
      if (typeof method === 'function') {
        method.apply(context, args.concat(event));
      } else {
        ErrorManager.handle(`Method ${methodName.trim()} not found in the component`, {
          context: 'TemplateManager.registerEventHandler',
          data: {methodName, context}
        });
      }
    });

    this.state.itemTimestamps.set(handlerId, Date.now());
    return handlerId;
  },

  cleanupHandlers() {
    const componentManager = Now.getManager('component');
    if (!componentManager) return;

    const activeIds = new Set(Array.from(componentManager.instances.keys())
      .map(el => el.dataset.componentId)
      .filter(Boolean));

    for (const [handlerId] of this.state.handlers) {
      const [componentId] = handlerId.split('_');
      if (!activeIds.has(componentId)) {
        this.state.handlers.delete(handlerId);
      }
    }
  },

  cleanupComponentHandlers(componentId) {
    if (!componentId) return;

    const selector = `[data-handler-id^="${componentId}_"]`;
    document.querySelectorAll(selector).forEach(element => {
      const handlerId = element.dataset.handlerId;
      const handler = this.state.handlers.get(handlerId);
      if (handler) {
        const eventType = handlerId.split('_')[2];
        element.removeEventListener(eventType, handler, true);
        this.state.handlers.delete(handlerId);
        delete element.dataset.handlerId;
      }
    });
  },

  startCleanupInterval() {
    this.stopCleanupInterval();

    this.state.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanup.interval);

    window.addEventListener('beforeunload', () => {
      this.stopCleanupInterval();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.stopCleanupInterval();
      }
    });
  },

  stopCleanupInterval() {
    if (this.state.cleanupInterval) {
      clearInterval(this.state.cleanupInterval);
      this.state.cleanupInterval = null;
    }
  },

  onComponentDestroy(component) {
    if (component.id) {
      this.cleanupComponentHandlers(component.id);

      const cacheKey = `template:${component.id}`;
      if (this.state.cache.has(cacheKey)) {
        this.state.cache.delete(cacheKey);
        this.state.itemTimestamps.delete(cacheKey);
      }
    }
  },

  performCleanup() {
    const now = Date.now();
    const maxBatch = this.config.cleanup.batchSize;
    let processed = 0;

    EventManager.emit('app:cleanup:start', {timestamp: now});

    for (const [key, entry] of this.state.cache) {
      if (now - this.state.itemTimestamps.get(key) > this.config.cleanup.maxCacheAge) {
        this.state.cache.delete(key);
        this.state.itemTimestamps.delete(key);
        processed++;
      }
      if (processed >= maxBatch) break;
    }

    processed = 0;
    for (const [key, value] of this.state.handlers?.entries() || []) {
      if (now - this.state.itemTimestamps.get(key) > this.config.cleanup.maxHandlerAge) {
        this.state.handlers.delete(key);
        this.state.itemTimestamps.delete(key);
        processed++;
      }
      if (processed >= maxBatch) break;
    }

    this.state.lastCleanup = now;

    EventManager.emit('app:cleanup:end', {timestamp: now});
  }
};

if (window.Now?.registerManager) {
  Now.registerManager('template', TemplateManager);
}

// Expose globally
window.TemplateManager = TemplateManager;
