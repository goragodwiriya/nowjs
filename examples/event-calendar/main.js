/**
 * EventCalendar Example - Main JavaScript
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize framework
    await Now.init({
      environment: 'production',

      i18n: {
        enabled: false,
        availableLocales: ['en', 'th']
      },

      syntaxhighlighter: {
        display: {
          lineNumbers: true,
          copyButton: true
        }
      }
    }).then(() => {
      // Load application components
      const scripts = [
        '../header.js',
        '../../js/components/footer.js'
      ];

      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        document.head.appendChild(script);
      });
    });

    // Initialize EventCalendar
    initEventCalendar();
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

function initEventCalendar() {
  // Sample events data
  const sampleEvents = generateSampleEvents();

  // Initialize basic calendar with inline events
  const basicCalendar = EventCalendar.create('#basic-calendar');
  EventCalendar.setEvents(basicCalendar, sampleEvents);

  // Initialize controlled calendar
  const controlledCalendar = EventCalendar.create('#controlled-calendar', {
    defaultView: 'month',
    locale: 'th',
    showViewSwitcher: false, // We'll control this externally
    onDateClick: (date, instance) => {
      logEvent('Date Clicked', formatDate(date));
    },
    onEventClick: (event, instance) => {
      logEvent('Event Clicked', event.title);
      showEventDetail(event);
    }
  });

  EventCalendar.setEvents(controlledCalendar, sampleEvents);

  // Control buttons
  document.getElementById('btn-add-event').addEventListener('click', () => {
    const newEvent = {
      id: 'new-' + Date.now(),
      title: 'New Event ' + new Date().toLocaleTimeString(),
      start: new Date(),
      end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
      color: '#E91E63'
    };

    EventCalendar.addEvent(controlledCalendar, newEvent);
    logEvent('Event Added', newEvent.title);
  });

  document.getElementById('btn-today').addEventListener('click', () => {
    EventCalendar.goToToday(controlledCalendar);
    logEvent('Navigation', 'Went to today');
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    EventCalendar.setEvents(controlledCalendar, generateSampleEvents());
    logEvent('Refresh', 'Events refreshed');
  });

  document.getElementById('view-select').addEventListener('change', (e) => {
    EventCalendar.changeView(controlledCalendar, e.target.value);
    logEvent('View Changed', e.target.value);
  });

  document.getElementById('locale-select').addEventListener('change', (e) => {
    // Need to recreate with new locale
    const events = EventCalendar.getEvents(controlledCalendar);
    EventCalendar.destroy(controlledCalendar);

    const newInstance = EventCalendar.create('#controlled-calendar', {
      defaultView: controlledCalendar?.currentView || 'month',
      locale: e.target.value,
      showViewSwitcher: false
    });

    EventCalendar.setEvents(newInstance, events);
    logEvent('Locale Changed', e.target.value);
  });

  // Listen for calendar events
  document.addEventListener('eventcalendar:dateClick', (e) => {
    logEvent('eventcalendar:dateClick', formatDate(e.detail.date));
  });

  document.addEventListener('eventcalendar:eventClick', (e) => {
    logEvent('eventcalendar:eventClick', e.detail.event.title);
  });

  document.addEventListener('eventcalendar:navigate', (e) => {
    logEvent('eventcalendar:navigate', formatDate(e.detail.date));
  });

  document.addEventListener('eventcalendar:viewChange', (e) => {
    logEvent('eventcalendar:viewChange', e.detail.view);
  });
}

/**
 * Generate sample events for demo
 */
