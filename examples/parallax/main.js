/**
 * เริ่มต้นการทำงานเมื่อโหลด DOM เสร็จสมบูรณ์
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // เริ่มต้น Framework โดยกำหนดค่าการทำงานต่างๆ
    await Now.init({
      environment: 'production',
      debug: false, // โหมด debug
      scroll: {
        enabled: true, // เปิดใช้งาน ScrollManager
        core: {
          offset: 60,      // ระยะห่างจากขอบบน
          duration: 800,   // ระยะเวลาในการเลื่อน (ms)
          easing: 'easeInOutCubic' // รูปแบบการเคลื่อนที่
        },
        // ตั้งค่าการเลื่อนหน้าจอ
        scroll: {
          // การแสดงผลแบบ reveal
          reveal: {
            enabled: true,
            threshold: 0.1,    // จุดที่เริ่มแสดง (0-1)
            rootMargin: '50px' // ระยะขอบเผื่อ
          },
          // เอฟเฟกต์ Parallax
          parallax: {
            enabled: true
          },
          // ไฮไลท์เมนูตามส่วนที่กำลังดู
          section: {
            highlight: true
          }
        }
      }
    });

    // สร้าง instance ของแอพพลิเคชั่น
    const app = await Now.createApp({
      name: 'Now.js Demo',
      version: '1.0.0'
    });

    // จัดการการทำงานต่างๆ
    const handlers = {
      // จัดการการคลิกเมนูนำทาง
      initNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
              ScrollManager.scrollTo(target);
            }
          });
        });
      },

      // จัดการ Scroll Events ทั้งหมด
      initScrollEvents() {
        // เมนูแบบ Sticky
        ScrollManager.on('scroll:progress', position => {
          const nav = document.querySelector('.nav-wrapper');
          nav?.classList.toggle('scrolled', position.y > 50);
        });

        // แถบแสดงความคืบหน้าการเลื่อน
        ScrollManager.on('scroll:progress', position => {
          const progressBar = document.querySelector('.progress-bar');
          if (progressBar) {
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = (position.y / totalHeight) * 100;
            progressBar.style.width = `${progress}%`;
          }
        });

        // ปุ่มเลื่อนกลับด้านบน
        const backToTop = document.querySelector('.back-to-top');
        if (backToTop) {
          ScrollManager.on('scroll:progress', position => {
            backToTop.classList.toggle('visible', position.y > 600);
          });

          backToTop.addEventListener('click', () => {
            ScrollManager.scrollToTop({duration: 800});
          });
        }

        // เอฟเฟกต์ Parallax
        const parallaxElements = document.querySelectorAll('[data-parallax]');
        if (parallaxElements.length) {
          ScrollManager.on('scroll:progress', position => {
            parallaxElements.forEach(el => {
              const speed = Number(el.dataset.parallaxSpeed) || 0.5;
              const yPos = -(position.y * speed);
              el.style.transform = `translate3d(0, ${yPos}px, 0)`;
            });
          });
        }
      },

      // จัดการ Waypoints สำหรับ Reveal Effects
      initWaypoints() {
        document.querySelectorAll('[data-scroll-reveal]').forEach((el, index) => {
          if (el) {
            ScrollManager.addWaypoint(`reveal-${index}`, el, {
              offset: 100,
              once: true,
              callback: (entry) => {
                if (entry?.isIntersecting) {
                  el.classList.add('revealed');
                }
              }
            });
          }
        });
      },

      // จัดการการ Highlight เมนูตามส่วนที่กำลังดู
      initSectionHighlight() {
        ScrollManager.on('section:active', ({id}) => {
          if (!id) return;
          document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
              link.classList.toggle('active', href === `#${id}`);
            }
          });
        });
      },

      // จัดการ Touch Events บนมือถือ
      initTouchEvents() {
        let touchStartY = null;

        // เริ่มต้น Touch
        document.addEventListener('touchstart', e => {
          touchStartY = e.touches[0].clientY;
        }, {passive: true});

        // ระหว่าง Touch
        document.addEventListener('touchmove', e => {
          if (!touchStartY) return;

          const touchY = e.touches[0].clientY;
          const diff = touchStartY - touchY;

          // ป้องกันการเลื่อนเกินหน้าจอบน iOS
          const isOverscrolling =
            (diff > 0 && window.scrollY >= document.documentElement.scrollHeight - window.innerHeight) ||
            (diff < 0 && window.scrollY <= 0);

          if (isOverscrolling) {
            e.preventDefault();
          }
        }, {passive: false});

        // สิ้นสุด Touch
        document.addEventListener('touchend', () => {
          touchStartY = null;
        }, {passive: true});
      },

      // จัดการ Animation ต่างๆ
      initAnimations() {
        // Animation ขณะเลื่อน
        ScrollManager.on('scroll:start', ({element}) => {
          element?.classList?.add('scrolling');
        });

        ScrollManager.on('scroll:complete', ({element}) => {
          element?.classList?.remove('scrolling');
        });

        // Animation เมื่อเลื่อนมาถึง
        const observer = new IntersectionObserver(
          entries => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                entry.target.classList.add('animated');
              }
            });
          },
          {threshold: 0.1}
        );

        document.querySelectorAll('.animate-on-scroll').forEach(el => {
          observer.observe(el);
        });
      }
    };

    // เริ่มต้นการทำงานทั้งหมด
    Object.values(handlers).forEach(handler => handler());

    // ถ้ามี hash ใน URL ให้เลื่อนไปยังส่วนนั้น
    if (window.location.hash) {
      const target = document.querySelector(window.location.hash);
      if (target) {
        ScrollManager.scrollTo(target, {duration: 0});
      }
    }

    // จัดการ Resize
    const handleResize = () => {
      ScrollManager.handleScrollProgress();
    };

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 250);
    });

  } catch (error) {
    console.error('เริ่มต้นแอพพลิเคชั่นไม่สำเร็จ:', error);
  }
});