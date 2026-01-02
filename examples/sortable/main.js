/**
 * Sortable Examples
 * Demonstrates drag and drop sorting with Now.js Sortable component
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

    // Initialize examples
    initializeSortableExamples();

  } catch (error) {
    console.error('[Sortable Examples] Application initialization failed:', error);
  }
});

function initializeSortableExamples() {
  // Debug: Check if sortable elements exist
  const sortableElements = document.querySelectorAll('[data-component="sortable"]');
  console.log('[Debug] Found sortable elements:', sortableElements.length);
  sortableElements.forEach((el, index) => {
    console.log(`[Debug] Sortable element ${index}:`, el);
    console.log(`[Debug] Has _sortableInstance:`, !!el._sortableInstance);
  });

  // Check if window.Sortable exists
  console.log('[Debug] window.Sortable:', window.Sortable);
  console.log('[Debug] window.ComponentManager:', window.ComponentManager);

  // Example 1: Basic List - Log changes
  const basicList = document.querySelector('#basic-list');
  if (basicList) {
    basicList.addEventListener('sortable:end', (e) => {
      console.log('Basic List - Moved from', e.detail.oldIndex, 'to', e.detail.newIndex);
    });
  }

  // Example 2: Drag Handle - Log changes
  const handleList = document.querySelector('#handle-list');
  if (handleList) {
    handleList.addEventListener('sortable:end', (e) => {
      console.log('Handle List - Item moved:', e.detail.item.querySelector('h3').textContent);
    });
  }

  // Example 3: Kanban Board - Log cross-container moves
  document.querySelectorAll('.kanban-column').forEach(column => {
    column.addEventListener('sortable:end', (e) => {
      const fromCategory = e.detail.from.dataset.category;
      const toCategory = e.detail.to.dataset.category;

      if (fromCategory !== toCategory) {
        const itemTitle = e.detail.item.querySelector('h4').textContent;
        console.log(`Kanban - Moved "${itemTitle}" from ${fromCategory} to ${toCategory}`);

        // Show notification
        if (window.NotificationManager) {
          NotificationManager.success(`Moved to ${toCategory}`);
        }
      }
    });
  });

  // Example 4: Priority List - Enhanced keyboard support
  const priorityList = document.querySelector('#priority-list');
  if (priorityList) {
    priorityList.addEventListener('sortable:end', (e) => {
      console.log('Priority List - New order:', e.detail.newIndex);
    });

    priorityList.addEventListener('sortable:select', (e) => {
      console.log('Priority List - Selected:', e.detail.item.querySelector('.priority-text').textContent);
    });
  }

  // Example 6: Event Logging
  const eventList = document.querySelector('#event-list');
  const eventOutput = document.querySelector('#event-output');

  if (eventList && eventOutput) {
    let eventCount = 0;

    const logEvent = (eventName, detail) => {
      eventCount++;
      const entry = document.createElement('div');
      entry.className = 'log-entry';

      const timestamp = new Date().toLocaleTimeString();
      let message = '';

      switch (eventName) {
        case 'start':
          message = `🟢 Drag started - Item ${detail.startIndex + 1}`;
          break;
        case 'end':
          message = `🔵 Drag ended - Moved from ${detail.oldIndex + 1} to ${detail.newIndex + 1}`;
          break;
        case 'change':
          message = `🟡 Position changed`;
          break;
        default:
          message = `Event: ${eventName}`;
      }

      entry.innerHTML = `<span class="log-time">${timestamp}</span> ${message}`;

      // Add to top of log
      if (eventOutput.firstChild && eventOutput.firstChild.classList?.contains('log-entry')) {
        eventOutput.insertBefore(entry, eventOutput.firstChild);
      } else {
        eventOutput.innerHTML = '';
        eventOutput.appendChild(entry);
      }

      // Keep only last 10 entries
      while (eventOutput.children.length > 10) {
        eventOutput.removeChild(eventOutput.lastChild);
      }
    };

    eventList.addEventListener('sortable:start', (e) => {
      logEvent('start', e.detail);
    });

    eventList.addEventListener('sortable:end', (e) => {
      logEvent('end', e.detail);
    });

    eventList.addEventListener('sortable:change', (e) => {
      logEvent('change', e.detail);
    });

    // Clear event log function
    window.clearEventLog = function() {
      eventOutput.innerHTML = '<div class="log-entry">Drag items to see events...</div>';
    };
  }

  // File upload example - Log file reordering
  const fileUpload = document.querySelector('#file-upload');
  if (fileUpload) {
    // Listen for sortable events on the preview container
    setTimeout(() => {
      const previewContainer = document.querySelector('.file-preview');
      if (previewContainer) {
        previewContainer.addEventListener('sortable:end', (e) => {
          console.log('Files reordered');

          // Get current order
          const items = Array.from(previewContainer.querySelectorAll('.preview-item'));
          const order = items.map((item, index) => {
            const fileName = item.querySelector('.file-info')?.textContent || `File ${index + 1}`;
            return `${index + 1}. ${fileName}`;
          });

          console.log('New file order:', order);
        });
      }
    }, 1000);
  }

  // General: Log all sortable events for debugging
  if (window.location.search.includes('debug=true')) {
    document.addEventListener('sortable:start', (e) => {
      console.log('Global sortable:start', e.detail);
    });

    document.addEventListener('sortable:end', (e) => {
      console.log('Global sortable:end', e.detail);
    });

    document.addEventListener('sortable:change', (e) => {
      console.log('Global sortable:change', e.detail);
    });

    document.addEventListener('sortable:api-success', (e) => {
      console.log('Global sortable:api-success', e.detail);
    });

    document.addEventListener('sortable:api-error', (e) => {
      console.error('Global sortable:api-error', e.detail);
    });
  }
}
