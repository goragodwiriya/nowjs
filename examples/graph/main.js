/**
 * Graph Component Example
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize framework
    await Now.init({
      // Environment mode: 'development' or 'production'
      environment: 'production',

      // Internationalization settings
      i18n: {
        enabled: true,
        availableLocales: ['en', 'th']
      },

      // Dark/Light mode
      config: {
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

    // Initialize GraphComponent with global defaults
    // (charts in the HTML initialize automatically via data attributes)
    await GraphComponent.init();

    // Setup the JavaScript API playground
    setupPlayground();

    // Setup the data loading demos
    setupDataLoadingDemos();

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

/**
 * Sample data for the JavaScript API playground
 */
const playgroundData = [
  {name: 'Visitors', data: [
    {label: 'Mon', value: 120},
    {label: 'Tue', value: 150},
    {label: 'Wed', value: 135},
    {label: 'Thu', value: 170},
    {label: 'Fri', value: 160},
    {label: 'Sat', value: 190}
  ]},
  {name: 'Signups', data: [
    {label: 'Mon', value: 12},
    {label: 'Tue', value: 19},
    {label: 'Wed', value: 15},
    {label: 'Thu', value: 25},
    {label: 'Fri', value: 22},
    {label: 'Sat', value: 30}
  ]}
];

/**
 * JavaScript API playground - created entirely from JavaScript
 */
async function setupPlayground() {
  const log = document.getElementById('graph-event-log');
  const logEvent = (name, detail) => {
    if (!log) return;

    // Remove the initial hint
    const hint = log.querySelector('.graph-log-hint');
    if (hint) hint.remove();

    const item = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    item.innerHTML = `<time>${time}</time> <strong>${name}</strong>${detail ? ` <span>${detail}</span>` : ''}`;

    // Keep the log at a maximum of 8 entries
    log.prepend(item);
    while (log.children.length > 8) {
      log.removeChild(log.lastChild);
    }
  };

  // Create the chart programmatically
  const playground = await GraphComponent.create('#api-playground', {
    type: 'line',
    curve: true,
    showLegend: true,
    animation: true,
    animationDuration: 600,
    data: playgroundData,

    onClick(dataPoint, seriesIndex) {
      logEvent('onClick', `${dataPoint.label}: ${dataPoint.value}`);
    },

    onDataChange(data) {
      const points = data.reduce((sum, series) => sum + series.data.length, 0);
      logEvent('onDataChange', `${data.length} series, ${points} points`);
    }
  });

  const element = document.getElementById('api-playground');

  // Listen to lifecycle events on the container
  ['created', 'loaded', 'data-changed', 'type-changed', 'data-point-added', 'error'].forEach(name => {
    element.addEventListener(`graph:${name}`, e => {
      const detail = e.detail || {};
      const info = name === 'type-changed' ? detail.type
        : name === 'data-point-added' ? `${detail.point.label}: ${detail.point.value}`
        : name === 'loaded' ? `${detail.data?.length ?? 0} series`
        : '';
      logEvent(`graph:${name}`, info);
    });
  });

  // Type switcher
  document.querySelectorAll('.btn-type').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.btn-type').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      playground.setType(button.dataset.type);
    });
  });

  // Randomize data with setData()
  document.getElementById('btn-randomize')?.addEventListener('click', () => {
    const randomize = series => ({
      ...series,
      data: series.data.map(point => ({
        ...point,
        value: Math.round(point.value * (0.5 + Math.random()))
      }))
    });

    playground.setData(playgroundData.map(randomize));
  });

  // Append a point with addDataPoint()
  const extraLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let extraIndex = 0;
  document.getElementById('btn-add-point')?.addEventListener('click', () => {
    const label = extraLabels[extraIndex % extraLabels.length];
    extraIndex++;

    playground.addDataPoint({label: `${label}+`, value: Math.round(40 + Math.random() * 160)}, 0);
  });

  // Export as PNG
  document.getElementById('btn-export')?.addEventListener('click', () => {
    playground.exportToImage('nowjs-graph', 'png');
  });
}

/**
 * Data loading demos - manual refresh and event-based refresh
 */
function setupDataLoadingDemos() {
  // Manual refresh of the data-url chart
  document.getElementById('btn-refresh-url')?.addEventListener('click', () => {
    const instance = GraphComponent.getInstance(document.getElementById('url-graph'));
    if (instance) {
      instance.refresh();
    }
  });

  // Event-based refresh - every chart sharing the event refreshes together
  document.getElementById('btn-emit-refresh')?.addEventListener('click', () => {
    EventManager.emit('graph:refresh-demo');
  });
}
