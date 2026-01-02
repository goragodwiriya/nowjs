/**
 * ThemeManager Demo - Showcase all features
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
      theme: {
        enabled: true,
        defaultTheme: 'light',
        storageKey: 'demo_theme',
        systemPreference: true, // Use system color scheme preference

        // Smooth transitions
        transition: {
          enabled: true,
          duration: 300,
          hideOnSwitch: true
        },

        // API config - auto-load from server on init
        api: {
          enabled: true,
          configUrl: 'theme-config.json',  // Automatically loads during init
          cacheResponse: true
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

    // Setup event listeners
    setupEventListeners();

    // Update displays
    updateThemeDisplay();
    updateStatusDisplays();

    log('✅ ThemeManager ready!', 'success');

  } catch (error) {
    console.error('Application initialization failed:', error);
    log(`❌ Init failed: ${error.message}`, 'error');
  }
});

// ============ Event Listeners ============

function setupEventListeners() {
  EventManager.on('theme:changed', (data) => {
    log(`🎨 Theme changed to: ${data.theme}`, 'info');
    updateThemeDisplay();
  });

  EventManager.on('theme:variables-applied', (data) => {
    const count = data?.variables ? Object.keys(data.variables).length : 0;
    log(`✅ Applied ${count} CSS variables`, 'success');
    updateVariablesDisplay();
  });

  EventManager.on('theme:variables-cleared', () => {
    log('🗑️ Variables cleared', 'warn');
    updateVariablesDisplay();
  });

  EventManager.on('theme:api-loaded', (data) => {
    const cached = data.fromCache ? ' (from cache)' : '';
    log(`📥 Config loaded${cached}`, 'success');
  });

  EventManager.on('theme:api-error', (data) => {
    log(`❌ API Error: ${data.error}`, 'error');
  });

  EventManager.on('theme:ready', () => {
    log('✨ Theme ready (anti-FOUC complete)', 'info');
    updateStatusDisplays();
  });
}

// ============ Console Logger ============

function log(message, type = 'info') {
  const consoleEl = document.getElementById('console');
  if (!consoleEl) return;

  const logEl = document.createElement('div');
  logEl.className = `log ${type}`;
  logEl.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  consoleEl.appendChild(logEl);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ============ Display Updates ============

function updateThemeDisplay() {
  const el = document.getElementById('theme-value');
  if (el) {
    el.textContent = ThemeManager.getCurrentTheme() || '-';
  }
}

function updateStatusDisplays() {
  const readyEl = document.getElementById('ready-status');
  const transEl = document.getElementById('transition-status');

  if (readyEl) readyEl.textContent = ThemeManager.state.ready ? 'Yes ✅' : 'No';
  if (transEl) transEl.textContent = ThemeManager.state.transitioning ? 'Yes ⏳' : 'No';
}

function updateVariablesDisplay() {
  const display = document.getElementById('variables-display');
  if (!display) return;

  const vars = ThemeManager.getAppliedVariables();

  if (Object.keys(vars).length === 0) {
    display.innerHTML = '<p class="text-muted">No variables applied.</p>';
    return;
  }

  display.innerHTML = Object.entries(vars).map(([name, value]) => {
    const isColor = value.startsWith('#') || value.startsWith('rgb');
    const isUrl = value.startsWith('url(');
    return `
      <div class="variable-item">
        ${isColor ? `<span class="color-swatch" style="background: ${value};"></span>` : ''}
        <span class="variable-name">${name}:</span>&nbsp;
        <span class="variable-value">${isUrl ? '[URL]' : value}</span>
      </div>
    `;
  }).join('');
}

// ============ API Config Loading ============

async function loadConfig(url) {
  log(`📡 Loading config: ${url}...`, 'info');
  try {
    await ThemeManager.loadFromAPI(url);
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
  }
}

// ============ Transition Test ============

async function testTransition() {
  log('⏳ Testing transition...', 'info');
  updateStatusDisplays();

  // Toggle theme to trigger transition
  ThemeManager.toggle();

  // Update status while transitioning
  setTimeout(updateStatusDisplays, 50);
  setTimeout(updateStatusDisplays, 400);
}

// ============ Security Tests ============

function testXSS() {
  log('🔒 Testing XSS payloads...', 'warn');

  const malicious = {
    '--color': 'red; background: url(javascript:alert(1))',
    '--bg': 'expression(alert("xss"))',
    '--text': '<script>alert("xss")</script>',
    '--safe-color': '#ff0000'
  };

  const applied = ThemeManager.applyVariables(malicious);
  const statusEl = document.getElementById('security-status');

  const blocked = !applied['--color']?.includes('javascript:') &&
    !applied['--bg']?.includes('expression') &&
    !applied['--text']?.includes('<script');
  const safePass = applied['--safe-color'] === '#ff0000';

  if (blocked && safePass) {
    statusEl.innerHTML = '<span class="status-badge success">✅ XSS Blocked!</span>';
    log('✅ Security test passed', 'success');
  } else {
    statusEl.innerHTML = '<span class="status-badge error">❌ Security Issue!</span>';
    log('❌ Security test failed', 'error');
  }

  updateVariablesDisplay();
}

function testInvalidProps() {
  log('🔒 Testing invalid properties...', 'warn');

  const invalid = {
    'onclick': 'alert(1)',
    'background': 'red',
    'color': 'blue',
    '--valid-prop': 'green'
  };

  const applied = ThemeManager.applyVariables(invalid);
  const statusEl = document.getElementById('security-status');

  const blocked = !('onclick' in applied) &&
    !('background' in applied) &&
    !('color' in applied);
  const validPass = '--valid-prop' in applied;

  if (blocked && validPass) {
    statusEl.innerHTML = '<span class="status-badge success">✅ Invalid Props Rejected!</span>';
    log('✅ Only CSS custom properties (--*) allowed', 'success');
  } else {
    statusEl.innerHTML = '<span class="status-badge error">❌ Security Issue!</span>';
    log('❌ Security test failed', 'error');
  }

  updateVariablesDisplay();
}
