/**
 * Main JavaScript file for School Website
 * Handles ScrollManager initialization, reactive components, and UI interactions
 */

document.addEventListener('DOMContentLoaded', async function() {
  await Now.init({
    environment: 'production',

    paths: {
      framework: '/Now',
      application: '/',
      components: '',
      plugins: '/plugins',
      templates: '/',
      translations: '/translations'
    },

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

  // สร้าง instance ของแอพพลิเคชั่น
  const app = await Now.createApp({
    name: 'Now.js Demo',
    version: '1.0.0'
  });
});
