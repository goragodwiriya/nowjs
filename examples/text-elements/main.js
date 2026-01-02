/**
 * Text Elements Example - main.js
 * Demonstrates TextElement and related input components
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

    console.log('Text Elements Example ready');
    setupDynamicOptionsDemo();
    setupSearchDemo();
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

// =====================================================
// Static Data Sources (Global Variables)
// =====================================================

// Programming Languages
window.PROGRAMMING_LANGUAGES = [
  {value: 'js', text: 'JavaScript'},
  {value: 'ts', text: 'TypeScript'},
  {value: 'py', text: 'Python'},
  {value: 'java', text: 'Java'},
  {value: 'csharp', text: 'C#'},
  {value: 'cpp', text: 'C++'},
  {value: 'go', text: 'Go'},
  {value: 'rust', text: 'Rust'},
  {value: 'php', text: 'PHP'},
  {value: 'ruby', text: 'Ruby'},
  {value: 'swift', text: 'Swift'},
  {value: 'kotlin', text: 'Kotlin'},
  {value: 'scala', text: 'Scala'},
  {value: 'r', text: 'R'},
  {value: 'dart', text: 'Dart'}
];

// Fruits with emoji
window.FRUITS = [
  {value: 'apple', text: 'Apple', emoji: '🍎'},
  {value: 'banana', text: 'Banana', emoji: '🍌'},
  {value: 'orange', text: 'Orange', emoji: '🍊'},
  {value: 'grape', text: 'Grape', emoji: '🍇'},
  {value: 'strawberry', text: 'Strawberry', emoji: '🍓'},
  {value: 'watermelon', text: 'Watermelon', emoji: '🍉'},
  {value: 'mango', text: 'Mango', emoji: '🥭'},
  {value: 'pineapple', text: 'Pineapple', emoji: '🍍'},
  {value: 'cherry', text: 'Cherry', emoji: '🍒'},
  {value: 'peach', text: 'Peach', emoji: '🍑'},
  {value: 'lemon', text: 'Lemon', emoji: '🍋'},
  {value: 'coconut', text: 'Coconut', emoji: '🥥'}
];

// Cities
window.CITIES = [
  {value: 'bkk', text: 'Bangkok'},
  {value: 'cnx', text: 'Chiang Mai'},
  {value: 'hkt', text: 'Phuket'},
  {value: 'kkc', text: 'Khon Kaen'},
  {value: 'hdyh', text: 'Hat Yai'},
  {value: 'nkp', text: 'Nakhon Pathom'},
  {value: 'udon', text: 'Udon Thani'},
  {value: 'ray', text: 'Rayong'},
  {value: 'srr', text: 'Surat Thani'},
  {value: 'nst', text: 'Nakhon Si Thammarat'},
  {value: 'tokyo', text: 'Tokyo'},
  {value: 'osaka', text: 'Osaka'},
  {value: 'singapore', text: 'Singapore'},
  {value: 'hongkong', text: 'Hong Kong'},
  {value: 'seoul', text: 'Seoul'}
];

// Skills for tags
window.SKILLS = [
  {value: 'html', text: 'HTML'},
  {value: 'css', text: 'CSS'},
  {value: 'javascript', text: 'JavaScript'},
  {value: 'typescript', text: 'TypeScript'},
  {value: 'react', text: 'React'},
  {value: 'vue', text: 'Vue.js'},
  {value: 'angular', text: 'Angular'},
  {value: 'nodejs', text: 'Node.js'},
  {value: 'python', text: 'Python'},
  {value: 'django', text: 'Django'},
  {value: 'flask', text: 'Flask'},
  {value: 'php', text: 'PHP'},
  {value: 'laravel', text: 'Laravel'},
  {value: 'mysql', text: 'MySQL'},
  {value: 'postgresql', text: 'PostgreSQL'},
  {value: 'mongodb', text: 'MongoDB'},
  {value: 'redis', text: 'Redis'},
  {value: 'docker', text: 'Docker'},
  {value: 'kubernetes', text: 'Kubernetes'},
  {value: 'aws', text: 'AWS'},
  {value: 'gcp', text: 'Google Cloud'},
  {value: 'azure', text: 'Azure'},
  {value: 'git', text: 'Git'},
  {value: 'cicd', text: 'CI/CD'}
];

// =====================================================
// Custom Render Callbacks
// =====================================================

/**
 * Custom render callback for fruit autocomplete items
 * Shows fruit emoji + name
 */
