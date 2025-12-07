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

    Now.emit('i18n:initialized');

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

      if (this.config.storageKey) {
        localStorage.setItem(this.config.storageKey, locale);
      }

      window.setTimeout(() => {
        this.updateTranslations();
      }, 100);

      Now.emit('locale:changed', {
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

  async loadTranslations(locale) {
    try {
      const url = `${Now.resolvePath(locale, 'translations')}.json`;
      const apiService = window.ApiService || window.Now?.getManager?.('api');
      let response;

      if (apiService?.get) {
        response = await apiService.get(url, {}, {headers: {'Accept': 'application/json'}});
      } else if (window.simpleFetch?.get) {
        response = await simpleFetch.get(url, {headers: {'Accept': 'application/json'}});
      } else {
        throw new Error('ApiService is not available');
      }

      if (!response.success) {
        throw new Error(`Failed to load translations for ${locale}: ${response.statusText || response.status}`);
      }
      const translations = response.data;
      this.state.translations.set(locale, translations);
    } catch (error) {
      ErrorManager.handle(error, {
        context: 'I18nManager.loadTranslations',
        type: 'error:i18n',
        notify: true
      });
      throw error;
    }
  },

  updateTranslations() {
    const translations = this.state.translations.get(this.state.current);

    const elements = document.querySelectorAll('[data-i18n]');
    const updates = [];

    elements.forEach(element => {
      const dataI18n = element.getAttribute('data-i18n')?.trim();
      const key = dataI18n ? dataI18n.trim() : element.textContent.trim();
      if (!key) return;

      // If no translations loaded, use the data-i18n value as-is (fallback to HTML)
      let translation;
      if (!translations) {
        translation = key; // Use the original text from data-i18n
      } else {
        translation = this.getTranslation(key, translations);
        // If translation not found, fallback to original key
        if (!translation || translation === key) {
          translation = key;
        }
      }

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        if (element.getAttribute('placeholder')) {
          element.setAttribute('placeholder', translation);
        } else {
          element.value = translation;
        }
      } else {
        element.textContent = translation;
        if (!dataI18n) {
          element.setAttribute('data-i18n', key);
        }
      }
      updates.push(element);
    });
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
      const stored = localStorage.getItem(this.config.storageKey);
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
    const updates = [];

    elements.forEach(element => {
      const dataI18n = element.getAttribute('data-i18n')?.trim();
      const key = dataI18n ? dataI18n.trim() : element.textContent.trim();
      if (!key) return;

      // If no translations loaded, use the data-i18n value as-is (fallback to HTML)
      let translation;
      if (!translations) {
        translation = key; // Use the original text from data-i18n
      } else {
        translation = this.getTranslation(key, translations);
        // If translation not found, fallback to original key
        if (!translation || translation === key) {
          translation = key;
        }
      }

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        if (element.getAttribute('placeholder')) {
          element.setAttribute('placeholder', translation);
        } else {
          element.value = translation;
        }
      } else {
        element.textContent = translation;
        if (!dataI18n) {
          element.setAttribute('data-i18n', key);
        }
      }
      updates.push(element);
    });

    await Promise.all(updates);

    // Emit event for debugging/monitoring
    if (window.Now?.emit) {
      Now.emit('i18n:elements:updated', {
        container,
        elementsUpdated: updates.length,
        locale: this.state.current
      });
    }
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
    return text.replace(/\{([^}]+)\}/g, (match, key) => {
      if (params[key] !== undefined) {
        return params[key];
      }

      if (translations) {
        const translatedKey = translations[key];
        if (translatedKey) {
          return translatedKey;
        }
      }

      return key;
    });
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
