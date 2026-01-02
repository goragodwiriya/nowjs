/**
 * RichTextEditor - Main entry point for the Rich Text Editor
 * A modular, plugin-based WYSIWYG editor inspired by CKEditor
 *
 * @author Goragod Wiriya
 * @version 1.0
 */
import EventBus from './core/EventBus.js';
import CommandManager from './core/CommandManager.js';
import HistoryManager from './core/HistoryManager.js';
import SelectionManager from './core/SelectionManager.js';
import KeyboardManager from './core/KeyboardManager.js';
import Toolbar from './ui/Toolbar.js';
import ContentArea from './ui/ContentArea.js';

class RichTextEditor {
  /**
   * Create a RichTextEditor instance
   * @param {string|HTMLElement} element - Target element or selector
   * @param {Object} options - Configuration options
   */
  constructor(element, options = {}) {
    // Get target element
    this.targetElement = typeof element === 'string'
      ? document.querySelector(element)
      : element;

    if (!this.targetElement) {
      throw new Error('RichTextEditor: Target element not found');
    }

    // Default options
    this.options = {
      height: 'auto',
      minHeight: 200,
      maxHeight: null,
      placeholder: '',
      readOnly: false,
      toolbar: Toolbar.defaultItems,
      stickyToolbar: false,
      plugins: [],
      autofocus: false,
      sanitize: true,
      ...options
    };

    // Core components
    this.events = null;
    this.commands = null;
    this.history = null;
    this.selection = null;
    this.keyboard = null;
    this.toolbar = null;
    this.contentArea = null;

    // State
    this.container = null;
    this.plugins = new Map();
    this.initialized = false;
    this.isSourceMode = false;
    this.isFullscreen = false;

    // Initialize
    this.init();
  }

  /**
   * Initialize the editor
   */
  init() {
    // Create event bus first
    this.events = new EventBus();

    // Create core managers
    this.selection = new SelectionManager(this);
    this.commands = new CommandManager(this);
    this.history = new HistoryManager(this, {
      maxHistory: this.options.maxHistory || 100
    });
    this.keyboard = new KeyboardManager(this);

    // Build UI
    this.buildUI();

    // Initialize managers that need UI
    this.keyboard.init();

    // Initialize history with current content
    this.history.init();

    // Load plugins
    this.loadPlugins();

    // Set initial content if target was textarea
    if (this.targetElement.tagName === 'TEXTAREA') {
      const content = this.targetElement.value;
      if (content) {
        this.setContent(content);
      }
    }

    this.initialized = true;

    // Emit init event
    this.events.emit(EventBus.Events.EDITOR_INIT, this);

    // Auto focus if requested
    if (this.options.autofocus) {
      this.focus();
    }

    // Emit ready event on next tick
    requestAnimationFrame(() => {
      this.events.emit(EventBus.Events.EDITOR_READY, this);
      this.plugins.forEach(plugin => plugin.onReady?.());
    });
  }

  /**
   * Build the editor UI
   */
  buildUI() {
    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'rte-container';

    if (this.options.height !== 'auto') {
      this.container.style.height = typeof this.options.height === 'number'
        ? `${this.options.height}px`
        : this.options.height;
    }

    // Create toolbar
    this.toolbar = new Toolbar(this, {
      items: this.options.toolbar,
      sticky: this.options.stickyToolbar
    });
    this.container.appendChild(this.toolbar.create());

    // Create content area
    this.contentArea = new ContentArea(this, {
      minHeight: this.options.minHeight,
      maxHeight: this.options.maxHeight,
      placeholder: this.options.placeholder,
      readOnly: this.options.readOnly
    });
    this.container.appendChild(this.contentArea.create());

    // Create footer (for word count, etc.)
    this.footer = document.createElement('div');
    this.footer.className = 'rte-footer';
    this.container.appendChild(this.footer);

    // Replace target or insert after
    if (this.targetElement.tagName === 'TEXTAREA') {
      this.targetElement.style.display = 'none';
      this.targetElement.parentNode.insertBefore(this.container, this.targetElement.nextSibling);

      // Sync content to textarea on change
      this.events.on(EventBus.Events.CONTENT_CHANGE, () => {
        this.targetElement.value = this.getContent();
      });
    } else {
      // Get existing content
      const existingContent = this.targetElement.innerHTML;

      // Replace element contents
      this.targetElement.innerHTML = '';
      this.targetElement.appendChild(this.container);

      // Set existing content
      if (existingContent.trim()) {
        this.setContent(existingContent);
      }
    }
  }

