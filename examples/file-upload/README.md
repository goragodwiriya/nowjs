# File Upload Example - Now.js Framework

This example demonstrates the complete file upload functionality in Now.js, including single/multiple uploads, live preview, drag & drop, sortable files, and seamless form integration.

## 🎯 Features

- **Single & Multiple Upload**: Support for both single file and multiple file uploads
- **Live Preview**: Real-time preview of uploaded images and files
- **Drag & Drop**: Intuitive drag and drop interface
- **Sortable Files**: Reorder uploaded files by dragging
- **Remove Files**: Remove picked files before submission; delete existing server files through `data-action-url`
- **Image Crop**: Pan, zoom and rotate each picked image in a fixed frame before it joins the field (`data-crop`)
- **Size Limit**: Reject files over `data-max-file-size` bytes
- **Server Actions**: Delete / reorder existing files via `data-action-url` + `data-action-params`
- **Custom Preview Area**: `data-preview-container`
- **Events**: `file:change`, `file:crop`; `ImageCropper.open()` without a file field
- **File Validation**: Validate file types using the accept attribute
- **File References**: Load existing files from URLs
- **Form Integration**: Seamless integration with Now.js Form component

## 📁 File Structure

```
file-upload/
├── index.html              # Main example page with documentation
├── main.js                 # Application initialization
├── styles.css              # Custom styles for the example
├── settings.php            # API endpoint to load existing files
├── save-settings.php       # API endpoint to process uploads
├── files-action.php        # data-action-url endpoint (delete / sort existing files, demo only)
├── templates/
│   └── upload-result.html  # Template for displaying upload results
└── files/
    ├── sample.jpg          # Sample image file
    └── sample.pdf          # Sample PDF file
```

## 🚀 Quick Start

### Basic Single File Upload

```html
<input type="file"
       name="avatar"
       data-preview="true"
       accept="image/*">
```

### Multiple Files with Drag & Drop

```html
<input type="file"
       name="files"
       multiple
       data-preview="true"
       data-drag-drop="true"
       accept="image/*,application/pdf">
```

### Sortable File Upload

```html
<input type="file"
       name="files"
       multiple
       data-preview="true"
       data-drag-drop="true"
       data-sortable="true"
       data-allow-remove-existing="true">
```

### Crop Before Upload

```html
<input type="file" name="avatar" accept="image/*"
       data-preview="true"
       data-crop="true"
       data-crop-aspect="1"
       data-crop-shape="circle"
       data-crop-width="400"
       data-crop-format="webp">
```

The cropped file replaces the original in the field and is what the form sends.
A preview of a cropped image gets a crop button that re-crops from the original.
Cancel keeps the previous selection; SVG and non-image files skip the cropper.
The cropper bundle (`now.imagecrop.min.js` + `.css`) loads automatically when the page has `[data-crop="true"]`.

```js
// Without a file field
await Now.require('ImageCropper');
const file = await ImageCropper.open('files/sample.jpg', {aspect: '4/3', width: 800}); // File or null
```

### Existing Files: Delete & Reorder

```html
<input type="file" name="gallery" multiple
       data-preview="true"
       data-sortable="true"
       data-allow-remove-existing="true"
       data-file-reference="id"
       data-action-url="files-action.php"
       data-action-params='{"album": 7}'
       data-files='[{"id": 101, "url": "files/sample.jpg", "name": "sample.jpg"}]'>
```

- Delete posts `{action: "delete", id: 101, album: 7}` after a confirm dialog
- Dragging the handle posts `{action: "sort", order: [{id, position}], album: 7}`
- Without `data-action-url` existing files show no delete button and the order is not saved

### Events

```js
EventManager.on('file:change', ({data}) => { /* data.elementId, data.files (Map name → File) */ });
EventManager.on('file:crop', ({data}) => { /* data.elementId, data.file (cropped), data.source (original) */ });
```

## 📖 API Reference

