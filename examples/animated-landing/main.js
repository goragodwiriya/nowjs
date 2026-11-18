/**
 * Animated Landing Page - JavaScript
 * Minimal JS - Most animations handled by data-animation-auto
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize Now.js framework
    await Now.init({
      environment: 'production'
    });

    console.log('✨ Animated Landing Page loaded');
    console.log('📍 All animations powered by AnimationManager with data-animation-auto');

  } catch (error) {
    console.error('Initialization failed:', error);
  }
});
