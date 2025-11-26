# Now.js CDN Setup Guide (jsDelivr)

## 🚀 Quick Start

### Step 1: Push to GitHub

```bash
cd /mnt/Server/htdocs/Now

# Add dist files to git
git add Now/dist/

# Commit
git commit -m "Add production bundles for CDN"

# Push to GitHub
git push origin main

# Create version tag (recommended)
git tag v1.0.0
git push origin v1.0.0
```

### Step 2: Use from jsDelivr

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>Now.js from CDN</title>

  <!-- Core CSS from jsDelivr -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/YOUR_GITHUB_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.css">
</head>
<body>
  <div id="app"></div>

  <!-- Core JS from jsDelivr -->
  <script src="https://cdn.jsdelivr.net/gh/YOUR_GITHUB_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.js"></script>

  <!-- Optional: Load modules as needed -->
  <script src="https://cdn.jsdelivr.net/gh/YOUR_GITHUB_USERNAME/now-js@v1.0.0/Now/dist/now.table.min.js"></script>

  <script>
    Now.init({
      environment: 'production',
      debug: false
    });
  </script>
</body>
</html>
```

---

## 📦 Available Bundles

### Core (Required)
```html
<!-- CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.css">

<!-- JavaScript -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.js"></script>
```

**Size:** 607 KB JS (150 KB gzipped) + 92 KB CSS (18 KB gzipped)

### Optional Modules

```html
<!-- Table Manager (65 KB) -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.table.min.js"></script>

<!-- Media Viewer (8.6 KB + 3.2 KB CSS) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.media.min.css">
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.media.min.js"></script>

<!-- Graph Renderer (46 KB) -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.graph.min.js"></script>

<!-- Tabs Component (6.7 KB + 4.6 KB CSS) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.tabs.min.css">
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.tabs.min.js"></script>

<!-- Sortable (Drag & Drop) (7.8 KB) -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.sortable.min.js"></script>

<!-- Service Worker Manager (9.9 KB) -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.serviceworker.min.js"></script>

<!-- Queue Manager (16.8 KB) -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.queue.min.js"></script>
```

---

## 🔧 Advanced Usage

### 1. Performance Optimization

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">

  <!-- DNS Prefetch -->
  <link rel="dns-prefetch" href="//cdn.jsdelivr.net">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>

  <!-- Preload Critical Resources -->
  <link rel="preload"
        href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.css"
        as="style">
  <link rel="preload"
        href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.js"
        as="script">

  <!-- Core CSS -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.css">
</head>
<body>
  <!-- Core JS with defer -->
  <script defer src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.js"></script>
</body>
</html>
```

### 2. Lazy Loading Optional Modules

```javascript
// Load table module only when needed
async function loadTableModule() {
  if (!window.TableManager) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.table.min.js';
    await new Promise((resolve) => {
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }
  return window.TableManager;
}

// Usage
document.querySelector('#load-table').addEventListener('click', async () => {
  const TableManager = await loadTableModule();
  // Use TableManager...
});
```

### 3. Version Management

```html
<!-- Latest version (not recommended for production) -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@main/Now/dist/now.core.min.js"></script>

<!-- Specific version (recommended) -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.js"></script>

<!-- Specific commit (for testing) -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@abc123/Now/dist/now.core.min.js"></script>
```

---

## 🔒 Security Best Practices

### 1. Subresource Integrity (SRI)

Generate SRI hash:
```bash
# For Linux/Mac
openssl dgst -sha384 -binary Now/dist/now.core.min.js | openssl base64 -A

# Or use online tool: https://www.srihash.org/
```

Use with SRI:
```html
<script
  src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.js"
  integrity="sha384-HASH_HERE"
  crossorigin="anonymous">
</script>
```

### 2. Content Security Policy

```html
<meta http-equiv="Content-Security-Policy"
      content="script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://cdn.jsdelivr.net;">
```

---

## 📊 CDN Features

### jsDelivr Benefits
- ✅ **Free** for open source
- ✅ **Global CDN** powered by Cloudflare, Fastly, and more
- ✅ **Auto-minify** and compression
- ✅ **HTTP/2** and **HTTP/3** support
- ✅ **99.9% uptime** SLA
- ✅ **No bandwidth limits**
- ✅ **Automatic failover** to multiple CDN providers

### Cache Control
jsDelivr automatically sets optimal cache headers:
- **Immutable versions** (with tag): Cached for 1 year
- **Latest/main branch**: Cached for 12 hours

### Purge Cache
If you need to purge cache:
```
https://purge.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.js
```

---

## 🎯 Complete Example

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Now.js from jsDelivr CDN</title>

  <!-- Performance Optimization -->
  <link rel="dns-prefetch" href="//cdn.jsdelivr.net">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>

  <!-- Now.js Core CSS -->
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.css">
</head>
<body>
  <div id="app">
    <h1>Now.js from CDN</h1>
    <button id="load-table">Load Table Module</button>
  </div>

  <!-- Now.js Core -->
  <script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.core.min.js"></script>

  <!-- Initialize -->
  <script>
    Now.init({
      environment: 'production',
      debug: false,
      i18n: {
        enabled: true,
        defaultLanguage: 'th'
      }
    });

    // Lazy load table module
    document.getElementById('load-table').addEventListener('click', async () => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.0/Now/dist/now.table.min.js';
      await new Promise(resolve => {
        script.onload = resolve;
        document.head.appendChild(script);
      });

      console.log('Table module loaded!', window.TableManager);
    });
  </script>
</body>
</html>
```

---

## 🔄 Update Workflow

### 1. Make changes and build
```bash
npm run build
```

### 2. Commit and tag
```bash
git add Now/dist/
git commit -m "Release v1.0.1"
git tag v1.0.1
git push origin main
git push origin v1.0.1
```

### 3. Update HTML references
```html
<!-- Change version number -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/now-js@v1.0.1/Now/dist/now.core.min.js"></script>
```

---

## 📝 Notes

1. **Replace `YOUR_USERNAME`** with your actual GitHub username
2. **Always use version tags** for production (e.g., `@v1.0.0`)
3. **Test thoroughly** before deploying new versions
4. **Keep dist/ in git** for jsDelivr to serve files
5. **Use SRI hashes** for additional security

---

## 🆘 Troubleshooting

### CDN not updating?
- Wait 12 hours for cache to expire
- Or purge cache: `https://purge.jsdelivr.net/gh/...`

### Files not found?
- Check if files exist in GitHub repository
- Verify the path and version tag
- Wait a few minutes for jsDelivr to sync

### Slow loading?
- Use version tags (not `@main`)
- Enable preload/prefetch
- Consider using multiple CDN providers as fallback

---

## 🔗 Useful Links

- [jsDelivr Documentation](https://www.jsdelivr.com/documentation)
- [GitHub Repository](https://github.com/YOUR_USERNAME/now-js)
- [SRI Hash Generator](https://www.srihash.org/)
- [CDN Performance Test](https://www.cdnperf.com/)
