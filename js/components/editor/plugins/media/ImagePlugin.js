/**
 * ImagePlugin - Insert and manage images
 * Integrates with FileBrowser for file selection
 *
 * @author Goragod Wiriya
 * @version 1.0
 */
import PluginBase from '../PluginBase.js';
import BaseDialog from '../../ui/dialogs/BaseDialog.js';
import EventBus from '../../core/EventBus.js';

class ImageDialog extends BaseDialog {
  constructor(editor, options = {}) {
    super(editor, {
      title: 'Insert Image',
      width: 500
    });
    this.pluginOptions = options;
  }

  buildBody() {
    // Tab navigation
    const tabs = document.createElement('div');
    tabs.className = 'rte-dialog-tabs';

    const urlTab = document.createElement('button');
    urlTab.type = 'button';
    urlTab.className = 'rte-dialog-tab active';
    urlTab.textContent = this.translate('URL');
    urlTab.dataset.tab = 'url';

    const uploadTab = document.createElement('button');
    uploadTab.type = 'button';
    uploadTab.className = 'rte-dialog-tab';
    uploadTab.textContent = this.translate('Upload');
    uploadTab.dataset.tab = 'upload';

    tabs.appendChild(urlTab);
    tabs.appendChild(uploadTab);
    this.body.appendChild(tabs);

    // Tab contents
    this.urlContent = document.createElement('div');
    this.urlContent.className = 'rte-dialog-tab-content active';
    this.urlContent.dataset.tab = 'url';

    this.uploadContent = document.createElement('div');
    this.uploadContent.className = 'rte-dialog-tab-content';
    this.uploadContent.dataset.tab = 'upload';

    // URL tab content
    this.urlField = this.createField({
      type: 'url',
      label: 'Image URL',
      id: 'rte-image-url',
      placeholder: 'https://example.com/image.jpg'
    });
    this.urlContent.appendChild(this.urlField);

    // Upload tab content
    const uploadZone = document.createElement('div');
    uploadZone.className = 'rte-upload-zone';
    uploadZone.innerHTML = `
      <div class="rte-upload-icon">📷</div>
      <div class="rte-upload-text">${this.translate('Drop image here or click to browse')}</div>
      <input type="file" accept="image/*" style="display: none;">
    `;

    this.fileInput = uploadZone.querySelector('input[type="file"]');
    uploadZone.addEventListener('click', () => this.fileInput.click());
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) {
        this.handleFileSelect(e.dataTransfer.files[0]);
      }
    });
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.handleFileSelect(e.target.files[0]);
      }
    });

    this.uploadContent.appendChild(uploadZone);

    // Preview area
    this.previewArea = document.createElement('div');
    this.previewArea.className = 'rte-image-preview';
    this.previewArea.style.display = 'none';
    this.uploadContent.appendChild(this.previewArea);

    // FileBrowser button
    if (this.pluginOptions.fileBrowser?.enabled !== false) {
      const browseBtn = document.createElement('button');
      browseBtn.type = 'button';
      browseBtn.className = 'rte-dialog-btn rte-dialog-btn-secondary';
      browseBtn.style.marginTop = '12px';
      browseBtn.textContent = this.translate('Browse files');
      browseBtn.addEventListener('click', () => this.openFileBrowser());
      this.uploadContent.appendChild(browseBtn);
    }

    this.body.appendChild(this.urlContent);
    this.body.appendChild(this.uploadContent);

    // Common fields (shown for both tabs)
    const commonFields = document.createElement('div');
    commonFields.className = 'rte-dialog-common-fields';
    commonFields.style.marginTop = '16px';
    commonFields.style.paddingTop = '16px';
    commonFields.style.borderTop = '1px solid var(--rte-border-color)';

    // Alt text
    this.altField = this.createField({
      type: 'text',
      label: 'Alt text',
      id: 'rte-image-alt',
      placeholder: 'Description for accessibility'
    });
    commonFields.appendChild(this.altField);

    // Width/Height
    const sizeRow = document.createElement('div');
    sizeRow.style.display = 'flex';
    sizeRow.style.gap = '12px';

    this.widthField = this.createField({
      type: 'number',
      label: 'Width',
      id: 'rte-image-width',
      placeholder: 'Auto'
    });
    this.widthField.style.flex = '1';

    this.heightField = this.createField({
      type: 'number',
      label: 'Height',
      id: 'rte-image-height',
      placeholder: 'Auto'
    });
    this.heightField.style.flex = '1';

    sizeRow.appendChild(this.widthField);
    sizeRow.appendChild(this.heightField);
    commonFields.appendChild(sizeRow);

    // Alignment
    this.alignField = this.createField({
      type: 'select',
      label: 'Alignment',
      id: 'rte-image-align',
      options: [
        {value: '', label: 'None'},
        {value: 'left', label: 'Left'},
        {value: 'center', label: 'Center'},
        {value: 'right', label: 'Right'}
      ]
    });
    commonFields.appendChild(this.alignField);

    this.body.appendChild(commonFields);

    // Tab switching
    tabs.addEventListener('click', (e) => {
      if (e.target.classList.contains('rte-dialog-tab')) {
        tabs.querySelectorAll('.rte-dialog-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');

        const tabName = e.target.dataset.tab;
        this.body.querySelectorAll('.rte-dialog-tab-content').forEach(c => {
          c.classList.toggle('active', c.dataset.tab === tabName);
        });
      }
    });

    // Add tab styles
    this.addTabStyles();
  }

  addTabStyles() {
    if (document.getElementById('rte-image-dialog-styles')) return;

    const style = document.createElement('style');
    style.id = 'rte-image-dialog-styles';
    style.textContent = `
      .rte-dialog-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--rte-border-color);
      }
      .rte-dialog-tab {
        padding: 8px 16px;
        border: none;
        background: none;
        color: var(--rte-text-secondary);
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
      }
      .rte-dialog-tab.active {
        color: var(--rte-primary-color);
        border-bottom-color: var(--rte-primary-color);
      }
      .rte-dialog-tab-content {
        display: none;
      }
      .rte-dialog-tab-content.active {
        display: block;
      }
      .rte-upload-zone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        border: 2px dashed var(--rte-border-color);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .rte-upload-zone:hover,
      .rte-upload-zone.dragover {
        border-color: var(--rte-primary-color);
        background: var(--rte-primary-light);
      }
      .rte-upload-icon {
        font-size: 48px;
        margin-bottom: 8px;
      }
      .rte-upload-text {
        color: var(--rte-text-secondary);
      }
      .rte-image-preview {
        margin-top: 12px;
        text-align: center;
      }
      .rte-image-preview img {
        max-width: 100%;
        max-height: 200px;
        border-radius: 4px;
      }
      .rte-dialog-btn-secondary {
        background: var(--rte-bg-secondary);
        border: 1px solid var(--rte-border-color);
        color: var(--rte-text-color);
      }
    `;
    document.head.appendChild(style);
  }

  handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
      this.showError('Please select an image file');
      return;
    }

    // Store file for upload
    this.selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this.previewArea.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
      this.previewArea.style.display = 'block';
      this.previewDataUrl = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  openFileBrowser() {
    if (typeof FileBrowser !== 'undefined') {
      const fb = new FileBrowser({
        ...this.pluginOptions.fileBrowser?.options,
        allowedFileTypes: 'image/*',
        multiSelect: false,
        onSelect: (file) => {
          const urlInput = this.urlField.querySelector('input');
          urlInput.value = file.url;

          // Switch to URL tab
          this.body.querySelectorAll('.rte-dialog-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === 'url');
          });
          this.body.querySelectorAll('.rte-dialog-tab-content').forEach(c => {
            c.classList.toggle('active', c.dataset.tab === 'url');
          });
        }
      });
      fb.open();
    }
  }

  populate(data) {
    const urlInput = this.urlField.querySelector('input');
    const altInput = this.altField.querySelector('input');
    const widthInput = this.widthField.querySelector('input');
    const heightInput = this.heightField.querySelector('input');
    const alignSelect = this.alignField.querySelector('select');

    urlInput.value = data.src || '';
    altInput.value = data.alt || '';
    widthInput.value = data.width || '';
    heightInput.value = data.height || '';
    alignSelect.value = data.align || '';

    this.selectedFile = null;
    this.previewDataUrl = null;
    this.previewArea.style.display = 'none';

    // Store editing state
    this.isEdit = data.isEdit || false;
    this.existingImage = data.element || null;
  }

  getData() {
    const urlInput = this.urlField.querySelector('input');
    const altInput = this.altField.querySelector('input');
    const widthInput = this.widthField.querySelector('input');
    const heightInput = this.heightField.querySelector('input');
    const alignSelect = this.alignField.querySelector('select');

    return {
      src: urlInput.value.trim() || this.previewDataUrl,
      alt: altInput.value.trim(),
      width: widthInput.value.trim(),
      height: heightInput.value.trim(),
      align: alignSelect.value,
      file: this.selectedFile,
      isEdit: this.isEdit,
      existingImage: this.existingImage
    };
  }

  validate() {
    this.clearError();
    const data = this.getData();

    if (!data.src && !data.file) {
      this.showError('Please provide an image URL or upload a file');
      return false;
    }

    return true;
  }
}

