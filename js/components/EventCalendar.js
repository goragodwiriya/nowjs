/**
 * EventCalendar - Full-featured Event Calendar Component
 *
 * Features:
 * - Multi-day/week/month spanning events displayed as continuous bars
 * - Month, Week, Day views
 * - Max 3 events per day cell with "+N more" overflow
 * - Mobile-friendly with tap-to-view modals
 * - API integration for loading events
 * - ResponseHandler integration for event actions
 * - i18n support (Thai/English)
 *
 * @requires Utils
 * @requires Modal
 * @requires ResponseHandler
 * @requires I18nManager (optional)
 * @requires ApiService (optional)
 */
const EventCalendar = {
  config: {
    defaultView: 'month',
    locale: 'auto',
    timezone: 'local', // 'local' or 'UTC' or specific timezone (future)
    firstDayOfWeek: 0, // 0=Sunday, 1=Monday
    maxEventsPerDay: 3,
    showNavigation: true,
    showToday: true,
    showViewSwitcher: true,
    views: ['month', 'week', 'day'],
    api: null,
    apiMethod: 'GET',
    eventDataPath: 'data',
    eventColors: [
      '#4285F4', // Blue
      '#EA4335', // Red
      '#FBBC04', // Yellow
      '#34A853', // Green
      '#8E24AA', // Purple
      '#E91E63', // Pink
      '#00ACC1', // Cyan
      '#FF7043'  // Orange
    ],
    onDateClick: null,
    onEventClick: null,
    onEventClickApi: null
  },

  state: {
    instances: new Map(),
    initialized: false,
    cleanupHandlers: new WeakMap() // Store cleanup functions for each instance
  },

  // i18n strings
  i18n: {
    th: {
      today: 'วันนี้',
      month: 'เดือน',
      week: 'สัปดาห์',
      day: 'วัน',
      moreEvents: '+{count} เพิ่มเติม',
      noEvents: 'ไม่มีกิจกรรม',
      allDay: 'ทั้งวัน',
      loading: 'กำลังโหลด...',
      error: 'เกิดข้อผิดพลาด',
      retry: 'ลองใหม่',
      previous: 'ก่อนหน้า',
      next: 'ถัดไป',
      monthNames: [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
        'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
        'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
      ],
      monthNamesShort: [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
        'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
        'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
      ],
      dayNames: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'],
      dayNamesShort: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
    },
    en: {
      today: 'Today',
      month: 'Month',
      week: 'Week',
      day: 'Day',
      moreEvents: '+{count} more',
      noEvents: 'No events',
      allDay: 'All day',
      loading: 'Loading...',
      error: 'Error occurred',
      retry: 'Retry',
      previous: 'Previous',
      next: 'Next',
      monthNames: [
        'January', 'February', 'March', 'April',
        'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December'
      ],
      monthNamesShort: [
        'Jan', 'Feb', 'Mar', 'Apr',
        'May', 'Jun', 'Jul', 'Aug',
        'Sep', 'Oct', 'Nov', 'Dec'
      ],
      dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    }
  },

  /**
   * Initialize EventCalendar
   */
  init(options = {}) {
    if (this.state.initialized) return this;

    this.config = {...this.config, ...options};

    // Auto-init elements with data-event-calendar
    document.querySelectorAll('[data-event-calendar]').forEach(element => {
      this.create(element);
    });

    this.state.initialized = true;
    return this;
  },

  /**
   * Validate configuration
   */
  validateConfig(config) {
    const errors = [];

    // Validate views
    if (!Array.isArray(config.views) || config.views.length === 0) {
      errors.push('views must be a non-empty array');
    } else {
      const validViews = ['month', 'week', 'day'];
      const invalidViews = config.views.filter(v => !validViews.includes(v));
      if (invalidViews.length > 0) {
        errors.push(`Invalid view(s): ${invalidViews.join(', ')}. Valid views are: ${validViews.join(', ')}`);
      }
    }

    // Validate defaultView
    if (!config.views.includes(config.defaultView)) {
      errors.push(`defaultView '${config.defaultView}' is not in views array`);
    }

    // Validate maxEventsPerDay
    if (typeof config.maxEventsPerDay !== 'number' || config.maxEventsPerDay < 1) {
      errors.push('maxEventsPerDay must be a positive number');
    }

    // Validate firstDayOfWeek
    if (typeof config.firstDayOfWeek !== 'number' || config.firstDayOfWeek < 0 || config.firstDayOfWeek > 6) {
      errors.push('firstDayOfWeek must be a number between 0 (Sunday) and 6 (Saturday)');
    }

    // Validate API URL if provided
    if (config.api && typeof config.api !== 'string') {
      errors.push('api must be a string URL');
    }

    // Validate apiMethod
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    if (config.apiMethod && !validMethods.includes(config.apiMethod.toUpperCase())) {
      errors.push(`apiMethod must be one of: ${validMethods.join(', ')}`);
    }

    // Validate event colors
    if (!Array.isArray(config.eventColors) || config.eventColors.length === 0) {
      errors.push('eventColors must be a non-empty array');
    }

    // Log errors
    if (errors.length > 0) {
      console.error('[EventCalendar] Configuration errors:', errors);
      return false;
    }

    return true;
  },

  /**
   * Create calendar instance
   */
  create(element, options = {}) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }

    if (!element) {
      console.error('[EventCalendar] Element not found');
      return null;
    }

    // Return existing instance
    if (element._eventCalendar) {
      return element._eventCalendar;
    }

    // Extract data attributes
    const dataOptions = this.extractDataOptions(element);
    const config = {...this.config, ...dataOptions, ...options};

    // Validate configuration
    if (!this.validateConfig(config)) {
      console.error('[EventCalendar] Failed to create calendar due to invalid configuration');
      return null;
    }

    // Determine locale
    if (config.locale === 'auto') {
      config.locale = window.I18nManager?.getCurrentLanguage?.() ||
        document.documentElement.lang ||
        'en';
    }

    // Normalize locale to 'th' or 'en'
    config.locale = config.locale.startsWith('th') ? 'th' : 'en';

    const instance = {
      element,
      config,
      currentDate: new Date(),
      currentView: config.defaultView,
      events: [],
      eventSegments: [],
      isLoading: false,
      error: null,
      // Event listeners cleanup tracking
      eventListeners: [],
      // Performance caching
      segmentCache: new Map()
    };

    element._eventCalendar = instance;
    this.state.instances.set(element, instance);

    // Setup DOM structure
    this.setupCalendar(instance);

    // Load events if API configured
    if (config.api) {
      this.loadEvents(instance);
    } else {
      this.render(instance);
    }

    return instance;
  },

  /**
   * Extract options from data attributes
   */
  extractDataOptions(element) {
    const dataset = element.dataset;
    const options = {};

    if (dataset.view) options.defaultView = dataset.view;
    if (dataset.locale) options.locale = dataset.locale;
    if (dataset.firstDay) options.firstDayOfWeek = parseInt(dataset.firstDay);
    if (dataset.maxEvents) options.maxEventsPerDay = parseInt(dataset.maxEvents);
    if (dataset.api) options.api = dataset.api;
    if (dataset.apiMethod) options.apiMethod = dataset.apiMethod;
    if (dataset.eventDataPath) options.eventDataPath = dataset.eventDataPath;
    if (dataset.onDateClick) options.onDateClick = dataset.onDateClick;
    if (dataset.onEventClick) options.onEventClick = dataset.onEventClick;
    if (dataset.onEventClickApi) options.onEventClickApi = dataset.onEventClickApi;
    if (dataset.showNavigation !== undefined) options.showNavigation = dataset.showNavigation !== 'false';
    if (dataset.showToday !== undefined) options.showToday = dataset.showToday !== 'false';
    if (dataset.showViewSwitcher !== undefined) options.showViewSwitcher = dataset.showViewSwitcher !== 'false';
    if (dataset.views) options.views = dataset.views.split(',').map(v => v.trim());

    // Parse inline events
    if (dataset.events) {
      try {
        options.events = JSON.parse(dataset.events);
      } catch (e) {
        console.warn('[EventCalendar] Invalid events JSON');
      }
    }

    return options;
  },

  /**
   * Add event listener with cleanup tracking
   */
  addTrackedListener(instance, element, event, handler, options) {
    element.addEventListener(event, handler, options);
    instance.eventListeners.push({element, event, handler, options});
  },

  /**
   * Setup event delegation for dynamic content
   */
  setupEventDelegation(instance) {
    const {element} = instance;

    // Delegate click events
    const delegateHandler = (e) => {
      const target = e.target;

      // Event bar clicks
      if (target.closest('.ec-event-bar')) {
        e.stopPropagation();
        const bar = target.closest('.ec-event-bar');
        const eventId = bar.dataset.eventId;
        if (eventId) {
          const event = instance.events.find(ev => ev.id === eventId);
          if (event) {
            this.handleEventClick(instance, event, e);
          }
        }
        return;
      }

      // Timed event clicks
      if (target.closest('.ec-timed-event')) {
        e.stopPropagation();
        const eventEl = target.closest('.ec-timed-event');
        const eventId = eventEl.dataset.eventId;
        if (eventId) {
          const event = instance.events.find(ev => ev.id === eventId);
          if (event) {
            this.handleEventClick(instance, event, e);
          }
        }
        return;
      }

      // All-day event clicks
      if (target.closest('.ec-allday-event')) {
        const eventEl = target.closest('.ec-allday-event');
        const eventId = eventEl.dataset.eventId;
        if (eventId) {
          const event = instance.events.find(ev => ev.id === eventId);
          if (event) {
            this.handleEventClick(instance, event, e);
          }
        }
        return;
      }

      // Hour slot clicks (for week/day view)
      if (target.closest('.ec-hour-slot')) {
        const slot = target.closest('.ec-hour-slot');
        const hour = parseInt(slot.dataset.hour);
        const column = slot.closest('.ec-day-column');
        if (column) {
          const dateStr = column.dataset.date;
          const clickDate = new Date(dateStr);
          clickDate.setHours(hour);
          this.handleDateClick(instance, clickDate, e);
        }
        return;
      }

      // Hour area clicks (day view)
      if (target.closest('.ec-hour-area')) {
        const area = target.closest('.ec-hour-area');
        const slot = area.closest('.ec-hour-slot');
        const hour = parseInt(slot.dataset.hour);
        const clickDate = new Date(instance.currentDate);
        clickDate.setHours(hour);
        this.handleDateClick(instance, clickDate, e);
        return;
      }
    };

    this.addTrackedListener(instance, element, 'click', delegateHandler);
  },

  /**
   * Setup keyboard navigation
   */
  setupKeyboardNavigation(instance) {
    const {element} = instance;

    // Make calendar focusable
    if (!element.hasAttribute('tabindex')) {
      element.setAttribute('tabindex', '0');
    }

    const keyboardHandler = (e) => {
      const {currentDate, currentView} = instance;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this.navigate(instance, -1);
          break;

        case 'ArrowRight':
          e.preventDefault();
          this.navigate(instance, 1);
          break;

        case 'Home':
          e.preventDefault();
          this.goToToday(instance);
          break;

        case 't':
        case 'T':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.goToToday(instance);
          }
          break;

        case 'm':
        case 'M':
          if (!e.ctrlKey && !e.metaKey && instance.config.views.includes('month')) {
            e.preventDefault();
            this.changeView(instance, 'month');
          }
          break;

        case 'w':
        case 'W':
          if (!e.ctrlKey && !e.metaKey && instance.config.views.includes('week')) {
            e.preventDefault();
            this.changeView(instance, 'week');
          }
          break;

        case 'd':
        case 'D':
          if (!e.ctrlKey && !e.metaKey && instance.config.views.includes('day')) {
            e.preventDefault();
            this.changeView(instance, 'day');
          }
          break;
      }
    };

    this.addTrackedListener(instance, element, 'keydown', keyboardHandler);
  },

  /**
   * Setup calendar DOM structure
   */
  setupCalendar(instance) {
    const {element, config} = instance;

    element.classList.add('event-calendar');
    element.setAttribute('role', 'application');
    element.setAttribute('aria-label', 'Event Calendar');
    element.innerHTML = '';

    // Setup event delegation for dynamically created elements
    this.setupEventDelegation(instance);

    // Setup keyboard navigation
    this.setupKeyboardNavigation(instance);

    // Create header
    const header = document.createElement('div');
    header.className = 'ec-header';

    // Navigation
    if (config.showNavigation) {
      const nav = this.createNavigation(instance);
      header.appendChild(nav);
    }

    // View switcher
    if (config.showViewSwitcher && config.views.length > 1) {
      const switcher = this.createViewSwitcher(instance);
      header.appendChild(switcher);
    }

    element.appendChild(header);
    instance.headerElement = header;

    // Content area
    const content = document.createElement('div');
    content.className = 'ec-content';
    element.appendChild(content);
    instance.contentElement = content;
  },

  /**
   * Create navigation controls
   */
  createNavigation(instance) {
    const {config} = instance;
    const strings = this.i18n[config.locale];

    const nav = document.createElement('div');
    nav.className = 'ec-nav';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'ec-nav-btn ec-prev';
    prevBtn.setAttribute('aria-label', strings.previous || 'Previous');
    prevBtn.setAttribute('type', 'button');
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
    this.addTrackedListener(instance, prevBtn, 'click', () => this.navigate(instance, -1));

    // Current period display
    const current = document.createElement('div');
    current.className = 'ec-current-period';
    current.setAttribute('role', 'status');
    current.setAttribute('aria-live', 'polite');
    instance.currentPeriodElement = current;

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'ec-nav-btn ec-next';
    nextBtn.setAttribute('aria-label', strings.next || 'Next');
    nextBtn.setAttribute('type', 'button');
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>';
    this.addTrackedListener(instance, nextBtn, 'click', () => this.navigate(instance, 1));

    nav.appendChild(prevBtn);
    nav.appendChild(current);
    nav.appendChild(nextBtn);

    // Today button
    if (config.showToday) {
      const todayBtn = document.createElement('button');
      todayBtn.className = 'ec-today-btn';
      todayBtn.setAttribute('type', 'button');
      todayBtn.setAttribute('aria-label', strings.today);
      todayBtn.textContent = strings.today;
      this.addTrackedListener(instance, todayBtn, 'click', () => this.goToToday(instance));
      nav.appendChild(todayBtn);
    }

    return nav;
  },

  /**
   * Create view switcher
   */
  createViewSwitcher(instance) {
    const {config} = instance;
    const strings = this.i18n[config.locale];

    const switcher = document.createElement('div');
    switcher.className = 'ec-view-switcher';

    const viewLabels = {
      month: strings.month,
      week: strings.week,
      day: strings.day
    };

    config.views.forEach(view => {
      const btn = document.createElement('button');
      btn.className = `ec-view-btn ${view === instance.currentView ? 'active' : ''}`;
      btn.dataset.view = view;
      btn.textContent = viewLabels[view] || view;
      this.addTrackedListener(instance, btn, 'click', () => this.changeView(instance, view));
      switcher.appendChild(btn);
    });

    instance.viewSwitcherElement = switcher;
    return switcher;
  },

  /**
   * Load events from API
   */
  async loadEvents(instance) {
    const {config} = instance;

    if (!config.api) return;

    instance.isLoading = true;
    this.renderLoading(instance);

    try {
      const viewRange = this.getViewDateRange(instance);
      const params = new URLSearchParams({
        start: this.formatDateISO(viewRange.start),
        end: this.formatDateISO(viewRange.end)
      });

      const url = config.api.includes('?')
        ? `${config.api}&${params}`
        : `${config.api}?${params}`;

      let response;

      if (window.ApiService && typeof ApiService.get === 'function') {
        response = await ApiService.get(url);
      } else {
        const res = await fetch(url, {method: config.apiMethod});
        response = await res.json();
      }

      // Extract events from response
      const events = window.Utils?.object?.get?.(response?.data, config.eventDataPath, []) ??
        (response?.data?.[config.eventDataPath] || response?.data?.data || response?.data || []);
      instance.events = this.normalizeEvents(events);
      instance.error = null;

    } catch (error) {
      console.error('[EventCalendar] Failed to load events:', error);
      instance.error = error.message;
      instance.events = [];
    } finally {
      instance.isLoading = false;
      this.render(instance);
    }
  },

  /**
   * Parse date with timezone awareness
   */
  parseDate(dateString, config) {
    if (!dateString) return new Date();

    const date = new Date(dateString);

    // If timezone is UTC and date string doesn't include timezone info
    if (config.timezone === 'UTC' && !dateString.includes('Z') && !dateString.includes('+')) {
      // Treat as UTC
      return new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
    }

    return date;
  },

  /**
   * Format date for API (ISO format)
   */
  formatDateForAPI(date, config) {
    if (config.timezone === 'UTC') {
      return date.toISOString();
    }
    return this.formatDateISO(date);
  },

  /**
   * Normalize events data
   */
  normalizeEvents(events) {
    // Handle non-array input
    if (!Array.isArray(events)) {
      console.warn('[EventCalendar] Events data is not an array, received:', typeof events);
      return [];
    }

    return events.map((event, index) => {
      // Validate required fields
      if (!event) {
        console.warn('[EventCalendar] Null event at index', index);
        return null;
      }

      // Parse dates safely with timezone awareness
      let startDate, endDate;
      try {
        startDate = event.start ? this.parseDate(event.start, this.config) : new Date();
        if (isNaN(startDate.getTime())) {
          console.warn('[EventCalendar] Invalid start date for event:', event);
          startDate = new Date();
        }
      } catch (e) {
        console.warn('[EventCalendar] Error parsing start date:', e);
        startDate = new Date();
      }

      try {
        endDate = event.end ? this.parseDate(event.end, this.config) : new Date(startDate);
        if (isNaN(endDate.getTime())) {
          console.warn('[EventCalendar] Invalid end date for event:', event);
          endDate = new Date(startDate);
        }
      } catch (e) {
        console.warn('[EventCalendar] Error parsing end date:', e);
        endDate = new Date(startDate);
      }

      // Ensure end is not before start
      if (endDate < startDate) {
        console.warn('[EventCalendar] End date is before start date, swapping');
        [startDate, endDate] = [endDate, startDate];
      }

      return {
        id: event.id || `event-${index}-${Date.now()}`,
        title: event.title || 'Untitled',
        start: startDate,
        end: endDate,
        allDay: event.allDay !== false,
        color: event.color || this.config.eventColors[index % this.config.eventColors.length],
        category: event.category || null,
        description: event.description || null,
        location: event.location || null,
        data: event // Keep original data
      };
    }).filter(event => event !== null); // Remove null events
  },

  /**
   * Main render function
   */
  render(instance) {
    // Show error state if any
    if (instance.error) {
      this.renderError(instance);
      return;
    }

    // Show loading state
    if (instance.isLoading) {
      this.renderLoading(instance);
      return;
    }

    this.updateCurrentPeriod(instance);
    this.updateViewSwitcher(instance);

    switch (instance.currentView) {
      case 'month':
        this.renderMonthView(instance);
        break;
      case 'week':
        this.renderWeekView(instance);
        break;
      case 'day':
        this.renderDayView(instance);
        break;
    }
  },

  /**
   * Render error state
   */
  renderError(instance) {
    const {contentElement, config, error} = instance;
    const strings = this.i18n[config.locale];

    contentElement.innerHTML = `
      <div class="ec-error" role="alert">
        <div class="ec-error-icon">⚠️</div>
        <div class="ec-error-title">${strings.error}</div>
        <div class="ec-error-message">${this.escapeHtml(error)}</div>
        <button type="button" class="ec-retry-btn">${strings.retry || 'Retry'}</button>
      </div>
    `;

    // Add retry handler
    const retryBtn = contentElement.querySelector('.ec-retry-btn');
    if (retryBtn) {
      this.addTrackedListener(instance, retryBtn, 'click', () => {
        instance.error = null;
        if (instance.config.api) {
          this.loadEvents(instance);
        } else {
          this.render(instance);
        }
      });
    }
  },

  /**
   * Render loading state
   */
  renderLoading(instance) {
    const {contentElement, config} = instance;
    const strings = this.i18n[config.locale];

    contentElement.innerHTML = `
      <div class="ec-loading">
        <div class="ec-spinner"></div>
        <span>${strings.loading}</span>
      </div>
    `;
  },

  /**
   * Render month view
   */
  renderMonthView(instance) {
    const {contentElement, currentDate, config, events} = instance;
    const strings = this.i18n[config.locale];

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    contentElement.className = 'ec-content ec-month-view';

    // Create grid container
    const grid = document.createElement('div');
    grid.className = 'ec-month-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Calendar month view');

    // Day headers - use DocumentFragment
    const headerRow = document.createElement('div');
    headerRow.className = 'ec-weekday-header';
    const headerFragment = document.createDocumentFragment();

    for (let i = 0; i < 7; i++) {
      const dayIndex = (config.firstDayOfWeek + i) % 7;
      const header = document.createElement('div');
      header.className = 'ec-weekday';
      header.textContent = strings.dayNamesShort[dayIndex];
      headerFragment.appendChild(header);
    }
    headerRow.appendChild(headerFragment);
    grid.appendChild(headerRow);

    // Calculate grid dates
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // Grid start (might be previous month)
    const gridStart = new Date(monthStart);
    const startDayOffset = (monthStart.getDay() - config.firstDayOfWeek + 7) % 7;
    gridStart.setDate(gridStart.getDate() - startDayOffset);

    // Get spanning event segments for this view
    const segments = this.calculateSpanningSegments(instance, gridStart, 42);

    // Create 6 week rows
    for (let week = 0; week < 6; week++) {
      const weekRow = document.createElement('div');
      weekRow.className = 'ec-week-row';

      // Event container for spanning events
      const eventLayer = document.createElement('div');
      eventLayer.className = 'ec-event-layer';

      // Day cells
      // Day cells - use DocumentFragment
      const dayLayer = document.createElement('div');
      dayLayer.className = 'ec-day-layer';
      const dayFragment = document.createDocumentFragment();

      for (let day = 0; day < 7; day++) {
        const cellDate = new Date(gridStart);
        cellDate.setDate(gridStart.getDate() + (week * 7) + day);

        const cell = this.createDayCell(instance, cellDate, monthStart.getMonth());
        dayFragment.appendChild(cell);
      }
      dayLayer.appendChild(dayFragment);

      // Render spanning events for this week
      const weekStart = new Date(gridStart);
      weekStart.setDate(gridStart.getDate() + (week * 7));
      const weekSegments = this.getWeekSegments(segments, weekStart);
      this.renderWeekEventBars(instance, eventLayer, weekSegments, weekStart);

      weekRow.appendChild(eventLayer);
      weekRow.appendChild(dayLayer);
      grid.appendChild(weekRow);
    }

    fragment.appendChild(grid);

    // Clear and update DOM once
    contentElement.innerHTML = '';
    contentElement.appendChild(fragment);
  },

  /**
   * Create a day cell for month view
   */
  createDayCell(instance, date, currentMonth) {
    const {config, events} = instance;
    const strings = this.i18n[config.locale];
    const today = new Date();

    const cell = document.createElement('div');
    cell.className = 'ec-day-cell';
    cell.dataset.date = this.formatDateISO(date);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', this.formatDate(date, config.locale));
    cell.setAttribute('tabindex', '-1');

    // Add classes
    if (this.isSameDay(date, today)) {
      cell.classList.add('ec-today');
    }
    if (date.getMonth() !== currentMonth) {
      cell.classList.add('ec-other-month');
    }
    if (date.getDay() === 0 || date.getDay() === 6) {
      cell.classList.add('ec-weekend');
    }

    // Day number
    const dayNum = document.createElement('div');
    dayNum.className = 'ec-day-number';
    dayNum.textContent = date.getDate();
    cell.appendChild(dayNum);

    // Count events for this day
    const dayEvents = this.getEventsForDate(events, date);
    const overflowCount = Math.max(0, dayEvents.length - config.maxEventsPerDay);

    if (overflowCount > 0) {
      const moreIndicator = document.createElement('div');
      moreIndicator.className = 'ec-more-events';
      moreIndicator.textContent = strings.moreEvents.replace('{count}', overflowCount);
      const moreHandler = (e) => {
        e.stopPropagation();
        this.showEventsModal(instance, date, dayEvents);
      };
      this.addTrackedListener(instance, moreIndicator, 'click', moreHandler);
      cell.appendChild(moreIndicator);
    }

    // Click handler
    const cellClickHandler = (e) => {
      this.handleDateClick(instance, date, e);
    };
    this.addTrackedListener(instance, cell, 'click', cellClickHandler);

    // Mobile: tap to show day detail
    const isMobile = window.Utils?.browser?.isMobile?.() ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      const mobileClickHandler = (e) => {
        if (dayEvents.length > 0) {
          e.stopPropagation();
          this.showDayDetailModal(instance, date, dayEvents);
        }
      };
      this.addTrackedListener(instance, cell, 'click', mobileClickHandler);
    }

    return cell;
  },

  /**
   * Calculate spanning event segments
   */
  calculateSpanningSegments(instance, gridStart, totalDays) {
    const {events, config, segmentCache} = instance;

    // Create cache key based on events and date range
    const cacheKey = `${this.formatDateISO(gridStart)}-${totalDays}-${events.length}`;

    // Check cache
    if (segmentCache.has(cacheKey)) {
      return segmentCache.get(cacheKey);
    }

    const segments = [];

    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridStart.getDate() + totalDays - 1);

    events.forEach(event => {
      // Skip events outside view range
      if (event.end < gridStart || event.start > gridEnd) return;

      // Split into week segments
      const eventSegments = this.splitEventIntoWeekSegments(
        event,
        gridStart,
        gridEnd,
        config.firstDayOfWeek
      );
      segments.push(...eventSegments);
    });

    // Assign row positions
    const result = this.assignRowPositions(segments, config.firstDayOfWeek);

    // Cache result (limit cache size)
    if (segmentCache.size > 10) {
      const firstKey = segmentCache.keys().next().value;
      segmentCache.delete(firstKey);
    }
    segmentCache.set(cacheKey, result);

    return result;
  },

  /**
   * Split event into weekly segments
   */
  splitEventIntoWeekSegments(event, viewStart, viewEnd, firstDayOfWeek) {
    const segments = [];

    // Clamp to view range
    const eventStart = new Date(Math.max(event.start.getTime(), viewStart.getTime()));
    const eventEnd = new Date(Math.min(event.end.getTime(), viewEnd.getTime()));

    let current = new Date(eventStart);

    while (current <= eventEnd) {
      // Find end of week
      const weekEnd = this.getEndOfWeek(current, firstDayOfWeek);
      const segmentEnd = new Date(Math.min(weekEnd.getTime(), eventEnd.getTime()));

      // Calculate span in days
      const spanDays = Math.floor((segmentEnd - current) / (1000 * 60 * 60 * 24)) + 1;

      // Calculate day offset within week
      const dayOffset = (current.getDay() - firstDayOfWeek + 7) % 7;

      segments.push({
        event: event,
        eventId: event.id,
        start: new Date(current),
        end: new Date(segmentEnd),
        isStart: this.isSameDay(current, event.start),
        isEnd: this.isSameDay(segmentEnd, event.end),
        spanDays: spanDays,
        dayOffset: dayOffset,
        row: -1 // Will be assigned later
      });

      // Move to next week
      current = new Date(weekEnd);
      current.setDate(current.getDate() + 1);
    }

    return segments;
  },

  /**
   * Get end of week for a given date
   */
  getEndOfWeek(date, firstDayOfWeek) {
    const result = new Date(date);
    const dayOfWeek = result.getDay();
    const daysUntilEnd = (6 - dayOfWeek + firstDayOfWeek) % 7;
    result.setDate(result.getDate() + daysUntilEnd);
    return result;
  },

  /**
   * Assign row positions to avoid overlapping
   */
  assignRowPositions(segments, firstDayOfWeek) {
    // Group by week
    const weekGroups = new Map();

    segments.forEach(segment => {
      const weekKey = this.getWeekKey(segment.start, firstDayOfWeek);
      if (!weekGroups.has(weekKey)) {
        weekGroups.set(weekKey, []);
      }
      weekGroups.get(weekKey).push(segment);
    });

    // Assign rows within each week
    weekGroups.forEach(weekSegments => {
      // Sort by start date, then by duration (longer first)
      weekSegments.sort((a, b) => {
        if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
        return b.spanDays - a.spanDays;
      });

      const rows = []; // Each row is an array of occupied day ranges

      weekSegments.forEach(segment => {
        let rowIndex = 0;
        let placed = false;

        while (!placed) {
          if (!rows[rowIndex]) {
            rows[rowIndex] = [];
          }

          // Check if this row has space for the segment
          const hasConflict = rows[rowIndex].some(occupied => {
            const occStart = occupied.dayOffset;
            const occEnd = occupied.dayOffset + occupied.spanDays - 1;
            const segStart = segment.dayOffset;
            const segEnd = segment.dayOffset + segment.spanDays - 1;

            return !(segEnd < occStart || segStart > occEnd);
          });

          if (!hasConflict) {
            rows[rowIndex].push(segment);
            segment.row = rowIndex;
            placed = true;
          } else {
            rowIndex++;
          }
        }
      });
    });

    return segments;
  },

  /**
   * Get week key for grouping
   */
  getWeekKey(date, firstDayOfWeek) {
    const weekStart = this.getStartOfWeek(date, firstDayOfWeek);
    return this.formatDateISO(weekStart);
  },

  /**
   * Get start of week
   */
  getStartOfWeek(date, firstDayOfWeek) {
    const result = new Date(date);
    const dayOfWeek = result.getDay();
    const diff = (dayOfWeek - firstDayOfWeek + 7) % 7;
    result.setDate(result.getDate() - diff);
    return result;
  },

  /**
   * Get segments for a specific week
   */
  getWeekSegments(segments, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return segments.filter(segment => {
      return segment.start >= weekStart && segment.start <= weekEnd;
    });
  },

  /**
   * Render spanning event bars for a week
   */
  renderWeekEventBars(instance, container, segments, weekStart) {
    const {config} = instance;
    const maxRows = config.maxEventsPerDay;

    // Sort by row
    segments.sort((a, b) => a.row - b.row);

    segments.forEach(segment => {
      if (segment.row >= maxRows) return; // Hide if exceeds max

      const bar = document.createElement('div');
      bar.className = 'ec-event-bar';
      bar.dataset.eventId = segment.event.id; // Add event ID for delegation
      bar.style.left = `${(segment.dayOffset / 7) * 100}%`;
      bar.style.width = `${(segment.spanDays / 7) * 100}%`;
      bar.style.top = `${segment.row * 24 + 22}px`; // 22px offset for day number
      bar.style.backgroundColor = segment.event.color;

      // Add start/end classes
      if (segment.isStart) bar.classList.add('ec-event-start');
      if (segment.isEnd) bar.classList.add('ec-event-end');

      // Title
      const title = document.createElement('span');
      title.className = 'ec-event-title';
      title.textContent = segment.event.title;
      bar.appendChild(title);

      // Click handler now handled by delegation

      container.appendChild(bar);
    });
  },

  /**
   * Render week view
   */
  renderWeekView(instance) {
    const {contentElement, currentDate, config, events} = instance;
    const strings = this.i18n[config.locale];

    contentElement.innerHTML = '';
    contentElement.className = 'ec-content ec-week-view';

    const weekStart = this.getStartOfWeek(currentDate, config.firstDayOfWeek);

    // Create week container
    const weekContainer = document.createElement('div');
    weekContainer.className = 'ec-week-container';

    // All-day events section
    const allDaySection = document.createElement('div');
    allDaySection.className = 'ec-allday-section';

    const allDayLabel = document.createElement('div');
    allDayLabel.className = 'ec-allday-label';
    allDayLabel.textContent = strings.allDay;
    allDaySection.appendChild(allDayLabel);

    const allDayGrid = document.createElement('div');
    allDayGrid.className = 'ec-allday-grid';

    // Day columns header
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + i);

      const header = document.createElement('div');
      header.className = 'ec-week-day-header';
      if (this.isSameDay(dayDate, new Date())) {
        header.classList.add('ec-today');
      }

      header.innerHTML = `
        <div class="ec-week-dayname">${strings.dayNamesShort[dayDate.getDay()]}</div>
        <div class="ec-week-daynum">${dayDate.getDate()}</div>
      `;
      allDayGrid.appendChild(header);
    }

    allDaySection.appendChild(allDayGrid);

    // Render all-day spanning events
    const segments = this.calculateSpanningSegments(instance, weekStart, 7);
    const allDayEvents = document.createElement('div');
    allDayEvents.className = 'ec-allday-events';
    this.renderWeekEventBars(instance, allDayEvents, segments, weekStart);
    allDaySection.appendChild(allDayEvents);

    weekContainer.appendChild(allDaySection);

    // Time grid
    const timeGrid = document.createElement('div');
    timeGrid.className = 'ec-time-grid';

    // Time labels column
    const timeLabels = document.createElement('div');
    timeLabels.className = 'ec-time-labels';

    for (let hour = 0; hour < 24; hour++) {
      const label = document.createElement('div');
      label.className = 'ec-time-label';
      label.textContent = `${hour.toString().padStart(2, '0')}:00`;
      timeLabels.appendChild(label);
    }
    timeGrid.appendChild(timeLabels);

    // Day columns
    const dayColumns = document.createElement('div');
    dayColumns.className = 'ec-day-columns';

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + i);

      const column = document.createElement('div');
      column.className = 'ec-day-column';
      column.dataset.date = this.formatDateISO(dayDate);

      // Hour slots
      for (let hour = 0; hour < 24; hour++) {
        const slot = document.createElement('div');
        slot.className = 'ec-hour-slot';
        slot.dataset.hour = hour;

        // Click handler now handled by delegation

        column.appendChild(slot);
      }

      // Render timed events
      const dayEvents = this.getEventsForDate(events, dayDate).filter(e => !e.allDay);
      this.renderTimedEvents(instance, column, dayEvents, dayDate);

      dayColumns.appendChild(column);
    }

    timeGrid.appendChild(dayColumns);
    weekContainer.appendChild(timeGrid);
    contentElement.appendChild(weekContainer);
  },

  /**
   * Render timed events in week/day view
   */
  renderTimedEvents(instance, container, events, date) {
    events.forEach(event => {
      const startHour = event.start.getHours() + event.start.getMinutes() / 60;
      const endHour = event.end.getHours() + event.end.getMinutes() / 60;
      const duration = Math.max(endHour - startHour, 0.5);

      const eventEl = document.createElement('div');
      eventEl.className = 'ec-timed-event';
      eventEl.dataset.eventId = event.id; // Add event ID for delegation
      eventEl.style.top = `${startHour * 48}px`; // 48px per hour
      eventEl.style.height = `${duration * 48}px`;
      eventEl.style.backgroundColor = event.color;

      eventEl.innerHTML = `
        <div class="ec-event-time">${this.formatTime(event.start)}</div>
        <div class="ec-event-title">${this.escapeHtml(event.title)}</div>
      `;

      // Click handler now handled by delegation

      container.appendChild(eventEl);
    });
  },

  /**
   * Render day view
   */
  renderDayView(instance) {
    const {contentElement, currentDate, config, events} = instance;
    const strings = this.i18n[config.locale];

    contentElement.innerHTML = '';
    contentElement.className = 'ec-content ec-day-view';

    // Day header
    const header = document.createElement('div');
    header.className = 'ec-day-header';
    header.innerHTML = `
      <span class="ec-day-name">${strings.dayNames[currentDate.getDay()]}</span>
      <span class="ec-day-date">${currentDate.getDate()}</span>
      <span class="ec-day-month">${strings.monthNames[currentDate.getMonth()]}</span>
    `;
    contentElement.appendChild(header);

    // All-day events
    const dayEvents = this.getEventsForDate(events, currentDate);
    const allDayEvents = dayEvents.filter(e => e.allDay);
    const timedEvents = dayEvents.filter(e => !e.allDay);

    if (allDayEvents.length > 0) {
      const allDaySection = document.createElement('div');
      allDaySection.className = 'ec-day-allday';

      allDayEvents.forEach(event => {
        const eventEl = document.createElement('div');
        eventEl.className = 'ec-allday-event';
        eventEl.dataset.eventId = event.id; // Add event ID for delegation
        eventEl.style.backgroundColor = event.color;
        eventEl.textContent = event.title;
        // Click handler now handled by delegation
        allDaySection.appendChild(eventEl);
      });

      contentElement.appendChild(allDaySection);
    }

    // Time grid
    const timeGrid = document.createElement('div');
    timeGrid.className = 'ec-day-time-grid';

    for (let hour = 0; hour < 24; hour++) {
      const slot = document.createElement('div');
      slot.className = 'ec-hour-slot';
      slot.dataset.hour = hour;

      const label = document.createElement('div');
      label.className = 'ec-hour-label';
      label.textContent = `${hour.toString().padStart(2, '0')}:00`;

      const area = document.createElement('div');
      area.className = 'ec-hour-area';

      // Click handler now handled by delegation

      slot.appendChild(label);
      slot.appendChild(area);
      timeGrid.appendChild(slot);
    }

    // Render timed events
    this.renderTimedEvents(instance, timeGrid, timedEvents, currentDate);

    contentElement.appendChild(timeGrid);
  },

  // ========== Event Handlers ==========

  /**
   * Handle date click
   */
  handleDateClick(instance, date, domEvent) {
    const {config} = instance;

    // Emit event
    this.emitEvent('eventcalendar:dateClick', {
      date,
      instance,
      element: instance.element
    });

    // Call callback if configured
    if (config.onDateClick) {
      if (typeof config.onDateClick === 'function') {
        config.onDateClick(date, instance);
      } else if (typeof config.onDateClick === 'string') {
        // Look for function in window
        const fn = window.Utils?.object?.get?.(window, config.onDateClick) ??
          config.onDateClick.split('.').reduce((o, k) => o?.[k], window);
        if (typeof fn === 'function') {
          fn(date, instance);
        }
      }
    }
  },

  /**
   * Handle event click
   */
  handleEventClick(instance, eventData, domEvent) {
    domEvent.stopPropagation();

    const {config} = instance;

    // Emit event
    this.emitEvent('eventcalendar:eventClick', {
      event: eventData,
      instance,
      element: instance.element
    });

    // API action
    if (config.onEventClickApi) {
      const url = config.onEventClickApi.replace('{id}', eventData.id);

      const fetchEvent = async () => {
        try {
          let response;
          if (window.ApiService && typeof ApiService.get === 'function') {
            response = await ApiService.get(url);
          } else {
            const res = await fetch(url);
            response = await res.json();
          }

          // Process through ResponseHandler
          if (window.ResponseHandler) {
            ResponseHandler.process(response, {
              element: instance.element,
              data: eventData
            });
          }
        } catch (error) {
          console.error('[EventCalendar] Event click API error:', error);
        }
      };

      fetchEvent();
    }

    // Custom callback
    if (config.onEventClick) {
      if (typeof config.onEventClick === 'function') {
        config.onEventClick(eventData, instance);
      } else if (typeof config.onEventClick === 'string') {
        const fn = window.Utils?.object?.get?.(window, config.onEventClick) ??
          config.onEventClick.split('.').reduce((o, k) => o?.[k], window);
        if (typeof fn === 'function') {
          fn(eventData, instance);
        }
      }
    }
  },

  /**
   * Show day detail modal (for mobile)
   */
  showDayDetailModal(instance, date, events) {
    const {config} = instance;
    const strings = this.i18n[config.locale];

    const eventListHtml = events.map(event => `
      <div class="ec-modal-event" data-event-id="${event.id}" style="border-left-color: ${event.color}">
        <div class="ec-modal-event-title">${this.escapeHtml(event.title)}</div>
        ${event.allDay ? `<div class="ec-modal-event-time">${strings.allDay}</div>` :
        `<div class="ec-modal-event-time">${this.formatTime(event.start)} - ${this.formatTime(event.end)}</div>`}
        ${event.location ? `<div class="ec-modal-event-location">${this.escapeHtml(event.location)}</div>` : ''}
      </div>
    `).join('');

    const content = `
      <div class="ec-day-modal">
        <div class="ec-day-modal-date">
          <span class="ec-day-name">${strings.dayNames[date.getDay()]}</span>
          <span class="ec-day-num">${date.getDate()}</span>
          <span class="ec-month-name">${strings.monthNames[date.getMonth()]}</span>
        </div>
        <div class="ec-modal-events">
          ${events.length > 0 ? eventListHtml : `<div class="ec-no-events">${strings.noEvents}</div>`}
        </div>
      </div>
    `;

    this.showModal(content, {
      title: this.formatDate(date, config.locale),
      onEventClick: (eventId) => {
        const event = events.find(e => e.id === eventId);
        if (event) {
          this.handleEventClick(instance, event, {stopPropagation: () => {}});
        }
      }
    });
  },

  /**
   * Show events modal (for "+more" click)
   */
  showEventsModal(instance, date, events) {
    this.showDayDetailModal(instance, date, events);
  },

  /**
   * Show modal using Modal component
   */
  showModal(content, options = {}) {
    if (window.Modal) {
      const modal = new Modal({
        title: options.title || '',
        content: content,
        size: 'medium',
        backdrop: true,
        closeOnBackdrop: true
      });
      modal.show();

      // Bind event click handlers
      if (options.onEventClick) {
        modal.element.querySelectorAll('.ec-modal-event').forEach(el => {
          el.addEventListener('click', () => {
            options.onEventClick(el.dataset.eventId);
            modal.hide();
          });
        });
      }
    } else {
      // Fallback: simple dialog
      if (window.DialogManager) {
        DialogManager.show({
          title: options.title || '',
          content: content,
          buttons: [{text: 'Close', primary: true}]
        });
      }
    }
  },

  // ========== Navigation ==========

  /**
   * Navigate calendar
   */
  navigate(instance, direction) {
    const {currentView, currentDate} = instance;

    switch (currentView) {
      case 'day':
        currentDate.setDate(currentDate.getDate() + direction);
        break;
      case 'week':
        currentDate.setDate(currentDate.getDate() + (direction * 7));
        break;
      case 'month':
        currentDate.setMonth(currentDate.getMonth() + direction);
        break;
    }

    // Reload events if API configured
    if (instance.config.api) {
      this.loadEvents(instance);
    } else {
      this.render(instance);
    }

    this.emitEvent('eventcalendar:navigate', {
      date: new Date(currentDate),
      view: currentView,
      instance
    });
  },

  /**
   * Go to today
   */
  goToToday(instance) {
    instance.currentDate = new Date();

    if (instance.config.api) {
      this.loadEvents(instance);
    } else {
      this.render(instance);
    }

    this.emitEvent('eventcalendar:today', {
      date: new Date(),
      instance
    });
  },

  /**
   * Change view
   */
  changeView(instance, view) {
    if (!instance.config.views.includes(view)) return;

    instance.currentView = view;
    this.render(instance);

    this.emitEvent('eventcalendar:viewChange', {
      view,
      instance
    });
  },

  /**
   * Update current period display
   */
  updateCurrentPeriod(instance) {
    const {currentDate, currentView, config} = instance;
    const strings = this.i18n[config.locale];
    let text = '';

    switch (currentView) {
      case 'day':
        text = `${currentDate.getDate()} ${strings.monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        break;
      case 'week':
        const weekStart = this.getStartOfWeek(currentDate, config.firstDayOfWeek);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        text = `${weekStart.getDate()} - ${weekEnd.getDate()} ${strings.monthNames[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
        break;
      case 'month':
        text = `${strings.monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        break;
    }

    if (instance.currentPeriodElement) {
      instance.currentPeriodElement.textContent = text;
    }
  },

  /**
   * Update view switcher
   */
  updateViewSwitcher(instance) {
    if (!instance.viewSwitcherElement) return;

    instance.viewSwitcherElement.querySelectorAll('.ec-view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === instance.currentView);
    });
  },

  // ========== Utilities ==========

  /**
   * Get events for a specific date
   */
  getEventsForDate(events, date) {
    return events.filter(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // Reset time for date comparison
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);

      const startDate = new Date(eventStart);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(eventEnd);
      endDate.setHours(0, 0, 0, 0);

      return checkDate >= startDate && checkDate <= endDate;
    });
  },

  /**
   * Get view date range
   */
  getViewDateRange(instance) {
    const {currentDate, currentView, config} = instance;
    let start, end;

    switch (currentView) {
      case 'day':
        start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(currentDate);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        start = this.getStartOfWeek(currentDate, config.firstDayOfWeek);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'month':
        start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        // Extend to include visible days from adjacent months
        const startOffset = (start.getDay() - config.firstDayOfWeek + 7) % 7;
        start.setDate(start.getDate() - startOffset);
        const endOffset = (6 - end.getDay() + config.firstDayOfWeek) % 7;
        end.setDate(end.getDate() + endOffset);
        break;
    }

    return {start, end};
  },

  /**
   * Check if two dates are the same day
   */
  isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  },

  /**
   * Format date as ISO string (YYYY-MM-DD)
   */
  formatDateISO(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Format date for display
   */
  formatDate(date, locale = 'en') {
    const strings = this.i18n[locale] || this.i18n.en;
    return `${date.getDate()} ${strings.monthNames[date.getMonth()]} ${date.getFullYear()}`;
  },

  /**
   * Format time
   */
  formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  /**
   * Escape HTML entities
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Emit event
   */
  emitEvent(eventName, data) {
    EventManager.emit(eventName, data);

    // Also dispatch DOM event
    const event = new CustomEvent(eventName, {
      detail: data,
      bubbles: true
    });
    document.dispatchEvent(event);
  },

  // ========== Public API ==========

  /**
   * Add event
   */
  addEvent(elementOrInstance, event) {
    const instance = this.getInstance(elementOrInstance);
    if (!instance) return;

    const normalizedEvent = this.normalizeEvents([event])[0];
    instance.events.push(normalizedEvent);
    instance.segmentCache.clear(); // Clear cache when events change
    this.render(instance);

    this.emitEvent('eventcalendar:eventAdd', {
      event: normalizedEvent,
      instance
    });
  },

  /**
   * Remove event
   */
  removeEvent(elementOrInstance, eventId) {
    const instance = this.getInstance(elementOrInstance);
    if (!instance) return;

    instance.events = instance.events.filter(e => e.id !== eventId);
    instance.segmentCache.clear(); // Clear cache when events change
    this.render(instance);

    this.emitEvent('eventcalendar:eventRemove', {
      eventId,
      instance
    });
  },

  /**
   * Update event
   */
  updateEvent(elementOrInstance, eventId, data) {
    const instance = this.getInstance(elementOrInstance);
    if (!instance) return;

    const index = instance.events.findIndex(e => e.id === eventId);
    if (index !== -1) {
      instance.events[index] = {...instance.events[index], ...data};
      instance.segmentCache.clear(); // Clear cache when events change
      this.render(instance);

      this.emitEvent('eventcalendar:eventUpdate', {
        event: instance.events[index],
        instance
      });
    }
  },

  /**
   * Get events
   */
  getEvents(elementOrInstance, start = null, end = null) {
    const instance = this.getInstance(elementOrInstance);
    if (!instance) return [];

    let events = [...instance.events];

    if (start && end) {
      events = events.filter(e =>
        e.start <= end && e.end >= start
      );
    }

    return events;
  },

  /**
   * Refresh events from API
   */
  refreshEvents(elementOrInstance) {
    const instance = this.getInstance(elementOrInstance);
    if (instance && instance.config.api) {
      this.loadEvents(instance);
    }
  },

  /**
   * Set events directly
   */
  setEvents(elementOrInstance, events) {
    const instance = this.getInstance(elementOrInstance);
    if (!instance) return;

    instance.events = this.normalizeEvents(events);
    instance.segmentCache.clear(); // Clear cache when events change
    this.render(instance);
  },

  /**
   * Get instance
   */
  getInstance(elementOrInstance) {
    if (elementOrInstance && elementOrInstance.element) {
      return elementOrInstance; // Already an instance
    }

    if (typeof elementOrInstance === 'string') {
      elementOrInstance = document.querySelector(elementOrInstance);
    }

    return elementOrInstance?._eventCalendar || null;
  },

  /**
   * Destroy instance
   */
  destroy(elementOrInstance) {
    const instance = this.getInstance(elementOrInstance);
    if (!instance) return;

    const {element} = instance;

    // Remove all tracked event listeners
    if (instance.eventListeners && instance.eventListeners.length > 0) {
      instance.eventListeners.forEach(({element: el, event, handler, options}) => {
        el.removeEventListener(event, handler, options);
      });
      instance.eventListeners = [];
    }

    // Clear intervals/timeouts if any
    if (instance.updateTimer) {
      clearInterval(instance.updateTimer);
    }

    // Clear DOM
    element.innerHTML = '';
    element.classList.remove('event-calendar');

    // Remove references
    delete element._eventCalendar;
    this.state.instances.delete(element);

    // Emit destroy event
    this.emitEvent('eventcalendar:destroy', {element});
  }
};

// Register with Now framework if available
if (window.Now?.registerManager) {
  Now.registerManager('eventCalendar', EventCalendar);
}

// Expose globally (but don't auto-init - let app decide)
window.EventCalendar = EventCalendar;

// Auto-initialize when DOM is ready (only if not already initialized)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!EventCalendar.state.initialized) {
      EventCalendar.init();
    }
  });
} else {
  if (!EventCalendar.state.initialized) {
    EventCalendar.init();
  }
}
