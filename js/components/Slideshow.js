/**
 * Slideshow - คอมโพเนนต์สำหรับสร้างสไลด์โชว์แบบปรับแต่งได้
 *
 * รองรับการตั้งค่าผ่าน data-* attributes:
 * - data-effect: ชนิดของเอฟเฟกต์ (fade, slide, zoom, flip, blur)
 * - data-duration: ระยะเวลาแสดงแต่ละสไลด์ (ms)
 * - data-speed: ความเร็วในการเปลี่ยนสไลด์ (ms)
 * - data-autoplay: เริ่มเล่นอัตโนมัติ (true/false)
 * - data-loop: เล่นวนซ้ำ (true/false)
 * - data-controls: แสดงปุ่มควบคุม (true/false)
 * - data-indicators: แสดงจุดบอกสถานะ (true/false)
 * - data-pause-on-hover: หยุดเมื่อเมาส์ชี้ (true/false)
 * - data-fullscreen: รองรับโหมดเต็มหน้าจอ (true/false)
 */
const Slideshow = {
  config: {
    effect: 'fade',          // ชนิดของเอฟเฟกต์ (fade, slide, zoom, flip, blur)
    duration: 5000,          // ระยะเวลาแสดงแต่ละสไลด์ (ms)
    speed: 500,              // ความเร็วในการเปลี่ยนสไลด์ (ms)
    autoplay: true,          // เริ่มเล่นอัตโนมัติ
    loop: true,              // เล่นวนซ้ำ
    controls: true,          // แสดงปุ่มควบคุม
    indicators: true,        // แสดงจุดบอกสถานะ
    pauseOnHover: true,      // หยุดเมื่อเมาส์ชี้
    keyboard: true,          // รองรับการควบคุมด้วยคีย์บอร์ด
    touch: true,             // รองรับการควบคุมด้วยการสัมผัส
    fullscreen: false,       // รองรับโหมดเต็มหน้าจอ
    adaptiveHeight: false,   // ปรับความสูงตามสไลด์
    captionPosition: 'bottom', // ตำแหน่งคำอธิบาย
    lazyLoad: true,          // โหลดรูปเมื่อจำเป็น
    preloadImages: 1,        // จำนวนรูปที่โหลดล่วงหน้า
    a11y: true,              // รองรับการใช้งานเพื่อการเข้าถึง
    debug: false             // โหมดดีบัก
  },

  state: {
    instances: new Map(),
    initialized: false
  },

  // ลงทะเบียน Effects ต่างๆ
  effects: {
    // Effect แบบจางเข้าจางออก
    fade: {
      apply: (instance, currentIndex, nextIndex) => {
        const slides = instance.slides;
        const next = slides[nextIndex];

        // ตั้งค่า transition
        slides.forEach(slide => {
          slide.style.transition = `opacity ${instance.options.speed}ms ease`;
        });

        // ซ่อนทุกสไลด์
        slides.forEach(slide => {
          slide.style.opacity = 0;
          slide.setAttribute('aria-hidden', 'true');
        });

        // แสดงสไลด์ถัดไป
        next.style.opacity = 1;
        next.setAttribute('aria-hidden', 'false');
      }
    },

    // Effect แบบเลื่อน
    slide: {
      apply: (instance, currentIndex, nextIndex) => {
        const slides = instance.slides;
        const current = slides[currentIndex];
        const next = slides[nextIndex];
        const direction = nextIndex > currentIndex ? 1 : -1;
        const offset = direction * 100;

        // ตั้งค่า transition
        slides.forEach(slide => {
          slide.style.transition = `transform ${instance.options.speed}ms ease, opacity 0ms`;
        });

        // จัดตำแหน่งสไลด์ถัดไป
        next.style.transform = `translateX(${offset}%)`;
        next.style.opacity = 1;
        next.setAttribute('aria-hidden', 'false');

        // เลื่อนสไลด์
        setTimeout(() => {
          current.style.transform = `translateX(${-offset}%)`;
          next.style.transform = 'translateX(0)';

          current.setAttribute('aria-hidden', 'true');

          // รีเซ็ตสถานะหลังจากเสร็จสิ้น animation
          setTimeout(() => {
            slides.forEach(slide => {
              if (slide !== next) {
                slide.style.opacity = 0;
                slide.style.transform = '';
              }
            });
          }, instance.options.speed);
        }, 20);
      }
    },

    // Effect แบบซูม
    zoom: {
      apply: (instance, currentIndex, nextIndex) => {
        const slides = instance.slides;
        const current = slides[currentIndex];
        const next = slides[nextIndex];

        // ตั้งค่า transition
        slides.forEach(slide => {
          slide.style.transition = `opacity ${instance.options.speed}ms ease, transform ${instance.options.speed}ms ease`;
        });

        // เตรียมสไลด์ถัดไป
        next.style.opacity = 0;
        next.style.transform = 'scale(1.2)';
        next.setAttribute('aria-hidden', 'false');

        // แสดงสไลด์ถัดไปด้วยการซูม
        setTimeout(() => {
          current.style.opacity = 0;
          current.style.transform = 'scale(0.8)';
          current.setAttribute('aria-hidden', 'true');

          next.style.opacity = 1;
          next.style.transform = 'scale(1)';

          // รีเซ็ตสถานะหลังจากเสร็จสิ้น animation
          setTimeout(() => {
            slides.forEach(slide => {
              if (slide !== next) {
                slide.style.opacity = 0;
                slide.style.transform = '';
              }
            });
          }, instance.options.speed);
        }, 20);
      }
    },

    // Effect แบบพลิก
    flip: {
      apply: (instance, currentIndex, nextIndex) => {
        const slides = instance.slides;
        const current = slides[currentIndex];
        const next = slides[nextIndex];

        // เตรียมพาเรนต์สำหรับ 3D transform
        if (instance.wrapper) {
          instance.wrapper.style.perspective = '1000px';
        }

        // ตั้งค่า transition
        slides.forEach(slide => {
          slide.style.transition = `opacity 0ms, transform ${instance.options.speed}ms ease`;
          slide.style.backfaceVisibility = 'hidden';
        });

        // เตรียมสไลด์ถัดไป
        next.style.opacity = 0;
        next.style.transform = 'rotateY(-90deg)';
        next.setAttribute('aria-hidden', 'false');

        // พลิกสไลด์
        setTimeout(() => {
          current.style.transform = 'rotateY(90deg)';
          current.setAttribute('aria-hidden', 'true');

          // รอครึ่งทางแล้วแสดงสไลด์ถัดไป
          setTimeout(() => {
            next.style.opacity = 1;
            next.style.transform = 'rotateY(0deg)';

            // รีเซ็ตสถานะหลังจากเสร็จสิ้น animation
            setTimeout(() => {
              slides.forEach(slide => {
                if (slide !== next) {
                  slide.style.opacity = 0;
                  slide.style.transform = '';
                }
              });
            }, instance.options.speed / 2);
          }, instance.options.speed / 2);
        }, 20);
      }
    },

    // Effect แบบเบลอ
    blur: {
      apply: (instance, currentIndex, nextIndex) => {
        const slides = instance.slides;
        const current = slides[currentIndex];
        const next = slides[nextIndex];

        // ตั้งค่า transition
        slides.forEach(slide => {
          slide.style.transition = `opacity ${instance.options.speed}ms ease, filter ${instance.options.speed}ms ease`;
        });

        // เตรียมสไลด์ถัดไป
        next.style.opacity = 0;
        next.style.filter = 'blur(0px)';
        next.setAttribute('aria-hidden', 'false');

        // เปลี่ยนสไลด์พร้อมเอฟเฟกต์เบลอ
        setTimeout(() => {
          current.style.opacity = 0;
          current.style.filter = 'blur(20px)';
          current.setAttribute('aria-hidden', 'true');

          next.style.opacity = 1;

          // รีเซ็ตสถานะหลังจากเสร็จสิ้น animation
          setTimeout(() => {
            slides.forEach(slide => {
              if (slide !== next) {
                slide.style.opacity = 0;
                slide.style.filter = '';
              }
            });
          }, instance.options.speed);
        }, 20);
      }
    }
  },

  /**
   * สร้าง instance ใหม่ของ Slideshow
   */
  create(element, options = {}) {
    // ถ้าเป็น string ให้ค้นหา element
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }

    if (!element) {
      if (this.config.debug) {
        console.error('[Slideshow] Element not found');
      }
      return null;
    }

    // ตรวจสอบว่ามี instance อยู่แล้วหรือไม่
    const existingInstance = this.getInstance(element);
    if (existingInstance) {
      return existingInstance;
    }

    // สร้าง instance ใหม่
    const instance = {
      id: 'slideshow_' + Math.random().toString(36).substring(2, 11),
      element,
      options: {...this.config, ...this.extractOptionsFromElement(element), ...options},
      slides: [],
      currentIndex: 0,
      isPlaying: false,
      isPaused: false,
      touchStartX: 0,
      touchStartY: 0,
      isFullscreen: false,
      timer: null,
      wrapper: null,
      controls: {
        prev: null,
        next: null,
        indicators: [],
        fullscreen: null
      }
    };

    // เริ่มต้นทำงาน
    this.setup(instance);

    // เก็บ instance
    this.state.instances.set(instance.id, instance);
    element.dataset.slideshowId = instance.id;

    return instance;
  },

  /**
   * ตั้งค่า instance
   */
  setup(instance) {
    try {
      // หาสไลด์
      this.findSlides(instance);
      if (instance.slides.length === 0) {
        if (instance.options.debug) {
          console.warn('[Slideshow] No slides found');
        }
        return;
      }

      // เตรียมโครงสร้าง DOM
      this.setupDOM(instance);

      // สร้างตัวควบคุม
      if (instance.options.controls) {
        this.createControls(instance);
      }

      // สร้างจุดบอกสถานะ
      if (instance.options.indicators) {
        this.createIndicators(instance);
      }

      // สร้างปุ่มเต็มหน้าจอ
      if (instance.options.fullscreen) {
        this.createFullscreenButton(instance);
      }

      // ผูก event
      this.bindEvents(instance);

      // โหลดรูปล่วงหน้า
      if (instance.options.lazyLoad) {
        this.preloadImages(instance);
      }

      // แสดงสไลด์แรก
      this.goToSlide(instance, 0);

      // เริ่มเล่นอัตโนมัติ
      if (instance.options.autoplay) {
        this.play(instance);
      }

      // ปรับความสูง
      if (instance.options.adaptiveHeight) {
        this.updateHeight(instance);
      }

      // แจ้งเหตุการณ์ initialized
      this.dispatchEvent(instance, 'init', {
        instance
      });

    } catch (error) {
      if (window.ErrorManager) {
        ErrorManager.handle(error, {
          context: 'Slideshow.setup',
          type: 'error:slideshow',
          data: {
            element: instance.element,
            options: instance.options
          }
        });
      } else {
        console.error('[Slideshow] Error setting up slideshow:', error);
      }
    }
  },

  /**
   * ค้นหาสไลด์ภายใน element
   */
  findSlides(instance) {
    const element = instance.element;

    // ค้นหารูปภาพที่มีคลาส slideshow หรือ data-slideshow
    const images = Array.from(
      element.querySelectorAll('img.slideshow, img[data-slideshow]')
    );

    // ค้นหาพื้นหลังที่มีคลาส slideshow-bg หรือ data-slideshow-bg
    const backgrounds = Array.from(
      element.querySelectorAll('.slideshow-bg, [data-slideshow-bg]')
    );

    instance.slides = [...images, ...backgrounds];

    // หากไม่พบ อาจเป็นไปได้ว่าสไลด์อยู่ในรูปแบบอื่น (เช่น div ที่อยู่ภายในแล้ว)
    if (instance.slides.length === 0) {
      // ตรวจสอบว่ามี div.slideshow-slide อยู่แล้วหรือไม่
      const existingSlides = Array.from(
        element.querySelectorAll('.slideshow-slide')
      );

      if (existingSlides.length > 0) {
        instance.slides = existingSlides;
      } else {
        const children = Array.from(element.children).filter(child =>
          child.tagName === 'DIV' &&
          !child.classList.contains('slideshow-controls') &&
          !child.classList.contains('slideshow-indicators')
        );

        if (children.length > 0) {
          instance.slides = children;
        }
      }
    }

    return instance.slides;
  },

  /**
   * เตรียมโครงสร้าง DOM
   */
  setupDOM(instance) {
    const element = instance.element;

    // เพิ่มคลาสและกำหนดสไตล์
    element.classList.add('slideshow');
    element.style.position = 'relative';
    element.style.overflow = 'hidden';

    // สร้าง wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'slideshow-wrapper';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Slideshow');
    instance.wrapper = wrapper;

    // กรณีที่ยังไม่มีโครงสร้าง slides
    if (element.querySelector('.slideshow-slide') === null) {
      instance.slides.forEach((slide, index) => {
        const slideEl = document.createElement('div');
        slideEl.className = 'slideshow-slide';
        slideEl.setAttribute('role', 'tabpanel');
        slideEl.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');

        // กรณีเป็นรูปภาพ
        if (slide instanceof HTMLImageElement) {
          const img = document.createElement('img');

          // กรณีใช้ lazy loading
          if (instance.options.lazyLoad && index > instance.options.preloadImages) {
            img.dataset.src = slide.src;
            img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E';
          } else {
            img.src = slide.src;
          }

          img.alt = slide.alt || '';
          slideEl.appendChild(img);

          // สร้างคำอธิบายถ้ามี
          if (slide.dataset.caption) {
            const caption = document.createElement('div');
            caption.className = `slideshow-caption slideshow-caption-${instance.options.captionPosition}`;
            caption.innerHTML = slide.dataset.caption;
            slideEl.appendChild(caption);
          }

          // เก็บข้อมูลสำหรับอ้างอิง
          slideEl.originalElement = slide;
          slide.parentNode.removeChild(slide);

        } else {
          // กรณีเป็นพื้นหลัง
          slideEl.style.backgroundImage = getComputedStyle(slide).backgroundImage;

          if (slide.innerHTML.trim()) {
            slideEl.innerHTML = slide.innerHTML;
          }

          // เก็บข้อมูลสำหรับอ้างอิง
          slideEl.originalElement = slide;
          slide.parentNode.removeChild(slide);
        }

        // กำหนดสไตล์พื้นฐาน
        slideEl.style.position = 'absolute';
        slideEl.style.top = 0;
        slideEl.style.left = 0;
        slideEl.style.width = '100%';
        slideEl.style.height = '100%';
        slideEl.style.opacity = index === 0 ? 1 : 0;

        wrapper.appendChild(slideEl);
      });

      element.appendChild(wrapper);

      // อัปเดตอ้างอิงสไลด์
      instance.slides = Array.from(wrapper.querySelectorAll('.slideshow-slide'));
    } else {
      // กรณีที่มีโครงสร้างอยู่แล้ว เช่น อาจสร้างด้วย HTML โดยตรง
      element.appendChild(wrapper);

      Array.from(element.querySelectorAll('.slideshow-slide')).forEach(slide => {
        wrapper.appendChild(slide);
      });

      instance.slides = Array.from(wrapper.querySelectorAll('.slideshow-slide'));
    }
  },

  /**
   * สร้างปุ่มควบคุม
   */
  createControls(instance) {
    const controls = document.createElement('div');
    controls.className = 'slideshow-controls';

    const createButton = (className, label, handler) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `slideshow-${className}`;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<span class="slideshow-${className}-icon">${label}</span>`;

      button.addEventListener('click', (e) => {
        e.preventDefault();
        handler(instance);
      });

      return button;
    };

    // ปุ่มย้อนกลับ
    const prevButton = createButton('prev', '<', this.prev.bind(this));
    controls.appendChild(prevButton);
    instance.controls.prev = prevButton;

    // ปุ่มถัดไป
    const nextButton = createButton('next', '>', this.next.bind(this));
    controls.appendChild(nextButton);
    instance.controls.next = nextButton;

    instance.element.appendChild(controls);
  },

  /**
   * สร้างจุดบอกสถานะ
   */
  createIndicators(instance) {
    const indicators = document.createElement('div');
    indicators.className = 'slideshow-indicators';

    for (let i = 0; i < instance.slides.length; i++) {
      const indicator = document.createElement('button');
      indicator.type = 'button';
      indicator.className = 'slideshow-indicator';
      indicator.setAttribute('aria-label', `Slide ${i + 1}`);

      if (i === 0) {
        indicator.classList.add('active');
        indicator.setAttribute('aria-current', 'true');
      }

      indicator.addEventListener('click', () => this.goToSlide(instance, i));

      indicators.appendChild(indicator);
      instance.controls.indicators.push(indicator);
    }

    instance.element.appendChild(indicators);
  },

  /**
   * สร้างปุ่มเต็มหน้าจอ
   */
  createFullscreenButton(instance) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slideshow-fullscreen';
    button.setAttribute('aria-label', 'Toggle fullscreen');
    button.innerHTML = '⛶';

    button.addEventListener('click', () => {
      if (instance.isFullscreen) {
        this.exitFullscreen(instance);
      } else {
        this.enterFullscreen(instance);
      }
    });

    instance.element.appendChild(button);
    instance.controls.fullscreen = button;
  },

  /**
   * ผูก events
   */
  bindEvents(instance) {
    // ผูก keyboard events
    if (instance.options.keyboard) {
      instance.handlers = instance.handlers || {};

      instance.handlers.keydown = (e) => {
        if (!instance.element.contains(document.activeElement) &&
          document.activeElement !== document.body) {
          return;
        }

        switch (e.key) {
          case 'ArrowLeft':
            this.prev(instance);
            break;
          case 'ArrowRight':
            this.next(instance);
            break;
          case ' ':
            e.preventDefault();
            if (instance.isPlaying) {
              this.pause(instance);
            } else {
              this.play(instance);
            }
            break;
          case 'Escape':
            if (instance.isFullscreen) {
              this.exitFullscreen(instance);
            }
            break;
        }
      };

      document.addEventListener('keydown', instance.handlers.keydown);
    }

    // ผูก touch events
    if (instance.options.touch) {
      instance.handlers = instance.handlers || {};

      let touchStartX = 0;
      let touchStartY = 0;

      instance.handlers.touchstart = (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      };

      instance.handlers.touchmove = (e) => {
        if (!touchStartX || !touchStartY) return;

        const diffX = touchStartX - e.touches[0].clientX;
        const diffY = touchStartY - e.touches[0].clientY;

        // ตรวจสอบว่าการเลื่อนแนวนอนมากกว่าแนวตั้งหรือไม่
        if (Math.abs(diffX) > Math.abs(diffY)) {
          e.preventDefault(); // ป้องกันการเลื่อนหน้า

          if (Math.abs(diffX) > 50) { // ต้องเลื่อนอย่างน้อย 50px
            if (diffX > 0) {
              this.next(instance);
            } else {
              this.prev(instance);
            }

            // รีเซ็ตจุดเริ่มต้น
            touchStartX = 0;
            touchStartY = 0;
          }
        }
      };

      instance.element.addEventListener('touchstart', instance.handlers.touchstart, {passive: true});
      instance.element.addEventListener('touchmove', instance.handlers.touchmove, {passive: false});
    }

    // ผูก pause on hover
    if (instance.options.pauseOnHover) {
      instance.handlers = instance.handlers || {};

      instance.handlers.mouseenter = () => {
        if (instance.isPlaying) {
          instance.isPaused = true;
          clearTimeout(instance.timer);
        }
      };

      instance.handlers.mouseleave = () => {
        if (instance.isPlaying && instance.isPaused) {
          instance.isPaused = false;
          this.setTimer(instance);
        }
      };

      instance.element.addEventListener('mouseenter', instance.handlers.mouseenter);
      instance.element.addEventListener('mouseleave', instance.handlers.mouseleave);
    }

    // ผูก resize event สำหรับ adaptive height
    if (instance.options.adaptiveHeight) {
      instance.handlers = instance.handlers || {};

      instance.handlers.resize = () => {
        this.updateHeight(instance);
      };

      window.addEventListener('resize', instance.handlers.resize);
    }

    // ผูก event ก่อนออกจากหน้าเพื่อทำความสะอาด
    instance.handlers = instance.handlers || {};
    instance.handlers.beforeunload = () => {
      this.destroy(instance.id);
    };

    window.addEventListener('beforeunload', instance.handlers.beforeunload);
  },

  /**
   * โหลดรูปล่วงหน้า
   */
  preloadImages(instance) {
    const preloadCount = Math.min(instance.options.preloadImages, instance.slides.length);

    for (let i = 0; i < preloadCount; i++) {
      this.loadSlideImage(instance, i);
    }
  },

  /**
   * โหลดรูปภาพสำหรับสไลด์
   */
  loadSlideImage(instance, index) {
    const slide = instance.slides[index];
    if (!slide) return;

    const img = slide.querySelector('img[data-src]');
    if (img && img.dataset.src) {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');

      img.onload = () => {
        if (instance.options.adaptiveHeight && index === instance.currentIndex) {
          this.updateHeight(instance);
        }
      };
    }
  },

  /**
   * อัปเดตความสูงของสไลด์โชว์
   */
  updateHeight(instance) {
    if (!instance.options.adaptiveHeight) return;

    const currentSlide = instance.slides[instance.currentIndex];
    if (!currentSlide) return;

    const img = currentSlide.querySelector('img');

    if (img && img.complete) {
      const height = img.offsetHeight;
      instance.wrapper.style.height = `${height}px`;
    } else if (img) {
      img.onload = () => {
        const height = img.offsetHeight;
        instance.wrapper.style.height = `${height}px`;
      };
    }
  },

  /**
   * ไปยังสไลด์ที่ระบุ
   */
  goToSlide(instance, index) {
    if (index === instance.currentIndex) return;

    // ตรวจสอบค่า index
    if (index < 0) {
      index = instance.options.loop ? instance.slides.length - 1 : 0;
    } else if (index >= instance.slides.length) {
      index = instance.options.loop ? 0 : instance.slides.length - 1;
    }

    // เก็บค่า index เดิม
    const previousIndex = instance.currentIndex;

    // อัปเดตจุดบอกสถานะ
    if (instance.controls.indicators.length) {
      instance.controls.indicators[previousIndex]?.classList.remove('active');
      instance.controls.indicators[previousIndex]?.removeAttribute('aria-current');

      instance.controls.indicators[index]?.classList.add('active');
      instance.controls.indicators[index]?.setAttribute('aria-current', 'true');
    }

    // อัปเดต index ปัจจุบัน
    instance.currentIndex = index;

    // ใช้ effect ที่กำหนด
    const effect = this.effects[instance.options.effect] || this.effects.fade;
    effect.apply(instance, previousIndex, index);

    // โหลดรูปถัดไป (สำหรับ lazy loading)
    if (instance.options.lazyLoad) {
      // โหลดรูปปัจจุบัน
      this.loadSlideImage(instance, index);

      // โหลดรูปถัดไป
      const nextIndex = (index + 1) % instance.slides.length;
      this.loadSlideImage(instance, nextIndex);
    }

    // อัปเดตความสูง (กรณีใช้ adaptive height)
    if (instance.options.adaptiveHeight) {
      this.updateHeight(instance);
    }

    // แจ้งเหตุการณ์ change
    this.dispatchEvent(instance, 'change', {
      currentIndex: index,
      previousIndex: previousIndex
    });

    // หากกำลังเล่นอัตโนมัติ ให้รีเซ็ตเวลา
    if (instance.isPlaying && !instance.isPaused) {
      this.setTimer(instance);
    }
  },

  /**
   * ไปยังสไลด์ถัดไป
   */
  next(instance) {
    this.goToSlide(instance, instance.currentIndex + 1);
  },

  /**
   * ไปยังสไลด์ก่อนหน้า
   */
  prev(instance) {
    this.goToSlide(instance, instance.currentIndex - 1);
  },

  /**
   * เริ่มเล่นอัตโนมัติ
   */
  play(instance) {
    if (instance.isPlaying) return;

    instance.isPlaying = true;
    instance.isPaused = false;

    this.setTimer(instance);

    this.dispatchEvent(instance, 'play');
  },

  /**
   * ตั้งค่าตัวจับเวลา
   */
  setTimer(instance) {
    clearTimeout(instance.timer);

    instance.timer = setTimeout(() => {
      if (instance.isPlaying && !instance.isPaused) {
        this.next(instance);
      }
    }, instance.options.duration);
  },

  /**
   * หยุดเล่นชั่วคราว
   */
  pause(instance) {
    if (!instance.isPlaying) return;

    instance.isPaused = true;
    clearTimeout(instance.timer);

    this.dispatchEvent(instance, 'pause');
  },

  /**
   * หยุดเล่น
   */
  stop(instance) {
    instance.isPlaying = false;
    instance.isPaused = false;
    clearTimeout(instance.timer);

    this.dispatchEvent(instance, 'stop');
  },

  /**
   * เข้าสู่โหมดเต็มหน้าจอ
   */
  enterFullscreen(instance) {
    if (instance.isFullscreen) return;

    // ใช้ BackdropManager ถ้ามี
    if (window.BackdropManager) {
      instance.backdropId = BackdropManager.show(() => {
        this.exitFullscreen(instance);
      }, {
        opacity: 1,
        background: 'rgba(0,0,0,0.95)'
      });
    }

    instance.element.classList.add('slideshow-fullscreen');
    instance.isFullscreen = true;

    // อัปเดตข้อความปุ่ม
    if (instance.controls.fullscreen) {
      instance.controls.fullscreen.setAttribute('aria-label', 'Exit fullscreen');
      instance.controls.fullscreen.innerHTML = '⎋';
    }

    this.dispatchEvent(instance, 'fullscreen', {fullscreen: true});
  },

  /**
   * ออกจากโหมดเต็มหน้าจอ
   */
  exitFullscreen(instance) {
    if (!instance.isFullscreen) return;

    // ปิด backdrop ถ้ามี
    if (window.BackdropManager && instance.backdropId !== null) {
      BackdropManager.hide(instance.backdropId);
      instance.backdropId = null;
    }

    instance.element.classList.remove('slideshow-fullscreen');
    instance.isFullscreen = false;

    // อัปเดตข้อความปุ่ม
    if (instance.controls.fullscreen) {
      instance.controls.fullscreen.setAttribute('aria-label', 'Enter fullscreen');
      instance.controls.fullscreen.innerHTML = '⛶';
    }

    this.dispatchEvent(instance, 'fullscreen', {fullscreen: false});
  },

  /**
   * ดึงตัวเลือกจาก data attributes
   */
  extractOptionsFromElement(element) {
    const options = {};
    const dataset = element.dataset;

    // อ่านค่าจาก data-* attributes
    if (dataset.effect) options.effect = dataset.effect;
    if (dataset.duration) options.duration = parseInt(dataset.duration, 10);
    if (dataset.speed) options.speed = parseInt(dataset.speed, 10);
    if (dataset.autoplay !== undefined) options.autoplay = dataset.autoplay !== 'false';
    if (dataset.loop !== undefined) options.loop = dataset.loop !== 'false';
    if (dataset.controls !== undefined) options.controls = dataset.controls !== 'false';
    if (dataset.indicators !== undefined) options.indicators = dataset.indicators !== 'false';
    if (dataset.pauseOnHover !== undefined) options.pauseOnHover = dataset.pauseOnHover !== 'false';
    if (dataset.keyboard !== undefined) options.keyboard = dataset.keyboard !== 'false';
    if (dataset.touch !== undefined) options.touch = dataset.touch !== 'false';
    if (dataset.fullscreen !== undefined) options.fullscreen = dataset.fullscreen === 'true';
    if (dataset.adaptiveHeight !== undefined) options.adaptiveHeight = dataset.adaptiveHeight === 'true';
    if (dataset.captionPosition) options.captionPosition = dataset.captionPosition;
    if (dataset.lazyLoad !== undefined) options.lazyLoad = dataset.lazyLoad !== 'false';
    if (dataset.preloadImages) options.preloadImages = parseInt(dataset.preloadImages, 10);

    return options;
  },

  /**
   * ส่งเหตุการณ์
   */
  dispatchEvent(instance, eventName, detail = {}) {
    if (!instance.element) return;

    const event = new CustomEvent(`slideshow:${eventName}`, {
      bubbles: true,
      cancelable: true,
      detail: {
        instance,
        ...detail
      }
    });

    instance.element.dispatchEvent(event);

    EventManager.emit(`slideshow:${eventName}`, {
      instance,
      ...detail
    });

  },

  /**
   * ลงทะเบียน effect ใหม่
   */
  registerEffect(name, effectHandler) {
    if (!name || typeof name !== 'string') {
      console.error('[Slideshow] Effect name must be a string');
      return;
    }

    if (!effectHandler || typeof effectHandler.apply !== 'function') {
      console.error('[Slideshow] Effect handler must have an apply method');
      return;
    }

    this.effects[name] = effectHandler;
  },

  /**
   * ค้นหา instance จาก element
   */
  getInstance(element) {
    // ถ้าเป็น string ให้ค้นหา element
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }

    if (!element) return null;

    // ตรวจสอบจาก data-slideshow-id
    const id = element.dataset.slideshowId;
    if (id && this.state.instances.has(id)) {
      return this.state.instances.get(id);
    }

    // ค้นหาจากทุก instance
    for (const instance of this.state.instances.values()) {
      if (instance.element === element) {
        return instance;
      }
    }

    return null;
  },

  /**
   * ลบ instance
   */
  destroy(instanceOrId) {
    let instance;

    // ถ้าเป็น ID ให้ค้นหา instance
    if (typeof instanceOrId === 'string') {
      instance = this.state.instances.get(instanceOrId);
    } else if (instanceOrId instanceof HTMLElement) {
      instance = this.getInstance(instanceOrId);
    } else {
      instance = instanceOrId;
    }

    if (!instance) return false;

    // หยุดเล่น
    this.stop(instance);

    // ลบ event listeners
    if (instance.handlers) {
      if (instance.handlers.keydown) {
        document.removeEventListener('keydown', instance.handlers.keydown);
      }

      if (instance.handlers.touchstart) {
        instance.element.removeEventListener('touchstart', instance.handlers.touchstart);
      }

      if (instance.handlers.touchmove) {
        instance.element.removeEventListener('touchmove', instance.handlers.touchmove);
      }

      if (instance.handlers.mouseenter) {
        instance.element.removeEventListener('mouseenter', instance.handlers.mouseenter);
      }

      if (instance.handlers.mouseleave) {
        instance.element.removeEventListener('mouseleave', instance.handlers.mouseleave);
      }

      if (instance.handlers.resize) {
        window.removeEventListener('resize', instance.handlers.resize);
      }

      if (instance.handlers.beforeunload) {
        window.removeEventListener('beforeunload', instance.handlers.beforeunload);
      }
    }

    // ออกจากโหมดเต็มหน้าจอถ้าเปิดอยู่
    if (instance.isFullscreen) {
      this.exitFullscreen(instance);
    }

    // ลบ DOM elements ที่เพิ่มเข้าไป
    if (instance.controls) {
      if (instance.controls.prev && instance.controls.prev.parentNode) {
        instance.controls.prev.parentNode.removeChild(instance.controls.prev);
      }

      if (instance.controls.next && instance.controls.next.parentNode) {
        instance.controls.next.parentNode.removeChild(instance.controls.next);
      }

      if (instance.controls.fullscreen && instance.controls.fullscreen.parentNode) {
        instance.controls.fullscreen.parentNode.removeChild(instance.controls.fullscreen);
      }

      const indicators = instance.element.querySelector('.slideshow-indicators');
      if (indicators) {
        indicators.parentNode.removeChild(indicators);
      }

      const controls = instance.element.querySelector('.slideshow-controls');
      if (controls) {
        controls.parentNode.removeChild(controls);
      }
    }

    // แจ้งเหตุการณ์ destroy
    this.dispatchEvent(instance, 'destroy');

    // ลบจาก Map
    if (instance.id) {
      this.state.instances.delete(instance.id);
    }

    // ลบ data attribute
    if (instance.element) {
      delete instance.element.dataset.slideshowId;
    }

    return true;
  },

  /**
   * อัปเดตตัวเลือกสำหรับ instance
   */
  updateOptions(instance, newOptions) {
    if (!instance) return false;

    // เก็บค่าเดิม
    const oldOptions = {...instance.options};

    // อัปเดตค่าใหม่
    instance.options = {...instance.options, ...newOptions};

    // ตรวจสอบการเปลี่ยนแปลงและอัปเดตตามความจำเป็น

    // เปลี่ยนการแสดงตัวควบคุม
    if (oldOptions.controls !== instance.options.controls) {
      if (instance.options.controls) {
        this.createControls(instance);
      } else {
        const controls = instance.element.querySelector('.slideshow-controls');
        if (controls) {
          controls.parentNode.removeChild(controls);
        }
        instance.controls.prev = null;
        instance.controls.next = null;
      }
    }

    // เปลี่ยนการแสดงจุดบอกสถานะ
    if (oldOptions.indicators !== instance.options.indicators) {
      if (instance.options.indicators) {
        this.createIndicators(instance);
      } else {
        const indicators = instance.element.querySelector('.slideshow-indicators');
        if (indicators) {
          indicators.parentNode.removeChild(indicators);
        }
        instance.controls.indicators = [];
      }
    }

    // เปลี่ยนการแสดงปุ่มเต็มหน้าจอ
    if (oldOptions.fullscreen !== instance.options.fullscreen) {
      if (instance.options.fullscreen) {
        this.createFullscreenButton(instance);
      } else if (instance.controls.fullscreen) {
        instance.controls.fullscreen.parentNode.removeChild(instance.controls.fullscreen);
        instance.controls.fullscreen = null;
      }
    }

    // เปลี่ยนสถานะการเล่น
    if (oldOptions.autoplay !== instance.options.autoplay) {
      if (instance.options.autoplay) {
        this.play(instance);
      } else {
        this.stop(instance);
      }
    }

    // อัปเดตปุ่มควบคุม
    this.updateControlsState(instance);

    return true;
  },

  /**
   * อัปเดตสถานะปุ่มควบคุม
   */
  updateControlsState(instance) {
    // ตรวจสอบปุ่มก่อนหน้า
    if (instance.controls.prev) {
      if (!instance.options.loop && instance.currentIndex === 0) {
        instance.controls.prev.disabled = true;
        instance.controls.prev.setAttribute('aria-disabled', 'true');
      } else {
        instance.controls.prev.disabled = false;
        instance.controls.prev.removeAttribute('aria-disabled');
      }
    }

    // ตรวจสอบปุ่มถัดไป
    if (instance.controls.next) {
      if (!instance.options.loop && instance.currentIndex === instance.slides.length - 1) {
        instance.controls.next.disabled = true;
        instance.controls.next.setAttribute('aria-disabled', 'true');
      } else {
        instance.controls.next.disabled = false;
        instance.controls.next.removeAttribute('aria-disabled');
      }
    }
  },

  /**
   * ตั้งค่าเริ่มต้น Slideshow
   */
  async init(options = {}) {
    // อัปเดตค่า config
    this.config = {...this.config, ...options};

    // เริ่มต้นค้นหา elements ที่มี data-component="slideshow"
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initElements());
    } else {
      this.initElements();
    }

    this.state.initialized = true;
    return this;
  },

  /**
   * เริ่มต้น elements ที่มี data-component="slideshow"
   */
  initElements() {
    document.querySelectorAll('[data-component="slideshow"]').forEach(element => {
      this.create(element);
    });
  }
};

/**
 * ลงทะเบียน Component กับ ComponentManager
 */
if (window.ComponentManager) {
  ComponentManager.define('slideshow', {
    template: null,

    validElement(element) {
      return element.classList.contains('slideshow') ||
        element.dataset.component === 'slideshow' ||
        element.querySelectorAll('img.slideshow, img[data-slideshow], .slideshow-bg, [data-slideshow-bg]').length > 0;
    },

    setupElement(element, state) {
      const options = Slideshow.extractOptionsFromElement(element);
      const slideshow = Slideshow.create(element, options);

      element._slideshow = slideshow;
      return element;
    },

    beforeDestroy() {
      if (this.element && this.element._slideshow) {
        Slideshow.destroy(this.element._slideshow);
        delete this.element._slideshow;
      }
    }
  });
}

/**
 * ลงทะเบียน Slideshow กับ Now.js framework
 */
if (window.Now?.registerManager) {
  Now.registerManager('slideshow', Slideshow);
}

/**
 * ทำให้ใช้งานได้โดยตรง
 */
window.Slideshow = Slideshow;
