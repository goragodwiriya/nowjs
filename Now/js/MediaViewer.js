/**
 * MediaViewer Component
 * Unified media viewer with slideshow, zoom and fullscreen capabilities
 * Supports images, videos, YouTube, and custom content
 *
 * Features:
 * - Slideshow with thumbnails
 * - Image zoom and pan
 * - YouTube video embedding
 * - Responsive design
 * - Touch gestures
 * - Keyboard controls
 * - Accessibility support
 */
class MediaViewer {
  /**
   * Create MediaViewer instance
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.options = {
      showThumbnails: false,
      showControls: true,

      autoplay: false,
      interval: 5000,
      loop: true,

      enableZoom: true,
      maxZoom: 3,
      zoomStep: 0.5,

      renderers: {
        image: this.renderImage.bind(this),
        video: this.renderVideo.bind(this),
        youtube: this.renderYouTube.bind(this),
        iframe: this.renderIframe.bind(this)
      },

      onShow: null,
      onHide: null,
      onChange: null,

      ...options
    };

    this.state = {
      visible: false,
      currentIndex: 0,
      items: [],
      zoom: 1,
      pan: {x: 0, y: 0},
      isDragging: false,
      startPos: {x: 0, y: 0},
      isPlaying: false,
      playTimer: null
    };

    this.setupDOM();
    this.bindEvents();
  }

  /**
   * Set up DOM structure
   * @private
   */
  setupDOM() {
    this.container = document.createElement('div');
    this.container.className = 'media-viewer';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-hidden', 'true');

    this.container.innerHTML = `
      <div class="media-viewer-header">
        <div class="media-viewer-controls">
          ${this.options.showControls ? `
            <button class="zoom-out icon-zoom-out" aria-label="Zoom out"></button>
            <button class="zoom-reset icon-zoom-reset" aria-label="Reset zoom"></button>
            <button class="zoom-in icon-zoom-in" aria-label="Zoom in"></button>
          ` : ''}
          <button class="close-button icon-close" aria-label="Close"></button>
        </div>
      </div>

      <div class="media-viewer-content">
        <button class="nav-button icon-prev prev" aria-label="Previous"></button>
        <div class="media-stage"></div>
        <button class="nav-button icon-next next" aria-label="Next"></button>
      </div>

      ${this.options.showThumbnails ? `
        <div class="media-viewer-thumbnails">
          <div class="thumbnail-track"></div>
        </div>
      ` : ''}
    `;

    this.stage = this.container.querySelector('.media-stage');
    this.thumbnailTrack = this.container.querySelector('.thumbnail-track');

    document.body.appendChild(this.container);
  }