  /**
   * Load configured plugins
   */
  loadPlugins() {
    const pluginConfigs = this.options.plugins;

    pluginConfigs.forEach(pluginConfig => {
      let PluginClass;
      let pluginOptions = {};

      if (typeof pluginConfig === 'string') {
        // Plugin name string - load from registered plugins
        PluginClass = RichTextEditor.registeredPlugins.get(pluginConfig);
        pluginOptions = this.options[pluginConfig] || {};
      } else if (typeof pluginConfig === 'object') {
        // Plugin config object
        PluginClass = pluginConfig.plugin || RichTextEditor.registeredPlugins.get(pluginConfig.name);
        pluginOptions = pluginConfig.options || this.options[pluginConfig.name] || {};
      } else if (typeof pluginConfig === 'function') {
        // Plugin class directly
        PluginClass = pluginConfig;
      }

      if (PluginClass) {
        this.loadPlugin(PluginClass, pluginOptions);
      } else if (typeof pluginConfig === 'string') {
        console.warn(`RichTextEditor: Plugin "${pluginConfig}" not found`);
      }
    });
  }

  /**
   * Load a single plugin
   * @param {Function} PluginClass - Plugin class
   * @param {Object} options - Plugin options
   */
  loadPlugin(PluginClass, options = {}) {
    const pluginName = PluginClass.pluginName || PluginClass.name;

    // Check if already loaded
    if (this.plugins.has(pluginName)) {
      console.warn(`RichTextEditor: Plugin "${pluginName}" already loaded`);
      return;
    }

    // Check dependencies
    const requires = PluginClass.requires || [];
    for (const dep of requires) {
      if (!this.plugins.has(dep)) {
        console.warn(`RichTextEditor: Plugin "${pluginName}" requires "${dep}"`);
      }
    }

    // Create and initialize plugin
    const plugin = new PluginClass(this, options);
    plugin.init();

    this.plugins.set(pluginName, plugin);

    // Emit event
    this.events.emit(EventBus.Events.PLUGIN_LOAD, {name: pluginName, plugin});
  }

