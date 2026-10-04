# API Integration Example

ตัวอย่างการเชื่อมต่อ API ด้วย Now.js Framework

## Features

ตัวอย่างนี้แสดงการใช้งาน HTTP Client:

- **Loading States** - Skeleton loading และ spinner
- **Error Handling** - แสดง error และ retry
- **Debounce Search** - ค้นหาแบบ debounce
- **Form Submission** - POST, PUT, DELETE
- **Concurrent Requests** - Promise.all
- **Retry Mechanism** - Exponential backoff
- **Auto-Refresh** - Refresh อัตโนมัติ
- **Best Practices** - แนวทางที่ดี

## Examples

### 1. User List with Loading States

```javascript
async function loadUsers() {
  const container = document.getElementById('userListContainer');

  // Show skeleton loading
  container.innerHTML = createSkeletonCards(6);

  try {
    const response = await fetch('https://api.example.com/users');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const users = await response.json();
    container.innerHTML = renderUsers(users);

  } catch (error) {
    container.innerHTML = `
      <div class="error-state">
        <h3>Failed to load users</h3>
        <p>${error.message}</p>
        <button onclick="loadUsers()">Retry</button>
      </div>
    `;
  }
}
```

### 2. Debounce Search

```javascript
// Debounce function
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Search with debounce
async function searchProducts(query) {
  if (!query.trim()) return;

  showLoading();

  try {
    const response = await fetch(
      `https://api.example.com/search?q=${encodeURIComponent(query)}`
    );
    const data = await response.json();
    renderResults(data.products);
  } catch (error) {
    showError(error.message);
  } finally {
    hideLoading();
  }
}

// Attach debounced search (500ms delay)
const debouncedSearch = debounce(searchProducts, 500);
document.getElementById('searchInput')
  .addEventListener('input', e => debouncedSearch(e.target.value));
```

### 3. Form Submission (POST/PUT/DELETE)

```javascript
// CREATE (POST)
async function createUser(userData) {
  const response = await fetch('https://api.example.com/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });

  if (!response.ok) throw new Error('Failed to create');
  return response.json();
}

// UPDATE (PUT)
async function updateUser(id, userData) {
  const response = await fetch(`https://api.example.com/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });

  if (!response.ok) throw new Error('Failed to update');
  return response.json();
}

// DELETE
async function deleteUser(id) {
  const response = await fetch(`https://api.example.com/users/${id}`, {
    method: 'DELETE'
  });

  if (!response.ok) throw new Error('Failed to delete');
  return true;
}
```

### 4. Concurrent Requests (Promise.all)

```javascript
async function loadDashboard() {
  showLoadingState();

  try {
    // Fetch all data concurrently
    const [users, posts, todos] = await Promise.all([
      fetch('https://api.example.com/users').then(r => r.json()),
      fetch('https://api.example.com/posts').then(r => r.json()),
      fetch('https://api.example.com/todos').then(r => r.json())
    ]);

    renderStats(users);
    renderPosts(posts);
    renderTodos(todos);

  } catch (error) {
    showErrorState();
  }
}
```

### 5. Retry with Exponential Backoff

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempt ${i + 1}/${maxRetries}...`);

      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      lastError = error;
      console.log(`Failed: ${error.message}`);

      if (i < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, i) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts`);
}
```

### 6. Auto-Refresh

```javascript
let autoRefreshInterval = null;

function toggleAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  } else {
    // Refresh every 30 seconds
    autoRefreshInterval = setInterval(loadData, 30000);
    loadData(); // Load immediately
  }
}
```

## Best Practices

### 1. Always Handle Errors

```javascript
try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
} catch (error) {
  console.error('Request failed:', error);
  // Show user-friendly error message
}
```

### 2. Use Loading States

```javascript
setLoading(true);

try {
  const data = await fetchData();
  renderData(data);
} finally {
  // Always hide loading, even on error
  setLoading(false);
}
```

### 3. Set Timeouts

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch(url, {
    signal: controller.signal
  });
  clearTimeout(timeoutId);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request timeout');
  }
}
```

### 4. Cache Responses

```javascript
const cache = new Map();

async function fetchWithCache(url, ttl = 60000) {
  const cached = cache.get(url);

  // Return cached if still valid
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  const data = await fetch(url).then(r => r.json());
  cache.set(url, { data, timestamp: Date.now() });

  return data;
}
```

### 5. Button Loading States

```javascript
async function handleSubmit(btn) {
  const originalText = btn.textContent;

  // Show loading
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Processing...';

  try {
    await submitData();
  } finally {
    // Restore button
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
```

## Loading UI Patterns

### Skeleton Loading

```html
<div class="skeleton">
  <div class="skeleton-header"></div>
  <div class="skeleton-line"></div>
  <div class="skeleton-line short"></div>
</div>
```

```css
.skeleton-line {
  height: 1rem;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Spinner

```html
<div class="spinner"></div>
```

```css
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}
```

## Error Handling UI

```html
<div class="error-state">
  <div class="error-icon">⚠️</div>
  <h3>Failed to load data</h3>
  <p class="error-message">Network error</p>
  <button onclick="retry()" class="btn">Retry</button>
</div>
```

## File Structure

```
api-integration/
├── index.html      # Demo page with all examples
├── main.js         # JavaScript with all API functions
└── styles.css      # Loading states, skeleton, error styles
```

## Public APIs Used

| API | Purpose |
|-----|---------|
| JSONPlaceholder | Users, Posts, Todos |
| DummyJSON | Product search |
| Reqres.in | Form submission (POST/PUT/DELETE) |
| wttr.in | Weather data |
| httpstat.us | Error simulation |

## Dependencies

- `Now.js Framework` - Core framework
- No additional HTTP client required (uses native `fetch`)
