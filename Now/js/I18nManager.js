const I18nManager = {
  config: {
    enabled: false,
    defaultLocale: 'en',
    availableLocales: ['en'],
    storageKey: 'app_lang',
    useBrowserLocale: true,
    noTranslateEnglish: true
  },

  state: {
    current: null,
    initialized: false,
    translations: new Map()
  },

  /**
   * Configuration options:
   * - enabled: Whether the i18n system is active
   * - defaultLocale: The default language code to use
   * - availableLocales: List of supported language codes
   * - storageKey: localStorage key to save the selected language
   * - useBrowserLocale: Whether to use the browser's language as default
   * - noTranslateEnglish: When true, English translations will not be translated
   *   as the current locale will be used directly without translation lookup.
   *   This is useful for multilingual applications where some content may already
   *   be in the target language and doesn't need translation.
   */

  async init(options = {}) {
    this.config = {...this.config, ...options};

    if (!this.config.enabled) {
      this.state.disabled = true;
      return this;
    }

    await this.loadInitialLocale();

    this.state.initialized = true;

    EventManager.emit('i18n:initialized');

    return this;
  },

  async setLocale(locale, force = false) {
    try {
      if (!this.config.enabled) return;

      if (!this.config.availableLocales.includes(locale)) {
        throw new Error(`Unsupported locale: ${locale}`);
      }

      if (locale === this.state.current && !force) {
        return;
      }

      // Try to load translations, but don't fail if file doesn't exist
      // This allows using data-i18n as fallback for languages without translation files
      if ((!this.config.noTranslateEnglish || locale !== 'en') && !this.state.translations.has(locale)) {
        try {
          await this.loadTranslations(locale);
        } catch (error) {
          // If translation file doesn't exist, that's okay - we'll use data-i18n as fallback
        }
      }

      this.state.current = locale;
      document.documentElement.setAttribute('lang', locale);

      this.setStoredLocale(locale);

      window.setTimeout(() => {
        this.updateTranslations();
      }, 100);

      EventManager.emit('locale:changed', {
        locale,
        forced: force
      });
    } catch (error) {
      ErrorManager.handle(error, {
        context: 'I18nManager.setLocale',
        type: 'error:i18n',
        data: {locale, force},
        notify: true
      });
    }
  },

  getCurrentLocale() {
    return this.state.current;
  },

  async loadTranslations(locale, retries = 2) {
    const url = `${Now.resolvePath(locale, 'translations')}.json`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Use native fetch for reliability
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          },
          credentials: 'same-origin'
        });

        // Check HTTP status
        if (!response.ok) {
          if (response.status === 404) {
            // Translation file not found - this is acceptable
            console.warn(`Translation file not found for locale: ${locale}`);

            // Emit event even for 404 so components know to render with fallback
            EventManager.emit('i18n:loaded', {
              locale,
              success: false,
              reason: '404'
            });
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse JSON
        const translations = await response.json();

        // Validate response structure
        if (!translations || typeof translations !== 'object') {
          throw new Error('Invalid translation format: expected object');
        }

        // Store translations
        this.state.translations.set(locale, translations);

        // Emit event that translations loaded successfully
        EventManager.emit('i18n:loaded', {
          locale,
          success: true,
          translationCount: Object.keys(translations).length
        });

        // Success - exit retry loop
        return;

      } catch (error) {
        const isLastAttempt = attempt === retries;

        // Don't retry on 404 or JSON parse errors
        if (error.name === 'SyntaxError' || error.message.includes('404')) {
          throw error;
        }

        if (isLastAttempt) {
          // Final attempt failed
          ErrorManager.handle(error, {
            context: 'I18nManager.loadTranslations',
            type: 'error:i18n',
            data: {
              locale,
              url,
              attempts: attempt + 1,
              errorType: error.name,
              errorMessage: error.message
            },
            notify: true
          });
          throw new Error(`Failed to load translations for ${locale} after ${attempt + 1} attempts: ${error.message}`);
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
        console.warn(`Translation load failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  },

  updateTranslations() {
    const translations = this.state.translations.get(this.state.current);

    // Translate elements with data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const dataI18n = element.getAttribute('data-i18n')?.trim();
      const key = dataI18n ? dataI18n.trim() : element.textContent.trim();
      if (!key) return;

      let translation;
      if (!translations) {
        translation = this.interpolate(key, {}, {});
      } else {
        translation = this.getTranslation(key, translations);
        if (!translation || translation === key) {
          translation = this.interpolate(key, {}, translations);
        }
      }

      element.textContent = translation;
      if (!dataI18n) {
        element.setAttribute('data-i18n', key);
      }
    });

    // Translate placeholder and title attributes containing {LNG_xxx}
    this.translateAttributes();

    // Emit event to notify components that translations have been applied
    EventManager.emit('i18n:updated', {
      locale: this.state.current,
      elementsUpdated: elements.length
    });
  },

  translateAttributes() {
    this.translateAttributesIn(document);
  },

  getTranslation(key, translations, params = {}) {
    let value;

    // If key contains spaces, it's a plain text key, not a nested path
    // So we should look it up directly without splitting by '.'
    if (key.includes(' ')) {
      value = translations[key];
    } else {
      value = key.split('.').reduce((obj, k) => obj?.[k], translations);
    }

    if (!value) {
      value = key;
    }

    return this.interpolate(value, params, translations);
  },

  async loadInitialLocale() {
    let locale = this.config.defaultLocale;

    const htmlLang = document.documentElement.getAttribute('lang');
    if (htmlLang && this.config.availableLocales.includes(htmlLang)) {
      locale = htmlLang;
    } else {
      const stored = this.getStoredLocale();
      if (stored && this.config.availableLocales.includes(stored)) {
        locale = stored;
      } else if (this.config.useBrowserLocale) {
        const browserLocale = navigator.language.split('-')[0];
        if (this.config.availableLocales.includes(browserLocale)) {
          locale = browserLocale;
        }
      }
    }

    await this.setLocale(locale);
  },

  /**
   * Update translations for specific elements
   */
  async updateElements(container = document) {
    if (!this.config.enabled || !this.state.initialized) {
      return;
    }

    const translations = this.state.translations.get(this.state.current);

    const elements = container.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const dataI18n = element.getAttribute('data-i18n')?.trim();
      const key = dataI18n ? dataI18n.trim() : element.textContent.trim();
      if (!key) return;

      let translation;
      if (!translations) {
        translation = this.interpolate(key, {}, {});
      } else {
        translation = this.getTranslation(key, translations);
        if (!translation || translation === key) {
          translation = this.interpolate(key, {}, translations);
        }
      }

      element.textContent = translation;
      if (!dataI18n) {
        element.setAttribute('data-i18n', key);
      }
    });

    // Translate placeholder and title attributes in container
    this.translateAttributesIn(container);

    // Emit event for debugging/monitoring
    EventManager.emit('i18n:elements:updated', {
      container,
      elementsUpdated: elements.length,
      locale: this.state.current
    });
  },

  translateAttributesIn(container) {
    const translations = this.state.translations.get(this.state.current) || {};
    const lngPattern = /\{LNG_[^}]+\}/;
    const attrs = ['placeholder', 'title', 'alt', 'aria-label', 'aria-placeholder', 'label'];
    const selector = attrs.map(a => `[${a}]`).join(', ');

    container.querySelectorAll(selector).forEach(element => {
      attrs.forEach(attr => {
        const value = element.getAttribute(attr);
        if (value && lngPattern.test(value)) {
          element.setAttribute(attr, this.interpolate(value, {}, translations));
        }
      });
    });
  },

  translate(key, params = {}, locale = null) {
    if (typeof key !== 'string') return key;

    const currentLocale = locale || this.getCurrentLocale();
    if (currentLocale === 'en' && this.config.noTranslateEnglish) return key;

    const translations = this.state.translations.get(currentLocale);

    if (!translations) {
      return this.getFallbackTranslation(key, params);
    }

    return this.getTranslation(key, translations, params);
  },

  getFallbackTranslation(key, params) {
    if (!params || Object.keys(params).length === 0) {
      return key;
    }

    if (this.state.current !== this.config.defaultLocale) {
      const defaultTranslations = this.state.translations.get(this.config.defaultLocale);
      if (defaultTranslations) {
        // If key contains spaces, look it up directly
        const value = key.includes(' ')
          ? defaultTranslations[key]
          : key.split('.').reduce((obj, k) => obj?.[k], defaultTranslations);
        if (value) {
          return this.interpolate(value, params);
        }
      }
    }

    return this.interpolate(key, params);
  },

  interpolate(text, params, translations) {
    const trans = translations || this.getTranslations();

    // Handle {LNG_xxx} pattern first
    let result = text.replace(/\{LNG_([^}]+)\}/g, (match, key) => {
      return trans[key] ?? key;
    });

    // Handle {xxx} pattern (existing behavior)
    result = result.replace(/\{([^}]+)\}/g, (match, key) => {
      if (params[key] !== undefined) {
        return params[key];
      }
      if (trans[key]) {
        return trans[key];
      }
      return key;
    });

    return result;
  },

  getTranslator(locale) {
    return (key, params = {}) => this.translate(key, params, locale);
  },

  getTranslations(locale = null) {
    const targetLocale = locale || this.getCurrentLocale();
    return this.state.translations.get(targetLocale) || {};
  },

  getKeyTranslations(key) {
    const translations = {};
    this.state.translations.forEach((value, locale) => {
      // If key contains spaces, look it up directly
      const translation = key.includes(' ')
        ? value[key]
        : key.split('.').reduce((obj, k) => obj?.[k], value);
      if (translation) {
        translations[locale] = translation;
      }
    });
    return translations;
  },

  hasTranslation(key, locale = null) {
    const translations = this.getTranslations(locale);
    // If key contains spaces, look it up directly
    if (key.includes(' ')) {
      return translations[key] !== undefined;
    }
    return key.split('.').reduce((obj, k) => obj?.[k], translations) !== undefined;
  }
};

if (window.Now?.registerManager) {
  Now.registerManager('i18n', I18nManager);
}

window.I18nManager = I18nManager;

// LocalStorage helpers (safe)
I18nManager.getStoredLocale = function() {
  if (!this.config.storageKey) return null;
  try {
    return localStorage.getItem(this.config.storageKey);
  } catch (e) {
    console.warn('I18nManager: Unable to read from localStorage', e);
    return null;
  }
};

I18nManager.setStoredLocale = function(locale) {
  if (!this.config.storageKey) return;
  try {
    localStorage.setItem(this.config.storageKey, locale);
  } catch (e) {
    console.warn('I18nManager: Unable to write to localStorage', e);
  }
};

// Component: lang-toggle
// Provides an easy declarative language switcher. Usage:
// <button data-component="lang-toggle" data-locales="en,th" data-theme-map="en:light,th:dark">EN</button>
(() => {
  const registerLangToggle = () => {
    if (I18nManager._langToggleRegistered) return true;

    const compManager = (Now.getManager ? Now.getManager('component') : null) || window.ComponentManager;
    if (!compManager || typeof compManager.define !== 'function') return false;

    compManager.define('lang-toggle', {
      mounted() {
        const el = this.element;

        // Determine locales (attribute or i18n config availableLocales)
        const i18n = Now.getManager ? Now.getManager('i18n') : null;
        const avail = (i18n && i18n.config && Array.isArray(i18n.config.availableLocales))
          ? i18n.config.availableLocales : ['en'];

        const localesAttr = (el.getAttribute('data-locales') || avail.join(',')).trim();
        let locales = localesAttr.split(',').map(s => s.trim()).filter(Boolean);

        // Optional theme map: 'en:light,th:dark'
        const themeMapAttr = el.getAttribute('data-theme-map') || '';
        const themeMap = {};
        themeMapAttr.split(',').map(p => p.trim()).forEach(pair => {
          if (!pair) return;
          const [k, v] = pair.split(':').map(s => s.trim());
          if (k && v) themeMap[k] = v;
        });

        const labelEl = el.querySelector('[data-lang-label]') || el.querySelector('span');
        const menuEl = el.querySelector('ul');
        const menuItems = menuEl ? Array.from(menuEl.querySelectorAll('a')) : [];

        // If menu anchors provided, use them to derive locales
        const menuLocales = menuItems
          .map(a => (a.getAttribute('data-locale') || a.textContent || '').trim())
          .filter(Boolean);
        if (menuLocales.length) {
          locales = menuLocales;
        }

        const updateLabel = () => {
          try {
            const cur = (i18n && typeof i18n.getCurrentLocale === 'function') ? i18n.getCurrentLocale() : document.documentElement.lang || locales[0];
            const display = (cur || locales[0] || '').toUpperCase();
            if (labelEl) {
              labelEl.textContent = display;
              labelEl.setAttribute('aria-label', `Language: ${cur}`);
            } else {
              el.setAttribute('data-lang', display);
            }

            // Mark active item in menu
            menuItems.forEach(a => {
              const l = (a.getAttribute('data-locale') || a.textContent || '').trim();
              const isActive = l === cur;
              if (isActive) {
                a.classList.add('active');
                a.setAttribute('aria-current', 'true');
              } else {
                a.classList.remove('active');
                a.removeAttribute('aria-current');
              }
            });
          } catch (e) { /* ignore */}
        };

        const clickHandler = (event) => {
          const link = event.target.closest('a');
          if (link) {
            event.preventDefault();
            const next = (link.getAttribute('data-locale') || link.textContent || '').trim();
            if (i18n && typeof i18n.setLocale === 'function' && next) {
              i18n.setLocale(next);
              // Apply theme mapping if configured and ThemeManager available
              try {
                const themeMgr = Now.getManager ? Now.getManager('theme') : null;
                if (themeMgr && typeof themeMgr.setTheme === 'function' && themeMap[next]) {
                  themeMgr.setTheme(themeMap[next]);
                }
              } catch (err) { /* ignore */}
            }
            return;
          }

          // Fallback: cycle locales when clicking button body
          if (!i18n || typeof i18n.setLocale !== 'function') return;
          const cur = i18n.getCurrentLocale() || locales[0];
          const idx = locales.indexOf(cur);
          const nextLocale = locales[(idx + 1) % locales.length] || locales[0];
          i18n.setLocale(nextLocale);
          try {
            const themeMgr = Now.getManager ? Now.getManager('theme') : null;
            if (themeMgr && typeof themeMgr.setTheme === 'function' && themeMap[nextLocale]) {
              themeMgr.setTheme(themeMap[nextLocale]);
            }
          } catch (err) { /* ignore */}
        };

        // Register listeners
        el.__langToggleClick = clickHandler;
        el.addEventListener('click', clickHandler);

        // Update on locale change
        el.__langToggleUpdate = updateLabel;
        try {
          EventManager.on('locale:changed', updateLabel);
        } catch (e) {
          // best-effort
        }

        // Initial label
        updateLabel();
      },
      destroyed() {
        const el = this.element;
        try {
          if (el.__langToggleClick) el.removeEventListener('click', el.__langToggleClick);
        } catch (e) {}
        try {
          if (el.__langToggleUpdate) EventManager.off && EventManager.off('locale:changed', el.__langToggleUpdate);
        } catch (e) {}
      }
    });

    I18nManager._langToggleRegistered = true;
    return true;
  };

  // Try immediate registration; if ComponentManager isn't ready yet, retry after DOM ready
  if (!registerLangToggle()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', registerLangToggle, {once: true});
    } else {
      setTimeout(registerLangToggle, 0);
    }
  }
})();
