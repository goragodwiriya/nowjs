/**
 * NotificationManager Examples
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

      // set default notification position
      notification: {
        position: 'top-left'
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

// Example 2: Loading Notification
async function simulateLoading() {
  // Show loading
  const loadingId = NotificationManager.loading('Processing...');

  // Wait 3 seconds
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Dismiss loading
  NotificationManager.dismiss(loadingId);

  // Show result
  NotificationManager.success('Processing complete!');
}

// Example 4: Smart Replacement
function showMultipleErrors() {
  NotificationManager.error('Error 1');

  setTimeout(() => {
    NotificationManager.error('Error 2 (replaces first message)');
  }, 500);

  setTimeout(() => {
    NotificationManager.error('Error 3 (replaces second message)');
  }, 1000);
}

function showMultipleSuccess() {
  NotificationManager.success('Success 1');

  setTimeout(() => {
    NotificationManager.success('Success 2 (replaces first message)');
  }, 500);

  setTimeout(() => {
    NotificationManager.success('Success 3 (replaces second message)');
  }, 1000);
}

// Example 5: Form Submission
document.addEventListener('DOMContentLoaded', () => {
  const demoForm = document.getElementById('demoForm');

  if (demoForm) {
    demoForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Show loading
      const loadingId = NotificationManager.loading('Saving data...');

      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Dismiss loading
        NotificationManager.dismiss(loadingId);

        // Show result
        const formData = new FormData(e.target);
        const result = formData.get('result');

        if (result === 'success') {
          NotificationManager.success('Data saved successfully!');
          e.target.reset();
        } else {
          NotificationManager.error('Unable to save data');
        }
      } catch (error) {
        NotificationManager.dismiss(loadingId);
        NotificationManager.error('Error: ' + error.message);
      }
    });
  }
});

// Example 6: File Upload Simulation
async function simulateUpload() {
  const fileInput = document.getElementById('fileInput');
  const files = fileInput.files;

  if (files.length === 0) {
    NotificationManager.warning('Please select files first');
    return;
  }

  const loadingId = NotificationManager.loading(
    `Uploading ${files.length} file(s)...`,
    {progressBar: true}
  );

  try {
    // Simulate upload
    await new Promise(resolve => setTimeout(resolve, 3000));

    NotificationManager.dismiss(loadingId);
    NotificationManager.success(
      `${files.length} file(s) uploaded successfully!`,
      {duration: 5000}
    );

    // Clear file input
    fileInput.value = '';
  } catch (error) {
    NotificationManager.dismiss(loadingId);
    NotificationManager.error('Upload failed: ' + error.message);
  }
}

// Example 7: Position Control
async function showAtPosition(position) {
  // Change position
  NotificationManager.setPosition(position);

  // Show notification
  NotificationManager.info(`Displayed at: ${position}`, {
    duration: 5000
  });

  // Reset to top-left after 6 seconds
  setTimeout(() => {
    NotificationManager.setPosition('top-left');
  }, 6000);
}

// Example 8: Clear All
function showMultiple() {
  NotificationManager.info('Message 1');

  setTimeout(() => {
    NotificationManager.info('Message 2');
  }, 200);

  setTimeout(() => {
    NotificationManager.info('Message 3');
  }, 400);

  setTimeout(() => {
    NotificationManager.info('Message 4');
  }, 600);

  setTimeout(() => {
    NotificationManager.info('Message 5');
  }, 800);
}

function clearAll() {
  NotificationManager.clear();
  NotificationManager.success('All notifications cleared', {
    duration: 2000
  });
}

// Initialize
console.log('NotificationManager Examples loaded');
console.log('NotificationManager ready:', !!window.NotificationManager);
