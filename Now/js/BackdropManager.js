const BackdropManager = {
  config: {
    baseZIndex: 990,
    animation: true,
    duration: 200,
    className: 'backdrop',
    background: 'rgba(0,0,0,0.5)',
    opacity: 0.5,
    useTransition: true,
    preventScroll: true,
    debug: false
  },

  state: {
    backdrops: new Map(),
    activeBackdrops: [],
    nextId: 1,
    isInitialized: false
  },

  async init(options = {}) {
    if (this.state.isInitialized) return this;

    this.config = {...this.config, ...options};
    this.handleKeydown = this.handleKeydown.bind(this);

    document.addEventListener('keydown', this.handleKeydown);

    this.state.isInitialized = true;
    return this;
  },

  createBackdropElement(targetElement, options) {
    const backdrop = document.createElement('div');
    backdrop.className = `${this.config.className} ${options.className || ''}`.trim();
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('role', 'presentation');

    const styles = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: options.background || this.config.background,
      opacity: 0,
      pointerEvents: 'auto',
      zIndex: options.zIndex || this.config.baseZIndex
    };

    if (this.config.useTransition) {
      styles.transition = `opacity ${this.config.duration}ms`;
    }

    Object.assign(backdrop.style, styles);

    if (targetElement?.parentNode) {
      targetElement.parentNode.insertBefore(backdrop, targetElement);
    } else {
      document.body.appendChild(backdrop);
    }

    return backdrop;
  },

  show(element, onClick = null, options = {}) {
    try {
      const id = this.state.nextId++;

      const backdropOptions = {
        ...this.config,
        ...options,
        zIndex: this.config.baseZIndex + (this.state.activeBackdrops.length * 10)
      };

      const backdropData = {
        id,
        element: this.createBackdropElement(element, backdropOptions),
        targetElement: element,
        onClick,
        options: backdropOptions
      };

      if (onClick) {
        backdropData.element.addEventListener('click', onClick);
      }

      this.state.backdrops.set(id, backdropData);
      this.state.activeBackdrops.push(id);

      if (backdropOptions.preventScroll) {
        document.body.style.overflow = 'hidden';
      }

      requestAnimationFrame(() => {
        backdropData.element.style.opacity = backdropOptions.opacity;
      });

      return id;
    } catch (error) {
      console.error('Error showing backdrop:', error);
      return null;
    }
  },

  hide(id) {
    try {
      const backdropData = this.state.backdrops.get(id);
      if (!backdropData) return;

      backdropData.element.style.opacity = 0;

      const cleanup = () => {
        if (backdropData.onClick) {
          backdropData.element.removeEventListener('click', backdropData.onClick);
        }

        backdropData.element.remove();
        this.state.backdrops.delete(id);

        const index = this.state.activeBackdrops.indexOf(id);
        if (index > -1) {
          this.state.activeBackdrops.splice(index, 1);
        }

        if (this.state.activeBackdrops.length === 0) {
          document.body.style.overflow = '';
        }
      };

      if (this.config.useTransition) {
        setTimeout(cleanup, this.config.duration);
      } else {
        cleanup();
      }
    } catch (error) {
      console.error('Error hiding backdrop:', error);
    }
  },

  update(element, options = {}) {
    const backdropData = this.state.backdrops.get(element);
    if (!backdropData) return;

    const backdrop = backdropData.element;
    const newOptions = {...backdropData.options, ...options};

    backdrop.style.background = newOptions.background;
    backdrop.style.opacity = this.state.activeBackdrops.indexOf(backdropData) !== -1 ?
      newOptions.opacity : '0';
    backdrop.style.zIndex = newOptions.zIndex;

    backdropData.options = newOptions;
  },

  hideAll() {
    [...this.state.activeBackdrops].forEach(id => this.hide(id));
  },


  handleKeydown(event) {
    if (event.key === 'Escape' && this.state.activeBackdrops.length > 0) {
      const lastId = this.state.activeBackdrops[this.state.activeBackdrops.length - 1];
      this.hide(lastId);
    }
  },

  getBackdropById(id) {
    for (const backdropData of this.state.backdrops.values()) {
      if (backdropData.id === id) {
        return backdropData.element;
      }
    }
    return null;
  },

  isActive(element) {
    const backdropData = this.state.backdrops.get(element);
    return backdropData && this.state.activeBackdrops.includes(backdropData);
  },

  destroy() {
    this.hideAll();
    document.removeEventListener('keydown', this.handleKeydown);
    this.state.isInitialized = false;
  }
};

if (window.Now?.registerManager) {
  Now.registerManager('backdrop', BackdropManager);
}

window.BackdropManager = BackdropManager;
