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
            <li><a href="https://nowjs.net" class="icon-home"><span data-i18n>Home</span></a></li>
            <li><a href="https://nowjs.net/features.html"><span data-i18n>Features</span></a></li>
            <li><a href="https://nowjs.net/examples.html"><span data-i18n>Examples</span></a></li>
            <li><a href="https://docs.nowjs.net"><span data-i18n>Documentation</span></a></li>
          </ul>
        </nav>

        <div class="nav-actions">
          <button data-component="config" class="nav-link" title="Toggle theme"></button>
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