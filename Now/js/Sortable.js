class Sortable {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      draggable: '[draggable="true"]',
      handle: null,
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      dataIdAttr: 'data-id',
      forceFallback: false,
      fallbackTolerance: 0,
      scroll: true,
      scrollSensitivity: 30,
      scrollSpeed: 10,
      rtl: document.dir === 'rtl',
      disabled: false,
      ...options
    };

    this.state = {
      dragging: null,
      ghost: null,
      initialIndex: -1,
      scrollInterval: null,
      dragStartEvent: null
    };

    this.init();
  }

  init() {
    if (this.options.disabled) return;

    this.handlers = {
      dragStart: this.handleDragStart.bind(this),
      dragOver: this.handleDragOver.bind(this),
      dragEnd: this.handleDragEnd.bind(this),
      keyDown: this.handleKeyDown.bind(this)
    };

    this.addEventListeners();
  }

  addEventListeners() {
    const options = {passive: false};

    this.element.addEventListener('mousedown', this.handlers.dragStart);
    this.element.addEventListener('touchstart', this.handlers.dragStart, options);
    this.element.addEventListener('keydown', this.handlers.keyDown);

    if (this.options.scroll) {
      window.addEventListener('scroll', this.handleScroll.bind(this), {passive: true});
    }
  }

  handleDragStart(e) {
    try {
      if (this.options.disabled || (e.button !== undefined && e.button !== 0)) {
        return;
      }

      const dragEl = this.getDragElement(e);
      if (!dragEl) return;

      e.preventDefault();

      this.state.dragging = dragEl;
      this.state.initialIndex = this.getIndex(dragEl);
      this.state.dragStartEvent = e;

      this.createGhost(dragEl, e);

      dragEl.classList.add(this.options.dragClass);

      document.addEventListener('mousemove', this.handlers.dragOver);
      document.addEventListener('touchmove', this.handlers.dragOver);
      document.addEventListener('mouseup', this.handlers.dragEnd);
      document.addEventListener('touchend', this.handlers.dragEnd);

      if (typeof this.options.onStart === 'function') {
        this.options.onStart({
          item: dragEl,
          startIndex: this.state.initialIndex,
          event: e
        });
      }

      this.dispatchEvent('start', {
        item: dragEl,
        startIndex: this.state.initialIndex
      });

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'Sortable.dragStart',
        type: 'error:sortable',
      });
      this.handleDragEnd();
    }
  }

  handleDragOver(e) {
    if (!this.state.dragging) return;
    e.preventDefault();

    requestAnimationFrame(() => {
      try {
        const point = e.touches ? e.touches[0] : e;

        this.moveGhost(point.pageX, point.pageY);

        if (this.options.scroll) {
          this.handleScrolling(point);
        }

        const overEl = this.findElementUnderPoint(point.pageX, point.pageY);
        if (overEl && overEl !== this.state.dragging) {
          const newIndex = this.getIndex(overEl);

          if (newIndex !== this.getIndex(this.state.dragging)) {
            this.swapElements(this.state.dragging, overEl);

            this.dispatchEvent('change', {
              item: this.state.dragging,
              newIndex,
              oldIndex: this.state.initialIndex
            });
          }
        }

      } catch (error) {
        ErrorManager.handle(error, {
          context: 'Sortable.dragOver',
          type: 'error:sortable',
        });
        this.handleDragEnd();
      }
    });
  }

  handleDragEnd() {
    if (!this.state.dragging) return;

    try {
      const dragEl = this.state.dragging;
      const newIndex = this.getIndex(dragEl);
      const oldIndex = this.state.initialIndex;

      dragEl.classList.remove(this.options.dragClass);

      if (this.state.ghost) {
        this.state.ghost.remove();
      }

      if (this.state.scrollInterval) {
        clearInterval(this.state.scrollInterval);
      }

      document.removeEventListener('mousemove', this.handlers.dragOver);
      document.removeEventListener('touchmove', this.handlers.dragOver);
      document.removeEventListener('mouseup', this.handlers.dragEnd);
      document.removeEventListener('touchend', this.handlers.dragEnd);

      if (typeof this.options.onEnd === 'function') {
        this.options.onEnd({
          item: dragEl,
          newIndex,
          oldIndex,
          event: this.state.dragStartEvent
        });
      }

      this.dispatchEvent('end', {
        item: dragEl,
        newIndex,
        oldIndex
      });

      this.state = {
        dragging: null,
        ghost: null,
        initialIndex: -1,
        scrollInterval: null,
        dragStartEvent: null
      };

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'Sortable.dragEnd',
        type: 'error:sortable',
      });
    }
  }

  handleKeyDown(e) {
    if (this.options.disabled) return;

    const target = e.target;
    if (!target.matches(this.options.draggable)) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.moveElement(target, -1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.moveElement(target, 1);
        break;
      case 'Space':
        e.preventDefault();
        this.toggleSelection(target);
        break;
    }
  }

  handleScrolling(point) {
    const sensitivity = this.options.scrollSensitivity;
    const speed = this.options.scrollSpeed;

    const scrollTop = window.pageYOffset;
    let scrolling = false;
    let direction = 0;

    if (point.pageY - scrollTop < sensitivity) {
      direction = -1;
      scrolling = true;
    } else if ((window.innerHeight + scrollTop) - point.pageY < sensitivity) {
      direction = 1;
      scrolling = true;
    }

    if (scrolling && !this.state.scrollInterval) {
      this.state.scrollInterval = setInterval(() => {
        window.scrollBy(0, speed * direction);
      }, 16);
    } else if (!scrolling && this.state.scrollInterval) {
      clearInterval(this.state.scrollInterval);
      this.state.scrollInterval = null;
    }
  }

  handleScroll(e) {
    if (!this.state.dragging) return;

    const point = e.touches ? e.touches[0] : e;
    const sensitivity = this.options.scrollSensitivity;
    const speed = this.options.scrollSpeed;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;

    let scrolling = false;
    let direction = 0;

    const topDist = point.pageY - scrollTop;
    const bottomDist = windowHeight - (point.pageY - scrollTop);

    if (topDist < sensitivity) {
      direction = -1;
      scrolling = true;
    } else if (bottomDist < sensitivity) {
      direction = 1;
      scrolling = true;
    }

    if (scrolling && !this.state.scrollInterval) {
      this.state.scrollInterval = setInterval(() => {
        window.scrollBy({
          top: speed * direction,
          behavior: 'smooth'
        });

        if (this.state.ghost) {
          this.moveGhost(
            point.pageX,
            point.pageY + (speed * direction)
          );
        }
      }, 16);
    }
    else if (!scrolling && this.state.scrollInterval) {
      clearInterval(this.state.scrollInterval);
      this.state.scrollInterval = null;
    }
  }

  getDragElement(e) {
    const target = e.target;

    if (this.options.handle) {
      const handle = target.closest(this.options.handle);
      return handle ? handle.closest(this.options.draggable) : null;
    }

    return target.closest(this.options.draggable);
  }

  createGhost(dragEl, e) {
    const ghost = dragEl.cloneNode(true);
    ghost.classList.add(this.options.ghostClass);

    const rect = dragEl.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    this.state.mouseOffset = {
      x: e.pageX - (rect.left + scrollLeft),
      y: e.pageY - (rect.top + scrollTop)
    };

    Object.assign(ghost.style, {
      position: 'absolute',
      top: e.pageY - this.state.mouseOffset.y + 'px',
      left: e.pageX - this.state.mouseOffset.x + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      zIndex: 9999,
      pointerEvents: 'none'
    });

    document.body.appendChild(ghost);
    this.state.ghost = ghost;
  }

  moveGhost(pageX, pageY) {
    if (!this.state.ghost) return;

    requestAnimationFrame(() => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      let left = pageX - this.state.mouseOffset.x + scrollLeft;
      let top = pageY - this.state.mouseOffset.y + scrollTop;

      if (this.options.rtl) {
        left = window.innerWidth - left - this.state.ghost.offsetWidth;
      }

      Object.assign(this.state.ghost.style, {
        position: 'fixed',
        left: left + 'px',
        top: top + 'px',
        zIndex: 9999
      });
    });
  }

  findElementUnderPoint(x, y) {
    const elements = Array.from(this.element.querySelectorAll(this.options.draggable));

    for (const el of elements) {
      if (el === this.state.dragging) continue;

      const rect = el.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      if (x >= rect.left + scrollLeft &&
        x <= rect.right + scrollLeft &&
        y >= rect.top + scrollTop &&
        y <= rect.bottom + scrollTop) {
        return el;
      }
    }

    return null;
  }

  getIndex(el) {
    return Array.from(this.element.querySelectorAll(this.options.draggable))
      .indexOf(el);
  }

  swapElements(el1, el2) {
    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();

    el1.style.transition = 'none';
    el2.style.transition = 'none';

    el1.style.transform = `translate(${rect2.left - rect1.left}px, ${rect2.top - rect1.top}px)`;
    el2.style.transform = `translate(${rect1.left - rect2.left}px, ${rect1.top - rect2.top}px)`;

    requestAnimationFrame(() => {
      el1.style.transform = '';
      el2.style.transform = '';

      el1.style.transition = '';
      el2.style.transition = '';

      const next2 = el2.nextSibling;
      const parent2 = el2.parentNode;

      el1.parentNode.insertBefore(el2, el1);
      parent2.insertBefore(el1, next2);
    });
  }

  moveElement(el, direction) {
    const elements = Array.from(this.element.querySelectorAll(this.options.draggable));
    const index = elements.indexOf(el);
    const newIndex = index + direction;

    if (newIndex >= 0 && newIndex < elements.length) {
      const target = elements[newIndex];
      this.swapElements(el, target);

      el.focus();

      this.dispatchEvent('change', {
        item: el,
        newIndex,
        oldIndex: index
      });
    }
  }

  toggleSelection(el) {
    el.classList.toggle('selected');

    this.dispatchEvent('select', {
      item: el,
      selected: el.classList.contains('selected')
    });
  }

  dispatchEvent(name, detail) {
    this.element.dispatchEvent(new CustomEvent('sortable:' + name, {
      bubbles: true,
      cancelable: true,
      detail
    }));
  }

  enable() {
    this.options.disabled = false;
  }

  disable() {
    this.options.disabled = true;

    if (this.state.dragging) {
      this.handleDragEnd();
    }
  }

  destroy() {
    this.element.removeEventListener('mousedown', this.handlers.dragStart);
    this.element.removeEventListener('touchstart', this.handlers.dragStart);
    this.element.removeEventListener('keydown', this.handlers.keyDown);

    if (this.options.scroll) {
      window.removeEventListener('scroll', this.handleScroll);
    }

    this.state = {
      dragging: null,
      ghost: null,
      initialIndex: -1,
      scrollInterval: null,
      dragStartEvent: null
    };

    this.element = null;
    this.options = null;
    this.handlers = null;
  }
}

window.Sortable = Sortable;