  /**
   * Bind event listeners
   * @private
   */
  bindEvents() {
    this.container.querySelector('.close-button').onclick = () => this.hide();
    this.container.querySelector('.nav-button.prev').onclick = () => this.prev();
    this.container.querySelector('.nav-button.next').onclick = () => this.next();

    if (this.options.showControls) {
      this.container.querySelector('.zoom-in').onclick = () => this.zoomIn();
      this.container.querySelector('.zoom-out').onclick = () => this.zoomOut();
      this.container.querySelector('.zoom-reset').onclick = () => this.resetZoom();
    }

    document.addEventListener('keydown', (e) => {
      if (!this.state.visible) return;

      switch (e.key) {
        case 'Escape': this.hide(); break;
        case 'ArrowLeft': this.prev(); break;
        case 'ArrowRight': this.next(); break;
        case '+': this.zoomIn(); break;
        case '-': this.zoomOut(); break;
        case '0': this.resetZoom(); break;
      }
    });

    let touchStartX = 0;
    let touchStartY = 0;

    this.stage.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    });

    this.stage.addEventListener('touchmove', (e) => {
      if (!this.state.visible) return;

      const deltaX = touchStartX - e.touches[0].clientX;
      const deltaY = touchStartY - e.touches[0].clientY;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        e.preventDefault();
        if (deltaX > 50) this.next();
        if (deltaX < -50) this.prev();
      }
    });

    this.stage.addEventListener('wheel', (e) => {
      if (!this.options.enableZoom) return;

      e.preventDefault();
      if (e.deltaY < 0) this.zoomIn();
      if (e.deltaY > 0) this.zoomOut();
    });

    this.stage.addEventListener('mousedown', this.startDrag.bind(this));
    document.addEventListener('mousemove', this.doDrag.bind(this));
    document.addEventListener('mouseup', this.stopDrag.bind(this));
  }

  /**
   * Show viewer with media items
   * @param {Array} items Media items to display
   * @param {number} startIndex Starting item index
   */
  show(items, startIndex = 0) {
    this.state.items = items.map(item => this.normalizeItem(item));
    this.state.currentIndex = startIndex;
    this.state.visible = true;

    this.container.classList.add('visible');
    this.container.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    this.loadCurrentItem();

    if (this.options.showThumbnails) {
      this.renderThumbnails();
    }

    if (this.options.autoplay) {
      this.play();
    }

    if (this.options.onShow) {
      this.options.onShow(this.getCurrentItem());
    }
  }

  /**
   * Hide viewer
   */
  hide() {
    this.stop();
    this.resetZoom();

    this.state.visible = false;
    this.container.classList.remove('visible');
    this.container.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (this.options.onHide) {
      this.options.onHide();
    }
  }

  /**
   * Load and render current item
   * @private
   */
  loadCurrentItem() {
    const item = this.getCurrentItem();
    if (!item) return;

    this.stage.innerHTML = '';

    this.resetZoom();

    const renderer = this.options.renderers[item.type];
    if (renderer) {
      renderer(item);
    }

    if (this.options.showThumbnails) {
      this.updateThumbnails();
    }

    if (this.options.onChange) {
      this.options.onChange(item, this.state.currentIndex);
    }
  }

  /**
   * Render image item
   * @private
   */
  renderImage(item) {
    const img = document.createElement('img');
    img.className = 'media-item';
    img.src = item.url;
    img.alt = item.caption || '';

    img.onload = () => {
      this.resetZoom();
      img.classList.add('loaded');
    };

    this.stage.appendChild(img);
  }

  /**
   * Render video item
   * @private
   */
  renderVideo(item) {
    const video = document.createElement('video');
    video.className = 'media-item';
    video.src = item.url;
    video.controls = true;

    if (item.poster) {
      video.poster = item.poster;
    }

    this.stage.appendChild(video);
  }

  /**
   * Render YouTube video
   * @private
   */
  renderYouTube(item) {
    const iframe = document.createElement('iframe');
    iframe.className = 'media-item iframe';
    iframe.src = `https://www.youtube.com/embed/${this.sanitizeVideoId(item.videoId)}?rel=0&showinfo=0`;
    iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;

    this.stage.appendChild(iframe);
  }

  /**
   * Sanitize YouTube video ID
   * @private
   */
  sanitizeVideoId(videoId) {
    if (typeof videoId !== 'string') return '';
    // ตรวจสอบว่า videoId มีความยาว 11 ตัวอักษรและประกอบด้วยตัวอักษรที่ถูกต้อง
    const validId = /^[a-zA-Z0-9_-]{11}$/.test(videoId);
    return validId ? videoId : '';
  }

  /**
   * Render iframe content
   * @private
   */
  renderIframe(item) {
    const iframe = document.createElement('iframe');
    iframe.className = 'media-item iframe';
    iframe.src = item.url;
    iframe.allowFullscreen = true;

    this.stage.appendChild(iframe);
  }

  /**
   * Render thumbnail strip
   * @private
   */
  renderThumbnails() {
    this.thumbnailTrack.innerHTML = '';

    this.state.items.forEach((item, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'thumbnail';
      if (index === this.state.currentIndex) {
        thumb.classList.add('active');
      }

      if (item.type === 'image') {
        const img = document.createElement('img');
        img.src = item.thumbnail || item.url;
        img.alt = item.caption || '';
        thumb.appendChild(img);
      } else {
        const icon = document.createElement('span');
        icon.className = `icon-${item.type}`;
        thumb.appendChild(icon);
      }

      thumb.onclick = () => {
        this.goTo(index);
      };

      this.thumbnailTrack.appendChild(thumb);
    });
  }

  /**
   * Update thumbnail selection
   * @private
   */
  updateThumbnails() {
    if (!this.thumbnailTrack) return;

    const thumbs = this.thumbnailTrack.children;
    for (let i = 0; i < thumbs.length; i++) {
      thumbs[i].classList.toggle('active', i === this.state.currentIndex);
    }
  }

  /**
   * Start slideshow playback
   */
  play() {
    if (this.state.isPlaying) return;

    this.state.isPlaying = true;
    this.state.playTimer = setInterval(() => {
      this.next();
    }, this.options.interval);
  }

  /**
   * Stop slideshow playback
   */
  stop() {
    if (!this.state.isPlaying) return;

    this.state.isPlaying = false;
    clearInterval(this.state.playTimer);
  }

  /**
   * Go to next item
   */
  next() {
    if (this.state.currentIndex < this.state.items.length - 1) {
      this.goTo(this.state.currentIndex + 1);
    } else if (this.options.loop) {
      this.goTo(0);
    }
  }

  /**
   * Go to previous item
   */
  prev() {
    if (this.state.currentIndex > 0) {
      this.goTo(this.state.currentIndex - 1);
    } else if (this.options.loop) {
      this.goTo(this.state.items.length - 1);
    }
  }

  /**
   * Go to specific item
   * @param {number} index Item index
   */
  goTo(index) {
    if (index === this.state.currentIndex) return;

    this.state.currentIndex = index;
    this.loadCurrentItem();
  }

  /**
   * Get current item
   * @returns {Object} Current media item
   */
  getCurrentItem() {
    return this.state.items[this.state.currentIndex];
  }

  /**
   * Normalize media item object
   * @private
   */
  normalizeItem(item) {
    if (typeof item === 'string') {
      return {
        type: 'image',
        url: item
      };
    }

    if (item.url && item.url.includes('youtube.com')) {
      const videoId = this.getYouTubeId(item.url);
      return {
        type: 'youtube',
        videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        ...item
      };
    }

    return {
      type: 'image',
      ...item
    };
  }

  /**
   * Extract YouTube video ID from URL
   * @private
   */
  getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  /**
   * Start drag operation
   * @private
   */
  startDrag(e) {
    if (!this.options.enableZoom || this.state.zoom === 1) return;

    this.state.isDragging = true;
    this.state.startPos = {
      x: e.clientX - this.state.pan.x,
      y: e.clientY - this.state.pan.y
    };

    this.stage.style.cursor = 'grabbing';
  }

  /**
   * Handle drag operation
   * @private
   */
  doDrag(e) {
    if (!this.state.isDragging) return;

    e.preventDefault();

    const mediaItem = this.stage.querySelector('.media-item');
    if (!mediaItem) return;

    const rect = mediaItem.getBoundingClientRect();
    const containerRect = this.stage.getBoundingClientRect();

    const maxX = (rect.width * this.state.zoom - containerRect.width) / 2;
    const maxY = (rect.height * this.state.zoom - containerRect.height) / 2;

    this.state.pan = {
      x: Math.min(maxX, Math.max(-maxX, e.clientX - this.state.startPos.x)),
      y: Math.min(maxY, Math.max(-maxY, e.clientY - this.state.startPos.y))
    };

    this.updateTransform();
  }

  /**
   * End drag operation
   * @private
   */
  stopDrag() {
    if (!this.state.isDragging) return;

    this.state.isDragging = false;
    this.stage.style.cursor = 'grab';
  }

  /**
   * Zoom in
   */
  zoomIn() {
    if (!this.options.enableZoom) return;

    const newZoom = Math.min(
      this.state.zoom + this.options.zoomStep,
      this.options.maxZoom
    );
    this.setZoom(newZoom);
  }

  /**
   * Zoom out
   */
  zoomOut() {
    if (!this.options.enableZoom) return;

    const newZoom = Math.max(
      this.state.zoom - this.options.zoomStep,
      1
    );
    this.setZoom(newZoom);
  }

  /**
   * Reset zoom level
   */
  resetZoom() {
    this.setZoom(1);
    this.state.pan = {x: 0, y: 0};
    this.updateTransform();
  }

  /**
   * Set zoom level
   * @param {number} zoom Zoom level
   * @private
   */
  setZoom(zoom) {
    this.state.zoom = zoom;
    this.updateTransform();

    const mediaItem = this.stage.querySelector('.media-item');
    if (mediaItem) {
      mediaItem.style.cursor = zoom > 1 ? 'grab' : 'default';
    }
  }

  /**
   * Update transform
   * @private
   */
  updateTransform() {
    const mediaItem = this.stage.querySelector('.media-item');
    if (!mediaItem) return;

    const transform = `
      translate(${this.state.pan.x}px, ${this.state.pan.y}px)
      scale(${this.state.zoom})
    `;

    mediaItem.style.transform = transform;
  }

  /**
   * Set viewer options
   * @param {Object} options New options
   */
  setOptions(options) {
    this.options = {
      ...this.options,
      ...options
    };

    if (this.container) {
      this.container.classList.toggle('show-thumbnails', this.options.showThumbnails);
      this.container.classList.toggle('show-controls', this.options.showControls);
    }
  }

  /**
   * Clean up viewer
   */
  destroy() {
    this.stop();

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.state = {
      visible: false,
      currentIndex: 0,
      items: [],
      zoom: 1,
      pan: {x: 0, y: 0},
      isDragging: false,
      startPos: {x: 0, y: 0},
      isPlaying: false,
      playTimer: null
    };
  }
}

window.MediaViewer = MediaViewer;
