const MenuManager = {
  config: {
    breakpoint: 768,
    animationDuration: 100,
    touchThreshold: 100,

    accessibility: {
      enabled: true,
      announceChanges: true,
      smoothFocus: true,
      focusableSelectors: 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      focusFirstItemOnOpen: true,
      returnFocusOnClose: true,
      horizontalNavigation: {
        arrowKeysOpenSubmenu: true,
        arrowKeysNavigateSiblings: true
      }
    },

    performance: {
      useRequestAnimationFrame: true,
      touchOptimization: true,
    },

    observerOptions: {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    },

    hover: {
      openDelay: 100,
      closeDelay: 300
    }
  },

  state: {
    initialized: false,
    menus: new Map(),
    handlers: new Map(),
    observer: null,
    announcer: null
  },

  async init(options = {}) {
    try {
      if (this.state.initialized) return this;

      this.config = Now.mergeConfig(this.config, options);

      this.state = {
        initialized: false,
        menus: new Map(),
        handlers: new Map(),
        observer: null,
        announcer: null
      };

      this.initializeExistingMenus();
      this.setupMutationObserver();

      if (window.EventManager?.on) {
        EventManager.on('route:changed', () => {
          try {
            this.updateActiveMenu();
            this.setupAutoExpand();

            // Close mobile menus on route change
            this.state.menus.forEach(menu => {
              if (menu.isMobile && menu.isOpen) {
                this.closeMenu(menu);
              }
            });
          } catch (error) {
            ErrorManager.handle('Route change handler failed', {
              context: 'MenuManager.routeHandler',
              data: {error}
            })
          }
        });
      }

      this.state.initialized = true;
      return this;
    } catch (error) {
      throw ErrorManager.handle('MenuManager initialization failed', {
        context: 'MenuManager.init',
        data: {error}
      })
    }
  },

  initializeExistingMenus() {
    // Only initialize elements explicitly marked as menu components
    document.querySelectorAll('[data-component="menu"]').forEach(element => {
      this.createMenu(element);
    });
    this.updateActiveMenu();
    this.setupAutoExpand();
  },

  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach(node => {
          if (node.nodeType === 1) {
            const menuId = node.dataset.menuId;
            if (menuId && this.state.menus.has(menuId)) {
              this.destroyMenu(menuId);
            }
          }
        });

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // If an added node is a menu component or contains one, reinitialize
            if (node.matches('[data-component="menu"]') || node.querySelector('[data-component="menu"]')) {
              this.initializeExistingMenus();
            }

            // Check if the added node is a menu-toggle or contains one
            const toggleButtons = [];
            if (node.matches('.menu-toggle')) {
              toggleButtons.push(node);
            }
            if (node.querySelectorAll) {
              toggleButtons.push(...node.querySelectorAll('.menu-toggle'));
            }

            // Bind newly added toggle buttons to their corresponding menus
            toggleButtons.forEach(toggle => {
              // Skip if already bound (has event listener marker)
              if (toggle.dataset.menuBound) return;

              // Determine which menu this toggle belongs to
              let menuLevel = null;
              if (toggle.classList.contains('topmenu-toggle')) {
                menuLevel = 'topmenu';
              } else if (toggle.classList.contains('sidemenu-toggle')) {
                menuLevel = 'sidemenu';
              }

              if (menuLevel) {
                // Find the corresponding menu
                this.state.menus.forEach(menu => {
                  if ((menuLevel === 'topmenu' && menu.element.classList.contains('topmenu')) ||
                    (menuLevel === 'sidemenu' && menu.element.classList.contains('sidemenu'))) {

                    // Initialize toggleButtons array if it doesn't exist
                    if (!menu.elements.toggleButtons) {
                      menu.elements.toggleButtons = [];
                    }

                    // Add to the toggleButtons array if not already there
                    if (!menu.elements.toggleButtons.includes(toggle)) {
                      menu.elements.toggleButtons.push(toggle);
                    }

                    // Set attributes
                    toggle.setAttribute('aria-haspopup', 'true');
                    toggle.setAttribute('aria-controls', menu.element.id || `menu-${menu.id}`);
                    toggle.setAttribute('role', 'menuitem');
                    toggle.setAttribute('aria-expanded', menu.isOpen ? 'true' : 'false');
                    toggle.setAttribute('aria-label', Now.translate(menu.isOpen ? 'Close menu' : 'Open menu'));

                    // Bind the toggle handler
                    if (menu.handlers.toggle) {
                      toggle.addEventListener('click', menu.handlers.toggle);
                      toggle.dataset.menuBound = 'true';
                    }

                    // Update primary toggle reference if this is the first one
                    if (!menu.elements.toggle) {
                      menu.elements.toggle = toggle;
                      menu.elements.close = toggle;
                    }
                  }
                });
              }
            });
          }
        });

      });
    });

    this.observer.observe(document.body, this.config.observerOptions);
  },

  updateActiveMenu(path) {
    //If not specify the path, use the current Path.
    const currentPath = path || window.location.pathname;
    const currentHash = window.location.hash;

    // Keep the original state for comparison
    const previousActive = document.querySelectorAll('.sidemenu .active, .topmenu .active');
    let activeChanged = false;

    const utils = {
      cleanUrl: (url) => {
        let clean = url.split('?')[0].split('#')[0];
        clean = clean.replace(/\/+$/, '');
        return clean;
      },

      comparePaths: (linkPath, currentPath) => {
        const cleanLinkPath = utils.cleanUrl(linkPath);
        const cleanCurrentPath = utils.cleanUrl(currentPath);
        return cleanLinkPath === cleanCurrentPath;
      },

      setActiveState: (link, isActive = true) => {
        const wasActive = link.classList.contains('active');

        if (isActive) {
          if (!wasActive) activeChanged = true;
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');

          //Open Parent Submenus
          let parent = link.parentElement;
          while (parent) {
            if (parent.tagName === 'UL' && parent.hasAttribute('aria-hidden')) {
              parent.setAttribute('aria-hidden', 'false');
              if (parent.toggle) {
                parent.toggle.setAttribute('aria-expanded', 'true');
              }
            }
            parent = parent.parentElement;
          }
        } else {
          if (wasActive) activeChanged = true;
          link.classList.remove('active');
          link.removeAttribute('aria-current');
        }

        return isActive;
      }
    };

    // Wash all the original Active State
    previousActive.forEach(link => {
      utils.setActiveState(link, false);
    });

    // Find a links that match the current path.
    const activeLinks = [];
    document.querySelectorAll('.sidemenu a[href], .topmenu a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;

      // Check the hash first.
      if (currentHash && href.includes('#')) {
        const linkHash = href.split('#')[1];
        const currentHashValue = currentHash.substring(1);
        if (linkHash === currentHashValue) {
          if (utils.setActiveState(link)) {
            activeLinks.push(link);
          }
          return;
        }
      }

      // Check the path
      if (utils.comparePaths(href, currentPath)) {
        if (utils.setActiveState(link)) {
          activeLinks.push(link);
        }
      }
    });

    // If no exact match is found, find the best match
    if (activeLinks.length === 0) {
      let bestMatch = null;
      let bestMatchLength = 0;

      document.querySelectorAll('.sidemenu a[href], .topmenu a[href]').forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        const cleanHref = utils.cleanUrl(href);
        const cleanCurrentPath = utils.cleanUrl(currentPath);

        if (cleanCurrentPath.startsWith(cleanHref) && cleanHref.length > bestMatchLength) {
          bestMatch = link;
          bestMatchLength = cleanHref.length;
        }
      });

      if (bestMatch) {
        utils.setActiveState(bestMatch);
        activeLinks.push(bestMatch);
      }
    }

    // Notify Event when there is a change.
    if (activeChanged) {
      Now.emit('menu:activeChanged', {
        path: currentPath,
        hash: currentHash,
        activeLinks,
        previousActive: Array.from(previousActive)
      });
    }

    return activeLinks;
  },

  setupAutoExpand() {
    if (window.innerWidth >= this.config.breakpoint) {
      document.querySelectorAll('.sidemenu [aria-haspopup="true"], .topmenu [aria-haspopup="true"]').forEach(item => {
        const submenu = item.querySelector('ul');
        if (!submenu) return;

        item.addEventListener('mouseenter', () => {
          if (!item.hasAttribute('aria-expanded') || item.getAttribute('aria-expanded') === 'false') {
            item.setAttribute('aria-expanded', 'true');
            this.checkAndAdjustPosition(submenu);
          }
        });

        item.addEventListener('mouseleave', () => {
          setTimeout(() => {
            if (!item.querySelector('.active')) {
              item.setAttribute('aria-expanded', 'false');
            }
          }, this.config.animationDuration);
        });
      });
    }
  },

  async createMenu(element) {
    try {
      if (element.dataset.menuId) return null;

      const menuId = Utils.generateUUID();
      element.dataset.menuId = menuId;
      const menu = this.initializeMenuInstance(element, menuId);
      this.setupMenuElements(menu);
      this.setupAriaForNestedMenu(menu, menu.elements.container);
      this.setupMenuHandlers(menu);
      this.setupAccessibility(menu);
      this.checkResponsiveState(menu, true);
      this.state.menus.set(menuId, menu);

      return menu;

    } catch (error) {
      this.handleError('Menu creation failed', error, 'error:menu');
      return null;
    }
  },

  // ใน MenuManager
  handleClick(event) {
    const menuItem = event.target.closest('.menu-item');
    if (!menuItem) return;

    // ถ้าเป็น link ที่มี href ให้ RouterManager จัดการ
    if (menuItem.tagName === 'A' && menuItem.hasAttribute('href')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // จัดการ menu click ตามปกติ
    this.toggleMenu(menu);
  },

  initializeMenuInstance(element, menuId) {
    return {
      id: menuId,
      element: element,
      isOpen: false,
      isMobile: false,
      position: element.classList.contains('menu-left') ? 'left' : 'right',
      isSidebar: element.classList.contains('sidemenu'),
      touchData: null,
      elements: {},
      handlers: {}
    };
  },

  setupMenuElements(menu) {
    const container = menu.element.querySelector('ul');
    const menuParent = menu.element.parentNode;
    menu.elements.container = container;
    menu.elements.submenus = [];
    container.setAttribute('role', 'menubar');

    let menuLevel = null;
    if (menu.element.classList.contains('topmenu')) {
      menuLevel = menu.element.classList.contains('responsive-menu') ? 'topmenu' : null;
    } else if (menu.element.classList.contains('sidemenu')) {
      menuLevel = 'sidemenu';
    }

    if (menuLevel) {
      container.setAttribute('aria-label', Now.translate('Main navigation'));

      const nav = document.querySelector(`.${menuLevel}`);
      if (nav) {
        // Use querySelectorAll to get ALL toggle buttons
        let toggleButtons = document.querySelectorAll(`.${menuLevel}-toggle`);

        // If no toggle buttons found and it's topmenu, create one
        if (toggleButtons.length === 0 && menuLevel === 'topmenu') {
          const close = document.createElement('button');
          close.type = 'button';
          close.className = `menu-toggle ${menuLevel}-toggle runtime`;
          close.innerHTML = `
          <span class="toggle-icon">
            <span class="toggle-bar"></span>
            <span class="toggle-bar"></span>
            <span class="toggle-bar"></span>
          </span>`;
          container.parentElement.parentElement.insertBefore(close, menu.element);
          toggleButtons = [close];
        }

        // Store all toggle buttons and set attributes for all of them
        if (toggleButtons.length > 0) {
          menu.elements.toggleButtons = Array.from(toggleButtons);

          // Set attributes for all toggle buttons
          toggleButtons.forEach(toggle => {
            toggle.setAttribute('aria-haspopup', 'true');
            toggle.setAttribute('aria-controls', menu.element.id || `menu-${menu.id}`);
            toggle.setAttribute('role', 'menuitem');
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', Now.translate('Close menu'));
            // Mark as bound to prevent MutationObserver from rebinding
            toggle.dataset.menuBound = 'true';
          });

          // Keep first one as primary toggle for backward compatibility
          menu.elements.toggle = toggleButtons[0];
          menu.elements.close = toggleButtons[0];
        }
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'menu-backdrop';
      menuParent.insertBefore(backdrop, menu.element);
      menu.elements.backdrop = backdrop;

      // menu-open is now split into topmenu-open and sidemenu-close
      if (menu.element.classList.contains('sidemenu')) {
        menu.isOpen = document.body.classList.contains('sidemenu-close');
      } else {
        menu.isOpen = document.body.classList.contains('topmenu-open');
      }
    }

    if (!menu.element.id) {
      menu.element.id = `menu-${menu.id}`;
    }
  },

  setupAriaForNestedMenu(menu, ul) {
    const menuItems = ul.querySelectorAll(':scope > li');
    menuItems.forEach((menuItem) => {
      menuItem.setAttribute('role', 'none');

      const submenu = menuItem.querySelector(':scope > ul');
      if (submenu) {
        const menuId = submenu.id || `submenu-${Utils.generateUUID()}`;
        submenu.id = menuId;
        submenu.setAttribute('role', 'menu');
        submenu.setAttribute('aria-label', Now.translate('Submenu'));
        submenu.setAttribute('aria-orientation', 'vertical');

        const button = menuItem.querySelector('button');
        if (button) {
          button.setAttribute('role', 'menuitem');
          button.setAttribute('aria-haspopup', 'true');
          button.setAttribute('aria-expanded', 'false');
          button.setAttribute('aria-controls', menuId);
          button.content = submenu;
          menu.elements.submenus.push(button);
          submenu.toggle = button;
        }

        this.setupAriaForNestedMenu(menu, submenu);
      } else {
        const link = menuItem.querySelector('a');
        if (link) {
          link.setAttribute('role', 'menuitem');
        }
      }
    });
  },

  checkAndAdjustPosition(submenu) {
    const rect = submenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (rect.right > viewportWidth) {
      submenu.style.left = 'auto';
      submenu.style.right = '100%';
    } else {
      submenu.style.left = '';
      submenu.style.right = '';
    }

    if (rect.bottom > viewportHeight) {
      const overflowAmount = rect.bottom - viewportHeight;
      submenu.style.top = `${-overflowAmount}px`;
    } else {
      submenu.style.top = '';
    }
  },

  setupMenuHandlers(menu) {
    // Use event delegation: attach a small set of handlers on the menu root
    try {
      menu.handlers.toggle = (e) => {
        e.stopPropagation();
        // Prevent toggling the main sidemenu if a submenu is expanded
        if (menu.element.classList.contains('sidemenu') && document.body.classList.contains('sidemenu-sub-expanded')) {
          return;
        }
        this.toggleMenu(menu);
      };

      if (menu.elements) {
        // Bind toggle handler to ALL toggle buttons
        if (menu.elements.toggleButtons && menu.elements.toggleButtons.length > 0) {
          menu.elements.toggleButtons.forEach(toggleBtn => {
            toggleBtn.addEventListener('click', menu.handlers.toggle);
          });
        }
        // Backward compatibility: also bind to single toggle if it exists
        else if (menu.elements.toggle) {
          menu.elements.toggle.addEventListener('click', menu.handlers.toggle);
        }

        if (menu.elements.close && !menu.elements.toggleButtons) {
          menu.elements.close.addEventListener('click', menu.handlers.toggle);
        }
        if (menu.elements.backdrop) {
          menu.elements.backdrop.addEventListener('click', menu.handlers.toggle);
        }

        menu.elements.submenus.forEach(submenu => {
          submenu.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (btn && btn.getAttribute('aria-haspopup') === 'true') {
              e.preventDefault();
              e.stopPropagation();
              if (menu.elements.container.getAttribute('aria-orientation') === 'vertical') {
                this.toggleSubmenu(menu, submenu, false);
              }
            }
          });
        });
      }

      const touchHandlers = {
        start: (e) => {
          menu.touchData = {
            startX: e.touches[0].clientX,
            startY: e.touches[0].clientY,
            startTime: Date.now(),
            isScrolling: null
          };
        },

        move: (e) => {
          if (!menu.touchData || !menu.isOpen) return;

          const touchData = menu.touchData;
          const touch = e.touches[0];
          const deltaX = touch.clientX - touchData.startX;
          const deltaY = touch.clientY - touchData.startY;

          if (touchData.isScrolling === null) {
            touchData.isScrolling = Math.abs(deltaY) > Math.abs(deltaX);
          }

          if (touchData.isScrolling) return;

          if ((menu.position === 'right' && deltaX > 0) ||
            (menu.position === 'left' && deltaX < 0)) {
            requestAnimationFrame(() => {
              menu.elements.container.style.transform = `translateX(${deltaX}px)`;
            });
          }
        },

        end: (e) => {
          if (!menu.touchData) return;

          const touchData = menu.touchData;
          const touch = e.changedTouches[0];
          const deltaX = touch.clientX - touchData.startX;
          const deltaTime = Date.now() - touchData.startTime;
          const velocity = Math.abs(deltaX) / deltaTime;

          menu.element.style.transform = '';

          if (!touchData.isScrolling &&
            (Math.abs(deltaX) > this.config.touchThreshold ||
              velocity > 0.3)) {
            this.closeMenu(menu);
          }

          menu.touchData = null;
        },

        cancel: () => {
          if (menu.touchData) {
            menu.elements.element.style.transform = '';
            menu.touchData = null;
          }
        }
      };

      menu.element.addEventListener('touchstart', touchHandlers.start, {
        passive: true
      });

      menu.element.addEventListener('touchmove', touchHandlers.move, {
        passive: true
      });

      menu.element.addEventListener('touchend', touchHandlers.end, {
        passive: true
      });

      menu.element.addEventListener('touchcancel', touchHandlers.cancel, {
        passive: true
      });

      menu.handlers.touch = touchHandlers;

      menu.handlers.keydown = (e) => this.handleKeyboardNavigation(menu, e);
      document.addEventListener('keydown', menu.handlers.keydown);

      if (!menu.isMobile && menu.element.classList.contains('topmenu')) {
        this.setupHoverHandlers(menu);
      }

      menu.handlers.resize = () => this.checkResponsiveState(menu);
      window.addEventListener('resize', menu.handlers.resize);

      if (menu.element.classList.contains('topmenu')) {
        menu.handlers.focusout = (e) => {
          requestAnimationFrame(() => {
            const currentFocus = document.activeElement;
            const currentTopLi = currentFocus?.closest('.topmenu > ul > li');
            const originalTopLi = e.target?.closest('.topmenu > ul > li');
            if (!currentTopLi || currentTopLi !== originalTopLi) {
              this.closeAllSubmenus(menu);
            }
          });
        };

        menu.element.addEventListener('focusout', menu.handlers.focusout);
      }
    } catch (error) {
      ErrorManager.handle('Failed to setup menu handlers', {
        context: 'MenuManager.setupMenuHandlers',
        data: {
          menuId: menu.id,
          error
        },
      });
    }
  },

  toggleMenu(menu) {
    if (menu.isOpen) {
      this.closeMenu(menu);
    } else {
      this.openMenu(menu);
    }
  },

  async openMenu(menu) {
    if (menu.isOpen) return;

    const focusableElements = menu.element.querySelectorAll(this.config.accessibility.focusableSelectors);
    focusableElements.forEach(el => {
      el.removeAttribute('tabindex');
    });

    menu.isOpen = true;
    if (menu.element.classList.contains('sidemenu')) {
      document.body.classList.add('sidemenu-close');
    } else {
      document.body.classList.add('topmenu-open');
    }
    if (menu.elements?.toggle) {
      menu.elements.toggle.setAttribute('aria-expanded', 'true');
      menu.elements.toggle.setAttribute('aria-label', Now.translate('Close menu'));
    }

    if (this.config.accessibility.announceChanges) {
      const topLevelItems = menu.element.querySelector(':scope > ul')
        ?.querySelectorAll(':scope > li > [role="menuitem"]').length || 0;
      this.announce('{Open menu}, There are {count} items in total', {count: topLevelItems});
    }

    if (menu.touchData) {
      menu.touchData = null;
      menu.element.style.transform = '';
    }

    if (window.EventManager?.emit) {
      EventManager.emit('menu:opened', {menu});
    }
  },

  async closeMenu(menu) {
    if (!menu.isOpen) return;

    if (menu.elements) {
      for (const submenu of menu.elements.submenus) {
        await this.closeSubmenu(menu, submenu);
      }
    }

    if (menu.element) {
      const focusableElements = menu.element.querySelectorAll(this.config.accessibility.focusableSelectors);
      focusableElements.forEach(el => {
        el.setAttribute('tabindex', '-1');
      });
    }

    if (menu.elements?.toggle) {
      menu.elements.toggle.focus();
    }

    await new Promise(resolve => requestAnimationFrame(resolve));

    menu.isOpen = false;
    if (menu.element.classList.contains('sidemenu')) {
      document.body.classList.remove('sidemenu-close');
    } else {
      document.body.classList.remove('topmenu-open');
    }

    if (menu.elements?.toggle) {
      menu.elements.toggle.setAttribute('aria-expanded', 'false');
      menu.elements.toggle.setAttribute('aria-label', Now.translate('Open menu'));
    }

    if (menu.touchData) {
      menu.element.style.transform = '';
      menu.touchData = null;
    }

    if (this.config.accessibility.announceChanges) {
      this.announce('Close menu');
    }

    Now.emit('menu:closed', {menu});
  },

  toggleSubmenu(menu, submenu) {
    if (submenu.isOpen) {
      this.closeSubmenu(menu, submenu);
    } else {
      this.openSubmenu(menu, submenu);
    }
  },

  async openSubmenu(menu, button, options = {}) {
    if (!button.content) return;

    const currentLevel = button.parentElement.parentElement;
    menu.elements.submenus.forEach(other => {
      if (other !== button && other.parentElement.parentElement === currentLevel) {
        this.closeSubmenu(menu, other);
      }
    });

    button.isOpen = true;
    button.setAttribute('aria-expanded', 'true');

    if (menu.element.classList.contains('sidemenu')) {
      // If the sidemenu is collapsed, temporarily expand it to show the submenu
      if (document.body.classList.contains('sidemenu-close')) {
        document.body.classList.remove('sidemenu-close');
        // Mark that we temporarily expanded it, so we can collapse it back later
        button.dataset.tempExpanded = 'true';
      }
      document.body.classList.add('sidemenu-sub-expanded');
    } else if (menu.element.classList.contains('topmenu')) {
      document.body.classList.add('topmenu-sub-expanded');
    }

    const focusableElements = button.content.querySelectorAll(this.config.accessibility.focusableSelectors);
    focusableElements.forEach(el => {
      el.removeAttribute('tabindex');
    });

    if (!menu.isMobile) {
      requestAnimationFrame(() => {
        this.checkAndAdjustPosition(button.content);
      });
    }

    if (options.useKeyboard) {
      const firstItem = button.content.querySelector('[role="menuitem"]');
      if (firstItem) {
        await new Promise(resolve => setTimeout(resolve, 50));
        firstItem.focus();
      }
    }

    if (this.config.accessibility.announceChanges) {
      const submenuItems = button.content.querySelectorAll(':scope > li > [role="menuitem"]').length;
      this.announce('{Open submenu}, There are {count} items in total', {count: submenuItems});
    }

    Now.emit('submenu:opened', {
      menu,
      button,
      submenu: button.content,
      previousFocus: document.activeElement
    });
  },

  async closeSubmenu(menu, button) {
    if (!button.content) return;

    const currentFocus = document.activeElement;
    let shouldFocusButton = false;

    const childSubmenus = button.content.querySelectorAll('[aria-expanded="true"]');
    for (const child of childSubmenus) {
      await this.closeSubmenu(menu, child);
    }

    const focusableElements = button.content.querySelectorAll(this.config.accessibility.focusableSelectors);
    focusableElements.forEach(el => {
      el.setAttribute('tabindex', '-1');
    });

    if (currentFocus && button.content.contains(currentFocus)) {
      shouldFocusButton = true;
    }

    button.isOpen = false;
    button.setAttribute('aria-expanded', 'false');

    // If this submenu caused a temporary expansion, check if we should collapse it back
    if (button.dataset.tempExpanded === 'true') {
      // Check if any other submenus are still open
      const hasOtherOpenSubmenus = menu.elements.submenus.some(submenu => submenu.isOpen);
      if (!hasOtherOpenSubmenus) {
        document.body.classList.add('sidemenu-close');
      }
      // Clean up the dataset attribute
      delete button.dataset.tempExpanded;
    }

    // Check if any other submenus are open before removing the class
    const hasOpenSubmenu = menu.elements.submenus.some(submenu => submenu.isOpen);
    if (!hasOpenSubmenu) {
      if (menu.element.classList.contains('sidemenu')) {
        document.body.classList.remove('sidemenu-sub-expanded');
      } else if (menu.element.classList.contains('topmenu')) {
        document.body.classList.remove('topmenu-sub-expanded');
      }
    }

    if (shouldFocusButton) {
      button.focus();
    }

    if (!menu.isMobile) {
      button.content.style.left = '';
      button.content.style.right = '';
      button.content.style.top = '';
    }

    if (this.config.accessibility.announceChanges) {
      this.announce('Close submenu');
    }

    Now.emit('submenu:closed', {
      menu,
      button,
      submenu: button.content,
      currentFocus
    });
  },

  closeAllSubmenus(menu) {
    menu.elements?.submenus.forEach(submenu => {
      if (submenu.getAttribute('aria-expanded') === 'true') {
        this.closeSubmenu(menu, submenu);
      }
    });
  },

  hasMenu(menuId) {
    return this.state.menus.has(menuId);
  },

  getMenu(menuId) {
    return this.state.menus.get(menuId) || null;
  },

  setupTouchHandlers(menu) {
    let touchIdentifier;

    const handlers = {
      start: (e) => {
        if (touchIdentifier === undefined) {
          touchIdentifier = e.changedTouches[0].identifier;
          menu.touchData = {
            startX: e.touches[0].clientX,
            startY: e.touches[0].clientY,
            startTime: Date.now(),
            isScrolling: null
          };
        }
      },

      move: (e) => {
        if (!menu.touchData) return;

        const touch = Array.from(e.changedTouches)
          .find(t => t.identifier === touchIdentifier);

        if (!touch) return;

        const deltaX = touch.clientX - menu.touchData.startX;
        const deltaY = touch.clientY - menu.touchData.startY;

        if (menu.touchData.isScrolling === null) {
          menu.touchData.isScrolling = Math.abs(deltaY) > Math.abs(deltaX);
        }

        if (menu.touchData.isScrolling) return;

        if (this.config.performance.useRequestAnimationFrame) {
          requestAnimationFrame(() => {
            this.handleTouchMove(menu, deltaX);
          });
        } else {
          this.handleTouchMove(menu, deltaX);
        }
      },

      end: (e) => {
        const touch = Array.from(e.changedTouches)
          .find(t => t.identifier === touchIdentifier);

        if (!touch || !menu.touchData) return;

        const deltaX = touch.clientX - menu.touchData.startX;
        const deltaTime = Date.now() - menu.touchData.startTime;
        const velocity = Math.abs(deltaX) / deltaTime;

        this.handleTouchEnd(menu, deltaX, velocity);

        touchIdentifier = undefined;
        menu.touchData = null;
      },

      cancel: () => {
        if (menu.touchData) {
          menu.element.style.transform = '';
          touchIdentifier = undefined;
          menu.touchData = null;
        }
      }
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      menu.element.addEventListener(`touch${event}`, handler, {
        passive: true
      });
      menu.handlers[`touch${event}`] = handler;
    });
  },

  setupAccessibility(menu) {
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    menu.element.appendChild(liveRegion);
    menu.liveRegion = liveRegion;

    menu.element.setAttribute('role', 'navigation');
    menu.element.setAttribute('aria-label', Now.translate('Main navigation'));

    const keyboardHint = document.createElement('div');
    keyboardHint.className = 'sr-only';
    keyboardHint.textContent = Now.translate('Keyboard navigation instructions');
    menu.element.insertBefore(keyboardHint, menu.element.firstChild);
  },

  setupHoverHandlers(menu) {
    menu.hoverTimeouts = new Map();

    menu.elements.submenus.forEach(submenu => {

      const mouseEnterHandler = () => {
        const menuItem = submenu.closest('li');

        if (!menu.isMobile && menu.element.classList.contains('topmenu') && !submenu.isOpen && menuItem) {
          if (menu.hoverTimeouts?.has(submenu)) {
            clearTimeout(menu.hoverTimeouts.get(submenu));
          }

          menu.hoverTimeouts.set(submenu, setTimeout(() => {
            this.closeOtherSubmenus(menu, submenu);
            this.openSubmenu(menu, submenu);
          }, this.config.hover.openDelay));
        }
      };

      const mouseLeaveHandler = (e) => {
        if (!submenu.isConnected) return;

        if (menu.hoverTimeouts?.has(submenu)) {
          clearTimeout(menu.hoverTimeouts.get(submenu));
        }

        menu.hoverTimeouts?.set(submenu, setTimeout(() => {
          if (submenu.isConnected &&
            !menu.isMobile &&
            menu.element.classList.contains('topmenu')) {
            this.closeSubmenu(menu, submenu);
          }
        }, this.config.hover.closeDelay));
      };

      const menuItem = submenu.closest('li');
      menuItem.addEventListener('mouseenter', mouseEnterHandler);
      menuItem.addEventListener('mouseleave', mouseLeaveHandler);

      submenu.hoverHandlers = {
        enter: mouseEnterHandler,
        leave: mouseLeaveHandler
      };
    });
  },

  checkResponsiveState(menu, initial = false) {
    const wasMobile = menu.isMobile;
    const isMobile = window.innerWidth < this.config.breakpoint;
    menu.elements.container.setAttribute('aria-orientation', isMobile || menu.isSidebar ? 'vertical' : 'horizontal');

    menu.elements.submenus.forEach(submenu => {
      if (submenu.content) {
        this.checkAndAdjustPosition(submenu.content);
      }
    });

    let stateChanged = initial;
    if (isMobile !== wasMobile) {
      stateChanged = true;
      menu.isMobile = isMobile;

      if (!isMobile && menu.isOpen && !menu.isSidebar) {
        this.closeMenu(menu);
      }

      if (isMobile) {
        document.body.classList.add('mobile-menu');
      } else {
        document.body.classList.remove('mobile-menu');
      }
    }

    if (stateChanged && menu.element.classList.contains('topmenu')) {
      if (!isMobile) {
        this.setupHoverHandlers(menu);
      } else if (!initial) {
        this.removeHoverHandlers(menu);
      }
    }
  },

  isHoveringSubmenu(submenu, e) {
    const currentItem = submenu.closest('li');
    const relatedTarget = e.relatedTarget;

    if (!relatedTarget) return false;

    if (currentItem.contains(relatedTarget)) {
      return true;
    }

    const parentUl = currentItem.closest('ul');
    if (parentUl && parentUl.contains(relatedTarget)) {
      return true;
    }

    let parent = parentUl?.parentElement;
    while (parent) {
      if (parent.contains(relatedTarget)) {
        return true;
      }
      parent = parent.closest('li')?.parentElement;
    }

    return false;
  },

  findTopLevelMenuItem(current) {
    let parent = current.closest('li');
    while (parent) {
      const parentUl = parent.parentElement;
      if (!parentUl || !parentUl.closest('li')) {
        return parent.querySelector(':scope > [role="menuitem"]');
      }
      parent = parentUl.closest('li');
    }
    return null;
  },

  getTopLevelMenuItems(menu) {
    return menu.elements.container.querySelectorAll(':scope > li > a, :scope > li:not(.menu-close) > button');
  },

  handleKeyboardNavigation(menu, e) {
    if (!menu.element.contains(e.target)) return;

    const current = document.activeElement;
    const isTopLevel = current.closest('ul') === menu.elements.container;
    const submenu = current.closest('[aria-haspopup="true"]');
    const isHorizontalMenu = menu.elements.container.getAttribute('aria-orientation') === 'horizontal';

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (!isTopLevel) {
          const parentButton = current.closest('ul').parentElement.querySelector('[aria-haspopup="true"]');
          if (parentButton) {
            this.closeSubmenu(menu, parentButton);
            parentButton.focus();
          }
        } else if (menu.isOpen) {
          this.closeAllSubmenus(menu);
          this.closeMenu(menu);
          if (menu.elements?.toggle) {
            menu.elements.toggle.focus();
          }
        }
        break;

      case 'Tab':
        if (!isTopLevel) {
          const topLevelItem = this.findTopLevelMenuItem(current);
          const topLevelItems = this.getTopLevelMenuItems(menu);
          const index = Array.from(topLevelItems).indexOf(topLevelItem);

          let nextItem;
          if (e.shiftKey) {
            nextItem = topLevelItems[index - 1];
          } else {
            nextItem = topLevelItems[index + 1];
          }

          if (!nextItem) {
            this.closeMenu(menu);
            if (menu.elements?.toggle) {
              menu.elements.toggle.focus();
            }
            return;
          }
          e.preventDefault();
          nextItem.focus();
          if (nextItem.hasAttribute('aria-haspopup')) {
            this.openSubmenu(menu, nextItem, {useKeyboard: true});
          }
        }
        break;

      case 'Enter':
      case ' ':
        if (current.hasAttribute('aria-haspopup')) {
          e.preventDefault();
          this.openSubmenu(menu, current, {useKeyboard: true});
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (submenu) {
          this.closeSubmenu(menu, submenu);
          submenu.focus();
        } else if (menu.isOpen) {
          this.closeMenu(menu);
          menu.elements.toggle?.focus();
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (current.hasAttribute('aria-haspopup') &&
          current.getAttribute('aria-expanded') === 'false') {
          this.openSubmenu(menu, current, {useKeyboard: true});
        } else {
          const items = Array.from(current.closest('ul').querySelectorAll(':scope > li > [role="menuitem"]'));
          const nextItem = this.getNextFocusableItem(items, current);
          if (nextItem) nextItem.focus();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        const items = Array.from(current.closest('ul').querySelectorAll(':scope > li > [role="menuitem"]'));
        const prevItem = this.getPreviousFocusableItem(items, current);
        if (prevItem) prevItem.focus();
        break;

      case 'ArrowRight':
        if (isHorizontalMenu && isTopLevel) {
          e.preventDefault();
          const items = this.getTopLevelMenuItems(menu);
          const nextItem = this.getNextFocusableItem(items, current);
          if (nextItem) {
            nextItem.focus();
            if (nextItem.hasAttribute('aria-haspopup')) {
              this.openSubmenu(menu, nextItem, {useKeyboard: true});
            }
          }
        } else if (current.hasAttribute('aria-haspopup')) {
          e.preventDefault();
          this.openSubmenu(menu, current, {useKeyboard: true});
        }
        break;

      case 'ArrowLeft':
        if (isHorizontalMenu && isTopLevel) {
          e.preventDefault();
          const items = this.getTopLevelMenuItems(menu);
          const prevItem = this.getPreviousFocusableItem(items, current);
          if (prevItem) {
            prevItem.focus();
            if (prevItem.hasAttribute('aria-haspopup')) {
              this.openSubmenu(menu, prevItem);
            }
          }
        } else {
          e.preventDefault();
          const parentButton = current.closest('ul')?.parentElement?.querySelector('[aria-haspopup="true"]');
          if (parentButton) {
            this.closeSubmenu(menu, parentButton);
            parentButton.focus();
          }
        }
        break;

      case 'Home':
        e.preventDefault();
        const firstItem = this.getFirstFocusableItem(menu);
        if (firstItem) firstItem.focus();
        break;

      case 'End':
        e.preventDefault();
        const lastItem = this.getLastFocusableItem(menu);
        if (lastItem) lastItem.focus();
        break;
    }
  },

  getFirstFocusableItem(menu) {
    return menu.elements.container.querySelector('[role="menuitem"]:not([disabled])');
  },

  getLastFocusableItem(menu) {
    const items = menu.elements.container.querySelectorAll('[role="menuitem"]:not([disabled])');
    return items[items.length - 1];
  },

  findSubmenuByToggle(menu, toggle) {
    return menu.elements.submenus.find(
      submenu => submenu.toggle === toggle
    );
  },

  getNextFocusableItem(items, current) {
    const currentIndex = Array.from(items).indexOf(current);
    return items[currentIndex + 1] || items[0];
  },

  getPreviousFocusableItem(items, current) {
    const currentIndex = Array.from(items).indexOf(current);
    return items[currentIndex - 1] || items[items.length - 1];
  },

  announce(message, params = {}) {
    if (!this.announcer) {
      this.announcer = document.createElement('div');
      this.announcer.setAttribute('aria-live', 'polite');
      this.announcer.setAttribute('role', 'status');
      this.announcer.setAttribute('aria-atomic', 'true');
      this.announcer.className = 'sr-only';
      document.body.appendChild(this.announcer);
    }

    this.announcer.setAttribute('lang', window.I18nManager?.getCurrentLocale() || 'en');

    this.announcer.textContent = Now.translate(message, params);
  },

  handleError(message, error, type, canRecover = true) {
    if (error.isRecoveryError) {
      ErrorManager.handle(error, {
        context: `MenuManager.${type}`,
        type: 'error:menu',
        notify: true
      });
      return;
    }

    ErrorManager.handle(message, {
      context: `MenuManager.${type}`,
      type: 'error:menu',
      data: {canRecover},
      notify: true
    });

    if (canRecover) {
      try {
        this.recoverFromError();
      } catch (recoveryError) {
        recoveryError.isRecoveryError = true;

        ErrorManager.handle(recoveryError, {
          context: `MenuManager.recovery.${type}`,
          type: 'error:menu',
          notify: true
        });

        this.forceCleanup();
      }
    }
  },

  recoverFromError() {
    this.state.menus.forEach(menu => {
      if (menu.isOpen) {
        this.closeMenu(menu);
      }
      this.closeAllSubmenus(menu);
      this.resetMenuState(menu);
    });

    this.checkResponsiveState();
  },

  forceCleanup() {
    try {
      this.state.menus.forEach(menu => {
        menu.isOpen = false;
        menu.touchData = null;
        menu.element.style.transform = '';

        if (menu.elements?.toggle) {
          menu.elements.toggle.setAttribute('aria-expanded', 'false');
        }
      });

      if (menu.element && menu.element.classList.contains('sidemenu')) {
        document.body.classList.remove('sidemenu-close');
      } else {
        document.body.classList.remove('topmenu-open');
      }

    } catch (error) {
      ErrorManager.handle(error, {
        context: 'MenuManager.forceCleanup'
      });
    }
  },

  resetMenuState(menu) {
    menu.isOpen = false;
    menu.touchData = null;
    menu.element.style.transform = '';
    if (menu.element && menu.element.classList.contains('sidemenu')) {
      document.body.classList.remove('sidemenu-close');
    } else {
      document.body.classList.remove('topmenu-open');
    }
  },

  destroyMenu(menuId) {
    const menu = this.state.menus.get(menuId);
    if (!menu) return;

    this.cleanup(menu);

    if (menu.element) {
      delete menu.element.dataset.menuId;
    }

    this.state.menus.delete(menuId);
  },

  cleanup(menu) {
    if (!menu) return;

    if (menu.handlers) {
      if (menu.handlers.toggle) {
        menu.elements.toggle?.removeEventListener('click', menu.handlers.toggle);
      }
      if (menu.handlers.close) {
        menu.elements.close?.removeEventListener('click', menu.handlers.close);
      }
      if (menu.handlers.backdrop) {
        menu.elements.backdrop?.removeEventListener('click', menu.handlers.backdrop);
      }
      if (menu.handlers.keydown) {
        document.removeEventListener('keydown', menu.handlers.keydown);
      }
      if (menu.handlers.resize) {
        window.removeEventListener('resize', menu.handlers.resize);
      }
      if (menu.handlers.focusout) {
        menu.element.removeEventListener('focusout', menu.handlers.focusout);
      }

      if (menu.handlers.touch) {
        menu.element.removeEventListener('touchstart', menu.handlers.touch.start);
        menu.element.removeEventListener('touchmove', menu.handlers.touch.move);
        menu.element.removeEventListener('touchend', menu.handlers.touch.end);
        menu.element.removeEventListener('touchcancel', menu.handlers.touch.cancel);
      }
    }

    this.removeHoverHandlers(menu);

    if (menu.hoverTimeouts) {
      menu.hoverTimeouts.forEach(timeout => clearTimeout(timeout));
      menu.hoverTimeouts.clear();
    }

    if (menu.elements) {
      if (menu.elements.backdrop) {
        menu.elements.backdrop.remove();
      }
      if (menu.elements.close) {
        menu.elements.close.remove();
      }
      if (menu.elements.toggle?.classList.contains('runtime')) {
        menu.elements.toggle.remove();
      }
    }

    menu.isOpen = false;
    menu.touchData = null;
    menu.element.style.transform = '';
    if (menu.element && menu.element.classList.contains('sidemenu')) {
      document.body.classList.remove('sidemenu-close');
    } else {
      document.body.classList.remove('topmenu-open');
    }

    menu.element = null;
    menu.elements = null;
    menu.handlers = null;
    menu.hoverTimeouts = null;
    menu.touchData = null;
  },

  removeHoverHandlers(menu) {
    if (!menu?.elements?.submenus) return;

    menu.elements.submenus.forEach(submenu => {
      if (submenu?.hoverHandlers) {
        const menuItem = submenu.closest('li');
        if (menuItem) {
          menuItem.removeEventListener('mouseenter', submenu.hoverHandlers.enter);
          menuItem.removeEventListener('mouseleave', submenu.hoverHandlers.leave);
        }
        delete submenu.hoverHandlers;
      }
    });

    if (menu.hoverTimeouts) {
      menu.hoverTimeouts.forEach(clearTimeout);
      menu.hoverTimeouts.clear();
      delete menu.hoverTimeouts;
    }
  },

  destroy() {
    this.state.menus.forEach((menu) => {
      this.destroyMenu(menu.id);
    });

    this.state.menus.clear();

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.announcer) {
      this.announcer.remove();
      this.announcer = null;
    }

    if (menu.elements) {
      if (menu.elements.backdrop) {
        menu.elements.backdrop.remove();
      }
      if (menu.elements.close) {
        menu.elements.close.remove();
      }
      if (menu.elements.toggle?.classList.contains('runtime')) {
        menu.elements.toggle.remove();
      }
    }

    this.state.initialized = false;

    Now.emit('menumanager:destroyed');
  },

  handleTouchMove(menu, deltaX) {
    if (!this.config.performance.touchOptimization) {
      menu.element.style.transform = `translateX(${deltaX}px)`;
      return;
    }

    menu.element.style.transform = `translate3d(${deltaX}px, 0, 0)`;
  },

  findMenuByElement(element) {
    for (const menu of this.state.menus.values()) {
      if (menu.element === element) {
        return menu;
      }
    }
    return null;
  },

  closeOtherSubmenus(menu, currentSubmenu) {
    const currentItem = currentSubmenu.closest('li');
    const parentUl = currentItem?.closest('ul');

    if (parentUl) {
      menu.elements.submenus.forEach(other => {
        const otherItem = other.closest('li');
        if (other !== currentSubmenu &&
          otherItem &&
          otherItem.closest('ul') === parentUl) {
          this.closeSubmenu(menu, other);
        }
      });
    }
  },

  isSubmenuReady(submenu) {
    return submenu &&
      submenu.isConnected &&
      submenu.content &&
      submenu.content.isConnected;
  }
};

if (window.Now?.registerManager) {
  Now.registerManager('menu', MenuManager);
}

window.MenuManager = MenuManager;
