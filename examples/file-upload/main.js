/**
 * File Upload Example - Now.js Framework
 *
 * This example demonstrates the complete file upload functionality including:
 * - Single and multiple file uploads
 * - Live preview of images and files
 * - Drag and drop interface
 * - Sortable file list
 * - File removal capability
 * - Form integration with AJAX submission
 * - Loading existing files from API
 *
 * The file upload component is automatically initialized by the FormManager
 * when it detects file input fields with special data attributes.
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
    // The FormManager will automatically handle file uploads when it detects:
    // - <input type="file"> elements
    // - data-preview="true" for live preview
    // - data-drag-drop="true" for drag and drop
    // - data-sortable="true" for reordering files
    // - data-allow-remove-existing="true" for file removal
    const app = await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

    /**
     * File Upload Features:
     *
     * 1. Single File Upload:
     *    <input type="file" name="avatar" data-preview="true">
     *
     * 2. Multiple Files:
     *    <input type="file" name="files" multiple data-preview="true">
     *
     * 3. Drag & Drop:
     *    <input type="file" multiple data-drag-drop="true">
     *
     * 4. Sortable Files:
     *    <input type="file" multiple data-sortable="true">
     *
     * 5. Load Existing Files:
     *    <input type="file" data-attr="value:files" data-file-reference="url">
     *    API should return: { data: { files: [{ url: "...", name: "..." }] } }
     *
     * 6. File Validation:
     *    <input type="file" accept="image/*,application/pdf">
     *
     * 7. Remove Files:
     *    <input type="file" data-allow-remove-existing="true">
     */

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