class ImagePlugin extends PluginBase {
  static pluginName = 'image';

  init() {
    super.init();

    // Create dialog
    this.dialog = new ImageDialog(this.editor, this.options);
    this.dialog.onConfirm = (data) => this.insertImage(data);

    // Register command
    this.registerCommand('insertImage', {
      execute: (data) => this.insertImage(data)
    });

    // Listen for toolbar button click
    this.subscribe(EventBus.Events.TOOLBAR_BUTTON_CLICK, (event) => {
      if (event.id === 'image') {
        this.openDialog();
      }
    });

    // Listen for file drops
    this.subscribe('content:drop', (event) => {
      const imageFiles = event.files.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        event.event.preventDefault();
        this.handleDroppedFiles(imageFiles);
      }
    });
  }

  /**
   * Open image dialog
   */
  openDialog() {
    // Restore selection (saved by toolbar's mousedown) to check if on image
    this.restoreSelection();

    // Check if cursor is on an image
    const img = this.getSelectedImage();

    const data = {
      src: '',
      alt: '',
      width: '',
      height: '',
      align: '',
      isEdit: false,
      element: null
    };

    if (img) {
      data.src = img.src;
      data.alt = img.alt;
      data.width = img.width || '';
      data.height = img.height || '';
      data.align = this.getImageAlignment(img);
      data.isEdit = true;
      data.element = img;
    }

    this.dialog.open(data);
  }

  /**
   * Get selected image
   * @returns {HTMLImageElement|null}
   */
  getSelectedImage() {
    const selection = this.getSelection();
    const range = selection.getRange();

    if (range && range.collapsed) {
      const node = range.startContainer;
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IMG') {
        return node;
      }
      if (node.parentElement && node.parentElement.tagName === 'IMG') {
        return node.parentElement;
      }
    }

    return null;
  }

  /**
   * Get image alignment
   * @param {HTMLImageElement} img
   * @returns {string}
   */
  getImageAlignment(img) {
    const style = img.style;
    if (style.float === 'left') return 'left';
    if (style.float === 'right') return 'right';
    if (style.display === 'block' && style.marginLeft === 'auto' && style.marginRight === 'auto') {
      return 'center';
    }
    return '';
  }

  /**
   * Insert or update image
   * @param {Object} data - Image data
   */
  async insertImage(data) {
    let src = data.src;

    // If there's a file to upload
    if (data.file && this.options.uploadUrl) {
      try {
        src = await this.uploadImage(data.file);
      } catch (error) {
        this.notify('Failed to upload image', 'error');
        return;
      }
    }

    this.restoreSelection();

    if (data.isEdit && data.existingImage) {
      // Update existing image
      const img = data.existingImage;
      img.src = src;
      img.alt = data.alt;

      if (data.width) img.width = parseInt(data.width);
      else img.removeAttribute('width');

      if (data.height) img.height = parseInt(data.height);
      else img.removeAttribute('height');

      this.applyImageAlignment(img, data.align);
    } else {
      // Create new image
      const img = document.createElement('img');
      img.src = src;
      img.alt = data.alt;

      if (data.width) img.width = parseInt(data.width);
      if (data.height) img.height = parseInt(data.height);

      this.applyImageAlignment(img, data.align);

      this.insertHtml(img.outerHTML);
    }

    this.recordHistory(true);
    this.focusEditor();
  }

  /**
   * Apply alignment to image
   * @param {HTMLImageElement} img
   * @param {string} align
   */
  applyImageAlignment(img, align) {
    img.style.float = '';
    img.style.display = '';
    img.style.marginLeft = '';
    img.style.marginRight = '';

    switch (align) {
      case 'left':
        img.style.float = 'left';
        img.style.marginRight = '1em';
        break;
      case 'right':
        img.style.float = 'right';
        img.style.marginLeft = '1em';
        break;
      case 'center':
        img.style.display = 'block';
        img.style.marginLeft = 'auto';
        img.style.marginRight = 'auto';
        break;
    }
  }

  /**
   * Upload image to server
   * @param {File} file
   * @returns {Promise<string>} Image URL
   */
  async uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    if (this.options.uploadPath) {
      formData.append('path', this.options.uploadPath);
    }

    const response = await fetch(this.options.uploadUrl, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    return result.url || result.data?.url;
  }

  /**
   * Handle dropped files
   * @param {File[]} files
   */
  handleDroppedFiles(files) {
    files.forEach(async (file) => {
      if (this.options.uploadUrl) {
        try {
          const url = await this.uploadImage(file);
          this.insertImage({src: url, alt: file.name});
        } catch (error) {
          this.notify('Failed to upload image', 'error');
        }
      } else {
        // Use data URL as fallback
        const reader = new FileReader();
        reader.onload = (e) => {
          this.insertImage({src: e.target.result, alt: file.name});
        };
        reader.readAsDataURL(file);
      }
    });
  }

  destroy() {
    this.dialog?.destroy();
    super.destroy();
  }
}

export default ImagePlugin;
