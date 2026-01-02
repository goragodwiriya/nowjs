/**
 * SourceViewPlugin - Toggle HTML source view
 *
 * @author Goragod Wiriya
 * @version 1.0
 */
import PluginBase from '../PluginBase.js';
import EventBus from '../../core/EventBus.js';

class SourceViewPlugin extends PluginBase {
  static pluginName = 'sourceView';

  init() {
    super.init();

    this.sourceEditor = null;
    this.isActive = false;

    // Create source editor element
    this.createSourceEditor();

    // Listen for toolbar button click
    this.subscribe(EventBus.Events.TOOLBAR_BUTTON_CLICK, (event) => {
      if (event.id === 'sourceView') {
        this.toggle();
      }
    });

    // Register command
    this.registerCommand('sourceView', {
      execute: () => this.toggle(),
      isActive: () => this.isActive
    });
  }

  /**
   * Create source editor element
   */
  createSourceEditor() {
    this.sourceEditor = document.createElement('textarea');
    this.sourceEditor.className = 'rte-source-view';
    this.sourceEditor.spellcheck = false;
    this.sourceEditor.setAttribute('aria-label', 'HTML source code');

    // Add to container after content area
    const container = this.editor.getContainer();
    const contentWrapper = this.editor.contentArea?.getContainer();

    if (container && contentWrapper) {
      container.insertBefore(this.sourceEditor, contentWrapper.nextSibling);
    }

    // Sync on input
    this.sourceEditor.addEventListener('input', () => {
      // Don't record history on every keystroke in source view
      // Will sync when switching back
    });
  }

  /**
   * Toggle source view
   * @param {boolean} enabled - Force enable/disable
   */
  toggle(enabled) {
    this.isActive = enabled !== undefined ? enabled : !this.isActive;

    const container = this.editor.getContainer();
    const contentWrapper = this.editor.contentArea?.getContainer();

    if (this.isActive) {
      // Switch to source view
      const content = this.editor.contentArea?.getContent() || '';
      this.sourceEditor.value = this.formatHtml(content);

      container.classList.add('source-mode');
      contentWrapper.style.display = 'none';
      this.sourceEditor.style.display = 'block';

      // Focus source editor
      this.sourceEditor.focus();
    } else {
      // Switch back to WYSIWYG
      const html = this.sourceEditor.value;
      this.editor.contentArea?.setContent(html, true);

      container.classList.remove('source-mode');
      contentWrapper.style.display = '';
      this.sourceEditor.style.display = 'none';

      // Focus editor
      this.focusEditor();
    }

    // Update toolbar button state
    this.setButtonActive('sourceView', this.isActive);

    // Emit mode change event
    this.emit(EventBus.Events.MODE_CHANGE, {
      mode: this.isActive ? 'source' : 'wysiwyg'
    });

    // Update editor state
    this.editor.isSourceMode = this.isActive;
  }

  /**
   * Format HTML for better readability
   * @param {string} html
   * @returns {string}
   */
  formatHtml(html) {
    if (!html) return '';

    // Simple formatting - add newlines after block elements
    let formatted = html
      .replace(/(<\/?(p|div|h[1-6]|ul|ol|li|blockquote|pre|table|tr|thead|tbody|hr)[^>]*>)/gi, '\n$1')
      .replace(/^\n/, '')
      .trim();

    // Remove excessive newlines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted;
  }

  /**
   * Get source content
   * @returns {string}
   */
  getSource() {
    return this.sourceEditor?.value || '';
  }

  /**
   * Set source content
   * @param {string} html
   */
  setSource(html) {
    if (this.sourceEditor) {
      this.sourceEditor.value = this.formatHtml(html);
    }
  }

  /**
   * Check if source view is active
   * @returns {boolean}
   */
  isSourceViewActive() {
    return this.isActive;
  }

  destroy() {
    if (this.sourceEditor && this.sourceEditor.parentNode) {
      this.sourceEditor.parentNode.removeChild(this.sourceEditor);
    }
    super.destroy();
  }
}

export default SourceViewPlugin;
