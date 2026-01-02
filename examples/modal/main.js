/**
 * Modal Example Main Script
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

    // Initialize App
    await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

    // --- Example 1: Dynamic Modals ---

    // Basic Modal
    document.getElementById('btn-basic-modal')?.addEventListener('click', () => {
      const modal = new Modal({
        title: 'Basic Modal',
        content: '<p>This modal was created dynamically using JavaScript.</p>',
        footer: true,
        closeButton: true
      });
      modal.show();
    });

    // Confirmation Modal
    document.getElementById('btn-confirm-modal')?.addEventListener('click', () => {
      const modal = new Modal({
        title: 'Confirm Action',
        content: '<p>Are you sure you want to proceed? This action cannot be undone.</p>',
        backdrop: 'static', // Click backdrop won't close
        width: '400px'
      });

      // Add custom footer buttons
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      footer.innerHTML = `
            <button class="btn text modal-close">Cancel</button>
            <button class="btn btn-danger" id="confirm-delete">Yes, Delete</button>
          `;
      modal.dialog.appendChild(footer);

      modal.show();

      // Handle confirm click
      footer.querySelector('#confirm-delete').addEventListener('click', () => {
        alert('Action confirmed!');
        modal.hide();
      });
    });

    // Custom Content Modal
    document.getElementById('btn-custom-modal')?.addEventListener('click', () => {
      const modal = new Modal({
        title: 'Custom Content',
        width: '600px',
        content: `
              <div class="text-center">
                <div class="icon-circle bg-success mb-3">
                  <i class="icon-check"></i>
                </div>
                <h3>Success!</h3>
                <p>Your operation was completed successfully.</p>
                <div class="example-box text-left">
                  <code>Transaction ID: #123456789</code>
                </div>
              </div>
            `
      });
      modal.show();
    });
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
