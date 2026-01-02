/**
 * Custom Date Picker Component - No Native Input Dependencies
 * Creates a complete calendar UI with dropdown functionality
 */

// Helper functions
function _pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function _toDateISO(d) {
  return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
}

function _toTimeHM(d) {
  return _pad(d.getHours()) + ':' + _pad(d.getMinutes());
}

function _toLocalDateTime(d) {
  return _toDateISO(d) + 'T' + _toTimeHM(d);
}

/**
 * Get current locale from I18nManager or browser
 */
function _getCurrentLocale() {
  // Try I18nManager first (primary source)
  const i18n = window.Now?.getManager?.('i18n') || window.I18nManager;
  if (i18n?.getCurrentLocale) {
    return i18n.getCurrentLocale();
  }

  // Try LanguageManager (legacy)
  if (window.LanguageManager?.getCurrentLanguage) {
    return window.LanguageManager.getCurrentLanguage();
  }

  // Fallback to browser language
  const browserLang = navigator.language || navigator.userLanguage || 'en';
  return browserLang.split('-')[0];
}

/**
 * Get localized day names (narrow form)
 * Uses Utils.date.getDayNamesNarrow for consistency
 */
function _getDayNames(locale = null) {
  const loc = locale || _getCurrentLocale();
  // Use Utils.date if available, fallback to inline
  if (window.Utils?.date?.getDayNamesNarrow) {
    return Utils.date.getDayNamesNarrow(loc);
  }
  // Fallback
  const baseLocale = loc.split('-')[0];
  if (baseLocale === 'th') {
    return ['อ', 'จ', 'อ', 'พ', 'พ', 'ศ', 'ส'];
  }
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
}

/**
 * Get localized month names (full form)
 * Uses Utils.date.getMonthNames for consistency
 */