### File Input Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-preview` | boolean | false | Enable live preview of uploaded files |
| `data-drag-drop` | boolean | false | Enable drag and drop functionality |
| `data-sortable` | boolean | false | Drag handle on existing files; order posted to `data-action-url` |
| `data-allow-remove-existing` | boolean | false | Delete button on existing files (needs `data-action-url`) |
| `data-file-reference` | string | - | Field name for file URL reference (e.g., "url") |
| `data-attr` | string | - | Bind to data source (e.g., "value:files") |
| `data-files` | JSON / string | - | Existing files: inline JSON or the name of a field in the loaded data |
| `data-max-file-size` | number | 10485760 | Largest file accepted, in bytes |
| `data-action-url` | string | - | Endpoint for deleting / reordering existing files |
| `data-action-params` | JSON / string | - | Extra keys sent with each action (JSON, or comma-separated URL query keys) |
| `data-preview-container` | selector | - | Render previews in this element |
| `data-crop` | boolean | false | Crop every picked image before it joins the field |
| `data-crop-aspect` | string | 1 | Frame width/height: `1`, `3/4`, `16:9` |
| `data-crop-width` | number | 0 | Output width in px (0 = cropped area's size, max 2048) |
| `data-crop-shape` | string | rect | `rect` or `circle` (mask only) |
| `data-crop-format` | string | auto | `auto`, `jpeg`, `png`, `webp` |
| `data-crop-quality` | number | 0.9 | JPEG/WebP quality 0–1 |
| `data-crop-min-width` | number | 0 | Warn when the selection has fewer source pixels across |
| `accept` | string | * | Allowed file types (e.g., "image/*,application/pdf") |
| `multiple` | boolean | false | Allow multiple file selection |

### Form Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `data-form` | string | Form identifier |
| `data-validate` | boolean | Enable form validation |
| `data-ajax-submit` | boolean | Submit form via AJAX |
| `data-load-api` | string | API endpoint to load existing data |
| `data-confirm` | string | Confirmation message before submit |

## 🔄 Data Flow

### 1. Loading Existing Files (settings.php)

**Request:**
```
GET settings.php
```

**Response:**
```json
{
  "data": {
    "name": "John Doe",
    "avatar": [
      {
        "url": "files/sample.jpg",
        "name": "sample.jpg"
      }
    ],
    "files": [
      {
        "url": "files/sample.jpg",
        "name": "sample.jpg"
      },
      {
        "url": "files/sample.pdf",
        "name": "sample.pdf"
      }
    ]
  }
}
```

**Note:** Even for single file uploads, the data should be in array format with one element.

### 2. Submitting Files (save-settings.php)

**Request:**
```
POST save-settings.php
Content-Type: multipart/form-data

{
  name: "John Doe",
  avatar: [File],
  files: [File, File]
}
```

**Response:**
```json
{
  "status": 200,
  "success": true,
  "message": "Form submitted successfully",
  "data": {
    "id": 1,
    "name": "John Doe",
    "avatar": [
      {
        "name": "photo.jpg",
        "type": "image/jpeg",
        "size": "1.2 MB",
        "size_bytes": 1258291,
        "error": 0
      }
    ],
    "files": [...],
    "actions": [
      {
        "type": "notification",
        "message": "Upload complete!"
      },
      {
        "type": "render",
        "target": "#upload-output",
        "template": "upload-result.html"
      }
    ]
  }
}
```

## 🎨 Template Rendering

The template binds to the response data (`id`, `name`, `avatar`, `files`). Give the render action its own `data` to render it with something else; when the response has a `data` key of its own, that is what the template gets. A form may send a hidden `output` field to render into its own element (the crop demo uses `#crop-output`).

The upload result is rendered using the `upload-result.html` template with data binding:

### Data Binding Directives

- `data-text="fieldname"` - Displays text content from the data object
- `data-for="item of array"` - Loops through array items
- `<template>` - Contains the HTML to repeat for each item

### Example Template

```html
<div data-for="file of files">
  <template>
    <div class="file-item">
      <p><strong>File Name:</strong> <span data-text="file.name"></span></p>
      <p><strong>Type:</strong> <span data-text="file.type"></span></p>
      <p><strong>Size:</strong> <span data-text="file.size"></span></p>
    </div>
  </template>
</div>
```

## 💡 How It Works

1. **Initialization**: The FormManager automatically detects file input fields and initializes the upload component
2. **File Selection**: Users can select files via click, drag & drop, or paste
3. **Preview**: Selected files are displayed with thumbnails (for images) or file icons
4. **Sorting**: Users can reorder files by dragging them (if `data-sortable="true"`)
5. **Removal**: Users can remove files before submission (if `data-allow-remove-existing="true"`)
6. **Submission**: Form is submitted via AJAX with files as multipart/form-data
7. **Response**: Server processes files and returns metadata
8. **Rendering**: ResponseHandler displays results using the template

## 🔧 Server-Side Processing

The `save-settings.php` file demonstrates:

- Processing single and multiple file uploads
- Formatting file sizes in human-readable format
- Returning file metadata (name, type, size)
- Triggering notifications and template rendering via actions

### Key Functions

```php
// Format file size
function formatFileSize($bytes) {
    $units = ['B', 'KB', 'MB', 'GB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= (1 << (10 * $pow));
    return round($bytes, 2).' '.$units[$pow];
}

// Process file upload data
function processFileData($fileData) {
    // Returns formatted file information
}
```

## 🎓 Best Practices

1. **Always use arrays for file data** - Even for single files, use array format for consistency
2. **Validate file types** - Use the `accept` attribute to restrict file types
3. **Provide feedback** - Use notifications to inform users of upload status
4. **Handle errors gracefully** - Check file.error in the response
5. **Optimize file sizes** - Consider implementing server-side image resizing
6. **Secure uploads** - Validate file types and sizes on the server
7. **Use unique filenames** - Prevent file overwrites with unique naming

## 📱 Browser Compatibility

The file upload component works in all modern browsers that support:
- File API
- FormData API
- Drag and Drop API
- FileReader API (for preview)

## 🔗 Related Examples

- [Form Validation](../form-validation/) - Form validation with file uploads
- [API Integration](../api-integration/) - AJAX form submission
- [Data Binding](../data-binding/) - Template data binding

## 📄 License

This example is part of the Now.js framework.
