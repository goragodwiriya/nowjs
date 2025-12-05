(function() {
  'use strict';

  const SELECTOR = '[data-social-provider]';
  const BOUND_FLAG = 'socialBound';
  const LOADING_FLAG = 'socialLoading';
  const providers = new Map();

  const resolveAuthManager = () => {
    try {
      if (window.Now?.getManager) {
        const manager = Now.getManager('auth');
        if (manager) {
          return manager;
        }
      }
    } catch (error) {
      console.warn('[SocialLogin] Unable to resolve AuthManager from Now.getManager', error);
    }

    if (window.AuthManager) {
      return window.AuthManager;
    }

    console.warn('[SocialLogin] AuthManager is not available');
    return null;
  };

  const normaliseBoolean = value => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const normalised = String(value).toLowerCase();
    return normalised === 'true' ? true : (normalised === 'false' ? false : undefined);
  };

  const mergeProviderConfig = (providerId, dataset) => {
    const registered = providers.get(providerId) || {};
    const datasetConfig = {
      endpoint: dataset.socialEndpoint,
      mode: dataset.socialMode,
      popup: normaliseBoolean(dataset.socialPopup)
    };

    const merged = {
      provider: providerId,
      ...registered,
      ...Object.fromEntries(Object.entries(datasetConfig).filter(([, value]) => value !== undefined && value !== ''))
    };

    if (!merged.mode) {
      merged.mode = merged.popup === false ? 'redirect' : 'popup';
    }

    if (typeof merged.popup !== 'boolean') {
      merged.popup = merged.mode !== 'redirect';
    }

    return merged;
  };

  const setLoadingState = (button, isLoading) => {
    if (isLoading) {
      button.dataset[LOADING_FLAG] = 'true';
      button.disabled = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
    } else {
      delete button.dataset[LOADING_FLAG];
      button.disabled = false;
      button.classList.remove('is-loading');
      button.removeAttribute('aria-busy');
    }
  };

  const handleClick = async event => {
    event.preventDefault();

    const button = event.currentTarget;
    if (!button) return;

    if (button.dataset[LOADING_FLAG] === 'true') {
      return;
    }

    const providerId = button.dataset.socialProvider;
    if (!providerId) {
      console.warn('[SocialLogin] Missing provider identifier on button');
      return;
    }

    const authManager = resolveAuthManager();
    if (!authManager || typeof authManager.socialLogin !== 'function') {
      console.warn('[SocialLogin] AuthManager.socialLogin is not available');
      return;
    }

    const config = mergeProviderConfig(providerId, button.dataset);
    const options = {};

    // Normalize endpoint: make it absolute (respect Now.buildUrl if available)
    let endpoint = config.endpoint || (window.Now && Now.config && Now.config.auth && Now.config.auth.endpoints && Now.config.auth.endpoints.social) || `api/v1/auth/social/${providerId}`;
    if (typeof endpoint === 'string') {
      endpoint = endpoint.replace('{provider}', providerId);
      if (!/^(https?:)?\/\//i.test(endpoint) && !endpoint.startsWith('/')) {
        try {
          if (window.Now && typeof Now.buildUrl === 'function') {
            endpoint = Now.buildUrl(endpoint.replace(/^\/+/, ''));
          } else if (window.Now && typeof Now.getBasePath === 'function') {
            endpoint = Now.getBasePath().replace(/\/$/, '') + '/' + endpoint.replace(/^\/+/, '');
          } else {
            endpoint = '/' + endpoint.replace(/^\/+/, '');
          }
        } catch (e) {
          endpoint = '/' + endpoint.replace(/^\/+/, '');
        }
      }
    }

    options.endpoint = endpoint;
    options.popup = config.popup !== false;

    // Always log the resolved endpoint so it's visible in the console
    console.info('[SocialLogin] clicking', providerId, 'resolved endpoint=', options.endpoint, 'popup=', options.popup);

    // If debug mode is enabled, proactively request the endpoint (helps show a network call)
    if (window.Now?.config?.debug) {
      try {
        fetch(options.endpoint, {method: 'GET', credentials: 'same-origin'}).then(res => {
          console.debug('[SocialLogin] probe GET', options.endpoint, 'status=', res.status);
        }).catch(err => {
          console.debug('[SocialLogin] probe GET failed', options.endpoint, err);
        });
      } catch (e) {
        console.debug('[SocialLogin] probe GET exception', e);
      }
    }

    setLoadingState(button, true);

    try {
      await authManager.socialLogin(providerId, options);
    } catch (error) {
      console.error(`[SocialLogin] ${providerId} login failed`, error);
      if (window.NotificationManager?.error) {
        NotificationManager.error(error.message || `Unable to login with ${providerId}`);
      }
    } finally {
      setLoadingState(button, false);
    }
  };

  const bindButton = button => {
    if (!button || button.dataset[BOUND_FLAG] === 'true') {
      return;
    }

    button.dataset[BOUND_FLAG] = 'true';
    button.addEventListener('click', handleClick);
  };

  const bindButtons = (root = document) => {
    const scope = root || document;
    const elements = scope.querySelectorAll(SELECTOR);
    elements.forEach(bindButton);
  };

  const syncProvidersFromConfig = () => {
    const configProviders = window.Now?.config?.auth?.socialProviders;
    if (!configProviders) {
      return;
    }

    Object.entries(configProviders).forEach(([providerId, providerConfig]) => {
      providers.set(providerId, providerConfig || {});
    });
  };

  const SocialLoginManager = {
    register(providerId, config = {}) {
      if (!providerId || typeof providerId !== 'string') {
        throw new Error('Provider identifier must be a non-empty string');
      }

      providers.set(providerId, {...config});
      bindButtons();
    },

    refresh(root = document) {
      bindButtons(root);
    },

    getProviders() {
      return new Map(providers);
    }
  };

  window.SocialLoginManager = SocialLoginManager;

  const registerComponent = () => {
    const componentManager = window.Now?.getManager ? Now.getManager('component') : window.ComponentManager;
    if (!componentManager?.define) {
      return false;
    }

    if (componentManager.has && componentManager.has('social-login')) {
      return true;
    }

    componentManager.define('social-login', {
      created() {
        SocialLoginManager.refresh(this.element || document);
      },
      mounted() {
        SocialLoginManager.refresh(this.element || document);
      }
    });

    return true;
  };

  const initialize = () => {
    syncProvidersFromConfig();
    bindButtons();
    if (!registerComponent()) {
      setTimeout(() => {
        if (!registerComponent()) {
          console.warn('[SocialLogin] Component registration deferred - ComponentManager still unavailable');
        }
      }, 100);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, {once: true});
  } else {
    initialize();
  }

  if (window.EventManager?.on) {
    EventManager.on('route:changed', () => {
      syncProvidersFromConfig();
      bindButtons();
    }, {priority: -10});
  }
})();
