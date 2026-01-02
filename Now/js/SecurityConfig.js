/**
 * SecurityConfig - Default security configurations
 * Used to configure security settings for different environments
 */
const SecurityConfig = {
  // Development environment
  development: {
    debug: true,
    csrf: {
      enabled: true,
      autoRefresh: true,
      refreshInterval: 30 * 60 * 1000,
      validateOnSubmit: true
    },
    jwt: {
      enabled: true,
      autoRefresh: true,
      refreshBeforeExpiry: 5 * 60 * 1000
    },
    rateLimit: {
      enabled: false, // Disabled in development
      globalLimit: 1000,
      windowMs: 15 * 60 * 1000
    },
    validation: {
      enabled: true,
      sanitizeInput: true,
      maxInputLength: 10000
    },
    csp: {
      enabled: false // Disabled in development for easier debugging
    }
  },

  // Production environment
  production: {
    debug: false,
    csrf: {
      enabled: true,
      autoRefresh: true,
      refreshInterval: 15 * 60 * 1000, // More frequent in production
      validateOnSubmit: true,
      tokenLength: 40
    },
    jwt: {
      enabled: true,
      autoRefresh: true,
      refreshBeforeExpiry: 2 * 60 * 1000, // Earlier refresh in production
      validateSignature: true
    },
    rateLimit: {
      enabled: true,
      globalLimit: 100,
      windowMs: 15 * 60 * 1000,
      perEndpoint: {
        'api/auth/login': {limit: 5, windowMs: 15 * 60 * 1000},
        'api/auth/register': {limit: 3, windowMs: 60 * 60 * 1000},
        'api/password/reset': {limit: 2, windowMs: 60 * 60 * 1000}
      }
    },
    validation: {
      enabled: true,
      sanitizeInput: true,
      validateOutput: true,
      maxInputLength: 5000 // Stricter in production
    },
    csp: {
      enabled: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", "data:", "https:"],
        'connect-src': ["'self'"],
        'frame-src': ["'none'"],
        'object-src': ["'none'"]
      }
    }
  },

  // Testing environment
  testing: {
    debug: true,
    csrf: {
      enabled: false, // Disabled for easier testing
    },
    jwt: {
      enabled: true,
      autoRefresh: false
    },
    rateLimit: {
      enabled: false, // Disabled for testing
    },
    validation: {
      enabled: true,
      sanitizeInput: false // Allow raw input for testing
    },
    csp: {
      enabled: false
    }
  },

  /**
   * Get configuration for specific environment
   */
  getConfig(environment = 'production') {
    return this[environment] || this.production;
  },

  /**
   * Get merged configuration with overrides
   */
  getMergedConfig(environment = 'production', overrides = {}) {
    const baseConfig = this.getConfig(environment);
    return this.mergeDeep(baseConfig, overrides);
  },

  /**
   * Deep merge utility
   */
  mergeDeep(target, source) {
    const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);

    if (!isObject(target) || !isObject(source)) {
      return source;
    }

    Object.keys(source).forEach(key => {
      const targetValue = target[key];
      const sourceValue = source[key];

      if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
        target[key] = targetValue.concat(sourceValue);
      } else if (isObject(targetValue) && isObject(sourceValue)) {
        target[key] = this.mergeDeep(Object.assign({}, targetValue), sourceValue);
      } else {
        target[key] = sourceValue;
      }
    });

    return target;
  }
};

window.SecurityConfig = SecurityConfig;