/**
 * API Integration Examples
 * Demonstrates HTTP Client usage, Loading States, and Error Handling
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize framework
    await Now.init({
      environment: 'production',

      i18n: {
        enabled: true,
        availableLocales: ['en', 'th']
      },

      theme: {
        enabled: true
      },

      syntaxhighlighter: {
        display: {
          lineNumbers: true,
          copyButton: true
        }
      }
    }).then(() => {
      // Load application components
      const scripts = [
        '../header.js',
        '../../js/components/footer.js',
        '../../js/components/SyntaxHighlighterComponent.js'
      ];

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

    // Initialize examples
    initializeExamples();

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

// ============================================
// Example 1: User List with Loading States
// ============================================

function createSkeletonCards(count) {
  return Array(count).fill(0).map(() => `
    <div class="card skeleton">
      <div class="skeleton-header"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  `).join('');
}

async function loadUsers(simulateError = false) {
  const container = document.getElementById('userListContainer');

  // Show loading skeleton
  container.innerHTML = createSkeletonCards(6);

  try {
    const url = simulateError
      ? 'https://jsonplaceholder.typicode.com/invalid-endpoint'
      : 'https://jsonplaceholder.typicode.com/users';

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const users = await response.json();

    // Simulate network delay for better UX demonstration
    await new Promise(resolve => setTimeout(resolve, 500));

    // Render user cards
    container.innerHTML = users.map(user => `
      <div class="card fade-in">
        <div class="card-header">
          <div class="user-avatar">${user.name.charAt(0)}</div>
          <h3>${user.name}</h3>
        </div>
        <div class="card-body">
          <p><span class="icon-mail"></span> ${user.email}</p>
          <p><span class="icon-phone"></span> ${user.phone}</p>
          <p><span class="icon-office"></span> ${user.company.name}</p>
          <p><span class="icon-map-pin"></span> ${user.address.city}</p>
        </div>
      </div>
    `).join('');

  } catch (error) {
    // Show error state
    container.innerHTML = `
      <div class="error-state">
        <div class="error-icon icon-alert-circle"></div>
        <h3>Failed to load users</h3>
        <p class="error-message">${error.message}</p>
        <button onclick="loadUsers()" class="button primary">
          <span class="icon-stack"></span> Retry
        </button>
      </div>
    `;
  }
}

// ============================================
// Example 2: Weather Widget
// ============================================

let autoRefreshInterval = null;

async function loadWeather() {
  const widget = document.getElementById('weatherWidget');

  // Show loading spinner
  widget.innerHTML = `
    <div class="weather-loading">
      <div class="spinner"></div>
      <p>Loading weather data...</p>
    </div>
  `;

  try {
    // Using wttr.in API (no key required)
    const response = await fetch('https://wttr.in/Bangkok?format=j1');

    if (!response.ok) throw new Error('Weather API failed');

    const data = await response.json();
    const current = data.current_condition[0];

    // Render weather data
    widget.innerHTML = `
      <div class="weather-content fade-in">
        <div class="weather-header">
          <h3>Bangkok, Thailand</h3>
          <img src="https://cdn.weatherapi.com/weather/64x64/day/116.png" alt="Weather icon">
        </div>
        <div class="weather-temp">${current.temp_C}°C</div>
        <p class="weather-desc">${current.weatherDesc[0].value}</p>
        <div class="weather-details">
          <div class="weather-detail">
            <span class="icon-droplet"></span>
            <span>Humidity: ${current.humidity}%</span>
          </div>
          <div class="weather-detail">
            <span class="icon-wind"></span>
            <span>Wind: ${current.windspeedKmph} km/h</span>
          </div>
          <div class="weather-detail">
            <span class="icon-published1"></span>
            <span>Visibility: ${current.visibility} km</span>
          </div>
        </div>
        <small class="weather-updated">Last updated: ${new Date().toLocaleTimeString()}</small>
      </div>
    `;

  } catch (error) {
    widget.innerHTML = `
      <div class="error-state">
        <p>Failed to load weather data</p>
        <p class="error-message">${error.message}</p>
        <button onclick="loadWeather()" class="button">Retry</button>
      </div>
    `;
  }
}

function toggleAutoRefresh() {
  const btn = document.getElementById('toggleAutoRefresh');

  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    btn.textContent = 'Enable Auto-Refresh';
    btn.classList.remove('active');
  } else {
    autoRefreshInterval = setInterval(loadWeather, 30000);
    btn.textContent = 'Disable Auto-Refresh';
    btn.classList.add('active');
    loadWeather(); // Load immediately
  }
}

// ============================================
// Example 3: Product Search with Debounce
// ============================================

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function searchProducts(query) {
  const resultsContainer = document.getElementById('productResults');
  const loadingIndicator = document.getElementById('searchLoading');

  if (!query.trim()) {
    resultsContainer.innerHTML = '<p class="text-muted">Type to search products...</p>';
    return;
  }

  // Show loading
  loadingIndicator.style.display = 'flex';

  try {
    const response = await fetch(
      `https://dummyjson.com/products/search?q=${encodeURIComponent(query)}&limit=12`
    );

    const data = await response.json();

    // Hide loading
    loadingIndicator.style.display = 'none';

    if (data.products.length === 0) {
      resultsContainer.innerHTML = '<p class="no-results">No products found</p>';
      return;
    }

    // Render results
    resultsContainer.innerHTML = data.products.map(product => `
      <div class="product-card fade-in">
        <img src="${product.thumbnail}" alt="${product.title}" loading="lazy">
        <div class="product-info">
          <h4>${product.title}</h4>
          <p class="product-brand">${product.brand || 'Generic'}</p>
          <div class="product-footer">
            <span class="price">$${product.price}</span>
            <span class="rating">⭐ ${product.rating.toFixed(1)}</span>
          </div>
        </div>
      </div>
    `).join('');

  } catch (error) {
    loadingIndicator.style.display = 'none';
    resultsContainer.innerHTML = `<p class="error">Search failed: ${error.message}</p>`;
  }
}

// ============================================
// Example 4: Form Submission
// ============================================

function showFeedback(type, message) {
  const container = document.getElementById('formFeedback');
  const icon = type === 'success' ? 'icon-check-circle' : 'icon-alert-circle';

  container.innerHTML = `
    <div class="alert alert-${type} fade-in">
      <span class="${icon}"></span>
      <span>${message}</span>
    </div>
  `;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    container.innerHTML = '';
  }, 5000);
}

async function createUser(userData) {
  const submitBtn = document.getElementById('submitBtn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');

  // Show loading state
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline-flex';
  submitBtn.disabled = true;

  try {
    const response = await fetch('https://reqres.in/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData)
    });

    if (!response.ok) throw new Error('Failed to create user');

    const result = await response.json();

    // Show success message
    showFeedback('success', `User created successfully! ID: ${result.id}`);

    // Reset form
    document.getElementById('userForm').reset();

  } catch (error) {
    showFeedback('error', `Error: ${error.message}`);
  } finally {
    // Hide loading state
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    submitBtn.disabled = false;
  }
}

async function updateUser(userId, userData) {
  const updateBtn = document.getElementById('updateBtn');
  updateBtn.disabled = true;
  updateBtn.innerHTML = '<div class="spinner-small"></div> Updating...';

  try {
    const response = await fetch(`https://reqres.in/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData)
    });

    if (!response.ok) throw new Error('Failed to update user');

    const result = await response.json();
    showFeedback('success', 'User updated successfully!');

  } catch (error) {
    showFeedback('error', `Error: ${error.message}`);
  } finally {
    updateBtn.disabled = false;
    updateBtn.textContent = 'Update User';
  }
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;

  const deleteBtn = document.getElementById('deleteBtn');
  deleteBtn.disabled = true;
  deleteBtn.innerHTML = '<div class="spinner-small"></div> Deleting...';

  try {
    const response = await fetch(`https://reqres.in/api/users/${userId}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete user');

    showFeedback('success', 'User deleted successfully!');
    document.getElementById('userForm').reset();

  } catch (error) {
    showFeedback('error', `Error: ${error.message}`);
  } finally {
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Delete User';
  }
}

// ============================================
// Example 5: Multiple API Calls
// ============================================

function showLoadingState() {
  const cards = ['statsCard', 'postsCard', 'todosCard'];
  cards.forEach(cardId => {
    document.getElementById(cardId).innerHTML = `
      <h3>${cardId.replace('Card', '').replace(/([A-Z])/g, ' $1').trim()}</h3>
      <div class="loading-placeholder">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    `;
  });
}

function showErrorState() {
  const cards = ['statsCard', 'postsCard', 'todosCard'];
  cards.forEach(cardId => {
    document.getElementById(cardId).innerHTML = `
      <h3>Error</h3>
      <div class="error-state">
        <p>Failed to load data</p>
        <button onclick="loadDashboard()" class="button">Retry</button>
      </div>
    `;
  });
}

async function loadDashboard() {
  try {
    // Show loading state for all cards
    showLoadingState();

    // Fetch all data concurrently
    const [users, posts, todos] = await Promise.all([
      fetch('https://jsonplaceholder.typicode.com/users').then(r => r.json()),
      fetch('https://jsonplaceholder.typicode.com/posts?_limit=5').then(r => r.json()),
      fetch('https://jsonplaceholder.typicode.com/todos?_limit=8').then(r => r.json())
    ]);

    // Simulate delay for demo
    await new Promise(resolve => setTimeout(resolve, 500));

    // Render statistics
    document.getElementById('statsCard').innerHTML = `
      <h3>Statistics</h3>
      <div class="stats fade-in">
        <div class="stat-item">
          <div class="stat-icon icon-users"></div>
          <div class="stat-content">
            <span class="stat-value">${users.length}</span>
            <span class="stat-label">Total Users</span>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-icon icon-file"></div>
          <div class="stat-content">
            <span class="stat-value">${posts.length}</span>
            <span class="stat-label">Recent Posts</span>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-icon icon-valid"></div>
          <div class="stat-content">
            <span class="stat-value">${todos.filter(t => t.completed).length}</span>
            <span class="stat-label">Completed Tasks</span>
          </div>
        </div>
      </div>
    `;

    // Render posts
    document.getElementById('postsCard').innerHTML = `
      <h3>Recent Posts</h3>
      <ul class="post-list fade-in">
        ${posts.map(post => `
          <li class="post-item">
            <strong>${post.title}</strong>
            <p>${post.body.substring(0, 60)}...</p>
          </li>
        `).join('')}
      </ul>
    `;

    // Render todos
    document.getElementById('todosCard').innerHTML = `
      <h3>Tasks</h3>
      <ul class="todo-list fade-in">
        ${todos.map(todo => `
          <li class="todo-item ${todo.completed ? 'completed' : ''}">
            <span class="todo-checkbox ${todo.completed ? 'checked' : ''}">
              ${todo.completed ? '✓' : ''}
            </span>
            <span class="todo-text">${todo.title}</span>
          </li>
        `).join('')}
      </ul>
    `;

  } catch (error) {
    console.error('Dashboard load failed:', error);
    showErrorState();
  }
}

// ============================================
// Example 6: Retry Mechanism
// ============================================

function logMessage(message, type = 'info') {
  const logContainer = document.getElementById('retryLog');
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type} fade-in`;

  const timestamp = new Date().toLocaleTimeString();
  entry.innerHTML = `
    <span class="log-time">[${timestamp}]</span>
    <span class="log-message">${message}</span>
  `;

  logContainer.appendChild(entry);

  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;
}

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      logMessage(`Attempt ${i + 1}/${maxRetries}...`, 'info');

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      logMessage('✓ Success!', 'success');
      return await response.json();

    } catch (error) {
      lastError = error;
      logMessage(`✗ Failed: ${error.message}`, 'error');

      // Don't wait after last attempt
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s
        logMessage(`Waiting ${delay}ms before retry...`, 'warning');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

async function testRetry() {
  const logContainer = document.getElementById('retryLog');
  logContainer.innerHTML = '<h4>Retry Log:</h4>';

  try {
    // This endpoint returns 500 error, will trigger retries
    const data = await fetchWithRetry('https://httpstat.us/500', {}, 3);
  } catch (error) {
    logMessage(`Final error: ${error.message}`, 'error');
  }
}

// ============================================
// Initialize All Examples
// ============================================

function initializeExamples() {
  // Example 1: User List
  document.getElementById('loadUsers')?.addEventListener('click', () => loadUsers(false));
  document.getElementById('refreshUsers')?.addEventListener('click', () => loadUsers(false));
  document.getElementById('simulateError')?.addEventListener('click', () => loadUsers(true));

  // Example 2: Weather Widget
  document.getElementById('loadWeather')?.addEventListener('click', loadWeather);
  document.getElementById('toggleAutoRefresh')?.addEventListener('click', toggleAutoRefresh);

  // Example 3: Product Search
  const debouncedSearch = debounce(searchProducts, 500);
  document.getElementById('productSearch')?.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  // Example 4: Form Submission
  document.getElementById('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const userData = {
      name: document.getElementById('userName').value,
      email: document.getElementById('userEmail').value,
      job: document.getElementById('userJob').value
    };

    await createUser(userData);
  });

  document.getElementById('updateBtn')?.addEventListener('click', async () => {
    const userData = {
      name: document.getElementById('userName').value,
      email: document.getElementById('userEmail').value,
      job: document.getElementById('userJob').value
    };

    await updateUser(2, userData); // Using ID 2 as example
  });

  document.getElementById('deleteBtn')?.addEventListener('click', async () => {
    await deleteUser(2); // Using ID 2 as example
  });

  // Example 5: Dashboard
  document.getElementById('loadDashboard')?.addEventListener('click', loadDashboard);

  // Example 6: Retry
  document.getElementById('testRetry')?.addEventListener('click', testRetry);

  console.log('API Integration examples initialized');
}

// Make functions globally available
window.loadUsers = loadUsers;
window.loadWeather = loadWeather;
window.toggleAutoRefresh = toggleAutoRefresh;
window.loadDashboard = loadDashboard;
window.testRetry = testRetry;
