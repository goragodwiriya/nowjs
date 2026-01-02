/**
* Navigation Component
*/
Now.getManager('component').define('header', {
  template:
    `<header id="navbar" class="navbar">
      <div class="container nav-content">
        <a href="https://nowjs.net" class="logo">
          <span class="logo-icon icon-clock"></span>
          <span>now<span style="color: var(--text-accent)">js</span></span>
        </a>

        <nav class="topmenu responsive-menu" data-component="menu">
          <ul>
            <li><a href="https://nowjs.net" class="icon-home" data-i18n>Home</a></li>
            <li><a href="https://nowjs.net/features.html" data-i18n>Features</a></li>
            <li><a href="https://nowjs.net/examples.html" data-i18n>Examples</a></li>
            <li><a href="https://docs.nowjs.net" data-i18n>Documentation</a></li>
          </ul>
        </nav>

        <div class="nav-actions">
          <button data-component="theme" class="nav-link" title="Toggle theme"></button>
          <button class="menu-toggle topmenu-toggle" aria-label="Toggle menu">
            <span class="toggle-icon">
              <span class="toggle-bar"></span>
              <span class="toggle-bar"></span>
              <span class="toggle-bar"></span>
            </span>
          </button>
        </div>
      </div>
    </header>`
});