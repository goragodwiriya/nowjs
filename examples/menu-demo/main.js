/**
 * Menu Manager Demo
 * Demonstrates dynamic menu rendering from data
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
    initializeExamples();

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

// Menu data for Example 2
const sampleMenuData = [
  {title: 'Dashboard', url: '/', icon: 'icon-dashboard'},
  {
    title: 'Sales',
    icon: 'icon-grid',
    children: [
      {title: 'Pipeline', url: '/pipeline', icon: 'icon-chart'},
      {title: 'Deals', url: '/deals', icon: 'icon-wallet'}
    ]
  },
  {title: 'Customers', url: '/customers', icon: 'icon-users'},
  {
    title: 'Reports',
    icon: 'icon-file-text',
    children: [
      {title: 'Analytics', url: '/analytics'},
      {title: 'Export', url: '/export'}
    ]
  },
  {title: 'Settings', url: '/settings', icon: 'icon-settings'}
];

// Example 2: Render menu from JavaScript
function renderDynamicMenu() {
  const container = document.getElementById('dynamicMenu');

  if (MenuManager && MenuManager.renderFromData) {
    MenuManager.renderFromData(container, sampleMenuData);
    console.log('Menu rendered from data:', sampleMenuData);
  } else {
    console.error('MenuManager.renderFromData not available');
  }
}

// Clear dynamic menu
function clearDynamicMenu() {
  const container = document.getElementById('dynamicMenu');
  container.innerHTML = '';
  delete container.dataset.menuId;
}

// Initialize all examples
function initializeExamples() {
  // Example 2: Dynamic Menu
  document.getElementById('renderMenu')?.addEventListener('click', renderDynamicMenu);
  document.getElementById('clearMenu')?.addEventListener('click', clearDynamicMenu);

  console.log('Menu demo examples initialized');
}

// Make functions globally available
window.renderDynamicMenu = renderDynamicMenu;
window.clearDynamicMenu = clearDynamicMenu;
