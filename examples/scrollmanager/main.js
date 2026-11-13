/**
 * One-Page Scrolling Example with ScrollManager
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
        enabled: false
      },

      // Syntax highlighter configuration for code examples
      syntaxhighlighter: {
        display: {
          lineNumbers: true,    // Show line numbers in code blocks
          copyButton: true      // Show copy button for code blocks
        }
      },

      // ScrollManager Configuration
      scroll: {
        enabled: true,

        core: {
          offset: 80,        // Offset for fixed navigation
          duration: 800,     // Smooth scroll duration
          easing: 'easeInOutCubic'
        },

        // Enable smooth scrolling for hash links
        smoothScroll: {
          enabled: true,
          selector: 'a[href^="#"]',
          excludeSelector: '.no-smooth',
          hashChangeEnabled: true,
          autoScroll: true
        },

        // Scroll features
        scroll: {
          // Progress bar
          progress: {
            enabled: true,
            color: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            height: '3px',
            zIndex: 9999
          },

          // Parallax effects
          parallax: {
            enabled: true,
            speed: 0.5
          },

          // Section highlighting
          section: {
            highlight: true,
            threshold: 0.5,
            activeClass: 'active'
          },

          // Navigation
          nav: {
            updateHash: true,
            highlightClass: 'active',
            smoothScroll: true
          }
        },

        // Waypoints
        waypoints: {
          offset: 0,
          threshold: 0.3,
          once: true,
          delay: 100
        },

        // Mobile support
        mobile: {
          enabled: true,
          touchAction: 'pan-y',
          momentumScroll: true
        },

        // Performance
        performance: {
          throttle: 16,
          debounce: 100,
          passive: true,
          observer: true
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

    // Initialize one-page features
    initializeOnePage();

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

/**
 * Initialize One-Page specific features
 */
function initializeOnePage() {
  // Wait for ScrollManager to be ready
  if (!window.ScrollManager) {
    console.warn('ScrollManager not found');
    return;
  }

  // Wait for ScrollManager to be initialized
  if (!window.ScrollManager.state.initialized) {
    console.warn('ScrollManager not initialized yet, waiting...');
    // Listen for initialization event
    ScrollManager.on('scroll:initialized', () => {
      console.log('ScrollManager initialized, setting up waypoints...');
      setupOnePageFeatures();
    });
    return;
  }

  setupOnePageFeatures();
}

/**
 * Setup one-page features
 */
function setupOnePageFeatures() {
  // Initialize mobile navigation toggle
  initMobileNav();

  // Setup waypoint animations
  setupWaypointAnimations();

  // Setup scroll tracking
  setupScrollTracking();

  // Setup back to top button
  setupBackToTop();

  // Setup event listeners
  setupScrollEvents();

  // Add smooth reveal for elements
  setupScrollReveal();
}

/**
 * Initialize mobile navigation
 */
function initMobileNav() {
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      navToggle.classList.toggle('active');
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        navToggle.classList.remove('active');
      });
    });
  }
}

/**
 * Setup waypoint animations
 */
function setupWaypointAnimations() {
  const waypoints = document.querySelectorAll('[data-scroll-waypoint]');

  waypoints.forEach((waypoint, index) => {
    const id = waypoint.dataset.scrollWaypoint || `waypoint-${index}`;
    const animation = waypoint.dataset.waypointAnimation;

    ScrollManager.addWaypoint(id, waypoint, {
      threshold: 0.3,
      once: true,
      callback: (entry) => {
        if (entry.isIntersecting) {
          waypoint.classList.add('triggered');

          // Log to events
          logEvent(`Waypoint triggered: ${animation || 'default'}`);
        }
      }
    });
  });
}

/**
 * Setup scroll reveal animations
 */
function setupScrollReveal() {
  const revealElements = document.querySelectorAll('[data-scroll-reveal]');

  revealElements.forEach((element, index) => {
    const delay = element.dataset.scrollRevealDelay || 0;

    ScrollManager.addWaypoint(element, {
      threshold: 0.2,
      once: true,
      callback: (entry) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            element.classList.add('revealed');
          }, parseInt(delay));
        }
      }
    });
  });
}

