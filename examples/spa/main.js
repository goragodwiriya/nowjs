/**
 * Modern SPA Example - Now.js
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Detect current directory path
    const currentPath = window.location.pathname;
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // Initialize framework
    await Now.init({
      environment: 'production',

      paths: {
        templates: `${currentDir}templates`,
      },

      // Enable Router
      router: {
        enabled: true,
        mode: 'history', // 'hash' or 'history'
        base: currentDir,
        autoDetectBase: true,
        routes: {
          '/': {
            template: 'index.html'
          },
          '/about': {
            template: 'about.html'
          },
          '/portfolio': {
            template: 'portfolio.html'
          },
          '/contact': {
            template: 'contact.html'
          }
        }
      },
    });

    // Create application instance
    const app = await Now.createApp({
      name: 'Modern SPA - Now.js Example',
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
