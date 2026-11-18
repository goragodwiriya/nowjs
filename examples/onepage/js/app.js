/**
 * TechVision - Modern Single Page Website
 * Using Now.js Framework in Hash Mode
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Detect current directory path for translations
    const currentPath = window.location.pathname;
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // Initialize Now.js Framework
    await Now.init({
      environment: 'production',

      // Path configuration
      paths: {
        translations: `${currentDir}translations`
      },

      // Enable i18n
      i18n: {
        enabled: true,
        availableLocales: ['th', 'en']
      },

      // Scroll Manager
      scroll: {
        enabled: true,
        core: {
          offset: 80,
          duration: 800,
          easing: 'easeInOutCubic'
        },
        scroll: {
          reveal: {
            enabled: true,
            threshold: 0.1,
            rootMargin: '50px'
          },
          parallax: {
            enabled: true
          },
          section: {
            highlight: true
          }
        }
      }
    }).then(() => {
      // Load application components
      const scripts = [
        '../../js/components/Slideshow.js',
        '../../js/components/CounterComponent.js'
      ];

      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        document.head.appendChild(script);
      });
    });

    // Create application instance
    const app = await Now.createApp({
      name: 'TechVision',
      version: '1.0.0'
    });

    // Language Switcher
    const i18n = Now.getManager('i18n');
    const langSwitch = document.getElementById('lang-switch');
    if (langSwitch) {
      langSwitch.addEventListener('click', async () => {
        const currentLang = i18n.getCurrentLocale();
        const newLang = currentLang === 'th' ? 'en' : 'th';
        await i18n.setLocale(newLang, true);
        langSwitch.querySelector('.lang-text').textContent = newLang.toUpperCase();
      });
    }
    const currentLang = i18n.getCurrentLocale();
    langSwitch.querySelector('.lang-text').textContent = currentLang.toUpperCase();

    // Sticky Header
    const header = document.getElementById('header');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;

      if (currentScroll > 100) {
        header.classList.add('sticky');
      } else {
        header.classList.remove('sticky');
      }

      // Hide header on scroll down, show on scroll up
      if (currentScroll > lastScroll && currentScroll > 200) {
        header.classList.add('hidden');
      } else {
        header.classList.remove('hidden');
      }

      lastScroll = currentScroll;
    });

    // Scroll to Top Button
    const scrollTopBtn = document.getElementById('scroll-top');

    if (scrollTopBtn) {
      window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
          scrollTopBtn.classList.add('visible');
        } else {
          scrollTopBtn.classList.remove('visible');
        }
      });

      scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      });
    }

    // Active Navigation Link
    const sections = document.querySelectorAll('section[id]');
    const navItems = document.querySelectorAll('.nav-links a');

    window.addEventListener('scroll', () => {
      let current = '';

      sections.forEach(section => {
        const sectionTop = section.offsetTop;

        if (window.pageYOffset >= sectionTop - 100) {
          current = section.getAttribute('id');
        }
      });

      navItems.forEach(item => {
        item.parentElement.classList.remove('active');
        if (item.getAttribute('href') === `#${current}`) {
          item.parentElement.classList.add('active');
        }
      });
    });

    // Parallax Effect for Hero
    const heroSlides = document.querySelectorAll('.hero-slide');
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      heroSlides.forEach(slide => {
        const speed = 0.5;
        slide.style.transform = `translateY(${scrolled * speed}px)`;
      });
    });

    // Add animation to elements on scroll
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, observerOptions);

    document.querySelectorAll('[data-scroll-reveal]').forEach(el => {
      observer.observe(el);
    });
    console.log('TechVision website initialized successfully!');
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
