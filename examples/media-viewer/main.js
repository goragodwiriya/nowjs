/**
 * MediaViewer Demo
 * Examples showing various MediaViewer features
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Detect current directory path for dynamic resource loading
    const currentPath = window.location.pathname;
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // Initialize framework
    await Now.init({
      // Environment mode: 'development' or 'production'
      environment: 'production',

      // Path configuration for templates and resources
      paths: {
        templates: `${currentDir}templates`,
      },

      // Internationalization settings
      i18n: {
        enabled: true,
        availableLocales: ['en', 'th']
      },

      // Dark/Light mode
      theme: {
        enabled: true
      },

      // Syntax highlighter configuration for code examples
      syntaxhighlighter: {
        display: {
          lineNumbers: true,    // Show line numbers in code blocks
          copyButton: true      // Show copy button for code blocks
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

    initBasicGallery();
    initThumbnailGallery();
    initSlideshow();
    initMixedMedia();
    initZoomGallery();
    initCallbackDemo();
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
// Sample image URLs
const sampleImages = [
  'https://picsum.photos/id/10/800/600',
  'https://picsum.photos/id/11/800/600',
  'https://picsum.photos/id/12/800/600',
  'https://picsum.photos/id/13/800/600'
];

const imagesWithCaptions = [
  {url: 'https://picsum.photos/id/14/800/600', caption: 'Mountain Landscape'},
  {url: 'https://picsum.photos/id/15/800/600', caption: 'Ocean Sunset'},
  {url: 'https://picsum.photos/id/16/800/600', caption: 'Forest Trail'},
  {url: 'https://picsum.photos/id/17/800/600', caption: 'Desert Dunes'},
  {url: 'https://picsum.photos/id/18/800/600', caption: 'City Lights'}
];

const mixedMedia = [
  {type: 'image', url: 'https://picsum.photos/id/30/800/600', caption: 'Product Photo'},
  {type: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},
  {type: 'image', url: 'https://picsum.photos/id/31/800/600', caption: 'Another Photo'}
];

const zoomImages = [
  'https://picsum.photos/id/20/1200/900',
  'https://picsum.photos/id/21/1200/900'
];

// Create viewer instances
let basicViewer = null;
let thumbViewer = null;
let slideshowViewer = null;
let mixedViewer = null;
let zoomViewer = null;
let callbackViewer = null;

// 1. Basic Gallery
function initBasicGallery() {
  basicViewer = new MediaViewer();

  document.querySelectorAll('#basicGallery .gallery-item').forEach((item, index) => {
    item.onclick = () => basicViewer.show(sampleImages, index);
  });
}

// 2. Gallery with Thumbnails
function initThumbnailGallery() {
  thumbViewer = new MediaViewer({
    showThumbnails: true,
    showControls: true
  });

  document.getElementById('openWithThumbnails').onclick = () => {
    thumbViewer.show(imagesWithCaptions, 0);
  };
}

// 3. Slideshow
function initSlideshow() {
  const startBtn = document.getElementById('startSlideshow');
  const stopBtn = document.getElementById('stopSlideshow');

  slideshowViewer = new MediaViewer({
    autoplay: true,
    interval: 3000,
    loop: true,
    showThumbnails: true,

    onHide: () => {
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  });

  startBtn.onclick = () => {
    slideshowViewer.show(imagesWithCaptions, 0);
    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  stopBtn.onclick = () => {
    slideshowViewer.hide();
  };
}

// 4. Mixed Media
function initMixedMedia() {
  mixedViewer = new MediaViewer({
    showThumbnails: true,
    showControls: false
  });

  document.getElementById('openMixedMedia').onclick = () => {
    mixedViewer.show(mixedMedia, 0);
  };
}

// 5. Zoom Gallery
function initZoomGallery() {
  zoomViewer = new MediaViewer({
    enableZoom: true,
    maxZoom: 4,
    zoomStep: 0.5,
    showControls: true
  });

  document.querySelectorAll('#zoomGallery .gallery-item').forEach((item, index) => {
    item.onclick = () => zoomViewer.show(zoomImages, index);
  });
}

// 6. Event Callbacks
function initCallbackDemo() {
  const logContent = document.querySelector('#eventLog .log-content');

  function logEvent(message) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="time">[${time}]</span> ${message}`;
    logContent.insertBefore(entry, logContent.firstChild);

    // Keep only last 10 entries
    while (logContent.children.length > 10) {
      logContent.removeChild(logContent.lastChild);
    }
  }

  callbackViewer = new MediaViewer({
    showThumbnails: true,

    onShow: (item) => {
      logEvent(`<span class="event-show">Opened</span> with: ${item.url || item}`);
    },

    onHide: () => {
      logEvent(`<span class="event-hide">Closed</span> viewer`);
    },

    onChange: (item, index) => {
      logEvent(`<span class="event-change">Changed</span> to item ${index}: ${item.caption || item.url || item}`);
    }
  });

  document.getElementById('openWithCallbacks').onclick = () => {
    logContent.innerHTML = '';
    callbackViewer.show(imagesWithCaptions, 0);
  };
}

// ===== Section 8: Text/HTML Content Demo =====
const textHtmlBtn = document.getElementById('textHtmlDemo');
if (textHtmlBtn) {
  const textHtmlViewer = new MediaViewer({
    showThumbnails: true,
    showControls: true
  });

  textHtmlBtn.onclick = () => {
    textHtmlViewer.show([
      {
        type: 'image',
        url: 'https://picsum.photos/1200/800?random=10',
        caption: 'Welcome Image'
      },
      {
        type: 'text',
        title: 'About MediaViewer',
        content: 'MediaViewer is a powerful, unified media viewing component that supports images, videos, YouTube embeds, and now text and HTML content. It provides a seamless fullscreen viewing experience with zoom, pan, and keyboard navigation.'
      },
      {
        type: 'html',
        content: `
          <h2>Rich HTML Content</h2>
          <p>This is an example of <strong>HTML content</strong> displayed in MediaViewer.</p>
          <ul>
            <li>Supports basic HTML formatting</li>
            <li>Links, lists, and other elements</li>
            <li>Sanitized for security</li>
          </ul>
          <p><em>Perfect for documentation, terms, or detailed descriptions.</em></p>
        `
      },
      {
        type: 'image',
        url: 'https://picsum.photos/1200/800?random=11',
        caption: 'Another Photo'
      }
    ], 0);
  };
}

// ===== Section 9: API Loading Demo =====
const apiLoadBtn = document.getElementById('apiLoadBtn');
if (apiLoadBtn) {
  apiLoadBtn.onclick = () => {
    // Mock API response
    const mockApiResponse = [
      {type: 'image', url: 'https://picsum.photos/1200/800?random=20', caption: 'API Image 1'},
      {type: 'image', url: 'https://picsum.photos/1200/800?random=21', caption: 'API Image 2'},
      {type: 'image', url: 'https://picsum.photos/1200/800?random=22', caption: 'API Image 3'},
      {type: 'text', title: 'API Response Info', content: 'This data was loaded from a mock API endpoint.'}
    ];

    const apiDemoContainer = document.getElementById('apiDemo');
    if (apiDemoContainer && apiDemoContainer._mediaViewer) {
      apiDemoContainer._mediaViewer.show(mockApiResponse, 0);
    } else {
      // Create new viewer for demo
      const apiViewer = new MediaViewer({showThumbnails: true});
      apiViewer.show(mockApiResponse, 0);
    }
  };
}
