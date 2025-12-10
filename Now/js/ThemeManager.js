/**
 * Theme Management System
 * Handles theme switching and system preference synchronization
 *
 * Features:
 * - Light/Dark theme support
 * - System preference detection
 * - Theme persistence
 * - Auto registration with Now framework
 *
 * @version 1.0.0
 * @requires EventManager
 */
const ThemeManager = {
  /**
   * Default configuration
   * @type {Object}
   */
  config: {
    enabled: false,
    /** @type {string} Default theme to use when no preference is set */
    defaultTheme: 'light',

    /** @type {string} LocalStorage key for theme persistence */
    storageKey: 'app_theme',

    /** @type {boolean} Whether to use system color scheme preference */
    systemPreference: true
  },

  /**
   * Manager state
   * @type {Object}
   */
  state: {
    /** @type {string|null} Current active theme */
    current: null,

    /** @type {boolean} Whether manager is initialized */
    initialized: false
  },

  /**
   * Initialize theme manager
   * @async
   * @param {Object} options - Configuration options
   * @param {string} [options.defaultTheme='light'] - Default theme
   * @param {string} [options.storageKey='app_theme'] - Storage key
   * @param {boolean} [options.systemPreference=true] - Use system preference
   * @returns {Promise<ThemeManager>} This instance
   */
  async init(options = {}) {
    this.config = {...this.config, ...options};

    if (!this.config.enabled) {
      this.state.disabled = true;
      return this;
    }

    if (this.config.systemPreference) {
      this.setupSystemPreference();
    }

    await this.loadInitialTheme();

    this.state.initialized = true;

    Now.emit('theme:initialized', {theme: this.state.current});

    return this;
  },

  /**
   * Setup system color scheme preference listener
   * @private
   */
  setupSystemPreference() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e) => {
      if (!localStorage.getItem(this.config.storageKey)) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    handleChange(mediaQuery);
  },

  /**
   * Set active theme
   * @async
   * @param {string} theme - Theme to set ('light' or 'dark')
   * @fires theme:changed
   */
  async setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.state.current = theme;

    if (this.config.storageKey) {
      localStorage.setItem(this.config.storageKey, theme);
    }

    Now.emit('theme:changed', {theme});
  },

  /**
   * Get current active theme
   * @returns {string} Current theme
   */
  getCurrentTheme() {
    return this.state.current;
  },

  /**
   * Load and apply initial theme
   * @private
   * @async
   */
  async loadInitialTheme() {
    let theme = this.config.defaultTheme;

    const stored = localStorage.getItem(this.config.storageKey);
    if (stored) {
      theme = stored;
    } else if (this.config.systemPreference) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = prefersDark ? 'dark' : 'light';
    }

    await this.setTheme(theme);
  }
};

if (window.Now?.registerManager) {
  Now.registerManager('theme', ThemeManager);
}

window.ThemeManager = ThemeManager;
