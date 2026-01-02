/**
 * Multi Select Example - Now.js Framework
 *
 * This example demonstrates the MultiSelectElementFactory functionality including:
 * - Custom UI with dropdown panel
 * - Multiple selection with check/uncheck icons
 * - Keyboard navigation (Arrow keys, Space, Tab, Escape)
 * - Form integration with validation
 * - Dynamic options loading from API
 * - Programmatic control via JavaScript API
 *
 * The multi-select component is automatically initialized by ElementManager
 * when it detects <select multiple> elements.
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Detect current directory path for dynamic resource loading
    const currentPath = window.location.pathname;
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // Initialize framework
    await Now.init({
      // Environment mode: 'development' or 'production'
      environment: 'production',

      // Path configuration for templates and resources
      paths: {
        templates: `${currentDir}templates`,
      },

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
    // The ElementManager will automatically handle multi-select when it detects:
    // - <select multiple> elements
    // - FormManager will enhance selects inside forms
    const app = await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
