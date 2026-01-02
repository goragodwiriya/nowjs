/**
 * CounterComponent - คอมโพเนนต์สำหรับทำ animation ตัวเลข
 * สามารถทำงานร่วมกับ ScrollManager และรองรับการ animate หลายรูปแบบ
 */
const CounterComponent = {
  config: {
    // ค่าพื้นฐาน
    start: 0,                // ค่าเริ่มต้น
    end: 100,                // ค่าสิ้นสุด
    duration: 2000,          // ระยะเวลาในการ animate (ms)
    easing: 'easeOutExpo',   // รูปแบบการ animate (linear, easeOutExpo, easeInOutCubic)
    format: 'number',        // รูปแบบการแสดงผล (number, percentage, currency, time, timer)
    countMode: 'up',         // รูปแบบการนับ (up, down)
    autostart: false,        // เริ่มทันทีที่โหลด
    delay: 0,                // เวลารอก่อนเริ่ม animate (ms)

    // การทำงานร่วมกับ ScrollManager
    scrollTrigger: true,     // เริ่มการนับเมื่อเลื่อนมาถึง
    scrollThreshold: 0.5,    // เริ่มเมื่อเห็นองค์ประกอบ 50%
    scrollOffset: 0,         // ระยะห่างจากขอบหน้าจอที่จะเริ่มทำงาน

    // รูปแบบการแสดงผล
    decimalPlaces: 0,        // จำนวนทศนิยม
    prefix: '',              // ข้อความนำหน้า
    suffix: '',              // ข้อความต่อท้าย
    separator: ',',          // ตัวคั่นหลักพัน
    decimal: '.',            // จุดทศนิยม
    currencySymbol: '฿',     // สัญลักษณ์สกุลเงิน (สำหรับรูปแบบ currency)

    // การแสดงผลพิเศษ
    animation: 'normal',     // รูปแบบ animation (normal, rollup, odometer)
    formatterFn: null,       // ฟังก์ชัน formatter แบบกำหนดเอง
    template: null,          // Template HTML สำหรับการแสดงผล

    // callbacks
    onStart: null,           // เมื่อเริ่ม animate
    onUpdate: null,          // เมื่อมีการอัพเดทค่า
    onComplete: null,        // เมื่อ animate เสร็จสิ้น
  },

  state: {
    instances: new Map(),    // เก็บ instance ทั้งหมด
    initialized: false
  },

  /**
   * เริ่มต้นการทำงานของ CounterComponent
   */
  async init(options = {}) {
    this.config = {...this.config, ...options};
    this.initElements();
    this.state.initialized = true;
    return this;
  },

  /**
   * เริ่มต้น elements ที่มี data-component="counter"
   */
  initElements() {
    document.querySelectorAll('[data-component="counter"]').forEach(element => {
      this.create(element);
    });
  },

  /**
   * สร้าง instance ใหม่ของ CounterComponent
   */
  create(element, options = {}) {
    // ถ้าเป็น string ให้ค้นหา element
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }

    if (!element) {
      console.error('Element not found');
      return null;
    }

    // ตรวจสอบว่ามี instance อยู่แล้วหรือไม่
    const existingInstance = this.getInstance(element);
    if (existingInstance) {
      return existingInstance;
    }

    // สร้าง instance ใหม่
    const instance = {
      id: 'counter_' + Math.random().toString(36).substring(2, 11),
      element,
      options: {...this.config, ...this.extractOptionsFromElement(element), ...options},
      value: 0,
      currentValue: 0,
      targetValue: 0,
      startTime: 0,
      isRunning: false,
      isComplete: false,
      timer: null,
      animationFrame: null,
      elements: {
        container: null,
        wrapper: null,
        value: null
      }
    };

    // เริ่มต้นทำงาน
    this.setup(instance);

    // เก็บ instance
    this.state.instances.set(instance.id, instance);
    element.dataset.counterComponentId = instance.id;

    // เก็บ reference ไว้ที่ element เพื่อเข้าถึงจาก HTML
    element.counterInstance = instance;

    return instance;
  },

  /**
   * ตั้งค่า instance
   */
  setup(instance) {
    try {
      const {element, options} = instance;

      // เตรียม DOM
      this.prepareDOM(instance);

      // ตั้งค่าเริ่มต้น
      instance.value = parseFloat(options.start) || 0;
      instance.currentValue = instance.value;
      instance.targetValue = parseFloat(options.end) || 100;

      // ถ้าเป็นการนับถอยหลัง ให้สลับค่าเริ่มต้นและสิ้นสุด
      if (options.countMode === 'down') {
        instance.value = instance.targetValue;
        instance.currentValue = instance.targetValue;
        instance.targetValue = parseFloat(options.start) || 0;
      }

      // แสดงค่าเริ่มต้น
      this.updateDisplay(instance);

      // ตั้งค่า scroll trigger
      if (options.scrollTrigger) {
        this.setupScrollTrigger(instance);
      }

      // เริ่มอัตโนมัติถ้าตั้งค่าไว้
      if (options.autostart) {
        setTimeout(() => {
          this.start(instance);
        }, options.delay);
      }

      // เพิ่มเมธอดสำหรับเรียกใช้จาก HTML
      element.start = () => this.start(instance);
      element.stop = () => this.stop(instance);
      element.reset = () => this.reset(instance);
      element.setValue = (value) => this.setValue(instance, value);

      // แจ้งเหตุการณ์ initialized
      this.dispatchEvent(instance, 'init', {instance});

    } catch (error) {
      console.error('CounterComponent setup error:', error);
    }
  },

  /**
   * เตรียมโครงสร้าง DOM
   */
  prepareDOM(instance) {
    const {element, options} = instance;

    // เพิ่ม class counter-component
    element.classList.add('counter-component');

    // สร้าง container สำหรับตัวเลข
    const container = document.createElement('div');
    container.className = 'counter-container';

    // สร้าง wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'counter-wrapper';

    // สร้าง element สำหรับแสดงค่า
    const valueElement = document.createElement('span');
    valueElement.className = 'counter-value';

    // ถ้ามี template HTML
    if (options.template) {
      try {
        if (typeof options.template === 'string') {
          wrapper.innerHTML = options.template;
          const valueSlot = wrapper.querySelector('[data-counter-value]');
          if (valueSlot) {
            instance.elements.value = valueSlot;
          } else {
            wrapper.appendChild(valueElement);
            instance.elements.value = valueElement;
          }
        }
      } catch (e) {
        console.error('Error applying template:', e);
        wrapper.appendChild(valueElement);
        instance.elements.value = valueElement;
      }
    } else {
      // ถ้าไม่มี template ใช้โครงสร้างพื้นฐาน
      wrapper.appendChild(valueElement);
      instance.elements.value = valueElement;
    }

    // เพิ่ม prefix และ suffix
    if (options.prefix) {
      const prefixElement = document.createElement('span');
      prefixElement.className = 'counter-prefix';
      prefixElement.textContent = options.prefix;
      wrapper.insertBefore(prefixElement, wrapper.firstChild);
    }

    if (options.suffix) {
      const suffixElement = document.createElement('span');
      suffixElement.className = 'counter-suffix';
      suffixElement.textContent = options.suffix;
      wrapper.appendChild(suffixElement);
    }

    // เพิ่มเข้าไปใน DOM
    container.appendChild(wrapper);

    // ถ้า element ว่างเปล่า ให้แทนที่เนื้อหาทั้งหมด
    if (element.innerHTML.trim() === '') {
      element.appendChild(container);
    } else {
      // ถ้ามีเนื้อหาอยู่แล้ว ให้ค้นหา placeholder สำหรับค่า
      const placeholder = element.querySelector('[data-counter-value]');
      if (placeholder) {
        instance.elements.value = placeholder;
      } else {
        // ถ้าไม่มี placeholder ให้แทรก element สำหรับแสดงค่า
        instance.elements.value = valueElement;
        element.appendChild(valueElement);
      }
    }

    // เก็บ elements
    instance.elements.container = container;
    instance.elements.wrapper = wrapper;
  },

  /**
   * เริ่ม animation การนับ
   */
  start(instance) {
    if (!instance || instance.isRunning) return;

    const {options} = instance;
    instance.isRunning = true;
    instance.isComplete = false;
    instance.startTime = performance.now();

    // แจ้งเหตุการณ์ start
    this.dispatchEvent(instance, 'start', {
      startValue: instance.value,
      targetValue: instance.targetValue
    });

    // เรียกใช้ callback onStart
    if (typeof options.onStart === 'function') {
      options.onStart.call(instance, instance.value);
    }

    // ทำ animation
    this.animate(instance);

    return instance;
  },

  /**
   * อัพเดต animation
   */
  animate(instance) {
    if (!instance || !instance.isRunning) return;

    const {options} = instance;
    const currentTime = performance.now();
    const elapsedTime = currentTime - instance.startTime;

    // คำนวณสัดส่วนของเวลาที่ผ่านไป (0-1)
    let progress = Math.min(elapsedTime / options.duration, 1);

    // ใช้ easing function
    progress = this.applyEasing(progress, options.easing);

    // คำนวณค่าปัจจุบัน
    const startValue = instance.value;
    const changeInValue = instance.targetValue - startValue;
    instance.currentValue = startValue + (changeInValue * progress);

    // อัพเดตการแสดงผล
    this.updateDisplay(instance);

    // เรียกใช้ callback onUpdate
    if (typeof options.onUpdate === 'function') {
      options.onUpdate.call(instance, instance.currentValue);
    }

    // แจ้งเหตุการณ์ update
    this.dispatchEvent(instance, 'update', {
      value: instance.currentValue,
      progress: progress
    });

    // ถ้ายังไม่เสร็จ ให้ทำต่อ
    if (progress < 1) {
      instance.animationFrame = requestAnimationFrame(() => this.animate(instance));
    } else {
      // ถ้าเสร็จแล้ว
      instance.currentValue = instance.targetValue;
      this.updateDisplay(instance);
      this.complete(instance);
    }
  },

  /**
   * เมื่อ animation เสร็จสิ้น
   */
  complete(instance) {
    if (!instance) return;

    instance.isRunning = false;
    instance.isComplete = true;

    // แจ้งเหตุการณ์ complete
    this.dispatchEvent(instance, 'complete', {
      value: instance.currentValue
    });

    // เรียกใช้ callback onComplete
    if (typeof instance.options.onComplete === 'function') {
      instance.options.onComplete.call(instance, instance.currentValue);
    }
  },

  /**
   * หยุด animation
   */
  stop(instance) {
    if (!instance || !instance.isRunning) return;

    instance.isRunning = false;

    if (instance.animationFrame) {
      cancelAnimationFrame(instance.animationFrame);
      instance.animationFrame = null;
    }

    // แจ้งเหตุการณ์ stop
    this.dispatchEvent(instance, 'stop', {
      value: instance.currentValue
    });

    return instance;
  },

  /**
   * รีเซ็ตกลับไปค่าเริ่มต้น
   */
  reset(instance) {
    if (!instance) return;

    this.stop(instance);

    // กลับไปค่าเริ่มต้น
    const {options} = instance;

    if (options.countMode === 'down') {
      instance.currentValue = parseFloat(options.end) || 100;
      instance.value = instance.currentValue;
      instance.targetValue = parseFloat(options.start) || 0;
    } else {
      instance.currentValue = parseFloat(options.start) || 0;
      instance.value = instance.currentValue;
      instance.targetValue = parseFloat(options.end) || 100;
    }

    // อัพเดตการแสดงผล
    this.updateDisplay(instance);

    // แจ้งเหตุการณ์ reset
    this.dispatchEvent(instance, 'reset', {
      value: instance.currentValue
    });

    return instance;
  },

  /**
   * อัพเดตการแสดงผล
   */
  updateDisplay(instance) {
    if (!instance || !instance.elements.value) return;

    const {options} = instance;
    let formattedValue = '';

    // กำหนดค่าด้วย formatter ที่กำหนดเอง
    if (typeof options.formatterFn === 'function') {
      formattedValue = options.formatterFn(instance.currentValue, options);
    } else {
      // หรือใช้ formatter ตามรูปแบบที่กำหนด
      formattedValue = this.formatValue(instance.currentValue, options);
    }

    // อัพเดต DOM
    if (options.animation === 'odometer') {
      this.updateOdometerAnimation(instance, formattedValue);
    } else if (options.animation === 'rollup') {
      this.updateRollupAnimation(instance, formattedValue);
    } else {
      // animation แบบปกติ
      instance.elements.value.textContent = formattedValue;
    }
  },

  /**
   * Animation แบบ odometer (ตัวเลขวิ่งแบบมิเตอร์)
   */
  updateOdometerAnimation(instance, formattedValue) {
    const valueElement = instance.elements.value;

    // ถ้ายังไม่มี odometer
    if (!valueElement.querySelector('.odometer-digit')) {
      valueElement.innerHTML = '';

      // สร้างตัวเลขแต่ละหลัก
      formattedValue.split('').forEach(char => {
        const digitContainer = document.createElement('span');

        if (/\d/.test(char)) {
          // ถ้าเป็นตัวเลข
          digitContainer.className = 'odometer-digit';

          const digitList = document.createElement('div');
          digitList.className = 'odometer-digit-list';

          // สร้างตัวเลข 0-9
          for (let i = 0; i <= 9; i++) {
            const digitValue = document.createElement('span');
            digitValue.className = 'odometer-digit-value';
            digitValue.textContent = i;
            digitList.appendChild(digitValue);
          }

          digitContainer.appendChild(digitList);
          digitContainer.dataset.value = char;
        } else {
          // ถ้าเป็นอักขระอื่น (เช่น จุลภาค จุดทศนิยม)
          digitContainer.className = 'odometer-separator';
          digitContainer.textContent = char;
        }

        valueElement.appendChild(digitContainer);
      });
    }

    // อัพเดตค่าแต่ละหลัก
    const currentChars = formattedValue.split('');
    const digits = valueElement.querySelectorAll('.odometer-digit');

    digits.forEach((digit, index) => {
      if (index < currentChars.length && /\d/.test(currentChars[index])) {
        const value = parseInt(currentChars[index]);
        const digitList = digit.querySelector('.odometer-digit-list');

        if (digitList) {
          // คำนวณระยะการเลื่อน (แต่ละตัวเลขมีความสูง 100%)
          const offset = -value * 100;
          digitList.style.transform = `translateY(${offset}%)`;
        }

        digit.dataset.value = value;
      }
    });
  },

  /**
   * Animation แบบ rollup (ตัวเลขม้วนขึ้น)
   */
  updateRollupAnimation(instance, formattedValue) {
    const valueElement = instance.elements.value;
    const currentValue = valueElement.textContent;

    // ถ้าค่าไม่เปลี่ยน ไม่ต้องทำอะไร
    if (currentValue === formattedValue) return;

    // ถ้าไม่มี container สำหรับ animation
    if (!valueElement.querySelector('.rollup-container')) {
      valueElement.innerHTML = `
        <span class="rollup-container">
          <span class="rollup-old">${currentValue || '0'}</span>
          <span class="rollup-new">${formattedValue}</span>
        </span>
      `;
    } else {
      // อัพเดต element ที่มีอยู่
      const oldValue = valueElement.querySelector('.rollup-old');
      const newValue = valueElement.querySelector('.rollup-new');

      oldValue.textContent = currentValue || '0';
      newValue.textContent = formattedValue;

      // เพิ่ม class เพื่อเริ่ม animation
      valueElement.querySelector('.rollup-container').classList.remove('animate');

      // บังคับ reflow เพื่อให้ animation เริ่มใหม่
      void valueElement.offsetWidth;

      valueElement.querySelector('.rollup-container').classList.add('animate');
    }

    // หลังจาก animation เสร็จ ให้ใช้ค่าใหม่โดยตรง
    setTimeout(() => {
      valueElement.textContent = formattedValue;
    }, 300); // ระยะเวลา animation
  },

  /**
   * จัดรูปแบบค่าตามที่กำหนด
   */
  formatValue(value, options) {
    // ปัดเศษตามจำนวนทศนิยมที่กำหนด
    const rounded = Number(value).toFixed(options.decimalPlaces);

    let result = '';

    switch (options.format) {
      case 'percentage':
        result = this.formatNumber(rounded, options) + '%';
        break;

      case 'currency':
        result = options.currencySymbol + this.formatNumber(rounded, options);
        break;

      case 'time':
        result = this.formatTime(value);
        break;

      case 'timer':
        result = this.formatTimer(value);
        break;

      default:
        result = this.formatNumber(rounded, options);
    }

    return result;
  },

  /**
   * จัดรูปแบบตัวเลข
   */
  formatNumber(value, options) {
    // แยกส่วนจำนวนเต็มและทศนิยม
    const parts = value.toString().split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1] || '';

    // ใส่ตัวคั่นหลักพัน
    let formattedInteger = '';
    if (options.separator) {
      const rgx = /(\d+)(\d{3})/;
      let integer = integerPart;

      while (rgx.test(integer)) {
        integer = integer.replace(rgx, '$1' + options.separator + '$2');
      }

      formattedInteger = integer;
    } else {
      formattedInteger = integerPart;
    }

    // รวมส่วนจำนวนเต็มและทศนิยม
    return decimalPart ? formattedInteger + options.decimal + decimalPart : formattedInteger;
  },

  /**
   * จัดรูปแบบเวลา (ชั่วโมง:นาที:วินาที)
   */
  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const hDisplay = h > 0 ? String(h).padStart(2, '0') + ':' : '';
    const mDisplay = String(m).padStart(2, '0') + ':';
    const sDisplay = String(s).padStart(2, '0');

    return hDisplay + mDisplay + sDisplay;
  },

  /**
   * จัดรูปแบบนาฬิกาจับเวลา (นาที:วินาที.มิลลิวินาที)
   */
  formatTimer(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);

    const mDisplay = String(m).padStart(2, '0') + ':';
    const sDisplay = String(s).padStart(2, '0');
    const msDisplay = '.' + String(ms).padStart(2, '0');

    return mDisplay + sDisplay + msDisplay;
  },

  /**
   * ใช้ easing function ตามที่กำหนด
   */
  applyEasing(progress, easing) {
    switch (easing) {
      case 'linear':
        return progress;

      case 'easeInQuad':
        return progress * progress;

      case 'easeOutQuad':
        return progress * (2 - progress);

      case 'easeInOutQuad':
        return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

      case 'easeInCubic':
        return progress * progress * progress;

      case 'easeOutCubic':
        return (--progress) * progress * progress + 1;

      case 'easeInOutCubic':
        return progress < 0.5 ? 4 * progress * progress * progress : (progress - 1) * (2 * progress - 2) * (2 * progress - 2) + 1;

      case 'easeOutExpo':
        return progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      default:
        return progress;
    }
  },

  /**
   * ตั้งค่า scroll trigger
   */
  setupScrollTrigger(instance) {
    const {element, options} = instance;

    // ถ้ามี ScrollManager
    if (window.ScrollManager) {
      const scrollManager = window.ScrollManager; // ใช้ global ScrollManager object

      try {
        // ตรวจสอบว่า ScrollManager พร้อมใช้งานไหม
        if (!scrollManager.addWaypoint) {
          throw new Error('ScrollManager.addWaypoint is not available');
        }

        // เพิ่ม waypoint
        const waypointId = 'counter_' + instance.id;

        // ลบ waypoint เก่าก่อน (ถ้ามี)
        if (instance.waypointId && scrollManager.removeWaypoint) {
          scrollManager.removeWaypoint(instance.waypointId);
        }

        // กำหนด callback ที่จะเรียกเมื่อมาถึง waypoint
        const triggerCallback = (entry) => {
          if (!instance.isComplete && !instance.isRunning) {
            // setTimeout ใช้เพื่อให้แน่ใจว่าทำงานนอก stack ของ ScrollManager
            setTimeout(() => {
              this.start(instance);
            }, 10);
          }
        };

        // ตั้งค่า waypoint ใหม่
        scrollManager.addWaypoint(waypointId, element, {
          offset: options.scrollOffset || 0,
          threshold: options.scrollThreshold || 0.5,
          once: true,
          callback: triggerCallback
        });

        // เก็บ waypoint ID
        instance.waypointId = waypointId;

        // สมัครรับฟังเหตุการณ์ scroll เพิ่มเติมเพื่อความแน่นอน
        const scrollHandler = () => {
          if (!instance.isRunning && !instance.isComplete) {
            const rect = element.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const threshold = options.scrollThreshold || 0.5;

            // คำนวณว่าเห็นองค์ประกอบได้กี่เปอร์เซ็นต์
            const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
            const percentVisible = visibleHeight / rect.height;

            if (percentVisible >= threshold) {
              this.start(instance);
              window.EventManager.off('scroll:progress', scrollHandler);
            }
          }
        };

        window.EventManager.on('scroll:progress', scrollHandler);
        instance.scrollHandler = scrollHandler;

      } catch (error) {
        console.error('Error setting up ScrollManager waypoint:', error);

        // ใช้ IntersectionObserver แทนเมื่อเกิดข้อผิดพลาด
        this.setupIntersectionObserver(instance);
      }
    } else {
      // ถ้าไม่มี ScrollManager ใช้ IntersectionObserver
      this.setupIntersectionObserver(instance);
    }
  },

  /**
   * ตั้งค่า IntersectionObserver (ใช้เมื่อไม่มี ScrollManager)
   */
  setupIntersectionObserver(instance) {
    const {element, options} = instance;

    if (!('IntersectionObserver' in window)) {
      // ถ้าไม่รองรับ IntersectionObserver ให้เริ่มนับทันที
      if (options.autostart !== false) {
        setTimeout(() => this.start(instance), options.delay || 0);
      }
      return;
    }

    // คำนวณ rootMargin
    let rootMargin = '0px';
    if (options.scrollOffset) {
      const offset = parseInt(options.scrollOffset);
      rootMargin = `${-offset}px 0px ${offset}px 0px`;
    }

    // สร้าง IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !instance.isComplete && !instance.isRunning) {
          setTimeout(() => {
            this.start(instance);

            // เลิกสังเกตการณ์หลังจากเริ่มนับแล้ว
            observer.unobserve(element);
          }, 10);
        }
      });
    }, {
      threshold: options.scrollThreshold || 0.5,
      rootMargin: rootMargin
    });

    // เริ่มสังเกตการณ์
    observer.observe(element);

    // เก็บ observer
    instance.observer = observer;
  },

  /**
   * กำหนดค่าเป้าหมายใหม่
   */
  setValue(instance, value) {
    if (!instance) return;

    // หยุด animation ปัจจุบัน
    this.stop(instance);

    // กำหนดค่าเริ่มต้นและเป้าหมายใหม่
    instance.value = instance.currentValue;
    instance.targetValue = parseFloat(value);

    // เริ่ม animation ใหม่
    this.start(instance);

    return instance;
  },

  /**
   * ดึงตัวเลือกจาก data attributes
   */
  extractOptionsFromElement(element) {
    const options = {};
    const dataset = element.dataset;

    // ลองใช้ data-props ก่อน (JSON format)
    if (dataset.props) {
      try {
        const props = JSON.parse(dataset.props);
        Object.assign(options, props);
      } catch (e) {
        console.warn('Invalid JSON in data-props:', e);
      }
    }

    // อ่านค่าจาก data-* attributes
    if (dataset.start) options.start = parseFloat(dataset.start);
    if (dataset.end) options.end = parseFloat(dataset.end);
    if (dataset.duration) options.duration = parseInt(dataset.duration);
    if (dataset.easing) options.easing = dataset.easing;
    if (dataset.format) options.format = dataset.format;
    if (dataset.countMode) options.countMode = dataset.countMode;
    if (dataset.autostart !== undefined) options.autostart = dataset.autostart !== 'false';
    if (dataset.delay) options.delay = parseInt(dataset.delay);

    // การทำงานร่วมกับ ScrollManager
    if (dataset.scrollTrigger !== undefined) options.scrollTrigger = dataset.scrollTrigger !== 'false';
    if (dataset.scrollThreshold) options.scrollThreshold = parseFloat(dataset.scrollThreshold);
    if (dataset.scrollOffset) options.scrollOffset = parseInt(dataset.scrollOffset);

    if (dataset.decimalPlaces) options.decimalPlaces = parseInt(dataset.decimalPlaces);
    if (dataset.prefix) options.prefix = dataset.prefix;
    if (dataset.suffix) options.suffix = dataset.suffix;
    if (dataset.separator) options.separator = dataset.separator;
    if (dataset.decimal) options.decimal = dataset.decimal;
    if (dataset.currencySymbol) options.currencySymbol = dataset.currencySymbol;

    // การแสดงผลพิเศษ
    if (dataset.animation) options.animation = dataset.animation;
    if (dataset.template) options.template = dataset.template;

    return options;
  },

  /**
   * ค้นหา instance จาก element
   */
  getInstance(element) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }

    if (!element) return null;

    // ดูจาก counterInstance ที่เก็บไว้ใน element
    if (element.counterInstance) {
      return element.counterInstance;
    }

    // ตรวจสอบจาก data-counter-component-id
    const id = element.dataset.counterComponentId;
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
   * ส่งเหตุการณ์
   */
  dispatchEvent(instance, eventName, detail = {}) {
    if (!instance.element) return;

    const event = new CustomEvent(`counter:${eventName}`, {
      bubbles: true,
      cancelable: true,
      detail: {
        instance,
        ...detail
      }
    });

    instance.element.dispatchEvent(event);

    // ส่งผ่าน EventManager ถ้ามี
    EventManager.emit(`counter:${eventName}`, {
      instance,
      ...detail
    });
  },

  /**
   * ลบ instance
   */
  destroy(instance) {
    if (typeof instance === 'string') {
      instance = this.state.instances.get(instance);
    } else if (instance instanceof HTMLElement) {
      instance = this.getInstance(instance);
    }

    if (!instance) return false;

    // หยุด animation
    this.stop(instance);

    // ยกเลิก waypoint ถ้ามี
    if (instance.waypointId && window.ScrollManager?.removeWaypoint) {
      try {
        window.ScrollManager.removeWaypoint(instance.waypointId);
      } catch (e) {
        console.error('Error removing waypoint:', e);
      }
    }

    // ยกเลิก scroll handler ถ้ามี
    if (instance.scrollHandler) {
      window.EventManager.off('scroll:progress', instance.scrollHandler);
    }

    // ยกเลิก observer ถ้ามี
    if (instance.observer) {
      instance.observer.disconnect();
      instance.observer = null;
    }

    // ล้างข้อมูล
    if (instance.element) {
      delete instance.element.counterInstance;
      delete instance.element.dataset.counterComponentId;
    }

    // แจ้งเหตุการณ์ destroy
    this.dispatchEvent(instance, 'destroy');

    // ลบจาก Map
    if (instance.id) {
      this.state.instances.delete(instance.id);
    }

    return true;
  },

  /**
   * ลบทุก instance และทำความสะอาด
   */
  destroyAll() {
    Array.from(this.state.instances.values()).forEach(instance => {
      this.destroy(instance);
    });

    this.state.instances.clear();
  }
};

/**
* ลงทะเบียน Component กับ ComponentManager
*/
if (window.ComponentManager) {
  const counterComponentDefinition = {
    name: 'counter',
    template: null,

    validElement(element) {
      return element.classList.contains('counter-component') ||
        element.dataset.component === 'counter' ||
        element.hasAttribute('data-start') ||
        element.hasAttribute('data-end');
    },

    setupElement(element, state) {
      const options = CounterComponent.extractOptionsFromElement(element);
      const counterInstance = CounterComponent.create(element, options);

      element._counterComponent = counterInstance;
      return element;
    },

    beforeDestroy() {
      if (this.element && this.element._counterComponent) {
        CounterComponent.destroy(this.element._counterComponent);
        delete this.element._counterComponent;
      }
    }
  };

  ComponentManager.define('counter', counterComponentDefinition);
}

/**
* ลงทะเบียน CounterComponent กับ Now.js framework
*/
if (window.Now?.registerManager) {
  Now.registerManager('counter', CounterComponent);
}

// Expose globally
window.CounterComponent = CounterComponent;
