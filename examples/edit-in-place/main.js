/**
 * EditInPlaceManager Example - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize framework
    await Now.init({
      // Environment mode: 'development' or 'production'
      environment: 'production',

      // Internationalization settings
      i18n: {
        enabled: true,
        availableLocales: ['en', 'th']
      },

      // Dark/Light mode
      theme: {
        enabled: true
      },

      // Syntax highlighter configuration for code examples
      syntaxhighlighter: {
        display: {
          lineNumbers: true,    // Show line numbers in code blocks
          copyButton: true      // Show copy button for code blocks
        }
      }
    }).then(() => {
      // Load application components after framework initialization
      const scripts = [
        '../header.js',                                      // Navigation header
        '../../js/components/footer.js',                    // Footer component
        '../../js/components/SyntaxHighlighterComponent.js' // Code syntax highlighting
      ];

      // Dynamically load all component scripts
      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        document.head.appendChild(script);
      });
    });

    // Create application instance
    const app = await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

    // Listen to edit events (after initialization)
    setupEditEventListeners();
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

// Setup edit event listeners
function setupEditEventListeners() {
  if (!window.EventManager) {
    console.warn('EventManager not available');
    return;
  }

  EventManager.on('edit:start', (data) => {
    const eventData = data.data || data;
    if (eventData?.element) {
      console.log('Edit started:', eventData.element.textContent);
    }
  });

  EventManager.on('edit:save', (data) => {
    // data is the event object, actual data is in data.data
    const eventData = data.data || data;

    if (!eventData?.element) {
      console.warn('No element in event data');
      return;
    }

    console.log('Edit saved:', {
      value: eventData.value,
      previousValue: eventData.previousValue,
      savedViaAjax: eventData.savedViaAjax
    });    // Show notification for AJAX saves
    if (eventData.savedViaAjax && window.NotificationManager) {
      NotificationManager.success(`Saved: ${eventData.value}`);
    }

    // Update status colors based on value
    const element = eventData.element;
    const field = element.dataset?.field;

    if (field === 'status') {
      element.classList.remove('status-active', 'status-inactive');
      if (eventData.value === 'Active') {
        element.classList.add('status-active');
      } else if (eventData.value === 'Inactive') {
        element.classList.add('status-inactive');
      }
    }
  });

  EventManager.on('edit:cancel', (data) => {
    console.log('Edit cancelled');
  });
}

// Global callback function for demo
function handleSave(newValue, instance) {
  console.log('Saved value:', newValue);
  console.log('Instance:', instance);

  // Show success message
  const resultElement = document.getElementById('callback-result');
  if (resultElement) {
    resultElement.style.display = 'block';
    resultElement.innerHTML = `<strong>Saved!</strong> New value: "${newValue}"`;

    // Hide after 3 seconds
    setTimeout(() => {
      resultElement.style.display = 'none';
    }, 3000);
  }

  // Return true to confirm save
  // Return false to cancel save
  // Return a modified value to change what gets saved
  return true;
}