function generateSampleEvents() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  return [
    // Multi-day spanning events
    {
      id: 'evt-1',
      title: 'Holiday Trip 🏖️',
      start: new Date(year, month, 15),
      end: new Date(year, month, 22),
      color: '#4CAF50',
      allDay: true,
      description: 'Family vacation to the beach'
    },
    {
      id: 'evt-2',
      title: 'Project Sprint 🚀',
      start: new Date(year, month, 5),
      end: new Date(year, month, 12),
      color: '#2196F3',
      allDay: true
    },
    {
      id: 'evt-3',
      title: 'Conference Week 📊',
      start: new Date(year, month, 8),
      end: new Date(year, month, 10),
      color: '#9C27B0',
      allDay: true
    },
    // Spanning across month boundary
    {
      id: 'evt-4',
      title: 'Q4 Planning 📋',
      start: new Date(year, month, 28),
      end: new Date(year, month + 1, 3),
      color: '#FF5722',
      allDay: true
    },
    // Single day events
    {
      id: 'evt-5',
      title: 'Team Meeting',
      start: new Date(year, month, today.getDate(), 9, 0),
      end: new Date(year, month, today.getDate(), 10, 30),
      color: '#00BCD4',
      allDay: false
    },
    {
      id: 'evt-6',
      title: 'Lunch with Client',
      start: new Date(year, month, today.getDate(), 12, 0),
      end: new Date(year, month, today.getDate(), 13, 30),
      color: '#FFC107',
      allDay: false
    },
    {
      id: 'evt-7',
      title: 'Code Review',
      start: new Date(year, month, today.getDate() + 1, 14, 0),
      end: new Date(year, month, today.getDate() + 1, 15, 0),
      color: '#673AB7',
      allDay: false
    },
    // Multiple events on same day
    {
      id: 'evt-8',
      title: 'Morning Standup',
      start: new Date(year, month, today.getDate() + 2),
      end: new Date(year, month, today.getDate() + 2),
      color: '#795548',
      allDay: true
    },
    {
      id: 'evt-9',
      title: 'Design Review',
      start: new Date(year, month, today.getDate() + 2),
      end: new Date(year, month, today.getDate() + 2),
      color: '#607D8B',
      allDay: true
    },
    {
      id: 'evt-10',
      title: 'Sprint Planning',
      start: new Date(year, month, today.getDate() + 2),
      end: new Date(year, month, today.getDate() + 2),
      color: '#E91E63',
      allDay: true
    },
    {
      id: 'evt-11',
      title: 'Architecture Meeting',
      start: new Date(year, month, today.getDate() + 2),
      end: new Date(year, month, today.getDate() + 2),
      color: '#3F51B5',
      allDay: true
    },
    // Long spanning event
    {
      id: 'evt-12',
      title: 'Annual Leave Request Period',
      start: new Date(year, month, 1),
      end: new Date(year, month, 31),
      color: '#009688',
      allDay: true
    }
  ];
}

/**
 * Format date for display
 */
function formatDate(date) {
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
}

/**
 * Log event to the event log panel
 */
function logEvent(type, message) {
  const log = document.getElementById('event-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-type">${type}</span>
    <span class="log-message">${message}</span>
  `;

  log.insertBefore(entry, log.firstChild);

  // Keep only last 20 entries
  while (log.children.length > 20) {
    log.removeChild(log.lastChild);
  }
}

/**
 * Show event detail
 */
function showEventDetail(event) {
  if (window.Modal) {
    const modal = new Modal({
      title: event.title,
      content: `
        <div class="event-detail">
          <div class="detail-row">
            <strong>Start:</strong>
            <span>${formatDate(event.start)}</span>
          </div>
          <div class="detail-row">
            <strong>End:</strong>
            <span>${formatDate(event.end)}</span>
          </div>
          ${event.description ? `
            <div class="detail-row">
              <strong>Description:</strong>
              <span>${event.description}</span>
            </div>
          ` : ''}
          <div class="detail-row">
            <strong>Color:</strong>
            <span class="color-badge" style="background: ${event.color}"></span>
          </div>
        </div>
      `,
      size: 'small'
    });
    modal.show();
  } else {
    alert(`${event.title}\n\nStart: ${formatDate(event.start)}\nEnd: ${formatDate(event.end)}`);
  }
}
