const Utils = {
  string: {
    random(length = 8) {
      return Array.from(crypto.getRandomValues(new Uint8Array(length)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    },

    escape(unsafe) {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    sanitizeFilename(filename) {
      return filename.replace(/[^a-z0-9.-]/gi, '_');
    },

    capitalize(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    },

    truncate(str, length = 100, ending = '...') {
      if (str.length > length) {
        return str.substring(0, length - ending.length) + ending;
      }
      return str;
    },

    slugify(str) {
      return str.normalize("NFKD")
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    },

    stripTags(html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      return div.textContent || div.innerText || '';
    },

    applyFormatters(value, formatters, context) {
      return formatters.reduce((val, formatter) => {
        const [name, ...args] = formatter.split(':');
        const format = context.filters?.[name] || this.builtinFormatters[name];

        if (typeof format === 'function') {
          return format(val, ...args);
        }

        console.warn(`[Utils] Formatter "${name}" not found`);
        return val;
      }, value);
    },

    builtinFormatters: {
      number: (value, decimals = 0) => {
        return Number(value).toLocaleString(undefined, {
          minimumFractionDigits: parseInt(decimals),
          maximumFractionDigits: parseInt(decimals)
        });
      },

      currency: (value, currency = 'USD') => {
        return Number(value).toLocaleString(undefined, {
          style: 'currency',
          currency: currency
        });
      },

      percent: (value, decimals = 0) => {
        return (Number(value) * 100).toFixed(decimals) + '%';
      },

      lowercase: value => String(value).toLowerCase(),
      uppercase: value => String(value).toUpperCase(),
      capitalize: value => {
        const str = String(value);
        return str.charAt(0).toUpperCase() + str.slice(1);
      },

      date: (value, format = 'medium') => {
        const date = new Date(value);
        return date.toLocaleDateString(undefined, {
          dateStyle: format
        });
      },

      time: (value, format = 'medium') => {
        const date = new Date(value);
        return date.toLocaleTimeString(undefined, {
          timeStyle: format
        });
      },

      default: (value, defaultValue = '') => {
        return value == null ? defaultValue : value;
      }
    }
  },

  number: {
    format(num, decimals = 0) {
      return Number(num).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    },

    currency(amount, currency = 'USD', locale = 'en-US') {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency
      }).format(amount);
    },

    percentage(num, decimals = 0) {
      return (num * 100).toFixed(decimals) + '%';
    },

    fileSize(bytes) {
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      if (bytes === 0) return '0 Byte';
      const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
      return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    },

    round(val, precision = 2) {
      const factor = Math.pow(10, precision);
      return Math.round(val * factor) / factor;
    },

    ceil(val, precision = 2) {
      const factor = Math.pow(10, precision);
      return Math.ceil(val * factor) / factor;
    },

    floor(val, precision = 2) {
      const factor = Math.pow(10, precision);
      return Math.floor(val * factor) / factor;
    },

    truncate(val, precision = 2) {
      const factor = Math.pow(10, precision);
      return Math.trunc(val * factor) / factor;
    }
  },

  date: {
    format(date, format = 'YYYY-MM-DD') {
      const d = new Date(date);
      const tokens = {
        'YYYY': d.getFullYear(),
        'YY': String(d.getFullYear()).slice(-2),
        'MM': String(d.getMonth() + 1).padStart(2, '0'),
        'DD': String(d.getDate()).padStart(2, '0'),
        'HH': String(d.getHours()).padStart(2, '0'),
        'mm': String(d.getMinutes()).padStart(2, '0'),
        'ss': String(d.getSeconds()).padStart(2, '0'),
        'd': d.getDate(),
        'M': d.getMonth() + 1,
        'h': d.getHours() % 12 || 12,
        'A': d.getHours() < 12 ? 'AM' : 'PM',
        'a': d.getHours() < 12 ? 'am' : 'pm'
      };
      return format.replace(/YYYY|YY|MM|DD|HH|mm|ss|d|M|h|A|a/g, match => tokens[match]);
    },

    fromTimestamp(timestamp) {
      return new Date(timestamp * 1000);
    },

    toTimestamp(date) {
      return Math.floor(new Date(date).getTime() / 1000);
    },

    add(date, amount, unit) {
      const d = new Date(date);
      switch (unit) {
        case 'years': d.setFullYear(d.getFullYear() + amount); break;
        case 'months': d.setMonth(d.getMonth() + amount); break;
        case 'days': d.setDate(d.getDate() + amount); break;
        case 'hours': d.setHours(d.getHours() + amount); break;
        case 'minutes': d.setMinutes(d.getMinutes() + amount); break;
        case 'seconds': d.setSeconds(d.getSeconds() + amount); break;
      }
      return d;
    },

    moveDate(date, days) {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d;
    },

    moveMonth(date, months) {
      const d = new Date(date);
      d.setMonth(d.getMonth() + months);
      return d;
    },

    moveYear(date, years) {
      const d = new Date(date);
      d.setFullYear(d.getFullYear() + years);
      return d;
    },

    timeToMinute(timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    },

    timeToSecond(timeStr) {
      const [hours, minutes, seconds] = timeStr.split(':').map(Number);
      return hours * 3600 + minutes * 60 + (seconds || 0);
    },

    isLeapYear(year) {
      return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    },

    daysInMonth(year, month) {
      return new Date(year, month, 0).getDate();
    },

    compare(date1, date2) {
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      const diffTime = d1.getTime() - d2.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffMonths = d1.getMonth() - d2.getMonth() + (12 * (d1.getFullYear() - d2.getFullYear()));
      const diffYears = d1.getFullYear() - d2.getFullYear();
      return {days: diffDays, months: diffMonths, years: diffYears};
    }
  },

  object: {
    deepClone(obj) {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
      const clone = {};
      for (let key in obj) {
        clone[key] = this.deepClone(obj[key]);
      }
      return clone;
    },

    merge(target, ...sources) {
      if (!sources.length) return target;
      const source = sources.shift();

      if (this.isObject(target) && this.isObject(source)) {
        for (const key in source) {
          if (this.isObject(source[key])) {
            if (!target[key]) Object.assign(target, {[key]: {}});
            this.merge(target[key], source[key]);
          } else {
            Object.assign(target, {[key]: source[key]});
          }
        }
      }

      return this.merge(target, ...sources);
    },

    isObject(item) {
      return item && typeof item === 'object' && !Array.isArray(item);
    },

    get(obj, path, defaultValue = null) {
      if (!obj || !path) {
        console.warn('[Utils.object.get] Invalid parameters');
        return defaultValue;
      }
      const travel = regexp =>
        String.prototype.split
          .call(path, regexp)
          .filter(Boolean)
          .reduce((res, key) => (res !== null && res !== undefined ? res[key] : res), obj);
      const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
      return result === undefined || result === obj ? defaultValue : result;
    }
  },

  array: {
    chunk(arr, size) {
      if (!Array.isArray(arr)) throw new Error('[Utils.array.chunk] Input must be an array');
      if (typeof size !== 'number' || size <= 0) throw new Error('[Utils.array.chunk] Size must be a positive number');
      return Array.from(
        {length: Math.ceil(arr.length / size)},
        (v, i) => arr.slice(i * size, i * size + size)
      );
    },

    unique(arr, key = null) {
      if (!Array.isArray(arr)) throw new Error('[Utils.array.unique] Input must be an array');
      if (!key) return [...new Set(arr)];
      const seen = new Set();
      return arr.filter(item => {
        const k = key ? item[key] : item;
        return seen.has(k) ? false : seen.add(k);
      });
    },

    shuffle(arr) {
      if (!Array.isArray(arr)) throw new Error('[Utils.array.shuffle] Input must be an array');
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },

    groupBy(arr, key) {
      return arr.reduce((grouped, item) => ({
        ...grouped,
        [item[key]]: [...(grouped[item[key]] || []), item]
      }), {});
    },

    flatten(arr, depth = 1) {
      if (!Array.isArray(arr)) throw new Error('[Utils.array.flatten] Input must be an array');
      return arr.reduce((flat, item) =>
        flat.concat(depth > 0 && Array.isArray(item) ? this.flatten(item, depth - 1) : item), []);
    },

    findBy(arr, key, value) {
      if (!Array.isArray(arr)) throw new Error('[Utils.array.findBy] Input must be an array');
      return arr.find(item => item[key] === value);
    }
  },

  validate: {
    email(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    url(url) {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    },

    phone(phone) {
      if (typeof phone !== 'string') return false;
      const digitsOnly = phone.replace(/[^\d]/g, '');
      if (digitsOnly.length < 9 || digitsOnly.length > 15) return false;
      return /^\+?[\d\s().-]{10,}$/.test(phone);
    },

    password(password) {
      const strength = {
        0: "Too weak",
        1: "Weak",
        2: "Medium",
        3: "Strong"
      };

      let score = 0;
      if (password.length >= 8) score++;
      if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
      if (/[0-9]/.test(password)) score++;
      if (/[^A-Za-z0-9]/.test(password)) score++;

      return {
        score,
        label: strength[score],
        isStrong: score >= 3
      };
    }
  },

  dom: {
    create(tag, attributes = {}, children = []) {
      const element = document.createElement(tag);
      Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
          element.className = value;
        } else if (key === 'dataset') {
          Object.entries(value).forEach(([dataKey, dataValue]) => {
            element.dataset[dataKey] = dataValue;
          });
        } else {
          element.setAttribute(key, value);
        }
      });
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else {
          element.appendChild(child);
        }
      });
      return element;
    },

    toggleClass(element, ...classNames) {
      classNames.forEach(className =>
        element.classList.toggle(className)
      );
    },

    closest(element, selector) {
      return element.closest(selector);
    },

    isVisible(element) {
      return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    },

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} - Returns true if successful, false otherwise
     */
    async copyToClipboard(text) {
      if (typeof text !== 'string') {
        console.error('[Utils.dom.copyToClipboard] Text must be a string');
        return false;
      }

      // Modern Clipboard API (preferred method)
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (error) {
          console.warn('[Utils.dom.copyToClipboard] Clipboard API failed, trying fallback:', error);
        }
      }

      // Fallback method for older browsers or non-secure contexts
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.setAttribute('aria-hidden', 'true');
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          return true;
        } else {
          console.error('[Utils.dom.copyToClipboard] Fallback method failed');
          return false;
        }
      } catch (error) {
        console.error('[Utils.dom.copyToClipboard] Failed to copy text:', error);
        return false;
      }
    }
  },

  browser: {
    info() {
      const ua = navigator.userAgent;
      let tem;
      let M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];

      if (/trident/i.test(M[1])) {
        tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
        return {name: 'IE', version: tem[1] || ''};
      }

      if (M[1] === 'Chrome') {
        tem = ua.match(/\bOPR|Edge\/(\d+)/);
        if (tem != null) {
          return {name: 'Opera', version: tem[1]};
        }
      }

      M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
      if ((tem = ua.match(/version\/(\d+)/i)) != null) {
        M.splice(1, 1, tem[1]);
      }

      return {
        name: M[0],
        version: M[1]
      };
    },

    isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    orientation() {
      return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
    }
  },

  session: {
    set(key, value, ttl = null) {
      const item = {
        value: value,
        timestamp: new Date().getTime()
      };

      if (ttl) {
        item.expires = item.timestamp + (ttl * 1000);
      }

      try {
        sessionStorage.setItem(key, JSON.stringify(item));
      } catch (error) {
        console.error(`[Utils.session.set] Error setting key ${key}:`, error);
      }
    },

    get(key, defaultValue = null) {
      try {
        const item = sessionStorage.getItem(key);
        if (!item) return defaultValue;

        const parsed = JSON.parse(item);

        if (parsed.expires && new Date().getTime() > parsed.expires) {
          this.remove(key);
          return defaultValue;
        }

        return parsed.value;
      } catch (error) {
        console.error(`[Utils.session.get] Error getting key ${key}:`, error);
        return defaultValue;
      }
    },

    remove(key) {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {
        console.error(`[Utils.session.remove] Error removing key ${key}:`, error);
      }
    },

    clear() {
      try {
        sessionStorage.clear();
      } catch (error) {
        console.error('[Utils.session.clear] Error clearing session:', error);
      }
    },

    has(key) {
      return sessionStorage.getItem(key) !== null;
    },

    size() {
      return sessionStorage.length;
    },

    keys() {
      return Object.keys(sessionStorage);
    }
  },

  generateUUID() {
    if (crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    } else {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
  },

  function: {
    debounce(func, wait = 300) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    throttle(func, limit = 300) {
      let inThrottle;
      return function executedFunction(...args) {
        if (!inThrottle) {
          func(...args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    },

    debounceAsync(func, wait = 300) {
      let timeout;
      return function executedFunction(...args) {
        return new Promise((resolve) => {
          const later = async () => {
            clearTimeout(timeout);
            try {
              const result = await func(...args);
              resolve(result);
            } catch (error) {
              resolve(Promise.reject(error));
            }
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
        });
      };
    }
  },

  cookie: {
    set: function(name, value, options = {}) {
      if (typeof name !== 'string' || typeof value !== 'string') {
        throw new Error('[Utils.cookie.set] Name and value must be strings');
      }

      const defaultOptions = {
        days: 7,
        path: '/',
        domain: '',
        secure: true,
        sameSite: 'Strict'
      };
      const opts = {...defaultOptions, ...options};

      // Build cookie string
      let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
      if (typeof opts.days === 'number' && opts.days !== 0) {
        const d = new Date();
        d.setTime(d.getTime() + (opts.days * 24 * 60 * 60 * 1000));
        cookieStr += `;expires=${d.toUTCString()}`;
      }
      if (opts.path) cookieStr += `;path=${opts.path}`;
      if (opts.domain) cookieStr += `;domain=${opts.domain}`;
      if (opts.secure) cookieStr += ';secure';
      if (opts.sameSite) cookieStr += `;samesite=${opts.sameSite}`;

      try {
        document.cookie = cookieStr;
      } catch (error) {
        console.error(`[Utils.cookie.set] Failed to set cookie ${name}:`, error);
      }
    },

    get: function(name) {
      if (typeof name !== 'string') {
        throw new Error('[Utils.cookie.get] Name must be a string');
      }

      const escapedName = name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
      const regex = new RegExp(`(?:^|;)\\s*${escapedName}=([^;]*)`);
      const match = document.cookie.match(regex);
      return match ? decodeURIComponent(match[1]) : null;
    },

    remove: function(name, options = {}) {
      if (typeof name !== 'string') {
        throw new Error('[Utils.cookie.remove] Name must be a string');
      }

      const removeOptions = {
        days: -1,
        path: options.path || '/',
        domain: options.domain || ''
      };
      this.set(name, '', removeOptions);
    },

    isEnabled() {
      try {
        document.cookie = 'cookietest=1';
        const result = document.cookie.indexOf('cookietest=') !== -1;
        document.cookie = 'cookietest=1; expires=Thu, 01-Jan-1970 00:00:01 GMT';
        return result;
      } catch (e) {
        return false;
      }
    }
  },

  url: {
    getQueryParams(url) {
      const params = {};
      new URL(url).searchParams.forEach((value, key) => {
        params[key] = value;
      });
      return params;
    },

    addQueryParams(url, params) {
      const urlObj = new URL(url);
      Object.entries(params).forEach(([key, value]) => {
        urlObj.searchParams.append(key, value);
      });
      return urlObj.toString();
    }
  },

  path: {
    join(...parts) {
      return parts
        .map(part => part.replace(/^\/+|\/+$/g, ''))
        .filter(part => part.length > 0)
        .join('/');
    },

    normalize(path) {
      return path.replace(/\/+/g, '/');
    },

    basename(path) {
      return path.split('/').pop();
    },

    dirname(path) {
      return path.split('/').slice(0, -1).join('/');
    },

    extname(path) {
      const basename = this.basename(path);
      const lastDotIndex = basename.lastIndexOf('.');
      return lastDotIndex === -1 ? '' : basename.slice(lastDotIndex);
    }
  },

  keyboard: {
    isKey(event, key, modifiers = {}) {
      if (event.key !== key) return false;

      if (modifiers.shift !== undefined && event.shiftKey !== modifiers.shift) return false;
      if (modifiers.ctrl !== undefined && event.ctrlKey !== modifiers.ctrl) return false;
      if (modifiers.alt !== undefined && event.altKey !== modifiers.alt) return false;
      if (modifiers.meta !== undefined && event.metaKey !== modifiers.meta) return false;

      return true;
    },
    isEnter: (e) => e.key === 'Enter',
    isShiftEnter: (e) => e.key === 'Enter' && e.shiftKey,
    isCtrlEnter: (e) => e.key === 'Enter' && e.ctrlKey,
    isEscape: (e) => e.key === 'Escape',
    isTab: (e) => e.key === 'Tab',
    isShiftTab: (e) => e.key === 'Tab' && e.shiftKey,
    isArrow: (e) => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
  }
};

window.Utils = Utils;
