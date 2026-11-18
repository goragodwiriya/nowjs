/**
 * File Upload Example - Now.js Framework
 *
 * This example demonstrates the complete file upload functionality including:
 * - Single and multiple file uploads
 * - Live preview of images and files
 * - Drag and drop interface
 * - Sortable file list
 * - File removal capability (existing files through data-action-url)
 * - Image crop before upload (data-crop) and ImageCropper.open()
 * - Size limit, custom preview container, file:change / file:crop events
 * - Form integration with AJAX submission
 * - Loading existing files from API
 *
 * The file upload component is automatically initialized by the FormManager
 * when it detects file input fields with special data attributes.
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
    // The FormManager will automatically handle file uploads when it detects:
    // - <input type="file"> elements
    // - data-preview="true" for live preview
    // - data-drag-drop="true" for drag and drop
    // - data-sortable="true" for reordering files
    // - data-allow-remove-existing="true" for file removal
    const app = await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

    setupCropDemos();

    /**
     * File Upload Features:
     *
     * 1. Single File Upload:
     *    <input type="file" name="avatar" data-preview="true">
     *
     * 2. Multiple Files:
     *    <input type="file" name="files" multiple data-preview="true">
     *
     * 3. Drag & Drop:
     *    <input type="file" multiple data-drag-drop="true">
     *
     * 4. Sortable Files:
     *    <input type="file" multiple data-sortable="true">
     *
     * 5. Load Existing Files:
     *    <input type="file" data-attr="value:files" data-file-reference="url">
     *    API should return: { data: { files: [{ url: "...", name: "..." }] } }
     *
     * 6. File Validation:
     *    <input type="file" accept="image/*,application/pdf">
     *
     * 7. Remove Files:
     *    <input type="file" data-allow-remove-existing="true">
     */

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

/**
 * Crop & event demos
 *
 * - file:crop    fires after every finished crop of a data-crop field
 *                ({data: {elementId, file, source}})
 * - file:change  fires whenever a field's selection changes
 *                ({data: {elementId, files: Map<name, File>}})
 * - ImageCropper.open(fileOrUrl, options) crops without a file field and
 *   resolves to a File, or null when cancelled
 */
function setupCropDemos() {
  const formatSize = bytes => FileElementFactory.formatFileSize(bytes);

  // Read an image file's pixel size
  const imageSize = file => new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve(`${img.naturalWidth}×${img.naturalHeight}`);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve('?');
    img.src = url;
  });

  // One row: thumbnail + name, type, pixel size and byte size
  const fileRow = async (file, label) => {
    const row = document.createElement('div');
    row.className = 'crop-log-item';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    const text = document.createElement('div');
    text.innerHTML = `<strong></strong><br><span class="comment"></span>`;
    text.querySelector('strong').textContent = label;
    text.querySelector('span').textContent =
      `${file.name} · ${file.type} · ${await imageSize(file)} px · ${formatSize(file.size)}`;
    row.append(img, text);
    return row;
  };

  const cropLog = document.getElementById('crop-log');
  EventManager.on('file:crop', async ({data}) => {
    if (!cropLog) return;
    const entry = document.createElement('div');
    entry.className = 'crop-log-entry';
    const title = document.createElement('p');
    title.textContent = `#${data.elementId}`;
    entry.append(title, await fileRow(data.source, 'Original'), await fileRow(data.file, 'Cropped'));
    if (cropLog.querySelector('.comment:only-child')) cropLog.innerHTML = '';
    cropLog.prepend(entry);
  });

  const changeLog = document.getElementById('change-log');
  EventManager.on('file:change', ({data}) => {
    if (!changeLog) return;
    const line = document.createElement('p');
    const names = [...data.files.values()].map(f => `${f.name} (${formatSize(f.size)})`);
    line.textContent = `${new Date().toLocaleTimeString()} #${data.elementId}: ${names.length ? names.join(', ') : '(empty)'}`;
    if (changeLog.querySelector('.comment:only-child')) changeLog.innerHTML = '';
    changeLog.prepend(line);
  });

  // ImageCropper.open() without a file field
  const result = document.getElementById('crop-api-result');
  const crop = async (source, options) => {
    try {
      if (typeof ImageCropper === 'undefined') {
        await Now.require('ImageCropper');
      }
      const file = await ImageCropper.open(source, options);
      if (!file) {
        NotificationManager.info('Crop cancelled');
        return;
      }
      result.innerHTML = '';
      result.append(await fileRow(file, 'ImageCropper.open() result'));
    } catch (error) {
      NotificationManager.error(error.message || String(error));
    }
  };

  document.getElementById('crop-sample')?.addEventListener('click', () => {
    crop('files/sample.jpg', {aspect: '4/3', width: 800});
  });

  const pickInput = document.getElementById('crop-pick-input');
  document.getElementById('crop-pick')?.addEventListener('click', () => pickInput?.click());
  pickInput?.addEventListener('change', () => {
    const file = pickInput.files[0];
    pickInput.value = '';
    if (file) crop(file, {aspect: '3/4', format: 'jpeg', quality: 0.85});
  });
}