  /**
   * Unload a plugin
   * @param {string} pluginName - Plugin name
   */
  unloadPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      plugin.destroy();
      this.plugins.delete(pluginName);
      this.events.emit(EventBus.Events.PLUGIN_UNLOAD, {name: pluginName});
    }
  }

  /**
   * Get a loaded plugin
   * @param {string} pluginName - Plugin name
   * @returns {PluginBase|null}
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName) || null;
  }

  /**
   * Get editor content (HTML)
   * @returns {string}
   */
  getContent() {
    if (this.isSourceMode) {
      return this.sourceEditor?.value || '';
    }
    return this.contentArea?.getContent() || '';
  }

  /**
   * Set editor content
   * @param {string} html - HTML content
   * @param {boolean} recordHistory - Whether to record in history
   */
  setContent(html, recordHistory = true) {
    const cleanedHtml = this.options.sanitize ? this.sanitizeHtml(html) : html;

    if (this.isSourceMode) {
      if (this.sourceEditor) {
        this.sourceEditor.value = cleanedHtml;
      }
    } else {
      this.contentArea?.setContent(cleanedHtml, recordHistory);
    }

    this.events.emit(EventBus.Events.CONTENT_SET, cleanedHtml);
  }

  /**
   * Sanitize HTML content
   * @param {string} html - Raw HTML
   * @returns {string} Sanitized HTML
   */
  sanitizeHtml(html) {
    if (!html) return '';

    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove script tags
    temp.querySelectorAll('script').forEach(el => el.remove());

    // Remove event handlers
    temp.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on') || attr.value.includes('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return temp.innerHTML;
  }

  /**
   * Clear editor content
   */
  clear() {
    this.setContent('');
  }

  /**
   * Focus the editor
   */
  focus() {
    this.contentArea?.focus();
  }

  /**
   * Blur the editor
   */
  blur() {
    this.contentArea?.blur();
  }

  /**
   * Check if editor has focus
   * @returns {boolean}
   */
  hasFocus() {
    return this.contentArea?.hasFocus() || false;
  }

  /**
   * Execute a command
   * @param {string} command - Command name
   * @param {...any} args - Command arguments
   */
  execute(command, ...args) {
    return this.commands?.execute(command, ...args);
  }

  /**
   * Subscribe to editor event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    return this.events?.on(event, callback);
  }

  /**
   * Unsubscribe from editor event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    this.events?.off(event, callback);
  }

  /**
   * Emit editor event
   * @param {string} event - Event name
   * @param {...any} args - Event arguments
   */
  emit(event, ...args) {
    this.events?.emit(event, ...args);
  }

  /**
   * Get text content (no HTML)
   * @returns {string}
   */
  getTextContent() {
    return this.contentArea?.getTextContent() || '';
  }

  /**
   * Get word count
   * @returns {number}
   */
  getWordCount() {
    return this.contentArea?.getWordCount() || 0;
  }

  /**
   * Get character count
   * @param {boolean} excludeSpaces - Exclude spaces
   * @returns {number}
   */
  getCharacterCount(excludeSpaces = false) {
    return this.contentArea?.getCharacterCount(excludeSpaces) || 0;
  }

  /**
   * Check if content is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.contentArea?.isEmpty() || true;
  }

  /**
   * Set read-only mode
   * @param {boolean} readOnly
   */
  setReadOnly(readOnly) {
    this.options.readOnly = readOnly;
    this.contentArea?.setReadOnly(readOnly);

    if (readOnly) {
      this.container?.classList.add('readonly');
    } else {
      this.container?.classList.remove('readonly');
    }
  }

  /**
   * Check if editor is read-only
   * @returns {boolean}
   */
  isReadOnly() {
    return this.options.readOnly;
  }

  /**
   * Toggle source view mode
   * @param {boolean} enabled - Enable source view
   */
  toggleSourceView(enabled) {
    this.isSourceMode = enabled !== undefined ? enabled : !this.isSourceMode;
    this.events.emit(EventBus.Events.MODE_CHANGE, {mode: this.isSourceMode ? 'source' : 'wysiwyg'});
  }

  /**
   * Toggle fullscreen mode
   * @param {boolean} enabled - Enable fullscreen
   */
  toggleFullscreen(enabled) {
    this.isFullscreen = enabled !== undefined ? enabled : !this.isFullscreen;

    if (this.isFullscreen) {
      this.container?.classList.add('fullscreen');
      document.body.classList.add('rte-fullscreen-active');
    } else {
      this.container?.classList.remove('fullscreen');
      document.body.classList.remove('rte-fullscreen-active');
    }

    this.events.emit(EventBus.Events.MODE_CHANGE, {fullscreen: this.isFullscreen});
  }

  /**
   * Show notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, warning, info)
   * @param {number} duration - Duration in ms
   */
  showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `rte-notification rte-notification-${type}`;
    notification.textContent = window.translate?.(message) || message;

    this.container?.appendChild(notification);

    // Show animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // Auto hide
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  /**
   * Get container element
   * @returns {HTMLElement}
   */
  getContainer() {
    return this.container;
  }

  /**
   * Get content element
   * @returns {HTMLElement}
   */
  getContentElement() {
    return this.contentArea?.getElement();
  }

  /**
   * Destroy the editor
   */
  destroy() {
    // Emit destroy event
    this.events?.emit(EventBus.Events.EDITOR_DESTROY, this);

    // Destroy plugins
    this.plugins.forEach(plugin => plugin.destroy());
    this.plugins.clear();

    // Destroy components
    this.keyboard?.destroy();
    this.history?.destroy();
    this.commands?.destroy();
    this.selection?.destroy();
    this.toolbar?.destroy();
    this.contentArea?.destroy();
    this.events?.destroy();

    // Restore original element if textarea
    if (this.targetElement?.tagName === 'TEXTAREA') {
      this.targetElement.style.display = '';
    }

    // Remove container
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // Cleanup references
    this.container = null;
    this.targetElement = null;
    this.initialized = false;
  }

  /**
   * Static: Register a plugin
   * @param {string} name - Plugin name
   * @param {Function} PluginClass - Plugin class
   */
  static registerPlugin(name, PluginClass) {
    RichTextEditor.registeredPlugins.set(name, PluginClass);
  }

  /**
   * Static: Unregister a plugin
   * @param {string} name - Plugin name
   */
  static unregisterPlugin(name) {
    RichTextEditor.registeredPlugins.delete(name);
  }

  /**
   * Static: Get all registered plugins
   * @returns {Map}
   */
  static getRegisteredPlugins() {
    return RichTextEditor.registeredPlugins;
  }

  /**
   * Static: Create editor instance
   * @param {string|HTMLElement} element - Target element
   * @param {Object} options - Options
   * @returns {RichTextEditor}
   */
  static create(element, options = {}) {
    return new RichTextEditor(element, options);
  }
}

// Static plugin registry
RichTextEditor.registeredPlugins = new Map();

// Event constants
RichTextEditor.Events = EventBus.Events;

// Export for ES modules
export default RichTextEditor;

// Export for global usage
if (typeof window !== 'undefined') {
  window.RichTextEditor = RichTextEditor;
}