function _getMonthNames(locale = null) {
  const loc = locale || _getCurrentLocale();
  // Use Utils.date if available, fallback to inline
  if (window.Utils?.date?.getMonthNames) {
    return Utils.date.getMonthNames(loc);
  }
  // Fallback
  const baseLocale = loc.split('-')[0];
  if (baseLocale === 'th') {
    return [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
  }
  return [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
}

/**
 * Get localized month names (short form)
 * Uses Utils.date.getMonthNamesShort for consistency
 */
function _getMonthNamesShort(locale = null) {
  const loc = locale || _getCurrentLocale();
  // Use Utils.date if available, fallback to inline
  if (window.Utils?.date?.getMonthNamesShort) {
    return Utils.date.getMonthNamesShort(loc);
  }
  // Fallback
  const baseLocale = loc.split('-')[0];
  if (baseLocale === 'th') {
    return [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
  }
  return [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
}

/**
 * Custom Date Picker - Complete calendar implementation without native inputs
 */
class EmbeddedDateTime {
  constructor(originalElement) {
    this._original = originalElement;
    if (!this._original) {
      throw new Error('EmbeddedDateTime: Original element is required');
    }

    this.type = (this._original.getAttribute('type') || 'date').toLowerCase();
    this.name = this._original.getAttribute('name') || '';
    this.id = this._original.id || ('gdatetime-' + Math.random().toString(36).slice(2, 8));

    // Get current locale
    this.locale = _getCurrentLocale();

    // Format options (using standard tokens)
    // data-format: output format for database (always use 'th-CE' for CE year in database)
    // data-display-format: display format (auto locale-based BE/CE)
    //
    // Standard tokens: YYYY, MM, DD, MMMM, MMM, etc.
    // Locale determines BE/CE: 'th' = BE, 'th-CE' = CE, 'en' = CE
    //
    // Examples:
    //   data-format="YYYY-MM-DD" with locale="th-CE" → "2000-05-15" (CE for database)
    //   data-display-format="D MMMM YYYY" with locale="th" → "15 พฤษภาคม 2543" (BE for display)
    //   data-display-format="D MMMM YYYY" with locale="en" → "15 May 2000" (CE for display)
    this.outputFormat = this._original.getAttribute('data-format') || 'YYYY-MM-DD';
    this.displayFormat = this._original.getAttribute('data-display-format') || 'D MMM YYYY';

    // Output always uses CE for database compatibility (force 'th-CE' or 'en')
    this.outputLocale = this.locale.startsWith('th') ? 'th-CE' : 'en';
    // Display uses current locale (BE for Thai, CE for others)
    this.displayLocale = this.locale;

    // Initialize state
    this.selectedDate = null;
    this.selectedTime = null; // For datetime-local and time types
    this.currentMonth = new Date().getMonth();
    this.currentYear = new Date().getFullYear();
    this.currentView = 'day'; // 'year', 'month', or 'day'
    this.isOpen = false;

    // Get constraints
    this.min = this._original.getAttribute('min') || null;
    this.max = this._original.getAttribute('max') || null;
    this.required = this._original.hasAttribute('required');
    this.disabled = this._original.hasAttribute('disabled');
    this.readonly = this._original.hasAttribute('readonly');

    this._initializeElements();
    this._setupEventListeners();
    this._replaceOriginalElement();

    // Set initial value if exists
    const initialValue = this._original.value || this._original.getAttribute('value');
    if (initialValue) {
      this.setValue(initialValue);
    }
  }

  _initializeElements() {
    // Create main wrapper
    const existingFormControl = this._original.closest('.form-control');
    if (existingFormControl) {
      this.wrapper = existingFormControl;
    } else {
      this.wrapper = document.createElement('div');
    }
    this.wrapper.classList.add('custom-datepicker');
    this.wrapper.id = this.id + '_wrapper';

    // Create display button
    this.displayButton = document.createElement('button');
    this.displayButton.type = 'button';
    this.displayButton.className = 'dropdown-button';
    this.wrapper.appendChild(this.displayButton);

    // Create selected items display
    const display = document.createElement('span');
    display.className = 'dropdown-display';
    display.textContent = Now.translate(this._original.placeholder || 'Choose a date');
    this.displayButton.appendChild(display);

    // Create dropdown arrow
    const arrow = document.createElement('span');
    arrow.className = 'dropdown-arrow';
    this.displayButton.appendChild(arrow);

    // hiddenInput will be assigned in _replaceOriginalElement() as the original element
    this.hiddenInput = null;

    // Create calendar dropdown (will be moved to DropdownPanel)
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'datepicker-dropdown';

    // Get DropdownPanel singleton
    this.dropdownPanel = DropdownPanel.getInstance();

    this._createCalendarStructure();
  }

  _createCalendarStructure() {
    // Calendar header
    this.calendarHeader = document.createElement('div');
    this.calendarHeader.className = 'calendar-header';

    // Previous button
    this.prevButton = document.createElement('button');
    this.prevButton.type = 'button';
    this.prevButton.className = 'calendar-nav prev';
    this.prevButton.innerHTML = '‹';
    this.calendarHeader.appendChild(this.prevButton);

    // Month/Year display container
    const displayContainer = document.createElement('div');
    displayContainer.className = 'month-year-container';

    // Month display (clickable)
    this.monthDisplay = document.createElement('button');
    this.monthDisplay.type = 'button';
    this.monthDisplay.className = 'month-display';
    displayContainer.appendChild(this.monthDisplay);

    // Year display (clickable)
    this.yearDisplay = document.createElement('button');
    this.yearDisplay.type = 'button';
    this.yearDisplay.className = 'year-display';
    displayContainer.appendChild(this.yearDisplay);

    this.calendarHeader.appendChild(displayContainer);

    // Next button
    this.nextButton = document.createElement('button');
    this.nextButton.type = 'button';
    this.nextButton.className = 'calendar-nav next';
    this.nextButton.innerHTML = '›';
    this.calendarHeader.appendChild(this.nextButton);

    this.dropdown.appendChild(this.calendarHeader);

    // Days of week header (only for day view)
    this.daysHeader = document.createElement('div');
    this.daysHeader.className = 'days-header';
    _getDayNames(this.locale).forEach(day => {
      const dayElement = document.createElement('div');
      dayElement.className = 'day-name';
      dayElement.textContent = day;
      this.daysHeader.appendChild(dayElement);
    });
    this.dropdown.appendChild(this.daysHeader);

    // Calendar grid (multi-purpose: days/months/years)
    this.calendarGrid = document.createElement('div');
    this.calendarGrid.className = 'calendar-grid';
    this.dropdown.appendChild(this.calendarGrid);

    // Time picker section (for datetime-local and time types)
    if (this.type === 'datetime-local') {
      this._createTimePicker();
    }
  }

  _createTimePicker() {
    const timePickerSection = document.createElement('div');
    timePickerSection.className = 'time-picker-section';

    const timeInputs = document.createElement('div');
    timeInputs.className = 'time-inputs';

    // Hours
    const hoursGroup = document.createElement('div');
    hoursGroup.className = 'time-group';

    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.className = 'time-input hours';
    hoursInput.min = '0';
    hoursInput.max = '23';
    hoursInput.value = '00';
    hoursInput.placeholder = 'HH';
    this.hoursInput = hoursInput;

    hoursGroup.appendChild(hoursInput);
    timeInputs.appendChild(hoursGroup);

    // Separator
    const separator1 = document.createElement('span');
    separator1.className = 'time-separator';
    separator1.textContent = ':';
    timeInputs.appendChild(separator1);

    // Minutes
    const minutesGroup = document.createElement('div');
    minutesGroup.className = 'time-group';

    const minutesInput = document.createElement('input');
    minutesInput.type = 'number';
    minutesInput.className = 'time-input minutes';
    minutesInput.min = '0';
    minutesInput.max = '59';
    minutesInput.value = '00';
    minutesInput.placeholder = 'MM';
    this.minutesInput = minutesInput;

    minutesGroup.appendChild(minutesInput);
    timeInputs.appendChild(minutesGroup);

    // Seconds (optional - can be enabled via data-show-seconds)
    const showSeconds = this._original.getAttribute('data-show-seconds') === 'true';
    if (showSeconds) {
      const separator2 = document.createElement('span');
      separator2.className = 'time-separator';
      separator2.textContent = ':';
      timeInputs.appendChild(separator2);

      const secondsGroup = document.createElement('div');
      secondsGroup.className = 'time-group';

      const secondsInput = document.createElement('input');
      secondsInput.type = 'number';
      secondsInput.className = 'time-input seconds';
      secondsInput.min = '0';
      secondsInput.max = '59';
      secondsInput.value = '00';
      secondsInput.placeholder = 'SS';
      this.secondsInput = secondsInput;

      secondsGroup.appendChild(secondsInput);
      timeInputs.appendChild(secondsGroup);
    }

    timePickerSection.appendChild(timeInputs);
    this.dropdown.appendChild(timePickerSection);

    // Setup time input events
    this._setupTimeInputEvents();
  }

  _setupTimeInputEvents() {
    const validateAndFormat = (input, max) => {
      let value = parseInt(input.value) || 0;
      if (value < 0) value = 0;
      if (value > max) value = max;
      input.value = _pad(value);
    };

    if (this.hoursInput) {
      this.hoursInput.addEventListener('input', (e) => {
        if (e.target.value.length >= 2) {
          validateAndFormat(e.target, 23);
          if (this.minutesInput) this.minutesInput.focus();
        }
      });

      this.hoursInput.addEventListener('blur', (e) => {
        validateAndFormat(e.target, 23);
      });
    }

    if (this.minutesInput) {
      this.minutesInput.addEventListener('input', (e) => {
        if (e.target.value.length >= 2) {
          validateAndFormat(e.target, 59);
          if (this.secondsInput) this.secondsInput.focus();
        }
      });

      this.minutesInput.addEventListener('blur', (e) => {
        validateAndFormat(e.target, 59);
      });
    }

    if (this.secondsInput) {
      this.secondsInput.addEventListener('input', (e) => {
        if (e.target.value.length >= 2) {
          validateAndFormat(e.target, 59);
        }
      });

      this.secondsInput.addEventListener('blur', (e) => {
        validateAndFormat(e.target, 59);
      });
    }
  }

  _setupEventListeners() {
    // Display button click
    this.displayButton.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.disabled || this.readonly) return;
      this.toggle();
    });

    // Month display click - go to month picker
    this.monthDisplay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.currentView = 'month';
      this._renderCurrentView();
    });

    // Year display click - go to year picker
    this.yearDisplay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent dropdown from closing
      this.currentView = 'year';
      this._renderCurrentView();
    });

    // Navigation buttons
    this.prevButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent dropdown from closing
      this._navigatePrevious();
    });

    this.nextButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent dropdown from closing
      this._navigateNext();
    });

    // Keyboard navigation
    this.wrapper.addEventListener('keydown', (e) => {
      if (this.disabled || this.readonly) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.toggle();
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          break;
      }
    });

    // Copy/Paste support
    this.wrapper.addEventListener('copy', (e) => {
      if (this.hiddenInput.value) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', this.hiddenInput.value);
      }
    });

    this.wrapper.addEventListener('paste', (e) => {
      if (this.disabled || this.readonly) return;
      e.preventDefault();
      const pastedText = e.clipboardData.getData('text/plain').trim();
      if (pastedText) {
        this.setValue(pastedText);
      }
    });

    // Listen for locale changes to re-render with new language
    this._localeChangeHandler = () => {
      this._updateLocale();
    };
    if (window.EventManager?.on) {
      EventManager.on('locale:changed', this._localeChangeHandler);
    }
  }

  /**
   * Update locale and re-render UI when language changes
   */
  _updateLocale() {
    // Update locale
    const newLocale = _getCurrentLocale();
    if (newLocale === this.locale) return;

    this.locale = newLocale;
    this.outputLocale = this.locale.startsWith('th') ? 'th-CE' : 'en';
    this.displayLocale = this.locale;

    // Update days header
    this.daysHeader.innerHTML = '';
    _getDayNames(this.locale).forEach(day => {
      const dayElement = document.createElement('div');
      dayElement.className = 'day-name';
      dayElement.textContent = day;
      this.daysHeader.appendChild(dayElement);
    });

    // Update display value if date is selected
    if (this.selectedDate) {
      const displayValue = Utils.date.format(this.selectedDate, this.displayFormat, this.displayLocale);
      if (this.type === 'datetime-local' && this.hoursInput && this.minutesInput) {
        const hours = parseInt(this.hoursInput.value) || 0;
        const minutes = parseInt(this.minutesInput.value) || 0;
        this.displayButton.firstChild.textContent = displayValue + ' ' + _pad(hours) + ':' + _pad(minutes);
      } else {
        this.displayButton.firstChild.textContent = displayValue;
      }
    }

    // Re-render current view if open
    if (this.isOpen) {
      this._renderCurrentView();
    }
  }

  _navigatePrevious() {
    switch (this.currentView) {
      case 'day':
        this.previousMonth();
        break;
      case 'month':
        this.currentYear--;
        this._renderCurrentView();
        break;
      case 'year':
        this.currentYear -= 12;
        this._renderCurrentView();
        break;
    }
  }

  _navigateNext() {
    switch (this.currentView) {
      case 'day':
        this.nextMonth();
        break;
      case 'month':
        this.currentYear++;
        this._renderCurrentView();
        break;
      case 'year':
        this.currentYear += 12;
        this._renderCurrentView();
        break;
    }
  }

  _renderCurrentView() {
    switch (this.currentView) {
      case 'year':
        this._renderYearPicker();
        break;
      case 'month':
        this._renderMonthPicker();
        break;
      case 'day':
      default:
        this._renderCalendar();
        break;
    }
  }

  _renderYearPicker() {
    const startYear = this.currentYear - (this.currentYear % 12);
    const endYear = startYear + 11;

    // Use BE for Thai locale, CE for others
    const useBE = this.displayLocale === 'th';
    const displayStartYear = useBE ? startYear + 543 : startYear;
    const displayEndYear = useBE ? endYear + 543 : endYear;

    this.yearDisplay.textContent = `${displayStartYear} - ${displayEndYear}`;
    this.yearDisplay.style.flex = '1';
    this.yearDisplay.style.display = null;
    this.monthDisplay.textContent = '';
    this.monthDisplay.style.display = 'none';

    // Hide days header
    this.daysHeader.style.display = 'none';

    // Clear and setup grid for years
    this.calendarGrid.innerHTML = '';
    this.calendarGrid.className = 'calendar-grid year-grid';

    // Create year buttons (12 years)
    for (let i = 0; i < 12; i++) {
      const year = startYear + i;
      const yearButton = document.createElement('button');
      yearButton.type = 'button';
      yearButton.className = 'calendar-year';

      // Show year BE or CE according to locale
      const displayYear = useBE ? year + 543 : year;
      yearButton.textContent = displayYear;

      // Highlight current year
      if (year === new Date().getFullYear()) {
        yearButton.classList.add('today');
      }

      if (year === this.currentYear) {
        yearButton.classList.add('selected');
      }

      yearButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent dropdown from closing
        this.currentYear = year;
        this.currentView = 'month'; // Go to month view
        this._renderCurrentView();
      });

      this.calendarGrid.appendChild(yearButton);
    }
  }

  _renderMonthPicker() {
    // Use BE for Thai locale, CE for others
    const useBE = this.displayLocale === 'th';
    const displayYear = useBE ? this.currentYear + 543 : this.currentYear;

    this.yearDisplay.textContent = displayYear;
    this.yearDisplay.style.flex = '1';
    this.monthDisplay.textContent = '';
    this.monthDisplay.style.display = 'none';

    // Hide days header
    this.daysHeader.style.display = 'none';

    // Clear and setup grid for months
    this.calendarGrid.innerHTML = '';
    this.calendarGrid.className = 'calendar-grid month-grid';

    // Create month buttons (12 months)
    for (let i = 0; i < 12; i++) {
      const monthButton = document.createElement('button');
      monthButton.type = 'button';
      monthButton.className = 'calendar-month';
      monthButton.textContent = _getMonthNamesShort(this.locale)[i];

      // Highlight current month
      const now = new Date();
      if (i === now.getMonth() && this.currentYear === now.getFullYear()) {
        monthButton.classList.add('today');
      }

      if (i === this.currentMonth) {
        monthButton.classList.add('selected');
      }

      monthButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent dropdown from closing
        this.currentMonth = i;
        this.currentView = 'day'; // Go to day view
        this._renderCurrentView();
      });

      this.calendarGrid.appendChild(monthButton);
    }
  }

  _renderCalendar() {
    // Use BE for Thai locale, CE for others
    const useBE = this.displayLocale === 'th';
    const displayYear = useBE ? this.currentYear + 543 : this.currentYear;

    this.monthDisplay.textContent = _getMonthNames(this.locale)[this.currentMonth];
    this.monthDisplay.style.display = '';
    this.yearDisplay.textContent = displayYear;
    this.monthDisplay.style.flex = '';
    this.yearDisplay.style.flex = '';

    // Show days header
    this.daysHeader.style.display = 'grid';

    // Reset grid class
    this.calendarGrid.className = 'calendar-grid';

    // Clear calendar grid
    this.calendarGrid.innerHTML = '';

    // Get first day of month and number of days
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    // Create 6 weeks of days (42 days total)
    for (let i = 0; i < 42; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);

      const dayElement = document.createElement('button');
      dayElement.type = 'button';
      dayElement.className = 'calendar-day';
      dayElement.textContent = currentDate.getDate();

      // Add classes for styling
      if (currentDate.getMonth() !== this.currentMonth) {
        dayElement.classList.add('other-month');
      }

      if (this._isSameDate(currentDate, new Date())) {
        dayElement.classList.add('today');
      }

      if (this.selectedDate && this._isSameDate(currentDate, this.selectedDate)) {
        dayElement.classList.add('selected');
      }

      // Check if date is disabled
      if (this._isDateDisabled(currentDate)) {
        dayElement.disabled = true;
        dayElement.classList.add('disabled');
      } else {
        dayElement.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation(); // Prevent dropdown from closing
          this.selectDate(currentDate);
        });
      }

      this.calendarGrid.appendChild(dayElement);
    }
  }

  _isSameDate(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  }

  _isDateDisabled(date) {
    if (this.min) {
      const minDate = new Date(this.min);
      if (date < minDate) return true;
    }

    if (this.max) {
      const maxDate = new Date(this.max);
      if (date > maxDate) return true;
    }

    return false;
  }

  // Public methods
  open() {
    if (this.disabled || this.readonly || this.isOpen) return;

    this.isOpen = true;

    // Hide/show calendar elements based on type
    if (this.type === 'time') {
      // For time picker, hide calendar elements
      this.calendarHeader.style.display = 'none';
      this.daysHeader.style.display = 'none';
      this.calendarGrid.style.display = 'none';
    } else {
      // Show calendar elements for date/datetime-local
      this.calendarHeader.style.display = '';
      this.daysHeader.style.display = '';
      this.calendarGrid.style.display = '';
      this.currentView = 'day'; // Start at day view
      this._renderCurrentView();
    }

    // Show dropdown in DropdownPanel
    this.dropdownPanel.show(this.wrapper, this.dropdown, {
      align: 'left',
      offsetY: 5,
      onClose: () => {
        this.isOpen = false;
        // Dispatch close event
        this.wrapper.dispatchEvent(new CustomEvent('gdatetime:close', {
          detail: {type: this.type, value: this.selectedDate}
        }));
      }
    });

    // Focus time input if time type
    if (this.type === 'time' && this.hoursInput) {
      setTimeout(() => {
        this.hoursInput.focus();
        this.hoursInput.select();
      }, 50);
    }

    // Dispatch event
    this.wrapper.dispatchEvent(new CustomEvent('gdatetime:open', {
      detail: {type: this.type, value: this.selectedDate}
    }));
  }

  close() {
    if (!this.isOpen) return;

    // Hide the DropdownPanel (will trigger onClose callback)
    this.dropdownPanel.hide();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  selectDate(date) {
    this.selectedDate = new Date(date);

    let outputValue, displayValue;

    if (this.type === 'datetime-local') {
      // Get time from inputs or use current time
      const hours = this.hoursInput ? parseInt(this.hoursInput.value) || 0 : this.selectedDate.getHours();
      const minutes = this.minutesInput ? parseInt(this.minutesInput.value) || 0 : this.selectedDate.getMinutes();
      const seconds = this.secondsInput ? parseInt(this.secondsInput.value) || 0 : 0;

      this.selectedDate.setHours(hours, minutes, seconds, 0);

      // Format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM
      outputValue = _toLocalDateTime(this.selectedDate);
      if (this.secondsInput) {
        outputValue += ':' + _pad(seconds);
      }

      // Display format
      displayValue = Utils.date.format(this.selectedDate, this.displayFormat, this.displayLocale) + ' ' +
        _pad(hours) + ':' + _pad(minutes);
      if (this.secondsInput) {
        displayValue += ':' + _pad(seconds);
      }

    } else if (this.type === 'time') {
      // Time only
      const hours = this.hoursInput ? parseInt(this.hoursInput.value) || 0 : 0;
      const minutes = this.minutesInput ? parseInt(this.minutesInput.value) || 0 : 0;
      const seconds = this.secondsInput ? parseInt(this.secondsInput.value) || 0 : 0;

      outputValue = _pad(hours) + ':' + _pad(minutes);
      if (this.secondsInput) {
        outputValue += ':' + _pad(seconds);
      }
      displayValue = outputValue;

    } else {
      // Date only - output uses CE year for database, display uses locale (BE/CE)
      outputValue = Utils.date.format(this.selectedDate, this.outputFormat, this.outputLocale);
      displayValue = Utils.date.format(this.selectedDate, this.displayFormat, this.displayLocale);
    }

    this.hiddenInput.value = outputValue;
    this.hiddenInput.setAttribute('value', outputValue);
    this.displayButton.firstChild.textContent = displayValue;

    // Don't auto-close for datetime-local (let user set time)
    if (this.type !== 'datetime-local') {
      this.close();
    }

    // Focus to wrapper
    setTimeout(() => {
      this.wrapper.focus();
    }, 0);

    // Dispatch events
    const changeEvent = new Event('change', {bubbles: true});
    this.hiddenInput.dispatchEvent(changeEvent);

    this.wrapper.dispatchEvent(new CustomEvent('gdatetime:change', {
      detail: {
        type: this.type,
        value: this.hiddenInput.value,
        date: this.selectedDate
      }
    }));
  }

  previousMonth() {
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this._renderCurrentView();
  }

  nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this._renderCurrentView();
  }

  setValue(value) {
    if (!value || value === '') {
      this.selectedDate = null;
      this.selectedTime = null;
      this.hiddenInput.value = '';
      this.hiddenInput.setAttribute('value', '');

      const placeholder = this.type === 'time' ? 'Choose time' :
        this.type === 'datetime-local' ? 'Choose date and time' :
          'Choose a date';
      this.displayButton.firstChild.textContent = Now.translate(this._original.placeholder || placeholder);

      // Reset time inputs
      if (this.hoursInput) this.hoursInput.value = '00';
      if (this.minutesInput) this.minutesInput.value = '00';
      if (this.secondsInput) this.secondsInput.value = '00';
      return;
    }

    if (this.type === 'time') {
      // Parse time value (HH:MM or HH:MM:SS)
      const timeParts = value.split(':');
      if (timeParts.length >= 2) {
        const hours = parseInt(timeParts[0]) || 0;
        const minutes = parseInt(timeParts[1]) || 0;
        const seconds = timeParts[2] ? parseInt(timeParts[2]) || 0 : 0;

        if (this.hoursInput) this.hoursInput.value = _pad(hours);
        if (this.minutesInput) this.minutesInput.value = _pad(minutes);
        if (this.secondsInput) this.secondsInput.value = _pad(seconds);

        this.hiddenInput.value = value;
        this.hiddenInput.setAttribute('value', value);
        this.displayButton.firstChild.textContent = value;
        return;
      }
    }

    // Parse date or datetime-local value
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      console.warn('Invalid date value:', value);
      return;
    }

    this.selectedDate = date;
    this.currentMonth = date.getMonth();
    this.currentYear = date.getFullYear();

    if (this.type === 'datetime-local') {
      // Extract time components
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();

      if (this.hoursInput) this.hoursInput.value = _pad(hours);
      if (this.minutesInput) this.minutesInput.value = _pad(minutes);
      if (this.secondsInput) this.secondsInput.value = _pad(seconds);

      // Format output
      let outputValue = _toLocalDateTime(date);
      if (this.secondsInput) {
        outputValue += ':' + _pad(seconds);
      }
      this.hiddenInput.value = outputValue;
      this.hiddenInput.setAttribute('value', outputValue);

      // Format display using current locale
      const displayValue = Utils.date.format(date, this.displayFormat, this.displayLocale) + ' ' +
        _pad(hours) + ':' + _pad(minutes);
      this.displayButton.firstChild.textContent = displayValue + (this.secondsInput ? ':' + _pad(seconds) : '');

    } else {
      // Date only - output uses CE year for database, display uses locale (BE/CE)
      const outputValue = Utils.date.format(this.selectedDate, this.outputFormat, this.outputLocale);
      this.hiddenInput.value = outputValue;
      this.hiddenInput.setAttribute('value', outputValue);

      const displayValue = Utils.date.format(this.selectedDate, this.displayFormat, this.displayLocale);
      this.displayButton.firstChild.textContent = displayValue;
    }
  }

  getValue() {
    return this.hiddenInput.value || null;
  }

  getDate() {
    return this.selectedDate;
  }

  destroy() {
    // Close dropdown if open
    if (this.isOpen) {
      this.close();
    }

    // Remove locale change listener
    if (this._localeChangeHandler && window.EventManager?.off) {
      EventManager.off('locale:changed', this._localeChangeHandler);
    }

    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
  }

  getElement() {
    return this.wrapper;
  }

  _replaceOriginalElement() {
    if (this._original.parentNode) {
      // Hide original element but don't remove it, so form can still read value
      this._original.type = 'hidden';
      this._original.style.display = 'none';

      // Use original element as hiddenInput
      this.hiddenInput = this._original;

      // Insert wrapper before original element only if wrapper is not already the parent
      if (this._original.parentNode !== this.wrapper) {
        this._original.parentNode.insertBefore(this.wrapper, this._original);
      }
    }
  }
}