/**
 * Setup scroll position tracking
 */
function setupScrollTracking() {
  let scrollPosition = 0;
  let scrollPercent = 0;

  const updateScrollInfo = () => {
    const position = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = Math.round((position / docHeight) * 100);

    scrollPosition = position;
    scrollPercent = percent;

    // Update UI
    const posElement = document.getElementById('scroll-position');
    const percentElement = document.getElementById('scroll-percent');

    if (posElement) posElement.textContent = `${Math.round(position)}px`;
    if (percentElement) percentElement.textContent = `${percent}%`;

    // Update progress bar
    const progressBar = document.querySelector('.scroll-progress');
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
  };

  // Throttle scroll updates
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateScrollInfo();
        ticking = false;
      });
      ticking = true;
    }
  }, {passive: true});

  // Initial update
  updateScrollInfo();
}

/**
 * Setup back to top button
 */
function setupBackToTop() {
  const backToTop = document.getElementById('back-to-top');

  if (backToTop) {
    // Show/hide based on scroll position
    window.addEventListener('scroll', () => {
      if (window.pageYOffset > 300) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    }, {passive: true});

    // Scroll to top on click
    backToTop.addEventListener('click', () => {
      ScrollManager.scrollToTop();
      logEvent('Scrolled to top');
    });
  }
}

/**
 * Setup ScrollManager event listeners
 */
function setupScrollEvents() {
  // Section change events
  ScrollManager.on('section:active', ({id}) => {
    const sectionElement = document.getElementById('active-section');
    if (sectionElement) {
      sectionElement.textContent = id || 'none';
    }
    logEvent(`Section changed: ${id}`);
  });

  // Waypoint events
  ScrollManager.on('waypoint:trigger', ({id, entry}) => {
    logEvent(`Waypoint triggered: ${id}`);
  });

  // Scroll start/end events
  ScrollManager.on('scroll:start', () => {
    logEvent('Scroll started');
  });

  ScrollManager.on('scroll:end', () => {
    logEvent('Scroll ended');
  });

  // Scroll direction change
  let lastDirection = null;
  ScrollManager.on('scroll:update', ({direction}) => {
    if (direction && direction !== lastDirection) {
      logEvent(`Scroll direction: ${direction}`);
      lastDirection = direction;
    }
  });
}

/**
 * Log event to the events log
 */
function logEvent(message) {
  const eventsLog = document.getElementById('events-log');
  if (!eventsLog) return;

  const logItem = document.createElement('div');
  logItem.className = 'log-item new';

  const timestamp = new Date().toLocaleTimeString();
  logItem.textContent = `[${timestamp}] ${message}`;

  // Add to top of log
  eventsLog.insertBefore(logItem, eventsLog.firstChild);

  // Remove animation class after animation completes
  setTimeout(() => {
    logItem.classList.remove('new');
  }, 500);

  // Keep only last 10 items
  while (eventsLog.children.length > 10) {
    eventsLog.removeChild(eventsLog.lastChild);
  }

  // Auto-scroll log to top
  eventsLog.scrollTop = 0;
}

/**
 * Initialize parallax effects manually if needed
 */
function initParallaxEffects() {
  const parallaxElements = document.querySelectorAll('[data-parallax]');

  parallaxElements.forEach(element => {
    const speed = parseFloat(element.dataset.parallaxSpeed) || 0.5;

    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const elementTop = element.offsetTop;
      const elementHeight = element.offsetHeight;

      // Only apply parallax when element is in view
      if (scrolled + window.innerHeight > elementTop && scrolled < elementTop + elementHeight) {
        const yPos = -(scrolled - elementTop) * speed;
        element.style.transform = `translateY(${yPos}px)`;
      }
    }, {passive: true});
  });
}

// Export for debugging
window.OnePageApp = {
  logEvent,
  scrollToSection: (id) => {
    const element = document.getElementById(id);
    if (element && ScrollManager) {
      ScrollManager.scrollTo(element);
    }
  },
  getScrollManager: () => window.ScrollManager
};
