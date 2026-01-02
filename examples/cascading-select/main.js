/**
 * Cascading Select Example - Now.js Framework
 *
 * This example demonstrates cascading dropdown selects for Thai address:
 * - Province → District → Subdistrict
 * - Dynamic option loading from API
 * - Auto-clear of child selects when parent changes
 *
 * Cascading behavior is set up automatically via data attributes:
 * - data-cascade-url: API endpoint URL (on parent/root select)
 * - data-cascade-parent: Name of parent select element (on child selects)
 * - data-cascade-method: HTTP method (GET/POST)
 *
 * No JavaScript code needed - just add data-form to your form!
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Detect current directory path
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
    const app = await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