/**
 * DateElementFactory - Factory for creating custom date picker elements
 */
class DateElementFactory extends ElementFactory {
  static config = {
    ...ElementFactory.config,
    type: 'date'
  };

  static createInstance(element, config = {}) {
    const instance = super.createInstance(element, config);
    return instance;
  }

  static setupElement(instance) {
    const {element} = instance;

    try {
      const gdatetime = new EmbeddedDateTime(element);

      instance.wrapper = gdatetime.getElement();
      instance.gdatetime = gdatetime;

      // Bind methods
      instance.getValue = () => gdatetime.getValue();
      instance.setValue = (value) => gdatetime.setValue(value);
      instance.getDate = () => gdatetime.getDate();
      instance.open = () => gdatetime.open();
      instance.close = () => gdatetime.close();
      instance.toggle = () => gdatetime.toggle();

      // Update element reference
      element.wrapper = instance.wrapper;

      // Setup event forwarding
      if (gdatetime.hiddenInput) {
        gdatetime.hiddenInput.addEventListener('change', (e) => {
          // Prevent infinite loop: don't re-dispatch if event came from element itself
          if (e.target === element) return;

          // Dispatch standard change event
          const changeEvent = new Event('change', {bubbles: true});
          element.dispatchEvent(changeEvent);

          // Emit to event system
          EventManager.emit('element:change', {
            elementId: element.id,
            value: gdatetime.getValue(),
            type: 'date'
          });
        });
      }

      // Cleanup override
      const originalCleanup = instance.cleanup;
      instance.cleanup = function() {
        if (this.gdatetime) {
          this.gdatetime.destroy();
          this.gdatetime = null;
        }
        if (originalCleanup) {
          originalCleanup.call(this);
        }
        return this;
      };

      return instance;

    } catch (error) {
      console.error('DateElementFactory: Failed to setup element:', error);
      return instance;
    }
  }
}

// Register with ElementManager
ElementManager.registerElement('date', DateElementFactory);
ElementManager.registerElement('datetime-local', DateElementFactory);

// Expose globally
window.DateElementFactory = DateElementFactory;