window.renderFruitItem = function({key, value, search, level}) {
  const fruit = FRUITS.find(f => f.value === key);
  const emoji = fruit?.emoji || '🍎';

  const container = document.createElement('div');
  container.className = 'fruit-item';
  container.innerHTML = `
    <span class="fruit-emoji">${emoji}</span>
    <span class="fruit-name">${value}</span>
  `;
  return container;
};

/**
 * Custom render callback for customer autocomplete
 * Shows name, email, and phone
 */
window.renderCustomerItem = function({key, value, search}) {
  // Parse value (may contain additional data)
  const container = document.createElement('div');
  container.className = 'customer-item';

  // If value is JSON string with customer data
  try {
    const data = typeof value === 'object' ? value : {name: value};
    container.innerHTML = `
      <div class="customer-name"><strong>${data.name || value}</strong></div>
      ${data.email ? `<div class="customer-email"><small>${data.email}</small></div>` : ''}
      ${data.phone ? `<div class="customer-phone"><small>${data.phone}</small></div>` : ''}
    `;
  } catch (e) {
    container.textContent = value;
  }

  return container;
};

// =====================================================
// Application Initialization Functions
// =====================================================

/**
 * Setup dynamic options loading demo
 */
function setupDynamicOptionsDemo() {
  const loadBtn = document.getElementById('load-options-btn');
  const clearBtn = document.getElementById('clear-options-btn');
  const input = document.getElementById('dynamic_field');

  if (!loadBtn || !input) return;

  // Sample dynamic options
  const dynamicOptions = {
    dynamicItems: [
      {value: 'opt1', text: 'Dynamic Option 1'},
      {value: 'opt2', text: 'Dynamic Option 2'},
      {value: 'opt3', text: 'Dynamic Option 3'},
      {value: 'opt4', text: 'Dynamic Option 4'},
      {value: 'opt5', text: 'Dynamic Option 5'},
      {value: 'special', text: '⭐ Special Option'},
      {value: 'premium', text: '💎 Premium Option'},
      {value: 'new', text: '🆕 New Option'}
    ]
  };

  loadBtn.addEventListener('click', () => {
    // Use TextElementFactory to populate options
    if (window.TextElementFactory) {
      TextElementFactory.populateFromOptions(input, dynamicOptions, 'dynamicItems');
      NotificationManager?.show('Options loaded successfully!', 'success');
    } else {
      console.error('TextElementFactory not available');
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    // Get instance and clear options
    const instance = ElementManager?.getInstanceByElement(input);
    if (instance) {
      instance.config.autocomplete.source = null;
      instance.config.autocomplete.enabled = false;
      if (instance.hiddenInput) {
        instance.hiddenInput.value = '';
      }
    }
    NotificationManager?.show('Options cleared', 'info');
  });
}

/**
 * Setup search demo with live results
 */
function setupSearchDemo() {
  const searchInput = document.getElementById('global_search');
  const resultsContainer = document.getElementById('search-results');
  const resultsList = document.getElementById('results-list');

  if (!searchInput || !resultsContainer) return;

  // Sample searchable data
  const searchData = [
    {id: 1, title: 'Getting Started with Now.js', category: 'Tutorial'},
    {id: 2, title: 'Form Validation Guide', category: 'Guide'},
    {id: 3, title: 'API Integration Examples', category: 'Example'},
    {id: 4, title: 'Component Architecture', category: 'Documentation'},
    {id: 5, title: 'State Management', category: 'Guide'},
    {id: 6, title: 'Router Configuration', category: 'Documentation'},
    {id: 7, title: 'Authentication & Security', category: 'Guide'},
    {id: 8, title: 'Modal & Dialog Usage', category: 'Example'},
    {id: 9, title: 'Table & DataGrid', category: 'Example'},
    {id: 10, title: 'Calendar Components', category: 'Example'}
  ];

  // Simple debounce function
  let debounceTimer;
  const debounce = (callback, delay) => {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => callback.apply(this, args), delay);
    };
  };

  const handleSearch = debounce((query) => {
    if (!query || query.length < 2) {
      resultsContainer.style.display = 'none';
      return;
    }

    // Filter results
    const filtered = searchData.filter(item =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
    );

    // Display results
    if (filtered.length > 0) {
      resultsList.innerHTML = filtered.map(item => `
        <li>
          <strong>${item.title}</strong>
          <span class="category">${item.category}</span>
        </li>
      `).join('');
      resultsContainer.style.display = 'block';
    } else {
      resultsList.innerHTML = '<li>No results found</li>';
      resultsContainer.style.display = 'block';
    }
  }, 300);

  searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value.trim());
  });

  // Clear results on escape
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resultsContainer.style.display = 'none';
    }
  });
}
